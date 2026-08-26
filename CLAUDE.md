# CLAUDE.md — a11y-witness

Guidance for Claude Code (and humans) working in this repo.

## Where else to look

This file is for working ON the repo, and it is long because it is a record of what specific mistakes cost.
Three shorter documents came first for a reason, and they are not duplicated here:

| | |
|---|---|
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | the 60-second orientation, and the question that decides everything: **does your change need a Windows worker?** Most of the repo does not. |
| [`SECURITY.md`](SECURITY.md) | what this tool does that somebody must know before running it — `probeForms` presses buttons, the worker has no authentication, `A11Y_PYTHON` is executable |
| [`docs/README.md`](docs/README.md) | the index to every guide and runbook, grouped by task, with [`docs/adr/README.md`](docs/adr/README.md) for the 22 decision records |

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
| **rules** (`rule-ownership.json` → `decidedBy: "rules"`) | conformance-mapped, so `criterionOutcomes` reports `failed`. **This is the only layer that ASSERTS.** Exact on every criterion it owns, 0 false positives across 1,183 conformant records. |
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

**`fleet:provision` runs the ROLE, and it must run across the WHOLE fleet.** `provisionRevision` is a hash
of four environment files and it is a CAPTURE CACHE KEY that `fleet-consistency` also treats as
MUST_MATCH — so a box provisioned alone gets a stamp its peers do not have, the fleet reads INCONSISTENT,
and every capture run refuses to start. `stamp-provision-revision.ps1` records that happening: four boxes,
four revisions, *"purely because each first-booted at a different commit during one afternoon"*. Use
`--limit` only to REPAIR a box back to the stamp its peers already carry, never to add one.

> **A GLOBAL ALL-AT-ONCE PUSH IS NORMALLY WRONG, AND HERE IT IS THE ONLY SAFE OPTION.** The SRE
> Workbook is explicit that a config change must be deployable gradually — *"avoid a global all-at-once
> push … doing so allows you to detect issues and abort a problematic push before causing a 100%
> outage"* — and `--serial=0` is exactly the push it warns against. It is still right here, for a reason
> specific to this fleet: `provisionRevision` is a capture cache key AND a `MUST_MATCH` field, so a
> canary box is not a safety measure, it IS the failure mode. One box provisioned ahead of its peers
> splits the fleet, `fleet-consistency` reads INCONSISTENT, and every capture run refuses to start.
> The rollback the book asks for is `git checkout <ref> && fleet:provision` across the whole fleet, and
> the "abort before 100%" it asks for is the pre-flight refusal of a worker mid-capture. Do not
> introduce staged provisioning here without first removing `provisionRevision` from the cache key,
> which would cost a full recapture.

> It **refuses a worker mid-capture**, and that refusal replaced `serial: 1` doing the job badly.
> Serialising made provisioning-during-a-run survivable rather than impossible — it restarts a worker
> mid-capture, destroying 12–520 s of unresumable work, and splits `provisionRevision` across the corpus.
> `sleep.yml` already had the refusal twenty lines away. With it in place, `--serial=0` is the normal way
> to converge a fleet: measured 2026-08-25, **10 m 07 s across five boxes against 26 minutes serial** —
> and serial ALSO fired the `run_once` Node-version lookup once per box, defeating the guarantee its own
> comment describes, because `run_once` means once per BATCH.

`fleet:status` is the "which box is the problem" answer: per worker, its state, its `/health.code`, and —
for a busy one — the case it is on, how long it has been there and the phase it is IN, read from
`/progress`, which every worker has served since forever and nothing consumed. It surfaces a **degraded**
guest, which is the fault that produces zero failures: the worker's own retry absorbs every recovery, so
`failures` stays 0 while that box runs at three times its neighbours' cost.

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

This replaced `ssh root@<pve> 'pct exec 121 -- bash -lc "..."'`, which existed nowhere in the source tree —
so the way this project's most expensive operations were started was untested and unreviewable. `command`
with `argv:` never invokes a shell, which removes the quoting class that sent four capture shards at
`--worker=http://:8765` for 29 minutes. **The lab is reached DIRECTLY at its own IP; there is no `pct exec`
hop**, and that second hop was the whole source of the quoting problem.

**Three systemd facts, measured, that any status check must respect.** Poll `SubState`, **never
`systemctl is-active`** — under `--remain-after-exit` an exited unit reads `active (exited)` forever, so a
waiter on `is-active` hangs indefinitely reporting "still running" for a finished job. `Result` and
`ExecMainStatus` are populated **while the job is still running**, so they mean nothing until `SubState`
leaves `running`. And use `--remain-after-exit` rather than `--collect`, or the exit code is discarded at the
moment it matters. `lab-job.test.ts` pins all three.

**A job of a given name is refused, not killed, while one is running.** The unit name is the lock and it
holds against the ssh path too, which an in-process flag could not.

`packages/worker-fleet/ansible/README.md` is the map: why SSH and not WinRM (the blank-password guard),
why not an `/admin/update` route (the worker has no auth and binds all interfaces), and the two Windows
gotchas that otherwise cost an afternoon — `administrators_authorized_keys` and OpenSSH's `DefaultShell`.
The fleet is defined **once**, in `inventory.yml`.

**A new box needs no console visit.** `packages/worker-fleet/src/provisioning/bare-metal/` is an x64
`autounattend.xml` for the PXE server: Windows installs, the account is created, sshd comes up with your
key already planted, and the worker serves. `roles/worker/` is provisioning ported to Ansible modules and
runs alongside `provision-nvda-worker.ps1` until parity is proven — see that README before deleting
either, because `provisionRevision` is a **capture cache key** and retiring the script moves it.

It pushes **every hashed file** (20 now, defined once in `packages/nvda-worker/src/worker-files.mjs` — the
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

## The diagnostics lied to me six times in one day, and never once by being wrong

Every one of these was a CORRECT value read from the wrong place, or a stale value read as current. None
of them looked like an error, which is why each cost a run or more.

| what I read | what it actually was |
|---|---|
| `journalctl -u <unit> --since <ExecMainStartTimestamp>` | the PREVIOUS run's window once the unit has exited — a stale `RULES: FAIL` for a gate that passes. **Three times.** |
| `ansible-playbook ... \| tail` | the pipeline's status is `tail`'s. A real `ANSIBLE_EXIT=2` read as success. **Twice.** |
| "the fixture capture keeps failing" | it had succeeded 20 minutes earlier; I was reading a later, unrelated refused job |
| "the rule does not fire on its fixture" | the fixture page demonstrated a DIFFERENT criterion, declared as such thirty lines away |
| "4 blockers, expect 1" | quoted from a run that predated three fixes |
| coverage counts mid-recapture | the corpus was being rewritten underneath the count |

**The rule that covers all six: ask the authoritative source, and let it tell you what it is bounded to.**

```bash
npm run lab:status -- -e job=<name>     # ONE run: systemd's view, the journal bounded by
                                        # InvocationID, and the run's own progress file
```

`lab-status.yml` has a task called *"Whether that journal is ONE run or the unit's whole history"*. It
existed the whole time. Every one of the three journal misreads came from hand-rolling `journalctl` instead
of running it — and improvising around a tool the repo already has is itself a defect source.

Two more that follow:

- **Never pipe a command whose exit status you intend to read.** `cmd > /tmp/log 2>&1; echo "EXIT=$?"` then
  read the file. `set -o pipefail` also works; a bare `| tail` does not.
  > **And then actually READ the echoed value — the remedy has the same trap inside it.** Appending
  > `; echo "EXIT=$?"` makes the COMPOUND command's status the echo's, which is always 0. Measured
  > 2026-08-25: the `gates` pipeline failed at stage 5 and the surrounding harness reported the run as
  > exit 0, because the shell's last statement had succeeded. The file said `PIPELINE_EXIT=2`. So the
  > echo is not a substitute for reading it, it is the only place the real status survives — and a
  > wrapper that reports the shell's status is the `| tail` defect wearing the recommended fix.
- **Check the premise before re-running the expensive thing.** Three capture runs went into "the 2.1.1
  fixture will not capture" before anyone asked whether that page demonstrates 2.1.1. It did not, and
  `real-page-corpus.test.ts` now answers that offline in milliseconds by pinning a fixture's declared
  criterion to the case it is built from. **The same discipline as "reproduce the fault with your test
  before trusting the test's verdict"**, applied to evidence rather than to a test.

**And the generalisation, which is this file's oldest lesson pointed at the operator instead of the code:**
a number is only as good as what it was computed from, so make every reported number carry that. The three
guards added on 2026-08-25 all do it — `rules:coverage` refuses a corpus written in the last ten minutes,
`run-job.yml` refuses a commit other than the one asked for, and the capture refuses a page whose URL is not
the one requested. Each replaces a plausible wrong answer with a refusal that names the cause.

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

## Which browser a capture drives

`packages/nvda-worker/src/browsers.mjs` holds one plain-object preset per browser — exe search paths,
launch flags, profile directory, process image, window title. It exists because the browser was spread
across **eight** sites, which is this repo's most expensive recurring shape: a change applied at seven of
them and missed at the eighth is a capture that launches Chrome and kills Edge.

```bash
A11Y_BROWSER=chrome          # what this GUEST has (set once in run-server.cmd)
{"url": "...", "browser": "chrome"}          # per REQUEST, for a comparison run
npm run evidence:check -- <worker> --browser=chrome     # does Chrome announce the same as Edge?
npm run training:repeat -- --url=<page> --browser=chrome --times=5
```

**The browser is EVIDENCE, not configuration.** `environmentKey()` has always keyed the cache on
`browser`/`browserVersion` — for the same documented reason it keys on `os` and `architecture`, *"a fleet
can have more than one image"* — but that value was the literal string `"Microsoft Edge"`, a constant
standing in for a variable. It now comes from the preset, so the key does the job it was written for. Two
consequences follow and neither is optional:

- **Edge's preset must stay byte-identical.** Its `name` is `"Microsoft Edge"` and its flag list is the
  same flags in the same order, because that is what makes all 2,122 cached captures still valid. A tidier
  `"edge"` would invalidate the corpus for a rename. `browser-args.test.ts` asserts the whole command line
  against a literal — individual per-flag assertions cannot see a flag that was *added*.
- **Profiles are per browser, never shared.** Chromium refuses two builds on one `--user-data-dir`, and the
  quieter half is worse: a profile Edge warmed carries Edge's learned autofill into a Chrome capture.

**Nothing falls back.** A guest whose configured browser is missing reports `browserAvailable: false` and
says which browser and which paths — it does not quietly capture in whatever else is installed. A silent
fallback puts two browsers' evidence in one corpus, which is the failure the cache key exists to prevent
arriving by a different door. A tiny11 image ships without Edge; `A11Y_BROWSER=chrome` is how it says so.

**The Chrome preset has never taken a capture** — there is no Chrome guest yet. It is the Chromium
switches Edge shares plus `--disable-search-engine-choice-screen` (Chrome's `msEdgeWelcomePage`, and worse:
since Chrome 127 it is a MODAL, which is the fault class that blocks input while `/health` stays green).
Treat every Chrome line as a hypothesis until `evidence:check --browser=chrome` has compared them. That
comparison is the point: *does NVDA announce the same thing in the two Chromium browsers?* Nobody has
published it, and the Edge corpus on disk is the baseline that makes it a one-command question.

Two things deliberately need **no** preset. `window-focus.mjs` matches the window CLASS, and Chromium names
its top-level windows `Chrome_WidgetWin_1` whatever the branding — the code that focuses Edge focuses Chrome
unchanged. And `pointer.mjs`'s park is browser-agnostic, so Chrome inherits the real magnifier remedy even
though it has no such feature to disable.

**Firefox does not fit a preset.** No CDP, so the structural census, `bringPageToFront` and window reuse all
have no equivalent — it needs a separate capture backend, not another entry in this map. See ADR 0001.

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
### A cache key that was MEMOISED, and lied for five days

**Edge updates itself under a running worker, and `browserVersion` did not notice.** The worker read it
through `bootConstant`, whose comment stated the premise outright — *"an executable's version (updating Edge
or NVDA restarts this process)"*. Nothing makes that true: Edge's updater replaces files on disk and the
worker is a separate scheduled task. Measured on a11y-worker-2, same box both sides:

