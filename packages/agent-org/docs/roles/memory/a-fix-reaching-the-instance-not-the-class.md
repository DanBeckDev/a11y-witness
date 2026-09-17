---
name: a-fix-reaching-the-instance-not-the-class
description: "After fixing a defect, ask what else has the same shape — and check, not remember. Three instances in one night, each found by the next failure."
metadata:
  type: feedback
---

The repo's own most-recorded defect is a remedy applied at one call site when the behaviour reaches
several. **I committed it three times in one night, twice inside the commit that described it.**

- Excluded `baselineWaitedMs` from `evidence-diff.mjs`'s comparison after diagnosing a wall-clock field
  read as evidence — and never asked what OTHER compared field carries a timestamp. Two hours later
  `atMs`, on every focus-log entry, failed a gate and blocked a recapture.
- Fixed `atMs` in `evidence-diff.mjs` — and `gate:stability` uses `repeat-capture.mjs`, a **second
  comparison implementation** with its own `flatten` and no deny-list. Two gates whose whole job is judging
  whether evidence can be trusted, disagreeing about what evidence IS.
- Put a collision check in every peer brief — `git branch -r --list 'origin/agent/*'` — in a document
  about not adding guards that cannot fire. Agent branches here are never pushed, so it always answered
  "clear".

**The habit that closes it: after any fix, run a SWEEP for the shape and pin the class with a test.** Not
"grep for the identifier" — the sites that need updating usually contain none of it. For the timestamp
case the sweep walks real captures for any numeric key matching `/Ms$|At$|Time|Duration|Waited/` inside a
compared field, and fails when one is unclassified. It found exactly the two already known, which is the
answer worth having: **no third instance hiding.**

**A deny-list, never an allow-list.** A new field must default to being COMPARED, or the gate goes quietly
blind to it — the original defect wearing the remedy's clothes.

**And the sweep needs a vacuity guard that can tell two silences apart.** Finding nothing has two causes:
the corpus predates the keys, or the sweep reads the wrong subtree. My first version failed the main
checkout because its corpus was 89 hours old. The fix is a SYNTHETIC sibling test proving the walk works,
so the corpus pass can skip honestly rather than pass vacuously.

Related: [[rank-a-claim-only-after-reading-it]] — same discipline pointed at a claim rather than a fix.
