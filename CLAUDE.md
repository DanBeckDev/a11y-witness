# CLAUDE.md — a11y-witness

Guidance for Claude Code (and humans) working in this repo.

## What this is

a11y-witness drives a **real screen reader (NVDA)** through real navigation and uses **our own trained scorer** (`judge-backend: local`, the default everywhere — no rented LLM, no metered API) to assess the lived assistive-technology experience: the judgment-based WCAG failures that rule scanners miss. It sits **alongside** axe-core (the rule/visual layer), not instead of it. See `README.md`, `PLAN.md`, and `docs/adr/`.

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
npm run worker:ctl -- up        # start/resume the VM, wait for /health
npm run worker:ctl -- status    # state, host cost, health
npm run worker:ctl -- pause     # see below: UTM cannot actually suspend these guests
npm run witness -- https://example.com --task "..."   # no A11Y_WORKER needed
```

With no `A11Y_WORKER` set the run finds the local VM, starts it, and **puts it back as it
found it** — so a VM you started yourself is left running. `--after stop|pause|leave`
overrides. `--no-axe` skips the optional rule layer; `--axe-results file.json` imports one you
already ran.

**Changing any worker file means deploying to the guests. One command:**

```bash
npm run worker:deploy                     # every local worker, one at a time
npm run worker:deploy -- --vm=a11y-worker-2
npm run worker:code                       # each worker's /health.code vs this checkout
```

It pushes **every hashed file** (13 now, defined once in `src/capture/nvda/worker-files.mjs` — the
list used to be duplicated in `server.mjs` and `check-worker-code.mjs` with a third derived by regex in the
deploy script), reboots each guest — mandatory, because
`utmctl exec` cannot be trusted to restart the worker — and verifies `/health.code` over HTTP, which
shares no failure mode with the push. Then it puts each VM back in the state it found it.

Doing this by hand is how two guests once served stale code for an hour, and pushing a subset leaves a
guest running a mix with no clue which file is wrong. **Roll back** by checking out the ref you want and
running it again; git is the source of truth, so there is no bespoke backup to go stale.

> **`worker:deploy` refuses a `CAPTURE_PROTOCOL_VERSION` change** unless you pass
> `--allow-protocol-change`. That value is a capture-cache key: deploying a bump invalidates all 2,122
> cached captures and forces a full recapture. Note the trap it guards — an *uncommitted* bump makes
> `worker:code` report every worker STALE because the LOCAL hash moved, and "redeploy" would then ship
> the bump and wipe the cache for no reason. `worker:code` says so when it applies.

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
packages/worker-fleet/src/local-worker/clone-worker.sh              # add one (handles utmctl's MAC copying)
npm run worker:ctl -- pool           # what have I got, as JSON
npm run worker:ctl -- pool-up        # start them all
npm run worker:ctl -- pool-stop      # release the lot (~13 s for three)
A11Y_WORKERS=url1,url2 npm run training:capture     # explicit pool: yours to manage, no lifecycle
```

`A11Y_WORKERS` is the escape hatch, not the normal path: naming workers means you are managing
them, so nothing is started or stopped for you. `--after stop|pause|leave` overrides the
restore behaviour.

### UPDATE: three workers now scale, and the negative-scaling section below is out of date

Measured on a real full recapture — 2,122 captures, all three guests, one run:

| | measured |
|---|---|
| wall clock | **3 h 46 m** (13,541 s) |
| throughput | **0.157 captures/s** — more than 2x the 0.072 recorded below for three workers |
| failures | **0** of 1,061 cases |
| recoveries / evictions | 0 / 0 |
| swapouts during the run | **+0** (delta, not the since-boot counter) |
| host memory | 405 MB unused at peak, 1,273 MB compressor, no thrash |

So the table below is a measurement of a pipeline that no longer exists. The plausible causes of the
change are the two fixes made since: `ensureSpeechChannel`'s probe (which took the pool from
36.7/42.0/93.7 s medians to ~12.4 s) and browser reuse being turned on by default (`windowsActivate`
8.9 s → 3.6 s), both of which removed exactly the per-capture work that was contending on the SSD.

Two cautions before anyone deletes the section below. This is **one** run, not an interleaved comparison
against one and two workers, so it establishes that three workers now work — not the shape of the curve.
And take the swap delta seriously as the reason it worked: `vm_stat`'s counters are since-boot, so a
baseline before the run is the only way to tell "the host swapped" from "the host swapped hours ago".

### The pool scales NEGATIVELY, and the cause is disk, not memory

Measured end to end on this Mac, same page, interleaved rounds:

| workers | median per capture | throughput |
|---|---|---|
| 1 | 12.6 s | **0.079 captures/s** |
| 2 | 26.3 s | 0.076 captures/s |
| 3 | 41.5 s | 0.072 captures/s |

**Adding workers made throughput worse.** The cause is visible in one phase: `windowsActivate` — really
"wait for Edge to exist and take focus" — is 8.9 s of a 12.6 s capture with one guest, and inflated to
~15.2 s on **all three guests uniformly** when three ran, including the two with zero recoveries.

Uniform inflation across independent guests is the signature of a **shared resource**, and it is the
SSD. Every capture spawned Edge with a dedicated `--user-data-dir`, so there was no instance to hand
off to and that process *was* Chromium — a full cold start, every capture. Worse, each guest has its
own 25 GB qcow2, so three guests read the *same* Chromium binaries from *three different files* and the
host page cache cannot dedupe them.

Two fixes, in order of value:

- **Keep Edge alive and re-point it** (ON by default; `A11Y_REUSE_BROWSER=0` reverts. See
  `browser-session.mjs`). Navigates the
  existing window over the DevTools Protocol. Measured `windowsActivate` 8.9 s → **3.6 s**. This removes
  the reads rather than making them faster.
- **A shared qcow2 backing file** — one read-only base plus copy-on-write overlays — so the host caches
  the common bytes once. Structural, and only worth the risk if parallelism is still needed after reuse.

