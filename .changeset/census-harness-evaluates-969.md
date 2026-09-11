---
---

`@a11ign/nvda-worker` is touched, and no consumer can tell. `browser-session.mjs` now exports
`DOM_CENSUS_EXPRESSION`, so the two tests that run it import the evaluated string the page receives
instead of rebuilding it from source. That module is not in the package's `exports` map, and
`src/index.mjs` does not re-export it. The string is byte-identical to before, so a capture sees no
difference either. This is recorded explicitly so that "needs no release" is a decision, not a silence.
