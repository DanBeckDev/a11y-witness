---
name: worktree-resolves-primary-dist
description: "A peer worktree sharing the primary's node_modules resolves cross-package imports to the PRIMARY's dist — so building your own worktree changes nothing, and you measure two-hour-old code."
metadata:
  type: project
---

On a11y-witness the peer worktrees (`../a11y-wt-*`) can have `node_modules` **symlinked to the primary
checkout's**. When they do, `@a11y-witness/<pkg>` resolves to the PRIMARY's `packages/<pkg>`, so any
cross-package import reads the **primary's `dist`** — not the worktree's.

**Consequence: `npm run build` inside your worktree changes nothing that a cross-package tool will read.**

Measured 2026-09-06. `npm run docs:coverage` in `a11y-wt-lead` emitted a `docs/coverage.md` missing two
paragraphs the source plainly contained, because the primary's `packages/judge/dist` was built at 10:55 and
the source changed at 12:45. I concluded the generator was broken, committed a "regeneration" that reverted
another agent's work, and told a peer to route a worker at a defect that did not exist.

**The check that missed it, and why.** I ran `ls -ld node_modules/@a11y-witness/judge`, saw a proper
symlink, and ruled it out. It IS a proper symlink — to another repository. **My check answered "is this a
symlink" when the question was "to which checkout".** Same shape as every other wrong answer that day: a
correct method against the wrong population.

What I had already ruled out, correctly and uselessly: stale `dist` in my own tree, stale `.tsbuildinfo`,
the branch itself. All four were right and none was the cause.

**The habit: when a tool reads stale code, resolve the module and print the PATH, not the link type.**

```
node -e "console.log(require.resolve('@a11y-witness/judge'))"   # which checkout, not which kind of file
readlink node_modules                                           # the whole tree may be shared, not one pkg
```

**And rebuild the PRIMARY after merges**, or every worktree sharing its `node_modules` inherits whatever it
last built. Verified safe to run during a live capture: `npm run build` writes only `dist/`, `nvda-worker`
has no build step at all (plain `.mjs`, ADR 0031), and `workerSourceDirty()` reads
`git status -- packages/nvda-worker/src`, which a build cannot touch. Confirmed by measurement — worker
source 0 dirty before and after, `worker:code` 10/10 matching afterwards.

This is CLAUDE.md's own stale-`dist` rule one layer out: that file warns cross-package imports resolve to
`dist` so `npx tsx --test` alone tests the last build. It does not say WHOSE.

Related: [[peer-session-resource-ban]] for the worktree setup, and [[a-number-from-the-apparatus]] — this is
the same defect with code in place of a number.
