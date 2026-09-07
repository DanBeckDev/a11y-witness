---
---

Test coverage for `scripts/board-report.mjs`'s render sections and
`packages/worker-fleet/src/host-address.mjs`, plus a `sandboxGitEnv()` fix for
`ci-changed.mjs`'s own CLI-level tests.

**Empty on purpose.** `changeset status` flags this PR because `host-address.test.ts`
sits under `packages/worker-fleet/src/`, but `npm pack --dry-run --json` never ships a
test file — no package's published tarball changes. `scripts/board-report.mjs` is a
root-level script, outside every `packages/*` directory, so it can never be packed by
any package either. Nothing here reaches a consumer.
