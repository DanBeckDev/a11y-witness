# CLAUDE.md — a11y-witness

Guidance for Claude Code (and humans) working in this repo.

## What this is

a11y-witness drives a **real screen reader (NVDA)** through real navigation and uses an AI judge (via local Codex — no metered API) to assess the lived assistive-technology experience: the judgment-based WCAG failures that rule scanners miss. It sits **alongside** axe-core (the rule/visual layer), not instead of it. See `README.md`, `PLAN.md`, and `docs/adr/`.

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

Everything except capture runs natively. Capture needs a Windows worker, and there is a
scripted local one — start here: **`docs/getting-started.md`**, details in
`docs/local-worker-vm.md`.

```bash
./scripts/local-worker/worker-ctl.sh up        # start/resume the VM, wait for /health
./scripts/local-worker/worker-ctl.sh status    # state, host cost, health
./scripts/local-worker/worker-ctl.sh pause     # between runs; resume is under a second
npm run witness -- https://example.com --task "..."   # no A11Y_WORKER needed
```

With no `A11Y_WORKER` set the run finds the local VM, starts it, and **puts it back as it
found it** — so a VM you started yourself is left running. `--after stop|pause|leave`
overrides. `--no-axe` skips the optional rule layer; `--axe-results file.json` imports one you
already ran.

**Changing `capture-core.mjs` or `server.mjs` means deploying to the guest.** Push, then
**reboot the guest**, then verify over HTTP:

```bash
UUID=$(utmctl list | awk '$3=="a11y-worker"{print $1}')
utmctl file push "$UUID" 'C:\Users\witness\a11y-witness\src\capture\nvda\capture-core.mjs' < src/capture/nvda/capture-core.mjs
./scripts/local-worker/worker-ctl.sh stop && ./scripts/local-worker/worker-ctl.sh up
npm run worker:code      # every worker's /health.code vs this checkout; exits 1 if any is stale
```

**Do not restart with `utmctl exec` and believe it.** `Stop-ScheduledTask` + `Start-ScheduledTask`
silently did nothing on two cloned guests: they served the previous node process — and therefore
the previous code — for another hour. `exec` returns success and no output whether or not it ran.
Rebooting the guest always picks up a pushed file. Also note `utmctl stop --request` is sometimes
ignored outright; `worker-ctl.sh stop` uses a guest-agent shutdown and waits for it.

**Verify through `/health`, not through `exec`.** The old advice was "hash-check both sides", but
reading the guest's hash goes through `exec` too — so when `exec` is broken the check returns
*empty*, not *mismatched*, and empty reads as a flaky tool rather than a failed deploy. A
verification that shares a failure mode with the action verifies nothing. `npm run worker:code`
asks each worker over the channel it serves on, which is reachable exactly when it is usable.

**This shell is zsh.** `for U in $UUIDS` does **not** word-split a scalar — it iterates once with
the whole string, and `utmctl` answers `Virtual machine not found`, which reads like a
deregistered VM. Use literal word lists or an array.

**`utmctl` needs the UTM app running.** With UTM closed, a perfectly healthy VM reports its
state as `unknown` and the worker looks unreachable — the bundle being present makes it read
like corruption. `worker-ctl.sh` launches UTM and waits. Also: there is **one** VM and **one**
NVDA on this machine, so two shells or two agents driving the worker will see each other's
restarts as breakage. Check `worker-ctl.sh status` before concluding the guest is broken.

**`utmctl exec` and SSH land in session 0 and cannot run a capture.** Guidepup needs an
interactive desktop and reports its absence as `nvda.start failed: NVDA is not supported`,
which reads like a broken install and is not one. Run captures through a scheduled task with
`LogonType Interactive` — see the runbook.

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

The only worker states that are actually broken are: a VM **running but not answering**
`/health` (restart `a11ysrv` on that guest), and **no VM registered at all** (build or clone
one). If `doctor` says READY, the environment is fine.

