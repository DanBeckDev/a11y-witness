# ADR 0028: Recovery is keyed on fault codes, never on message text

## Status

Accepted. Cited in practice by CLAUDE.md's "Recovery is keyed on fault CODES, never on message text"
section, which carries the mechanism and the two literature references; not previously recorded as a
decision anywhere.

## Context

The worker's failures are not exceptional — a mute NVDA is a routine outcome, hit on roughly 55% of NVDA
instances before their scheduled recycle. Both the guest (`worker-recovery.mjs`) and the host
(`capture-decisions.mjs`) need to tell a mute screen reader apart from a start failure apart from every
other fault, because the response to each is different (retry once locally vs. surface it vs. evict the
worker).

The first version of that discrimination was a regex over `error.message`. It broke the moment the message
at the throw site was reworded, because the tests asserting on it held their own copy of the string rather
than reading it from the throw site — so the tests kept passing while production recovery silently stopped
matching.

## Decision

**A fault is identified by a fixed, enumerated code, never by parsing its message.**

`capture-faults.mjs` defines `FAULT.SCREEN_READER_MUTE`, `FAULT.SCREEN_READER_START_FAILED`, and the rest
of the enumeration. `captureFault()` attaches one to the thrown `Error`; the worker returns it as `fault`
in the 500 body; `worker-recovery.mjs` (guest-side retry) and `capture-decisions.mjs` (host-side
accept/retry/evict) both switch on the code, never on `error.message`.

`fault` is additive on the wire: an older worker that predates the field omits it, and a host that predates
reading it ignores it — so host and guest deploy independently, the same shape as `captureId`/`async` in
ADR 0026.

## Consequences

- Rewording a message at a throw site cannot silently break recovery — nothing downstream reads it.
- A test asserting on the fault code exercises the real discriminating value (`failIfScreenReaderIsMute` is
  exported specifically so tests drive the real gate, not a copy of its string).
- Adding a new fault means adding a new enum member and classifying it at every switch, rather than hoping
  a new message happens to match an existing regex — the failure mode moves from "silently stops matching"
  to "compiler/reviewer must classify it".

## Alternatives considered

- **Regex over `error.message`.** Rejected by direct experience: it was the original mechanism, and a
  message reword broke it while its own unit tests — holding a duplicate of the string rather than reading
  the throw site — kept passing.
- **Structured error subclasses (one `Error` subclass per fault).** Not adopted: CLAUDE.md's code
  conventions explicitly reject importing Java-OO machinery (class-per-noun hierarchies) into this
  functional TS/MJS codebase; a flat enum plus one factory (`captureFault(code, message)`) gets the same
  "programmable through specific types" property *Secure by Design* §9.2.2 and *The Product-Minded
  Engineer*'s "Repackage Errors" argue for, without a class hierarchy.
