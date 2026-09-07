# Project history, September 2026 — archived from CLAUDE.md

`CLAUDE.md` reached 219,578 characters against a 150,000-character limit — past which the file is
TRUNCATED on load, so rules at the end may reach nobody. Split 2026-09-07 (issue #155, `ceo`'s authority
over `CLAUDE.md`, relayed by `dispatcher`): `CLAUDE.md` keeps the RULES, stated once in a sentence or two
with a link back here; every incident narrative, measurement table and post-mortem moved here VERBATIM.

**Kept rather than deleted, deliberately** — the same reasoning `history-2026-08.md` states for its own
archive. The value here is not the one-line rule but the MEASURED numbers, the wrong theories, and the
exact mechanism, recorded so nobody re-runs an experiment that already failed or re-derives a diagnosis
that is already written down. Read it for *why*; for the rule itself, `CLAUDE.md` is current.

Organised in CLAUDE.md's own original section order, headings unchanged so a link from there resolves
here exactly.

---

## Working on a Mac — the fleet, in full

> **THE LOCAL UTM WORKER VMs ARE DEPRECATED. Capture on the bare-metal fleet.** TEN boxes
> (`a11y-worker-2` … `-11`, in `inventory.yml`; `-1` is retired and its number is never reused) serve
> `/health` without a laptop in the path, and
> `npm run fleet:status` is the one command that says so. Deploy with **`npm run fleet:deploy`**, never
> `worker:deploy` — that one is `utmctl file push` to a VM UUID and cannot reach a physical box.
>
> **This note exists because the omission cost a wrong turn on 2026-08-28.** The section below opened with
> `worker:ctl -- up`, so a capture-path change was taken to a laptop VM while five bare-metal workers sat
> `ready` and CONSISTENT. Nothing in this file recorded the deprecation, and an agent reading it did the
> documented thing. **A deprecated path that is still the first one documented is not deprecated**, which
> is this file's own rule about anything relying on a human to remember.
>
> Everything below about VM sizing, `utmctl`, pausing and the pool is kept because the MEASUREMENTS behind
> it are still the reasoning for how the fleet is run — the negative-scaling finding, the ~8 GB-per-guest
> figure, `phys_footprint` vs RSS. Read it as the record of why, not as instructions.

With no `A11Y_WORKER` set the run finds the local VM, starts it, and **puts it back as it
found it** — so a VM you started yourself is left running. `--after stop|pause|leave`
overrides. `--no-axe` skips the optional rule layer; `--axe-results file.json` imports one you
already ran.

`worker:deploy` **cannot reach a bare-metal worker**: it is `utmctl file push` plus a `utmctl` reboot, it
takes a VM UUID rather than a host, and it fails immediately off macOS. Physical boxes are git-cloned
rather than file-pushed, so they deploy by pulling.

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

**`fleet:deploy` and `fleet:provision` REFUSE a worker that is capturing.** Added 2026-09-05, after a
deploy went out three minutes into a capture run and killed 12 in-flight captures — *"worker forgot
capture &lt;id&gt; after accepting it — it restarted mid-capture, so the work is gone"*. `sleep.yml` had had
that refusal for weeks and `provision-role.yml` had copied it; the one play whose own header explains at
length that it REBOOTS every guest it touches checked nothing. A HARD fail rather than a skip, because a
half-deployed fleet runs two `codeVersion`s and `assertFleetRunsThisCheckout` then refuses every capture
run — so skipping the busy box leaves you a stale fleet AND a destroyed run. `-e a11y_force_deploy=true`
overrides, and the refusal names it. **`recover.yml` and `restart.yml` are exempt in the OTHER
direction** — both exist to act on a worker that is busy AND wedged, so the check would refuse their only
case. `busy-worker-guard.test.ts` DISCOVERS every playbook targeting `a11y_workers` and fails until a new
one is classified; a test naming `provision-role.yml` by hand could never have seen `deploy.yml`.

`fleet:status` is the "which box is the problem" answer: per worker, its state, its `/health.code`, and —
for a busy one — the case it is on, how long it has been there and the phase it is IN, read from
`/progress`, which every worker has served since forever and nothing consumed. It surfaces a **degraded**
guest, which is the fault that produces zero failures: the worker's own retry absorbs every recovery, so
`failures` stays 0 while that box runs at three times its neighbours' cost.

`lab:stop` exists because the unit name is the lock, so `lab:job` REFUSES a second job of that name — and
until 2026-08-22 the only way to end one was `systemctl stop` over ssh, which is the exact hole ADR 0013
was written to close. It refuses a unit that is not running and names the state it found instead, because
"it was already finished" and "I stopped your job" are different outcomes.

This replaced `ssh root@<pve> 'pct exec <container id> -- bash -lc "..."'`, which existed nowhere in the
source tree — so the way this project's most expensive operations were started was untested and
unreviewable. `command` with `argv:` never invokes a shell, which removes the quoting class that sent four
capture shards at `--worker=http://:8765` for 29 minutes. **The lab is reached DIRECTLY at its own IP;
there is no `pct exec` hop**, and that second hop was the whole source of the quoting problem.

**AND EXIT ON A POSITIVE VERDICT, never on the absence of a marker.** The third variant, and it completes
the set — all three are this file's oldest defect wearing a poll's clothing. A waiter written as
`until ! <status> | grep -q RUNNING` finishes the moment the status command FAILS: a dropped connection
prints nothing, `grep` finds no `RUNNING`, and the loop reports a finished run for one still going. The
sound form names the outcomes it will accept — `grep -qE "SUCCEEDED|FAILED|NOT LOADED"` — so a silent
status keeps waiting instead of being read as success.

Together, the three: poll a field that EXISTS, wait for the state to LEAVE `running` rather than to equal
one of the terminal values you happened to think of, and finish on something the tool SAID rather than on
something it did not say.

**And before backgrounding ANY waiter, prove its condition can be true at all.** The sibling of the
SubState rule, and it has now bitten three times in one session. A waiter polling
`capture-progress.json` for `p.captured` ran for an hour against a file whose keys are
`startedAt, updatedAt, finishedAt, outcome, worker, baseUrl, captureTimeoutMs, total, workers, current,
cases` — there is no `captured` field, the progress is a per-case map under `cases`, and `?? 0` turned the
absence into a number that could never grow. One command against the real artefact answers it; a
backgrounded loop against a guessed shape reports nothing for as long as you let it. This is the
repo's own "a test written against a shape you did not verify" rule, applied to a poll instead of a test.

**WAIT FOR `SubState` TO LEAVE `running`. Never wait for it to EQUAL a terminal value.** A unit has
several terminal SubStates — `exited`, `failed`, `dead` — and which one you get depends on how it ended
and whether anything reaped it. Measured 2026-08-30: two waiters written an hour apart, one polling for
`SubState=exited` and one for `exited|failed`, both hung indefinitely on jobs that had long since
finished, because the units read `failed` and `dead` respectively. That is the `is-active` defect wearing
its own remedy — the right field, tested the wrong way round — and `run-job.yml` already gets it right
with `until: 'Running' not in ...`, which is the form to copy.

**Three systemd facts, measured, that any status check must respect.** Poll `SubState`, **never
`systemctl is-active`** — under `--remain-after-exit` an exited unit reads `active (exited)` forever, so a
waiter on `is-active` hangs indefinitely reporting "still running" for a finished job. `Result` and
`ExecMainStatus` are populated **while the job is still running**, so they mean nothing until `SubState`
leaves `running`. And use `--remain-after-exit` rather than `--collect`, or the exit code is discarded at
the moment it matters. `lab-job.test.ts` pins all three.

`packages/control/ansible/README.md` is the map: why SSH and not WinRM (the blank-password guard),
why not an `/admin/update` route (the worker has no auth and binds all interfaces), and the two Windows
gotchas that otherwise cost an afternoon — `administrators_authorized_keys` and OpenSSH's `DefaultShell`.

**A new box needs no console visit.** `packages/worker-fleet/src/provisioning/bare-metal/` is an x64
`autounattend.xml` for the PXE server: Windows installs, the account is created, sshd comes up with your
key already planted, and the worker serves. `roles/worker/` is provisioning ported to Ansible modules and
runs alongside `provision-nvda-worker.ps1` until parity is proven — see that README before deleting
either, because `provisionRevision` is a **capture cache key** and retiring the script moves it.

It pushes **every hashed file** (27 now, defined once in `packages/nvda-worker/src/worker-files.mjs` — the
list used to be duplicated in `server.mjs` and `check-worker-code.mjs` with a third derived by regex in the
deploy script), reboots each guest — mandatory, because `utmctl exec` cannot be trusted to restart the
worker — and verifies `/health.code` over HTTP, which shares no failure mode with the push. Then it puts
each VM back in the state it found it.

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
verification that shares a failure mode with the action verifies nothing.

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