It answers VM state, worker health, page server, judge backend and whether a previous run
was left mid-flight — the last one being the difference between `capture` and
`capture -- --resume`, which is hours either way if you guess wrong.

For a long run, use more than one worker. **Set nothing** — with neither `A11Y_WORKER` nor
`A11Y_WORKERS` set, a run finds every local worker VM, starts what is stopped, dispatches
cases across them, and **puts each one back as it found it**: stopped stays stopped, and a VM
you had already started is left running. Measured 1.90x on two, 2.36x on three — on a quiet host,
and **how many actually start is capped by host memory** (next section).

```bash
npm run training:capture                            # uses every local worker, releases them after
./scripts/local-worker/clone-worker.sh              # add one (handles utmctl's MAC copying)
./scripts/local-worker/worker-ctl.sh pool           # what have I got, as JSON
./scripts/local-worker/worker-ctl.sh pool-up        # start them all
./scripts/local-worker/worker-ctl.sh pool-stop      # release the lot (~13 s for three)
A11Y_WORKERS=url1,url2 npm run training:capture     # explicit pool: yours to manage, no lifecycle
```

`A11Y_WORKERS` is the escape hatch, not the normal path: naming workers means you are managing
them, so nothing is started or stopped for you. `--after stop|pause|leave` overrides the
restore behaviour.

### How many workers actually fit — the host is the constraint, not the VM count

**A worker VM costs the host ~7 GB, not the 4096 MB it is configured with.** Measured with
`top -o mem`, which agrees with `phys_footprint`: 7.0–7.6 GB per guest. The gap is QEMU's own
overhead on top of guest RAM that Windows dirties and never gives back (no balloon driver). It is
**not** accumulation — a VM sits at 6.8 GB ten minutes after boot and creeps only to ~7.6 GB over
nearly two hours.

So the pool is capped by **measured host memory**. `doctor` says so before you start:

```
OK  host memory  ~12185 MB available — room for 2 of 3 worker(s)
```

Over-committing does not merely slow a run, it **breaks captures**. With three guests up, the same
page on the same worker took **44.5 s; with one guest up, 27.4 s** — and the swapped-out guests also
produced "NVDA is running but not speaking" failures and `/health` blackouts. From outside, that reads
as *the workers are degrading*, which is exactly how it was misdiagnosed for a day. The "2.36x on
three" above was measured on a quieter host; treat it as a ceiling, not a promise.

- `A11Y_MAX_WORKERS=N` overrides the cap when you know something the measurement does not.
- Capacity is read from `vm_stat`, **never `os.freemem()`** — that reported 402 MB on a host with
  ~12 GB to give, because macOS counts compressed and inactive pages as used.
- **Your own tooling is on the same host.** `npm test`, a build, or a browser competes with the
  guests: in one 18-capture run the spikes tracked host activity, not worker age. Measure worker
  performance when you are not also doing something else, or you will diagnose the wrong machine.

For long runs, do not poll:

```bash
npm run training:wait           # blocks until the run finishes, exits with its outcome
npm run training:wait -- --json
npm run training:status -- --json   # a snapshot, with eta_minutes and next_command
```

`wait` is event-driven (it watches the progress file) and cannot hang on a dead run: if
updates go cold past one capture timeout it exits 3 rather than waiting forever. Exit codes
are the contract — **0** clean, **1** finished with failures, **2** no run, **3** wedged —
and both commands emit a `next_command` field so you do not have to infer the next step.

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

## What the screen reader drives

`docs/screenreader-coverage.md` is the map: every user behaviour we drive, the field it lands
in, and — the part that matters — **what we do not drive yet**, with the guidepup command for
each. Read it before adding a probe, and update it when you do. A behaviour missing from that
table is not a missing feature; it is a claim this project cannot currently make.

Probes beyond the default set are opt-in over the wire (`probeForms`, `probeFocus`) so a capture
never pays for evidence nobody asked for. `focusOrder` costs ~8 s on top of a ~15 s capture.

