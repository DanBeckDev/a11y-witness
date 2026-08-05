# `packages/`

Empty on purpose. This is M1 of `PLAN.md`'s multi-package split: **the scaffolding exists before anything
moves into it**, so the enforcement is in place before the code can drift against it.

The order is deliberate. M0 tested the assumption that could invalidate the whole design — that a consumer
can install and run one package in isolation — and its findings are in `docs/isolation-spike.md`. M1 adds
the machinery. Only then do M2–M8 move files, each with a gate that compares a result to the previous one
rather than asking a human to judge.

## What is already here

| piece | where | why now |
|---|---|---|
| workspace root | `package.json` `"workspaces": ["packages/*"]` | npm workspaces, not pnpm — `workspace:*` is rejected by npm 11.5.1 with `EUNSUPPORTEDPROTOCOL` (ADR 0005, measured) |
| shared build options | `tsconfig.base.json` | `composite: true` so project references make the dependency graph compiler-enforced |
| the isolation gate | `scripts/isolation-gate.mjs`, `npm run gate:isolation` | packs a package, installs it **outside the repo**, runs its smoke test |
| proof the gate works | `scripts/isolation-fixtures/` | one sound package it must accept, two broken ones it must reject |

## The contract a package will follow

Each package under `packages/` owns an `isolation-smoke.mjs` that imports itself **by package name** and
exercises the first example in its README. The gate copies it into a throwaway consumer directory next to
the installed tarball and runs it there. Importing by name rather than by path is the whole point: a
relative import would resolve inside the repo and prove nothing.

## Why the gate has to exist at all

A workspace install resolves everything by symlink, with the repo root as cwd, so **the workspace is
structurally incapable of detecting** the failures that matter to a consumer: phantom dependencies that
npm's hoisting permits, cwd-relative path resolution, assets an over-tight `"files"` allow-list drops, and
`"exports"` subpaths that do not resolve.

This is not hypothetical here. M0 found `local-judge.ts` resolving the scorer relative to the process cwd,
and the scorer program itself missing from the repo while every local run succeeded — because **`npm pack`
includes untracked files**, so "it worked when I installed it" was never evidence.