```
/health.environment.browserVersion   151.0.4129.93    uptimeMinutes 7205 (5 days)
msedge.exe on disk                   151.0.4129.101   written 20 Aug 12:13 — four days INTO that uptime
```

So captures were stamped with a version they were not captured under, and **shared a cache key with
evidence from a different browser build** — the exact failure the key exists to prevent, arriving through
the memo instead of through the key. `fileProductVersion` now memoises on the file's identity (path, mtime,
size); the memo's purpose was never the version but keeping a blocking PowerShell child off polled
`/health`, and a `statSync` preserves that.

**Two lessons worth more than the fix.**

- **It defeated the check that was built for it.** `browserVersion` is the FIRST entry in
  `fleet-consistency.mjs`'s `MUST_MATCH`, with exactly this rationale — and every guest reported the same
  stale `.93`, so a split fleet looked consistent. The moment the memo was fixed, `fleet:status` said:
  `fleet INCONSISTENT — browserVersion: .107=151.0.4129.101 .59/.175/.224=151.0.4129.93`. **Only ONE guest
  had actually updated.** A correct check fed a value that cannot express the fault is not a check.
- **A deploy would have HIDDEN it.** Restarting a worker rebuilds the memo, so a correct version after a
  deploy proves the restart worked and vouches for nothing. Hence `file-version-memo.test.ts`, which drives
  an injected `stat`/`read` off Windows — the `refreshBrowseBuffer` rule applied to a value rather than a
  remedy.

