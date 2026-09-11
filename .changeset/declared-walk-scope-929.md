---
"a11ign": patch
---

**A tree-walking guard can now declare the subtree it walks, and its own run proves the declaration.**

`alwaysRunTests` runs every guard whose population is discovered from the tree, on every pull request,
because a file added anywhere can join such a population. That stays exactly as it is. Measured by running
all 131 always-run guards with their reads observed: 17 walk the whole repository and 83 read inside a
product package, but **31 read nothing a product diff can touch**, and 14 of those read nothing outside
their own imports at all — flagged because they import `scripts/ready-label-audit.mjs`, whose
`run("git", ["for-each-ref", …])` the static predicate reads as a walk; the tests never take that path.

A guard may now write `export const WALK_SCOPE = ["docs"];`, and `narrowByDeclaredScope` leaves it out of a
run whose diff touches none of it. **Undeclared means unbounded**: a guard that says nothing is kept on
every diff exactly as today, because the failure mode of a wrong narrowing is a guard that silently stops
running. The narrowed guards are reported **by name** beside `alwaysRunCount`, never folded into it.

**The declaration is checked by the guard's own run, never trusted.** A static check could only have
verified the 18 walks that pass literal roots to `walkTree`; 70 of the 131 walk with `readdirSync`/
`globSync` over computed paths. So `scripts/walk-scope.mjs`, imported first, records every path the process
reads, and `declareWalkScope` fails the guard's own test file if anything it read lies outside what it
declared. The check runs exactly when the guard runs, at no extra process cost.

**First batch: five guards, all outside the triage churn** — `verdict-adoption`, `recorded-provenance`,
`real-page-corpus-freshness`, `capture-body-owner` and `merge-method-is-one-fact`. On a product diff the
always-run set goes from 131 to 126; on a `scripts/` diff the lab-scoped four are left out and the
`scripts/` one stays. The remaining ~26 bounded candidates live mostly in `packages/lab/src/packaging/`,
where the open guard-triage rows are still deciding what to delete, and are a follow-up.
