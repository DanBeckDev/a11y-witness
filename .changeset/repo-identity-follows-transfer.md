---
"a11ign": patch
"@a11ign/nvda-worker": patch
"@a11ign/judge": patch
---

Documentation-only: example commands and test fixtures now point at `a11ign/a11ign` instead of the pre-transfer `DanBeckDev/a11y-witness`, so copying them resolves to the repository's current location.

- `packages/cli/README.md`'s example workflow's `uses:` line.
- `packages/nvda-worker/src/README.md`'s `git clone` step.
- `packages/judge/src/documented-criteria.test.ts`'s fixtures and comments, which assert the README's own snippet.

No code, wire protocol, or capture behaviour changed.