**Edge's auto-update policy never applied, and the reason is documented.** `UpdateDefault=0` and
`AutoUpdateCheckPeriodMinutes=0` read back correctly on all four guests and worker-2 updated anyway. Twelve
EdgeUpdate policies — `UpdateDefault`, the per-app `Update{56EB18F8-…}` and `TargetVersionPrefix{…}` among
them — carry the same line in [Microsoft's docs](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-update-policies):
*"available only on Windows instances that are joined to a Microsoft Active Directory domain."* **These boxes
are standalone.** So the values are stored and never honoured, and `policy.yml`'s read-back — the "prove it"
half of every other concern in that role — could only ever prove they were STORED. A verification that
cannot tell *set* from *in effect* is this repo's usual defect one layer further out.

**So the build is pinned instead** (`roles/worker/tasks/edge-version.yml`): declared in
`worker_edge_version`, installed from Microsoft's enterprise MSI by SHA256, and the updater's scheduled
tasks and services stopped and disabled — the only lever that works on a non-domain-joined box.

**Installing Edge takes three steps, and the middle one is not optional.** A Chromium install stages the new
launcher as `new_msedge.exe` and leaves `msedge.exe` alone, because the running browser holds it; the rename
is a separate operation performed later **by the updater we just disabled**. Measured on a11y-worker-3:
`win_package` reported success and left `.93` in place, a **full reboot did not complete it**, and
`setup.exe --rename-chrome-exe --system-level` finished it in one call. So: stop Edge, install, rename.
Note also that Edge's own ClientState `pv` read `.101` while the binary read `.93` — the vendor's
bookkeeping disagreeing with the file, the same shape as the memo above. **Trust the binary.**

And gate the rename on the VERSION being wrong, never on `install is changed`: once an earlier attempt has
installed the MSI, `win_package` is a no-op reporting unchanged, so a `changed`-gated follow-up skips and
the box stays on the old build while the play reports success.

Note `/diagnostics.edgePolicy` reports only `StartupBoostEnabled` and `BackgroundModeEnabled`, so the update
policies it does not read cannot be seen to drift there either — though on a standalone box they were never
the mechanism anyway.

**Consequence for a corpus run: check `fleet:status` for consistency BEFORE starting one.** Two guests on
different Edge builds must never share a cache entry, and the corpus on disk is already cache-invalid
against every guest — `provenance.browserVersion` on the 18 Aug captures reads `151.0.4129.86`, a value
that was itself produced by the memo and therefore cannot be trusted to describe what those captures ran
under.

- **Bump `CAPTURE_PROTOCOL_VERSION`** (`packages/nvda-worker/src/capture-core.mjs`) when a change alters what
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
node packages/lab/scripts/bench-capture.mjs --from-disk                          # p50/p95 per phase, per worker
```

## A capture survives a lost socket — name it, then ask for it again

`send(res, 200, {...})` wrote the result to a socket and the worker then kept **nothing**, so any socket
loss between "NVDA finished reading the page" and "the host parsed the JSON" destroyed 12–520 s of real
screen-reader work. The host cannot tell that from a worker that never answered, so it retried and paid
for the whole capture again — and three failures in a row on one worker **evicts a machine that was never
faulty**.

On three UTM guests sharing one Mac the socket was a virtual bridge and effectively lossless, which is why
this never mattered. A fleet of bare-metal mini PCs is real Ethernet with real power management, and the
incident is already in provisioning: a worker answered `EHOSTUNREACH` for **48 straight requests** in one
evidence-check run, then answered a curl thirty seconds later.

```
POST /capture  { url, ..., captureId }     # the host NAMES the capture
GET  /capture/<captureId>                  # 404 unknown | 202 running | the original response, verbatim
```

- **The id comes from the CLIENT, and it has to.** A worker-minted id would be returned in the response —
  the very thing being lost. This is the idempotency-key shape, for the reason payment APIs use it.
- **404 and 202 are different answers and must stay that way.** "Never heard of it" means re-issue the
  case; "still running" means wait. Producing one where the other is true is this repo's most expensive
  recurring shape.
- **A failed capture is stored exactly like a successful one**, with its original status, so a replay is
  indistinguishable from the original response and the worker's `fault` code survives. Losing that
  response replaces a diagnosis with "no answer" — which this project has repeatedly misread as a dead
  machine.
- **The host asks only after `waitForWorker` returns**, which waits for `busy` to clear. So the capture it
  lost the socket to has necessarily finished and its outcome is stored. One request, no polling loop.
- **In memory, bounded at 8, never persisted.** Eviction skips anything still running — dropping a live
  capture would recreate the bug at the moment the store exists to prevent it. Persisting would mean
  serving results captured under a different `codeVersion` after a restart.

This adds a route and an optional request field, so it does **not** bump `CAPTURE_PROTOCOL_VERSION` —
nothing about what the evidence *means* changed, and a bump would invalidate 2,122 captures for a
recovery path. It does change `codeVersion()`, so redeploy. An older worker ignores `captureId`
(`captureOptions` reads known fields only) and 404s the GET from its router fallback, which the host reads
as "nothing to recover" and captures again — the behaviour it had before. Additive, exactly like `fault`.

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

### A FACT STATED TWICE, and the copies drifted — five of these in one day

The section below is about a remedy reaching one of several paths. This is its sibling and it cost more on
2026-08-22: one fact written down in two or more places, where nothing compared them. Every instance was
silent, and three were found only because something unrelated failed.

| the fact | the copies | what it looked like |
|---|---|---|
| which probe a case wants | **six** hand-written hops: `pair()`, the manifest, the host runner, `server.mjs`, `capture-core`, and `evidence-check` | the probe never ran; the field it writes was simply absent, which is what a page with nothing to report looks like |
| what an announcement's accessible NAME is | `namesOf` (case-matrix.mjs) and `comparableNames` (rules.ts) | `check-signals` said CONTAMINATED — the signal firing on the conformant page while the rule stayed silent on the same capture |
| which rules ship | `rules.ts` source and `packages/judge/dist/rules.js` | `rules:gate` scored a rule the compiled bundle did not contain and reported `0/1 MISSING EVIDENCE` |
| which signal types exist | the `if`-chain in `signalMatches` and a REGEX in `acceptance-matrix.test.ts` that scraped it | the scrape matched nothing after a refactor, so the test asserted over an empty set — and passed |
| a case's page furniture | `withRealisticScale` keyed it on ARRAY POSITION — **fixed 2026-08-22**, it is now an FNV-1a hash of the case ID | inserting a case re-sized every case after it; `check-signals` reported `1 stale` |

**The fix is never "be careful", it is to make the copies unable to disagree.** In order of preference:

1. **Delete a copy.** `SIGNAL_TYPES` is now exported as a value, so the test reads the list instead of
   scraping the source it is testing.
2. **Derive one from the other.** The probe hops forward every `probe*` key by PREFIX rather than by name.
3. **Pin them equal with a test** when the duplication is forced. `namesOf` cannot import TypeScript — the
   corpus generator runs under plain `node`, and making it depend on a build is how the stale `dist` above
   happened — so `name-normalisation.test.ts` asserts both reduce real announcements identically. It failed
   twice on its first run, on cases nobody had considered.

Two rules that fall out and are cheap to apply:

- **A test must not derive its expectations from source TEXT.** Both the signal-type scrape and an earlier
  `sweepLog` guard passed while examining nothing. Read an exported value, or assert against a fixture.
- **Inserting a case re-buckets that SUBTYPE's later cases** — and this entry has now said the opposite
  twice, which is the more useful lesson.
  It first said "APPEND, never insert", because furniture was keyed on array position. Then furniture
  moved to an FNV-1a hash of the case ID and it said "insert, reorder or delete freely", verified by
  adding 60 cases and watching zero existing pages move.
  **Both were true when written, and the second is now wrong.** Measured 2026-08-26: hashing the ID gives
  each case an INDEPENDENT 1-in-5 chance of the `namedField` bucket, so a seven-case subtype misses it
  entirely with probability 0.8⁷ = 0.21 — one subtype in five — and exactly one did. That is a free veto
  under ADR 0015, on a feature no positive of that subtype carries. Furniture is now DEALT within the
  subtype: case *k* gets bucket *(offset + k) % 5*, so every subtype with five or more cases sees all five
  by construction rather than by luck.
  The cost is real and is the trade: a case inserted mid-subtype re-buckets the ones after it, so its
  pages change and they recapture. `furniture-spread.test.ts` asserts the guarantee per FEATURE — an
  earlier version asserted "at least two shapes" and did NOT catch a revert to independent hashing,
  because random assignment produces two shapes most of the time; it just does not produce all of them.
  **A rule that asks a human to remember something is a rule that gets broken** — which is why the
  property is a test rather than this paragraph.

### Three criteria a static analyser structurally cannot reach

Added 2026-08-22, and they are the clearest statement so far of what this tool is for. Each is recorded as
PARTIAL in `criterion-coverage.ts`, naming which failure mode it covers and which it does not.

| | assessed | why markup cannot answer it |
|---|---|---|
| 2.4.1 | a skip link that is present and **inert** | a checker sees a link and a plausible `href` and passes it |
| 2.4.2 | the route changes and the **title does not** | the markup is valid at every instant; the failure is the TRANSITION |
| 2.4.3 | the tab order **contradicts the reading order** | the DOM has no reading order to contradict until something walks the page |

**Each one's scope was settled against the spec, and one of them changed as a result.** 2.4.1's note here used
to say "a skip link is the first focusable element and announces as one" — i.e. detect its absence. W3C's
Understanding page is explicit that a skip link is NOT required: headings alone satisfy it (H69), landmarks
alone satisfy it (ARIA11). Every corpus page has an `h1`, so that rule would have fired on conformant pages.
**Read the criterion before building the rule**, and prefer the mode no other layer can see.

Three measurement traps, all found by capturing rather than reasoning:

- **The tab order is a CYCLE.** Past the last control Tab returns to the first, so a faithful recording ends
  by repeating what it began with — and comparing it raw made the CONFORMANT variant differ from itself.
  Compare each control's first visit.
- **The focus probe truncates at 12 stops on every corpus page.** So "absent from `focusOrder`" almost never
  means "unreachable". 2.1.1 is positional for this reason: a control counts as unreachable only when
  something LATER in reading order was reached.
- **Silence is not the signal you want.** The stale-title page announced `"visited"` — the link's own state,
  which names nothing about where the user is. A rule keyed on "nothing was announced" would have stayed
  mute on the exact page it was written for.

### A fix applied at ONE call site when the behaviour reaches several

Three defects in this file share one shape, and it is worth naming so the next one is caught by pattern:

| the behaviour | where the remedy was | where it was missing |
|---|---|---|
| focus mode makes quick-nav keys type themselves | `anchorToTop`, before the post-submit re-read | every sweep after an activation — 353 captures |
| guidepup 0.31 throws on `start()` of a live NVDA | `startScreenReader`'s catch, which adopts it | `ensureSpeechChannel`'s restart, which called `startFreshWithRetry` directly |
| speech must be settled before a delta baseline is read | `waitForAnnouncement`, at the END of the delta | the START — late speech credited to the activation |

A fourth has the same shape read from one step further back: the remedy was reachable from the right path
and **its trigger was never set**. `refreshBrowseBuffer` rebuilds NVDA's browse-mode buffer after a reused
window is re-pointed — the buffer belongs to the WINDOW, so navigation alone does not rebuild it — and it
guards on `navigatedExistingWindow`, which nothing ever assigned `true`. So it returned early on every
capture ever taken. Then three `capture:check` runs passed and it would have been natural to call the fix
confirmed, by results it had no part in producing.

**Confirm a capture-path change by its diagnostic MARK, not by a green result and not by a matching
`/health.code`.** Both were present while the remedy was inert. `refreshBrowseBuffer` now marks
`browseBufferFresh` when it skips, so "did not need to refresh" and "never ran" can never again be the same
silence — the same rule as *unchecked is not clean*, applied to a remedy rather than to evidence.

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

### A comment that names an ambiguity, above code that resolves it by assumption

The sharpest version of the pattern above, and it cost the most on the first real website this tool was aimed
at. Three examples, all found in one session:

| the comment said | the code did | measured cost |
|---|---|---|
| "an unchanged phrase is ambiguous between 'did not move' and 'moved to something announced the same way'" | stopped the sweep on the FIRST repeated phrase | **graphics 5 of 66** on a page with four identical avatar alts |
| (same function) "silence is unambiguous evidence of not moving" — true on an idle guest only | ended the sweep on one silent step | **headings 3 of 10**, no error anywhere |
| `beginsWithRole`: "a leading LANDMARK is context, not the control's own role … reported three conformant W3C pages as 4.1.2 failures" | stripped landmarks, not CONTAINERS | **a false 4.1.2 against a named button**, because every real nav bar is a list inside a landmark |

The fix is the same each time: find the signal that is NOT ambiguous. NVDA **announces** the end of a page —
"no next heading" — so `exhausted` is the sound terminus and both repetition and silence are guesses. A log
delta proves speech is new, so it proves movement. Prefer the screen reader's own answer over an inference
about its behaviour.

> **A number beats a word.** "Examination was INCOMPLETE" cannot tell you whether two links were missed or two
> hundred. `crossCheckStructure` had been computing exactly that comparison into a diagnostic every run, unread
> — the same shape as the 604 silent `sweepLog` crashes. The report now states `link 51/58, graphic 59/66`, and
> a residual gap between the sweep and the AX tree is a question about this tool, not a finding about the page.

**Guest sizing is measured, not assumed: the VMs had 2 of the host's 14 vCPUs.** Raising them to 6 took a real
marketing page from "abandoned at the 280 s hard timeout" to 2:33, and `example.com` from 90 s to 19 s. The
symptom of CPU starvation is that `/health` and `/progress` stop answering **while the port stays open** — a
memory-starved server is slow, a CPU-starved one is silent. `config.plist` → `System.CPUCount`; UTM caches
configs, so stop every guest and quit UTM before editing.

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

## A metric computed on data that shares the flaw cannot see the flaw

The most expensive thing learned on 2026-08-22, and it outranks every individual defect below because it
says which of our checks were ever capable of finding them.

The trained heads see 384 encoder dimensions of ONE announcement plus **29 document-level features of the
whole capture**. When a feature is 0 on every training positive of a subtype, the head may give it a large
negative weight at no cost — and no held-out split can punish it, because the split has the same structure.
Measured on the shipped weights: `4.1.2:unnamed-control` scored the byte-identical announcement
`"combo box, collapsed, QUICKMENU ---- greater"` at **0.924042** on two W3C pages and **0.452519** on a
third, because the third is 14 layout tables and `table_present` is worth −1.26 logits. Not one of the 147
training records carrying an unnamed form field has a table.

**225 such free vetoes across all 13 heads.** The one that matters most: `form_field_named` at −4.33 means
the scorer reports an unnamed control **only on a page where nothing is correctly named**, which describes
almost no real site. Held-out acceptance (58 TP / 0 FP / 0 FN), `npm run eval` and `rules:gate` are all
blind to this *by construction*. See `docs/adr/0015-one-defect-per-page-taught-the-scorer-to-veto.md`.

Two audits now ask the question, at the two times it can be asked:

```bash
npm run corpus:starvation      # the CASE DEFINITIONS: which features will be constant? No capture needed.
npm run scorer:shortcuts       # the TRAINED WEIGHTS: which did a head penalise for free? In release:gate.
```

- **The corpus-side one is the design tool.** The weights-side one arrives after a capture run, an export
  and a train — correct, and too late to steer anything.
- **The remedy is the corpus, never the weights.** A retrain on unchanged data reproduces the vetoes
  faithfully; they are a correct fit to what it was shown.
- **Furniture plateaus, for a definitional reason.** Conformant page furniture fixed 263 starved pairs down
  to 178. It cannot go further, because a feature that IS a failure — a vague link, an unnamed graphic, a
  position-only table cell — never appears on a conformant page. Below 178 needs pages that fail TWICE.
- **The abstention floor saved this from being a false clean**, without knowing why. The missed page is out
  of support at 0.6978, so the tool abstained rather than scoring it and returning "no findings" on a page
  its own publisher calls inaccessible. Do not lower the floor to make a recall number look better.

**Generalise it.** Before trusting any accuracy figure here, ask what would have to be true of the data for
that figure to be uninformative — and then check whether it is.

## The things 2026-08-24 cost, and none of them were the model

A day spent chasing "12 false accusations on GOV.UK" that the tool never made. Recorded in the order they
have to be understood, because each one hid the next.

### 1. THE NUMBER WE STEERED BY MEASURED SOMETHING THE PRODUCT DOES NOT DO

`calibrate-abstention.mjs` read `record.predictions` straight out of `score.py` and called every true one a
FALSE POSITIVE. The CLI routes findings through `criterionOutcomes`, where an unmapped model finding becomes
`cantTell`. So the whole real-page calibration — and ADR 0019's headline — described accusations that were
referrals. **Verified before changing anything: the identical finding scores `cantTell` unmapped and
`failed` when conformance-mapped.**

This is the third instance of one defect in this repo, and the pattern is now unmistakable:

- `JUDGE_BACKEND` defaulted to `codex` while the Action shipped `local` — *"a gate that does not exercise
  what ships is not a gate"*
- the abstention sweep scored raw predictions instead of the product path
- `npm run eval` resolved the SHIPPED artefact always, so a candidate's judge quality was unknowable until
  after promotion — a gate that cannot examine the thing being decided

**Before optimising any number, run the path a user runs and check the number is the one they would see.**

### 2. THE ANNOUNCEMENT ORDER DEPENDS ON HOW THE CARET GOT THERE

Measured over 300 captures, with no overlap whatsoever:

```
structure.*  (quick-nav sweeps)      name-first  884   role-first    0
transcript   (arrow read-through)    name-first    0   role-first  880
```

NVDA's `getPropertiesSpeech` appends name→role→states, and browse-mode arrow navigation reverses it for the
focused object (nvaccess/nvda#11102). Seven partial regexes across three languages each guessed at one
order. They are gone: `packages/evidence/src/announcement.ts` is the single grammar, told its channel rather
than inferring it, validated on **6,555 cross-channel comparisons at 0.08% disagreement**.

Container context also PERSISTS: NVDA announces a container once on entry and says nothing again until
`out of list`. Reading each line's own containers reports every item after the first as contextless.

### 3. THE CORPUS CANNOT EXPRESS WHAT REAL PAGES DO — four times in one day

ADR 0019's thesis, earning its keep. Each of these was invisible to every corpus gate and appeared only on
somebody else's site:

| what broke | why the corpus cannot hold it |
|---|---|
| "Details" as a component name | corpus uses vague words ONLY in the failing sense — 13 of 13 wordlist terms, 0 conformant occurrences |
| a named iframe (`"Radios example, frame"`) | no corpus page has an iframe |
| a link mid-list with no prefix of its own | corpus lists are short enough that the prefix lands on the same line |
| a search combo box unchanged after Enter | 69 conformant + 69 failing disclosures against SIX combo-box records |

`npm run corpus:starvation` now reports **word-sense monopoly** — a feature no CONFORMANT record carries, so
its presence is a free predictor. Split into "fix these" (a wordlist, so the word has another sense in
English) and "correct as they are" (the feature IS the failure).

### 4. A LESSON LEARNED AT ONE LAYER, REPEATED AT THE NEXT, AT FOUR TIMES THE COST

`screenreader_features.py` carries `TOGGLE_ROLE` and the comment explaining it: Enter is not a combo box's
activation, the evidence is *"identical to a broken disclosure's, character for character apart from the
role"*, and leaving it implicit cost **3 false positives**. The new state-change RULE reproduced the
identical bug and cost **12 wrong assertions** — while ADR 0021 was being written about remedies that reach
one layer and not the others.

**When a comment names a control-specific behaviour, grep every layer that decides on that control.**

### 5. A ZERO CANNOT VETO, so "A and not B" must be computed, never handed over as two features

The promotion gate refused the candidate on 2.4.4: **27 false positives, precision 0.841**, against a
shipped model at **1.000 with zero**. Scored every clean development record and grouped what fired:

```
CLEAN records firing 2.4.4: 23
    22  component-index          <- the conformant pages added that morning
     1  components-text
```

Those pages carry "Details" inside a peer index, added deliberately so the WORD would stop predicting the
failure. Their features:

```
vague_link_present         = 1.0     pushes the score UP
vague_link_without_context = 0.0     correct — the link HAS context
```

**The contextual feature computes perfectly and cannot help.** `0 x weight = 0`, so it pushes up when it is
1 and can never pull down when it is 0. A linear head only ADDS. So:

> **If a criterion needs "A and not B", compute the conjunction and give the head one feature. Handing it A
> and B separately works only if the model can multiply, and this one cannot.** The heads are
> `torch.nn.Linear(n, 1)` — 13 logistic regressions with 416 parameters against 3 to 224 positives each.

Two corollaries earned the same day:

- **A feature that answers a DIFFERENT criterion is a shortcut waiting to be taken.** `vague_link_present`
  asks 2.4.9's question (is the text alone vague — AAA, unreported here). The 2.4.4 head used it because it
  was the cheapest separator available. It is no longer a model input; the helper stays exported for when
  AAA ships.
- **A corpus fix that appears to make things worse may have worked.** Adding conformant pages carrying the
  word did not create the problem — it removed the shortcut's cover and exposed the head's dependence on
  it. `corpus:starvation`'s monopoly report predicts exactly this, and the right response is to fix the
  FEATURE, never to withdraw the pages.

**And this is what the promotion gate is for.** Held-out acceptance said 90/90, 0 FP, 0 FN. Grouped
development said precision 0.841 over 2,419 records. Both true: acceptance is 104 records and cannot resolve
a 1.4% false-positive rate. `npm run lab:job -- -e job=promote` runs the candidate gate where the weights
and the code both live, refuses on the candidate's own reports, and writes nothing when it refuses.

**CONFIRMED by the retrain, and it cost nothing.** Removing `vague_link_present` as a model input took
`2.4.4:regex` from **27 false positives to 0** (precision 0.841 → 1.000) and recall *rose*, 0.979 → 0.986.
`2.4.6:regex` cleared entirely in the same change, 0.836 → **1.000/1.000** — the same shortcut had been
suppressing it. A feature answering a different criterion's question is worth removing even when it looks
like free signal.

### 6. THE THRESHOLD IS SET BY THE SINGLE WORST NEGATIVE, so one record reads as a model regression

The retrain above also moved `3.3.1:validation-error-silent` from **15 missed findings to 24**, in a change
that dropped a LINK-TEXT feature. Every head reads the same shared feature vector so it was genuinely
re-fitted — but it reads validation messages, and losing nine findings to link text wanted explaining. The
obvious reading is that the head got worse. It is not what happened, and the two need opposite responses:
go and look at one record, versus retrain.

`choose_threshold` takes the **lowest cut reaching zero false positives** over ~1,200 negatives. So the
threshold is an *extreme order statistic* — pinned by the single highest-scoring conformant record — and
the grid is 0.05 steps. Recorded by `threshold_sweep`, which now writes the whole curve into the report:

```
   thr    TP   FP   FN   recall
   0.85   108    5   13   0.893
   0.90   105    1   16   0.868     <- ONE negative sits here
   0.95    97    0   24   0.802     <- so the cut jumps, and 8 findings go with it
```

The head separates 105 of 121 positives above 0.90 with a single negative up there. Nothing about it
weakened. **A blocker now names the next cut down and what rules it out** — one false positive there is a
record to go and read; forty means the head is genuinely weak and the threshold is doing its job.

Two things fall out, both measured on the same report:

- **`development.precision` is the constraint restated, not a measurement.** It is computed with the cut
  that was *chosen from those same out-of-fold scores* to have zero false positives, so 1.000 is guaranteed
  whenever calibration succeeds. Thirteen heads reading 1.000 is not thirteen pieces of evidence. The
  contrapositive is the useful half: **precision below 1.000 can only mean the fallback fired**, so that
  head has no clean cut anywhere and is not calibrated at all. `1.3.1:unassociated-table` reporting
  "2 false positives at threshold 0.5" reads like mild over-eagerness and means the opposite.
- **The fallback was the cut that accuses MOST.** It returned a fixed 0.5, which its own docstring called
  "a value nobody chose" — and reporting a bad default loudly is not fixing it. Measured on the three heads
  where calibration failed: `2.1.2:focus-trapped` 36 false positives at 0.5 against **4** at 0.95;
  `2.4.2:route-title-stale` 6 against **2** at 0.75 *at the same recall*, so 0.5 was strictly dominated;
  `1.3.1:unassociated-table` 2 against **1** at 0.55. It is now the fewest-false-positive cut, ties broken
  by recall, and it can never choose worse than 0.5 did because 0.5 is itself a candidate.

**A cliff worth watching.** Three heads now sit at **0.95, the top of the grid** — `3.3.1`,
`4.1.2:state-change-silent`, `4.1.3`. One more negative crossing 0.95 leaves them no valid cut at all, and
3.3.1's own sweep puts the fallback at 31 false positives. The gate would refuse it, but the head goes from
clean to unusable on one record.

**The root cause is unfixed and is a product decision, not a bug.** A hard zero-false-positive constraint
selected on the same data it is reported against is high-variance by construction. The principled
alternatives — a quantile criterion, or conformal risk control giving a *bounded* false-positive rate with a
finite-sample guarantee — all trade "zero on this corpus" for "bounded in expectation", which for a tool
that ASSERTS conformance failures is a decision about what the product promises. Not to be made silently.

## 2026-08-25: eleven false positives on real pages, and they were all ONE defect

Driven to zero on 86 conformant real pages. `2.1.1` went from **66% of pages to 0**, `2.4.3` from 71% to
6%, `4.1.2` on training pages from **56% to 3%**. Four of the eleven had been producing ASSERTIONS, and
three of those landed on **W3C's own accessibility tutorials** — the pages that teach the guidance.

**Every one was two things compared that describe different moments, or different alphabets.** That is the
same sentence as the 2026-08-24 section below, and it is worth writing twice because it kept being true.

| what was compared | and why they could not match |
|---|---|
| a COUNT sweep, read as an ordering | `collectByType` walks backwards from the caret then forwards, deduplicating. On `date-input` the caret fell between Month and Year, so a reconstruction placed them 17 entries apart where the page reads them adjacent. **The transcript is a read-through and is ordered by construction** — that is the only reading-order signal this tool has. |
| a toggle's name, before and after it was pressed | `"Expand Quick start"` becomes `"Collapse Quick start"`. `probeDisclosure` activates a control unconditionally, so the sweep can record BOTH labels while the focus probe only ever sees the second. |
| a page open for one probe, closed for another | sportengland's search panel was expanded for the sweep and collapsed for the focus probe. Controls inside a closed panel are not focusable, correctly. **A capture is not an instant.** |
| Tab against a widget that shares one tab stop | Native radio groups and ARIA's roving tabindex give a GROUP one stop, with arrows inside. The probe presses only Tab, so a capture cannot tell *reachable by arrows* from *unreachable*. |
| a name with an icon-font glyph against one without | **U+E604**, Private Use Area, in the focus channel and not the sweep — so `"Print this page"` never matched itself. `\s` does not match it and `trim()` does not remove it. The U+FFFC lesson in a second alphabet. |
| a name with `clickable` wedged into its container prefix | NVDA interleaves a STATE between containers: `"main landmark, clickable, form, clickable, Continue, button"`. The container loop stopped at the first one, so `"form Continue"` became a control name. |
| one element announced with TWO roles | `<button><img alt="Submit Search"></button>` is `"Submit Search, graphic, button"`. Parsed as a named graphic PLUS an unnamed button — and an empty name IS the 4.1.2 finding. |
| a container role used as a NAME | `"Menu, button"` is a button named Menu; `menu` is also a container role, so the name was stripped and the button reported unnamed. **The disambiguation is CASE** — NVDA lower-cases roles and passes names through as authored. |
| markup read aloud, against prose | `<input type="image" src="searchbutton.png">` is announced `"less input type equals image src equals searchbutton dot png"`. `isImage` matched the word *image* inside the markup. |

### The one that matters most: a rule can be clean because it has gone DEAF

The transcript rewrite took `2.4.3` from 71% of conformant pages to 6% — and caught **0 of the 4 corpus
records it owns**. NVDA WRAPS a field's label and role onto separate transcript lines:

```
"form, Full name"     <- the label, no role
"edit"                <- the role, no name
```

Requiring both on one line found nothing in the corpus. The real-page number looked excellent for the
worst possible reason, and it would have shipped.

**`rules:gate` refused it, and that is the whole point of the corpus.** It is free ground truth: 1,183
conformant records with 0 false positives, and every rule-owned subtype scored against real captured
evidence. **Run it after ANY change that makes a rule quieter.** Quieter is only good if it has not gone
deaf, and nothing on the real-page side can tell you which you got.

### Two process slips, recorded because they are cheap to avoid

- **A verdict was quoted from a journal window spanning two runs**, and the older one was read — a stale
  `RULES: FAIL` for a gate that passes. `journalctl --since "$(systemctl show -p ExecMainStartTimestamp
  --value <unit>)"` bounds it to the run you dispatched.