### The diagnostics lied to me six times in one day, and never once by being wrong

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
| `capture-progress.json` said `running: false, 49 of 49` | the FINISHED run's file. A second run had started one minute earlier and not yet written its own — so I deployed into it and killed 12 captures. `lab:status` was printing `SubState=running` in the same output |
| the PLAY RECAP above a deploy's refusal | the PREVIOUS deploy's, seven minutes old. `followUnit` ran `journalctl -u <unit>` with no bound, so a correct refusal (`failed=1`, `changed=0`) read as a successful deploy. **The fourth instance of the journal-window defect**, in the one place that had no window at all |
| "which of my peers started that job?" | **me.** A backgrounded chain of mine was still running. I asked two other sessions before running `tail` on my own task output |

**The rule that covers all nine: ask the authoritative source, and let it tell you what it is bounded to.**
The last three are the same rule pointed at three different sources, and the third is the sharpest — your
own backgrounded work is a source you have to ask too. A chain you started an hour ago is indistinguishable,
from inside, from somebody else's job.

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
  criterion to the case it is built from. The same discipline as "reproduce the fault with your test
  before trusting the test's verdict", applied to evidence rather than to a test.

**And the generalisation, which is this file's oldest lesson pointed at the operator instead of the code:**
a number is only as good as what it was computed from, so make every reported number carry that. The three
guards added on 2026-08-25 all do it — `rules:coverage` refuses a corpus written in the last ten minutes,
`run-job.yml` refuses a commit other than the one asked for, and the capture refuses a page whose URL is not
the one requested. Each replaces a plausible wrong answer with a refusal that names the cause.

## If you are an agent, start with these — the fleet-sizing measurements

`doctor` answers VM state, worker health, page server, judge backend and whether a previous run was left
mid-flight — the last one being the difference between `capture` and `capture -- --resume`, which is hours
either way if you guess wrong.

> **Stopped worker VMs are the correct resting state.** A run starts what it needs and releases
> it afterwards. `all stopped` is a READY state, not a fault. Do not go looking for another
> worker, and do not open the UTM GUI — just run the capture.

For a long run, use more than one worker. **Set nothing** — with neither `A11Y_WORKER` nor `A11Y_WORKERS`
set, a run finds every local worker VM, starts what is stopped, dispatches cases across them, and **puts
each one back as it found it**: stopped stays stopped, and a VM you had already started is left running.
Measured 1.90x on two, 2.36x on three — on a quiet host, and how many actually start is capped by host
memory (below).

`A11Y_WORKERS` is the escape hatch, not the normal path: naming workers means you are managing
them, so nothing is started or stopped for you. `--after stop|pause|leave` overrides the
restore behaviour; `A11Y_VM_AFTER` is the same choice as an env var, for a caller that cannot pass a
flag (a lab job, a scheduled task).

`A11Y_LOCAL_VM=0` skips the local-UTM-VM fallback entirely: with no explicit worker and no
`inventory.yml` entry, `leaseWorker` normally probes for a local VM before giving up and guessing
`http://localhost:8765`. Setting this to `0` goes straight to the guess, skipping the UTM detection
work (and its side effects) for anyone who does not use the local VM setup at all.

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
  `browser-session.mjs`). Navigates the existing window over the DevTools Protocol. Measured
  `windowsActivate` 8.9 s → **3.6 s**. This removes the reads rather than making them faster.
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

- ~~**Your own tooling is on the same host.**~~ **NOT ANY MORE, AND THIS LINE OUTLIVED ITS REASON.**
  It was true when the workers were UTM guests on this Mac: `npm test`, a build or a browser competed
  with them, and in one 18-capture run the spikes tracked host activity rather than worker age. The
  fleet is ten bare-metal boxes on the network now, so a local build competes with nothing that
  matters. **Kept struck through rather than deleted, because the MEASUREMENT is still the reason the
  section above it exists** — and because this line was propagated into six agent briefs on 2026-09-05
  as "hold `npm test`, a capture is live", which was ceremony with no basis. A rule whose premise has
  moved reads exactly like a rule that still applies; this section's own header is the deprecation
  lesson one paragraph up.

## You may be sharing this checkout — the incidents

A commit of mine once swept up 19 files, 16 of them another agent's half-finished work, and pushed it —
the reason `git add -A` is never safe in a shared tree.

### THE PRIMARY CHECKOUT IS READ-ONLY EXCEPT FAST-FORWARD

Ruled by `ceo`, twice, in messages — and a ruling that lives only in messages is not a rule, which is
exactly why it broke three times in one night: a worktree left parked on a branch, `lab:collect-promotion`
committing here because nothing marked the boundary between producing an artefact and committing it, and
a failed `cd` into a deleted merge worktree silently falling back here. None was carelessness — the rule
was known and written in a role file, and it broke anyway because nothing could REFUSE.

It matters mechanically, not territorially. `assertFleetRunsThisCheckout` hashes the WORKING TREE, so a
stray branch or a half-resolved merge here makes a capture run stamp itself against code that never
existed — best case a refused run, worst case one that passes and should not have. And a worktree's
`node_modules` may symlink to the primary's `dist`, so a branch parked here silently changes what every
OTHER agent compiles and tests against.

Two hooks enforce it now, both identifying the primary the same way `worktrees:prune` already does —
`.git` being a real directory, never a branch name or an absolute path:

- **`pre-commit`** refuses any commit made in the primary outright: *"this is the fleet-driving checkout;
  commit in a worktree."* Override with `A11Y_PRIMARY_COMMIT_REASON="<why>" git commit ...` — the reason is
  PRINTED, so a deliberate exception is in the log rather than in somebody's memory.
- **`post-checkout`** cannot veto a checkout that already happened (git gives it no such power), so it
  self-corrects: the instant a checkout in the primary lands on a branch, or detaches anywhere but
  `origin/main`, it immediately checks back out to detached `origin/main` and says why. Same override,
  `A11Y_PRIMARY_CHECKOUT_REASON="<why>"`.
- `npm run primary:update` is the only sanctioned way to move the primary forward — fetch, then detach at
  `origin/main`, nothing else.
- `lab:collect-promotion` writes its artefacts into whatever checkout it runs in, which is exactly how the
  second incident happened. It now detects the primary the same way and prints a copy-to-worktree step
  instead of `git commit` instructions that `pre-commit` would only refuse.
- Both hooks are mutation-checked by attempting the forbidden thing (`primary-checkout-guard.test.ts`) — a
  hook that has never been shown to refuse is not a verified hook, this repo's own rule, and the reason
  four guards fired on their own authors' first real trigger rather than on a test.

### And more than one agent may be DRIVEN by another — what worked, measured 2026-09-05

Three peer sessions worked units in their own worktrees while one session orchestrated and reviewed. It
worked, and the session running it had predicted it would not, so the reasons are worth having.

- **Every unit's acceptance test is named BEFORE the work starts, and it is a COMMAND, not a judgement.**
  A corpus hash identical either side of a 1,600-line move; a byte-comparison of comment-stripped source;
  a call graph proving four rules cannot be separated. The original sizing assumed each unit would be a
  subtle capture-path change where re-deriving the reasoning IS the review — this file's defect catalogue
  is full of those. Forcing a check instead is what made the throughput possible.
- **Partition by RESOURCE, never by topic or by file.** A worktree isolates the checkout and isolates
  NOTHING else: the fleet, the lab, the page server and `runs/` are single shared things, and this repo's
  guards turn a collision into a *silent wrong answer*. `lab:job` refuses a second job of a name rather
  than queueing it, and an agent reading that refusal as "already done" reports success for work that
  never ran. `fleet:deploy` reboots every worker. `assertFleetRunsThisCheckout` means the fleet runs ONE
  commit, so two worktrees on two commits means one of them is refused and which depends on who deployed
  last. **One driver for all of it.**
- **A fresh worktree has NO corpus** — `runs/` is gitignored — so `check-signals`, `rules:gate` and
  `verify.corpus.test.ts` all skip there. The pre-push hook skips them *loudly*, which is honest and still
  means a delegated change gets a weaker gate than the main checkout's. Symlink `runs/` and `.venv` in, and
  run the corpus-dependent gates at merge time where they are real.
- **Do NOT drive the fleet and review diffs at the same time.** That is how a progress file describing a
  FINISHED run was read while a new one was a minute old — see the diagnostics table above; it cost 12
  in-flight captures. If there are enough hands, the useful split is LATERAL: one agent owning fleet-and-lab
  operations end to end, one owning review and merge. Not a hierarchy — review quality does not compose,
  because each layer holds less of the system and this repo's defects are precisely the ones that pass
  every mechanical check.
- **Ask HOW a number was obtained, not just whether it is right.** *"Was that measured or inferred?"* got an
  honest answer and a usable lesson where *"that is wrong"* would have got a correction and nothing else.
  A plausible number from a peer is the same hazard as a plausible number from a tool.

## Which browser a capture drives — the mechanism and the incident

See `docs/adr/0035-the-browser-preset-is-evidence-not-configuration.md` for the decision and what was
rejected (a tidier preset name, falling back to any installed browser).

