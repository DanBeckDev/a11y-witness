# ADR 0030: Fleet code-version parity is a deploy PRECONDITION, never a capture cache key

## Status

Accepted. Split off from ADR 0025's cache-key decision, which forward-references this ADR
("code hash is a deploy PRECONDITION, never a cache key"); not previously recorded as a decision anywhere.

## Context

Two questions sound alike and are not the same question: *is this capture's evidence still valid to keep?*
(a cache-key question, ADR 0025) and *is the fleet running the code I think it is running right now?* (a
precondition question, this ADR). Conflating them was tried by omission — nothing checked the second
question at all for a while — and the cost was measured directly: after `MAX_TAB_STOPS` changed and
`collectByType` began recording a new diagnostic mark, the real-page corpus held both the old and new
populations at once, indistinguishable except by whether a capture happened to carry the new mark, because
nothing had refused the stale workers that produced the old population.

`npm run worker:code` already answered this correctly — comparing each worker's `/health.code` against the
local checkout — but it was a separate command a human had to remember to run, and it was forgotten by hand
four times in one day.

## Decision

**The worker's code hash (`codeVersion()`) is a precondition checked at the boundary of every capture entry
point, and it is never a capture cache key.**

- `assertFleetRunsThisCheckout` (`worker-code-check.mjs`) runs at both capture entry points — not one — and
  refuses to proceed when a worker's code hash disagrees with the caller's local checkout.
- `--allow-stale-workers` is the explicit, visible override; it says so in the output rather than passing
  quietly.
- A hash mismatch does not by itself say which side is wrong. If the local worker source is dirty against
  `HEAD`, the checkout is the odd one out and deploying would ship uncommitted work (an uncommitted
  `CAPTURE_PROTOCOL_VERSION` bump among it would invalidate the whole cache for nothing) — the guard detects
  this and inverts its own advice rather than always telling the caller to redeploy.
- `workerCode` is deliberately excluded from both the capture cache key (`capture-cache.mjs`) and from
  `fleet-consistency.mjs`'s `MUST_MATCH` set. Those answer "is this evidence still valid" and "are these
  guests interchangeable with each other" — a comment-only diff changes the hash and neither question's
  answer, and folding it in would invalidate 1,061+ cached pairs over a reworded comment.

`worker-code-check.test.ts` discovers every lab module that `POST`s to `/capture` and requires each to be
classified as a corpus writer (must check) or a diagnostic (must never — a diagnostic must not be able to
take the pool offline), so a new capture client cannot slip past the classification silently.

## Consequences

- A capture that would have run against stale code is refused before it starts, rather than producing
  evidence that is silently unattributable to any known commit.
- The synthetic (dataset) corpus is the case this protects most: dataset captures are cached, and
  `workerCode` being outside the cache key means a stale guest's capture, once written, is reused forever
  with nothing recording which code produced it — unless the precondition refused it up front. Real-page
  captures never cache, so a stale worker there is at least overwritten next run; the guard still applies to
  both because a mid-run mixture is itself bad evidence.
- The override exists and is named, because a comment-only hash drift is a real, harmless case that would
  otherwise force an unnecessary deploy — the guard's job is to make the operator aware of the mismatch and
  its likely direction, not to forbid proceeding outright.

## Alternatives considered

- **Fold the code hash into the capture cache key.** Rejected: this is the same mistake ADR 0025 rejects for
  the same reason — a value that changes on a reworded comment, with no effect on what NVDA announces, is
  exactly the kind of key input that turns a cache off in practice.
- **Rely on `npm run worker:code` being run by hand before every capture.** Rejected by direct measurement:
  it existed, answered the question correctly, and was still forgotten four times in one day because it was
  a step nobody was forced to take. CLAUDE.md's own housekeeping principle applies: "a rule that asks a
  human to remember something is a rule that gets broken."
- **Refuse unconditionally on any mismatch, with no override.** Rejected: a mismatch caused only by an
  uncommitted, evidence-neutral change (a comment, a log line) is real and common enough during development
  that a hard, unoverridable refusal would make the guard itself the thing people route around — the
  documented `--allow-stale-workers` keeps the override visible instead of pushing people to bypass the
  check entirely.
