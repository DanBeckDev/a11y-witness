---
name: check-whether-the-record-was-superseded
description: A comment or doc that was true when written may have been answered by a file added since; check for the superseding record before quoting one as current.
metadata:
  type: feedback
---

Before quoting a code comment, doc section or backlog row as the current position, check
whether something added since has superseded it. `git log -S "<headline>"` on the claim settles
which of two accounts is current — a position in a file is a convention nobody wrote down, a
commit time is a fact.

**Why:** 2026-09-06 this cost two wrong instructions in one ruling. `orchestrator` told a worker
to build an mtime-based corpus guard and "not use the progress file", quoting
`audit-rule-coverage.ts`'s comment about not asking systemd whether a unit is up. That comment
was true when written. `packages/lab/src/training/corpus-settled.mjs` had since been added, it
**addresses that objection by name in its own header**, and it carries a third state
(`abandoned`) for exactly the died-mid-write worry the instruction was defending against. So
"use mtime, not the progress file" would have regressed a decision already argued and tested.
The same ruling also said to extract-and-share a helper that already existed.

I made the sibling mistake in the same hour: `ls packages/lab/src/*corpus-settled*` searches one
directory level, found nothing, and I told a worker a peer's map was wrong. The file was in
`src/training/`. A check that answers correctly about the wrong population —
see [[a-fix-reaching-the-instance-not-the-class]].

**How to apply:** when a brief rests on a comment or doc, grep the tree for a module that
supersedes it before writing the brief — search the concept, not the file you already know.
Both mistakes were caught by a worker running the premise check before writing code, which is
why every brief should say the premise may be wrong and a refutation is a good result.
See [[orchestrating-peer-sessions]] and [[rank-a-claim-only-after-reading-it]].
