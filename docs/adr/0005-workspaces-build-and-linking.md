# ADR 0005: npm workspaces, per-package tsc build, and semver-range linking

**Status:** accepted
- Date: 2026-08-05

## Context

ADR 0004 draws six published packages out of one flat tree. Three mechanical
questions follow, and each was decided by measurement on this machine rather than
by preference.

**Nothing here currently builds.** `tsconfig.json` is `"noEmit": true` and every
script is `tsx src/...`. A published package cannot ask its consumers to run `tsx`
over our `.ts` sources, so a real build step is new work, not a config tweak.

**The tree is two languages by design.** `.ts` for the control plane, `.mjs` for
the capture worker, because the worker runs under plain Node on a Windows guest
(CLAUDE.md, "Environment facts"). `allowJs: true` today. Any build decision that
transpiles the `.mjs` files changes what `worker:deploy` pushes and what
`check-worker-code.mjs` hashes.

**The worker's deploy model is file-by-file over a hashed list.** Seven files are
pushed individually and verified through `/health.code`. Whatever `node_modules`
layout we pick has to survive being reconstructed on a Windows guest by that
mechanism.

## Decision

### 1. npm workspaces, not pnpm

Measured on this host (npm 11.5.1, node 24.7.0), with a throwaway two-package
workspace:

```
# packages/b depends on "@t/a": "workspace:^"
npm error code EUNSUPPORTEDPROTOCOL
npm error Unsupported URL Type "workspace:": workspace:^
```

```
# packages/b depends on "@t/a": "^1.0.0", local @t/a is 1.0.0
added 2 packages in 121ms
node_modules/@t/a -> ../../packages/a      # symlinked to the workspace
```

```
# packages/b depends on "@t/a": "^2.0.0", local @t/a is 1.0.0
npm error 404 Not Found - GET https://registry.npmjs.org/@t%2fa
```

So the choice is not "npm or pnpm" in the abstract; it is **npm with semver
ranges** or **pnpm with the `workspace:` protocol**, because npm at this version
rejects the protocol outright.

We choose npm, for one reason that outweighs pnpm's real ergonomic advantages:
**pnpm's content-addressed store and symlinked `node_modules` are a hazard on the
Windows capture guest.** The guest is provisioned as an appliance, its checkout is
reconstructed by pushing individual files, and the worker is started by a
scheduled task. A symlink farm is one more thing that can differ between three
cloned guests — and CLAUDE.md's entire diagnostic history is about faults that
present identically on healthy and broken guests. npm's flat, hoisted, boring
layout is the one that cannot surprise us there.

The cost is real and named: **npm hoisting permits phantom dependencies.** A
package can import something it does not declare, work perfectly in the workspace,
and fail on a consumer's machine. Building Micro-Frontends (Mezzalira, 2021,
§"Monorepo") lists hoisting as exactly this trap. Mitigation is not discipline, it
is a gate — see ADR 0007's isolation smoke test, which installs each tarball into
an empty directory outside the repo. That gate is the *reason* npm is affordable
here; without it, pnpm would be the safer default.

Revisit if the guest checkout ever stops being file-pushed, or if the package
count passes roughly ten.

### 2. Inter-package dependencies are published semver ranges

`"@a11y-witness/evidence": "^1.2.0"`, never `workspace:*`. Three consequences,
all wanted:

- **The developed manifest is the published manifest.** There is no
  rewrite-on-publish step, so there is no rewrite-on-publish step to get wrong.
- **The range in the repo *is* the compatibility claim consumers see.** It is
  reviewable in the diff.
- **An unsatisfiable range fails loudly**, as measured above: npm goes to the
  registry and 404s while the scope is unpublished, and after publication it would
  resolve a *registry* version instead of the local one. That second case is the
  real hazard, so CI asserts that every intra-repo range is satisfied by the local
  workspace version — a small script, not a convention.

