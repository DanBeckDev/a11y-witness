# The capture protocol, and the work that falls out of getting it right

Written 2026-08-29, after a day whose fixes were all downstream of one design choice.

## Why this plan exists

`docs/determinism-plan.md` closed D1–D7 and the gates pass. On the way it surfaced four defects that were on
no list, and **every one of them was a consequence of the same thing**:

> **A capture is modelled as a synchronous HTTP request. It is a 12–520 second asynchronous job.**

`POST /capture` holds a connection open for the whole capture and writes status and body together at the
very end (`send(res, 200, {...})`). Nothing crosses that connection in between. What follows:

| what it cost | why it exists |
|---|---|
| the transport dropped **9 of 40 responses**, driven to 0 only by a keepalive | the connection is silent for minutes, so NAT/Wi-Fi reap it as idle |
| **nine of ten** capture clients discarded work the worker had completed | the answer exists only in that one socket; lose it, lose the capture |
| the 560 s client-timeout ladder, and undici's 300 s headers cap | an entire bug class that exists only for long-held requests |
| *"the worker is dead"* vs *"wedged"* — two days of misdiagnosis, per CLAUDE.md | the client cannot see progress, only the end |

**The correct design is already 80% built and used only as a fallback.** `GET /capture/<id>` returns
404 / **202 still-running** / the original response verbatim. `GET /progress` reports the live phase and is
deliberately answerable *while busy* — its own comment says *"the whole point is to be answerable while a
capture runs"*. `captureId` is already client-chosen, idempotency-key style. **Only `fleet-status` consumes
`/progress`; no capture client does.**

### Why not WebSockets

Asked twice, and the second time deserved a real answer rather than the first one repeated. The honest part
of the challenge lands: today we pay WebSocket's cost — a long-lived session — and take none of its
benefits, no ping/pong, no streaming, no progress. That is incoherent, and it is what prompted the question.

But *High Performance Browser Networking* is explicit that WebSocket does not escape the problem:

> "Long-lived and idle sessions occupy memory and socket resources on all the intermediate servers… **Deploying WebSocket, SSE, and HTTP/2, each of which relies on long-lived sessions, brings its own class of new operational challenges.**"

And it costs something this fleet cannot afford at twenty boxes — *Building GenAI Services with FastAPI*:
*"WebSocket keeps a socket open on both the client and the server for the duration… this also makes servers
stateful, which makes scaling trickier."*

The decisive point: **WebSocket solves liveness, not durability.** A socket that dies mid-capture still
loses the result unless a store holds it — so `captureId` would be needed anyway, and we would maintain both
mechanisms. Async request-reply deletes the long connection instead of managing it, and makes the store the
normal path rather than the emergency one.

| | long connection | live progress | survives a drop | server state |
|---|---|---|---|---|
| **today** | yes | **no** | only via recovery | none |
| WebSocket | yes, managed | yes | still needs the store | **stateful per capture** |
| **async poll** | **none** | yes, via `/progress` | store IS the path | bounded store (exists) |

### Why not a message bus

Also asked, and the instinct behind it is right while the tool is wrong.

Kafka's own target, per *Foundations of Scalable Systems*, is "high-throughput, scalable application
deployments" partitioned across a cluster. Our peak is **~20 concurrent captures, ~0.16 jobs/second** — six
orders of magnitude below what that machinery is for. It is not free either: *"a single broker is a single
point of failure… the solution is broker and queue replication"*, so avoiding a SPOF means running a cluster
beside the corpus, the release weights and the deploy key — the surface ADR 0012 exists to keep clear. And
*"Kafka is a particularly highly configurable platform. This can be both a blessing and a curse."*

**But the property a bus would give us is real, and we already have it.** *Software Engineering at Google*
describes our shape exactly — a corpus run is a batch job — and prescribes "work spread into small chunks
and **assigned dynamically to workers**". `worker-pool.mjs` is that, and says so:

> "A shared queue rather than a static split, so a slow item does not leave a worker idle while another still has a backlog."
> "The unit of work is an ITEM… this module knows an item is indivisible."

So: no broker. Item C below is the actual work.

---

## The order, and why it is this order

**Root before symptom.** Items A and B are the design; C–E are defects introduced or exposed while patching
around it. Doing C–E first would be more patching.

