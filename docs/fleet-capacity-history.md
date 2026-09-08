# Fleet Capacity History

This file holds the local-worker-VM capacity/memory measurements moved out of CLAUDE.md during the #458
split. CLAUDE.md keeps only the operative rule — the local VM path is deprecated, the bare-metal fleet is
used instead — and this file keeps the reasoning and the numbers, exactly as CLAUDE.md's own text already
frames it: "kept because the MEASUREMENTS behind it are still the reasoning for how the fleet is run".

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
- ~~**Your own tooling is on the same host.**~~ **NOT ANY MORE, AND THIS LINE OUTLIVED ITS REASON.**
  It was true when the workers were UTM guests on this Mac: `npm test`, a build or a browser competed
  with them, and in one 18-capture run the spikes tracked host activity rather than worker age. The
  fleet is ten bare-metal boxes on the network now, so a local build competes with nothing that
  matters. **Kept struck through rather than deleted, because the MEASUREMENT is still the reason the
  section above it exists** — and because this line was propagated into six agent briefs on 2026-09-05
  as "hold `npm test`, a capture is live", which was ceremony with no basis. A rule whose premise has
  moved reads exactly like a rule that still applies; this section's own header is the deprecation
  lesson one paragraph up.

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