**Do not reach for guest RAM to fix this.** An afternoon went into right-sizing memory before anyone
measured the disk, and none of it addressed the bottleneck.

### Measure the FOUNDATIONS, not just wall time

`worker:compare` now reports load, disk MB/s and tps, guest **resident** memory, free vs compressed, and
pageouts during the run. Use them. Every wrong turn in the day above came from a timing number with no
foundation underneath it: the cause was attributed to memory, then to the guests, then to contention in
the abstract, before anyone sampled the disk that was actually saturated.

**`phys_footprint` and RSS agree when the host has room, and diverge exactly when you most need them.**
A 3072 MB guest costs **~5.7 GB resident** unconstrained (RSS 5,734 MB vs footprint 5,705 MB — the same
number). Run three, and RSS per guest falls to ~1.3 GB with 7.8 GB in the compressor. That low reading
is **the symptom of over-commitment, not evidence that guests are cheap** — a mistake made here, acted
on, and retracted. Take the per-guest figure with **one guest running**, or it will lie to you.

Paging must be read as a **delta**: the counters are since-boot, so 6.6 GB of swap left from an incident
hours earlier is indistinguishable from a host swapping right now.

### `pause` does not work on these guests, and quitting UTM kills them

UTM refuses to suspend a VM with an emulated NVMe device, which is what these guests boot from:

> Failed to save VM snapshot. Usually this means at least one device does not support snapshots.
> Suspend is not supported when an emulated NVMe device is active. **Quitting UTM will kill all
> running VMs.**

So `worker-ctl.sh pause` is not the cheap resume this file used to advertise — **stop/start is the only
real lifecycle**, and a cold boot to `ready` is ~15-42 s, which is fine.

The second sentence matters more. **Stop every running guest before quitting UTM**, which you must do to
edit a VM's configuration since UTM caches configs in memory. Quitting with a guest up hard powers it
off, and a dirty Windows guest is exactly the state that took an afternoon to recover from once already.

### How many workers actually fit — the host is the constraint, not the VM count

**A worker VM costs the host ~8 GB, not the 4096 MB it is configured with.** Measured with
`top -o mem`, which agrees with `phys_footprint`: **8,048–8,127 MB** per guest. The gap is QEMU's own
overhead on top of guest RAM that Windows dirties and never gives back (no balloon driver). It is
**not** accumulation — a VM sits at 6.8 GB ten minutes after boot and creeps to ~8.1 GB over roughly
two hours.

**Three guests do not fit on a 36 GB Mac.** 3 × 8.1 GB is 24.3 GB, and an ordinary desktop is already
holding ~11 GB before a run starts. That is 35.3 GB of 36, which is not a tight fit, it is 6.6 GB of
swap. (This section said "~7 GB" for a long time; 7,600 was an underestimate from a shorter sample,
and it was the number the cap was computed from.)

So the pool is capped by **measured host memory**. `doctor` says so before you start:

```
OK  host memory  ~14157 MB available — room for 2 of 3 worker(s)
```

Over-committing does not merely slow a run, it **breaks captures**. With three guests up, the same
page on the same worker took **44.5 s; with one guest up, 27.4 s** — and the swapped-out guests also
produced "NVDA is running but not speaking" failures and `/health` blackouts. From outside, that reads
as *the workers are degrading*, which is exactly how it was misdiagnosed for a day. The "2.36x on
three" above was measured on a quieter host; treat it as a ceiling, not a promise.

**A running worker is not automatically an affordable one, and the cap used to assume it was.**
`workersHostCanRun` returned `alreadyRunning + canStart`, on the reasoning that a guest already up has
paid for its memory and `availableMb` is what is left after it. True of a healthy host; false in the
only case the cap exists for. The result could never be *lower* than the number of VMs already
running, so a pool somebody had already started was structurally beyond its reach — which is how three
guests came to share this Mac, drive 6.6 GB of swap, and starve two of the three until they stopped
answering `/health` within 75 s while the third stayed perfectly healthy. **Two of three workers dead
and one fine is the signature of host over-commitment, not of two broken guests.** The cap may now
return fewer workers than are running; the run simply dispatches to a subset.

- `A11Y_MAX_WORKERS=N` overrides the cap when you know something the measurement does not.
- Capacity is read from `vm_stat`, **never `os.freemem()`** — that reported 402 MB on a host with
  ~12 GB to give, because macOS counts compressed and inactive pages as used.
- **But `vm_stat` is distorted by exactly the condition it must detect,** so it is not trusted alone.
  A swapped-out guest's pages are counted as compressed/inactive — which `availableHostMemoryMb`
  reports as *available* — so the estimate rises as the host gets sicker: it advertised 13.7 GB free
  while two guests were starving. The cap is therefore the lower of that estimate and a ceiling
  derived from **physical RAM**, which no feedback loop can move.
- **`top -o mem` and RSS disagree, and RSS is the one that lies.** A starved guest showed `rss=0.4GB`
  while its `phys_footprint` was 8.1 GB, because its pages were in swap. Read the footprint, or you
  will conclude a VM is idle when it is dying.

### Memory is not the only reason to run fewer guests — a second guest costs reliability

Measured with `worker:compare`, same guests, same page, on a 14-core M4 Max that was **not** swapping
(`pageouts +0`) and **not** CPU-bound (load 8.4 of 14):

| | median | IQR | max | recoveries |
|---|---|---|---|---|
| one guest running | **23.4 s** | **3.0** | 25.1 s | **0/10** |
| two guests running | 35.1 / 35.3 s | 17.9 / 38.2 | 107 s | 3/14 |

Both guests degrade about equally, so this is not one poisoning the other. And `compare-workers.mjs`
captures **sequentially** — one capture in flight at a time — so it is not concurrent capture load
either. The mere presence of a second running guest halves the reliability and adds 50% to the median.