`packages/nvda-worker/src/browsers.mjs` holds one plain-object preset per browser — exe search paths,
launch flags, profile directory, process image, window title. It exists because the browser was spread
across **eight** sites, which is this repo's most expensive recurring shape: a change applied at seven of
them and missed at the eighth is a capture that launches Chrome and kills Edge.

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
Treat every Chrome line as a hypothesis until `evidence:check --browser=chrome` has compared them.

Two things deliberately need **no** preset. `window-focus.mjs` matches the window CLASS, and Chromium names
its top-level windows `Chrome_WidgetWin_1` whatever the branding — the code that focuses Edge focuses Chrome
unchanged. And `pointer.mjs`'s park is browser-agnostic, so Chrome inherits the real magnifier remedy even
though it has no such feature to disable.

**`A11Y_POINTER_AT="x,y"` deliberately mis-parks the pointer, to reproduce that Magnifier fault on
demand rather than waiting for it to recur on its own.** An unparseable or malformed value falls back to
the safe park point rather than failing the capture, and the diagnostic mark records the coordinates
actually used, so a typo in the value shows up as `(0,0)` in the mark rather than as silence. Negative
values are allowed, for a second display sitting left of or above the primary. Dev/diagnostic only.

**Firefox does not fit a preset.** No CDP, so the structural census, `bringPageToFront` and window reuse
all have no equivalent — it needs a separate capture backend, not another entry in this map. See ADR 0001.

## Captures are cached — the key composition, in full

A full run is 1,061 pairs, so `npm run training:capture` reuses evidence on disk when nothing that
shapes it has changed. The key covers the page directory (every file), the capture options,
NVDA and Edge versions, the Windows build and architecture, the provisioning revision, and
`CAPTURE_PROTOCOL_VERSION`.

- **The OS is in the key because a fleet can have more than one image.** Without it, a capture from an
  ARM64 guest on a developer's Mac and one from an x64 guest on a server are, to the cache, the same
  evidence. `provisionRevision` is an additional guard: older guests that have not been re-provisioned
  still report `"unstamped"`.
- **Adding `os` to the key invalidated every capture stamped before it**, because `provenance.cacheKey`
  is compared literally. One full recapture pays that off, once.
- **`provisionRevision` is stamped by provisioning and read from the guest checkout.** Existing
  guests created before the stamp was introduced report `"unstamped"` until the next deliberate
  redeploy/re-provision. Re-provision the pool together rather than one at a time so two differently
  prepared guests cannot silently share an `"unstamped"` key.
- **`RUNS_ROOT` / `A11Y_RUNS_ROOT` move where `runs/` itself resolves to** (`packages/lab/src/dataset-paths.mjs`
  is the one place that reads them). Both names are honoured, because both were already in use before
  either script read the other's spelling.

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
  an injected `stat`/`read` off Windows.