## Captures are cached — and the cache is keyed on more than the page

A full run is 1,061 pairs, so `npm run training:capture` reuses evidence on disk when nothing that
shapes it has changed. The key covers the page directory (every file), the capture options,
NVDA and Edge versions, the provisioning revision, and `CAPTURE_PROTOCOL_VERSION`.

- **`provisionRevision` reads `"unstamped"` on every current capture, and that is correct, not a
  hole.** Provisioning writes the stamp and no guest has been re-provisioned since it was added.
  `"unstamped"` is a real key value: the first guest to report a real revision changes every key it
  produces and invalidates its cache — the behaviour you want, and unit-tested. The thing to know is
  that two guests provisioned *differently* would both say `"unstamped"` and collide. Not a risk
  while they are clones of one image, but the reason to re-provision the pool together rather than
  one at a time.
- **Bump `CAPTURE_PROTOCOL_VERSION`** (`src/capture/nvda/capture-core.mjs`) when a change alters what
  the evidence *means* — a new field a signal reads, a probe that announces differently. It forces a
  full recapture; that is the point. Do **not** reach for it on a refactor.
- The worker's code hash is deliberately **not** in the key. It changes when a comment changes, and
  invalidating 1,061 pairs over a reworded comment is how a cache gets switched off. A cache hit whose
  code hash differs is logged, not hidden.
- Reuse is **per case, never per variant**: a pair is only comparable if both halves came from the
  same worker.
- **Acceptance and repeatability runs never cache.** `DATASET_KIND=acceptance` refuses it outright,
  because those runs exist to test whether NVDA's output is still stable. `--no-cache` anywhere else.

```bash
npm run training:repeat -- --url=<page> --times=5 [--probe-tables]   # is a field stable at all?
node scripts/bench-capture.mjs --from-disk                          # p50/p95 per phase, per worker
```

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

### A freshly booted worker used to fail its first capture, every time

Reproduced on two guests in one session: cold boot, capture 1 fails `NVDA is running but not speaking`,
capture 2 succeeds. Since a run **starts the workers it needs**, that cost one case per worker on most
runs — and it was invisible because the run classified it transient and quietly retried.

The worker now **retries once itself**, on a fresh screen reader, before answering the caller
(`worker-recovery.mjs`). capture-core already stops NVDA on any failure, so the retry necessarily
cold-starts a clean one — the same work it was going to do on the next request; the only change is who
pays for it. It is bounded at one extra attempt and only ever follows a real fault, which is what
separates it from the idle warm-up loop that broke the pool. The hard timeout is excluded: it has
already spent its whole budget, so the run reissues that one instead.

`/health.vitals` now reports `uptimeMinutes`, `freeMemoryMb`, `captures`, `failures` and
**`recoveries`**. Watch `recoveries`: it counts faults the worker papered over, so a guest that is
degrading shows up there while every capture still succeeds.

### What degrades is NVDA's speech channel, not the VM — and it fails on a survival curve

NVDA can stop speaking while still answering keystrokes. It is **stochastic, not a counter**, and the
rate depends on how loaded the host is. Two datasets, and the difference between them is the point.

**The corpus — 1,939 captures carrying a reuse counter, across real dataset runs:**

```
reuse count:  2-5   6-10  11-15  16-20  21-24   25
captures:     480   460    382    321    242    54     nvdaRecycle fired 51 times
```

That is a survival curve — about 120 NVDA instances per count early on, ~54 reaching 25 — so roughly
**45% of instances do survive to the `MAX_CAPTURES_PER_NVDA = 25` recycle**, and the recycle is live
code, not dead. (`screenReaderMute` appears in 0 captures on disk because a mute *throws*, so it is
never written. Absence there is not evidence.)

**A tight loop on a memory-pressured host — 30 back-to-back captures of one page:**