- **A commit went in with three tests failing**, because `npm test` was run and its result not read. The
  tests were right and caught a real over-broad fix.

### What is CORRECT and must not be "fixed"

18 findings remain on 86 conformant pages and every one was checked individually:

- **4 assertions, all real** — scotcourts' `<button class="inner mobileMenuButton">` with no text and no
  aria-label, networkrail's bare `"button"` and its silent state change.
- **8 referrals on combo boxes**, where NVDA announces the VALUE where a name would go, so *unnamed* and
  *named, value shown* are indistinguishable. Suppressing this was tried and lost three real corpus
  positives; `secondary` → `cantTell` is the tested answer.
- **5 real order differences** and **1 real filename-as-alt**.

A referral on a conformant page is not automatically a defect. **Check whether the evidence genuinely
shows the thing before making the tool quieter about it.**

### What was checked and REFUTED, so nobody re-derives it

**Bag size is not the driver.** The distribution shift is real and large — corpus median 18 / max 43 against
real median 253 / max 805, so the corpus maximum sits below the real 25th percentile — and padding 40
conformant pages with conformant content produced **0 accusations at every size across 200 trials**.
`npm run scorer:size-sensitivity` is kept because it is the only check that could see a size effect if a
future pooling change introduces one. An earlier 3/12 was an instrument fault: the donor pool moved with the
sample size, so two runs were two experiments.

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

