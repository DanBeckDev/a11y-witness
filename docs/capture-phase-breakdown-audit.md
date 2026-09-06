# The 3.9x, checked against what is actually on disk

**2026-09-06, `agent/phase-breakdown-3-9x`, feeding issue #21.** Offline, read-only on `runs/`, no
fleet, no lab. This is a measurement, not a fix, and the premise check below is the finding that
matters most: **the 3.9x cannot be reproduced from anything in this repository**, and the population
needed to answer the question at all is absent from this machine's local corpus copy.

## What the 3.9x actually claims

Issue #21 (`#T1 — Explain the 3.9x: 12.4 s documented against ~48.7 s measured`): account for the gap
between "the **12.4 s** per capture documented in CLAUDE.md and the **~48.7 s** measured on the current
fleet." The issue's own text already flags the risk: *"the 48.7 s is inverted throughput, not a direct
median... the direct median comes from this stage too, and the two may not agree."*

Read literally, that is comparing three different things at once:

| | 12.4 s (CLAUDE.md) | 48.7 s (issue #21) |
|---|---|---|
| population | the **deprecated 3-guest local UTM pool** on one Mac, one page, 7 interleaved rounds (CLAUDE.md: *"measured across all three guests over 7 interleaved rounds each"*) | "the current fleet" — no run, date, or command is cited on the issue |
| statistic | a **median** with IQR, from `worker:compare`'s side-by-side sampling | **inverted throughput** (1 / captures-per-second), by the issue's own admission — a different statistic that need not equal the median of the same data |
| protocol | measured *after* the `ensureSpeechChannel` probe landed, well before the current bare-metal fleet existed | unstated |

**No document in this repository derives 48.7.** Searched `docs/`, `docs/board/`, and the repo generally
for `48.7`, `3.9x`, and the issue's own title text — the only local hits are this file and CLAUDE.md's
`12.4` (`grep -rn "48.7\|3.9x" docs/` — no match outside this audit). So half of the ratio is
unsourced from where I sit, and the premise check the brief asked for stops here for that half: it
cannot be verified offline, only the 12.4 s side and what a local sample of the fleet actually shows.

## What is on disk, and what it is not

```
$ node phase-breakdown-analysis.mjs runs/screenreader-dataset/captures   # ad hoc, read-only, not committed
total files: 2178, parse errors: 0, usable: 2178
```

Composition by worker host and `provenance.captureProtocol`:

| host | n | fleet box? | protocol(s) seen | `capturedAt` window |
|---|---|---|---|---|
| `192.168.64.4` | 1888 | no — deprecated local UTM guest | `5` | 2026-08-06 .. 2026-08-09 |
| `192.168.64.6` | 220 | no — deprecated local UTM guest | `5` | 2026-08-07 .. 2026-08-08 |
| `192.168.64.5` | 14 | no — deprecated local UTM guest | `5` | 2026-08-06 (one day) |
| `a11y-worker-2` | 16 | **yes** | `6, 11, 13, 14` | 2026-08-27 .. 2026-09-02 |
| `a11y-worker-3` | 16 | **yes** | `6, 11, 13, 14` | 2026-08-28 .. 2026-09-02 |
| `a11y-worker-5` | 10 | **yes** | `6, 11, 13` | 2026-08-27 .. 2026-09-02 |
| `a11y-worker-6` | 8 | **yes** | `6, 11, 13` | 2026-08-28 .. 2026-09-01 |
| `a11y-worker-4` | 6 | **yes** | `6, 11, 13` | 2026-08-27 .. 2026-09-01 |

(Fleet hosts cross-checked by address against `packages/control/ansible/inventory.yml`, which is the one
place those addresses belong — this table names the boxes, not their addresses, per the project's own
"fact-stated-once" rule.)

**97.4% of this local corpus (2,122 of 2,178) is `protocol 5` on the retired 3-guest UTM pool, captured
2026-08-06 to 2026-08-09** — reading "all captures on disk" blind, as the brief warned against, would
report a number dominated by a machine class and a protocol version nobody is asking about.

**The fleet-only slice is 56 captures, spread over only 5 of the 10 current boxes, at protocols 6/11/13/14,
captured 2026-08-27 to 2026-09-02.** `a11y-worker-7` through `-11` (enrolled 2026-09-04) appear zero
times. **Protocol 16 — the recapture this brief and issue #21 are actually about — appears zero times in
this local `runs/` copy.** This machine's copy is not merely stale by some minutes; it predates the
recapture in progress entirely. **The question issue #21 asks cannot be answered from this vantage
point** — it needs the authoritative corpus, which is `orchestrator`'s to read under the current split,
not a laptop's local mirror.

## What this DOES answer: the current fleet, at an earlier protocol, small n

The window: **56 captures, 5 of 10 boxes, protocols 6/11/13/14, 2026-08-27T22:54Z .. 2026-09-02T15:45Z.**
Every number below carries that — it is not "the fleet today" and not "the 3.9x's 48.7 s," it is the
closest this local disk gets to either.

```
WALL(in-capture)   n=56   p25=49.8s   p50=59.3s   p75=67.5s   p95=83.1s   IQR=17.7s
```

That is close in *order of magnitude* to issue #21's 48.7 s (near this sample's own p25), which is
consistent with 48.7 s being a real fleet figure from around the same era — and it is **not** close to
the 12.4 s side of the ratio, confirming the 12.4 s comparator is the wrong-population half regardless
of which statistic 48.7 s turns out to be.

Per-host spread, same window (protocols mixed per host, see table above) — reported because a pooled
median across 5 boxes is exactly the kind of number `worker:compare` exists to warn against reading
alone:

| host | n | p25 | p50 | p75 | p95 |
|---|---|---|---|---|---|
| `a11y-worker-2` (.107) | 16 | 53.1 | 57.2 | 67.6 | 86.0 |
| `a11y-worker-3` (.59) | 16 | 62.8 | 67.6 | 75.6 | 94.9 |
| `a11y-worker-4` (.175) | 6 | 47.1 | 49.8 | 62.3 | 64.1 |
| `a11y-worker-5` (.224) | 10 | 52.1 | 57.5 | 60.0 | 64.5 |
| `a11y-worker-6` (.90) | 8 | 41.9 | 46.5 | 65.6 | 68.3 |

Five boxes, five different medians spanning 46.5–67.6 s, none of them close to a factor of two from each
other — real per-box variance, on n too small per box to call any single one an outlier.

## Phase breakdown, fleet-only sample (n=56), median + IQR

Only phases with a usable sample are listed; `n` is how many of the 56 captures carry that phase (most
probes are conditional — `focusContext`/`typedFeedback`/arrow-nav variants ran on very few pages in this
sample and their rows should be read as anecdotes, not distributions).

| phase | n | p25 | p50 | p75 | p95 | IQR | NVDA round trip? |
|---|---|---|---|---|---|---|---|
| `sweep` | 56 | 14.4 | 19.8 | 22.3 | 28.8 | 7.9 | **yes** — quick-nav walk, a keypress and a wait for NVDA's announcement per stop |
| `routeChange` | 18 | 16.7 | 17.1 | 17.5 | 21.0 | 0.9 | **yes** — activates a control, re-reads title/heading via NVDA |
| `focusOrder` | 34 | 9.6 | 12.9 | 14.0 | 16.7 | 4.4 | **yes** — Tab, wait for the announcement, repeat |
| `readThrough` | 56 | 8.9 | 10.5 | 11.8 | 13.2 | 2.9 | **yes** — arrow-key read-through, one NVDA phrase per line |
| `afterStart` | 56 | 5.9 | 6.4 | 6.8 | 8.0 | 0.9 | **yes** — `nvda.lastSpokenPhrase()`, confirmed by reading `recordStartupHealth` (`capture-setup.mjs`) |
| `establishBrowseMode` | 40 | 4.4 | 5.8 | 6.0 | 6.2 | 1.6 | **yes** — a keypress into NVDA, waited on |
| `dialogEscape` | 12 | 2.9 | 3.5 | 4.4 | 5.1 | 1.5 | **yes** — Escape pressed twice, NVDA's response read |
| `browserReady` | 12 | 0.9 | 1.0 | 1.8 | 12.5 | 0.9 | **no** — Edge process/window readiness, confirmed by name and by CLAUDE.md's own account of this phase family |
| `documentReady` | 56 | 0.6 | 0.6 | 0.7 | 1.5 | 0.2 | **no** — page-load wait over CDP |
| `speechChannel` | 56 | 0.6 | 0.6 | 0.6 | 0.7 | 0.0 | **yes** — `ensureSpeechChannel`'s own probe: send a phrase, wait for it back |
| `pageSettled` | 56 | 0.4 | 0.5 | 0.5 | 0.5 | 0.0 | **no** — page-load settle wait |
| `windowsActivate` | 56 | 0.3 | 0.3 | 0.3 | 0.3 | 0.0 | **no** — confirmed by name and by CLAUDE.md ("wait for Edge to exist and take focus") |
| `browseBufferRefreshed` / `bufferReady` | 44 | 0.3 | 0.3 | 0.3 | 0.8 | 0.0 | **no** — NVDA's browse-mode buffer rebuild is local bookkeeping, not a round trip that waits on speech |
| `pointerParked` | 56 | 0.2 | 0.3 | 0.3 | 0.8 | 0.1 | **no** — a mouse move, OS-side |
| `browserReused` | 44 | 0.1 | 0.1 | 0.1 | 1.2 | 0.0 | **no** — a DevTools Protocol re-point, not speech |

**Confirmed by reading the code, not inferred from the name alone**, for the two easiest to get wrong:
`afterStart` calls `nvda.lastSpokenPhrase()` (`capture-setup.mjs`, `recordStartupHealth`) — a real read
of the speech channel, despite sounding like a browser-startup phase. `windowsActivate` is exactly what
CLAUDE.md already measured it as: Edge existing and taking focus, no NVDA involved.

**The round-trip phases dominate the median**, and the four largest — `sweep`, `routeChange`,
`focusOrder`, `readThrough` — are all NVDA round trips, each bounded by the same wall-clock speech-channel
cost this repo has already measured and tuned (`ensureSpeechChannel`, `waitForSpeechQuiet`). The us-bound
phases in this sample (`browserReady`, `documentReady`, `pageSettled`, `windowsActivate`,
`browseBufferRefreshed`/`bufferReady`, `pointerParked`, `browserReused`) sum to under 2.5 seconds of
median cost combined — **on this fleet, at this protocol, in this sample, the phases we control are not
where the time is going.**

**A caveat this repo's own rule requires stating**: medians do not sum linearly, and not every phase runs
on every capture (`routeChange` ran on 18 of 56, `focusOrder` on 34 of 56 — both are conditional probes).
Adding the phase medians above (≈80 s) exceeds the fleet sample's own WALL median (59.3 s) for exactly
that reason — it is a rough accounting of where cost concentrates, not an identity, and should not be
read as one.

## What would close issue #21 properly

1. **Find where 48.7 s actually came from.** It is not derivable from anything in this repository. Whoever
   wrote it into the issue has the run, the command, and the date; without that this number stays
   unsourced no matter how the phases are decomposed.
2. **Re-run this same phase breakdown against the authoritative corpus once protocol 16 has enough
   captures**, which needs `orchestrator`'s access, not a local `runs/` copy — this machine's copy
   contains none of it.
3. **`npm run worker:compare -- <page> <worker> <worker> --rounds=7`** (the issue's own acceptance,
   fleet-gated) as the live cross-check the issue already asks for, once the above is available — never
   two `bench-capture` printouts read side by side, which is how a 2x difference was mis-attributed to
   the wrong phase before.

## What this closes, and what it leaves open

Closed: whether "the 3.9x" is explainable from anything currently in this repository — it is not, because
one side of the ratio (48.7 s) has no derivation on record and the other side (12.4 s) is confirmed to be
measured on a retired machine class under a different protocol and a different statistic. That mismatch,
not a phase table, is the actual finding.

Left open, and not closeable offline: the phase breakdown of the CURRENT fleet at the CURRENT protocol,
because this local corpus contains zero protocol-16 captures. `docs/backlog.md` carries a row for this.
