---
---

CI, tooling and one repo-root script. No published package's tarball changes: `scripts/`, `.github/` and
`CLAUDE.md` are outside every package, and the one file under `packages/` is
`packages/lab/src/packaging/consumer-visible.test.ts` — `lab` is `private: true`.

Recorded explicitly rather than left to be inferred from silence. Fittingly, this is the last changeset
that has to be reasoned about by hand: after this PR `scripts/consumer-visible.mjs` answers the question
from `npm pack --dry-run --json` instead.