**Do not reach for host specs to explain this.** It is not RAM, not cores, not swap; that was checked
first and each was ruled out by measurement. The likely mechanism is that guidepup's speech capture is
governed by wall-clock timeouts — `SPEAK_DEBOUNCE_TIMEOUT` and `CANCEL_NOT_FIRE_TIMEOUT`, both
**1000 ms** in `NVDAClient.js` — so a vCPU descheduled past one second loses the phrase, and a late
phrase is indistinguishable from a dead channel. Inferred from the source, not proven.

The consequence for throughput is smaller than it looks: two workers at a 35 s median beat one worker
at 23 s only slightly, and they fail far more. If a run must be reliable, prefer one.
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
NVDA and Edge versions, **the Windows build and architecture**, the provisioning revision, and
`CAPTURE_PROTOCOL_VERSION`.

- **The OS is in the key because a fleet can have more than one image.** Without it, a capture from an
  ARM64 guest on a developer's Mac and one from an x64 guest on a server are, to the cache, the same
  evidence — so the two blend into one corpus indistinguishably. Whether NVDA announces identically
  across two images is exactly what `npm run evidence:check` answers, and until it has for a given
  pair, the cache must not assume it. `provisionRevision` is an additional guard: older guests that
  have not been re-provisioned still report `"unstamped"`, while the current worker resolves the
  stamp from its checkout rather than assuming a Windows username.
- **Adding `os` to the key invalidated every capture stamped before it**, because `provenance.cacheKey`
  is compared literally. One full recapture pays that off, once; after that caching works normally.
  That is the unavoidable cost of any key change — do them deliberately, and ideally alongside a
  recapture that was happening anyway.

- **`provisionRevision` is stamped by provisioning and read from the guest checkout.** Existing
  guests created before the stamp was introduced report `"unstamped"` until the next deliberate
  redeploy/re-provision. That value is still a real cache key: the first guest to report a real
  revision changes every key it produces and invalidates its cache — the behaviour you want, and
  unit-tested. Re-provision the pool together rather than one at a time so two differently prepared
  guests cannot silently share an `"unstamped"` key.
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

### guidepup is pinned at 0.31.0, and the version is EVIDENCE

`guidepup` parses NVDA's speech before this project ever sees it, so its version changes what a capture
says. Upgrading 0.29.2 → 0.31.0 fixed an intermittent OBJECT REPLACEMENT CHARACTER (U+FFFC) that had
been appended to form-field announcements at 3–31% of affected captures for weeks — measured 1 in 15
before, **0 in 15 after**. See `docs/ufffc-investigation.md`, including the seven theories that were
wrong so nobody re-runs them.

Consequences, all of which are now enforced:

- **`guidepupVersion` is in the cache key** (`capture-cache.mjs`) and in the fleet-consistency check
  (`fleet-consistency.mjs`). Two guests on different versions produce different evidence and must never
  share a cache entry. During the upgrade itself the fleet was briefly split, and nothing noticed.
- **0.29 was hiding a bug.** 0.31 throws when `start()` is called on a live NVDA; 0.29 tolerated it. That
  masked real state drift — `screenReader.running` disagrees with reality whenever
  `screenReaderResponds()` misses the Remote port for an instant. A running NVDA is now *adopted*.
- **0.30+ writes a SESSION config** (`sessionUserConfig/nvda.ini`) beside the base one. Anything that
  assumes a single `nvda.ini` is wrong.
- **0.30 added a settings API** — `start({settings})`, `getSettings()`, `getSetting('section.key')`.
  `/diagnostics` reports the effective settings. **Record them; do not tune them.** NVDA's defaults are
  what a real user experiences, so configuring away from them makes the evidence less representative.

Upgrading guidepup is an evidence change: run `npm run evidence:check` and expect a recapture.

### Focus mode makes quick-nav keys TYPE THEMSELVES INTO THE PAGE

The worst evidence defect this project has had, and it ran for 2,122 captures with every check green.

NVDA has two modes. In **browse mode** single letters are navigation commands (`h` heading, `k` link, `f`
form field, `g` graphic, `l` list). In **focus mode** they are passed to the application — so they are
typed into whatever has focus. From `browseMode.py`, not inference:

- `autoPassThroughOnFocusChange = boolean(default=true)` in `configSpec.py`, and `shouldPassThrough`
  returns True for `State.EDITABLE`. So a focus change into an editable control switches focus mode ON.
- `reason == OutputReason.QUICKNAV: return False` — quick-nav itself never switches it on. **Activating a
  control does**, because that is a real focus change: an accessible form moves focus to the field it
  rejected, a disclosure moves it into what it opened.
- It STICKS. `QuickNavItem.moveTo` returns early, still in focus mode, whenever the next target is
  focusable.

So every sweep after an activation typed its own commands into the page under test. Decoded from
apache.org's search box, which is how this was finally proved:

```
FFffGGggKKkkLLll  =  Shift+F,Shift+F,f,f   Shift+G,…,g,g   Shift+K,…,k,k   Shift+L,…,l,l
                     formField prev/next   graphic         link            list
```

apache.org search-as-you-typed it, rendered "1 result for FFffGGggKKkkLLll", and this tool read that as a
page behaviour and reported a WCAG 3.3.1 failure. The finding was our own keystrokes.

**Measured cost on the corpus this invalidated:** 353 captures activated a control and then found 0 links,
0 graphics and 0 lists. And 125 pairs carried the artefact on **exactly one variant, never both** — always
the conformant one, since only an accessible form focuses the field it rejected. That is a pair differing
by the measuring tool, the U+FFFC lesson again, and worse here because the artefact **correlates with the
property under test** and is therefore a shortcut feature available to the trained scorer. All 125 are
`form-error-*`; retrain after recapturing.

Rules that follow:

- **Restore browse mode after anything that activates a control**, and do not trust one remedy. Escape is
  NVDA's own route out (`script_disablePassThrough`, flagged `ignoreTreeInterceptorPassThrough` so it is
  reachable from focus mode), and it was **not enough on apache.org**, whose search panel behaves like an
  embedded document and needs `NVDA+Ctrl+Space`. The sweep detects the echo and escalates.