**A is additive and reversible; do it behind a flag.** `captureId` and `fault` both shipped that way, and the
protocol version does not move because *what the evidence means* does not change — no recapture.

---

## A. Make async the PRIMARY capture path

**Status: MET 2026-08-29.** `gate:stability` **PASS, all 8 of 8** on the async path across the fleet.

**The proof is arithmetic, not a green result.** A poll is milliseconds and a capture is 12-40 s, so at a
15 s keepalive delay the first probe never fires during a capture at all — and the run also passed with the
delay at 60 s, where it provably did nothing. The plan asked for the keepalive to be REMOVED as the test;
this is the same claim established without leaving the sync escape hatch unprotected.

`POST /capture {async: true}` returns `202 {captureId}` immediately. The client polls `GET /capture/<id>`
until it is not 202, and may read `/progress` meanwhile. Old behaviour stays until every client has moved.

**Done when:**

- A capture never holds a connection longer than a poll. `A11Y_SYNC_CAPTURE=1` reverts, and says so.
- The ten clients go through `captureTolerantly`, which becomes a poller rather than a POST-and-hope.
  Its recovery semantics are already right and already tested — 404 re-issues, 202 waits, 500 carries the
  worker's fault code.
- **The recovery path is now the NORMAL path**, so it is exercised on every capture rather than only on
  failure. A path that runs only when something breaks is one that rots — this repo has the receipts.
- `gate:stability` and a corpus run both PASS with `sockets recovered: 0` **and** the keepalive removed,
  because with no long-lived connection there is nothing to keep alive. Removing it is the proof the root
  was the root; if losses return, the diagnosis was wrong and this says so.
- `CAPTURE_PROTOCOL_VERSION` is NOT bumped, asserted by a test. Nothing about the evidence changes.

**Cost:** worker route + client poller + migrating ten call sites. Estimate half a day, most of it the
migration, which is mechanical because they all now share one client.

---

## B. Progress reaches the caller, not just `fleet:status`

**Status: MET 2026-08-29.** `onProgress` reads `/progress` between polls, so a caller sees the phase and its
age while the capture runs. A failed progress read never fails the capture — pinned by a test, because
trading a real result for a diagnostic is the wrong way round.

`/progress` has existed since forever and one status command reads it. With A, a polling client can surface
the phase it is in — which is the difference between "the worker is dead" and "it is 400 s into a sweep".

**Done when:**

- A long capture prints its current phase and how long it has been there, from `/progress`.
- A wedged worker is distinguishable from a slow one **in the client's own output**, without `fleet:status`.
- The two-day misdiagnosis in CLAUDE.md is reproduced against this and takes one look.

---

## C. The gates use the pool that exists, not the static split I wrote

**Status: MET 2026-08-29.** `shardAcrossWorkers` is deleted; both gates call `drainAcrossPool`. Measured on
the fleet: work landed 2/2/1/1/2 rather than a fixed deal. The test that proves a slow box takes fewer items
asserted `w1 < fast1 + fast2` at first — which a static 4/4/4 deal satisfies trivially, so the mutation back
to a static split PASSED. It now asserts strictly fewer than EACH fast box.

`shardAcrossWorkers` deals items up front — 8 canaries over 5 boxes as 2,2,2,1,1. A box three times slower
still gets 2 and everything waits for it. `drainAcrossPool` already solves this and its own header explains
why static is wrong. I built the inferior mechanism beside it, which is the shape this repo pays for most
often, committed while fixing other instances of it.

It matters at scale, not at 5: this fleet has heterogeneous hardware and already **retired `a11y-worker-1`
for being too slow**.

**Done when:**

- `gate:stability` and `gate:probe-order` call `drainAcrossPool`; `shardAcrossWorkers` is DELETED, not left
  beside it.
- The indivisible ITEM is preserved and asserted: a canary's repeats stay on one box, and both probe orders
  of a page stay on one box. `drainAcrossPool`'s contract already enforces this — the caller names the item.
- Measured on the real fleet with an artificially slowed box: the dynamic pool finishes faster than the
  static split. **If it does not, this item is wrong and the measurement says so.**
- The gates inherit eviction and requeue, which the static split never had.

---

## D. Find out why our network reaps in seconds, not minutes

