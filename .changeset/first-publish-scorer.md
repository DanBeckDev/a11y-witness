---
"@a11ign/scorer": minor
---

The first published version of `@a11ign/scorer`. Everything below landed before it: the rename first, then oldest first.

- The product is renamed: formerly a11y-witness, now a11ign. The npm scope, the unscoped CLI package, the
  binary names and every cross-package import specifier change with it (issue #66). Nothing had been
  published under the old name, so this is a rename landing in the tree before the transfer to the
  `a11ign` GitHub organisation, not a migration for existing consumers.

- #168: removed each package's own `"prepare": "tsc --build"`. Nothing a consumer installing the published
  package observes -- `prepare` never ran for a registry install in the first place (only `prepack`, which
  still runs `tsc --build` unchanged, ships the tarball). This only affects `npm ci` inside this monorepo:
  three packages' own `tsconfig.json` reference the same `evidence` project, so npm firing all five
  workspaces' `prepare` scripts concurrently could start several independent `tsc --build` processes writing
  to `packages/evidence/dist/*` at once -- a real file-write race, source of the intermittent `ci/ts`
  failures. The root's own `prepare` now runs `npm run build` once, coordinating the same dependency graph
  through a single `tsc --build` invocation instead.

- The Homepage link on each package's npm page now points at the project's repository rather than at `a11ign.com`, which does not resolve. Clicking it from npm previously went nowhere; it now reaches the source, the README and the issue tracker.