- **`nvda.press("Escape")`, never `nvda.perform(keyboardCommands.exitFocusMode)`.** Both are Escape on
  paper; only `press` worked, measured. `anchorToTop` has used `press` for this since long before anyone
  understood why.
- **A one- or two-character phrase is proof of this fault, not noise.** `MIN_CONTROL_NAME_LEN = 3` silently
  skipped it with a comment calling it a "stray key echo" — the symptom was named and never diagnosed. The
  sweep now reports `stopPhrase`, so `found=0 stop=repeat` (which says only "nothing") became
  `stopPhrase: "k"` (which says everything). An unrecoverable sweep stops as `focusModeStuck`, because
  "this page has no links" and "we could not ask" must never be the same evidence.
- **`anchorToTop`'s comment already documented all of this.** The remedy was applied only to the
  post-submit re-read, which is exactly why that was the one sweep that never broke. When a comment names
  a browser or screen-reader behaviour, check every path that behaviour can reach.

### A fix applied at ONE call site when the behaviour reaches several

Three defects in this file share one shape, and it is worth naming so the next one is caught by pattern:

| the behaviour | where the remedy was | where it was missing |
|---|---|---|
| focus mode makes quick-nav keys type themselves | `anchorToTop`, before the post-submit re-read | every sweep after an activation — 353 captures |
| guidepup 0.31 throws on `start()` of a live NVDA | `startScreenReader`'s catch, which adopts it | `ensureSpeechChannel`'s restart, which called `startFreshWithRetry` directly |
| speech must be settled before a delta baseline is read | `waitForAnnouncement`, at the END of the delta | the START — late speech credited to the activation |

Each remedy was correct, commented, and reachable from only one of the paths that needed it. In two of
the three cases the comment at the working call site **already described the behaviour**, so the knowledge
was present and the coverage was not.

The `ensureSpeechChannel` one is the most instructive because of how it presented: every capture returned
`500 {"error":"NVDA is already running","fault":null}` while `/health` reported `ready: true` with all
four checks green, `failures: 35` against `captures: 24`, and `gate:stability` degrading 5/5 → 3/5 → 0/5
on unchanged pages. That reads exactly like the pages going nondeterministic. **The bare message and the
null fault are what identified it**: `startScreenReader` prefixes its failures with `"nvda.start failed:"`
and attaches a fault code, so an error with neither cannot have come from there.

**When you find a screen-reader behaviour worth a comment, grep every path that can reach it.** Lint and
`tsc` cannot see this — it is `.mjs` and the paths are unrelated functions.

### Two blind spots let a 1-in-125 contaminant into the corpus

`gate:stability` reported every canary stable while one capture of `filter-status-silent/bad` recorded
`after: "Energy results, document"` instead of the empty delta that IS the finding. Two independent gaps,
both over the same field:

- **`repeat-capture` compared ten fields and not `formChanges` or `postSubmitFields`** — the two carrying
  interaction evidence. Ten fields watched, and the ones this fault lives in were not among them.
- **`repeat-capture` had no `--probe-forms` and no `--task`**, so it could not activate a control at all.
  Every canary exercised only the disclosure probe, which runs unconditionally; 3.3.1 and 4.1.3 were
  structurally unreachable.

Both are fixed, and the sixth canary is now the exact page the fault occurred on. Note the trap that
required refusing a flag combination: `--probe-forms` with no `--task` activates nothing, so it compares
an empty field five times and reports it stable — a count-based check in a new costume.

### Wait for the condition, never `sleep` a duration

The capture path had 18 bare `sleep()` calls against 3 polling loops, and one of them caused the worst
defect this project has had: a fixed wait expired early, the probe timed out, and the miss was recorded
as **"the page announced nothing"** — which is precisely the signature of a non-conformant disclosure. 1
in 20 captures of a CORRECTLY implemented page was indistinguishable from a broken one. That does not
add noise, it **inverts the finding**.

A fixed sleep is wrong in both directions: too long in the common case, and too short in the tail where
being wrong destroys evidence rather than merely costing time.

**guidepup does NOT wait for speech to settle, and this file said it did.** The claim used to be that
`enqueueAndTap` resolves only after a quiet period, so `nvda.perform()` returning meant speech had
settled and sleeping on top of it was waiting twice. That is true only for `{capture: true}`. This
project calls `nvda.start()` with no options, so it gets `DEFAULT_CAPTURE = "initial"`, and in that mode
`#processQueue` resolves on the FIRST spoken phrase:

```js
const speakHandler = (spokenPhrase) => {
  spokenPhrases.push(spokenPhrase);
  if ((options?.capture ?? this.#capture) === "initial") {
    clearTimeout(timeoutId); speakPromiseResolver();      // <- returns on the first phrase
  } else { timeoutId = setTimeout(timeoutHandler, SPEAK_DEBOUNCE_TIMEOUT); }
};
```

So later utterances of the SAME announcement can still be in flight when a keystroke returns, and the
settle sleeps were load-bearing rather than redundant — which is why deleting them broke things and why
the wrong claim survived so long. guidepup's own docs say it: "By default the `capture` option is set to
`"initial"` … for full capture set `{capture: true}`."

`{capture: true}` is not a free upgrade: it changes every log entry from the first phrase to all phrases
joined with ". ", which is an evidence change and a full recapture. So the fix is to wait for the real
condition instead — `waitForSpeechQuiet` polls `spokenPhraseLog` until it has been unchanged for
`SPEECH_QUIET_WINDOW_MS`, bounded by a budget, and reports `quiet: false` rather than pretending.

Converted so far, ~5.4 s per capture:

| site | was | now |
|---|---|---|
| cold-start readiness | 3000 ms | poll until NVDA's Remote port answers |
| `probeDisclosure` after `act()` | 1200 ms | `waitForAnnouncement` — wait for speech, then quiet |
| `reportFocusedControl` | 1200 ms | poll until a phrase exists |