### What state is the CORPUS in — `lab:inventory`

```bash
npm run lab:job -- -e job=inventory     # the authoritative answer, on the box that holds the corpus
npm run lab:inventory                   # against a local copy; it SAYS it is a copy
npm run lab:inventory -- --json
```

Every other moving part had a status command — `fleet:status` for the boxes, `lab:status` for a job,
`doctor` for the local environment, `worker:code` for what the guests run. The corpus and the artefacts
trained from it had none, and they are what everything else exists to produce. So those questions were
answered by opening an SSH shell and running ad-hoc Python — **about eight times on 2026-08-25**, one of
which read the wrong field and reported `captured: 0` while `lab:status` correctly said 85. A one-off
script has no tests, no review and no second reader.

It answers four questions, each of which has cost a run:

| | |
|---|---|
| **is the corpus homogeneous?** | the distribution of every cache-key field, with COUNTS — "split" and "split 3,168 to 42" distinguish a finished migration from a run that died halfway. An ABSENT field is counted as a value, because the key reads it as `unknown` and those captures can never match a live guest |
| **are the exports current?** | measured against the CAPTURES each was built from, not against the clock. The featurizer reads a `parsed` block baked in at export time, so an announcement-grammar change moves the model input without touching a line of Python |
| **what schema is each model stamped with?** | read from safetensors metadata, not `training-report.json`, which does not carry it |
| **is a schema migration open?** | what `release:gate` refuses on, and which candidate could close it |

