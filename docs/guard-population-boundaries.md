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

**26 of 28 `scripts/*.mjs` files are never type-checked, and several carry `@type` JSDoc written by
somebody expecting enforcement** — `row-claim.mjs` annotates its injected seam, `merge-guard.mjs`
annotates its whole pure verdict. Those annotations are documentation. Filed as #189.

```
identical `/** @type {number} */ const X = "not a number"` appended to …

  scripts/row-claim.mjs                    npm run typecheck -> EXIT 0, clean
  packages/control/src/fleet-discover.mjs  npm run typecheck -> EXIT 2, TS2322
```

**AND THE FIRST EXPLANATION OF THAT CONTROL WAS WRONG, WHICH IS THE MOST USEFUL THING IN THIS DOCUMENT.**

`tsconfig.json` does omit top-level `scripts/` from `include`, so the obvious reading is that the
directory is outside the program. That reading is wrong, and it was tested rather than believed:

```
include now: … scripts/test-support/**/*.ts  scripts/**/*.mjs   <- the widening landed
npx tsc --noEmit  ->  EXIT 0, errors=0                          <- the error is STILL not caught
```

`checkJs` is set nowhere. Under `allowJs` alone a `.mjs` file is parsed and never error-checked **unless
it opts in with `// @ts-check`**:

| directory | files carrying `// @ts-check` |
|---|---|
| `packages/control/src/*.mjs` | 6 of 7 |
| `scripts/*.mjs` | **2 of 28** |

`fleet-discover.mjs` has the pragma; `row-claim.mjs` does not. **The two files differed in the pragma, not
in the program** — so the fix implied by the config (an `include` line) would have shipped, changed
nothing, and closed the row. A sizing run that stopped at the error COUNT would have reported "two lines,
no errors" and been believed.

**This document is a census of guards whose stated population is narrower than the claim about them, and
its author then diagnosed its own first finding by reading a config instead of measuring which mechanism
was operative.** The control caught it, and only because the widening was run as a control rather than
applied as a fix.

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

## Moved from CLAUDE.md (#458)

## A flag nobody reads, and an extra var nobody reads

Two instances of one defect, at two layers, both fixed 2026-08-26 and both worth recognising by shape:
**an argument the receiving thing does not know is DISCARDED, so the default runs and reports success.**

- **Ansible silently drops an unused extra var.** `-e out=varied` on a job that never reads `out` looked
  like it worked. 36 jobs had 6 hand-written `when: job == '<name>'` asserts, so a new job's parameter
  needed somebody to remember one. Each job now DECLARES `params: {only: required}` beside its command,
  and `lab-job.test.ts` DERIVES the same answer from that job's raw argv and refuses any disagreement —
  `{{ only }}` is required, `{{ out | default('candidate') }}` is optional, and `model is defined` is the
  other spelling of optional. `-e describe=1` prints what a job takes.
- **Every `.mjs` CLI here ignored an unrecognised flag**, because they all parse argv by looking for what
  they know — so a mistyped one ran the default and reported success. `refuseUnknownFlags`
  (`cli-flags.mjs`) refuses it, names the near miss, and prints what the command does take.
  **Every argv-reading module in the tree is guarded or exempted with a stated reason, and
  `cli-flags.test.ts` is the only place that says how many.** It DISCOVERS them by walking the tree and
  fails on any it cannot classify. This paragraph used to carry the count, and the count moved six times
  in one night (75, 76, 77, 79, 82, 85), each value correct for the minutes between two merges; a number
  the tree computes does not live in prose. The one exemption, `scripts/check-schema-migration.mjs`, is
  copied into a throwaway directory by its own gate test and so cannot resolve a workspace import; its
  single flag fails closed, and the test names it with that reason.
  > **The flag lists are READ out of each file, never derived, and every batch proved why.**
  > `stability-gate` builds flags from a variable and `repeat-capture` reads seven through an `arg(name)`
  > helper, so a regex reports ZERO for both. `fleet-playbook`, `capture-fixtures` and
  > `audit-size-sensitivity` mention flags they pass ONWARD to git or to Python. `compare-layers` takes
  > its input positionally. `compare-workers` accepts `--runs=` as a deliberate alias of `--rounds=`.
  > A derived guard would have refused correct usage in every one of those cases.

Three things that cost real time inside those two fixes:

- **`lab_jobs[job].argv` cannot be inspected, because reading it RENDERS it.** A job whose command says
  `{{ only }}` dies with *"'only' is undefined"* while being asked WHETHER it needs `only` — the question
  destroys its own subject. A `lookup()` result is never re-templated, so a playbook CAN re-read itself,
  and `lab-status`/`lab-log`/`lab-stop` do exactly that to check a job name against the catalogue.
- **But do not build an analyser out of Jinja, which is what the first version of this did.** It
  re-read the playbook and `regex_findall`-ed the parameters out of each argv at runtime. The SRE
  Workbook (ch14-15) names the shape: a YAML+Jinja config that accrues *"ad hoc language features"*
  becomes *"an esoteric and complex programming language ... difficult for both humans and tools to
  maintain and analyze"*, and its remedy is to **separate config from data and put the cleverness in
  TOOLING**. The `\b`-is-a-backspace bug below is what that costs. The interface is now DATA an operator
  can read, and the derivation is a test in a language with a real regex engine that can be
  mutation-checked.
- **`\b` inside a JINJA string literal is a BACKSPACE**, since Jinja parses escapes with Python's rules.
  Written that way first, both checks passed vacuously *and* refused `-e only=` on the one job requiring
  it. Found by mutation, never by reading — a guard must be shown to fail before it is trusted.
- **Static derivation of a CLI's flags CANNOT be trusted here, and that is why the list is pinned rather
  than derived.** `stability-gate` builds flags from a variable and `repeat-capture` reads seven of them
  through an `arg(name)` helper, so a regex reports ZERO flags for both — a test that would have passed
  having examined nothing. Naming `--worker` literally in `repeat-capture` immediately made a pre-existing
  discovery test fire: it had been reading `--worker` and never validating it.


