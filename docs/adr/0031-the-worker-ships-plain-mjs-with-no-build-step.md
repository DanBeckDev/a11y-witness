# ADR 0031: The capture worker ships as plain, unbuilt `.mjs`; the control plane compiles from `.ts`

## Status

Accepted. The split has existed since ADR 0001 and is stated as a fact in CLAUDE.md's "Environment facts"
and CONTRIBUTING.md's code-conventions section, and assumed as a given "environment fact" in ADR 0005's
Context — but the decision itself, and what was rejected to reach it, was never recorded on its own.

## Context

Two questions look like one and are not. ADR 0005 answers "how does a **published npm package** build and
ship" — `.ts` compiles to `dist/` with declarations, because a consumer installs it and must not need our
dev toolchain. It treats `.mjs` for the worker as a given input to that decision (`allowJs: true`, "the
`.mjs`/`.ts` split is a deliberate environment fact") rather than deciding it.

The worker is not consumed as an npm dependency in production, though. It is deployed onto ten bare-metal
Windows boxes by `fleet:deploy` — file pull over git, or (the older `worker:deploy` path) an individual,
hashed file push verified against `/health.code` — and it must run under `node src/capture/nvda/server.mjs`
directly, on a guest that only guarantees plain Node, not our workspace's `tsc`/`tsx` toolchain. That is a
different deployment target from every other package in this repo, and it is the one ADR 0004 calls out as
needing a Windows runner rather than a published-package boundary.

## Decision

**The worker ships as plain `.mjs`, interpreted by Node with no build or bundle step.** `.ts` packages
compile to `dist/`; the worker's `.mjs` files are listed in `"files"` and pushed/pulled verbatim. Type
checking still covers them — `allowJs`/`checkJs` at the root `tsconfig.json` — so this is "no build step",
not "no type safety".

## What was actually rejected, and what was not decided here

**Bundling the worker (esbuild/rollup) was rejected**, and this is recorded — ADR 0005's alternatives list
it directly: "bundling a Node library obscures stack traces, and the worker's `.mjs` must stay individually
pushable." A bundle would collapse the 27-file hashed-and-verified deploy list (`worker-files.mjs`) into one
opaque artefact, and CLAUDE.md's own incident record is about exactly that shape of failure — "two guests
once served stale code for an hour" from a partial, hand-done push; a single bundle makes partial-push
failures harder to diagnose, not easier, because there is no longer a per-file hash to say which file is
wrong.

**Compiling the worker's own source from `.ts` to individually-shippable `.js` — keeping the file-by-file
deploy model but gaining compile-time type checking at the write site — was not found recorded anywhere**,
and this ADR does not invent a reason it was rejected. It may simply be historical: the worker predates this
repo's adoption of TypeScript for everything else (ADR 0001 describes it as "one PowerShell script" era
tooling), and nobody has since revisited whether the deploy model would survive a `.ts`-source, `.js`-output
version of the same file list. `allowJs`/`checkJs` already gets most of the type-safety benefit without
that migration, which is plausibly why it has not been urgent — but that is this ADR's own inference, not a
decision anyone recorded, and is stated as such rather than as history.

## Consequences

- `worker-files.mjs`'s hashed list is the real "what ships" — not a build manifest, not `package.json`
  `files` alone — and CLAUDE.md records the cost of it drifting (a duplicated list in `server.mjs` and
  `check-worker-code.mjs`, with a third derived by regex in the deploy script, before it was unified).
- `node -e "import('./path.mjs')"` is the only import-correctness check for these files; neither ESLint nor
  `tsc` catches a `ReferenceError` at module load, because nothing ever executes the module graph the way a
  bundler or a runtime import does. CLAUDE.md records this costing a `SyntaxError` in production twice, ten
  minutes apart, with lint and `tsc` green both times.
- A `CAPTURE_PROTOCOL_VERSION` bump and a worker-code redeploy are independent facts precisely because the
  worker is not versioned by `dist/` output — `codeVersion()` hashes the source files directly.

## What would falsify this

If the worker's deploy model changes to something that no longer needs individually verifiable files — for
example, a container image pulled and run as a unit — the "no build step" half of this decision loses its
stated reason (bundling was rejected *for the sake of* individual pushability) and should be revisited
alongside it, not left standing on a premise that no longer holds.
