---
"a11ign": patch
---

**A probe's comment says what it READS, and nothing compared that against the calls it makes.**
`probeDisclosure`'s said *"We RE-READ the control… Re-reading asks the accessibility tree instead"*; the
code calls `reportCurrentFocus`, so `after` is whatever holds focus after activation. The two coincide
whenever activation leaves focus where it was — true on 2,000+ corpus captures, false on a nav menu that
moved focus into what it revealed, where the judge asserted 4.1.2 across two different controls.

`probe-comments-match-their-reads.test.ts` classifies every probe function three ways: `no-claim`,
`consistent`, `contradicted`. Only the third fails, because "makes no claim" and "makes a claim that
holds" are different facts and a guard that conflates them reports the wrong population.

**The row's population figure is corrected rather than repeated.** It said "13 claims across 15 probe
functions". Measured here: **15 probe functions, 28 lines anywhere in the file matching the phrase sweep,
and 2 probes whose own comment makes a READS claim.** The 13 was a count of matching LINES — the search
space, not the finding, the same distinction `bounded-window-reads.test.ts` had to draw. **That is not a
smaller problem than the row described**: one of the two claims was wrong, it survived 2,000+ captures,
and nothing in the tree could see it.

**Delegation is followed one level.** `probeToggle` and `probeTaskButton` are one-line dispatches to
`activateAndCaptureDelta`, so a body-only scan sees them read nothing and would call any claim they make
contradicted. A scanner that cannot tell "reads nothing" from "reads through a helper" produces a false
accusation — measured: with delegation-following disabled, a claim on `probeToggle` is reported as a
defect that is not there.

**The floor asserts about the search.** Every other assertion is satisfied by finding fewer probes, so the
fifteen are written out by name; a renamed or deleted probe fails loudly rather than shrinking the
population silently.

Not in this change: correcting the comments the guard classifies. It finds one `consistent` claim and no
`contradicted` one today — `probeDisclosure`'s was corrected by #812 — so there is nothing to fix, and
each future correction is its own change with its own evidence.
