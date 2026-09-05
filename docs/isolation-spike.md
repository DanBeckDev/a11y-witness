# M0 — can a consumer install and run one package in isolation?

> **Historical record, 2026-08.** This was the M0 throwaway spike that tested whether a consumer could
> install and run one package in isolation. Its findings are now enforced automatically by
> `npm run gate:isolation`, which runs in `release:gate` — so this file is the REASONING behind that gate
> rather than a live task list.
>
> Paths below predate the multi-package migration (`scripts/score-screenreader-model.py` is now
> `packages/scorer/python/score.py`, and the encoder fetcher is `packages/scorer/python/fetch-encoder.py`).
> They are left as written, because rewriting a record of what was true then makes it a worse record.

`PLAN.md`'s multi-package plan rests on one unproven claim: **that a consumer can install and run this code
in isolation.** M0 is the throwaway spike that tests it before any file moves. It was expected to fail; the
deliverable is the enumerated failure list below.

## Method, and the trap that shapes it

**`npm pack` includes untracked files.** Packing from a working tree that happens to contain a missing file
produces a tarball that works, so the spike *must* start from a fresh clone or it cannot express the fault
it exists to find. This is not hypothetical — it is exactly why a missing scorer program went unnoticed for
the project's whole life while every local run succeeded.

```
git clone --local . /tmp/witness-clean     # committed files only
cd /tmp/witness-clean && npm pack          # 659 kB, 235 files
mkdir /tmp/consumer && cd /tmp/consumer
npm init -y && npm i /tmp/witness-clean/a11y-witness-0.0.0.tgz
```

## Findings

| # | finding | evidence |
|---|---|---|
| 1 | **No entry point at all.** `import("a11y-witness")` fails. | `ERR_MODULE_NOT_FOUND`; root `package.json` has no `exports`, `main`, `files` or `bin`, plus `private: true` and `version: 0.0.0` |
| 2 | **Shipped TypeScript is unusable, not merely unbuilt.** | `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING` — Node **refuses** to strip types for files under `node_modules`, whatever the consumer's flags. 59 `.ts` files ship; 1 `.js` does |
| 3 | `.mjs` works verbatim, with no build. | `import(".../capture-faults.mjs")` returned `FAULT, captureFault, faultCode` |
| 4 | Dependencies resolve correctly, including the optional ones. | `@guidepup/guidepup`, `playwright`, `axe-core` all installed into the consumer |
| 5 | The scorer program and weights **do** ship, and now resolve. | `scripts/score-screenreader-model.py` and `models/screenreader-scorer/model.safetensors` are both in the tarball, and `scorerPaths()` resolves them from `import.meta.url` |
| 6 | The 87 MB encoder is absent — **as designed**. | `models/encoders/**` is gitignored; the tracked `scripts/fetch-screenreader-encoder.py` is the documented route, and `action.yml` already calls it |
| 7 | No Python interpreter ships — **as designed**. | `A11Y_PYTHON` exists for this reason; `action.yml` sets it to a bare `python` because Windows runners have no venv |
| 8 | **A fresh clone cannot score at all.** | The committed weights are stamped `screenreader-structured-v4`; the committed trainer declares `screenreader-structured-v1`. The scorer refuses the combination — correctly — with `scorer representation schema does not match the runtime` |

Finding 2 is the one that changes a decision: it means **the build in ADR 0005 is load-bearing, not a
convenience.** There is no "ship the sources and let the consumer transpile" fallback, because Node closes
that door specifically inside `node_modules`. Finding 3 is its mirror image and validates shipping the
capture worker as `.mjs` verbatim — the one package that needs no build step is the one that has to run on
a Windows runner with the least ceremony.

## Finding 8 is a live product defect, not a packaging one

The default judge backend — `judge-backend: local` in `action.yml`, and `JUDGE_BACKEND`'s default — has
**never worked from a fresh clone.** Three separate causes, all the same family, "the working tree is not
the repo":

| cause | status |
|---|---|
| `scripts/score-screenreader-model.py` never committed | **fixed** — committed, plus a test asserting every referenced `scripts/…` program is tracked |
| `packages/lab/scripts/check-screenreader-hardening.py` never committed | **fixed** — same commit |
| `packages/lab/scripts/train-screenreader-model.py` committed at `v1` while the weights are `v4` | **open** — see below |

The third is not a missing file: the trainer *is* tracked, at the wrong version. The `v4` trainer exists
only as an uncommitted change in one shared working tree — 80 hours old, 99 insertions, introducing
`ENGINEERED_FEATURE_MULTIPLIERS` — and it is one coherent piece with roughly seventeen other uncommitted
files (`export-screenreader-dataset.mjs`, `check-signals.mjs`, `acceptance-matrix.mjs`, the dataset
pipeline). The exporter computes the same features, so committing the trainer alone would very likely
produce a different inconsistency rather than fix this one.

`packages/scorer/src/scorer-artifact.test.ts` now asserts the committed weights and committed trainer agree, so this
cannot drift again unnoticed. It **passes in a tree holding the `v4` trainer and fails on a clean clone**,
which is the honest state of the repository until that pipeline work is committed by whoever owns it.

## What this means for ADR 0004

Nothing here invalidates the package boundaries:

- **`@a11y-witness/scorer` as an npm package survives.** The program is 15 KB and the heads 27 KB; both
  ship without trouble. The encoder is the only large artifact and already has a fetch path, so the
  "cannot be fetched without our credentials" risk M0 was told to watch for did not materialise.
- **`@a11y-witness/nvda-worker` shipping `.mjs` verbatim is confirmed viable** (findings 3 and 4).
- **Every package needs a real build and real entry points** (findings 1 and 2) — which is M1's work, and
  is now justified by measurement rather than convention.

## Reproducing

```bash
git clone --local . /tmp/witness-clean && cd /tmp/witness-clean && npm pack
mkdir -p /tmp/consumer && cd /tmp/consumer && npm init -y
npm i /tmp/witness-clean/a11y-witness-0.0.0.tgz
node --input-type=module -e "import('a11y-witness').catch(e=>console.log(e.code))"   # finding 1
```

`/health` from the capture worker was **not** attempted: it needs a Windows host with NVDA, and this spike
ran on macOS. Recorded as not attempted rather than reported as a pass — findings 3 and 4 establish that
its `.mjs` modules and its dependency both resolve from an installed package, which is the part packaging
can determine.
