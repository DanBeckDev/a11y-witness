# Where guards draw their population boundary

**#187. A census, not a work list.** Four guards were found on 2026-09-06/07 whose population was
narrower than the sentence describing them, and **every one was found by tripping over it rather than by
looking.** `entry-points.test.ts` alone has had its boundary widened three times, each widening prompted
by an unrelated accident. Nobody had ever enumerated the boundary, so nobody could answer *"which others
are drawn too narrowly"* without repeating the accident.

## How this list was built

**Derived by walking the tree, never from memory** — a hand-written list of the guards that use
hand-written lists would be the joke this row is about.

```
git ls-files | *.test.ts|*.test.mjs, minus dist/
  -> keep those enumerating a SOURCE population:
       git ls-files | git grep | package.json scripts | readdirSync rooted at a source dir
  -> 52 guards
```

`readdirSync` over a fixture, corpus or `runs/` directory is excluded: those walk DATA, and a data walk
that misses a file is a different (and usually louder) failure than a guard that misses code.

## What the columns mean, and what they do NOT

| column | derived how | trustworthy? |
|---|---|---|
| **via** | the discovery mechanism, read from the file | mechanical, reliable |
| **reach** | path roots the file names literally | mechanical, **an upper bound** — a named root is not proof the walk gets there |
| **claims "every"** | prose matching `every <file/script/module/CLI/…>` | **a flag for reading, NEVER a finding** |

**The third column is the one to be careful with.** "Claims every" is true of thirty of the fifty-two, and
in most it is correctly scoped — *"every package"*, *"every playbook"*. It marks a file worth reading; it
does not say anything is wrong. Rows below are marked READ only where somebody has actually read them.

## The finding this census produced on its first run

**`scripts/**/*.mjs` is outside the TypeScript program entirely** — 22 CLIs, including `row-claim.mjs`,
`merge-guard.mjs`, `merge-queue.mjs` and `mutation-check.mjs`, several of which carry `@type` JSDoc
annotations implying somebody expects them checked.

```
tsconfig.json include:  packages/*/src/**/*.{ts,mjs}   packages/*/scripts/**/*.mjs
                        packages/*/bin/**/*.mjs        packages/*/*.mjs
                        scripts/test-support/**/*.ts        <- the ONLY top-level scripts/ entry
```

Measured, with a control, rather than read off the config:

```
deliberate `/** @type {number} */ const X = "not a number"` appended to …

  scripts/row-claim.mjs                    npm run typecheck -> EXIT 0, clean
  packages/control/src/fleet-discover.mjs  npm run typecheck -> EXIT 2, TS2322
```

**Same error, same repo, same command — caught inside a package, invisible in `scripts/`.** The control is
what makes this a boundary rather than a disabled check. `typecheck-coverage.test.ts` polices
*"every marked file"* over `packages/*/src` and `packages/*/scripts`, so it cannot see this. Filed
separately; this document does not fix it.

