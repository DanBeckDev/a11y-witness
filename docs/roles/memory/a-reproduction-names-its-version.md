---
name: a-reproduction-names-its-version
description: "A reproduction carries three fields — what you ran, what it said, and AS OF WHICH commit or export. Missing the third made me retract a correct theory."
metadata:
  type: feedback
---

**A reproduction is a claim about code at a version, and the version is invisible in the output unless the
output says so.** State it every time: what you ran, what it said, and **as of which commit**.

This cost the most of anything on 2026-09-06, because it made me retract something true.

A gate reported 80 false findings. The `ceo` proposed a mechanism — a deleted index-0 exception. I opened a
record, found exactly the shape predicted, and called it confirmed. Then I read `rules.ts` in my worktree,
found the guard present, ran the rule in-process, got **zero** findings, and reported the mechanism
**refuted**. Every step was competent and the conclusion was backwards:

```
gate ran at   12dd7eb   15:52
the fix       99d9f98   16:35   ← 43 minutes LATER
git merge-base --is-ancestor 99d9f98 12dd7eb  →  NO
```

My reproduction ran cleanly and was meaningless: **fixed code against a capture the broken code had
scored.** Every lab job prints `<job> at <commit>` and I did not read it.

**Two clocks, and only one moves when you merge.** Hours later the same shape in a different currency:
`rules:gate` failed identically after a fix reached main, because `ruleEvidence` is frozen at EXPORT time
and the export predated the fix. I was one command from reporting "the fix did not work" on a fix that
turned 0/7 into 7/7. So for anything reading a derived artefact the third field is **as of which export** —
re-export, then re-run.

**The general form:** "consistent with X" and "X" are different claims, and the gap between them is usually
a population — a ref, a root, a checkout, a machine, a version, an export. Say which you have.

Related: [[a-number-from-the-apparatus]] (the same question pointed at numbers),
[[rank-a-claim-only-after-reading-it]] (at my own claims), [[worktree-resolves-primary-dist]] (the
population being a checkout).