**All of them are now conditions.** `ANCHOR_SETTLE_MS` (×4), `WINDOW_SETTLE_MS`, `TABLE_SETTLE_MS`,
`STATE_SETTLE_MS`, `SPEECH_RECONNECT_MS` and `NVDA_SETTLE_MS` are gone. Every remaining `sleep()` in
`capture-core.mjs` is a poll INTERVAL or a retry gap (`*_POLL_MS`, `NVDA_RETRY_DELAY_MS`), which is the
correct use — the gap between two checks of a condition, not a substitute for one.

Two of them were worse than wasteful, because a short guess did not merely cost time:

- `SPEECH_RECONNECT_MS` (750 ms) slept once then probed ONCE. A reconnect taking 751 ms was reported as
  a failed socket rebuild, and the remedy for that is restarting NVDA — the expensive action that
  produces the `injection_terminate` modal which wedges a guest. It now polls to a 6 s budget.
- `NVDA_SETTLE_MS` (3 s) slept then probed once, and the next line THROWS `SCREEN_READER_MUTE`. A screen
  reader needing 3.1 s became a false capture failure that the run paid for with a whole retry. Now
  polled to a 10 s budget; only then is silence a finding.

Verified `evidence:check` 48/48 SAME, so no recapture, and canaries stable 3/3 per page.

**Two traps when doing this.** A condition must be *sufficient*: `screenReaderResponds()` only proves
the Remote port accepts a TCP connection, not that NVDA's virtual buffer is navigable. And the deadline
must exceed the slowest honest answer, because silence is a legitimate finding — if a probe gives up
early, "nothing was said" and "we stopped listening" become the same observation.

**Verify by importing the module.** Removing a constant that three other call sites still used left
`capture-core.mjs` throwing `ReferenceError` at import, and **neither `npm run lint` nor `tsc --noEmit`
caught it**. For `.mjs`, `node -e "import('./path.mjs')"` is the only real check.

### The speech channel is a socket, and a dead one looks exactly like a healthy NVDA

This is the root cause of the pool's most expensive fault, and the fix is one round trip.

Guidepup reaches NVDA over a **TLS socket to NVDA Remote on 127.0.0.1:6837**, and speech is *pushed*
back over it. Keystrokes are writes; speech is a read. So when that socket goes half-open:

- `nvda.next()` still succeeds — the write is accepted
- nothing is ever spoken back
- NVDA looks completely healthy and says nothing

Guidepup cannot notice. Checked in 0.29.2: it reconnects only on a socket `error` event, a half-open
TCP connection raises none, and there is **no keepalive, no read timeout and no heartbeat** in its
client. (Guidepup also has **no debug mode**: two env vars, no logging. Its config was identical on
healthy and failing guests, so misconfiguration was never the cause.)

> **This section used to say the only way to rebuild the channel was `stop()` + `start()`, because
> `NVDAClient` "is not exported". That is wrong and it cost real time.** `NVDAClient.js` ends with
> `exports.NVDAClient = NVDAClient` — it is absent from the package *index*, not from the module. More
> importantly, **guidepup's reconnect logic already works; it is starved of its trigger.** Lines 99-110
> disconnect, reconnect, re-join the channel and reset the failure counter — all of it hanging off an
> `error` event that a half-open socket never emits.
>
> So `speech-channel.mjs` hands it that event: `socket.destroy(err)` emits `'error'` and guidepup
> recovers itself, in **under a second instead of ~23 s**, without touching NVDA. Note `destroy()` with
> no argument emits only `'close'`, which guidepup ignores — that distinction is the whole trick and is
> asserted in the tests. The socket is captured by wrapping `tls.connect`, because `NVDA#client` and
> `NVDAClient#socket` are genuine `#private` fields and unreachable by reflection.
>
> This matters beyond speed: **repeated NVDA restarts are what produce the `nvdaHelperRemote
> (injection_terminate)` modal that wedges a guest**, so the expensive remedy was feeding the fault it
> was treating. `ensureSpeechChannel` now rebuilds the socket first and only restarts NVDA if the probe
> still hears nothing.
>
> When reading a dependency's behaviour, read the dependency. Both wrong claims above came from its
> public API surface rather than its source, which is in `node_modules` and is 316 lines.

So `ensureSpeechChannel` probes it *before* committing a capture: clear the log, `readLine`, check a
phrase came back. Measured across all three guests, 7 interleaved rounds each, same page, same tool:

| | median | IQR | recoveries |
|---|---|---|---|
| before | 36.7 / 42.0 / **93.7 s** | 9.1 / 9.0 / 20.7 | 0/7 / 1/7 / **5/7** |
| after | **12.4 / 12.4 / 12.3 s** | **0.1 / 0.6 / 0.3** | **0/7 all three** |

The probe costs 0.7 s and **never had to restart NVDA once** — so the gain is not from proactive
restarts, it is that exercising the channel early stops the bad state arising. `windowsActivate` also
fell 12.8 s → 2.1 s, which suggests a half-dead NVDA was contending for the foreground and slowing
Edge's grab for it.

Two caveats worth keeping: the mechanism is inferred rather than proven, and 21 captures cannot prove an
intermittent fault is *eliminated* — only that it did not occur once across a pool that was averaging
6 of 21 before. Watch `/health.vitals.recoveries`; if it climbs again, the theory is wrong.

### A guest whose NVDA is broken looks perfectly healthy — watch `recoveries`

The worst worker fault this pool has had produced **zero failures**. One guest's NVDA went mute on
**4 of 4 captures**; the worker's retry absorbed every one, so every capture succeeded, `failures`
stayed at 0, and the eviction rule (three consecutive *failures*) could never fire. The only symptom
was that it ran at **122.9 s per capture against a healthy peer's 40.6 s**, and wall-clock time says
"slower" without saying where.

**`npm run worker:compare <page> <worker> <worker>`** is how you find it. It puts the phases side by
side, which took the diagnosis from hours to one command:

