---
---

Adds one test file and changes no shipped code. `packages/worker-fleet/src/lab-job-params-reach-the-command.test.ts`
is under a published package, and `npm pack --dry-run --json` puts it nowhere near the tarball: 153 files,
0 of them tests. The `files` list is `["dist", "src/local-worker", "src/provisioning", "README.md", "LICENSE"]`,
and a `.test.ts` under `src/` is outside every one of those entries.

Recorded explicitly rather than left to be inferred from silence, which is what the gate asks for. See #132
for the gate's own defect: it asks "is this file under a published package" where it means "can this file
reach a consumer".
