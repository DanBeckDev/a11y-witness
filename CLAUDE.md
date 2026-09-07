# CLAUDE.md — a11y-witness

Guidance for Claude Code (and humans) working in this repo.

**Split 2026-09-07 (issue #155):** this file held 219,578 characters against a 150,000-character limit —
past which the file is TRUNCATED on load, so rules at the end could reach nobody. It now states each rule
once, briefly, with a link to the measurement and incident behind it. Nothing was deleted:
[`docs/history-2026-09.md`](docs/history-2026-09.md) holds the full narrative, in the same section order.

## Where else to look

| | |
|---|---|
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | the 60-second orientation, and the question that decides everything: **does your change need a Windows worker?** Most of the repo does not. |
| [`SECURITY.md`](SECURITY.md) | what this tool does that somebody must know before running it — `probeForms` presses buttons, the worker has no authentication, `A11Y_PYTHON` is executable |
| [`docs/README.md`](docs/README.md) | the index to every guide and runbook, with [`docs/adr/README.md`](docs/adr/README.md) for the 36 decision records |
| [`docs/backlog.md`](docs/backlog.md) | **The RECORD of what was found and what it cost.** [GitHub Issues](https://github.com/DanBeckDev/a11y-witness/issues) answers "what is open" — `ready` is pickable, `in-progress` plus a `session:` label is claimed |
| [`docs/known-gaps.md`](docs/known-gaps.md) | what this project does NOT do, or does not yet know. Read it before claiming a thing is finished |
| [`docs/history-2026-09.md`](docs/history-2026-09.md) | the full incident narrative and measurements this file used to carry inline |

## What this is

a11y-witness drives a **real screen reader (NVDA)** through real navigation to assess the lived
assistive-technology experience: the WCAG failures rule scanners structurally cannot reach. It sits
**alongside** axe-core, not instead of it. See `README.md`, `PLAN.md`, `docs/adr/`.

**A finding is either ASSERTED or REFERRED, decided by which layer owns the subtype.** The trained scorer
never asserts — `findingsFromScores` sets no `mapping`, so every model finding is `cantTell`; it TRIAGES.
Only the RULES layer may assert, and only 4 of the 17 rules-owned subtypes actually assert
(`1.1.1:missing-alt`, `1.1.1:filename-alt`, `4.1.2:unnamed-control`, `4.1.2:state-change-silent`) —
the other thirteen map as `secondary` because they infer rather than read.
`asserting-subtypes.test.ts` pins the numbers against the artefacts; they have moved three times as
heads were added, which is the point of pinning a prose count to a test rather than restating it.
Measured on 18 conformant real pages: 0 criteria asserted wrongly, 4 referred. See ADR 0021 for why
that split is deliberate.

## Code conventions

We follow the applicable subset of *Clean Code* (Martin). It has two halves, enforced differently.

**Mechanical — enforced by ESLint (`npm run lint`); errors block CI:**
- Small functions, one thing at a level of abstraction. Gated by `max-lines-per-function` (70),
  `complexity` (15), `max-depth` (3).
- Few arguments, and **no boolean flag arguments** — bundle into an object. `max-params` (4).
- **Never swallow an error** with an empty `catch {}` — record a diagnostic or rethrow with `{ cause }`.
  Gated by `no-empty`.
- `no-magic-numbers` is a non-blocking **warning**: name a number when it is not self-explanatory.

**Judgment — not machine-checkable, honor by hand:**
- Does the function *really* do one thing? A helper whose name merely restates its code is not progress.
- Comments explain **why** — intent, consequences, non-obvious domain facts. Delete only comments that
  restate the code.
- Intention-revealing names; rename freely.
- **Do NOT import the book's Java-OO machinery** (Abstract Factory, class-per-noun). Small functional
  TS/MJS pipeline; match the surrounding style.

## Working on a Mac (the usual case)

> **THE LOCAL UTM WORKER VMs ARE DEPRECATED. Capture on the bare-metal fleet.** TEN boxes
> (`a11y-worker-2` … `-11`, in `inventory.yml`; `-1` is retired) serve `/health` without a laptop in the
> path — `npm run fleet:status` says so. Deploy with **`npm run fleet:deploy`**, never `worker:deploy` —
> that one is `utmctl file push` to a VM UUID and cannot reach a physical box. Everything below about VM
> sizing, `utmctl` and pausing is kept for its MEASUREMENTS, not as instructions — see
> [history: "Working on a Mac"](docs/history-2026-09.md#working-on-a-mac-the-fleet-in-full) for the
> deprecation incident and the full fleet reasoning.

Everything except capture runs natively. Capture needs a Windows worker.

```bash
npm run worker:ctl -- up        # start/resume the local VM, wait for /health (rarely needed — see above)
npm run witness -- https://example.com --task "..."   # no A11Y_WORKER needed
npm run fleet:deploy                  # pull + install + restart + PROVE it (bare metal, the real path)
npm run fleet:provision               # the ROLE: NVDA, Edge pin, policies, provision stamp
npm run fleet:provision -- --serial=0 # all boxes at once — deliberately the ONLY safe option here;
                                       # provisionRevision is a cache key, so a canary box IS the failure
eval "$(npm run --silent fleet:env)"  # A11Y_WORKERS from inventory.yml
npm run fleet:status                  # what every box is doing, right now
```

`fleet:provision` must run across the WHOLE fleet — `provisionRevision` is a capture-cache key AND a
`MUST_MATCH` field, so one box provisioned alone splits the fleet into INCONSISTENT. `--limit` only
REPAIRS a box back to the stamp its peers carry, never adds one.

`fleet:deploy`/`fleet:provision` **REFUSE a worker that is capturing** (`-e a11y_force_deploy=true`
overrides). `recover.yml`/`restart.yml` are exempt in the other direction — they exist for a worker that
is busy AND wedged.

`fleet:deploy` pushes **every hashed file** (27 now, defined once in `packages/nvda-worker/src/worker-files.mjs`
— the list used to be duplicated across three files, one derived by regex) and reboots each guest —
mandatory, because `utmctl exec` cannot be trusted to restart the worker — then verifies `/health.code`
over HTTP, which shares no failure mode with the push.

```bash
npm run lab:job -- -e job=train                 # the catalogue is in ansible/lab-job.yml
npm run lab:job -- -e job=capture-real-pages -e worker=a11y-worker-2 -e role=training -e shard=0/4
npm run lab:status -- -e job=<name>             # systemd's view + journal + the run's own progress file
npm run lab:stop -- -e job=capture              # end one deliberately
```

Long lab work runs through Ansible, never a shell — `lab:stop` exists because the unit name is the lock,
so a second job of that name is REFUSED, not queued. `command` with `argv:` never invokes a shell, which
is why the lab is reached DIRECTLY at its own IP with no `pct exec` hop.

**Any status waiter: poll `SubState`, never `systemctl is-active`** (an exited unit under
`--remain-after-exit` reads `active (exited)` forever). **Wait for it to LEAVE `running`**, never to equal
one terminal value you thought of — `exited`, `failed`, `dead` are all real outcomes. **Finish on a
positive verdict the tool SAID**, never on the absence of a marker (`grep -qE
"SUCCEEDED|FAILED|NOT LOADED"`, not `until ! ... | grep RUNNING`). And before backgrounding any waiter,
prove its condition can be true at all against the real artefact — three misreads here came from a guessed
JSON shape. Three journal/exit-status misreads in one file:
[history: the diagnostics lied six times](docs/history-2026-09.md#the-diagnostics-lied-to-me-six-times-in-one-day-and-never-once-by-being-wrong).

```bash
npm run doctor                  # can I run right now? every check names its own fix
npm run doctor -- --json        # same, machine-readable, with next_command
```

**Read `next_command`.** `all stopped` is a READY state, not a fault — do not go hunting for a worker.
Set nothing for a multi-worker run; it starts what it needs and restores state after. `A11Y_WORKERS` is
the escape hatch (naming workers means managing them yourself); `A11Y_MAX_WORKERS=N` overrides the
memory-derived cap. **A second guest costs reliability, not just memory** — measured 23.4 s/0 recoveries
on one guest vs 35 s/3 of 14 recoveries on two; prefer one worker when a run must be reliable. Full
sizing measurements, the negative-scaling finding, and why `top -o mem`/RSS both lie under swap:
[history: fleet-sizing measurements](docs/history-2026-09.md#if-you-are-an-agent-start-with-these-the-fleet-sizing-measurements).

```bash
npm run training:wait           # blocks until the run finishes, exits with its outcome
npm run training:status -- --json   # a snapshot, with eta_minutes and next_command
```

Exit codes are the contract: **0** clean, **1** finished with failures, **2** no run, **3** wedged.

## You may be sharing this checkout

More than one agent works in this repo, on the same branch, at the same time.

- **Commit explicit paths.** `git add -A` cannot tell your edits from someone else's.
- A pre-commit hook refuses a commit containing files nobody has touched in 30 minutes, or more than 12 files at once.
  False positive → check `git diff --cached`, then `A11Y_COMMIT_ALL=1 git commit ...`.
- To commit **part** of a file another agent is editing: `git apply --cached your.patch`, then
  `git commit` with **no path arguments**.
- `git status` before you start. Files already modified are not yours to commit.

**THE PRIMARY CHECKOUT IS READ-ONLY EXCEPT FAST-FORWARD.** Ruled by `ceo` — broke three times in one
night before it was enforced mechanically. `pre-commit` refuses any commit made there
(`A11Y_PRIMARY_COMMIT_REASON="<why>"` overrides, printed); `post-checkout` self-corrects any checkout
there back to detached `origin/main`. `npm run primary:update` is the only sanctioned way to move it
forward. Why it matters mechanically (working-tree hashing, `node_modules` symlinks) and the three
incidents that forced it: [history](docs/history-2026-09.md#the-primary-checkout-is-read-only-except-fast-forward).

**Partition by RESOURCE, never by topic or file** when more than one agent drives the fleet/lab — a
worktree isolates the checkout and nothing else. One driver for the fleet, the lab, the page server and
`runs/`, or a collision becomes a silent wrong answer (`lab:job` reads as "already done", `fleet:deploy`
reboots every worker mid-run). Do not review diffs while driving the fleet at the same time. Full
reasoning and what made three-peer-worker throughput actually work:
[history](docs/history-2026-09.md#and-more-than-one-agent-may-be-driven-by-another-what-worked-measured-2026-09-05).

## Which browser a capture drives

`packages/nvda-worker/src/browsers.mjs` holds one preset per browser. **The browser is EVIDENCE, not
configuration** — `environmentKey()` keys the cache on it, so Edge's preset must stay byte-identical
(`browser-args.test.ts` asserts the whole command line) and profiles are never shared between browsers.
Nothing falls back: a guest whose configured browser is missing reports `browserAvailable: false` rather
than silently using another. See `docs/adr/0035-the-browser-preset-is-evidence-not-configuration.md` for the decision, and
[history](docs/history-2026-09.md#which-browser-a-capture-drives-the-mechanism-and-the-incident) for why
(spread across eight sites, this repo's most expensive recurring shape) and the Chrome-preset caveat.

```bash
A11Y_BROWSER=chrome
npm run evidence:check -- <worker> --browser=chrome     # does Chrome announce the same as Edge?
```

## What the screen reader drives

`docs/screenreader-coverage.md` is the map: every behaviour driven, the field it lands in, and what we do
not drive yet. A behaviour missing there is not a missing feature; it is a claim this project cannot make.

`probeForms` defaults **ON in the GitHub Action, OFF in the CLI** — a workflow runs against your own app;
the CLI can be aimed at any URL, and pressing *Book* on a stranger's site is not a review.

## Captures are cached — the cache is keyed on more than the page

The key covers the page directory, capture options, NVDA and Edge versions, the Windows build and
architecture, the provisioning revision, and `CAPTURE_PROTOCOL_VERSION`. **Bump
`CAPTURE_PROTOCOL_VERSION`** when a change alters what the evidence *means* (a new field a signal reads);
never on a refactor. The worker's code hash is deliberately NOT in the key.

**Browser and guidepup VERSIONS are evidence, not dependency hygiene** — both are cache-key inputs and
`fleet-consistency`'s `MUST_MATCH`. Edge 152 changed what NVDA announces (`form`→`section`, a real W3C
spec alignment); guidepup 0.31.0 fixed a U+FFFC corruption bug; a version memo silently went stale for
five days and defeated the very check built to catch it. Check `fleet:status` for consistency AND know
which Edge/guidepup you're on before a corpus run. Full incidents:
[history](docs/history-2026-09.md#a-cache-key-that-was-memoised-and-lied-for-five-days).

**A setting that changes what NVDA SAYS is a cache-key input too**, not forbidden — `CAPTURE_SETTINGS` in
`nvda-logging.mjs` is the list. Screen reader users are heavy configurers; NVDA's defaults do not describe
a typical user. `speech.reportLanguage` is the flagship example (a WCAG 3.1.2 failure is otherwise a
silent voice change). Full correction history (this got the wrong config section, then the wrong
citation-resolution rule, twice):
[history](docs/history-2026-09.md#guidepup-is-pinned-at-0310-and-the-version-is-evidence).

## A capture survives a lost socket — name it, then ask for it again

```
POST /capture  { url, ..., captureId }     # the host NAMES the capture (idempotency-key shape)
GET  /capture/<captureId>                  # 404 unknown | 202 running | the original response, verbatim
```

**404 is bounded result recall, not "never started"** — the in-memory store is bounded at 8 and never
persisted, so an evicted or post-restart capture reads the identical 404 as one that never ran. A caller
must mint a fresh id per logical capture (`randomUUID()`). Full API contract and the socket-loss incident
that forced it: [history](docs/history-2026-09.md#a-capture-survives-a-lost-socket-name-it-then-ask-for-it-again).

## Readiness: `ready`, not `ok`

`/health` reports `ready` alongside `ok`. **Dispatch on `ready`** — `ok` only means the HTTP server
answers. `ready` is about the ENVIRONMENT (Edge resolvable, `ForegroundLockTimeout` 0, worker free);
`screenReader`/`warmedUp` are reported and deliberately not gated on. `ready:false` right after boot is
normal and self-correcting. A worker failing three captures in a row is evicted from the pool. Full
incidents (browser-version evidence, guidepup pin, the NVDA-restart-loop this replaced):
[history](docs/history-2026-09.md#readiness-ready-not-ok-the-incidents-behind-it).

**Quick navigation can never reach the element the caret is on**, in both directions — the default probe
order works by accident (the read-through leaves the caret past the last element). Anchor is
`Control+End`, not `Control+Home`. [Measurement](docs/history-2026-09.md#quick-navigation-can-never-reach-the-element-the-caret-is-on).

**NVDA eats the first Escape after a focus probe** — press it twice. `anchorToTop`'s Escape is browse-mode
on the body and never reaches a real dialog's own handler. A probe's precondition is established by
*another probe*, so sequence position is part of correctness.
[Full mechanism](docs/history-2026-09.md#nvda-eats-the-first-escape-and-anchortotops-escape-does-not-test-what-you-think).

**Restore browse mode after anything that activates a control, and use `nvda.press("Escape")`, never
`perform(exitFocusMode)`.** Focus mode passes quick-nav letters straight to the page — the worst evidence
defect this project has had, invalidating 353 captures via apache.org typing its own search box full of
`FFffGGggKKkkLLll`. A one- or two-character phrase is proof of this fault, not noise.
[Full incident](docs/history-2026-09.md#focus-mode-makes-quick-nav-keys-type-themselves-into-the-page).

**A FACT STATED TWICE is this repo's most expensive recurring shape** — six hand-written hops for which
probe a case wants, two independent name-normalisers, a source file vs its compiled bundle. Fix order:
delete a copy; derive one from the other; pin them equal with a test only when duplication is forced.
[Five instances in one day](docs/history-2026-09.md#a-fact-stated-twice-and-the-copies-drifted-five-of-these-in-one-day).

Three criteria a static analyser structurally cannot reach: 2.4.1 (a skip link present but inert), 2.4.2
(the route changes, the title does not), 2.4.3 (tab order contradicts reading order — and the tab order is
a CYCLE, compare each control's first visit only).
[Full measurement traps](docs/history-2026-09.md#three-criteria-a-static-analyser-structurally-cannot-reach).

**A fix applied at ONE call site when the behaviour reaches several** is this file's most expensive
recurring shape, four instances in one investigation. **Confirm a capture-path change by its diagnostic
MARK**, never by a green result alone — a fix can be reachable and still have its trigger never set.
[Four instances](docs/history-2026-09.md#a-fix-applied-at-one-call-site-when-the-behaviour-reaches-several).

**A union and a parallel hand-written array cannot be checked by `tsc`** — derive the array from an
exhaustive `Record<TheUnion, ...>` instead, so a new member fails to compile until classified.
[The `routeChange` incident](docs/history-2026-09.md#a-list-of-fields-to-check-and-the-one-field-with-a-different-shape).

**When a comment names an ambiguity, find the signal that is NOT ambiguous** rather than resolving it by
assumption — NVDA's own "no next heading" beats inferring exhaustion from repetition or silence.
[Three examples](docs/history-2026-09.md#a-comment-that-names-an-ambiguity-above-code-that-resolves-it-by-assumption).

**Never `sleep()` a fixed duration in the capture path — wait for the real condition, polled to a
budget.** A fixed wait expiring early once recorded "the page announced nothing", indistinguishable from a
real disclosure failure. `waitForSpeechQuiet` polls until speech has settled; every remaining `sleep()` in
`capture-core.mjs` is a poll interval, never a substitute for a condition. **Verify a `.mjs` change by
importing it** (`node -e "import(...)"`) — lint and `tsc` cannot see a `ReferenceError` at import time.
[Full conversion, 18 sites](docs/history-2026-09.md#wait-for-the-condition-never-sleep-a-duration).

**The speech channel is a TLS socket, and a half-open one looks like a healthy, silent NVDA.**
`speech-channel.mjs` calls `socket.destroy(err)` to force guidepup's own (already-correct) reconnect logic
to fire — recovery in under a second instead of ~23s, without restarting NVDA (which itself risks the
modal that wedges a guest). See `docs/adr/0034-the-speech-channel-is-a-socket-forced-to-fail-loud.md` and
[the full incident](docs/history-2026-09.md#the-speech-channel-is-a-socket-and-a-dead-one-looks-exactly-like-a-healthy-nvda).

**Watch `/health.vitals.recoveries`** — a guest whose NVDA is muting can show ZERO failures while running
3x slower, because the worker's own retry absorbs every one. `npm run worker:compare <page> <worker>
<worker>` finds it by phase. A run retires a degraded worker automatically.
[The zero-failure incident](docs/history-2026-09.md#a-guest-whose-nvda-is-broken-looks-perfectly-healthy-watch-recoveries).

**`MAX_CAPTURES_PER_NVDA` stays at 25** — ~45% of instances survive to the recycle; a shorter lifespan
measured under host memory pressure does not generalise. Recovery is keyed on `capture-faults.mjs` fault
CODES, never message-text regexes. If `/health` answers but every capture 429s, the worker is *wedged*,
not dead — a hard timeout now self-recovers it. Never restart NVDA while a worker is idle.
[Full survival-curve data](docs/history-2026-09.md#what-degrades-is-nvdas-speech-channel-not-the-vm-and-it-fails-on-a-survival-curve).

## Before any corpus run: `npm run gate:stability`

Five canary pages, compared by CONTENT, fails closed. Exists because Edge's autofill silently corrupted
form-field announcements (U+FFFC) at a climbing rate (3%→31%) with every count-based check green.
**Reproduce the fault with your own test before trusting its verdict** — this was got wrong three times on
canaries that could not express the fault at all.
[The autofill incident](docs/history-2026-09.md#before-any-corpus-run-npm-run-gatestability-the-incident).

## A metric computed on data that shares the flaw cannot see the flaw

The trained heads see 29 document-level features per capture; a feature that is 0 on every training
positive of a subtype gets a free negative weight no held-out split can punish. Measured: **225 such free
vetoes across 13 heads.**

```bash
npm run corpus:starvation      # the CASE DEFINITIONS: which features will be constant? No capture needed.
npm run scorer:shortcuts       # the TRAINED WEIGHTS: which did a head penalise for free? In release:gate.
```

**The remedy is the corpus, never the weights** — a retrain on unchanged data reproduces the vetoes
faithfully. See `docs/adr/0015-one-defect-per-page-taught-the-scorer-to-veto.md` and
[the full measurement](docs/history-2026-09.md#a-metric-computed-on-data-that-shares-the-flaw-cannot-see-the-flaw).

**If a criterion needs "A and not B", compute the conjunction into ONE feature.** The heads are plain
linear layers and can only add — handing over A and B separately lets a zero fail to veto, which cost 27
false positives on 2.4.4 before the fix. **The threshold is set by the single worst negative** —
`development.precision` reading 1.000 is the selection constraint restated, not evidence; precision below
1.000 can only mean the fallback (0.5) fired. Full six-part post-mortem (the abstention-number defect
class, the announcement-order discovery, four corpus-cannot-express-real-pages instances):
[history: 2026-08-24](docs/history-2026-09.md#the-things-2026-08-24-cost-and-none-of-them-were-the-model).

**A rule can be clean because it has gone DEAF.** A stricter transcript grammar took a false-positive rate
from 71% to 6% on real pages and caught 0 of 4 corpus positives it owns — `rules:gate`'s free ground truth
(1,183 conformant records, 0 FP) is what caught it. **Run `rules:gate` after ANY change that makes a rule
quieter.** Full eleven-false-positive post-mortem (nine distinct comparison-of-different-moments bugs, all
now fixed, plus what is CORRECT and must not be "fixed"):
[history: 2026-08-25](docs/history-2026-09.md#2026-08-25-eleven-false-positives-on-real-pages-and-they-were-all-one-defect).

## The rule that cost the most to learn

**A check must never reject evidence whose absence is the finding.** A guard that rejected a probe
producing nothing (correctly, for a fake-button page with no real `<button>`) failed 44 cases in a live
run. `check-signals` already reports this correctly: BLIND when a signal cannot fire, CONTAMINATED when it
fires on both variants. `verify.corpus.test.ts` runs every gating predicate over the whole corpus and
asserts none is rejected. **A caught-and-logged error is not a handled error** — nothing reading `sweepLog`
let 604 crashes hide behind an empty-but-not-malformed field for the entire corpus.
[Both incidents in full](docs/history-2026-09.md#the-rule-that-cost-the-most-to-learn).

## Diagnosing a guest without `utmctl exec`

`utmctl exec` is known-unreliable on Windows. Use HTTP instead: `curl -s
http://<guest-ip>:8765/diagnostics | jq .` — `edgeProfile`, `processes`, `edgePolicy`, `screenReader`
(config, log, AND `previousLog` — NVDA rotates on every start), `disk`, `serverLog`.

```bash
npm run lab:job -- -e job=inventory     # the authoritative corpus state, on the box that holds it
npm run lab:inventory                   # against a local copy; it SAYS it is a copy
```

Answers: is the corpus homogeneous (with counts, not just "split"); are the exports current against the
captures they were built from; what schema is each model stamped with; is a migration open. **It reports
WHERE it read from** — a laptop said "no candidate" while the lab held one.
[Full incident, including the three-step corpus backup and why](docs/history-2026-09.md#what-state-is-the-corpus-in-labinventory).

## Housekeeping is automated — do not do it by hand

Worker VMs, the dataset page server (refcounted lease), NVDA (recycled every 25 captures) and Edge (closed
unconditionally in `finally`) all manage their own lifecycle. `A11Y_PORT` (8765), `DATASET_PAGES_PORT`
(5050) and `DATASET_BASE_URL` govern where things listen; sensible defaults, touch only on a port
collision or an unusual network. `npm run doctor` reports what it cannot fix but never kills anything.

## Producing evidence is a PIPELINE, and it is one command

```bash
npm run lab:pipeline -- --list
npm run lab:pipeline -- --pipeline=real-pages          # deploy -> capture -> rules:real-pages -> rules:coverage
npm run lab:pipeline -- --pipeline=verify --only=route-title-stale+  # PROVE a corpus change on ONE subtype first
npm run lab:pipeline -- --pipeline=full                # corpus + model + gates, proven TOGETHER
npm run lab:job -- -e job=everything                  # the same chain as ONE supervised systemd unit
```

**Prove a corpus change on one subtype before paying for the whole corpus** (~4h) — `--only=` captures
just the named cases; a trailing `+` means the case FAMILY. **One ref, resolved once, given to both
halves** — `fleet:deploy` and `lab:job` used to default independently. **It stops at the first failing
stage.** Prefer `lab:job -e job=everything` for a long unattended run — it outlives the ssh connection,
the playbook and the laptop; `lab:pipeline` is right for a short chain you want to watch live.

> **Deploy the fleet first — the job route cannot do it for you.** Only the control plane holds both
> credentials (ADR 0012); `lab:job` has no route to deploy the boxes it captures on.

**A capture refuses a fleet not running this checkout** (`assertFleetRunsThisCheckout`,
`--allow-stale-workers` to override loudly) at both capture entry points. `lab:job` also checks every
worker's `/health` over HTTP before dispatching, so a stale fleet is caught before the lab even starts the
job, not after. Full incidents (the `lab:everything`/`--pipeline=full` chains disagreeing, the corpus
holding two populations at once, the round-trip-too-late fix):
[history](docs/history-2026-09.md#producing-evidence-is-a-pipeline-the-incident-that-forced-it).

## Every other command, and when you would reach for it

`commands-documented.test.ts` enforces coverage: every npm script appears somewhere a human looks, or is
declared INTERNAL with a reason. **A command nobody can find is a command nobody runs.**

| command | when |
|---|---|
| `worktrees:prune` | after a merge: removes a linked worktree whose branch is fully merged AND clean; never the primary |
| `primary:update` | the only way to move the primary checkout — fetch, then detach at `origin/main` |
| `fleet:normalise` | bring every LOCAL UTM guest to one baseline. Bare-metal equivalent: `fleet:provision` |
| `fleet:recover` | a worker that is UP, ANSWERING and not working (wedged mid-capture) — kills node and proves the restart via `vitals.uptimeMinutes` falling |
| `guest:run` | run a script on a UTM guest elevated and get its actual output |
| `fleet:inventory-install` | puts `inventory.yml` where a `git pull` cannot delete it (it is gitignored, #54) |
| `fleet:tailscale` | put the fleet on Tailscale |
| `layers:compare` | which findings can ONLY the screen-reader layer produce — the project's central claim, demonstrated |
| `fleet:hours` | worker-hours a capture run cost, with the method emitted so a report can copy it |
| `verdict:stability` | is an OCCURRENCE verdict stable on a flaky substrate? |
| `eval:capture` | recapture the eval fixtures |
| `capture:explain` | what actually happened on a page, in sentences, from the ~30 diagnostic marks a capture already recorded |
| `rules:score` | `rules:gate` without the gate — per-criterion detail |
| `scorer:verify` | is the SHIPPED model directory free of unsafe (non-safetensors) artefact types? First stage of `release:gate` |
| `release:provenance` | do the weights about to ship have a changelog entry describing them? Second stage of `release:gate` |
| `scorer:migration` | is a schema migration open? `release:gate` refuses while one is |
| `scorer:retired-heads` | did the candidate's head set SHRINK, and is every disappearance declared? Second stage of `candidate:gate` |
| `candidate:gate` | the gate chain against a CANDIDATE rather than shipped weights |
| `promote:model` | copy trained weights into `packages/scorer/models/`, write the changeset. Refuses an uncommitted prior promotion at the target paths |
| `promote:gated` | `candidate:gate` then `promote:model` — never promotes on a failed gate |
| `training:capture:fresh` | generate pages then capture — capturing without regenerating tests the previous commit |
| `training:export:test` | export accepting captures whose page has moved, for testing without a full recapture. Never release-eligible |
| `training:build-realism` | add the real-page tier to the exported dataset |
| `training:check-signals:complete` | `check-signals` that REFUSES a partial corpus |
| `training:capture-acceptance` / `export-acceptance` / `export-acceptance:all` | the held-out set. Never cached |
| `training:evaluate-acceptance:shipped` | score the SHIPPED model from a COPY under `runs/` — `release:gate` calls this one, never the tracked-source-writing default |
| `training:train-baseline` | train without the realism tier, for comparison |
| `corpus:distribution` | is any field empty on EVERY record — the probe or exporter has stopped |
| `corpus:grants-audit` | does a multi-defect page carry the evidence its labels claim? Needs the authoritative corpus |
| `release:gate:ci` | the four `release:gate` stages a GitHub runner can prove. Not a substitute for the full lab gate |
| `scorer:shortcuts:baseline` / `:candidate` | RECORD the veto baseline against shipped/candidate weights — a deliberate act, never automatic |
| `scorer:explain-feature` | why does a feature read what it reads on a subtype's positives — definitional, a missing probe, or a thin corpus? |
| `corpus:observation-ambiguity` | how many feature zeros are capture artefacts rather than page facts? Needs the authoritative corpus |
| `corpus:container-exits` | does NVDA ever announce leaving a landmark — the fact a context feature rests on |
| `corpus:unclosable-map` / `corpus:grants-map` | emit the JS-side declarations the Python audits read; run automatically by their callers |
| `changeset:status` / `release:version` | changesets, as usual |
| `mutate` | mutation checking as a command — copies the file aside (never `git checkout --`), mutates, proves the test fails, restores, proves it passes again. Exit 0 the guard bites, 1 it did not, 2 refused before mutating, 3 restore failed |
| `board:report` | the daily board report, generated from GitHub and git, never from what an agent said. `--post --issue=<n>` publishes |
| `board:document` | the board's PDF, same data layer as `board:report`, proved output-identical |
| `board:summary-check` | is tomorrow's hand-written board summary written — comments on the report issue if not, and generates no summary text itself |

Full justification per row, with the measured incident behind each:
[history](docs/history-2026-09.md#every-other-command-the-full-justification-per-row).

## Make the failure bubble up, or you will dig for it every time

```bash
npm run lab:status -- -e job=<name>   # systemd's view, the journal, and the run's own progress file
npm run lab:log -- -e job=<name>      # the job's OWN OUTPUT, unwrapped — bytes, not YAML
npm run lab:fetch -- -e artifact=<name>   # a report, as a file
npm run lab:reset                         # what is dirty in the lab checkout, and is it safe to discard
npm run lab:reset -- -e apply=true        # discard it — ONLY files origin already has
npm run lab:collect-promotion             # fetch + install + verify all four promoted artefacts, one command
```

**Keep the name `promote:model` gave the changeset** — renaming it is how "the checkout is dirty" refusals
happen. **Audit first, then fix** — every wrong turn on one bad evening came from reasoning about a
mechanism instead of measuring the evidence; two of three "fixes" attempted would have cost a needless
62-case recapture. Full incidents:
[history](docs/history-2026-09.md#make-the-failure-bubble-up-the-incidents).

## A flag nobody reads, and an extra var nobody reads

**An argument the receiving thing does not know is DISCARDED, so the default runs and reports success** —
at two layers. Every `.mjs` CLI now calls `refuseUnknownFlags` (`cli-flags.mjs`), and `cli-flags.test.ts`
DISCOVERS every argv-reading module and requires each guarded or exempted; **ALL 54 are guarded** and the
exemption list is empty.
Every Ansible job DECLARES `params: {only: required}` beside its command, derived and checked by
`lab-job.test.ts`, not hand-maintained. **The flag/param lists are READ out of each file, never
statically derived** — some CLIs build their flag list from a variable, which a derived guard would
misread as taking none. [Full incident, including the Jinja `\b`-is-a-backspace trap](docs/history-2026-09.md#a-flag-nobody-reads-and-an-extra-var-nobody-reads).

## A guard that already existed, and a weaker check substituted for it

**A cheap pre-check decides whether to bother running the real one — never whether the real one will
pass.** Twice in one session a weaker offline check (source text instead of the real capture; memory
instead of git) was believed over the authoritative one, making a correct result read as a regression.
**Prefer the refusing form of a command over the forcing one** — `git branch -d`, not `-D` — when about to
destroy something. [Three incidents](docs/history-2026-09.md#a-guard-that-already-existed-and-a-weaker-check-substituted-for-it).

## Verifying changes

**Two of these run themselves.**

```bash
git push                      # pre-push hook: lint, typecheck, tests (~5s); full suite runs in CI on the PR
npm run release:gate          # migration -> shortcuts -> signals -> rules -> held-out acceptance -> judge quality
npm run capture:check -- --worker=http://192.168.64.4:8765    # the capture layer, ~2 min
npm run corpus:starvation        # word-sense MONOPOLY: a feature no conformant record carries
npm run scorer:size-sensitivity  # does a conformant page FAIL when padded with conformant content?
```

**Run the clean-code review on your own diff before you push** — the judgment half (does the function do
one thing, is a caught error genuinely handled) that no linter checks, and the half that has caused this
project's worst defects.

- `npm run lint` / `npm run typecheck` — must pass; CI gates on both and on `npm test`.
- **Run `npm test`, never `npx tsx --test <file>` directly, when you changed another package's source.**
  Cross-package imports resolve to `dist`; running the file runner alone tests the LAST BUILD. **And
  verify WHOSE `dist`** — a worktree's `node_modules` may symlink to the PRIMARY checkout's, so building
  your own worktree changes nothing a cross-package test reads there:
  `node -e "console.log(require.resolve('@a11y-witness/judge'))"` to check.
- **RESTORE FROM A COPY DURING A MUTATION CHECK, NEVER `git checkout --`.** It restores to HEAD and
  silently discards every uncommitted change in that file, not just the mutation — destroyed two features
  mid-build in one night. `cp <file> /tmp/x && <mutate> && <run> && cp /tmp/x <file>`, or `npm run mutate`.
  The identical defect exists in Python via `__pycache__`; `test:python` now runs with
  `PYTHONDONTWRITEBYTECODE=1 -p no:cacheprovider`.
- `npm test` — unit tests, fast, runs anywhere. `verify.corpus.test.ts` needs `runs/` and skips honestly
  in CI.
- **Pre-release, not covered by CI:** `npm run eval:gate` (judge quality) and `verify.corpus.test.ts`
  (capture gates) — both need things CI does not have (a Python venv login; `runs/`).
- `npm run eval [-- <substring>]` — judge quality against 34 fixtures, against our own scorer
  (`JUDGE_BACKEND=local`). Do not quote its numbers as a headline; see `docs/METHODOLOGY.md`.
- **`capture-core.mjs` has no local test** — after changing it, deploy, then
  `npm run capture:check -- --worker=<url>` (~2 min, over HTTP, exercises the real production path).
  **Count-based checks cannot see content rot** — assert what was HEARD, not how much; a readiness gate
  once deleted every page's h1 announcement while every count stayed green.
- `npm run identity:rate -- --worker=<url>` — does a capture ever read the wrong page? Exits 1 on any.
- `npm run evidence:check <worker>` — after any capture-pipeline change: 0 ship safely, 1 evidence
  CHANGED (bump `CAPTURE_PROTOCOL_VERSION`), 2 INCONCLUSIVE (including partial coverage, not only zero).
- `npm run training:check-signals` — proves every dataset `badSignal` fires on bad and stays silent on
  good, against captures already on disk.
- **Worker broken?** `docs/nvda-worker-runbook.md` has the error-string → real-cause table (`"NVDA not
  installed"` usually means a version mismatch). `diagnose-nvda-worker.ps1` applies it automatically.
- **No worker to hand?** `docs/getting-started.md` (~1.5–2h). CI is the ~10-minute fallback loop.

Full incident record behind every one of these (the `dist`-resolution incident, three `git checkout --`
disasters in one night, the stale-`__pycache__` Python mutation, the deleted-h1 readiness bug):
[history](docs/history-2026-09.md#verifying-changes-the-incidents-behind-the-checklist).

## Environment facts

- ESM throughout. `.ts` for the control plane, `.mjs` for the capture worker (plain Node on the VM) — see
  `docs/adr/0031-the-worker-ships-plain-mjs-with-no-build-step.md`.
- **The judge is our own trained scorer.** `JUDGE_BACKEND` defaults to `local` — 27 KB of heads over a
  frozen MiniLM encoder. `codex`/`anthropic`/`openai` remain available for comparison, never the default.
  `JUDGE_BACKEND=openai` talks plain `/v1/chat/completions`, so it also serves a local server
  (Ollama/vLLM/llama.cpp). See `packages/cli/README.md` for the consumer-facing env vars.
- Don't manually `taskkill nvda.exe` — let Guidepup own NVDA's lifecycle.
- NVDA is reused between captures (recycled every 25). `A11Y_REUSE_NVDA=0` reverts to fresh-per-capture.
- **A capture is ~12.4 s**, measured across all three guests. If you see 30s+ figures, check
  `/health.vitals.recoveries` first — that is the speech-channel fault returning, not host load.
- **`windowsActivate` (Edge starting) is the largest single phase, ~10s/~37% of a capture.** Keeping Edge
  alive between captures is the only real fix evaluated so far and is not yet built — see
  [history](docs/history-2026-09.md#environment-facts-the-fuller-record) for the two dead-end routes
  already ruled out and why.
- `npm run evidence:check` is what makes a capture-path change affordable to evaluate — SAME ships without
  invalidating the cache; CHANGED means a genuine recapture, cheapest bundled with any other pending
  `CAPTURE_PROTOCOL_VERSION` bump.