**It reports WHERE it read from, because it lied on its first run.** From a laptop it said *"NO candidate
carries it yet"* — true locally, false on the lab, which held a v15 candidate. `runs/` is gitignored, so a
local copy is only as fresh as its last sync and carries no `runs/model-*` at all. "None here" and "none
anywhere" are different answers, and it now refuses to turn the first into the second.

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
- **The dataset page server** — leased the same way (`packages/lab/src/training/page-server.mjs`), and the
  lease is **refcounted**, because it had to be: the header's rule ("a long run must not shut down something
  another run is using") protected the ADOPTER and not the STARTER, so a one-case capture run killed the
  server a 48-capture `evidence:check` was still using, 46 captures read a dead port, and they all
  "succeeded" because Edge serves its own error page. Holders are recorded on disk with the server's pid, so
  the last one out stops it whether or not it started it, and `kill(pid, 0)` liveness means a crashed holder
  cannot pin a server forever. `EPERM` counts as ALIVE — after pid reuse a recorded holder may be somebody
  else's process. A run starts it
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

## Producing evidence is a PIPELINE, and it is one command

`npm run lab:pipeline -- --pipeline=<name>` runs the ordered stages that used to be typed out by hand.
`--list` names them; `gates` needs no worker and so leaves the fleet alone.

```bash
npm run lab:pipeline -- --list
npm run lab:pipeline -- --pipeline=real-pages          # deploy -> capture -> rules:real-pages -> rules:coverage
npm run lab:pipeline -- --pipeline=corpus --ref=<branch>
npm run lab:pipeline -- --pipeline=gates               # no fleet: reads the corpus already on disk
npm run lab:pipeline -- --pipeline=verify --only=route-title-stale+  # PROVE a corpus change first
npm run lab:pipeline -- --pipeline=full                # corpus + model + gates, proven TOGETHER
npm run lab:job -- -e job=everything                  # the same chain as ONE supervised unit
                                                      # (it runs `lab:everything` on the lab)
```

Every stage already existed and was supervised. What did not exist was the ORDER, which lived in
somebody's head — the same defect `lab:retrain` closed one layer down. Retyped by hand on 2026-08-25 that
sequence produced: a fleet deployed at `main` while the lab ran a branch, four boxes rebooted for a ref
nobody had pushed, an `ANSIBLE_EXIT=2` masked by `| tail`, and three jobs run four commits behind.

- **Prove a corpus change on ONE subtype before paying for the whole corpus.** A full recapture is ~4 h,
  and a corpus change usually targets one subtype's evidence — so running four hours to discover the fix
  did not move the number is the wrong order. `verify` captures just the cases named by `--only=` and then
  runs the audits that would SEE the change; if they still report the same finding, the fix is wrong and
  it cost minutes. The capability existed the whole time (`capture-screenreader-dataset.mjs` has taken
  `--only=` with exact ids and lists for months) and **no job exposed it**, so the only unit available was
  all-or-nothing. Paste what `check-signals` or an audit printed. **A trailing `+` means the FAMILY** — the base case and its `+also-`/`+with-` variants — because an exact id deliberately means exactly that case: `form-error-silent` is a real id AND a prefix of ~90 others. Asking for `route-title-stale` and getting 1 of 7 is a confident partial answer, which is worse than none.
- **ONE ref, resolved once and given to both halves.** `fleet:deploy` takes `a11y_git_ref`, `lab:job` takes
  `ref`, and they default independently — which is exactly how the fleet came to be on a different commit
  from the lab, failing with a hash mismatch that reads like a corrupted guest checkout. It is also
  **refused before anything expensive runs** if it is not on origin, because both halves fetch from there.
- **It stops at the first failing stage** and names what did not run, for the reason `lab:retrain` gives: a
  pipeline that continues past a failed gate produces a number that looks exactly like a good one.
- **It is a node script and not one Ansible playbook, and that was MEASURED.** The two halves are in
  different credential domains: the workers are reachable only from the control plane, and the lab needs the
  `a11y-pve` key, which the control plane does not have — verified 2026-08-25, `192.168.1.79:22` is open
  from there and answers `Permission denied (publickey)`. Exactly one machine can drive both. Giving the
  control plane the lab key would make a single playbook possible and would put both halves of ADR 0012's
  split behind one credential.
- **Stages go through the npm scripts**, never a second spelling of `ansible-playbook` — `lab:job` also sets
  `ANSIBLE_CONFIG`, without which the collections path and host-key settings differ.

**`lab:everything` and `--pipeline=full` were TWO SPELLINGS OF THE WHOLE CHAIN, and they disagreed.**
`full` names thirteen jobs; the npm chain named six, and nothing compared them. So `shortcuts`,
`acceptance` and `applicability-audit` were simply absent — and `acceptance` is what writes the report
`promote:model` requires, so a complete run ended at *"model-candidate is not releasable: held-out
acceptance has not been run against these weights"* with `rules:gate` (1,183 conformant records, 0 false
positives), `rules:coverage` and `rules:real-pages` all green behind it. Those three stages existed ONLY
as Ansible job argv and had no npm script at all, so the chain could not have run them.
`everything-chain.test.ts` now requires every job in `full` to be a stage here or to be **covered by**
one — and VERIFIES each claimed containment, because an unverified containment list is "trust me" written
in test form. Mutation-checked by deleting the `acceptance` stage, which reproduces the failure exactly.

**`lab:everything` names the stage it is on, and the one it stopped at.** It was six npm scripts joined
with `&&`, which ran correctly as one unit and said nothing about where it had got to — so when it died at
exit 3 on `REFUSING to overwrite ... a RELEASE-ELIGIBLE model`, locating the stage cost two dispatches and
a `lab:fetch` of the whole journal. It is now the step runner `retrain-pipeline.mjs` already had, over a
longer chain: a banner and a `why` per stage, stderr captured on failure, `STOPPED at <stage>`, and the
stage list printed on SUCCESS too — "it passed" and "it passed these six things" are different claims and
only the second survives being read a week later. `everything-chain.test.ts` pins the order and that every
stage names a script that exists, because `npm` would otherwise fail with *Missing script* hours in.

**For a long unattended run, prefer `lab:job -e job=everything` over `--pipeline=full`.** They sequence
the same stages; the difference is where the SEQUENCING lives. `lab:pipeline` runs on a laptop, so each
stage is a supervised systemd unit and the thing deciding what comes next is a local node process —
measured 2026-08-26, five local watchers were killed during one capture, and each time the unit survived
exactly as designed while the orchestration did not, so nothing after it ever started. As a job the whole
chain is one unit: it outlives the ssh connection, the playbook and the laptop, and `lab:status -e
job=everything` still finds it. `lab:pipeline` stays right for a SHORT chain you want to watch, because it
prints per-stage boundaries live and a single unit cannot.

`lab-pipeline.test.ts` pins the pipelines against the real catalogue: every job named must exist in
`lab-job.yml`, and a pipeline containing a job that reads `A11Y_WORKER(S)` must deploy the fleet first. A
renamed job would otherwise fail at its STAGE, which for `corpus` is after a multi-hour capture.

### A capture now REFUSES a fleet that is not running this checkout

`run-job.yml` refuses to run at a commit other than the one asked for — *"a job that quietly runs four
commits behind reports success for code you did not ask for."* That guard covers the LAB and says nothing
about the twelve machines that take the captures, which are a second checkout deployed by a separate
command nobody was forced to run.

Measured: after `MAX_TAB_STOPS` went 12 → 150 and `collectByType` began recording `prevCount`, the
real-page corpus held **both populations at once**, and reading it meant bucketing captures by whether they
carried the new diagnostic mark at all. Every gate was green. `npm run worker:code` has answered this
correctly the whole time and is a separate command a human must remember — this file's own definition of a
check that does not happen. It was remembered by hand four times in one day.

`assertFleetRunsThisCheckout` (`worker-code-check.mjs`) now runs at the boundary of **both** capture entry
points, and `--allow-stale-workers` says so in the output rather than passing quietly.

