# The gate exit-code contract — what each script's non-zero codes actually mean

Audit §9, row 2. `packages/lab/src/gates/verdict.mjs` defines one contract — **0 PASS, 1 FAIL, 2
INCONCLUSIVE** — and **6 of the ~40 scripts that call `process.exit` with a meaningful code adopt it.**
Everywhere else, the same numbers mean something else, script by script, and nothing states what. A caller
sequencing a chain off these codes — `lab:job` returning 4, `fleet:deploy` returning 3, `capture:check`
returning 0 — has been reading each one as a verdict without a way to know whether that is what it is.

This is the table. **Read from the source, not inferred from a name** — every row below is a real
`process.exit(`/`process.exitCode =` call site and the condition guarding it, verified by reading the file
that produces it.

## Why this exists, and what it does not do

This does **not** rewrite any script. Eighteen (in fact closer to forty) scripts each encode a genuine,
reasoned design — several collapse two or three distinct causes into one code on purpose, for reasons a
maintainer weighed at the time — and changing an exit code is changing a contract every chain that reads it
already depends on. The deliverable is the table, plus a discovery test
(`packages/lab/src/gates/exit-code-contract.test.ts`) that requires every gate script to be classified —
adopts `verdict.mjs`, or documented here with its own meanings — so a new script cannot join the
uncatalogued 34 without the test failing. See "What this recommends" at the end.

## The `verdict.mjs` contract, and who actually uses it

```js
gateVerdict({ examined, of, source, failures })   // -> { verdict: PASS | FAIL | INCONCLUSIVE, why, ... }
exitCodeFor(verdict)                              // -> 0 | 1 | 2
```

FAIL beats INCONCLUSIVE beats PASS, and coverage is checked **before** failures are, so a gate that fell
short of its own population reports INCONCLUSIVE rather than a false PASS — the 2-of-48 defect
`evidence-check` once shipped, from `verdict.mjs`'s own header.

| script | adopts it via |
|---|---|
| `packages/lab/scripts/check-dataset-distribution.mjs` | `exitCodeFor(gateVerdict(...))` |
| `packages/lab/scripts/score-rules.ts` | `exitCodeFor(gateVerdict(...))` |
| `packages/lab/scripts/check-shipped-provenance.mjs` | `exitCodeFor(gateVerdict(...))` — **structurally cannot return 2, decided correct, see below** |
| `packages/lab/scripts/fleet-hours.mjs` | **not a gate — a REPORT.** `0` a real total; `2` it billed no capture and refuses to report one. Deliberately not `1`: that would read as "the fleet cost nothing", and a cost report that examined nothing prints the same small number as a cheap run |
| `packages/lab/scripts/gate-probe-order.mjs` | `exitCodeFor(fleetVerdict(...))` |
| `packages/lab/scripts/stability-gate.mjs` | `exitCodeFor(fleetVerdict(...))` |
| `packages/lab/scripts/check-real-page-findings.ts` | `exitCodeFor(gateVerdict(...))` (not re-verified line-by-line this pass; found via the same import scan as the other six) |

`packages/lab/src/gates/fleet.mjs`'s `fleetVerdict()` is not itself a gate script — it is a library that
wraps `gateVerdict` for the two fleet-sharded gates above, adding the control-plane host to `source` so a
verdict states not just what it examined but which machine produced it.

