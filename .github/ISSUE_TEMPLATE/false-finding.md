---
name: A finding looks wrong
about: The tool reported a barrier that is not there, or missed one that is
title: ''
labels: finding-accuracy
---

**Which layer produced it?** The report labels them: `Rule-based layer (axe-core)` or
`Lived-experience layer`. Within the second, a finding is either from the deterministic rules or the
trained scorer — the report says which.

**Paste the finding, including its `evidence:` line.** That line is the announcement the finding rests on,
and it is usually enough to tell a wrong rule from a wrong capture.

```
paste here
```

**What did you expect instead, and why?** If a WCAG criterion says something specific, quote it — several
rules here have had their scope corrected by exactly that.

**The page.** A URL if it is public. If not, the smallest HTML that reproduces it is far more useful than a
description.

**Command and versions.** The exact command, plus `npx a11y-witness --version` and, if you ran a worker,
its `/health` output.

---

Two things worth knowing before you file:

- **"unchecked" is not "clean".** The trained scorer abstains on pages unlike its training data, which is
  most real pages today, and reports those criteria as unchecked. That is deliberate, not a miss.
- **Some criteria are only partially assessed**, and each one's boundary is recorded in
  `packages/judge/src/criterion-coverage.ts`. Worth checking before reporting a gap.
