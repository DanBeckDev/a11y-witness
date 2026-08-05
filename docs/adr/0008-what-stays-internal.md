# ADR 0008: What is deliberately not split, and what stays internal

- Status: Proposed
- Date: 2026-08-05

## Context

ADR 0004 publishes six packages. Roughly half the tree is not in them, and that
half is larger than the half that is: the eval harness and its 34 labelled
fixtures, the whole dataset pipeline under `src/training/`, the gates under
`scripts/`, the Python training and analysis programs, the three judge harnesses in
`src/spike/`, `action.yml`, and 87 MB of encoder.

A boundary decision is only half made if it does not say what is *outside*.
Continuous Delivery (Humble & Farley, 2010, §"Managing Libraries") names
over-fragmentation and the single giant component as equal failures, and says
componentisation should follow real deployment, lifecycle, build, technology or team
boundaries. Everything below fails that test on purpose.

## Decision

### `@a11y-witness/lab` — one private workspace, `"private": true`, never published

Contents: `src/eval/` (cases, fitness, fixtures, pages, `rules-check`),
`src/training/` (the dataset generator, preflight, capture driver, cache,
export, check-signals, status/wait, `page-server.mjs`), the three harnesses from
`src/spike/` (`run-spike.ts`, `judge-sample.ts`, `judge-file.ts`), the gates
(`score-rules.ts`, `stability-gate.mjs`, `evidence-check.mjs`,
`corpus-snapshot.mjs`, `compare-layers.mjs`), and the Python programs
(`train-screenreader-model.py`, `evaluate-screenreader-acceptance.py`,
`report-screenreader-errors.py`, `fetch-screenreader-encoder.py` — the last one is
*also* shipped in `scorer`, because a consumer needs the encoder too).

It is one package rather than three because none of the three has a consumer.
Splitting `eval` from `training` from `gates` would buy independent versioning of
things that are only ever run together, from this checkout, by us — the
"components everywhere" failure.

**Why none of it is published:**

- **The eval fixtures and thresholds are not a product.** `docs/METHODOLOGY.md`
  already records that the guards were tuned against these 34 cases, that scoring is
  single-run, and that there is no expert baseline. Publishing them invites a
  consumer to treat our tuning set as a benchmark and quote numbers the methodology
  says are not quotable.
- **The dataset pipeline's output is the model, and the model already ships.**
  `src/training/` generates 1,061 case pairs, drives 2,122 captures and exports
  JSONL. Its product is `models/screenreader-scorer/`, which `@a11y-witness/scorer`
  distributes. A consumer wanting a different model needs the corpus, which we do
  not distribute; shipping the pipeline without the corpus ships a promise we cannot
  keep.
- **The gates encode our own risk posture.** `stability-gate.mjs`'s canaries are
  chosen because each one *can express* a specific artefact (autofill U+FFFC, focus
  mode key echo). They are meaningful against our pages, on our workers. As a
  published tool they would be a check that examines nothing while reporting
  success — the exact failure this repo names most often.

`lab` still depends on the published packages by workspace range like everyone
else, which is deliberate: **it is the first consumer of every public API.** If
`lab` needs something that ADR 0004 marks not-public, that is a signal about the
API, and the `judge/internal` subpath is where that pressure is made visible
instead of hidden.

### `action.yml` stays at the repo root and is not a package

The GitHub Action is distributed by git ref (`uses: owner/a11y-witness@v1`), not by
npm. It is a composite action; it will `npm i @a11y-witness/nvda-worker` and
`a11y-witness` rather than run files from the checkout. Two consequences to carry
into the migration: its hardcoded `node src/capture/nvda/server.mjs` breaks the
moment the worker moves, and its release cadence is git tags on this repo, which is
a *third* versioning scheme alongside package semver and
`CAPTURE_PROTOCOL_VERSION`. Three schemes is the maximum tolerable; do not add a
fourth.

`src/action/` (`run.ts`, `summary.ts`) is self-contained — it imports only node
builtins and its own sibling. It moves into `packages/cli/` as a private module,
not its own package: it is the CLI's CI presentation layer, and a consumer who is
not GitHub Actions has no use for it.

### `src/spike/` is renamed, not split

`judge.ts`, `local-judge.ts`, `rules.ts`, `layers.ts` and `verify-gate.ts` become
`packages/judge/src/`. The three harnesses go to `lab`. The name `spike` is
retired: it says "throwaway experiment" about the production judging engine, which
is disinformation in the Clean Code sense (2nd ed., §"Meaningful Names"), and it is
the reason a reasonable reader would scope this seam wrongly. `npm run spike` keeps
working as a root delegation so nothing in CLAUDE.md breaks.

### `models/encoders/` is not packaged

87 MB, gitignored, third-party, and not ours to redistribute. `scorer` ships the
27 KB `model.safetensors` and `training-report.json` (which are ours and are the
product) plus the fetch program, and resolves the encoder at a configurable path.
This keeps the tarball small enough to install casually, at the cost of a two-step
first run — see ADR 0004, risk 3.

### `runs/`, `data/`, `backups/` are not packaged

`runs/` is the corpus and gitignored. `data/accessibility-sources.json` has no
importer in `src/` or `scripts/` at all — it is reference material; it stays at the
root until something needs it, and if nothing does, it should be deleted rather than
packaged.

### Root `package.json` keeps its script names

`npm run witness`, `npm run doctor`, `npm run training:capture`, `npm run
gate:stability`, `npm run worker:deploy` and the rest become thin delegations into
workspaces. Those names appear dozens of times across CLAUDE.md, `docs/`, and the
runbooks, and they are the documented interface for both humans and agents working
here. Renaming them during a structural migration would invalidate the
documentation that tells you how to recover from a failed structural migration.

## Consequences

- The published surface stays small and defensible: four libraries, one worker, one
  CLI. Everything whose correctness depends on our corpus, our workers or our tuning
  stays where it can be honest about that.
- `lab` being a real workspace with real ranges means the public APIs get exercised
  by a demanding consumer on every `npm test`.
- The `judge/internal` subpath is a deliberate pressure valve and a deliberate
  smell. If `lab` starts reaching into it constantly, the boundary is wrong and
  should be redrawn — that is the signal it exists to produce.

## Residual risks and open questions

1. **`lab` will be the largest package and the least reviewed.** Private packages
   attract the code nobody wants to name. Worth revisiting once the migration
   settles: `training/` may deserve to be its own private workspace on lifecycle
   grounds (it is the only part that owns a 3h46m job).
2. **`page-server.mjs` moving to `lab` requires inverting the worker's dependency
   on it** (`capture-check.mjs` takes `--base-url`). If that inversion is skipped,
   `nvda-worker` depends on a private package and cannot be published at all.
3. **Not publishing the eval harness makes external judge contributions harder.**
   Somebody improving the judge cannot run `npm run eval` without the corpus. That
   is already true today; this ADR does not fix it, and a distributable subset of
   fixtures is an open question rather than a decision.
4. Open: whether `data/accessibility-sources.json` is live at all. It has no
   importer; either something intends to use it or it is dead weight.
