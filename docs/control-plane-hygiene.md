# Storage and memory hygiene on the control plane

This Mac is the control plane, and things accumulate on it that nobody owns. This page names each
accumulator this project has measured and the lifecycle rule, owner, or recorded deletion decision that
applies to it — never "we should clean this up" left as an intention, which issue #58 names as a failed
acceptance for this page.

**Regenerate the measurement rather than trusting this page's own numbers**, which are a snapshot from
the day it was written:

```bash
npm run hygiene:report
```

It prints every accumulator's current count/size beside its rule, and refuses (exit 1) if any row's text
reads as an unresolved intention rather than a decision — so this page cannot drift into prose nobody
checks against reality.

## The accumulators, and the decision for each

| accumulator | decision |
|---|---|
| **Worktrees registered** | RULE: prune stale/fully-merged trees regularly. `git worktree remove` refuses a dirty tree by design, which is the existing safety net. Manual practice today (`dispatcher`); no new command from this row. See issue #59 for the lifecycle-rule-maintained-by-hand problem this is itself an instance of, and for a real hazard found while writing this page: pruning can silently skip a branch it cannot read the merge status of, and — separately — a directory name can be reused by a different agent's worktree with no warning to a session that still has it open. |
| **`node_modules` — real (own install)** | DECISION, deliberately bimodal rather than averaged: an installed worktree costs roughly the same regardless of size (measured 2026-09-06: 25 trees at ~169 MB each, 3.4 GB of duplicate installs; a mean across installed and un-installed trees would describe neither population). Real by default; symlink to the primary's INSTEAD only when the unit does not change package source another worktree's test would need fresh. **Structural fix is `pnpm` (#57, deliberately post-publish)** — a content-addressed store makes every worktree's install nearly free rather than a per-unit judgement call between disk and staleness risk. Measured here so that row has a number when #57 is scheduled. |
| **`node_modules` — symlinked to primary** | OWNER: #57 tracks the resolution risk this creates (a symlinked worktree reads the PRIMARY's `dist`, not its own). Reported here, not re-decided here. |
| **`node_modules` — missing** | EXPECTED for a worktree mid-setup or one kept only for its git history. Not a defect on its own. |
| **`.venv` — real (own copy)** | RULE: always symlink `.venv` to the primary's, never install a fresh one per worktree. One real copy (the primary's) is correct; more than one is the accumulator to fix by hand. |
| **Per-worktree `dist`, for packages another package imports by name** | VERIFIED, not assumed, while writing this row: every package this repo actually imports by BARE specifier (`from "@a11y-witness/x"`, resolving through `exports`/`main` into `dist/`) already declares its own `"prepare": "tsc --build"`, which npm workspaces run automatically on `npm install` — so the "missing dist breaks a fresh worktree's `tsc --noEmit`" trap named when this row was filed does **not currently reproduce**. It named `packages/scorer` specifically; that package already has the hook. `scripts/control-plane-hygiene.mjs`'s dist-trap check re-verifies this on every run rather than trusting the original report, and fails loudly (naming the package) if a bare-imported, dist-exporting package is ever added without one. |
| **Local `runs/` copy** | RULE (already the answer this repo had; restated here so nobody re-derives it): KEEP. It is what lets a laptop read the corpus at all. Staleness, not size, is the risk — `npm run lab:inventory` reports how stale a copy is. **Never delete without `orchestrator`** — it is a copy several tools read, per issue #58's own fleet note. |
| **Disk free** | Informational only. Not an accumulator; no rule needed at the current 275 GB of 926 GB scale. |

## Why the "missing dist" trap does not currently reproduce

`scripts/control-plane-hygiene.mjs`'s `distTrapReport` answers a narrower, checkable question than "is
`dist` missing anywhere": **does any package that something else imports by its bare root specifier lack
the build step that produces its own `dist`?** Two false positives were found and fixed while building
this check, both worth keeping as the reasoning rather than only as passing tests:

- A cruder "does the package name appear after `from \"`" match flagged `@a11y-witness/lab` and
  `@a11y-witness/nvda-worker` as exposed. Both are reached from elsewhere in this repo only by SUBPATH
  import (`@a11y-witness/lab/src/dataset-paths.mjs`, `@a11y-witness/nvda-worker/error-text`) straight into
  raw `.mjs` source — the shape ADR 0031 documents deliberately for `nvda-worker` (no build step at all).
  Narrowed to match only the BARE specifier (`from "@a11y-witness/x"` with the closing quote immediately
  after), which a subpath import never satisfies.
- Even narrowed to bare imports, `@a11y-witness/nvda-worker` still flagged, because nothing had checked
  whether that package's OWN root export resolves into `dist/` at all — it resolves straight to
  `src/index.mjs` (`exports["."]`), so a missing `dist` there breaks nothing. The check now reads each
  package's own `exports`/`main` field and only flags one whose root genuinely points into `dist/`.

Both are pinned as fixtures in `packages/lab/src/packaging/control-plane-hygiene.test.ts`, including one
built specifically to isolate the bare-vs-subpath boundary from the dist-vs-source boundary — a package
with a real `dist` export, reached only by subpath, so a sloppy quote match would have nothing else to
hide behind.

## What this page does not decide

`#57` (shared `node_modules` resolving to the primary's `dist`, and the `pnpm` migration that would fix
storage bimodality structurally) and `#59` (the worktree-prune rule itself, and the two hazards found
while writing this page — a merge-status check that cannot tell "not merged" from "could not tell", and a
directory name reused across agents with no warning) are both open separately. This page measures and
records the decision each accumulator already has; it does not re-litigate either of those.
