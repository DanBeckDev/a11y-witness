# ADR 0034: The speech channel is a raw TLS socket, and recovery forces it to fail loud rather than restarting NVDA

## Status

Accepted. Implemented in `speech-channel.mjs` and used by `ensureSpeechChannel`; recorded in CLAUDE.md's
"The speech channel is a socket, and a dead one looks exactly like a healthy NVDA" section as an incident
history, including a correction of the section's own earlier (wrong) claim — but never as a decision record
stating what was tried and rejected before landing here.

## Context

Guidepup reaches NVDA over a TLS socket to NVDA Remote on `127.0.0.1:6837`. Keystrokes are writes to that
socket; speech is *pushed back* over it. When the socket goes half-open — the TCP connection is dead but
neither side has sent a FIN/RST — writes still succeed, nothing is ever spoken back, and NVDA looks
completely healthy while answering nothing. Checked directly against guidepup 0.29.2's source: it
reconnects only on a socket `'error'` event, a half-open connection never raises one, and there is no
keepalive, no read timeout and no heartbeat in its client.

This was the pool's most expensive fault before the fix: recovery took ~23 s per occurrence via a full NVDA
restart, and — worse — **repeated NVDA restarts are themselves what produces the
`nvdaHelperRemote (injection_terminate)` modal dialog that wedges a guest**, so the expensive remedy was
feeding the exact fault it was meant to treat.

## Decision

**Force the dead socket to emit the event guidepup already listens for, rather than replacing guidepup's
recovery logic.** `speech-channel.mjs` wraps `tls.connect` to capture the socket instance — `NVDA#client`
and `NVDAClient#socket` are genuine `#private` class fields and unreachable by reflection, so wrapping the
factory function is the only way in — and on a failed liveness probe calls `socket.destroy(err)`. That
emits `'error'`, which guidepup's own reconnect path (disconnect, reconnect, rejoin the channel, reset the
failure counter) already handles correctly; it was only ever starved of its trigger.

`ensureSpeechChannel` probes the channel *before* committing to a capture — clear the log, `readLine`, check
a phrase came back — and only restarts NVDA itself if the socket rebuild still produces silence. So a
restart is the last resort, not the first response.

## Alternatives rejected

**Restarting NVDA on every detected mute (`stop()` + `start()`).** This was the original design, and
CLAUDE.md's own record corrects an earlier wrong belief about *why* it was necessary: the section used to
claim `NVDAClient` "is not exported" so a socket-level fix was impossible. That was false —
`NVDAClient.js` exports it from the module, just not from the package's public index — and believing it
delayed the real fix. Once rejected, the cost of the original design is measured directly: recovery via
restart took ~23 s and, far more expensive, repeated restarts are the mechanism that wedges a guest with a
modal dialog blocking all further input.

**`socket.destroy()` with no argument.** Considered and rejected during implementation, not merely
untried: `destroy()` with no error argument emits only `'close'`, which guidepup's client ignores entirely.
Only `destroy(err)` emits `'error'`, the event its reconnect logic is actually listening for. This
distinction is asserted directly in the test suite rather than left as an implementation detail, because it
is the whole mechanism — get it backwards and the "fix" does nothing.

**Trusting guidepup's own reconnect logic to fire unaided.** Rejected by measurement: it never fires on a
half-open socket on its own, because nothing about a half-open TCP connection raises a Node `'error'`
event without help.

## Consequences

- Measured across all three guests, 7 interleaved rounds each, same page: median capture time fell from
  36.7 / 42.0 / 93.7 s (IQR up to 20.7 s, recoveries 0/7, 1/7, **5/7**) to 12.4 / 12.4 / 12.3 s (IQR ≤ 0.6 s,
  **0/7 recoveries on all three**). `windowsActivate` also fell 12.8 s → 2.1 s, consistent with a half-dead
  NVDA having been contending for window focus.
- The probe costs ~0.7 s per capture and never had to restart NVDA once in that measurement — the gain is
  from the bad state not arising, not from a faster recovery when it does.
- The mechanism is inferred from guidepup's source, not from its documented public API — reading the
  dependency's actual code (316 lines in `node_modules`) is what found the fix, after two documented wrong
  guesses from its public surface.

## What would falsify this

If `/health.vitals.recoveries` climbs again on the fleet without a corresponding change to this mechanism,
the inferred cause (a half-open socket, cured by forcing an `'error'` event) is wrong or incomplete, and the
21-capture sample this was validated on was too small to have ruled out an intermittent recurrence — this
was noted as a real limitation at the time, not resolved since.
