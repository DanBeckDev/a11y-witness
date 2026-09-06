---
name: merge-worktree-is-not-a-gate-environment
description: Discovery-test failures and core.bare flips in a11y-witness came from GIT_DIR leaking into hook-run tests, not from worktrees; cwd is not isolation.
metadata:
  type: feedback
---

**CORRECTED 2026-09-06, same day.** This file first said a fresh/detached git worktree is not a
valid environment for running merge gates, because 13 discovery guards failed there and passed in
the primary checkout. **That conclusion was wrong and the real cause is worse.**

`scripts/git-hooks/pre-push` runs `npm test`. **Git exports `GIT_DIR` into every hook's
environment.** `packages/lab/src/packaging/promotion-refuses-dirty.test.ts` shells `git init` /
`git config user.email t@example.com` / `git add` / `git commit -qm base` using
`cwd: mkdtempSync(tmpdir())` — and **`cwd` does not isolate a git command when `GIT_DIR` is set;
`GIT_DIR` wins.** So every `git push` ran those commands against the real repository.

Reproduced in isolation: `GIT_DIR=<real>/.git git init … git commit -qm base` lands
`base` in the real repo authored `t@example.com` — the exact signature found in a11y-witness
(commits `base`/`init`, `a.txt`/`b.txt`).

Consequences seen: `core.bare` flipped to `true` twice, leaving the fleet-driving checkout
answering *"fatal: this operation must be run in a work tree"*; a stray root history that made a
worktree's `HEAD` and `origin/main` resolve to it; and "flaky" discovery-test failures
(`rule-oracles`, `verdict-adoption` "discovered only 0", "every scripts/ program tracked in git")
that were really tests reading a re-initialised repo. `main` was never contaminated.

**How to apply:** if git behaves strangely in this repo — `core.bare` true, stray `base`/`init`
commits, a worktree resolving to an unrelated history — suspect a hook-run test, not the
worktree. Check `git config --get core.bare` and `git log --author=t@example.com --all`. A
git-shelling test must strip `GIT_DIR`, `GIT_WORK_TREE` and `GIT_INDEX_FILE` from the child
environment; `cwd` alone is not isolation. This is [[a-fix-reaching-the-instance-not-the-class]]'s
sibling: the test isolated the working directory and not the environment — a check answering
correctly about the wrong population. See [[check-whether-the-record-was-superseded]].
