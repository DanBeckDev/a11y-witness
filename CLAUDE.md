# CLAUDE.md — a11y-witness

Guidance for Claude Code (and humans) working in this repo.

## Where else to look

This file is for working ON the repo: rules only, each linking to the incident that produced it in
`docs/` (#458 split this file down from 228k chars; see `docs/operational-lessons.md` and its siblings).
Three shorter documents came first for a reason, and they are not duplicated here:

| | |
|---|---|
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | the 60-second orientation, and the question that decides everything: **does your change need a Windows worker?** Most of the repo does not. |
| [`SECURITY.md`](SECURITY.md) | what this tool does that somebody must know before running it — `probeForms` presses buttons, the worker has no authentication, `A11Y_PYTHON` is executable |
| [`docs/README.md`](docs/README.md) | the index to every guide and runbook, grouped by task, with [`docs/adr/README.md`](docs/adr/README.md) for the 37 decision records |
| [`docs/backlog.md`](docs/backlog.md) | **The RECORD of what was found and what it cost.** [GitHub Issues](https://github.com/DanBeckDev/a11y-witness/issues) answers "what is open" — `ready` is pickable, `in-progress` plus a `session:` label is claimed. This file, `known-gaps.md` and `not-working.md` hold the measurement, the wrong turn and the command that settles it: the half an issue is bad at |
| [`docs/known-gaps.md`](docs/known-gaps.md) | **what this project does NOT do, or does not yet know** — each with what it would cost and what would tell you it is fixed. Read it before claiming a thing is finished; "all gates pass" and "everything is validated" are different claims |

## What this is

a11y-witness drives a **real screen reader (NVDA)** through real navigation to assess the lived
assistive-technology experience: the WCAG failures that rule scanners structurally cannot reach. It sits
**alongside** axe-core (the rule/visual layer), not instead of it. See `README.md`, `PLAN.md`, `docs/adr/`.

**A finding is either ASSERTED or REFERRED, and knowing which is decided by which layer owns the subtype.**
This paragraph used to say the trained scorer "assesses the judgment-based WCAG failures" — it does not
assess them in the sense of concluding anything. Measured on the product path, 18 conformant real pages:
**0 criteria asserted wrongly, 4 referred.**

| | |
|---|---|
| **rules** (`rule-ownership.json` → `decidedBy: "rules"`) | the only layer that MAY assert — but only 4 of the 18 rules-owned subtypes actually assert (`1.1.1:missing-alt`, `1.1.1:filename-alt`, `4.1.2:unnamed-control`, `4.1.2:state-change-silent`); the other fourteen map as `secondary`/`cantTell` because they INFER where the four READ directly. `asserting-subtypes.test.ts` pins both numbers against the artefacts — this count has drifted three times as subtypes were added. [Drift history →](docs/operational-lessons.md#the-asserting-subtypes-count-has-drifted-three-times) Exact on every criterion it owns, 0 false positives across 1,183 conformant records. |
| **the trained scorer** (`judge-backend: local`, no rented LLM) | `findingsFromScores` sets NO `mapping`, and `RequirementMapping` defines absent as `secondary` — so every model finding becomes `cantTell`. It TRIAGES: finds the moment worth a human's attention and quotes the announcement. |

ADR 0021 records why that is the right division rather than a shortfall, and moved
`4.1.2:state-change-silent` — the flagship finding — from the model to the rules so it could be stated
rather than suggested.

## Code conventions

We follow the applicable subset of *Clean Code* (Martin). It has two halves, enforced differently.

**Mechanical — enforced by ESLint (`npm run lint`); errors block CI:**
- Small functions that do one thing at a single level of abstraction; the top-level function reads as a top-down narrative (the Stepdown Rule). Gated by `max-lines-per-function` (70), `complexity` (15), `max-depth` (3).
- Few arguments, and **no boolean flag arguments** — bundle cohesive arguments into an object instead. Gated by `max-params` (4).
- **Never swallow an error** with an empty `catch {}` — record a diagnostic or rethrow with `{ cause }`. Gated by `no-empty`. (This codebase's whole diagnostics model exists because silent catches once hid an outage.)
- `no-magic-numbers` is a non-blocking **warning**: name a number when it is not self-explanatory (timeouts, budgets, limits); HTTP status codes and slice lengths are fine inline. This matches the book's G25 ("only when the value is not already self-explanatory").

**Judgment — not machine-checkable, so honor these by hand:**
- Does the function *really* do one thing? Extracting a helper whose name merely restates its code is not progress (the book's own test).
- Comments explain **why** — intent, consequences, non-obvious domain facts (NVDA quirks, the cursor-at-end gotcha, WCAG rationale). **Keep those.** Delete only comments that restate what the code already says. The book attacks noise and bad-code-compensating comments, and explicitly endorses intent/warning comments.
- Intention-revealing names; rename freely when a better name appears.
- **Do NOT import the book's Java-OO machinery** (Abstract Factory to hide switches, class-per-noun, ArgumentMarshaler-style hierarchies). This is a small functional TS/MJS pipeline; adding class structure here is over-engineering, the opposite of "scalable." Match the surrounding functional style.

## Working on a Mac (the usual case)

> **THE LOCAL UTM WORKER VMs ARE DEPRECATED. Capture on the bare-metal fleet.** TEN boxes
> (`a11y-worker-2` … `-11`, in `inventory.yml`; `-1` is retired and its number is never reused.
> [`-10` rejoined 2026-09-09 →](docs/operational-lessons.md#a11y-worker-10-withdrawn-2026-09-07-rejoined-2026-09-09)) serve
> `/health` without a laptop in the path, and `npm run fleet:status` is the one command that says
> so. Deploy with **`npm run fleet:deploy`**, never `worker:deploy` — that one is `utmctl file push` to a
> VM UUID and cannot reach a physical box.
>
> [Why this note exists, and what "kept" means below →](docs/operational-lessons.md#why-the-deprecation-note-exists-and-what-kept-means)

Everything except capture runs natively. Capture needs a Windows worker. The fleet is the answer;
`docs/getting-started.md` and `docs/local-worker-vm.md` describe the deprecated local VM.

```bash
npm run worker:ctl -- up        # start/resume the VM, wait for /health
npm run worker:ctl -- status    # state, host cost, health
npm run worker:ctl -- pause     # see below: UTM cannot actually suspend these guests
npm run witness -- https://example.com --task "..."   # no A11Y_WORKER needed
```

With no `A11Y_WORKER` set the run finds the local VM, starts it, and **puts it back as it
found it** — so a VM you started yourself is left running. `--after stop|pause|leave`
overrides. `--no-axe` skips the optional rule layer; `--axe-results file.json` imports one you
already ran.

**Changing any worker file means deploying to the guests. One command — but WHICH command depends on
what the worker is.**

```bash
npm run worker:deploy                     # UTM VMs on this Mac only — utmctl file push, keyed on a VM UUID
npm run worker:deploy -- --vm=a11y-worker-2
npm run worker:code                       # each worker's /health.code vs this checkout — works for both
```

`worker:deploy` **cannot reach a bare-metal worker**: it is `utmctl file push` plus a `utmctl` reboot, it
takes a VM UUID rather than a host, and it fails immediately off macOS. Physical boxes are git-cloned
rather than file-pushed, so they deploy by pulling:

```bash
npm run fleet:deploy                  # pull + install + restart + PROVE it (bare metal)
npm run fleet:provision               # the ROLE: NVDA, the Edge pin, policies, and the provision stamp
npm run fleet:provision -- --serial=0 # all boxes at once, rather than one at a time
eval "$(npm run --silent fleet:env)"                                # A11Y_WORKERS from inventory.yml
npm run fleet:status                                                # what every box is doing, right now
```

`fleet:provision --serial=0` (all at once) is right here because `provisionRevision` is a MUST_MATCH cache key — a canary box IS the failure mode. [Why →](docs/operational-lessons.md#fleetprovision---serial0-and-the-sre-workbook)

`fleet:deploy`/`fleet:provision` REFUSE a worker that is capturing (a HARD fail, `-e a11y_force_deploy=true` overrides) — `recover.yml`/`restart.yml` are exempt, since they act on a worker that is busy AND wedged. `fleet:status` surfaces a **degraded** guest: the fault that produces zero failures because the worker's own retry absorbs every recovery. [Why the hard fail →](docs/operational-lessons.md#fleetdeployfleetprovision-refuse-a-capturing-worker)

**Long lab work runs through Ansible, not through a shell.** Training, dataset builds, abstention sweeps and
real-page captures are named jobs, dispatched with fixed argv and supervised by systemd:

```bash
npm run lab:job -- -e job=train                 # the catalogue is in ansible/lab-job.yml
npm run lab:job -- -e job=capture-real-pages -e worker=a11y-worker-2 -e role=training -e shard=0/4
npm run lab:status                              # every a11y-job-* unit and its state
npm run lab:status -- -e job=train              # systemd's view + the journal + the run's own progress file
npm run lab:stop -- -e job=capture              # end one deliberately; reports what it discards first
```

`lab:stop` exists because the unit name is the lock, so `lab:job` REFUSES a second job of that name — and
until 2026-08-22 the only way to end one was `systemctl stop` over ssh, which is the exact hole ADR 0013
was written to close. It refuses a unit that is not running and names the state it found instead, because
"it was already finished" and "I stopped your job" are different outcomes.

Three systemd-polling rules, pinned by `lab-job.test.ts`: exit on a positive verdict never a marker's absence; prove a waiter's condition can be true before backgrounding it; poll `SubState` until it LEAVES `running`, never `is-active`. [Incidents →](docs/operational-lessons.md#three-systemd-polling-facts-and-the-pct-exec-history)

**A job of a given name is refused, not killed, while one is running.** The unit name is the lock and it
holds against the ssh path too, which an in-process flag could not.

`packages/control/ansible/README.md` is the map: why SSH and not WinRM (the blank-password guard),
why not an `/admin/update` route (the worker has no auth and binds all interfaces), and the two Windows
gotchas that otherwise cost an afternoon — `administrators_authorized_keys` and OpenSSH's `DefaultShell`.
The fleet is defined **once**, in `inventory.yml`.

A new bare-metal box needs no console visit — PXE + `autounattend.xml` plants the account and key. Deploy pushes every hashed file (27 now, defined once in `packages/nvda-worker/src/worker-files.mjs`) and reboots each guest, since `utmctl exec` cannot be trusted to restart the worker. Roll back by checking out the ref and redeploying — git is the source of truth. `worker:deploy` refuses a `CAPTURE_PROTOCOL_VERSION` change without `--allow-protocol-change` (it invalidates the whole cache). [Full detail →](docs/operational-lessons.md#a-new-box-needs-no-console-visit-and-the-protocol-version-trap)

Five more `utmctl`/local-VM quirks that have each cost real time — do not restart with `utmctl exec` and believe it, verify through `/health` not `exec`, this shell is zsh (no scalar word-splitting), `utmctl` needs the UTM app running, and `utmctl exec`/SSH land in session 0 and cannot run a capture. [Full detail →](docs/local-worker-vm.md#five-utmctl-quirks-moved-from-claudemd-458).

A correct value read from the wrong place, or a stale value read as current, cost six wrong diagnoses in one day. Ask the authoritative source and let it tell you what it is bounded to. [Full table →](docs/operational-lessons.md#the-diagnostics-lied-to-me-six-times-in-one-day-and-never-once-by-being-wrong)

## If you are an agent, start with these

```bash
npm run doctor                  # can I run right now? every check names its own fix
npm run doctor -- --json        # same, machine-readable, with a next_command field
```

**Read `next_command` and do that.** `doctor` exits 0 when a run can proceed, which is not the
same as everything already running:

> **Stopped worker VMs are the correct resting state.** A run starts what it needs and releases
> it afterwards. `all stopped` is a READY state, not a fault. Do not go looking for another
> worker, and do not open the UTM GUI — just run the capture.

The only worker states that are actually broken: a VM running but not answering `/health`, or no VM registered at all. `doctor` answers VM state, worker health, page server, judge backend and whether a run was left mid-flight. For local-VM pooling (multiple UTM guests on this Mac, deprecated in favour of the bare-metal fleet) — `training:capture`, `worker:ctl -- pool`, `A11Y_WORKERS`/`A11Y_VM_AFTER`/`A11Y_LOCAL_VM` — see [the pool commands](docs/local-worker-vm.md#for-a-long-run-use-more-than-one-worker-moved-from-claudemd-458).

Local-VM pool sizing was measured before the fleet moved to bare metal (disk-bound negative scaling, ~8 GB/guest, a second guest halving reliability). [Measurements →](docs/fleet-capacity-history.md#update-three-workers-now-scale-and-the-negative-scaling-section-below-is-out-of-date)

## You may be sharing this checkout

More than one agent works in this repo, on the same branch, at the same time. A commit of mine
once swept up 19 files, 16 of them another agent's half-finished work, and pushed it.

- **Commit explicit paths.** `git add -A` cannot tell your edits from someone else's.
- A **pre-commit hook** (`scripts/git-hooks/pre-commit`, wired via `core.hooksPath`) refuses a
  commit containing files nobody has touched in 30 minutes, or more than 12 files at once, and
  names the offenders with their ages. In a shared tree, an 8-hour-old staged file is someone
  else's work.
- If the block is a false positive — long debugging session, files genuinely yours — check
  `git diff --cached` first, then `A11Y_COMMIT_ALL=1 git commit ...`.
- To commit **part** of a file another agent is also editing, stage just your hunk:
  `git apply --cached your.patch`, then `git commit` with **no path arguments** (a path argument
  makes git commit the working tree, not your staged hunk).
- `git status` before you start. Files already modified are not yours to commit.

**THE PRIMARY CHECKOUT IS READ-ONLY EXCEPT FAST-FORWARD** — two hooks enforce it mechanically; `npm run primary:update` is the only sanctioned way to move it. [Why →](docs/operational-lessons.md#the-primary-checkout-is-read-only-except-fast-forward)

Multiple peer sessions can be driven by one orchestrator if each unit's acceptance is a named command and work is partitioned by RESOURCE, not topic. [What worked →](docs/operational-lessons.md#and-more-than-one-agent-may-be-driven-by-another-what-worked-measured-2026-09-05)

The browser is EVIDENCE, not configuration — `environmentKey()` keys the cache on it, Edge's preset must stay byte-identical, and nothing falls back silently. See `docs/adr/0035-the-browser-preset-is-evidence-not-configuration.md` for the decision, [the mechanism](docs/nvda-behavior-incidents.md#which-browser-a-capture-drives) for detail.

## What the screen reader drives

`docs/screenreader-coverage.md` is the map: every user behaviour we drive, the field it lands
in, and — the part that matters — **what we do not drive yet**, with the guidepup command for
each. Read it before adding a probe, and update it when you do. A behaviour missing from that
table is not a missing feature; it is a claim this project cannot currently make.

`probeForms` defaults **ON in the GitHub Action and OFF in the CLI** — the split follows who owns the
page, not what the tool prefers. A workflow runs against your own app, where submitting is intended and
3.3.1/4.1.3 are otherwise structurally unreachable; the CLI can be aimed at any URL, and pressing *Book*
on a stranger's site is not a review. `chooseProbe` is exported and unit-tested for exactly that gate.

Other probes beyond the default set are opt-in over the wire (`probeFocus`) so a capture
never pays for evidence nobody asked for. `focusOrder` costs ~8 s on a ~15 s CORPUS capture; on real pages, 72.5 s and 16.3 s.

## Captures are cached — and the cache is keyed on more than the page

A full run is 1,061 pairs, so `npm run training:capture` reuses evidence on disk when nothing that
shapes it has changed. The key covers the page directory (every file), the capture options,
NVDA and Edge versions, **the Windows build and architecture**, the provisioning revision, and
`CAPTURE_PROTOCOL_VERSION`.

- **The OS is in the key because a fleet can have more than one image** — an ARM64 and an x64 guest must never blend evidence into one corpus. `provisionRevision` is a further guard: unstamped guests report `"unstamped"` rather than assuming a match.
- **`RUNS_ROOT` / `A11Y_RUNS_ROOT`** move where `runs/` itself resolves to, for a machine where it's mounted elsewhere.
[Full detail on the OS key, the recapture cost, and provisionRevision →](docs/capture-cache-incidents.md#the-os-key-provisionrevision-and-runs_root)

A cache-key version memoised on process identity lied for five days while Edge auto-updated underneath it; memoise on file identity instead. [Incident →](docs/capture-cache-incidents.md#a-cache-key-that-was-memoised-and-lied-for-five-days)

A capture survives a lost socket: `POST /capture` names it with a client-minted `captureId`, `GET /capture/<id>` replays the result — 404 means not retained, never "never ran." [Mechanism →](docs/capture-integrity-plan.md#a-capture-survives-a-lost-socket-name-it-then-ask-for-it-again)

## Readiness: `ready`, not `ok`

`/health` reports `ready` alongside `ok`. **Dispatch on `ready`.** `ok` only ever meant "the HTTP
server is answering", and a worker answered it while NVDA could not start — which is how the pool's
dominant failure hid for a day.

**`ready` is about the ENVIRONMENT, not the screen reader**: Edge is resolvable,
`ForegroundLockTimeout` is 0, and the worker is free. `screenReader` and `warmedUp` are **reported
and deliberately not gated on** — gating on them is what produced the NVDA restart loop that put
modal dialogs on guest desktops. (This paragraph used to claim `ready` meant "NVDA is up and
answering". It never did, and believing it is why the cold-start failure below went unnoticed.)

`ready:false` right after a boot is **normal and self-correcting** — it means "not yet", not
"broken". `worker-ctl.sh up` waits for it, and each pool worker waits for its own before taking work.
Warm-up retries are capped (3 attempts, 30 s apart) because retrying on every poll cycles NVDA, and
cycling NVDA destabilises the speech channel.

A worker that fails three captures in a row is **evicted** from the pool and everything it failed goes
back to the queue; the run summary names it.

The browser version is evidence: Edge 152's spec-aligned `form`→`section` role change flipped announcements repo-wide overnight, caught by `check-signals` before it reached a model. [Incident →](docs/capture-cache-incidents.md#the-browser-version-is-evidence-too-and-edge-152-proved-it-by-renaming-a-container)

`guidepup` is pinned at 0.31.0, and `screenReaderSettings` (e.g. `speech.reportLanguage`) is a cache-key input alongside it. See `docs/adr/0033-guidepup-exact-pin-is-evidence-not-dependency-hygiene.md` for the decision, [the incident](docs/capture-cache-incidents.md#guidepup-is-pinned-at-0310-and-the-version-is-evidence) for detail.

Quick navigation cannot reach whatever element the caret sits on — NVDA searches by start position. The default probe order works only because the read-through leaves the caret at the bottom. [Detail →](docs/nvda-behavior-incidents.md#quick-navigation-can-never-reach-the-element-the-caret-is-on)

NVDA consumes the first Escape after a focus probe switches focus mode on — a dialog-escape probe must press twice. [Detail →](docs/nvda-behavior-incidents.md#nvda-eats-the-first-escape-and-anchortotops-escape-does-not-test-what-you-think)

An object-vs-count comparison bug in `evidence:check` made `formChanges`/`stateChanges` always compare SAME regardless of content, fixed 2026-09-01. Grep for the shape everywhere it recurs. [Detail →](docs/nvda-behavior-incidents.md#evidencecheck-compared-the-interaction-channels-by-count-fixed-2026-09-01)

Activating a control turns focus mode ON and it STICKS, so later quick-nav letters get typed into the page instead of navigating — corrupted 353 captures with every check green. Always restore browse mode (`nvda.press("Escape")`) after activating a control. [Detail →](docs/nvda-behavior-incidents.md#focus-mode-makes-quick-nav-keys-type-themselves-into-the-page)

A fact stated in two or more places, with nothing comparing them, caused five incidents in one day. Delete a copy, derive one from the other, or pin them equal with a test. [Table →](docs/operational-lessons.md#a-fact-stated-twice-and-the-copies-drifted-five-of-these-in-one-day)

2.4.1, 2.4.2 and 2.4.3 are markup-valid-at-every-instant failures a static analyser structurally cannot reach. [Detail →](docs/operational-lessons.md#three-criteria-a-static-analyser-structurally-cannot-reach)

A remedy applied at ONE call site when the behaviour is reachable from several is this repo's most expensive recurring shape. Confirm a fix by its diagnostic MARK, never a green result. [Table →](docs/operational-lessons.md#a-fix-applied-at-one-call-site-when-the-behaviour-reaches-several)

A hand-written field list silently skipped `routeChange` (an object, not an array) in two tools. Derive the list from an exhaustive `Record<Union, ...>` instead. [Incident →](docs/operational-lessons.md#a-list-of-fields-to-check-and-the-one-field-with-a-different-shape)

A comment naming an ambiguity, above code that resolves it by assumption, cost real findings three times. Find the signal that is NOT ambiguous instead. [Table →](docs/operational-lessons.md#a-comment-that-names-an-ambiguity-above-code-that-resolves-it-by-assumption)

A 1-in-125 contaminant slipped past `gate:stability` because `repeat-capture` never compared the two interaction-evidence fields. Both gaps are fixed. [Incident →](docs/operational-lessons.md#two-blind-spots-let-a-1-in-125-contaminant-into-the-corpus)

A fixed `sleep()` expiring early once inverted a finding (a correct page read as "nothing announced"). Wait for the real condition; a remaining `sleep()` must only be a poll interval. [Detail →](docs/nvda-behavior-incidents.md#wait-for-the-condition-never-sleep-a-duration)

A half-open speech socket accepts keystrokes but never speaks, and NVDA looks perfectly healthy. `ensureSpeechChannel` probes and force-reconnects before every capture. [Detail →](docs/nvda-worker-runbook.md#the-speech-channel-is-a-socket-and-a-dead-one-looks-exactly-like-a-healthy-nvda)

A guest whose NVDA is broken can produce ZERO failures — the worker's retry absorbs it. Watch `/health.vitals.recoveries`, not `failures`. [Incident →](docs/nvda-worker-runbook.md#a-guest-whose-nvda-is-broken-looks-perfectly-healthy-watch-recoveries)

A freshly booted worker used to fail its first capture, every time, invisibly retried by the run. The worker now retries once itself first. [Fix →](docs/nvda-worker-runbook.md#a-freshly-booted-worker-used-to-fail-its-first-capture-every-time)

NVDA's mute rate is stochastic and tied to host load, not a fixed lifespan — ~45% survive to the 25-capture recycle. Leave `MAX_CAPTURES_PER_NVDA` at 25. [Measurements →](docs/nvda-worker-runbook.md#what-degrades-is-nvdas-speech-channel-not-the-vm-and-it-fails-on-a-survival-curve)

Recovery is keyed on `FAULT.*` codes, never on `error.message` — a reworded comment would silently break message-based matching in production. [Why →](docs/nvda-worker-runbook.md#recovery-is-keyed-on-fault-codes-never-on-message-text)

429 `a capture is already in progress` on every request means a wedged `busy` flag, not a dead machine — restarting NVDA repeatedly is what wedges it. [Detail →](docs/nvda-worker-runbook.md#the-worker-is-dead-is-usually-a-wedge-not-a-death)

## Before any corpus run: `npm run gate:stability`

Five canary pages, captured repeatedly, compared by CONTENT — it fails closed, and a corpus run must not start until it passes. It exists because Edge's autofill suggestion icon (U+FFFC) once contaminated the corpus for weeks with every count-based check green; suppressed now with command-line flags rather than Edge policies, which had already drifted. [Full incident and the fix →](docs/capture-integrity-plan.md#five-canary-pages-and-the-ufffc-autofill-incident)

A canary that cannot express the fault it's meant to catch proves nothing. Reproduce the fault with your test before trusting its verdict. [Examples →](docs/capture-integrity-plan.md#a-canary-that-cannot-express-the-fault-is-worthless)

A metric computed on data that shares the flaw cannot see the flaw — a feature that's 0 on every positive of a subtype gets a free veto no held-out split can punish. `corpus:starvation` and `scorer:shortcuts` are the two audits. See ADR 0015, [detail](docs/operational-lessons.md#a-metric-computed-on-data-that-shares-the-flaw-cannot-see-the-flaw).

A day was spent chasing false accusations the tool never actually made — five compounding causes, none of them the model. [Postmortem →](docs/operational-lessons.md#the-things-2026-08-24-cost-and-none-of-them-were-the-model)

Eleven false positives on real pages, driven to zero, were all one defect: two things compared that describe different moments or alphabets. [Table →](docs/operational-lessons.md#2026-08-25-eleven-false-positives-on-real-pages-and-they-were-all-one-defect)

Six diagnostics in one evening misreported a working system as broken. When a diagnostic surprises you, suspect the diagnostic before the system. [Table →](docs/operational-lessons.md#a-diagnostic-that-cannot-report-itself-six-times-in-one-evening)

**A check must never reject evidence whose absence is the finding** — a guard once rejected empty probe results as malformed, failing 44 live cases whose absence WAS the finding. [Full incident →](docs/operational-lessons.md#the-rule-that-cost-the-most-to-learn)

`utmctl exec` is known-unreliable on Windows — do not build a diagnosis on it. Everything it would tell you is served over HTTP at `/diagnostics` instead. [Detail →](docs/nvda-worker-runbook.md#diagnosing-a-guest-without-utmctl-exec)

`lab:inventory` answers "what state is the corpus in" — homogeneity, export freshness, model schema, any open migration — and says whether it read a local copy or the authoritative one. [Detail →](docs/lab-cli.md#what-state-is-the-corpus-in-labinventory)

## Housekeeping is automated — do not do it by hand

Anything a human has to remember is something that does not happen. What runs itself now:

- **Worker VMs** — a run starts what it needs and puts each back as it found it. Stopped is the
  correct resting state.
- **The dataset page server** is leased and refcounted — a one-case run once killed a server a 48-capture `evidence:check` was still using, silently, because Edge serves its own error page on a dead port. The last holder out stops it; a crashed holder cannot pin it forever. [Incident →](docs/operational-lessons.md#the-page-server-refcounting-incident)

- **NVDA** — the worker cold-starts it when it has gone and recycles it every 25 captures; a failed
  capture always stops it. Nothing may restart it while a worker is *idle* (see above for why).
- **Edge** — `captureWithNvda`'s `finally` closes it unconditionally, which is what stopped failed
  captures leaking eight orphaned processes onto a 4 GB guest.

**Three env vars govern where the page server lives and where a worker fetches from it, all with
sensible defaults you will not need to touch unless something is already using port 5050 or 8765:**

- `A11Y_PORT` — the port a `nvda-worker` instance itself listens on. Defaults to `8765`. Set it when
  running more than one worker process on the same host (each needs its own port), or when 8765 is
  already taken.
- `DATASET_PAGES_PORT` — the port the local page server (above) listens on and the port a worker is
  told to fetch dataset pages from. Defaults to `5050`. Set it alongside `A11Y_PORT` for the same
  reason: more than one concurrent run on one host, or a port collision.
- `DATASET_BASE_URL` — overrides the computed page-server URL outright. `hostPagesBase()` normally works this out itself; set this when that computation is wrong for your network. [Full detail →](docs/lab-cli.md#dataset_base_url-the-full-computation)

`npm run doctor` reports what it cannot fix: strays on the pages port, a VM running but not
answering, a run left mid-flight. It is read-only by design — it never kills anything — so the one
manual step left is acting on what it tells you.

`npm run lab:pipeline` runs the ordered stages of a capture/lab run and stops at the first failing stage. See [Lab Pipeline](docs/lab-pipeline.md#producing-evidence-is-a-pipeline-and-it-is-one-command) for the catalogue and fleet-consistency guards.

Every other `npm run <name>` script moved to [npm Scripts](docs/npm-scripts.md#every-other-command-and-when-you-would-reach-for-it). `docs/commands.md` covers the disjoint `scripts/*.mjs`-with-no-entry population.

`lab:status`, `lab:log` and `lab:fetch` exist because reading a job's own output once took eleven hand-written pipelines. Write reports to `runs/` and fetch them. [Detail →](docs/lab-cli.md#make-the-failure-bubble-up-or-you-will-dig-for-it-every-time)

Audit first, then fix — reasoning about a mechanism instead of measuring evidence cost a needless recapture twice in one evening. [Examples →](docs/lab-cli.md#the-order-that-would-have-saved-the-evening-audit-first-then-fix)

An unused Ansible extra var and an unrecognised CLI flag are the same defect: silently discarded, so the default runs and reports success. Fixed with declared `params` and `refuseUnknownFlags`. [Detail →](docs/guard-population-boundaries.md#a-flag-nobody-reads-and-an-extra-var-nobody-reads)

A cheap pre-check decides whether to bother running the real one; it is never licence to conclude the real one will pass. [Table →](docs/operational-lessons.md#a-guard-that-already-existed-and-a-weaker-check-substituted-for-it)

## Verifying changes

**Two of these now run themselves. That is deliberate, and it is the point.**

```bash
git push                      # pre-push hook: lint (changed), typecheck, leak scan (~10s)
npm run release:gate          # migration -> shortcuts -> signals -> rules -> held-out acceptance -> judge quality
npm run capture:check -- --worker=http://192.168.64.4:8765    # the capture layer, ~2 min
```

**Two audits added 2026-08-24 that no gate chain runs for you, and both answer questions the corpus cannot:**

```bash
npm run corpus:starvation        # word-sense MONOPOLY: a feature no conformant record carries
npm run scorer:size-sensitivity  # does a conformant page FAIL when padded with conformant content?
```

And the measurement that matters most is not in any of them: `calibrate-abstention.mjs` on the lab scores REAL pages through the product path. Watch its ASSERTED-WRONGLY column, not `referred` — collapsing the two once made the number meaningless for a day.

**Run the clean-code review on your own diff before you push** — the judgement half (does the function do one thing, is a caught error genuinely handled), which cannot live in the pre-push hook next to lint and `tsc`. Review before pushing, not after.

**Automate a check or lose it** — eight verifications existed and only two ran themselves; every manual one eventually went unrun for months. [Record →](docs/operational-lessons.md#eight-verifications-and-only-two-were-automatic)

The pre-push hook is a COURTESY; CI is the gate (#911). Three checks, ~10s: lint (changed paths), typecheck, **the leak scan** — the one CI cannot cover, since a push here is public at once. [Full scope →](docs/operational-lessons.md#the-pre-push-hooks-scope-verbatim)

Verification is layered; pick the layers your change touches:
- `npm run lint` and `npm run typecheck` — must pass. **CI gates on both**, and on `npm test`
  (`.github/workflows/ci.yml`).
**Run `npm test`, never `npx tsx --test <file>` directly, when you have changed another package's source** — cross-package imports resolve to `dist`, and only `npm test`'s `pretest` build keeps that honest.

"Resolves to `dist`" does not say WHOSE — a symlinked worktree can silently resolve to the PRIMARY's `dist`. Verify WHOSE by resolving the exact specifier: `node -e "console.log(require.resolve(...))"`. [Incident →](docs/operational-lessons.md#resolves-to-dist-does-not-say-whose)

**RESTORE FROM A COPY, NEVER `git checkout --`.** Mutation checking means editing a file you are about to restore, and `git checkout -- <file>` silently discards every uncommitted change in it, not just the mutation — it has destroyed a feature mid-build twice. `cp <file> /tmp/x && <mutate> && <run> && cp /tmp/x <file>` cannot do this. [Full incident →](docs/operational-lessons.md#restore-from-a-copy-never-git-checkout-------the-incidents)

The stale-`dist` defect exists in Python too via `__pycache__` — `test:python` runs `PYTHONDONTWRITEBYTECODE=1`. A mutation result is a fact AT THAT INSTANT, never licence to delete. [Incident →](docs/operational-lessons.md#the-same-stale-compile-defect-in-python)

- `npm test` — unit tests (`src/**/*.test.ts`) covering the deterministic rules, the judge layers,
  eval fitness, the capture cache, the run's accept/reject/retry decisions, and the WCAG criteria
  list. Fast and runs anywhere, so there is no reason to skip it.
  - `verify.corpus.test.ts` needs `runs/` and **skips honestly in CI**, which cannot see it —
    the same limitation `npm run eval` has. Run it locally before shipping a change to any gate.
  Most of this codebase genuinely cannot be unit-tested — capture needs real NVDA on Windows —
  but the pure functions can be, and these are them. Add to them when you touch a pure function.
- **Pre-release, not covered by CI:** `npm run eval:gate` (judge quality) and `verify.corpus.test.ts` (capture gates) — neither can run in CI. `npm run eval [-- <substring>]` needs the Python venv; do not quote its numbers as a headline (single-run, no expert baseline). [Full detail →](docs/capture-integrity-plan.md#eval-and-evalgate-what-cannot-run-in-ci)

- **`packages/nvda-worker/src/capture-core.mjs` only runs against NVDA on the Windows VM** — it has no local test.
  After changing it, deploy (above) and then:

  ```bash
  npm run capture:check -- --worker=http://192.168.64.4:8765   # ~2 min from the Mac
  ```

**Use the worker mode**, not the in-process one — it refuses while a worker is serving (NVDA is one machine-wide resource), which is why this check went unrun for a long stretch; going over HTTP loses nothing, since every assertion is a pure function of the capture RESULT. Run `bench-capture.mjs` too if you touched timing.

- **Count-based checks cannot see content rot — assert what was heard, not how much.** A readiness gate once deleted the h1 announcement from 90 captures with every check green, because the phrase COUNT never moved. [Incident →](docs/capture-integrity-plan.md#count-based-checks-cannot-see-content-rot)

- `npm run identity:rate -- --worker=<url> [--rounds=20]` — does a capture ever read the wrong page? Reports wrong-page, silent and unrecognised separately. [Detail →](docs/capture-integrity-plan.md#npm-run-identityrate)

`npm run evidence:check <worker>` — after ANY capture-pipeline change, asks whether the evidence moved, not the timing. Exit 0 = ship, 1 = evidence CHANGED (bump `CAPTURE_PROTOCOL_VERSION`), 2 = INCONCLUSIVE (includes partial coverage, not only zero compared). [The false-clean it once produced →](docs/capture-integrity-plan.md#evidencecheck-2-of-48-and-the-examinednothing-guard)

- `npm run training:check-signals` — proves every dataset `badSignal` fires on the bad page and stays silent on the good one. **Worker broken?** `docs/nvda-worker-runbook.md` has the error-string → cause table. **No worker to hand?** Build one: `docs/getting-started.md` (~1.5–2 h). [Full detail →](docs/capture-integrity-plan.md#trainingcheck-signals-and-worker-troubleshooting-pointers)

## A GATE THAT READS `runs/` IS NOT YOURS TO REPORT

**Ruled 2026-09-06.** `rules:gate`, `rules:coverage`, `check-signals`, `corpus:starvation`,
`scorer:shortcuts` and anything else reading `runs/` give a VERDICT only when the agent driving the fleet
and the lab runs them — against a corpus just fetched, or on the lab, which owns the authoritative one.

**Anyone else may run one as a PRE-CHECK**, to decide whether a change is worth handing on. **Never as a
reported result**, and never in an acceptance section as though it settled anything.

The reason is measured rather than procedural. `runs/` in any checkout is a copy only as fresh as its last
sync — one measured here was 89 hours old and carried neither `focusEvents` nor `baselineWaitedMs`, so a
sweep across it found zero of the two keys it was written to find. **A gate run there reports cleanly
having examined a corpus that no longer exists.** The pre-push hook does not run them since #911; it
names the lab job answering each, unconditionally.

**So an issue's acceptance may name a `runs/`-reading gate, and must say who runs it.**

> Moved here 2026-09-06 from `docs/backlog-ready.md`, which was retired when the tracker moved to GitHub
> Issues. That page was the only place this ruling existed, so deleting it would have deleted the rule —
> which is why the page was read for what it uniquely held before it was replaced.

## Environment facts
- ESM throughout (`"type": "module"`). `.ts` for the control plane, `.mjs` for the capture worker (it runs under plain Node on the VM) — see `docs/adr/0031-the-worker-ships-plain-mjs-with-no-build-step.md` for why, and what was rejected to get there.
- **The judge is our own trained scorer.** `JUDGE_BACKEND` defaults to `local` — the 27 KB of heads in
  `packages/scorer/models/screenreader-scorer/` over a frozen MiniLM encoder. `codex`, `anthropic` and `openai` remain
  available for comparison and are **never** the default.
  > It defaulted to `codex` until 2026-08-04 — a gate that does not exercise what ships is not a gate. `JUDGE_BACKEND=openai` also works against a local server (Ollama, LM Studio, vLLM). See `packages/cli/README.md` for the consumer-facing config, [the incident](docs/operational-lessons.md#judge_backend-defaulted-to-codex-until-2026-08-04) for why it mattered.

- Don't manually `taskkill nvda.exe` — let Guidepup own NVDA's lifecycle, or the speech-capture channel destabilises. Killing the worker with `Stop-Process` orphans its NVDA (still holding port 6837); the next cold start recovers, but expect to see it.
- The worker keeps NVDA alive between captures (recycled every 25). `A11Y_REUSE_NVDA=0` reverts to a fresh NVDA per capture — the first thing to try if captures drift as a run progresses.
- The guest is provisioned as an **appliance**: Windows Update may install but not reboot, and Edge's background mode, startup boost and auto-updater are off. It used to reboot itself mid-run and leak Edge processes.
Capture timing has TWO populations. On the ~12 s CORPUS capture the largest phase is `windowsActivate`, ~10 s / ~37%, and keeping Edge alive is the only real fix. On a REAL page it is ~0.3 s — one tenth of one percent — and `sweep` leads. [Both measurements →](docs/nvda-worker-runbook.md#capture-timing-and-the-windowsactivate-cost-analysis-from-environment-facts)