```
phase              w1      w2   spread
nvdaStart        19.1     0.0     19.1   <- the whole gap. 0 = NVDA reused; 19s = cold-started every time
windowsActivate  11.6    14.4      2.8
sweep             6.3     6.6      0.3   <- identical
```

Before that tool existed I attributed this to Edge's launch, then the Edge profile, then the sweep — all
three wrong, because `bench-capture` prints one worker at a time and I compared wall times. It also shows
the per-sweep detail capture-core already recorded and nothing displayed: **ms up with round-trips flat
means each trip is slower; trips up means the sweep is walking more.** Different causes.

The signal is now acted on, not just printed:

- `/health.vitals.recoveries` — faults the worker papered over. The one number that rises while
  everything still appears to work.
- `npm run doctor` reports `DEGRADED` with the repair command.
- **A run retires a degraded worker automatically** (`shouldRetireWorker`): it stops taking cases, nothing
  is requeued (its captures were fine), and the run summary names it. Never the last worker standing —
  a slow run beats no run.

The repair for a guest in this state is `provision-nvda-worker.ps1`, which reinstalls NVDA.

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

## Before any corpus run: `npm run gate:stability`

Five canary pages, captured repeatedly, compared by CONTENT. It fails closed, and a corpus run must not
start until it passes.

It exists because the corpus carried a nondeterministic artefact for weeks with every check green.
Edge's autofill draws a suggestion icon inside recognised inputs; NVDA announces it as an embedded
object appended to the field:

```
"Recipient name, edit, ￼"      <- U+FFFC, OBJECT REPLACEMENT CHARACTER
```

**And `probeForms` submits forms, so the profile LEARNS**, and the rate climbs as a run proceeds —
measured at 3%, then 8%, then 31% of affected captures, with **26 good/bad pairs disagreeing about it**.
A pair where one side carries a stray character and the other does not is comparing two things that
differ for a reason unrelated to accessibility, which is the one defect this project cannot tolerate.

Every existing check stayed green because they all count, and the counts never moved: one form field
before, one form field after. Content comparison is the only thing that could see it.

Suppressed now with **command-line flags, not Edge policies** (`AutofillServerCommunication`,
`AutofillAddressProfileSavePrompt`, `--disable-save-password-bubble`). The policy equivalents were set
by provisioning and had *already drifted* — `StartupBoostEnabled` read 1 on two guests and 0 on a third
for weeks. A flag is in git, applied at every launch, and cannot differ between guests. Note Chromium
honours only the **last** `--disable-features`, so new features go in the existing list; a second flag
silently disables only half of what you asked for.

### A canary that cannot express the fault is worthless

This was got wrong three times in one day, and each time the clean result was read as confirmation:

- verified an autofill fix on `field-followup-date`, which does **not** auto-focus its input — so the
  affordance never appeared and 12 clean captures proved nothing. `form-unlabelled/good` auto-focuses,
  and still failed.
- measured the artefact on `form-unlabelled/bad`, which has no date field at all.
- compared guest `.4` at 4096 MB against `.6` at 3072 MB and read the difference as a code change.

**Reproduce the fault with your test before trusting the test's verdict.** Every canary in
`stability-gate.mjs` records the mechanism it exercises; add new ones the same way.

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

### The mirror image: a probe that CRASHES also produces an empty field

The rule above is about not rejecting evidence that is legitimately absent. This is the same
indistinguishability read from the other end, and it cost a whole corpus.

`9cabfb4` ("the cost was anchorToTop, not the sweeps — 21% faster") added `ctx.trips.count` to
`collectByType` for per-sweep round-trip counts. Five call sites pass `{...ctx}` or spell out
`deadline, diag, trips`; the **postSubmit** one spelled out only `label, onItem, deadline`. So
`ctx.trips` was `undefined` and the function threw on its own first line — *before any sweep ran*.

The throw was caught. The catch was not empty: it recorded `postSubmit ERROR …` to
`interaction.sweepLog`, exactly as this repo's rules require. **Nothing read `sweepLog`.** Result:

- `postSubmitFields` came back `[]` on **all 2,122 captures**, 604 of them with a logged crash
- `validationErrorIsSilent` spent the entire corpus on `formChanges.after` — the fallback **its own
  comment calls useless**, because it reads `"<title>, document"` on both variants
- 6 cases could not discriminate, and the failure looked like a page problem, not a probe problem
- every other check stayed green: counts never moved, and an empty field is not a malformed one

Nothing existing could have caught it. `evidence:check` compares fields, and this field was empty in
both the before and the after. The eval fixtures that *do* show the probe working
(`filter-status-good.json`, `postSubmit: 3`) predate the regression, so no comparison ran against them.
This is the same class as the h1 announcement that vanished from 90 captures with every check green.

Three rules follow, and they are cheap:

1. **A caught-and-logged error is not a handled error.** If nothing asserts on the log, the log is a
   comment. `verify.corpus.test.ts` now fails on any `sweepLog` line containing `ERROR`, which turns
   604 silent crashes into one red test.
2. **When you add a required field to a shared helper's context, grep every call site.** Lint and
   `tsc` cannot see it — this is `.mjs` reading a duck-typed object, so the only signal was a runtime
   throw inside a `try`.
3. **A guard must be shown to fail before it is trusted.** The first version of that test read
   `capture.interaction.sweepLog`, which does not exist — sweepLog reaches the file only via the
   `interaction` *diagnostic mark*. It passed against the very corpus carrying 604 crashes. A test
   written against a shape you did not verify is the count-based check all over again.

## Diagnosing a guest without `utmctl exec`

`utmctl exec` wraps QEMU's `guest-exec`, which is **known-unreliable on Windows** — upstream reports
qemu-ga stopping at random and failing to open its own channel. Observed here in one session on one
guest: it worked, silently wrote nothing, returned OSStatus -2700, then worked again. Do not build a
diagnosis on it.

