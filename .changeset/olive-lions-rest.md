---
---

Documentation only — #244 reunited sixteen JSDoc blocks with the functions they describe, and added a guard
so a block cannot be silently discarded again. No consumer-visible change.

**Empty deliberately, and the reason is the SECOND of the three categories `capture-probes.mjs` named plus
the one #132 is about.** Both apply here, to different files:

| | this change |
|---|---|
| a packed file whose behaviour changed | none |
| a file npm never packs (a `.test.ts`) | `jsdoc-attachment.test.ts` — the new guard |
| a packed file, comments only | the eight `.mjs` and one `.ts` source files |

**Measured rather than asserted, because that is the whole claim.** `@a11y-witness/nvda-worker` ships its
sources, so `diagnostics.mjs`, `capture-setup.mjs`, `capture-pure.mjs`, `capture-probes.mjs` and
`browser-session.mjs` are all in the tarball (36 files packed, each confirmed present) — a consumer receives
different bytes. What they do not receive is different behaviour. Stripping block comments and `//` lines
from every changed `.mjs`/`.ts` and comparing what remains:

```
packages/evidence/src/verify.ts                    executable-text identical: true
packages/lab/scripts/calibrate-abstention.mjs      executable-text identical: true
packages/lab/scripts/evidence-check.mjs            executable-text identical: true
packages/lab/src/training/capture-cache.mjs        executable-text identical: true
packages/lab/src/training/signal-predicates.mjs    executable-text identical: true
packages/nvda-worker/src/browser-session.mjs       executable-text identical: true
packages/nvda-worker/src/capture-probes.mjs        executable-text identical: true
packages/nvda-worker/src/capture-pure.mjs          executable-text identical: true
packages/nvda-worker/src/capture-setup.mjs         executable-text identical: true
packages/nvda-worker/src/diagnostics.mjs           executable-text identical: true
```

The new guard is a `.test.ts`, and `@a11y-witness/worker-fleet` packs 133 files of which **zero** are
`.test.ts` — so that one is #132's category and the gate should not have fired on it at all.

One caveat this entry should carry rather than hide: **a JSDoc `@param` is a comment to a reader and a TYPE
to `tsc`.** Moving one changes what the compiler sees, which is the entire point of #244 — the tags now
reach the functions they were written for. That is a change to type-checking of THIS repo's sources, not to
anything a consumer executes or type-checks against: `nvda-worker` ships `.mjs` with no declarations, and
`packages/evidence`'s `verify.ts` diff is prose only inside a `.ts` file whose parameter types come from its
signatures. So the annotations that moved were inert where they sat and are load-bearing only here.

Recorded rather than left to silence, per `.changeset/README.md`: `changeset status` cannot tell "nobody
wrote one" from "somebody decided none was needed", and only one of those is a decision.