**Status: the original DIAGNOSIS IS REFUTED, and the losses are unexplained. Four candidate causes
eliminated by measurement, including my own.**

| candidate | verdict |
|---|---|
| the worker's `keepAliveTimeout` (Node default 5 s, never overridden) | **real, and not the cause.** An idle connection closes at 6.0 s — but the response had already arrived at 0.0 s, so that is an idle-AFTER-response close and a capture is mid-response |
| the worker's `requestTimeout` (Node default 300 s, below both the 520 s capture timeout and the 560 s client budget) | **refuted.** `requestTimeout` 3 s with a response after 5 s returned 200, so it governs receiving the REQUEST |
| NIC power management on the boxes | **refuted.** `PnPCapabilities 8` already correct |
| **"a silent connection is reaped by NAT" — MY OWN diagnosis** | **REFUTED TWICE OVER.** By TOPOLOGY: the control plane is `192.168.1.15/24`, every worker is `192.168.1.x/24`, and the route is `link#14` — direct, no gateway hop. **There is no NAT between these hosts at all**; it happens at `192.168.1.1` on the way out. And by MEASUREMENT: 0 of 23 lost with keepalive explicitly OFF — 8 sequential, then 15 across five boxes at once, the exact condition the 9/40 came from. At the old 22% rate P(0 in 23) = 0.4% |

**The literature was quoted correctly and applied to the wrong network.** *High Performance Browser
Networking*'s "most mobile carriers set a 5-30 minute NAT connection timeout" is about mobile carriers and
the public internet. It was cited here — twice, approvingly — for a LAN with no translation in it. The
quotation fitted the SYMPTOM, so the mismatch went unnoticed; it took someone saying *"I am confused as all
are LAN connections"* to see it. **Research grounds an argument; it does not check that the argument is
about your system.**

**The keepalive was credited for a fix it is not shown to have made.** Losses went 9/40 → 0 when it landed,
and the causal story was never tested by REMOVING it. Tested now, without it, the fault does not reproduce
at all — so the rate genuinely changed, and the keepalive is not demonstrably why. A transient network
condition fits the evidence as well as anything.

That is the "a green result vouches for the mechanism" trap, committed inside the work that kept finding it
elsewhere. The keepalive stays for the sync escape hatch on precautionary grounds, labelled
**unexplained rather than fixed**.

**Item A is unaffected**, and this is the useful part: async removes long-lived connections entirely, so it
is immune to this fault whatever caused it. A structural fix does not depend on the diagnosis being right —
which is the strongest argument for preferring one.

### The fourth measurement error became a guard

`refuseIfBusy` refuses to sample a worker that is not `ready`, because the rule did not work:

```
a page-status audit        :5050 held by capture:check with a different root -> 4 false 404s
a transport probe          against a box running a gate -> 12 straight 429s read as timings
an idle-reap measurement   timed keepAliveTimeout instead of the capture case
a capture-reap measurement against a busy fleet -> "responses" at 0.0-1.6 s
```

Every one produced a NUMBER, which is what makes it dangerous: a measurement that fails loudly is harmless,
and one that returns a plausible figure gets believed. Keyed on `ready` and never `ok` — `ok` only means the
HTTP server answered, and a worker answered it while NVDA could not start.

The keepalive works — 9 recoveries to 0 — but it is set to **15 seconds**, and *High Performance Browser
Networking* says: *"Most mobile carriers set a 5–30 minute NAT connection timeout… **If you find yourself
requiring more frequent keepalives, check your own server, proxy, and load balancer configuration
first!**"*

We needed one twenty times more aggressive than its guidance. **That is evidence about our path, not about
NAT in general**, and the keepalive may be masking a misconfiguration rather than fixing it. Item A makes
the keepalive unnecessary, so this is not urgent — but an unexplained number is how a fault comes back
somewhere else.

**Done when:**

- The actual reap interval is measured — hold an idle connection open and time the drop, over Wi-Fi and
  over Ethernet — rather than inferred from capture failures.
- Whatever is doing it is NAMED: the AP, the router, or the boxes' own stack. "Something reaps at N seconds"
  beats a working keepalive with no explanation.
- If it is Wi-Fi specific, that is recorded as a fact about running the control plane from a laptop, which
  is a standing concern here anyway.