```
1 2 3 4 5 [6] 7 8 9 10 [11] 12 13 14 15 [16] ... [25] [26]
lifespans: 6, 5, 5, 9, 1     30/30 succeeded, 5 recoveries, 0 failures
```

**Do not generalise from the second dataset — an earlier version of this section did, claiming NVDA
"dies about every 5 captures" and that the 25-recycle "never fires". The corpus refutes both.** Those
lifespans are the low tail, measured while the host was swapping and one page was being hammered at
maximum rate. The plausible reading — consistent with both datasets but **not proven** — is that a
short NVDA lifespan is itself a *symptom* of host memory pressure, which would mean the capacity cap
above reduces mute frequency as a side effect. Worth testing on a quiet host before anyone relies on it.

What follows for the constant: **leave `MAX_CAPTURES_PER_NVDA` at 25.** Lowering it to ~4 would force a
~23 s recycle on the ~45% of instances that would otherwise run to 25 — a net loss. The earlier estimate
that this was "worth ~9 s per capture" came from the unrepresentative loop.

Reuse is nonetheless causal: with `reuseScreenReader:false`, **8 of 8 captures ran clean with no mute at
all** — but a fresh NVDA per capture costs ~48 s against ~25 s reused, because stopping and starting
NVDA is most of the difference. So reuse stays, and the retry below is what makes it *correct*.

A mute **used** to cost ~150 s to recover, because a silent NVDA answers all 150 advances with nothing
and the read-through was then retried in full — 300 wasted round trips before
`failIfScreenReaderIsMute` even ran. The read now stops after `MAX_SILENT_STEPS` (8) consecutive silent
advances, and `readWithRetry` refuses to re-read a screen reader already found silent.

**That rule needs two signals, and the reason is asymmetry.** An empty read is unremarkable on its own
(the warning at the top of capture-core says so), so silence only ends a read when NVDA *also* said
nothing at startup AND nothing substantive has been heard yet. When NVDA spoke at startup the branch is
unreachable and a read-through behaves exactly as before. Getting this wrong would silently *shorten*
transcripts, which is the evidence rot that once deleted the h1 announcement from 90 captures while
every check stayed green — hence `read-through.test.ts`, whose first assertion is that 40 consecutive
empty reads on a healthy capture change nothing.

### Recovery is keyed on fault CODES, never on message text

`capture-faults.mjs` defines `FAULT.SCREEN_READER_MUTE` and `FAULT.SCREEN_READER_START_FAILED`;
`captureFault()` attaches one to the thrown Error, the worker returns it as `fault` in the 500 body, and
both `worker-recovery.mjs` (guest) and `capture-decisions.mjs` (host) match on it.

This replaced a regex over `error.message`, which was a check that could not discriminate: reword the
message in capture-core and recovery stops working in production, while the unit tests keep passing
because the string they assert on lives in the test file rather than at the throw site. The tests now
drive the real gate — `failIfScreenReaderIsMute` is exported for exactly that.

Two references argue the same point, and they are worth reading before adding another string match:
*Secure by Design* §9.2.2 ("Designing for failures") — model expected domain failures as explicit
results, not exceptions to be parsed; and *The Product-Minded Engineer* ("Repackage Errors") — make
errors programmable through specific types and structured metadata "rather than forcing callers to
parse messages". A mute NVDA recurs often enough across a run — ~55% of NVDA instances die before
their recycle — to be an expected domain failure rather than an exception.

`fault` on the wire is **additive**: an older host ignores it and keeps matching text, so the host and
guest can be deployed independently.

### "The worker is dead" is usually a wedge, not a death

If `/health` answers but **every capture returns 429 `a capture is already in progress`**, the worker
is *wedged*, not dead: a previous capture hung, so `busy` was never released. This cost two days of
misdiagnosis — bad clones, a stub NVDA install, guest-agent failures — because from outside it is
indistinguishable from a dead machine. A hard capture timeout now abandons the hung capture, releases
`busy`, and cold-starts NVDA, so it recovers on its own.