**That is the same directory, and the third guard blind to it** — after the guarded-CLI census (#164) and
`entry-points.test.ts` (#174). The boundary is not drawn wrongly in one place; `scripts/` is systematically
outside the tooling that polices `packages/`.

## The four shapes, of which the fourth is the dangerous one

1. **Derived from `package.json`** — blind to anything a workflow, `action.yml`, a playbook or a scheduled
   job invokes. (`entry-points.test.ts`, #174.)
2. **A path prefix** — blind to repo tooling outside it. (`cli-flags.test.ts`, #164; `typecheck-coverage`,
   above.)
3. **A hand-written list** — blind to whatever nobody remembered.
4. **A walk that is correct while the PROSE describing it is wider.** No result the guard produces can say
   so, and the prose is what the next reader trusts. `install-git-hooks.mjs` carried a comment claiming a
   sibling guard was blind for hours after that guard was fixed — and it was cited, twice, as live
   evidence.

## The census

**Read the reach column as an upper bound.** `WHOLE TREE` means `git ls-files` with no path argument,
which is the only mechanism here that cannot be narrowed by a forgotten root.

| guard | via | reach (upper bound) | claims "every" |
|---|---|---|---|
| `control/src/bootstrap-playbooks-are-declared.test.ts` | readdir | ansible/ | no |
| `control/src/busy-worker-guard.test.ts` | readdir | ansible/ | no |
| `control/src/deploy-reached-no-hosts.test.ts` | readdir | ansible/ | no |
| `control/src/lab-pipeline.test.ts` | pkg.scripts | ansible/ | no |
| `judge/src/channel-tables-4.1.2.test.ts` | readdir | packages/ | no |
| `judge/src/criteria-counts-are-not-spelled-out.test.ts` | ls-files | packages/ | no |
| `judge/src/judge-backend-default.test.ts` | readdir | packages/ | no |
| `judge/src/rule-oracles.test.ts` | git-grep | packages/ | yes |
| `lab/src/capture/evidence-channels.corpus.test.ts` | readdir | _unclear_ | no |
| `lab/src/capture/keyboard-trap.corpus.test.ts` | readdir | _unclear_ | no |
| `lab/src/capture/skip-link.corpus.test.ts` | readdir | _unclear_ | no |
| `lab/src/dataset-paths.test.ts` | readdir | packages/, scripts/, ansible/ | yes |
| `lab/src/gates/exit-code-contract.test.ts` | readdir | packages/, scripts/, ansible/ | yes |
| `lab/src/gates/gate-partial-corpus-contract.test.ts` | pkg.scripts | packages/, scripts/, ansible/ | yes |
| `lab/src/gates/inventory-is-control-plane-only.test.ts` | ls-files | **whole tree** | no |
| `lab/src/gates/verdict-adoption.test.ts` | ls-files | packages/ | yes |
| `lab/src/gates/veto-audit-corpus.test.ts` | pkg.scripts | ansible/ | yes |
| `lab/src/packaging/audit-citation-index.test.ts` | readdir | packages/ | yes |
| `lab/src/packaging/claude-md-counts.test.ts` | readdir | packages/, scripts/, ansible/ | no |
| `lab/src/packaging/commands-documented.test.ts` | pkg.scripts | packages/, ansible/ | yes |
| `lab/src/packaging/criterion-list-duplication.test.ts` | ls-files | packages/ | yes |
| `lab/src/packaging/doc-citation-integrity.test.ts` | readdir | _unclear_ | yes |
| `lab/src/packaging/exports-are-shipped.test.ts` | readdir | packages/, scripts/ | no |
| `lab/src/packaging/git-population-vacuity.test.ts` | ls-files | packages/ | yes |
| `lab/src/packaging/git-spawn-classification.test.ts` | ls-files | packages/, scripts/ | yes |
| `lab/src/packaging/licence-boundary.test.ts` | readdir | packages/ | no |
| `lab/src/packaging/project-references.test.ts` | readdir | packages/, scripts/ | no |
| `lab/src/packaging/public-claim.test.ts` | readdir | packages/ | yes |
| `lab/src/packaging/published-imports.test.ts` | readdir | packages/, ansible/ | no |
| `lab/src/packaging/push-trigger-allowlist.test.ts` | readdir | .github/, ansible/ | no |
| `lab/src/packaging/rules-gate-export-divergence.test.ts` | pkg.scripts | _unclear_ | no |
| `lab/src/packaging/spawned-paths.test.ts` | readdir | packages/, scripts/ | no |
| `lab/src/packaging/stages-are-idempotent.test.ts` | readdir | packages/ | no |
| `lab/src/packaging/tracked-prose-leak-guard.test.ts` | ls-files | packages/ | yes |
| `lab/src/packaging/tracked-source-leak-guard.test.ts` | ls-files | **whole tree** | yes |
| `lab/src/packaging/trainer-callers.test.ts` | pkg.scripts | packages/, ansible/ | no |
| `lab/src/packaging/typecheck-coverage.test.ts` | readdir | packages/ | yes |
| `lab/src/packaging/user-facing-docs-file-facts.test.ts` | readdir | packages/ | yes |
| `lab/src/packaging/workflow-commands.test.ts` | readdir | .github/ | yes |
| `lab/src/packaging/workflow-path-coverage.test.ts` | readdir | packages/, scripts/, .github/, ansible/ | yes |
| `lab/src/referenced-scripts.test.ts` | ls-files | packages/, scripts/ | yes |
| `lab/src/repo/lockfile-in-sync.test.ts` | readdir | packages/, .github/ | no |
| `lab/src/runs-write-guard.test.ts` | readdir | packages/, scripts/ | yes |
| `worker-fleet/src/capture-body-owner.test.ts` | readdir | packages/ | yes |
| `worker-fleet/src/cli-flags.test.ts` | readdir | packages/, scripts/, ansible/ | yes |
| `worker-fleet/src/entry-points.test.ts` | pkg.scripts + readdir | packages/, scripts/ | yes |
| `worker-fleet/src/lab-job-params-reach-the-command.test.ts` | readdir | ansible/ | yes |
| `worker-fleet/src/lab-job.test.ts` | git-grep + pkg.scripts + readdir | packages/, ansible/ | yes |
| `worker-fleet/src/playbook-variables.test.ts` | readdir | ansible/ | yes |
| `worker-fleet/src/protocol-guard.test.ts` | ls-files | packages/, ansible/ | yes |
| `worker-fleet/src/utm-deprecated.test.ts` | readdir | _unclear_ | yes |
| `worker-fleet/src/worker-code-check.test.ts` | readdir | packages/ | yes |
## What is NOT in this document, deliberately

- **No fixes.** A fifth instance found by this survey gets its own row and its own measurement; folding
  one in here would make the list a by-product of a fix rather than the point.
- **No lint rule.** A mechanical check that each guard's prose matches its glob is the obvious next step
  and is premature: five instances is enough to say the class is real and not enough to say what a correct
  boundary looks like. Decide that after this list has been read.
- **No claim that the unread rows are fine.** Forty-seven of the fifty-two have not been read against
  their prose. That is a stated gap, not a silent one — which is the distinction the whole document is
  about.