Everything you would have reached for it is served over HTTP instead:

```bash
curl -s http://<guest-ip>:8765/diagnostics | jq .
```

- `edgeProfile` + `edgeProfileBreakdown` — the per-subtree sizes that found 348 MB of `BrowserMetrics`
- `processes` — orphaned `msedge` counts, the load that used to make the next `nvda.start` time out
- `edgePolicy` — drift from what provisioning set, reported rather than silently re-applied
- `screenReader` — NVDA's config (synth, Speech Viewer) plus its log **and `previousLog`**; NVDA rotates
  on every start, so a session that went mute only exists in the old file
- `disk`, `serverLog`

`/health` stays cheap because it is polled; `/diagnostics` walks directories and shells out, so it is
on-demand only.

**NVDA records almost nothing by default** — a whole session log is seven lines, identical on a healthy
guest and a failing one. `A11Y_NVDA_LOG_LEVEL=DEBUG` raises it (applied to `nvda.ini` at boot, no
elevation needed). Opt-in, because NVDA writes a great deal at DEBUG and this pipeline measures
per-capture timing.

**Comparing two guests:** `npm run worker:compare -- <page> <worker> <worker> [--rounds=7]`. Interleaved
round-robin with medians and IQRs, and it refuses to declare a difference the samples do not support.
Use it instead of reading two `bench-capture` printouts — that is how a 2x difference got attributed to
the wrong phase for hours.

**Backing up the corpus:** `npm run corpus:snapshot`. `runs/` is gitignored, so 2,122 captures worth
hours of worker time exist in one place. It writes a timestamped archive; syncing it somewhere durable
is deliberately your call.

## Housekeeping is automated — do not do it by hand

Anything a human has to remember is something that does not happen. What runs itself now:

- **Worker VMs** — a run starts what it needs and puts each back as it found it. Stopped is the
  correct resting state.
- **The dataset page server** — leased the same way (`src/training/page-server.mjs`). A run starts it
  if missing and stops it afterwards, including on SIGINT; a server somebody else started is used and
  left alone. This replaced a manual `npx serve` that had leaked four processes onto this host, one of
  which was a stray that could 404 an entire run while it reported success.
- **NVDA** — the worker cold-starts it when it has gone and recycles it every 25 captures; a failed
  capture always stops it. Nothing may restart it while a worker is *idle* (see above for why).
- **Edge** — `captureWithNvda`'s `finally` closes it unconditionally, which is what stopped failed
  captures leaking eight orphaned processes onto a 4 GB guest.

`npm run doctor` reports what it cannot fix: strays on the pages port, a VM running but not
answering, a run left mid-flight. It is read-only by design — it never kills anything — so the one
manual step left is acting on what it tells you.

## Verifying changes

**Two of these now run themselves. That is deliberate, and it is the point.**

```bash
git push                      # pre-push hook: lint, typecheck, tests, check-signals, rules:gate (~5s)
npm run release:gate          # signals -> rules -> held-out acceptance -> judge quality, cheapest first
npm run capture:check -- --worker=http://192.168.64.4:8765    # the capture layer, ~2 min
```

This project had eight verifications and only two were automatic, and the record of what that produces is
unambiguous: `capture-check` was *required* after any change to `capture-core.mjs` and had never run once;
`release:gate` was broken from the day it was written (it invoked the acceptance evaluator with no
`--data`, so stability could not be measured, and reported "not measured OR unstable" in one string); and
the acceptance gate sat FAILING while three other gates were green. Every gate run for the first time
found a real defect. **Automate a check or lose it** — the same rule this file already applies to worker
VMs, the page server and NVDA.

The pre-push hook holds only what costs nothing: measured at ~5 s, no worker, no Codex, no network. It
SKIPS the corpus-dependent checks loudly when `runs/` is absent rather than passing quietly, because a
check that reports success having examined nothing is how "verified" comes to mean "unexamined".
`A11Y_SKIP_VERIFY=1 git push` overrides it, and says so. The worker- and Codex-dependent gates stay
release-time: a 75-minute check on `git push` gets the hook deleted within a day.

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
  `verify.corpus.test.ts` for the capture gates. Neither can run in CI — eval needs the Python venv
  login, the corpus test needs `runs/`. Note also that `capture-regression.yml` is path-filtered to
  `src/capture/**`, so it does **not** fire for changes under `src/training/**` — which is exactly
  where the guard bug above lived.
- `npm run eval [-- <substring>]` — judge quality against 34 labelled fixtures, **against our own scorer** (`JUDGE_BACKEND` defaults to `local`). Needs the Python venv, so it **cannot run in CI**; run it when you touch the judge, prompts, criteria, or fixtures. Do **not** quote its numbers as a headline: `docs/METHODOLOGY.md` records that the guards were tuned against these cases, scoring is single-run, and there is no expert baseline yet. Report with those caveats or not at all.
- **`src/capture/nvda/capture-core.mjs` only runs against NVDA on the Windows VM** — it has no local test.
  After changing it, deploy (above) and then:

  ```bash
  npm run capture:check -- --worker=http://192.168.64.4:8765   # ~2 min from the Mac
  ```

  **Use the worker mode.** The in-process mode still exists (it is what `capture-regression.yml` runs on a
  Windows runner, which has no worker) and it refuses while a worker is serving — correctly, since NVDA is
  one machine-wide resource. But that refusal is why this check went unrun through many capture-core
  changes: it meant stopping `a11ysrv` on the guest, driving a scheduled task in an interactive session,
  and starting it again. A verification that costs a ceremony is one that does not happen, which is this
  file's own rule about housekeeping applied to testing.

  Nothing is lost by going over HTTP: every assertion is a pure function of the capture RESULT, which the
  worker returns. It is arguably the better test, since it exercises the path production uses. Run
  `scripts/bench-capture.mjs` too if you touched timing. The VM capture is its test; the book's rule is
  "refactor under test".
