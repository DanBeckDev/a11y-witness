---
"a11ign": patch
"@a11ign/evidence": patch
"@a11ign/judge": patch
"@a11ign/scorer": patch
"@a11ign/worker-fleet": patch
---

#168: removed each package's own `"prepare": "tsc --build"`. Nothing a consumer installing the published
package observes -- `prepare` never ran for a registry install in the first place (only `prepack`, which
still runs `tsc --build` unchanged, ships the tarball). This only affects `npm ci` inside this monorepo:
three packages' own `tsconfig.json` reference the same `evidence` project, so npm firing all five
workspaces' `prepare` scripts concurrently could start several independent `tsc --build` processes writing
to `packages/evidence/dist/*` at once -- a real file-write race, source of the intermittent `ci/ts`
failures. The root's own `prepare` now runs `npm run build` once, coordinating the same dependency graph
through a single `tsc --build` invocation instead.
