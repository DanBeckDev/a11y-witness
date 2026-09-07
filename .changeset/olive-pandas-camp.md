---
---

Tooling and documentation only — `docs/coverage.md` is generated from `criterion-coverage.ts` and is no
longer committed, so the two criteria counts that cited a stale copy now cite one CI regenerates. No
consumer-visible change.

**Empty deliberately, and this is #132's category rather than a judgement call.** The gate fires because
the diff touches a directory belonging to a published package. Measured with `npm pack --dry-run`, which
is what #151 made the standard — *what npm packs, not what path a file sits under*:

```
@a11y-witness/judge     51 files packed,  0 of them .test.ts
```

The only files under `packages/` in this diff are **two test files**:

```
packages/judge/src/coverage-doc.test.ts
packages/lab/src/packaging/user-facing-docs-file-facts.test.ts
```

Neither reaches a tarball, so no consumer receives different bytes, let alone different behaviour. That
is the second row of the table `capture-probes.mjs`'s changeset drew — *a file npm never packs* — and the
honest record is that the gate should not have fired at all, which is what #132 is for.

Everything else in the diff is `README.md`, `docs/`, `.gitignore` and `ci.yml`, none of which is packed by
any published package.

Recorded rather than left to silence, per `.changeset/README.md`: `changeset status` cannot tell "nobody
wrote one" from "somebody decided none was needed", and only one of those is a decision.