**DECIDED: `check-shipped-provenance.mjs` adopts the contract but can never produce its middle state, and
that is correct, not a defect.** It calls `gateVerdict({ examined: 1, of: 1, ... })` — both hardcoded — so
`examined < of` (the line `verdict.mjs`'s own header calls "the whole point," coverage checked before
failure) is `1 < 1`, always false. Investigated rather than left as an open question: this gate's subject
is one shipped artefact and one binary fact ("does an entry account for it"), which is either true or false
every time it runs — there is no population to have PARTIAL coverage of, so `examined` can never
legitimately fall short of `of`. `verdict.mjs`'s own header names this exact gate as the reason `failures`
is decoupled from `examined`/`of`: it can find several problems about the one artefact it examined ("N
problem(s) across 1 of 1"), which is a different question from whether it examined all of a population.
Stated explicitly in the gate's own code now, and proven in `provenance-gate-refuses.test.ts`'s
"INCONCLUSIVE is unreachable from this gate, by construction" test, which sweeps every problem-count the
gate's wiring can construct (0, 1 by two causes, 2 combined, 3 from three mutually-identical wrong entries)
and asserts none reaches exit 2 — mutation-checked by decoupling `of` from `examined` and watching that
exact test catch it first.

Adopting the TYPE does not guarantee exercising every STATE it defines — this remains the general lesson
for reading any `verdict.mjs` consumer, but it is no longer an open question for THIS gate.

## Every other gate, by area — codes, and what each one means

**Read as: code → the condition that actually produces it, from the source.** A script not listed under
"adopts verdict.mjs" has its own scheme; where two conditions share one code, both are named — that sharing
is the finding, not an omission.

### `packages/lab/scripts/`

| script | codes → meaning |
|---|---|
| `audit-corpus-starvation.mjs` | 0 success; 2 stale export (featurizer can't read a pre-`parsed`-block record) |
| `audit-corpus-urls.mjs` | 0 no moved URLs; 1 a corpus URL moved. Deliberately does NOT fail on an unreachable host — "a check that goes red for somebody else's outage is one people learn to ignore" |
| `audit-observation-ambiguity.mjs` | 0 in `--json` mode regardless of findings (the ambiguity count itself does not affect this exit code); 2 no captures found under root |
| `audit-rule-coverage.mjs`/`.ts` | 0 no captures to examine (an honest, explicitly-not-a-pass skip) OR every rule-owned criterion validated on real evidence; 1 a rule-owned criterion has never fired on a real page anywhere — a real gate failure; 2 the corpus is mid-run ("ABANDONED RUN"/"IN FLUX") — a refusal to measure a moving target, the same precondition shape as most other 2s here |
| `audit-size-sensitivity.mjs` | 2 corpus too small (two separate size checks); `exitCode=1` if size-dependent accusations found; else 0 |
| `bench-capture.mjs` | 1 usage error (no worker/page) OR `--from-disk` with zero captures found — two causes, one code; `exitCode=2` if every live capture lost its socket; else 0 |
| `build-realism-tier.mjs` | 0 success, including "no training captures, base dataset only" (a legitimate empty state, not a failure); 2 every training capture truncated on a channel the model reads |
| `calibrate-abstention.mjs` | 0 success; 2 no calibration captures found |
| `corpus-backup.mjs` | 1 any precondition refusal (several collapsed to one code) |
| `corpus-snapshot.mjs` | 0 success; 2 nothing to snapshot |
| `everything-pipeline.mjs` | 0 every stage in `STEPS` succeeded; 1 any stage failed OR any stage's process crashed for an unrelated reason (e.g. an import error) — two different causes, one code, via its own `pipeline()` helper (not `verdict.mjs`) |
| `evidence-check.mjs` | 2 means THREE things in this one file: no `--worker` given (usage), no comparable case has a current-page capture, and page title unreadable. Its own contract comment states "0 safe to ship, 1 evidence changed, 2 could not answer" — and a plain misuse also lands on 2 |
| `explain-capture.mjs` | 2 no search term given (usage) OR no capture file matched (not found) |
| `explain-scorer.mjs` | 2 no `--model=` given outside `--compare` mode (usage) |
| `lab-inventory.mjs` | 0 in `--json` mode, on EPIPE (a broken output pipe reads as success, not a crash), and on one specific benign refusal ("ask the lab"); 2 the other refusal branch (schema/data problem). **No exit-1 path at all** — this script never reports a hard FAIL |
| `promote-model.mjs` | 2 usage error (no `--from=`); 1 any thrown promotion error, including a detected regression; **3 specifically an uncommitted/dirty git tree blocking promotion** — a distinct meaning for 3 from anything above |
| `retrain-pipeline.mjs` | 1 a pipeline stage failed (via the same `pipeline()` helper as `everything-pipeline.mjs`, same collapsing) OR `--candidate=` given and it is not releasable; 0 otherwise |
| `verify-safetensors.mjs` | 2 usage error (no model dir, or one starting with `-`); 1 can't read the model dir OR the model has a real problem — two causes, one code |

### `packages/lab/src/harnesses/`, `packages/lab/src/eval/`

| script | codes → meaning |
|---|---|
| `assert-action-report.mjs` | 0 every requested assertion passed; 1 no path argument (usage) OR any assertion failed (contract / activation / forbid-wcag / require-wcag / require-rule-layer) — conflated |
| `capture-check.mjs` | 0 all checks passed; 1 `failures > 0`, a real check failure; 2 malformed `--worker` (usage) OR a worker is already serving (environment conflict) — two meanings share 2 |
| `capture-fixtures.mjs` | 0 all fixtures recaptured; 1 some fixture failed; 2 no pages matched `--set`/`--only` (usage) |
| `judge-file.ts` | 0 ran; 1 no path argument (usage) OR `judge()` threw — one top-level `.catch` for both |
| `judge-sample.ts` | 0 ran; 1 `judge()` threw. A one-off demo tool with no verdict concept |
| `page-identity-rate.mjs` | 0 no wrong-page reads; 1 `wrong > 0`, a real gate failure; 2 malformed `--worker` (usage); **3 "MEASURED NOTHING"** — no capture ever navigated a reused window, so the fault under test structurally could not occur, explicitly documented as "not evidence" (i.e. this script's own INCONCLUSIVE, spelled 3 rather than `verdict.mjs`'s 2) |
| `run-spike.ts` | 0 ran; 1 no URL argument (usage) OR any thrown error. One-off spike tool |
| `eval/rules-check.ts` | 0 no false positives on conformant fixtures — **including when every fixture is pending/uncaptured, so 0 fixtures examined still reports success**; 1 `cleanFP > 0` |
| `eval/run.ts` | 0 by default, always, unless `EVAL_GATE` is set AND fitness fails (then `exitCode=1`) — **by default this cannot fail on judge quality at all**, only on a thrown error (also 1). A caller reading a bare `npm run eval`'s exit code as a quality verdict is reading something this script does not compute unless asked to |

### `packages/lab/src/training/`

| script | codes → meaning |
|---|---|
| `capture-real-pages.mjs` | 0 all pages captured; 1 `failed.length > 0`; 2 bad `--worker` OR no pages for the given role — two usage/precondition causes share 2; **3 fleet browser-version inconsistency** — a distinct meaning for 3, again |
| `capture-screenreader-dataset.mjs` (`training:capture`) | 0 default/success; 1 any thrown error, caught at the top-level guard; 2 the host's power state refuses to start (on battery, or asleep-prone) and `--allow-battery` was not passed — a precondition, not a verdict about any capture |
| `check-signals.mjs` | Two hard exits before the real check: 1 no case matches `--only` (usage); 2 REFUSING — the manifest names cases the current case definitions no longer define (a stale local build, not a broken signal). Then `signalVerdict()` — a from-scratch reimplementation of the identical PASS/FAIL/INCONCLUSIVE concept, not imported from `verdict.mjs` — returns 0 PASS, 1 FAIL (defects, or gaps under `--require-complete`), 2 INCONCLUSIVE (below `MIN_EXAMINED`). So 1 and 2 each already carry two distinct meanings before `signalVerdict` is even reached. **Considered, and declined, as an adoption candidate** — see below |
| `capture-status.mjs` (`training:status`/`training:wait`) | Its own named `EXIT` map, and it is the contract CLAUDE.md already documents in prose: 0 clean; 1 finished with failures; 2 no run recorded; 3 stale/"WEDGED" (`isStale()`, past one capture timeout plus slack). **Identical scheme to `wait-for-capture.mjs`, independently** — the two together are the one place in this table where the SAME four meanings are used consistently by two different files, rather than colliding |
| `page-server.mjs` | 130/143 — standard Unix 128+signal codes for SIGINT/SIGTERM. A long-running daemon, not a gate |
| `preflight-screenreader-dataset.mjs` | 0 generated page manifest validates; 1 a validation error in the manifest (bad instrument/metadata) — reported, not a screen-reader verdict, per the script's own note. An uncaught `throw` for a missing manifest crashes with Node's default code rather than a chosen one |
| `repeat-capture.mjs` | 2 `--probe-forms` without `--task` OR missing `--url`/`--worker` — two usage errors share 2; 1 any of: too few samples, a field varied, an error, an empty capture, or an inconsistent capture — five sub-conditions collapsed into one code |
| `wait-for-capture.mjs` | 0 finished clean; 1 finished with failures; 2 no run recorded; **3 "wedged"** — `isStale()`, no progress-file update beyond the run's OWN declared `captureTimeoutMs` plus slack. Checked closely per the specific concern that prompted this audit: this is threshold-based on the run's own declared budget, not on how long the waiter felt like waiting — a principled INCONCLUSIVE-shaped state, not the antipattern below, though the bare word "wedged" invites the same misreading without opening the function |

### `packages/lab/src/gates/dispatch.mjs` (shared infrastructure, not a gate of its own)

`dispatchUnlessLocal` hands a gate to the lab via `npm run lab:job` and exits with whatever that returns —
**except that a spawn error or a killed child also produces 2**, with its own honest comment ("INCONCLUSIVE
is the honest verdict for a dispatch that was killed"). So a bare `2` from any gate using this helper is
ambiguous between three things: the dispatched job's own INCONCLUSIVE (if it happens to use `verdict.mjs`),
the dispatched job's own unrelated meaning of 2 (a usage error, in most of the scripts above), or the
dispatch itself dying before the job could answer at all.

### `packages/worker-fleet/src/cli-flags.mjs` (shared infrastructure, not a gate of its own)

`refuseUnknownFlags` calls `process.exit(2)` directly when a caller passes a flag none of `GUARDED`'s ~30
adopters declared. This is the ONE place code 2 means, uniformly and by design, "you mistyped a flag" — and
it is shared machinery every guarded script above inherits, not a code any of them chose for itself. Not a
gate, and excluded from the discovery test below the same way `verdict.mjs`, `dispatch.mjs` and `fleet.mjs`
are — it is the guard, not something the guard watches.

### `packages/worker-fleet/src/`

| script | codes → meaning |
|---|---|
| `check-worker-code.mjs` | 0 no worker configured, or zero stale workers found; 1 one or more workers serve a code hash that does not match this checkout. An unreachable worker is explicitly excluded from "stale" — "a box asleep contributes no evidence and no mismatch" |
| `code-drift.mjs` | Not a CLI (no `main`); `assertWorkersServe` exits 3 for either an empty worker pool or genuine code drift — both documented as preconditions distinct from 1 (captures failed) and 2 (malformed request). Whatever calls it inherits 3 directly |
| `compare-workers.mjs` | 2 usage error (missing page URL, or fewer than two workers named) |
| `deploy-worker.mjs` | 3 an uncommitted `CAPTURE_PROTOCOL_VERSION` bump refused (a precondition — **this is the `fleet:deploy` "3" the peer who assigned this unit hit today**); 2 no local worker VMs registered; 1 one or more VMs failed to deploy; 0 all deployed |
| `doctor.mjs` | 1 `ready` is false (any check failed); 0 all checks pass |
| `fleet-discover.mjs` | 2 usage error, could not determine a subnet to scan; 1 a declared worker moved, or an unenrolled worker remains after `--enroll`; 0 no mismatch. Absence is explicitly stated as not a fault — "this fleet is meant to be off between runs" |
| `fleet-status.mjs` | 1 zero workers reachable ("every worker being down is a fault; ONE being down is not"); 0 otherwise — **including when the fleet is reported SPLIT / running inconsistent code**, which is a real operational problem invisible in the exit code entirely, not merely under-coded |
| `fleet-wake.mjs` | 2 no workers matched, or an empty inventory (usage/precondition); 1 a requested worker timed out waking, or has no MAC on file — the timeout case does not distinguish "genuinely failed to wake" from "woke, but slower than the poll budget" (a milder version of the shape below); 0 every requested worker answered |
| `guest-run.mjs` | 2 usage error; **1 via a top-level `.catch` for ANY thrown error, including the polling-timeout path, whose own message reads "no `<sentinel>` within `<N>`s — the script may still be running"** |
| `normalise-fleet.mjs` | 2 no `a11y-worker*` VMs registered; 1 one or more guests' normalise command failed for real; 0 otherwise |

### `packages/control/src/`

| script | codes → meaning |
|---|---|
| `lab-job.mjs` | Exactly one exit call: `process.exit(result.status ?? 1)`, where `result` is the **raw, unmodified exit status of the `ansible-playbook` subprocess it spawns synchronously**. This script has no exit-code scheme of its own — its 0/1/2/3/4/5/99/250 are Ansible's own documented conventions (0 OK, 1 error, 2 host failure, 3 unreachable, 4 parser error, 5 bad options, 99 user interrupt, 250 unexpected error), not anything this repo defined. A caller reading `lab:job`'s code as a verdict about the JOB is reading Ansible's verdict about running the PLAYBOOK — a different question whenever they diverge |
| `fleet-playbook.mjs` | 2 any of five distinct argument-validation refusals in `parseArgs` (bad `--playbook=`, `--limit=`, `--serial=`, unreachable control plane checking `SubState`) — all usage/precondition, one code; **3 a `CAPTURE_PROTOCOL_VERSION` refusal** (`guardProtocolChange`) — the OTHER, separate meaning of 3, confirming this repo already has at least two live meanings for exit 3 before counting `promote-model.mjs`'s third; 1 the control plane is on the wrong commit, OR whatever raw exit status the started unit reports (passed through directly, so this is NOT always literally 1 despite the source code, in the same way `lab-job.mjs` is not always literally its own number); **4 `followUnit` gave up watching a unit still in `SubState=running` past its own budget** — self-documented in the code's own stderr message: *"It has NOT been stopped — this command gave up watching, which is not the same thing."* **This is the clearest, cleanest confirmed instance of the exact shape flagged going into this unit** |
| `lab-pipeline.mjs` | 2 SEVEN distinct causes share this one code: invalid `--only=`, a job needing `--only=` that lacks it, an unreachable control plane, "NO CURRENT INVOCATION" is not one of these — actually see below, unknown `--pipeline=`, invalid `--ref=`, and a `--ref=` that does not resolve on origin — all usage/precondition, none of them INCONCLUSIVE in the `verdict.mjs` sense; 3 "NOT LOADED", no pipeline of this name has run since the last reap — a genuine "no run recorded" state, matching `wait-for-capture.mjs`'s 2 and giving exit 3 its FOURTH distinct meaning across this table; 1 `Result !== success \|\| ExecMainStatus !== "0"` after the unit finished — a real failure; 0 covers three DIFFERENT states on purpose and says so: `--list`, "RUNNING" (still in progress — explicitly not a verdict about the pipeline, just that dispatch worked and the unit exists), and "SUCCEEDED". The `status` exit at the end of `--follow` mode passes through whatever the failing STAGE reported, the same non-literal-number caveat as `fleet-playbook.mjs`'s 1 |

## Python — `packages/lab/scripts` and `packages/scorer/python`

Added 2026-09-06, after the earlier Python audit ("Python gates and the partial-corpus question",
`docs/backlog.md`) found two real gaps and fixed them — and then this file's own discovery test was
found to filter to `.mjs`/`.ts`, so that audit was a one-off, not a standing guard: nothing stopped a
ninth Python gate arriving with the same defect, and nothing would have noticed if either fix were
reverted. `exit-code-contract.test.ts` now discovers and classifies Python scripts too, over the
identical discover-and-classify shape as the table above.

**Scope: these two directories only**, matching this document's own existing boundary statement two
sections up ("this table covers the `.mjs`/`.ts` layer, not the Ansible playbook layer"). Two other
directories hold `.py` files that call `sys.exit`/raise `SystemExit` and are deliberately out of scope,
each for a stated reason: `packages/control/ansible/**` (Ansible module/playbook tooling — a different
exit-code domain entirely, module scripts follow Ansible's own contract) and `packages/nvda-speech/**`
(a separately-licensed GPL announcement-composition port with its own standalone, hand-run data-generation
scripts — no `lab-job.yml` entry or npm script reads any of their exit codes as a verdict).

No shared Python `verdict.py` was built. The earlier audit ruled this out explicitly — "a second
`gateVerdict` across the language boundary is the fact-stated-twice hazard in its most expensive form" —
and that ruling stands; `test_release_gate_contract.py`/`exit-code-contract.test.ts` already show how to
pin one contract from two sides without either importing the other.

| script | codes → meaning |
|---|---|
| `audit-scorer-shortcuts.py` | 0 `--update-baseline` written, `--no-baseline`, no baseline file exists yet, or `compare_to_baseline` finds nothing wrong; 1 any of REGRESSION / UNAUDITED / LOST COVERAGE (three distinct findings, collapsed) OR the exported corpus file is empty (a plain-string `SystemExit`, which Python reports as exit 1); 2 no record in the corpus could be featurized at all — the real "examined nothing" refusal, distinct from an empty corpus |
| `check-screenreader-hardening.py` | 0 every adversarial/hardening check passed; 1 any failed. Run via `npm run training:hardening` |
| `compose-multi-defect-probe.py` | A module-level ADR 0015 mechanism probe with no `if __name__` guard and no caller anywhere in this repo — run by hand only, never dispatched. Its one `raise SystemExit(f'...')` (a string, so exit 1) refuses when the corpus has no donor page carrying a required marker feature |
| `diagnose-false-positives.py` | 0 always, unconditionally, including on zero records read — **named, not fixed**, in the earlier audit: no gate or promotion decision reads this script's exit code today, a human runs it deliberately with a record count already in hand |
| `evaluate-screenreader-acceptance.py` | 0 held-out acceptance passed; 1 the acceptance result failed OR a precondition refusal (stamping a verdict into tracked source) — two distinct causes share 1. The bare exit code cannot itself distinguish "capture-to-capture stability could not be measured" from a real regression; only the JSON/message can |
| `train-screenreader-model.py` | 0 (implicit — `main() -> None`) trained; 1 three distinct precondition failures share it (a stale realism-tier dataset since the export changed, an unknown `rule-ownership.json` key, a `forbidden`/`unavailable` key present in the export) — all plain-string `SystemExit`s; 3 refuses to overwrite a RELEASE-ELIGIBLE model directory — a separate code on purpose, because the fix is different (train to a scratch `--output` rather than fixing the corpus) |
| `audit_applicability.py` | 0 no precondition silences a labelled positive; 1 a precondition DELETES real evidence a labelled positive depends on; 2 no corpus found under `runs/` — the real INCONCLUSIVE. (`would_gating()`, the print-only "if this were gated" cost estimate, silently skips unfeaturizable records with no count reported — cosmetic, does not affect the exit code, named in the earlier audit) |
| `audit_container_exits.py` | 0 always, whenever anything could be examined — report-only by design, a fact about NVDA's own container announcements, never a corpus defect, never blocking; 2 no corpus found OR no record could be parsed — two causes share it |
| `audit_grants.py` | 0 every accompanying defect grants the feature it declares; 1 a defect declares evidence the corpus does not contain; 2 FOUR distinct refusal causes collapsed to one INCONCLUSIVE (no grants map on disk, no corpus records, nothing survives the stale-`parsed`-block filter, no multi-defect record matched) |
| `explain_feature.py` | 0 always, whenever the requested subtype/feature pair has any samples; 2 no exported dataset at `--data`, OR zero samples for the requested pair — both real preconditions, collapsed |
| `export-encoder-onnx.py` | 0 the exported ONNX encoder matches the torch reference within tolerance; 1 embedding drift exceeds tolerance, refuses to ship the export. Run once, offline, by hand — CI never runs this |

**Shared infrastructure, not a gate of its own:** `screenreader_features.py`'s `assert_input_version`
raises `SystemExit` (a plain string, exit 1) when a record was built under a stale model-input contract.
It has no `if __name__ == "__main__":` block — it is never run as a script — and is called by every
trainer/audit that reads exported records, so its exit code is inherited rather than chosen by each of
them, the same role `dispatch.mjs` and `cli-flags.mjs` play on the JS side above.

## Cross-cutting: what each code means, collected

**0** — success, in every script, but "success" itself varies: some scripts' 0 means "clean" (most gates),
some mean "dispatch succeeded, no opinion yet" (`lab-pipeline.mjs --follow`'s detached-start path), and one
means "printed JSON" regardless of findings (`audit-observation-ambiguity.mjs --json`).

**1** — the closest thing to a universal "something is wrong" across this table, but never further
discriminated in most scripts (`corpus-backup.mjs`, `guest-run.mjs`'s catch-all, `everything-pipeline.mjs`,
`retrain-pipeline.mjs`). Two scripts (`lab-job.mjs`, `fleet-playbook.mjs`) do not even keep this fixed — it
is the default when a spawned subprocess's own status is unavailable, and the real status otherwise
overrides it.

**2** — the single most overloaded code in this repo. Confirmed distinct meanings: usage/argument error (the
large majority — `evidence-check.mjs`, `capture-fixtures.mjs`, `explain-capture.mjs`,
`compare-workers.mjs`, `fleet-discover.mjs`, `capture-real-pages.mjs`, `repeat-capture.mjs`, and most of
`fleet-playbook.mjs`/`lab-pipeline.mjs`'s refusals), `verdict.mjs`'s INCONCLUSIVE, a stale local corpus
(`check-signals.mjs`), a precondition with no data at all (`corpus-snapshot.mjs`, `calibrate-abstention.mjs`,
`build-realism-tier.mjs`), and a killed dispatch (`dispatch.mjs`).

**3** — confirmed FOUR distinct meanings: a `CAPTURE_PROTOCOL_VERSION` refusal (`fleet-playbook.mjs`,
`deploy-worker.mjs`), an uncommitted git tree blocking promotion (`promote-model.mjs`), "measured nothing,
the fault could not occur" (`page-identity-rate.mjs`), and "no run recorded" (`lab-pipeline.mjs`) — plus
`code-drift.mjs`'s shared "empty pool or real drift" precondition, which several worker-fleet scripts
inherit.

**4** — one confirmed meaning in this table, and it is the dangerous one: `fleet-playbook.mjs`'s
`followUnit` giving up on watching a still-running unit.

## The dangerous shape: "I stopped observing" read as "it failed"

This is what the person who assigned this unit was specifically worried about, from a real incident today.
Two confirmed instances, one borderline:

- **`fleet-playbook.mjs`'s `followUnit`, exit 4.** Polls `SubState` until it leaves `running` or a budget
  expires; on the budget expiring it exits 4 and says, in its own words, *"It has NOT been stopped — this
  command gave up watching, which is not the same thing."* The unit may be — and in the incident that
  prompted this audit, was — still running correctly. A caller must not read 4 as "the deploy failed";
  it means "ask again, this command stopped looking."
- **`guest-run.mjs`, exit 1 (via its top-level catch).** The polling-timeout path throws an error whose own
  message says *"the script may still be running"* — and that thrown error is caught by the same handler
  that reports a genuine remote failure, so from outside the two are the same exit code.
- **`fleet-wake.mjs`'s timeout state, exit 1** — softer version: does not distinguish "never woke" from
  "woke slower than the poll budget," but the code's own semantics do not claim otherwise the way the two
  above explicitly warn against being misread.

**What was checked and is NOT this shape, despite the name inviting the same suspicion:**
`wait-for-capture.mjs`'s exit 3 ("wedged") is threshold-based on the run's own declared `captureTimeoutMs`,
not the waiter's patience — a principled INCONCLUSIVE, not an accidental one. `code-drift.mjs`'s exit 3 is a
real precondition (empty pool or genuine drift), not an abandoned wait.

**Not resolved by this audit:** the specific "`lab:job` returned 4" incident the assigning session
described could not be reproduced from `lab-job.mjs`'s own source — its one exit call is a direct,
synchronous pass-through of `ansible-playbook`'s raw exit status (see the table row above), which has no
`followUnit`-style polling loop of its own to give up on. Ansible's own exit code 4 is documented as
"parser error," which does not obviously fit a job that was running fine. The most likely explanation,
unverified: the incident was `fleet-playbook.mjs`'s exit 4 (which unambiguously is this shape) recalled
under the wrong command name, or a task inside `lab-job.yml`'s own Ansible logic (not audited here — this
table covers the `.mjs`/`.ts` layer, not the Ansible playbook layer, which has its own exit-code surface
this pass did not reach). Worth the assigning session's own direct check against whatever log is still
available.

## What this recommends

1. **Do not mass-rewrite.** Confirmed above: most non-`verdict.mjs` scripts collapse several real, distinct
   causes into one code deliberately or by accretion, and several (`check-signals.mjs` chief among them)
   carry hard-won, specific summary text that a generic `gateVerdict`/`renderVerdict` swap would flatten
   into "N problem(s) across M examined" — a real loss, not a neutral refactor. `check-signals.mjs` was
   considered as an adoption candidate (its own `signalVerdict` already computes the identical
   PASS/FAIL/INCONCLUSIVE concept by hand) and declined for exactly this reason.
2. **The discovery test** (`packages/lab/src/gates/exit-code-contract.test.ts`) requires every script that
   calls `process.exit`/`process.exitCode =` with a code the caller might read as a verdict to be either a
   confirmed `verdict.mjs` adopter or named in this document, in the shape `cli-flags.test.ts` already uses
   for the same kind of population (a list that may only shrink, never grow silently). Extended 2026-09-06
   to Python: every `.py` script under `packages/lab/scripts`/`packages/scorer/python` calling
   `sys.exit`/`raise SystemExit` must be documented here too — a ninth Python gate fails the test the same
   way a fifty-first JS one would.
3. **Fix only what is unambiguous and cheap: nothing, this pass.** No script's contract was changed. The
   `check-shipped-provenance.mjs` finding (adopts the contract, cannot return INCONCLUSIVE) was recorded
   above rather than patched, because patching it meant first deciding what `of` should really count — a
   real design question, not a typo. **That question was decided in a follow-up unit: see above.** The
   answer was not a patch — `of` already counted the right thing (one artefact) — but a decision that the
   unreachable state is correct, stated explicitly in the gate's own code and proven by a test.