This is the One-Version Rule applied at our scale. Software Engineering at Google
(Winters, Manshreck & Wright, 2020, §"Version Control Versus Dependency
Management") states it as: developers should not have a choice among multiple
versions of the same dependency, because choice produces dependency partitions and
diamond conflicts. Inside this repo there is exactly one version of `evidence`, and
the range-satisfaction check is what keeps that true. Continuous Delivery (Humble
& Farley, 2010, §"Building Dependency Graphs") makes the same point from the
release side: the graph must be a versioned DAG, and diamonds where two upstream
components were built against different versions of a shared framework are the
named failure.

For *external* consumers the One-Version Rule does not apply and must not be
faked: they may hold `judge@1.4` against `evidence@1.9`, so `evidence` carries the
strictest stability promise in the repo (ADR 0004).

### 3. `.ts` compiles; `.mjs` ships verbatim

- **`.ts` packages** (`evidence`, `judge`, `worker-fleet`'s TS half, the CLI)
  build with `tsc` to `dist/`: ESM only, `"type": "module"`, `.d.ts` emitted,
  `declarationMap` and `sourceMap` on, `NodeNext` module resolution kept as-is.
  `package.json` uses `"exports"` with explicit subpaths per ADR 0004 — no
  wildcard export, because a wildcard makes every file public by accident and
  deletes the "deliberately not public" column.
- **`.mjs` files ship as sources**, unbuilt, listed in `"files"`. They already run
  under plain Node on the guest; transpiling them would break the hashed-file
  deploy model for no gain, and the `.mjs`/`.ts` split is a deliberate environment
  fact rather than an accident to clean up. Type checking still covers them via
  `allowJs` at the root.
- **Root `tsconfig` becomes a solution file with project references** and
  `"composite": true` per package. This is the load-bearing part: **project
  references make the dependency graph a compiler-enforced invariant.** The
  `capture-check → training/page-server` cycle ADR 0004 inverts becomes a build
  error rather than something a human has to notice, and a future
  `judge → worker-fleet` import cannot be added by accident. Lint and `tsc` could
  not see the last three cross-boundary mistakes in this repo; references can see
  this class of them.
- `tsc --build` gives incremental rebuilds, which matters because the pre-push hook
  is measured at ~5 s and must stay there.

### 4. Layout

```
packages/evidence/          packages/judge/       packages/nvda-worker/
packages/scorer/            packages/worker-fleet/ packages/cli/
packages/lab/               (private)
```

Root keeps: `action.yml`, `docs/`, `models/` (until M3 moves the scorer artefacts),
`data/`, `examples/`, `runs/` (gitignored), the git hooks, and the eslint config.
Root `package.json` becomes `"private": true` with `"workspaces": ["packages/*"]`
and keeps the developer-facing script names — `npm run witness`, `npm run doctor`,
`npm run training:capture` — as thin delegations, because those names appear
throughout CLAUDE.md and breaking them costs more than it saves.

One eslint config at the root, unchanged. The Clean Code gates
(`max-lines-per-function`, `complexity`, `max-depth`, `max-params`, `no-empty`)
apply per file and do not care about package boundaries; forking the config per
package would let a package quietly lower the bar.

## Consequences

- A real `dist/` exists for the first time, so `tsx` becomes a dev dependency
  rather than a runtime requirement for consumers.
- Project references turn one class of boundary violation from "hope someone
  greps" into a red build. Given that this repo's three most expensive defects
  were all "a fix applied at one call site when the behaviour reached several", a
  machine-checked graph is worth its setup cost.
- npm's phantom-dependency risk is accepted deliberately and is the direct reason
  ADR 0007's isolation gate is mandatory rather than nice to have.
- `"exports"` maps are a breaking-change surface in their own right: adding a
  subpath is a minor, removing or narrowing one is a major.

## Alternatives considered

- **pnpm workspaces with `workspace:*`.** Better hoisting hygiene, cheaper disk,
  and the protocol we would otherwise want. Rejected on the Windows guest risk
  above, and because the phantom-dependency benefit is largely recovered by the
  isolation gate we need anyway. This is the closest call in this ADR and the
  first thing to reconsider.
- **Turborepo / Nx.** Task orchestration and remote caching we do not need at
  seven packages with a ~5 s check suite. `tsc --build` already gives incremental
  compilation. Adding an orchestrator now is the class of over-engineering CLAUDE.md
  explicitly rules out.
- **Bundling each package with esbuild/rollup.** Rejected: bundling a Node library
  obscures stack traces, and the worker's `.mjs` must stay individually pushable.
- **Keep `noEmit` and publish `.ts` with a `tsx` requirement.** Rejected — it
  makes every consumer adopt our dev toolchain, which is the opposite of goal 1.
- **One package with many entry points.** Cheapest possible change and it would
  satisfy "install one thing"; rejected because it cannot satisfy independent
  semver (ADR 0007) — a worker fix would bump the version a judge consumer pins,
  which is precisely what Clean Code's Independent Deployability section says the
  boundary is for.