**What put it there: restarting NVDA repeatedly.** NVDA responds to that with a modal dialog on the
guest desktop — `nvdaHelperRemote (injection_terminate): Error waiting for local thread to die` — and
a modal dialog blocks input, so the next capture hangs. One guest took QEMU down with it. Hence the
rule: **nothing may restart NVDA while a worker is idle.** Warm-up happens once at boot; after that
NVDA is the capture's business, and `startScreenReader` already cold-starts a dead one. If you find
yourself adding a health-driven NVDA restart, this is the loop you are rebuilding.

Two related facts worth not rediscovering:

- **`utmctl exec` and `file pull` need the guest's logged-on session.** They fail before auto-logon
  completes and work afterwards, which is one cause for two symptoms — not a broken guest agent. If
  `exec` is silent, the guest has not finished logging on; wait rather than diagnose.
- **`server.log` persists on the guest.** You cannot pull it while the worker is down (see above), so
  read it *after* it recovers — the record of the death is still there.

## The rule that cost the most to learn

**A check must never reject evidence whose absence is the finding.**

The worked example: `custom-control` bad pages are div-based fake buttons with no `<button>`, so NVDA
finds no form controls. That absence *is* the 4.1.2 failure the case demonstrates. A guard that
rejected captures whose requested probe produced nothing therefore threw away the evidence, failed 44
cases in a live run, and added hours to it — after being validated on six hand-picked cases, none of
them from that family.

Whether an empty probe is malfunction or evidence depends on the **case definition**, which
`check-signals` can see and the capture layer cannot. So gating belongs there, and it already reports
it better: BLIND when a signal cannot fire, CONTAMINATED when it fires on both variants.

**Prove it before you ship it.** `npm test` includes `verify.corpus.test.ts`, which runs every gating
predicate over every capture on disk and asserts none is rejected. The corpus is free ground truth —
`check-signals` scores it 1061/0/0, so a rejection is a false positive by construction. It runs in a
second. Six cases is an anecdote; 2,122 is a test.

## Verifying changes

Verification is layered; pick the layers your change touches:
- `npm run lint` and `npm run typecheck` — must pass. **CI gates on both**, and on `npm test`
  (`.github/workflows/lint.yml`).
- `npm test` — unit tests (`src/**/*.test.ts`) covering the deterministic rules, the judge layers,
  eval fitness, the capture cache, the run's accept/reject/retry decisions, and the WCAG criteria
  list. Fast and runs anywhere, so there is no reason to skip it.
  - `verify.corpus.test.ts` needs `runs/` and **skips honestly in CI**, which cannot see it —
    the same limitation `npm run eval` has. Run it locally before shipping a change to any gate.
  Most of this codebase genuinely cannot be unit-tested — capture needs real NVDA on Windows —
  but the pure functions can be, and these are them. Add to them when you touch a pure function.
- **Pre-release, and not covered by CI:** `npm run eval:gate` for judge quality, and
  `verify.corpus.test.ts` for the capture gates. Neither can run in CI — eval needs a local Codex
  login, the corpus test needs `runs/`. Note also that `capture-regression.yml` is path-filtered to
  `src/capture/**`, so it does **not** fire for changes under `src/training/**` — which is exactly
  where the guard bug above lived.