- **Count-based checks cannot see content rot — assert what was heard, not how much.** capture-check now gates on probe *values* (`disclosure-good` must reach `expanded`, `disclosure-bad` must stay `collapsed`) and on the read-through still carrying roles, because both lessons were learned the hard way. A readiness gate once overwrote the first line of every page with the document title, deleting the h1's `"heading, level 1, ..."` announcement everywhere: `"heading, level N"` phrases fell from 105 to 15 across 90 captures and **every check stayed green**, because the phrase count had not moved. If you change capture, compare evidence quality against a previous run, not just line counts.
- `npm run evidence:check <worker>` — after ANY change to the capture pipeline, asks whether the
  evidence moved rather than whether the timing did. Exit 0 = ship without invalidating the cache,
  1 = evidence CHANGED, bump `CAPTURE_PROTOCOL_VERSION` and recapture. This is what makes a capture
  optimisation affordable to evaluate; before it, every one "cost a full recapture" to find out.
- `npm run training:check-signals` — proves every dataset `badSignal` fires on the bad page and stays silent on the good one, against captures already on disk (no worker needed). Run it after ANY change to a probe's output shape: a probe and its signal are coupled, and 8 cases once went silently blind when a probe changed. `npm run training:status` reports a long capture run; `--resume` picks up where one stopped.
- **Worker broken? Don't debug from first principles** — `docs/nvda-worker-runbook.md` has the error-string → real-cause table (the messages are misleading: `"NVDA not installed"` usually means a version mismatch, not a missing install), and `scripts/diagnose-nvda-worker.ps1` applies it automatically. `scripts/provision-nvda-worker.ps1` is the idempotent repair.
- **No worker to hand?** Build one: `docs/getting-started.md` (~1.5–2 h, almost all of it downloading Windows). Validating capture changes through CI is a ~10-minute loop and should be the fallback, not the habit.

## Environment facts
- ESM throughout (`"type": "module"`). `.ts` for the control plane, `.mjs` for the capture worker (it runs under plain Node on the VM).
- **The judge is our own trained scorer.** `JUDGE_BACKEND` defaults to `local` — the 27 KB of heads in
  `packages/scorer/models/screenreader-scorer/` over a frozen MiniLM encoder. `codex`, `anthropic` and `openai` remain
  available for comparison and are **never** the default.
  > It defaulted to `codex` until 2026-08-04, and the GitHub Action already shipped `local` — so
  > `npm run eval` and `npm run eval:gate` measured a rented model and **never once measured ours**. A
  > gate that does not exercise what ships is not a gate. Flipping it immediately surfaced two real
  > defects invisible to an LLM that only reads transcripts: a starved scorer asserting on seven
  > conformant fixtures, and a crash on an out-of-scope (VoiceOver) capture.
- Don't manually `taskkill nvda.exe` — let Guidepup own NVDA's lifecycle, or the speech-capture channel destabilises. Killing the worker with `Stop-Process` orphans its NVDA (still holding port 6837); the next cold start recovers, but expect to see it.
- The worker keeps NVDA alive between captures (recycled every 25). `A11Y_REUSE_NVDA=0` reverts to a fresh NVDA per capture — the first thing to try if captures drift as a run progresses.
- The guest is provisioned as an **appliance**: Windows Update may install but not reboot, and Edge's background mode, startup boost and auto-updater are off. It used to reboot itself mid-run and leak Edge processes.
- **A capture is ~12.4 s**, measured across all three guests over 7 interleaved rounds each (medians
  12.4 / 12.4 / 12.3, IQR ≤ 0.6, statistically indistinguishable). That is *after* the speech-channel
  probe; before it the same pool measured 36.7 / 42.0 / 93.7 s with IQRs up to 20.7. If you see anything
  like the older numbers, check `/health.vitals.recoveries` first — that is the fault returning, not the
  host being busy. Historic figures in this repo of "13–19 s", "27 s", and "45 s" all predate the fix.
- Quote the host state with any timing number. Your own `npm test` or a browser competes with the guests.
- **The largest single phase is `windowsActivate`, at ~10 s, and it is Edge starting.** Edge is
  launched *and quit* for every capture, so its cold start is on the critical path every time —
  `waitedMs: 10784` against an 800 ms settle. That is ~37% of a capture, and it is the biggest
  remaining cost. Three routes were evaluated; **two of them are dead ends, and the analysis is worth
  keeping so nobody re-derives it.**

  | route | verdict |
  |---|---|
  | Overlap NVDA's start with the wait for Edge's window | **worthless.** `nvdaStart` is ~0 s on a warm capture, and ~83% of captures reuse NVDA. There is nothing to overlap on the path that matters. |
  | Re-enable Edge's startup boost | **cannot work alone.** Cleanup calls `windowsQuit("msedge.exe")` with a `taskkill /im msedge.exe /f` fallback, so it kills Edge *by image name* — including the pre-warmed background process. The next capture cold-starts anyway. |
  | Keep Edge alive between captures | **the only real option**, and it subsumes startup boost. |

  The third needs care, not courage. Do **not** navigate an existing window via the address bar:
  captures run `--app`, which has no address bar, and abandoning `--app` resurfaces the browser chrome
  that `"Welcome to Microsoft Edge"` phantoms came from. The shape that should work is *keep the Edge
  process, open a fresh `--app` window per capture, and close only that window* — Chromium reuses the
  process, so the window appears fast and the announcements stay identical. It touches window focus,
  which this project's own notes call "the #1 flakiness fix", and it is testable only on the VM.

  **Mitigating the recapture cost.** This is why `npm run evidence:check` exists: it compares evidence
  field by field on a stratified sample and says whether the change is evidence-neutral. If it reports
  SAME, the change ships without invalidating the cache — the key is a proxy, the diff is the direct
  measurement. If it reports CHANGED, the recapture is genuinely required, and the cheap moment to pay
  it is **bundled with any other pending `CAPTURE_PROTOCOL_VERSION` bump**, so 2,122 captures are
  recaptured once rather than twice.
