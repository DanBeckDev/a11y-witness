---
name: a-number-from-the-apparatus
description: A number produced by the measuring setup — a fixture, a placeholder, a quoted commit message — looks exactly like a measurement; ask where it came from, not whether it is right.
metadata:
  type: feedback
---

**A plausible number is more dangerous than an implausible one, and one produced by the APPARATUS rather
than by the world is the most plausible kind there is** — a test fixture, a placeholder in a shape doc, a
figure quoted from a commit message while the artefact sat on disk. It looks like a measurement because it
was built to.

**Why:** three instances between two agents in one afternoon on a11y-witness, 2026-09-06. I typed
`214 h 20 m` as a mutation-check fixture and copied it into the file instructing people how to record a real
fleet-hours total; the real figure was 54.11, and mine divided cleanly by ten workers into wall clock — the
exact computation that had been ruled out. Had it been 900 h it would have been dismissed in a second;
being plausible is what made it worth asking about. Separately I filed an issue quoting a commit message
while a later artefact was on disk, and a peer's own test expected a number a filter had silently produced.

**How to apply:** the question that caught all three was **"where did this come from?"**, never "is this
right?" — the same question worth asking a peer about a load-bearing claim, pointed at tooling instead of
people. Concretely: never put a plausible number in documentation as an example (use
`"<HH h MM m, from the instrument, never typed>"`); prefer a REFUSAL over a footnote, because a footnote is
skipped and a refusal cannot be satisfied by remembering; and require a figure to name the run it came from
AND that run's finish, since a named-but-unfinished run makes the field fillable and false, which is harder
to catch than missing. Related: [[verify-a-peers-load-bearing-claim]], [[rank-a-claim-only-after-reading-it]].