**Edge's auto-update policy never applied, and the reason is documented.** `UpdateDefault=0` and
`AutoUpdateCheckPeriodMinutes=0` read back correctly on all four guests and worker-2 updated anyway. Twelve
EdgeUpdate policies carry the same line in [Microsoft's docs](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-update-policies):
*"available only on Windows instances that are joined to a Microsoft Active Directory domain."* **These
boxes are standalone.** So the values are stored and never honoured, and `policy.yml`'s read-back could
only ever prove they were STORED.

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

**Consequence for a corpus run: check `fleet:status` for consistency BEFORE starting one.** Two guests on
different Edge builds must never share a cache entry, and the corpus on disk is already cache-invalid
against every guest — `provenance.browserVersion` on the 18 Aug captures reads `151.0.4129.86`, a value
that was itself produced by the memo and therefore cannot be trusted to describe what those captures ran
under.

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
- **404 and 202 are different answers and must stay that way.** 202 ("still running") means wait, do not
  start a second capture.
- **A failed capture is stored exactly like a successful one**, with its original status, so a replay is
  indistinguishable from the original response and the worker's `fault` code survives.
- **The host asks only after `waitForWorker` returns**, which waits for `busy` to clear. So the capture it
  lost the socket to has necessarily finished and its outcome is stored. One request, no polling loop.
- **In memory, bounded at 8, never persisted.** Eviction skips anything still running. Persisting would
  mean serving results captured under a different `codeVersion` after a restart.
- **404 IS BOUNDED RESULT RECALL, NOT "NEVER STARTED" — architecture-audit.md §14.4, corrected 2026-09-05.**
  This used to say "never heard of it" means the capture never started and to re-issue the case. That is
  the common cause and re-issuing is still the right recovery, but it is not the only cause: the bound
  directly above means a capture that finished and was EVICTED reads exactly the same 404, and a worker
  RESTART loses the whole store the same way. So 404 means "not retained here", not "never ran". Reusing an
  id after its result is retained silently executes again with no conflict check — a caller must mint a
  fresh id per logical capture, which every real call site already does via `randomUUID()`.

This adds a route and an optional request field, so it does **not** bump `CAPTURE_PROTOCOL_VERSION`. It
does change `codeVersion()`, so redeploy.

## Readiness: `ready`, not `ok` — the incidents behind it

`/health` reports `ready` alongside `ok`. `ok` only ever meant "the HTTP server is answering", and a
worker answered it while NVDA could not start — which is how the pool's dominant failure hid for a day.

`screenReader` and `warmedUp` are **reported and deliberately not gated on** — gating on them is what
produced the NVDA restart loop that put modal dialogs on guest desktops. (This paragraph used to claim
`ready` meant "NVDA is up and answering". It never did, and believing it is why the cold-start failure
below went unnoticed.)

### THE BROWSER VERSION IS EVIDENCE TOO, and Edge 152 proved it by renaming a container

`browserVersion` has been a capture cache key and the FIRST entry in `fleet-consistency`'s `MUST_MATCH`
for a documented reason — *"a fleet can have more than one image"*. On 2026-09-05 it stopped being a
precaution and became a measurement.

Same page, same NVDA (2026.1.1), same guidepup (0.31.0). Only Edge moved:

```
Edge 151.0.4129.59    "form, name at example dot com, edit"
                      "out of form, heading, level 1, Booking confirmation"
Edge 152.0.4191.66    "section, name at example dot com, edit"
                      "out of section, heading, level 1, Booking confirmation"
```

**The cause is a SPEC ALIGNMENT, not a browser bug.** [`w3c/html-aria#423`](https://github.com/w3c/html-aria/issues/423)
made the `form` role conditional on an accessible name, the way `<section>` already was: a form nobody
named is not a landmark, so it maps to generic and NVDA announces "section". **Every corpus form is
unnamed**, so all of them moved at once.

**The gate caught it and cost 4.9 hours to say so.** `check-signals` reported 39 blind and 5 contaminated
and stopped `migration-verdict` at stage 4 of 13 — with the capture itself clean, 1,623 captured and 0
failed. That is the design working: a browser upgrade changed what an unchanged page SAYS, and nothing
reached a model.

Three things follow, and the third is the one that generalises:

- **`section` is now in `CONTAINER_ROLES`.** It is a container by NVDA's own account rather than by our
  classification.
- **The grammar must keep understanding OLD announcements.** 3,246 captures on disk carry `"form, …"`, and
  a parser that only reads the current browser cannot read its own corpus.
- **A hand-rolled prefix strip survives a grammar fix.** `placeholderOnlyIsPresent` stripped `^form,` by
  name, so the grammar change did not reach it. **When a container word changes, grep for the WORD, not
  just for the grammar.**

### guidepup is pinned at 0.31.0, and the version is EVIDENCE

See `docs/adr/0033-guidepup-exact-pin-is-evidence-not-dependency-hygiene.md` for the decision itself.

`guidepup` parses NVDA's speech before this project ever sees it, so its version changes what a capture
says. Upgrading 0.29.2 → 0.31.0 fixed an intermittent OBJECT REPLACEMENT CHARACTER (U+FFFC) that had
been appended to form-field announcements at 3–31% of affected captures for weeks — measured 1 in 15
before, **0 in 15 after**. See `docs/ufffc-investigation.md`.

Consequences, all of which are now enforced:

- **`guidepupVersion` is in the cache key** (`capture-cache.mjs`) and in the fleet-consistency check
  (`fleet-consistency.mjs`).
- **0.29 was hiding a bug.** 0.31 throws when `start()` is called on a live NVDA; 0.29 tolerated it. A
  running NVDA is now *adopted*.
- **0.30+ writes a SESSION config** (`sessionUserConfig/nvda.ini`) beside the base one.
- **0.30 added a settings API** — `start({settings})`, `getSettings()`, `getSetting('section.key')`.
  `/diagnostics` reports the effective settings.

  > **THIS LINE USED TO READ "record them; do not tune them — NVDA's defaults are what a real user
  > experiences". That is WRONG, and it was overturned on 2026-09-03.** Screen reader users are heavy
  > configurers: speech rate, verbosity, punctuation and symbol level are all routinely far from default.
  > A tool that only ever describes an unconfigured user is not describing a real one.
  >
  > **The rule that replaces it: a setting that changes what NVDA SAYS is a CACHE-KEY INPUT.** Not
  > forbidden — keyed, so evidence taken under one setting can never blend with evidence taken under
  > another. `environment.screenReaderSettings` carries the digest, `environmentKey` keys on it, and
  > `fleet-consistency` treats it as MUST_MATCH. `CAPTURE_SETTINGS` in `nvda-logging.mjs` is the list.
  >
  > The first entry is **`speech.reportLanguage`**: at NVDA's default a WCAG 3.1.2 failure is announced as
  > a change of VOICE and no text at all. With the setting on, NVDA speaks the language — measured
  > 2026-09-05 on a real capture, `"Spanish (not supported), La ciudad duerme…"` followed by `"English"` on
  > the way out.
  >
  > **THIS LINE SAID `documentFormatting.reportLanguage` UNTIL 2026-09-05, AND THAT IS THE WRONG SECTION.**
  > Written to `documentFormatting` the setting LOOKED applied — `getSettings()` read it back — and NVDA
  > reads it from `[speech]`, so it was inert. *"Verifying that a setting was WRITTEN is not verifying it
  > is IN EFFECT."*
  >
  > **And turning it on is what made it recordable.** `getSettings()` returns only sections NVDA has
  > actually WRITTEN, so at defaults there is no `[speech]` entry for it at all and "off" is
  > indistinguishable from "never asked" — measured 2026-09-02.

  > **SPEECH RATE IS NOT A FREE OPTIMISATION**, and the reason is weaker than the first version of this
  > paragraph claimed.
  >
  > It said §18 had measured that a polite live region NEVER announces. **That is §18's FIRST headline and
  > it was refuted twice.** `not-working.md` carries FOUR sections numbered 18; the current one records
  > that a diagnostic pair — one `polite` region and one `assertive`, same checkbox — saw **both announce**.
  >
  > **What is actually true is a RATE: a live region reaches the delta 2 times in 6**, on an unchanged
  > page. **The intermittency is unexplained.**
  >
  > **And note how this went wrong.** Four sections share the number 18, and each one's reasoning is sound
  > enough to quote. This paragraph originally said *"read to the LAST section with a given number"* —
  > **backwards.** Settled by asking git: the four were committed at 04:41, 18:19, 19:29 and 19:46 on
  > 2026-09-01, and the file carries them NEWEST FIRST. The last one in the file is the oldest claim, and
  > it is the refuted one.
  >
  > **So: `git log -S "<the headline>" -- <file>` decides which of several same-numbered sections is
  > current.** A position in a file is a convention nobody wrote down; a commit time is a fact.

### Quick navigation can never reach the element the CARET IS ON

Found 2026-08-28 by `gate:probe-order`. `sweepEveryStructuralType` records it for landmarks — *"Quick
navigation cannot reach a landmark containing the caret -- NVDA searches by start position"* — and treats
it as a landmark quirk. It is not. **Every caret position silently costs one element of whatever type sits
under it, in BOTH directions**, so `collectByType` sweeping backwards and forwards does not save you.

The consequence is the uncomfortable half: **the default probe order does not work by design, it works by
accident.** `readWithRetry` leaves the caret at the bottom, past the last heading, so the backward sweep
reaches the `h1` from below and nothing is lost.

Measured, on three corpus pages, permuting the probes:

| caret after the previous probe | result |
|---|---|
| bottom (what the read-through leaves) | every heading collected |
| on the `h1` — where `Control+Home` puts it | **`h1` lost on all three pages**, including one that had been agreeing |
| inside a dialog — where `moveToContainingBrowseModeDocument` puts it | `h1` lost on both overlay pages |

`Control+Home` was tried first and made the gate worse — the anchor is `Control+End`.

### NVDA EATS THE FIRST ESCAPE, and `anchorToTop`'s Escape does not test what you think

Three facts about Escape, each found by capturing and each having produced a wrong answer first. They
matter to anything that asks whether a dialog can be left, which is WCAG 2.1.2's actual question.

- **After a focus probe, NVDA consumes Escape and the page never sees it.**
  `autoPassThroughOnFocusChange` switches focus mode on when focus lands on an editable, and Escape is
  flagged `ignoreTreeInterceptorPassThrough` *precisely so it stays reachable there*. `probeDialogEscape`
  presses **twice**: the first pays the toll, the second asks the question.
- **`anchorToTop`'s Escape is pressed in BROWSE MODE with focus on the body**, so a dialog that scopes its
  handler to itself — which is every real dialog — never sees it. `rules.ts` carried a paragraph claiming
  the opposite as a safety net, and that claim let the 2.1.2 rule accuse a conformant modal that closes on
  Escape and holds no operable control in its ring.
- **A sweep is browse mode and never moves DOM focus.** The dialog probe rides with `probeFocusOrder` for
  this reason and is gated on it.

**The general rule, and it is not about Escape.** A probe's precondition is established by *another
probe*, so where it sits in the sequence is part of its correctness.

### `evidence:check` compared the interaction channels BY COUNT — fixed 2026-09-01

`normalise` is `String(entry)`, which is `"[object Object]"` for every object, so mapping it over a list of
objects made every entry identical. Exactly two compared fields hold objects — `interaction.formChanges`
and `interaction.stateChanges` — and they carry the evidence for 3.3.1, 4.1.2 and 4.1.3.

Measured on the real function: a `formChanges` entry whose `after` went from `"Error: name is required"` to
`""` reported **SAME**, from the one gate that decides whether 2,122 cached captures may be kept. **When
you fix a shape, grep for the shape, not for the field.**

### Focus mode makes quick-nav keys TYPE THEMSELVES INTO THE PAGE

The worst evidence defect this project has had, and it ran for 2,122 captures with every check green.

NVDA has two modes. In **browse mode** single letters are navigation commands (`h` heading, `k` link, `f`
form field, `g` graphic, `l` list). In **focus mode** they are passed to the application. From
`browseMode.py`, not inference:

- `autoPassThroughOnFocusChange = boolean(default=true)` in `configSpec.py`, and `shouldPassThrough`
  returns True for `State.EDITABLE`. So a focus change into an editable control switches focus mode ON.
- `reason == OutputReason.QUICKNAV: return False` — quick-nav itself never switches it on. **Activating a
  control does**, because that is a real focus change.
- It STICKS. `QuickNavItem.moveTo` returns early, still in focus mode, whenever the next target is
  focusable.

So every sweep after an activation typed its own commands into the page under test. Decoded from
apache.org's search box:

```
FFffGGggKKkkLLll  =  Shift+F,Shift+F,f,f   Shift+G,…,g,g   Shift+K,…,k,k   Shift+L,…,l,l
                     formField prev/next   graphic         link            list
```

apache.org search-as-you-typed it, rendered "1 result for FFffGGggKKkkLLll", and this tool read that as a
page behaviour and reported a WCAG 3.3.1 failure. The finding was our own keystrokes.

**Measured cost on the corpus this invalidated:** 353 captures activated a control and then found 0 links,
0 graphics and 0 lists. And 125 pairs carried the artefact on **exactly one variant, never both** — always
the conformant one. All 125 are `form-error-*`; retrain after recapturing.

Rules that follow:

- **Restore browse mode after anything that activates a control**, and do not trust one remedy. Escape is
  NVDA's own route out, and it was **not enough on apache.org**, whose search panel behaves like an
  embedded document and needs `NVDA+Ctrl+Space`.
- **`nvda.press("Escape")`, never `nvda.perform(keyboardCommands.exitFocusMode)`.** Both are Escape on
  paper; only `press` worked, measured.
- **A one- or two-character phrase is proof of this fault, not noise.** `MIN_CONTROL_NAME_LEN = 3` silently
  skipped it with a comment calling it a "stray key echo". The sweep now reports `stopPhrase`.
- **`anchorToTop`'s comment already documented all of this.** The remedy was applied only to the
  post-submit re-read.

### A FACT STATED TWICE, and the copies drifted — five of these in one day

One fact written down in two or more places, where nothing compared them. Every instance was silent, and
three were found only because something unrelated failed.

| the fact | the copies | what it looked like |
|---|---|---|
| which probe a case wants | **six** hand-written hops: `pair()`, the manifest, the host runner, `server.mjs`, `capture-core`, and `evidence-check` | the probe never ran; the field it writes was simply absent |
| what an announcement's accessible NAME is | `namesOf` (case-matrix.mjs) and `comparableNames` (rules.ts) | `check-signals` said CONTAMINATED — the signal firing on the conformant page while the rule stayed silent |
| which rules ship | `rules.ts` source and `packages/judge/dist/rules.js` | `rules:gate` scored a rule the compiled bundle did not contain |
| which signal types exist | the `if`-chain in `signalMatches` and a REGEX in `acceptance-matrix.test.ts` that scraped it | the scrape matched nothing after a refactor, and passed |
| a case's page furniture | `withRealisticScale` keyed it on ARRAY POSITION — fixed, now an FNV-1a hash of the case ID | inserting a case re-sized every case after it |

**The fix is never "be careful", it is to make the copies unable to disagree.** In order of preference:
delete a copy; derive one from the other; pin them equal with a test when the duplication is forced.

**Inserting a case re-buckets that SUBTYPE's later cases** — this entry has said the opposite twice. It
first said "APPEND, never insert" (array position keying). Then furniture moved to a hash and it said
"insert freely" — verified by adding 60 cases and watching zero pages move. **Both were true when written,
and the second is now wrong.** Measured 2026-08-26: hashing the ID gives each case an INDEPENDENT 1-in-5
chance of the `namedField` bucket, so a seven-case subtype misses it entirely with probability 0.8⁷ = 0.21.
Furniture is now DEALT within the subtype: case *k* gets bucket *(offset + k) % 5*.

### Three criteria a static analyser structurally cannot reach

| | assessed | why markup cannot answer it |
|---|---|---|
| 2.4.1 | a skip link that is present and **inert** | a checker sees a link and a plausible `href` and passes it |
| 2.4.2 | the route changes and the **title does not** | the markup is valid at every instant; the failure is the TRANSITION |
| 2.4.3 | the tab order **contradicts the reading order** | the DOM has no reading order to contradict until something walks the page |

2.4.1's note here used to say "a skip link is the first focusable element and announces as one". W3C's
Understanding page is explicit that a skip link is NOT required: headings alone satisfy it (H69), landmarks
alone satisfy it (ARIA11). **Read the criterion before building the rule.**

Three measurement traps: the tab order is a CYCLE (compare each control's first visit); the focus probe
truncates at 12 stops on every corpus page, so "absent from `focusOrder`" almost never means
"unreachable"; and silence is not the signal you want — the stale-title page announced `"visited"`, which
names nothing about where the user is.

### A fix applied at ONE call site when the behaviour reaches several

| the behaviour | where the remedy was | where it was missing |
|---|---|---|
| focus mode makes quick-nav keys type themselves | `anchorToTop`, before the post-submit re-read | every sweep after an activation — 353 captures |
| guidepup 0.31 throws on `start()` of a live NVDA | `startScreenReader`'s catch, which adopts it | `ensureSpeechChannel`'s restart, which called `startFreshWithRetry` directly |
| speech must be settled before a delta baseline is read | `waitForAnnouncement`, at the END of the delta | the START — late speech credited to the activation |

A fourth has the same shape read from one step further back: the remedy was reachable and **its trigger
was never set**. `refreshBrowseBuffer` guards on `navigatedExistingWindow`, which nothing ever assigned
`true`. So it returned early on every capture ever taken.

**Confirm a capture-path change by its diagnostic MARK, not by a green result and not by a matching
`/health.code`.** The `ensureSpeechChannel` one presented as `500 {"error":"NVDA is already running",
"fault":null}` while `/health` reported `ready: true` with all four checks green. The bare message and the
null fault are what identified it: `startScreenReader` prefixes its failures with `"nvda.start failed:"`.

### A LIST OF FIELDS TO CHECK, and the one field with a different SHAPE

Found twice on 2026-08-29, in two tools, an hour apart. Both had a hand-written list of evidence fields
and both silently examined nothing for the one member that is an OBJECT rather than an array.

| the checker | what it walked | the field it could not see |
|---|---|---|
| `evidence:check` (`evidence-diff.mjs`) | `EVIDENCE_FIELDS`, via `Array.isArray(v) ? v.map(...) : []` | `interaction.routeChange` |
| `channelsPresent` (`criterion-coverage.ts`) | `INTERACTION_CHANNELS`, via `nonEmpty = Array.isArray(v) && v.length > 0` | `routeChange`, absent from the array while in the `EvidenceChannel` union |

`routeChange` is `{control, titleBefore, titleAfter, headingBefore, headingAfter}`, and it is **the whole
of 2.4.2's evidence**. Measured on `route-title-stale.good.json`: the capture carries the evidence and
`criteriaAssessableFrom` answered `BLOCKED: 2.4.2 -> routeChange`, on every capture ever taken.

A union and a parallel array cannot be checked by `tsc`, because every member of a wider union is a valid
element of a narrower array. The remedy is to DERIVE the arrays from an exhaustive `Record<TheUnion, ...>`,
which fails to compile until a new member is classified.

### A comment that names an ambiguity, above code that resolves it by assumption

| the comment said | the code did | measured cost |
|---|---|---|
| "an unchanged phrase is ambiguous between 'did not move' and 'moved to something announced the same way'" | stopped the sweep on the FIRST repeated phrase | **graphics 5 of 66** on a page with four identical avatar alts |
| "silence is unambiguous evidence of not moving" — true on an idle guest only | ended the sweep on one silent step | **headings 3 of 10**, no error anywhere |
| `beginsWithRole`: "a leading LANDMARK is context, not the control's own role" | stripped landmarks, not CONTAINERS | **a false 4.1.2 against a named button** |

The fix is the same each time: find the signal that is NOT ambiguous. NVDA **announces** the end of a page,
so `exhausted` is the sound terminus. A log delta proves speech is new, so it proves movement.

**Guest sizing is measured, not assumed: the VMs had 2 of the host's 14 vCPUs.** Raising them to 6 took a
real marketing page from "abandoned at the 280 s hard timeout" to 2:33.

### Two blind spots let a 1-in-125 contaminant into the corpus

`gate:stability` reported every canary stable while one capture of `filter-status-silent/bad` recorded
`after: "Energy results, document"` instead of the empty delta that IS the finding. Two independent gaps:
`repeat-capture` compared ten fields and not `formChanges`/`postSubmitFields`; and `repeat-capture` had no
`--probe-forms`/`--task`, so it could not activate a control at all. Both are fixed.

### Wait for the condition, never `sleep` a duration

The capture path had 18 bare `sleep()` calls against 3 polling loops, and one of them caused the worst
defect this project has had: a fixed wait expired early, the probe timed out, and the miss was recorded as
**"the page announced nothing"** — indistinguishable from a non-conformant disclosure.

**guidepup does NOT wait for speech to settle, and this file said it did.** `nvda.start()` with no options
gets `DEFAULT_CAPTURE = "initial"`, and `#processQueue` resolves on the FIRST spoken phrase, so later
utterances of the SAME announcement can still be in flight. `{capture: true}` is not a free upgrade — it
changes every log entry to all phrases joined, an evidence change and a full recapture.

`waitForSpeechQuiet` polls `spokenPhraseLog` until it has been unchanged for `SPEECH_QUIET_WINDOW_MS`.
Converted so far, ~5.4 s per capture. `ANCHOR_SETTLE_MS` and siblings are gone; every remaining `sleep()` in
`capture-core.mjs` is a poll interval or retry gap.

`SPEECH_RECONNECT_MS` (750 ms) and `NVDA_SETTLE_MS` (3 s) were worse than wasteful: a short guess did not
merely cost time, it triggered an NVDA restart or a false `SCREEN_READER_MUTE`. Both now poll to a budget
(6 s, 10 s). Verified `evidence:check` 48/48 SAME, so no recapture, and canaries stable 3/3 per page.

**Verify by importing the module.** Removing a constant that three other call sites still used left
`capture-core.mjs` throwing `ReferenceError` at import, and **neither `npm run lint` nor `tsc --noEmit`
caught it**. For `.mjs`, `node -e "import('./path.mjs')"` is the only real check.

### The speech channel is a socket, and a dead one looks exactly like a healthy NVDA

See `docs/adr/0034-the-speech-channel-is-a-socket-forced-to-fail-loud.md`.

Guidepup reaches NVDA over a **TLS socket to NVDA Remote on 127.0.0.1:6837**, and speech is *pushed* back
over it. Keystrokes are writes; speech is a read. So when that socket goes half-open, `nvda.next()` still
succeeds, nothing is ever spoken back, and NVDA looks completely healthy and says nothing.

Guidepup cannot notice: it reconnects only on a socket `error` event, a half-open TCP connection raises
none, and there is no keepalive, no read timeout and no heartbeat.

> **This section used to say the only way to rebuild the channel was `stop()` + `start()`, because
> `NVDAClient` "is not exported". That is wrong.** `NVDAClient.js` ends with `exports.NVDAClient =
> NVDAClient` — absent from the package *index*, not from the module. **Guidepup's reconnect logic already
> works; it is starved of its trigger.**
>
> So `speech-channel.mjs` hands it that event: `socket.destroy(err)` emits `'error'` and guidepup recovers
> itself, in **under a second instead of ~23 s**, without touching NVDA. `destroy()` with no argument emits
> only `'close'`, which guidepup ignores.
>
> This matters beyond speed: **repeated NVDA restarts are what produce the `nvdaHelperRemote
> (injection_terminate)` modal that wedges a guest**, so the expensive remedy was feeding the fault it was
> treating. `ensureSpeechChannel` now rebuilds the socket first and only restarts NVDA if the probe still
> hears nothing.

Measured across all three guests, 7 interleaved rounds each, same page, same tool:

| | median | IQR | recoveries |
|---|---|---|---|
| before | 36.7 / 42.0 / **93.7 s** | 9.1 / 9.0 / 20.7 | 0/7 / 1/7 / **5/7** |
| after | **12.4 / 12.4 / 12.3 s** | **0.1 / 0.6 / 0.3** | **0/7 all three** |

### A guest whose NVDA is broken looks perfectly healthy — watch `recoveries`

The worst worker fault this pool has had produced **zero failures**. One guest's NVDA went mute on
**4 of 4 captures**; the worker's retry absorbed every one, so `failures` stayed at 0. The only symptom was
**122.9 s per capture against a healthy peer's 40.6 s**.

`npm run worker:compare <page> <worker> <worker>` puts the phases side by side:

```
phase              w1      w2   spread
nvdaStart        19.1     0.0     19.1   <- the whole gap. 0 = NVDA reused; 19s = cold-started every time
windowsActivate  11.6    14.4      2.8
sweep             6.3     6.6      0.3   <- identical
```

`/health.vitals.recoveries` is the one number that rises while everything still appears to work. A run
retires a degraded worker automatically (`shouldRetireWorker`). The repair is `provision-nvda-worker.ps1`.

### A freshly booted worker used to fail its first capture, every time

Reproduced on two guests in one session: cold boot, capture 1 fails `NVDA is running but not speaking`,
capture 2 succeeds. The worker now retries once itself, on a fresh screen reader, before answering the
caller (`worker-recovery.mjs`).

### What degrades is NVDA's speech channel, not the VM — and it fails on a survival curve

NVDA can stop speaking while still answering keystrokes. It is **stochastic, not a counter**. The
corpus — 1,939 captures carrying a reuse counter, across real dataset runs:

```
reuse count:  2-5   6-10  11-15  16-20  21-24   25
captures:     480   460    382    321    242    54     nvdaRecycle fired 51 times
```

Roughly **45% of instances do survive to the `MAX_CAPTURES_PER_NVDA = 25` recycle**. A tight loop on a
memory-pressured host (30 back-to-back captures of one page) showed a much lower tail (lifespans 6, 5, 5,
9, 1); **do not generalise from that dataset** — an earlier version of this section did, claiming NVDA
"dies about every 5 captures", which the corpus refutes.

**Leave `MAX_CAPTURES_PER_NVDA` at 25.** Reuse is causal: with `reuseScreenReader:false`, 8 of 8 captures
ran clean with no mute at all, but a fresh NVDA per capture costs ~48 s against ~25 s reused.

The read now stops after `MAX_SILENT_STEPS` (8) consecutive silent advances, and `readWithRetry` refuses to
re-read a screen reader already found silent. That rule needs two signals: silence only ends a read when
NVDA *also* said nothing at startup AND nothing substantive has been heard yet.

### Recovery is keyed on fault CODES, never on message text

`capture-faults.mjs` defines `FAULT.SCREEN_READER_MUTE` and `FAULT.SCREEN_READER_START_FAILED`;
`captureFault()` attaches one to the thrown Error. This replaced a regex over `error.message`, which could
not discriminate: reword the message in capture-core and recovery stops working in production, while the
unit tests keep passing because the string they assert on lives in the test file.

### "The worker is dead" is usually a wedge, not a death

If `/health` answers but every capture returns 429 `a capture is already in progress`, the worker is
*wedged*, not dead. This cost two days of misdiagnosis. A hard capture timeout now abandons the hung
capture, releases `busy`, and cold-starts NVDA.

**What put it there: restarting NVDA repeatedly.** NVDA responds with a modal dialog on the guest
desktop, which blocks input, so the next capture hangs. Hence: **nothing may restart NVDA while a worker is
idle.**

## Before any corpus run: `npm run gate:stability` — the incident

Five canary pages, captured repeatedly, compared by CONTENT. It exists because the corpus carried a
nondeterministic artefact for weeks with every check green. Edge's autofill draws a suggestion icon inside
recognised inputs; NVDA announces it as an embedded object appended to the field (U+FFFC).

**And `probeForms` submits forms, so the profile LEARNS**, and the rate climbs as a run proceeds — measured
at 3%, then 8%, then 31% of affected captures, with **26 good/bad pairs disagreeing about it**.

Every existing check stayed green because they all count, and the counts never moved. Suppressed now with
command-line flags, not Edge policies (the policy equivalents had already drifted).

### A canary that cannot express the fault is worthless

This was got wrong three times in one day: verified an autofill fix on a page that does not auto-focus its
input (12 clean captures proved nothing); measured the artefact on a page with no date field at all; and
compared guest `.4` at 4096 MB against `.6` at 3072 MB and read the difference as a code change.

## A metric computed on data that shares the flaw cannot see the flaw

The most expensive thing learned on 2026-08-22. The trained heads see 384 encoder dimensions of ONE
announcement plus **29 document-level features of the whole capture**. When a feature is 0 on every
training positive of a subtype, the head may give it a large negative weight at no cost. Measured on the
shipped weights: `4.1.2:unnamed-control` scored the byte-identical announcement at **0.924042** on two W3C
pages and **0.452519** on a third, because the third has layout tables and `table_present` is worth −1.26
logits.

**225 such free vetoes across all 13 heads.** Held-out acceptance, `npm run eval` and `rules:gate` are all
blind to this *by construction*. See `docs/adr/0015-one-defect-per-page-taught-the-scorer-to-veto.md`.

**Furniture plateaus, for a definitional reason.** A feature that IS a failure never appears on a
conformant page. Below 178 needs pages that fail TWICE. **The abstention floor saved this from being a
false clean** — a missed page was out of support at 0.6978, so the tool abstained.

## The things 2026-08-24 cost, and none of them were the model

A day spent chasing "12 false accusations on GOV.UK" that the tool never made.

1. **THE NUMBER WE STEERED BY MEASURED SOMETHING THE PRODUCT DOES NOT DO.** `calibrate-abstention.mjs`
   read `record.predictions` straight out of `score.py` and called every true one a FALSE POSITIVE. The
   CLI routes findings through `criterionOutcomes`, where an unmapped model finding becomes `cantTell`. So
   the whole real-page calibration — and ADR 0019's headline — described accusations that were referrals.
   Third instance of one defect: `JUDGE_BACKEND` defaulted to `codex` while the Action shipped `local`; the
   abstention sweep scored raw predictions; `npm run eval` resolved the SHIPPED artefact always. **Before
   optimising any number, run the path a user runs and check the number is the one they would see.**

2. **THE ANNOUNCEMENT ORDER DEPENDS ON HOW THE CARET GOT THERE.** Measured over 300 captures, with no
   overlap whatsoever: structural sweeps are name-first 884/0; the arrow read-through is role-first 0/880.
   NVDA's `getPropertiesSpeech` appends name→role→states, and browse-mode arrow navigation reverses it for
   the focused object. `packages/evidence/src/announcement.ts` is the single grammar, told its channel
   rather than inferring it, validated on **6,555 cross-channel comparisons at 0.08% disagreement**.

3. **THE CORPUS CANNOT EXPRESS WHAT REAL PAGES DO — four times in one day.** "Details" as a component name
   (corpus uses vague words ONLY in the failing sense); a named iframe (no corpus page has one); a link
   mid-list with no prefix of its own (corpus lists too short); a search combo box unchanged after Enter
   (six combo-box records). `npm run corpus:starvation` now reports word-sense monopoly.

4. **A LESSON LEARNED AT ONE LAYER, REPEATED AT THE NEXT, AT FOUR TIMES THE COST.**
   `screenreader_features.py` carries `TOGGLE_ROLE` and the comment explaining Enter is not a combo box's
   activation — cost 3 false positives left implicit. The new state-change RULE reproduced the identical
   bug and cost 12 wrong assertions.

5. **A ZERO CANNOT VETO, so "A and not B" must be computed, never handed over as two features.** The
   promotion gate refused a candidate on 2.4.4: 27 false positives, precision 0.841. `vague_link_present`
   (1.0, pushes up) and `vague_link_without_context` (0.0, correct, but `0 x weight = 0` can never pull
   down) — a linear head only ADDS. Removing `vague_link_present` took 2.4.4 to 0 FP and `2.4.6` to
   1.000/1.000 in the same change.

6. **THE THRESHOLD IS SET BY THE SINGLE WORST NEGATIVE, so one record reads as a model regression.** The
   retrain above also moved `3.3.1` from 15 missed findings to 24, dropping a link-text feature that was
   genuinely re-fitted, not a weakened head. `choose_threshold` takes the lowest cut reaching zero false
   positives — an extreme order statistic pinned by the single highest-scoring conformant record.
   `development.precision` reading 1.000 for thirteen heads is not thirteen pieces of evidence; precision
   below 1.000 can only mean the fallback fired. Three heads sit at 0.95, the top of the grid — one more
   negative crossing it leaves them no valid cut at all.

## 2026-08-25: eleven false positives on real pages, and they were all ONE defect

Driven to zero on 86 conformant real pages. `2.1.1` went from 66% of pages to 0, `2.4.3` from 71% to 6%,
`4.1.2` on training pages from 56% to 3%. **Every one was two things compared that describe different
moments, or different alphabets:**

| what was compared | and why they could not match |
|---|---|
| a COUNT sweep, read as an ordering | `collectByType` walks backwards from the caret then forwards, deduplicating — the transcript is a read-through and is ordered by construction |
| a toggle's name, before and after it was pressed | `probeDisclosure` activates unconditionally, so the sweep records BOTH labels while the focus probe only sees the second |
| a page open for one probe, closed for another | a capture is not an instant |
| Tab against a widget that shares one tab stop | native radio groups and ARIA's roving tabindex give a GROUP one stop |
| an icon-font glyph (U+E604) in one channel and not the other | the U+FFFC lesson in a second alphabet |
| `clickable` wedged into a container prefix | NVDA interleaves a STATE between containers |
| one element announced with TWO roles | a named graphic PLUS an unnamed button — an empty name IS the 4.1.2 finding |
| a container role used as a NAME | the disambiguation is CASE |
| markup read aloud, against prose | `isImage` matched the word *image* inside the markup |

**The one that matters most: a rule can be clean because it has gone DEAF.** The transcript rewrite took
2.4.3 from 71% of conformant pages to 6% — and caught 0 of the 4 corpus records it owns. NVDA WRAPS a
field's label and role onto separate transcript lines, and requiring both on one line found nothing.
`rules:gate` refused it — free ground truth, 1,183 conformant records with 0 false positives.

**What is CORRECT and must not be "fixed":** 18 findings remain on 86 conformant pages, each checked
individually — 4 real assertions, 8 referrals on combo boxes (NVDA announces the VALUE where a name would
go), 5 real order differences, 1 real filename-as-alt.

**What was checked and REFUTED:** bag size is not the driver — padding 40 conformant pages produced 0
accusations at every size across 200 trials.

**"The rule never fired" and "the rule never had its evidence" are different answers.** `rules:coverage`
reported `1.3.1` NEVER FIRED ANYWHERE for as long as that rule existed. The fault was in the exporter:
`addMissingHeadings` needs `census.heading === 0`, and `diagnostics` was correctly on the exporter's
`FORBIDDEN_INPUT_KEYS`, so the census never reached the exported record. `score-rules.ts` scored
`record.input`, the MODEL's allowlist, so the gate could not exercise ANY rule reading evidence the model
is deliberately denied. **CLOSED 2026-08-26.** `ruleEvidence` is now a SIBLING of `input`.

**A diagnostic that cannot report itself, six times in one evening:** `fleet:deploy` reported files wrong
when the fetch had failed and reported success; `UNREACHABLE` workers were rebooting from the deploy
before; a lab-status count was the wrong run's file; a Jinja traceback hid a guard that had fired
correctly; a merged metric conflated a cookie banner with a stuck page; `wrong-page` errors carried no
detail because `captureFault(code, message)` was called `(message, code)`. **The rule that covers all six:
when a diagnostic surprises you, suspect the diagnostic before the system.**

## The rule that cost the most to learn

**A check must never reject evidence whose absence is the finding.** `custom-control` bad pages are
div-based fake buttons with no `<button>`, so NVDA finds no form controls — that absence *is* the 4.1.2
failure. A guard that rejected captures whose requested probe produced nothing failed 44 cases in a live
run.

### The mirror image: a probe that CRASHES also produces an empty field

`9cabfb4` added `ctx.trips.count` to `collectByType`; the postSubmit call site spelled out only
`label, onItem, deadline`, so `ctx.trips` was `undefined` and the function threw on its own first line. The
catch was not empty — it logged `postSubmit ERROR …` — but nothing read `sweepLog`. `postSubmitFields` came
back `[]` on all 2,122 captures, 604 of them with a logged crash. **A caught-and-logged error is not a
handled error.**

## Diagnosing a guest without `utmctl exec`

`utmctl exec` wraps QEMU's `guest-exec`, known-unreliable on Windows. Everything you would have reached for
it is served over HTTP: `curl -s http://<guest-ip>:8765/diagnostics | jq .` — `edgeProfile` (found 348 MB of
`BrowserMetrics`), `processes`, `edgePolicy`, `screenReader` (config plus log AND `previousLog`), `disk`,
`serverLog`.

## What state is the CORPUS in — `lab:inventory`

Every other moving part had a status command; the corpus had none. Answered by ad-hoc SSH Python about
eight times on 2026-08-25, once reading the wrong field. It answers: is the corpus homogeneous (with
COUNTS); are the exports current (against the captures, not the clock); what schema is each model stamped
with (from safetensors metadata); is a schema migration open.

**It reports WHERE it read from, because it lied on its first run** — a laptop said "NO candidate" while
the lab held one.

**Backing up the corpus — THREE STEPS, each verifies the one before by reading it back.** The transport is
two hops because of CREDENTIALS — the token stays on the control plane. `npm run lab:job -- -e
job=corpus-snapshot` archives on the lab, `npm run lab:fetch -- -e artifact=corpus-archive` brings it to the
control plane, and `npm run corpus:release -- --archive=runs/fetched/<name>.tar.gz` uploads it and then
**downloads it back** to prove the asset is complete and readable, not just accepted — `npm run
corpus:release -- --verify=corpus-<stamp>` answers the same question for an old release. `corpus:snapshot`
lists its own archive with `tar -tzf` and refuses on a shortfall, because `tar` exits 0 on a short archive —
a 417 MB snapshot once extracted to 4,959 of 5,445 JSON files with no error anywhere.

## Producing evidence is a PIPELINE — the incident that forced it

Every stage already existed and was supervised; what did not exist was the ORDER, which lived in
somebody's head — the same defect `lab:retrain` closed one layer down. Retyped by hand on 2026-08-25 that
sequence produced: a fleet deployed at `main` while the lab ran a branch, four boxes rebooted for a ref
nobody had pushed, an `ANSIBLE_EXIT=2` masked by `| tail`, and three jobs run four commits behind.

**`lab:everything` and `--pipeline=full` were TWO SPELLINGS OF THE WHOLE CHAIN, and they disagreed.** `full`
names thirteen jobs; the npm chain named six. `shortcuts`, `acceptance` and `applicability-audit` were
simply absent — and `acceptance` is what writes the report `promote:model` requires.

**For a long unattended run, prefer `lab:job -e job=everything` over `--pipeline=full`.** Measured
2026-08-26, five local watchers were killed during one capture, and each time the unit survived exactly as
designed while the orchestration did not.

> **BUT DEPLOY THE FLEET FIRST — the job cannot do it for you.** Measured 2026-08-27: a worker file
> changed, `everything` was dispatched without deploying, and it died 30 seconds in with `5 stale
> worker(s)`.

### A capture now REFUSES a fleet that is not running this checkout

Measured: after `MAX_TAB_STOPS` went 12 → 150, the real-page corpus held both populations at once, and
every gate was green. `npm run worker:code` had answered this correctly the whole time and was a separate
command a human must remember — remembered by hand four times in one day.

`assertFleetRunsThisCheckout` now runs at the boundary of both capture entry points. **The synthetic
corpus is the worse half**: dataset captures are cached, and `workerCode` is deliberately outside the cache
key.

### `lab:job` checks the fleet BEFORE dispatching, for the jobs that would actually need it

The earlier check ran on the LAB, inside the job's own script — one round trip too late: worker files
merged, a capture dispatched, a wait, a refusal — twice in one day. `lab-job.mjs` now asks every worker's
`/health` over HTTP first, no SSH needed. `captureBearingJobs` is DERIVED from `lab-job.yml`'s own text.

## Every other command — the full justification per row

- **`worktrees:prune`** — a rule maintained by hand ("prune after every merge") reached 36 worktrees and
  4.4 GB the day after a 28-tree hand-prune.
- **`primary:update`** — built for issue #126, after three real incidents in one night where the primary
  ended up holding a branch by accident.
- **`fleet:recover`** — measured 2026-09-02 on a11y-worker-6: a capture began at 03:00 and was still
  `current` at 06:32, with every readiness check green and `busy: true` for three and a half hours.
  `fleet:deploy` cannot fix a wedged capture: the restart loses the race for port 8765 and the old process
  keeps serving a matching `/health.code`. This kills node outright and PROVES it by requiring
  `vitals.uptimeMinutes` to have fallen.
- **`fleet:inventory-install`** — on 2026-09-06 the CONTROL PLANE pulled main, lost `inventory.yml`
  (untracked/gitignored per #54), and `fleet:deploy` printed `skipping: no hosts matched` and **exited 0**
  with ten workers untouched.
- **`fleet:hours`** — measured 54.11 worker-hours across 5,395 captures, median 27.4s, p95 134.2s. Built
  after the obvious method (summing per-case times in `capture-progress.json`) turned out to describe data
  that does not exist: 0 of 1,623 cases carry any time field.
- **`capture:explain`** — a capture carries ~30 diagnostic marks and NOTHING read them; every question was
  answered by ssh and a guess at the JSON shape, producing four wrong answers in one session.
- **`scorer:verify`** — the script existed and NOTHING invoked it; a security check on the one artefact
  this project publishes had never run.
- **`release:provenance`** — found the shipped model at 2,485 records while both pending changesets said
  2,403 and were byte-identical to each other.
- **`scorer:retired-heads`** — `3.3.2:unnamed-form-field` almost shipped absent with nothing accounting for
  it, a legitimate removal that still cost an evening because nothing made the reasoning travel with the
  change.
- **`scorer:shortcuts:baseline:candidate`** — the deliberate-act baseline against the CANDIDATE rather than
  the shipped weights; without it a new head can never be promoted, since `candidate:gate` blocks any head
  missing from the baseline and the shipped baseline cannot contain a head that has never shipped.
- **`training:export-acceptance`** and **`training:export-acceptance:all`** — the held-out set, never
  cached because those runs exist to test whether NVDA's output is still stable. The `:all` one exports
  EVERY repeat, because the evaluator reads every repeat — two jobs feeding one consumer is a drift
  generator, and produced a held-out score computed half on each.
- **`training:evaluate-acceptance:candidate`** — one of three stages that existed only as Ansible job argv,
  so the npm chain could not run it and silently did not; it writes the report `promote:model` requires,
  and without it a run ends at "held-out acceptance has not been run" with every earlier gate green.
- **`promote:model`** — "refuses when a previous promotion is still uncommitted" claimed that for months
  and the script did not import `node:child_process` at all, so it could never look at git.
- **`corpus:distribution`** — `postSubmitFields` was `[]` on all 2,122 captures with every check green,
  because an empty field is not a malformed one and no count ever moved.
- **`corpus:unclosable-map`** — `scorer:shortcuts` reported 57 veto pairs with no way to say which were
  worth corpus work before this existed.
- **`mutate`** — built 2026-09-06 after two agents got the mutation-check sequence wrong in one day: one
  destroyed uncommitted work with `git checkout --` mid-check, and two guards shipped GREEN against the
  very defect they were written for.
- **`board:report`** — the two figures neither GitHub nor git can supply (the last gate result, the
  fleet-hours total) are quoted from `docs/board/reported.json`, where the agent that RAN the command
  records its own output. Measured on its first edition: a peer's 17 (since 09:00) and the script's 42
  (since midnight) were both right, over different windows.
- **`board:summary-check`** — asks the same question of `reported.json`, which carries far more: the gate
  outputs, the fleet-hours figure, every achievement. It happened three times on 2026-09-06 that a complete
  record sat on the wrong side of a merge, each caught by a person typing `git show origin/main:...` by
  hand. It names the entries that differ, keyed on each section's own identity field.

## Make the failure bubble up — the incidents

`lab:reset` exists because promoting leaves the lab dirty and every later job then refuses to pull.
`lab:collect-promotion` exists because fetching the four promoted artefacts and matching the changeset's
real name was a procedure a human had to remember — measured cost: three round trips on 2026-08-30 and
four more on 2026-09-01, both times over the changeset's NAME.

**KEEP THE NAME `promote:model` GAVE THE CHANGESET.** Renaming the committed file to match the lab's fixed
it at once. Two names for one artefact is the fact-stated-twice shape in its cheapest form.

`lab:log` exists because reading one audit's output took eleven hand-written `awk | sed | grep` pipelines
in a single session, one of which silently matched nothing.

### The order that would have saved the evening: AUDIT FIRST, THEN FIX

| what I reasoned | what the audit said |
|---|---|
| `plain_heading_candidate` separates perfectly | it misses 13 of 108 on the full corpus |
| `probeTables: false` on 62 cases means the table evidence was never captured | `table_position_only` reads the TRANSCRIPT — 49 of 49 carry it |
| 52 `vague-link` records are missing evidence | the feature was deleted that morning; the DECLARATION is stale |

Two of those three would have led to a full recapture of 62 cases for nothing.

## A flag nobody reads, and an extra var nobody reads

Two instances of one defect: **an argument the receiving thing does not know is DISCARDED, so the default
runs and reports success.** Ansible silently drops an unused extra var — `-e out=varied` on a job that
never reads `out` looked like it worked. Every `.mjs` CLI here ignored an unrecognised flag, because they
all parse argv by looking for what they know. `refuseUnknownFlags` (`cli-flags.mjs`) refuses it now, and
**ALL 54 are guarded as of 2026-09-06**.

`lab_jobs[job].argv` cannot be inspected, because reading it RENDERS it — a job whose command says
`{{ only }}` dies with `'only' is undefined'` while being asked whether it needs `only`. `\b` inside a
Jinja string literal is a BACKSPACE, found by mutation, never by reading.

## A GUARD THAT ALREADY EXISTED, and a weaker check substituted for it

| what happened | the guard that was already there |
|---|---|
| a backtick in a comment inside a PowerShell template literal, twice, ten minutes apart | NOTHING — a real gap, now `mjs-parses.test.ts` |
| 32 corpus messages validated OFFLINE against the page SOURCE, reported as correct — NVDA speaks "e.g." as "e dot g." | `check-signals` runs every signal against real CAPTURES and caught it |
| a commit landed on a branch I then deleted | `git branch -d` REFUSES an unmerged branch; I used `-D` |

**The rule: a cheap pre-check is for deciding whether to bother running the real one, never for concluding
the real one will pass.**

## Verifying changes — the incidents behind the checklist

This project had eight verifications and only two were automatic: `capture-check` was required after any
change to `capture-core.mjs` and had never run once; `release:gate` was broken from the day it was written
(it invoked the acceptance evaluator with no `--data`); and the acceptance gate sat FAILING while three
other gates were green.

> **"Resolves to `dist`" never said WHOSE, and that gap cost real time on 2026-09-06.** A worktree whose
> `node_modules` is a symlink to the PRIMARY checkout's resolves every `@a11y-witness/*` import to the
> primary's `packages/*/dist`, not the worktree's own — so `npm run build` in your own worktree changes
> nothing a cross-package tool reads there. `orchestrator` read the primary's two-hour-stale `dist`,
> concluded a generator was broken, and was about to dispatch a worker at a defect that did not exist.
> **Verify WHOSE, by resolving the exact specifier you import**:
> `node -e "console.log(require.resolve('@a11y-witness/judge'))"`.

**RESTORE FROM A COPY, NEVER `git checkout --`. Three times in one night, 2026-09-06.** Twice in one
session it destroyed a feature mid-build (`capture-status.mjs`'s whole `--since` implementation, rebuilt
from saved patches; then `lab-job.yml`'s progress declarations); a peer session hit it the same night on a
branch with no prior commit to fall back to.

**The same defect exists in PYTHON, and it decided a mutation check wrongly on 2026-09-03.**
`importlib.util.spec_from_file_location` honours `__pycache__`, so pytest and a bare `python -c` both
executed a STALE COMPILE, and a mutation that "survived" led to a working guard being deleted as dead code.

**Count-based checks cannot see content rot.** A readiness gate once overwrote the first line of every page
with the document title, deleting the h1's announcement everywhere: `"heading, level N"` phrases fell from
105 to 15 across 90 captures and every check stayed green, because the phrase count had not moved.

`npm run evidence:check` reported `2 compared: 2 same ... safe to ship` and exited 0 on 2 of 48, because a
concurrent run stopped the page server two captures in. The `examinedNothing` guard's own comment named the
general rule and then covered only `compared === 0` — 2 of 48 is the middle it left open.

## Environment facts — the fuller record

`JUDGE_BACKEND` defaulted to `codex` until 2026-08-04, and the GitHub Action already shipped `local` — so
`npm run eval` and `npm run eval:gate` measured a rented model and never once measured ours. Flipping it
immediately surfaced two real defects invisible to an LLM that only reads transcripts.

**A capture is ~12.4 s**, measured across all three guests over 7 interleaved rounds each. That is *after*
the speech-channel probe; before it the same pool measured 36.7 / 42.0 / 93.7 s.

**The largest single phase is `windowsActivate`, at ~10 s, and it is Edge starting.** Three routes were
evaluated:

| route | verdict |
|---|---|
| Overlap NVDA's start with the wait for Edge's window | **worthless.** `nvdaStart` is ~0 s on a warm capture, and ~83% of captures reuse NVDA. |
| Re-enable Edge's startup boost | **cannot work alone.** Cleanup kills Edge *by image name*, including the pre-warmed background process. |
| Keep Edge alive between captures | **the only real option**, and it subsumes startup boost. |

The shape that should work: keep the Edge process, open a fresh `--app` window per capture, close only that
window. Not yet built — testable only on the VM.
