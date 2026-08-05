# `packages/`

`PLAN.md`'s multi-package split. M1 built the scaffolding **before** anything moved into it, so the
enforcement was in place before the code could drift against it.

| package | licence | contents |
|---|---|---|
| `evidence` (M2) | Apache-2.0 | wire types (`.`), pure verification predicates (`./verify`), the WCAG 2.2 AA list (`./wcag`) — zero deps, no I/O |
| `scorer` (M3) | AGPL-3.0-or-later | the trained heads, the training report, the Python scoring program and the feature contract. The weights are the API, so a retrain is a major bump |
| `judge` (M4) | AGPL-3.0-or-later | `judge()` (`.`), the deterministic absence rules (`./rules`), experience-layer ordering (`./layers`), and `./internal` with no semver guarantee |
| `nvda-worker` (M5) | AGPL-3.0-or-later | the Windows capture worker. `.mjs` ships verbatim, so no build step; the HTTP contract is the API and `CAPTURE_PROTOCOL_VERSION` versions it independently of semver |
| `worker-fleet` (M6) | AGPL-3.0-or-later | host-side lease/health/capacity, the `a11y-doctor` and `a11y-worker-*` bins, and the UTM provisioning scripts. Touches no NVDA |

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

## The contract every package follows

**`"prepack": "tsc --build"` is mandatory, not tidiness.** `npm pack` does not build, so without it the
tarball ships an empty `dist` on any machine that has not built first — every clean clone, every CI job.
Demonstrated rather than assumed: with `dist` deleted, the isolation gate failed with `ERR_MODULE_NOT_FOUND`,
and passed once `prepack` existed. `"prepare"` runs the same build after `npm install`, so the root
`typecheck` resolves the package's `.d.ts` without a separate step.

Each package under `packages/` owns an `isolation-smoke.mjs` that imports itself **by package name** and
exercises the first example in its README. The gate copies it into a throwaway consumer directory next to
the installed tarball and runs it there. Importing by name rather than by path is the whole point: a
relative import would resolve inside the repo and prove nothing.

## The gate packs a package's unpublished siblings too

`judge` is the first package with internal dependencies, and it exposed an omission: nothing is published, so
npm cannot fetch `@a11y-witness/evidence` from the registry — the install fails with E404 and the gate reports
a broken package that is fine. npm 7+ auto-installs **peer** dependencies as well, so a peer on an unpublished
sibling fails identically.

The gate now packs the whole internal closure and installs the tarballs together, which is the composition it
should have been testing from the start: a consumer installs `judge` *and* the `scorer` it peers on, and the
two must work together outside the workspace. `evidence` and `scorer` are leaves, so this was invisible until
M4. A dependency on a sibling that is not a package in this repo is an error rather than a silent fall-through
to the registry.

## Why the gate has to exist at all

A workspace install resolves everything by symlink, with the repo root as cwd, so **the workspace is
structurally incapable of detecting** the failures that matter to a consumer: phantom dependencies that
npm's hoisting permits, cwd-relative path resolution, assets an over-tight `"files"` allow-list drops, and
`"exports"` subpaths that do not resolve.

This is not hypothetical here. M0 found `local-judge.ts` resolving the scorer relative to the process cwd,
and the scorer program itself missing from the repo while every local run succeeded — because **`npm pack`
includes untracked files**, so "it worked when I installed it" was never evidence.

M2 then earned it twice over on the first real package. The gate rejected `@a11y-witness/evidence` three
times before accepting it, and every rejection was a genuine defect in what a consumer would have received:
the README's first example used a field name the contract does not have (`announcements`, not `transcript`),
it asserted the wrong `Criterion` key (`id`, not `num`), and the tarball shipped no `dist` at all. A
documented example that does not run is the same class of defect as a check that examines nothing — which is
why the smoke test exercises the README rather than something convenient.
