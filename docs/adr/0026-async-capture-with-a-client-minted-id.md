# ADR 0026: Async capture with a client-minted idempotency key, not a long-held connection

## Status

Accepted 2026-08-29. Cited as an existing pattern by ADR 0013 ("keeps that pattern and changes only the
carrier: the handle") without ever being decided anywhere itself. Superseded a synchronous design; see
`docs/capture-protocol-plan.md` for the day of measurement that forced this.

## Context

A capture takes 12–520 seconds. The original design modelled it as a single synchronous HTTP request:
`POST /capture` held one connection open for the whole capture and wrote status and body together at the
end. That one design choice was the root of four otherwise-unrelated-looking defects on one measured day:
a transport dropping 9 of 40 responses (fixed only by a keepalive, because the connection sits silent for
minutes and NAT/Wi-Fi reap it as idle), nine of ten capture clients discarding completed work because the
answer existed only in the one socket that had just been lost, a client-timeout ladder that exists purely
because the request is long-held, and *"the worker is dead" vs "wedged"* — two days of misdiagnosis
recorded in CLAUDE.md, because the client could see the end of a capture and nothing in between.

## Decision

**A capture is an asynchronous job with a client-minted handle, not a synchronous request.**

- `POST /capture {captureId, async: true}` returns `202 {captureId}` immediately. The id comes from the
  CLIENT and has to: a worker-minted id would be returned inside the very response that can be lost.
- `GET /capture/<captureId>` replays the stored result verbatim: 404 unknown, 202 still running, or the
  original response — success or failure — exactly as it would have been received synchronously. A failed
  capture is stored exactly like a successful one, so a replay after a lost acknowledgement is
  indistinguishable from the original and the worker's `fault` code survives the round trip.
- `GET /progress` reports the live phase and is deliberately answerable *while the capture is running*,
  turning "the worker is dead" into "it is 400 s into a sweep" from the client's own output, without a
  separate status tool.
- The store is in-memory, bounded at 8 entries, never persisted; eviction skips anything still running.
  404 therefore means "not retained here", never "never ran" — a capture that finished and was evicted, or
  survived a worker restart, reads identically to one that never started, and re-issuing the case is the
  correct recovery either way (see CLAUDE.md's 2026-09-05 correction of this exact point).

This did not require a new mechanism: the 404/202/store shape already existed, "used only as a fallback"
per `docs/capture-protocol-plan.md`. The decision was to make it the PRIMARY path rather than an escape
hatch nine of ten clients never took.

## Consequences

- No client holds a connection longer than one poll, which removes the whole class of long-connection
  defects listed above by construction rather than by patching each symptom.
- The recovery path is now the NORMAL path, exercised on every capture rather than only on failure — a
  path that runs only when something breaks is one that rots, which this repo has paid for before.
- Additive on the wire: `captureId`/`async`/`fault` are optional fields an older worker ignores, so host
  and guest can be deployed independently. This did **not** move `CAPTURE_PROTOCOL_VERSION`, asserted by a
  test — nothing about what the evidence *means* changed.
- Reusing an id after its result is retained silently executes again with no conflict check. A caller must
  mint a fresh id per logical capture; every real call site already does, via `randomUUID()`.
- The keepalive that had been credited with fixing the transport-drop rate stays, on precautionary
  grounds, but is recorded as masking an **unexplained** cause rather than a diagnosed one — removing it
  entirely stopped reproducing the fault, which the original causal story (NAT reaping an idle LAN
  connection) does not actually explain, since there is no NAT on the path at all.

## Alternatives considered

- **WebSockets.** Solves liveness (a live channel for progress) but not durability: a socket that dies
  mid-capture still loses the result unless a store holds it, so `captureId` would be needed regardless and
  the system would maintain two mechanisms instead of one. Also makes the server stateful per open
  connection, at a fleet scale where that statefulness buys nothing not already available from `/progress`.
- **A message bus (Kafka or similar).** Its target — high-throughput deployments partitioned across a
  cluster — is roughly six orders of magnitude past this project's peak (~20 concurrent captures,
  ~0.16 jobs/second). It would also need a broker cluster running beside the corpus, the release weights
  and the deploy key, which is exactly the surface ADR 0012 exists to keep clear. The one property a bus
  would genuinely give — work dynamically assigned to workers rather than a static split — is already
  provided by `worker-pool.mjs`'s shared-queue design, independent of the transport question this ADR
  answers.
- **Keep the synchronous design and only lengthen timeouts.** Rejected: the 560 s client-timeout ladder and
  undici's 300 s header cap are themselves a bug class that exists only because a request is long-held;
  lengthening a timeout treats the symptom the async design removes structurally.
