---
---

No consumer of any published package can observe this change, so there is no version to bump — recorded
explicitly rather than left to be inferred from silence, which is what the changeset gate asks for.

Measured rather than assumed. #114 touches four files:

    docs/board/reported.json                    not a package
    packages/control/ansible/lab-job.yml        control       private
    packages/lab/scripts/fleet-hours.mjs        lab           private
    packages/worker-fleet/src/lab-job.test.ts   worker-fleet  PUBLISHED

Only the fourth is in a published package, and `npm pack --dry-run --json` on `worker-fleet` says it is
not in the tarball: 153 files, 0 of them tests. Its `files` list is
`["dist", "src/local-worker", "src/provisioning", "README.md", "LICENSE"]`, and a `.test.ts` under `src/`
is outside every one of those entries.

The gate fires because it asks "is this file under a published package" where the question it means is
"can this file reach a consumer" — a check answering correctly about a population other than the one the
reader thinks, in the gate that guards what consumers are told. Filed as #132; the remedy is to derive the
population from `npm pack --dry-run --json`, the same authority `gate:isolation` already trusts, and
explicitly NOT to pattern-exclude `*.test.ts`, since three packages legitimately ship sources.