- `npm run eval [-- <substring>]` — judge quality against 34 labelled fixtures. Needs a local Codex login, so it **cannot run in CI**; run it when you touch the judge, prompts, criteria, or fixtures. Do **not** quote its numbers as a headline: `docs/METHODOLOGY.md` records that the guards were tuned against these cases, scoring is single-run, and there is no expert baseline yet. Report with those caveats or not at all.
- **`src/capture/nvda/capture-core.mjs` only runs against NVDA on the Windows VM** — it has no local test. After changing it, deploy (above) and run `src/capture/nvda/capture-check.mjs` **in the interactive session**, then `scripts/bench-capture.mjs` if you touched timing. capture-check refuses to run while the worker is serving, because NVDA is one machine-wide resource and two drivers stop each other's screen reader; stop the worker first and **restart it afterwards**. The VM capture is its test; the book's own rule is "refactor under test."
- **Count-based checks cannot see content rot — assert what was heard, not how much.** capture-check now gates on probe *values* (`disclosure-good` must reach `expanded`, `disclosure-bad` must stay `collapsed`) and on the read-through still carrying roles, because both lessons were learned the hard way. A readiness gate once overwrote the first line of every page with the document title, deleting the h1's `"heading, level 1, ..."` announcement everywhere: `"heading, level N"` phrases fell from 105 to 15 across 90 captures and **every check stayed green**, because the phrase count had not moved. If you change capture, compare evidence quality against a previous run, not just line counts.
- `npm run training:check-signals` — proves every dataset `badSignal` fires on the bad page and stays silent on the good one, against captures already on disk (no worker needed). Run it after ANY change to a probe's output shape: a probe and its signal are coupled, and 8 cases once went silently blind when a probe changed. `npm run training:status` reports a long capture run; `--resume` picks up where one stopped.
- **Worker broken? Don't debug from first principles** — `docs/nvda-worker-runbook.md` has the error-string → real-cause table (the messages are misleading: `"NVDA not installed"` usually means a version mismatch, not a missing install), and `scripts/diagnose-nvda-worker.ps1` applies it automatically. `scripts/provision-nvda-worker.ps1` is the idempotent repair.
- **No worker to hand?** Build one: `docs/getting-started.md` (~1.5–2 h, almost all of it downloading Windows). Validating capture changes through CI is a ~10-minute loop and should be the fallback, not the habit.

## Environment facts
- ESM throughout (`"type": "module"`). `.ts` for the control plane, `.mjs` for the capture worker (it runs under plain Node on the VM).
- The judge runs via the **Codex CLI** (subscription login), never the metered Anthropic API.
- Don't manually `taskkill nvda.exe` — let Guidepup own NVDA's lifecycle, or the speech-capture channel destabilises. Killing the worker with `Stop-Process` orphans its NVDA (still holding port 6837); the next cold start recovers, but expect to see it.
- The worker keeps NVDA alive between captures (recycled every 25). `A11Y_REUSE_NVDA=0` reverts to a fresh NVDA per capture — the first thing to try if captures drift as a run progresses.
- The guest is provisioned as an **appliance**: Windows Update may install but not reboot, and Edge's background mode, startup boost and auto-updater are off. It used to reboot itself mid-run and leak Edge processes.
- A capture is ~13–19 s **on an unloaded host**; measured at **27 s with one guest up and 45 s with
  three** on a busy 36 GB Mac. Quote the host state with the number or the number means nothing. A
  full 45-pair dataset run is ~25 min. If it is much slower, check `scripts/bench-capture.mjs` phase
  timings before optimising anything.
- **The largest single phase is `windowsActivate`, at ~10 s, and it is Edge starting.** Edge is
  launched *and quit* for every capture, so its cold start is on the critical path every time —
  `waitedMs: 10784` against an 800 ms settle, i.e. ~10 s waiting for a window to exist. That is ~37%
  of a capture. Two things would remove it, and **both force a full recapture**, so neither is a
  casual change: keeping Edge alive between captures (changes how the page is navigated, so it changes
  what is announced — needs a `CAPTURE_PROTOCOL_VERSION` bump), or re-enabling Edge's startup boost
  (needs re-provisioning, which stamps `provisionRevision` and invalidates every cache key). Startup
  boost was disabled because failed captures leaked Edge processes; unconditional cleanup in
  `captureWithNvda`'s `finally` has since fixed that leak, so the original reason may no longer hold —
  measure it before deciding.