- **Both, not one.** The remedy reaching one of several paths is this repo's most expensive recurring shape
  (`anchorToTop`, `ensureSpeechChannel`, `waitForAnnouncement`). `worker-code-check.test.ts` DISCOVERS every
  lab module that POSTs to `/capture` and requires each to be classified as a corpus writer (must check) or
  a diagnostic (must not — a diagnostic may never take the pool offline). A seventh capture client fails
  that test until somebody decides which it is.
- **The synthetic corpus is the worse half.** Real-page captures never cache, so a stale worker's evidence
  there is at least overwritten next run. Dataset captures ARE cached, and `workerCode` is deliberately
  outside the cache key — so one stale guest's capture is reused for ever with nothing recording which code
  produced it.
- **A hash mismatch does not say which side moved**, and the two need opposite responses. If the local
  worker source is dirty against HEAD the CHECKOUT is the odd one out and deploying would ship uncommitted
  work — an uncommitted `CAPTURE_PROTOCOL_VERSION` bump among it invalidates every cached capture. The
  refusal detects that and inverts its own advice.
- **It is a precondition and never a key.** Nothing here invalidates a cached capture, and `workerCode`
  stays out of both the cache key and `fleet-consistency.mjs`'s `MUST_MATCH` — those answer *is this
  evidence still valid* and *are these guests interchangeable*. This answers a third question, and a
  comment-only false alarm costs one `fleet:deploy` while a real drift costs a corpus.

Proved by making it fire against the real fleet, not by a green unit test: a whitespace change to one
worker file took it from `Fleet runs this checkout (worker code bccf65cf76d4baef, 4 worker(s) checked)` to
a refusal naming both hashes and exit 3. **A guard must be shown to fail before it is trusted** — both
capture-client guards were mutation-checked the same way.

## Every other command, and when you would reach for it

The sections above document a command where the problem it solves is described, which is more useful than
an index. These are the rest — real commands with no natural home above, listed so that none is
discoverable only by reading its own source.

`commands-documented.test.ts` enforces the coverage: every npm script must appear somewhere a human
looks, or be declared INTERNAL with a reason. It was added because three commands and two flags landed in
one day and only one reached this file. **A command nobody can find is a command nobody runs** — the same
failure as `capture-check` being mandatory and never running once.

| command | when |
|---|---|
| `fleet:normalise` | bring every LOCAL UTM guest to one baseline, elevated, and prove it took. The bare-metal equivalent is `fleet:provision` |
| `guest:run` | run a script on a UTM guest elevated and actually get its output — `utmctl exec` returns exit 0 and no output whether or not it ran |
| `fleet:tailscale` | put the fleet on Tailscale |
| `layers:compare` | **the project's central claim, demonstrated**: which findings can ONLY the screen-reader layer produce? Asserted for a long time before anyone ran the two side by side |
| `verdict:stability` | is an OCCURRENCE verdict stable on a flaky substrate? |
| `eval:capture` | recapture the eval fixtures, over a live worker or in-process on the guest |
| `rules:score` | `rules:gate` without the gate — the per-criterion detail rather than a pass/fail |
| `scorer:migration` | is a schema migration open? `release:gate` runs it first and refuses while one is. `lab:inventory` also reports it, with which candidate could close it |
| `candidate:gate` | the gate chain against a CANDIDATE rather than the shipped weights — the question `release:gate` structurally cannot ask |
| `promote:model` | copy trained weights into `packages/scorer/models/` and write the changeset. Stops at an uncommitted tree |
| `promote:gated` | `candidate:gate` and then `promote:model`, which is what `lab:job -e job=promote` runs. Never promotes on a failed gate |
| `training:capture:fresh` | generate the pages and then capture them. Capturing without regenerating is testing the previous commit |
| `training:export:test` | export accepting captures whose PAGE HAS MOVED, so a change can be tested without a full recapture. Every record is stamped `grade: "test"`, the trainer refuses to mark such a model release-eligible, and `promote:model` refuses an ineligible one — three gates, so a test dataset can never ship. Use it with `--pipeline=verify`; never for a release |
| `training:build-realism` | add the real-page tier to the exported dataset |
| `training:check-signals:complete` | `check-signals` that REFUSES a partial corpus, rather than scoring what happens to be on disk |
| `training:capture-acceptance`, `training:export-acceptance`, `training:export-acceptance:all` | the held-out set. Never cached, because those runs exist to test whether NVDA's output is still stable. The `:all` one exports EVERY repeat, because the evaluator reads every repeat — two jobs feeding one consumer is a drift generator, and produced a held-out score computed half on each |
| `training:evaluate-acceptance:shipped` | score the SHIPPED model from a COPY under `runs/`. `release:gate` calls this one: the plain `training:evaluate-acceptance` defaults `--model` and `--training-report` into `packages/`, and the evaluator refuses to stamp a verdict into tracked source — *"that record describes what was true when those weights shipped"* — so the gate could never pass as written |
| `training:train-baseline` | train without the realism tier, for comparison |
| `corpus:grants-audit` | **does a multi-defect page carry the evidence its labels claim?** Every accompanying defect declares a `grants` feature and nothing read it — so a label for a defect whose evidence was never captured passed every gate. Needs the AUTHORITATIVE corpus: `lab:job -e job=grants-audit` |
| `corpus:container-exits` | **does NVDA ever announce leaving a landmark?** The fact `vague_link_lacks_context` rests on: a container that never closes stays open for the rest of the transcript, so a rule reading it as CONTEXT is describing the top of the page rather than the announcement in front of it. Reports, never blocks — it describes NVDA, not a defect |
| `corpus:grants-map` | emits the JS-side `grants` declarations for the Python audit to read. Run by `corpus:grants-audit`; separate because the audit REFUSES without it rather than examining an empty set |
| `scorer:shortcuts:candidate`, `training:evaluate-acceptance:candidate`, `corpus:applicability-audit` | the three stages that existed ONLY as Ansible job argv, so the npm chain could not run them and silently did not. `evaluate-acceptance:candidate` is the one that matters: it writes the report `promote:model` requires, and without it a whole run ends at *"model-candidate is not releasable: held-out acceptance has not been run against these weights"* with every earlier gate green |
| `changeset:status` / `release:version` | changesets, as usual |

## Make the failure bubble up, or you will dig for it every time

Three commands answer "what happened", and the third was missing for months:

```bash
npm run lab:status -- -e job=<name>   # systemd's view, the journal, and the run's own progress file
npm run lab:log -- -e job=<name>      # the job's OWN OUTPUT, unwrapped — bytes, not YAML
npm run lab:fetch -- -e artifact=<name>   # a report, as a file
npm run lab:reset                         # what is dirty in the lab checkout, and is it safe to discard
npm run lab:reset -- -e apply=true        # discard it — ONLY files origin already has
```

**`lab:reset` exists because promoting leaves the lab dirty and every later job then refuses to pull.**
`promote:gated` runs there (it is the only box with both the candidate weights and the code) and
deliberately does not commit, since promoting is a MAJOR release. `run-job.yml` then declines to pull into
a dirty checkout — correctly, it cannot tell a stray artefact from work in progress — so the next job runs
at the pre-promotion commit and the `gates` pipeline fails at stage 1 saying so.

It **refuses anything origin does not already have**, comparing each dirty path against `origin/<ref>`
before touching it, and reports without applying unless `-e apply=true`. That containment is not decorum:
the manual alternative is `git checkout --`, the command that once destroyed release-eligible weights in
this repo. Untracked files are never discarded, and it says so rather than reporting a clean checkout.

**`lab:log` exists because reading one audit's output took eleven hand-written `awk | sed | grep`
pipelines in a single session, one of which silently matched nothing.** `lab:status` shows the journal
through Ansible's `debug`, which wraps at ~90 characters, re-indents and quotes as YAML — so a table, a
transcript or a threshold sweep arrives as fragments. The journal is now written to a file on the lab and
fetched. That is the same remedy `lab-fetch.yml` already applied to reports, and improvising around it
rather than reading it is itself the defect this file names.

Three rules that follow, each of which cost a round trip on 2026-08-25:

- **A report that exists only as stdout is one a job runner can lose.** `audit_grants.py` exited 1 with a
  real finding and its journal read `-- No entries --`. Write the report to `runs/` and make it fetchable.
- **Two different faults must not print the same word.** That audit reported `FAIL vague-link 0/52` for a
  declaration naming a feature the pipeline no longer computes — nothing wrong with those 52 pages —
  beside `FAIL fake-heading 35/48`, which is real missing evidence. They need opposite fixes and one of
  them is not in the corpus at all. It now prints `STALE` and says why.
- **A count is where an investigation stops.** "13 records lack it" sent me theorising twice. The report
  now carries the TRANSCRIPT of up to three failing records, and the answer was visible in one line of it:
  `"out of table, Borrowing books"` — NVDA's container-exit prefix, which the relation rejects as a role.

### The order that would have saved the evening: AUDIT FIRST, THEN FIX

Every wrong turn on 2026-08-25 came from reasoning about a MECHANISM instead of measuring the EVIDENCE,
and every recovery came from an audit that asked "is this actually true?" over the whole corpus.

