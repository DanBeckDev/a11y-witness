---
---

Two published packages are touched and neither change can reach a consumer.

`packages/cli/src/action/run.ts` is wrapped in a `main()` with an entry guard: the same code, the same
four exit codes, verified by running all four paths. It is the Action's entry, invoked by `action.yml`,
and `cli`'s `files` is `["dist","README.md","LICENSE"]` — the built `dist/action/run.js` ships and behaves
identically, because the only change is that the body no longer executes on import.

`packages/lab/src/harnesses/assert-action-report.mjs` is in `lab`, which is `private: true`.

The rest is a test file and `scripts/`. Recorded explicitly rather than left to be inferred from silence.