---

## E. `gate:probe-order` confounds ORDER with TIME — add the control

**Status: MET 2026-08-29** in code and unit-proved; the live-page run is the remaining confirmation.
Mutation-checked three ways, including the one the plan named as the failure mode to watch: matching the
control on exact PHRASES rather than on the FIELD makes it inert, and an inert control looks exactly like a
clean gate.

The gate captures a page twice, changing the probe order — and letting time pass. So a difference could be
either, and on `tfl.gov.uk` the clock ticked `22:43` → `22:47` and a disruption banner appeared between the
two. The gate correctly refuses to call that an ordering fault, which is why it reports PAGE-MOVED and can
never pass with a live page in the list.

The remedy for a confound is a CONTROL, and this repo already owns the instrument: `gate:stability` repeats
an identical capture to measure the noise floor. The same trick, applied to the comparison next door:

```
A₁ (default)  ->  B (focus-first)  ->  A₂ (default)

diff(A₁, A₂)   what TIME alone does          <- the control
diff(A₁, B)    what time AND order did       <- the treatment
```

An ordering fault is what the treatment shows and the control does not. Checked against the two live cases
already measured:

| page | control | treatment | verdict |
|---|---|---|---|
| `tfl.gov.uk` | clock ticks, banner appears | same clock, same banner | explained by time — **PASSES** |
| `nls.uk/join/` | nothing: the sweep opens the panel both times, 10 stops each | focusOrder 10 -> 150 | not explained — **ORDER**, correctly |

The control spans a LONGER window than the treatment (t=0→2 against t=0→1), so it slightly over-estimates
drift. That is conservative in the right direction for a tool that asserts: it cannot invent an ordering
fault, and may miss a marginal one.

**Done when:**

- Three captures per page, in the order `A₁, B, A₂`, so the control brackets the treatment rather than
  following it.
- A difference present in BOTH is attributed to time and does not fail the gate; one present only in the
  treatment is an ordering fault. PAGE-MOVED stays for the case where the fingerprint says the page's shape
  moved, which is a different statement from content drifting.
- **Reproduce the fault before trusting the verdict:** `tfl.gov.uk` must PASS, and it must be shown that it
  passes because the clock appears in the control — not because the comparison went blind. A synthetic pair
  where only the treatment differs must still FAIL.
- `nls.uk/join/` still reports an ordering effect. If the control silences that too, the control is too
  wide and this item is wrong.
- The gate can therefore reach PASS with live pages in the list, which is what makes it a gate people read.

**Cost:** +50% captures on this gate (3 per page rather than 2). Across the pool that is most of one extra
round, not a wall-clock problem.

---

## Already open, and unchanged by any of this

From [`not-working.md`](./not-working.md), listed so this plan is not read as the whole backlog:

| | |
|---|---|
| **§1 the shipped weights** | trained on 2,485 records; both changesets say 2,403 and are byte-identical. `release:provenance` correctly refuses. **The gate is fixed; the DATA is wrong.** Closing it means promoting the lab's gated 2,487-record candidate — a major release, and the maintainer's call |
| **§2 free vetoes** | 41 closable, needing corpus work rather than a fix |
| **§6 scorer on a user's pages** | not a defect: an unmeasured region |
| **§8 publishing** | nothing has ever been published |

---

## How to know this plan worked

One command, and one number:

```bash
npm run gate:stability          # PASS, sockets recovered: 0, WITH THE KEEPALIVE REMOVED
```

The keepalive removal is the whole test. If losses stay at zero without it, the long-lived connection really
was the root and A fixed it. If they return, the diagnosis in this document is wrong — and that is a result
worth having, stated in advance so it cannot be explained away afterwards.

Two cautions, both learned the hard way this week:

- **A green result is not confirmation of a mechanism.** `refreshBrowseBuffer` passed three `capture:check`
  runs while inert. Every item here needs a diagnostic that distinguishes "did not need to act" from "never
  ran" — which is why `sockets recovered` is printed even when it is zero.
- **Do not measure while something else is running.** Three measurements were invalidated that way in one
  day: a page-status audit against a port another run had rebound, a transport probe that got twelve `429`s,
  and a keepalive test that passed because Node's own HTTP *server* calls `setKeepAlive`.
