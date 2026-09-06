---
name: mutation-check-from-a-copy
description: Mutation-check by copying the file aside, never `git checkout --`; and when a check passes under mutation, suspect the check.
metadata:
  type: feedback
---

**The whole step, and the last command is not optional:**

```bash
cp <file> /tmp/x && <apply the mutation> && <run the test> && cp /tmp/x <file> && <run the test again>
```

The final re-run proves the restore worked, rather than that `cp` exited zero.

**Never `git checkout -- <file>` to undo a mutation.** It restores the file to HEAD, silently discarding
every *uncommitted* change in it and not only the mutation.

**Why:** a11y-witness names that command in CLAUDE.md because it once destroyed release-eligible model
weights. On 2026-09-06 I used it anyway — mid-mutation-check, the exact workflow the rule exists for —
and destroyed two board-report fixes that were being waited on. Knowing the rule is what failed, so it is
now written into `docs/roles/product-manager.md` at the step where it applies rather than left as
something to recall.

**How to apply:** copy aside before every mutation. And **when a guard passes under mutation, suspect the
guard before concluding the code is fine** — twice in one day I shipped a guard that was green against the
very defect it was written for: a markdown converter that silently dropped two paragraphs, and a
number check that passed because a correctly-computed appendix line sat beside the wrong body line and
satisfied its `some()`. Both mutations were correctly applied; the checks were reading the wrong scope.
Related: [[a-number-from-the-apparatus]], [[a-fix-reaching-the-instance-not-the-class]].
