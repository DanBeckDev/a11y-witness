---
"@a11y-witness/worker-fleet": patch
---

`doctor` (shipped as `a11y-doctor` in this package's `bin`) now resolves the exact specifier
`@a11y-witness/judge/rules` at runtime to report whose `dist` a cross-package import actually comes from,
and whether that `dist` is stale relative to its own source. Advisory only — it never changes `doctor`'s
exit code.

This makes `@a11y-witness/judge` a genuine new runtime dependency of this package, declared in
`dependencies` and in `tsconfig.json`'s `references` for correct build ordering.