| what I reasoned | what the audit said |
|---|---|
| `plain_heading_candidate` separates perfectly — 5 of 5 held-out positives carry it | it misses **13 of 108** on the full corpus; five positives cannot see a 12% miss rate |
| `probeTables: false` on 62 cases means the table evidence was never captured | `table_position_only` reads the TRANSCRIPT — **49 of 49 carry it**, the corpus was fine and my check was wrong |
| 52 `vague-link` records are missing evidence | the feature was deleted this morning; the DECLARATION is stale |

Two of those three would have led to a full recapture of 62 cases for nothing. **Write the check that
would detect the problem, run it to confirm the problem is what you think, then fix, then re-run.** Doing
it the other way round cost two reverts and most of an evening.

## A flag nobody reads, and an extra var nobody reads

Two instances of one defect, at two layers, both fixed 2026-08-26 and both worth recognising by shape:
**an argument the receiving thing does not know is DISCARDED, so the default runs and reports success.**

- **Ansible silently drops an unused extra var.** `-e out=varied` on a job that never reads `out` looked
  like it worked. 36 jobs had 6 hand-written `when: job == '<name>'` asserts, so a new job's parameter
  needed somebody to remember one. Each job now DECLARES `params: {only: required}` beside its command,
  and `lab-job.test.ts` DERIVES the same answer from that job's raw argv and refuses any disagreement —
  `{{ only }}` is required, `{{ out | default('candidate') }}` is optional, and `model is defined` is the
  other spelling of optional. `-e describe=1` prints what a job takes.
- **Every `.mjs` CLI here ignores an unrecognised flag**, because they all parse argv by looking for what
  they know. Guarded on the five with a measured cost (`refuseUnknownFlags`, `cli-flags.mjs`); the rest
  are an `UNGUARDED` list that may only shrink, so a new one cannot join them unnoticed.

Three things that cost real time inside those two fixes:

- **`lab_jobs[job].argv` cannot be inspected, because reading it RENDERS it.** A job whose command says
  `{{ only }}` dies with *"'only' is undefined"* while being asked WHETHER it needs `only` — the question
  destroys its own subject. A `lookup()` result is never re-templated, so a playbook CAN re-read itself,
  and `lab-status`/`lab-log`/`lab-stop` do exactly that to check a job name against the catalogue.
- **But do not build an analyser out of Jinja, which is what the first version of this did.** It
  re-read the playbook and `regex_findall`-ed the parameters out of each argv at runtime. The SRE
  Workbook (ch14-15) names the shape: a YAML+Jinja config that accrues *"ad hoc language features"*
  becomes *"an esoteric and complex programming language ... difficult for both humans and tools to
  maintain and analyze"*, and its remedy is to **separate config from data and put the cleverness in
  TOOLING**. The `\b`-is-a-backspace bug below is what that costs. The interface is now DATA an operator
  can read, and the derivation is a test in a language with a real regex engine that can be
  mutation-checked.
- **`\b` inside a JINJA string literal is a BACKSPACE**, since Jinja parses escapes with Python's rules.
  Written that way first, both checks passed vacuously *and* refused `-e only=` on the one job requiring
  it. Found by mutation, never by reading — a guard must be shown to fail before it is trusted.
- **Static derivation of a CLI's flags CANNOT be trusted here, and that is why the list is pinned rather
  than derived.** `stability-gate` builds flags from a variable and `repeat-capture` reads seven of them
  through an `arg(name)` helper, so a regex reports ZERO flags for both — a test that would have passed
  having examined nothing. Naming `--worker` literally in `repeat-capture` immediately made a pre-existing
  discovery test fire: it had been reading `--worker` and never validating it.

## Verifying changes

**Two of these now run themselves. That is deliberate, and it is the point.**

```bash
git push                      # pre-push hook: lint, typecheck, tests, check-signals, rules:gate (~5s)
npm run release:gate          # migration -> shortcuts -> signals -> rules -> held-out acceptance -> judge quality
npm run capture:check -- --worker=http://192.168.64.4:8765    # the capture layer, ~2 min
```

**Two audits added 2026-08-24 that no gate chain runs for you, and both answer questions the corpus cannot:**

```bash
npm run corpus:starvation        # word-sense MONOPOLY: a feature no conformant record carries
npm run scorer:size-sensitivity  # does a conformant page FAIL when padded with conformant content?
```

And the measurement that matters most is not in any of them. `calibrate-abstention.mjs` on the lab is the
only check that scores REAL pages through the product path, and its ASSERTED-WRONGLY column is the number to
watch: a criterion the tool STATES is unsatisfied on a page its publisher declares conformant. `referred` is
a different and much cheaper kind of wrong. Collapsing the two is what made the number meaningless for a day.

**Run the clean-code review on your own diff before you push.** Not on the whole repo — on what you
changed, plus anything the Boy Scout Rule says you should have tidied in passing. It is a judgement
pass, so it cannot live in the pre-push hook next to lint and `tsc`: those catch the mechanical half
(`max-lines-per-function`, `complexity`, `no-empty`), and the half that actually costs this project
money is the other one — does the function do one thing, does the name reveal intent, is a caught
error genuinely handled or merely logged. Three of the worst defects recorded in this file were clean
by every mechanical check and would have been caught by reading the diff and asking those questions.

Review before pushing, not after: a review that lands after the commit becomes a follow-up nobody
schedules.

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
  `packages/lab/src/capture/**`, so it does **not** fire for changes under `packages/lab/src/training/**` — which is exactly
  where the guard bug above lived.
- `npm run eval [-- <substring>]` — judge quality against 34 labelled fixtures, **against our own scorer** (`JUDGE_BACKEND` defaults to `local`). Needs the Python venv, so it **cannot run in CI**; run it when you touch the judge, prompts, criteria, or fixtures. Do **not** quote its numbers as a headline: `docs/METHODOLOGY.md` records that the guards were tuned against these cases, scoring is single-run, and there is no expert baseline yet. Report with those caveats or not at all.
- **`packages/nvda-worker/src/capture-core.mjs` only runs against NVDA on the Windows VM** — it has no local test.
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
  `packages/lab/scripts/bench-capture.mjs` too if you touched timing. The VM capture is its test; the book's rule is
  "refactor under test".
- **Count-based checks cannot see content rot — assert what was heard, not how much.** capture-check now gates on probe *values* (`disclosure-good` must reach `expanded`, `disclosure-bad` must stay `collapsed`) and on the read-through still carrying roles, because both lessons were learned the hard way. A readiness gate once overwrote the first line of every page with the document title, deleting the h1's `"heading, level 1, ..."` announcement everywhere: `"heading, level N"` phrases fell from 105 to 15 across 90 captures and **every check stayed green**, because the phrase count had not moved. If you change capture, compare evidence quality against a previous run, not just line counts.
- `npm run identity:rate -- --worker=<url> [--rounds=20]` — **does a capture ever read the wrong page?**
  Rotates three pages with mutually exclusive signatures so a stale read names which page it came from, and
  every capture after the first navigates an already-open window, because a freshly launched browser has no
  previous document and therefore cannot express the fault. Reports wrong-page, silent and unrecognised
  separately — collapsing the first two is what sent an afternoon after a stale buffer that was really a mute
  screen reader. Exits 1 on any wrong page. A zero count is printed as a 95% upper bound (rule of three), not
  as proof of absence.
- `npm run evidence:check <worker>` — after ANY change to the capture pipeline, asks whether the
  evidence moved rather than whether the timing did. Exit 0 = ship without invalidating the cache,
  1 = evidence CHANGED, bump `CAPTURE_PROTOCOL_VERSION` and recapture, **2 = INCONCLUSIVE, which now
  includes PARTIAL coverage and not only zero**. It reported `2 compared: 2 same ... evidence unchanged —
  safe to ship` and exited 0 on 2 of 48, because a concurrent run stopped the page server two captures in.
  The `examinedNothing` guard's own comment named the general rule and then covered only `compared === 0`,
  calling that "the extreme case rather than a different one" — 2 of 48 is the middle it left open. The
  sample is stratified one case per family, so an uncompared capture is a FAMILY with no opinion attached,
  while the question being answered is "may I keep 2,122 cached captures?". This is what makes a capture
  optimisation affordable to evaluate; before it, every one "cost a full recapture" to find out.
- `npm run training:check-signals` — proves every dataset `badSignal` fires on the bad page and stays silent on the good one, against captures already on disk (no worker needed). Run it after ANY change to a probe's output shape: a probe and its signal are coupled, and 8 cases once went silently blind when a probe changed. `npm run training:status` reports a long capture run; `--resume` picks up where one stopped.
- **Worker broken? Don't debug from first principles** — `docs/nvda-worker-runbook.md` has the error-string → real-cause table (the messages are misleading: `"NVDA not installed"` usually means a version mismatch, not a missing install), and `packages/worker-fleet/src/provisioning/diagnose-nvda-worker.ps1` applies it automatically. `packages/worker-fleet/src/provisioning/provision-nvda-worker.ps1` is the idempotent repair.
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
