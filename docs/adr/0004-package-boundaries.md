# ADR 0004: Package boundaries and per-package public API

**Status:** accepted
- Date: 2026-08-05

## Context

The repo is one private, unversioned, unpublishable package. `package.json` is
`"private": true`, `"version": "0.0.0"`, `tsconfig.json` is `"noEmit": true`, and
every entry point runs through `tsx` against `.ts` sources. Nothing here can be
installed by anyone, so nothing here can be *pinned* by anyone either. ADR 0003
chose the GitHub Action as the primary distribution vector; that covers CI users
and nobody else.

Three seams were proposed as obvious (core / workers / ai-model). Rather than
assume them, the import graph was measured. The findings decided this ADR, and
two of them contradict the obvious layout.

**Two modules have zero imports and are depended on from everywhere.**
`src/capture/verify.ts` and `src/wcag/criteria.ts` each have *no* import
statements at all. Between them they are imported by `src/cli.ts`,
`src/report.ts`, `src/scan/page-title.ts`, `src/eval/run.ts`, `src/spike/judge.ts`,
`src/spike/local-judge.ts`, three files in `src/training/`, and
`scripts/evidence-check.mjs`. They are not "capture" and not "wcag docs" — they are
the **shared evidence contract**, and their physical location under `src/capture/`
is what makes the three-way split look plausible when it is not.

**The NVDA worker is already almost standalone.** Every file in
`src/capture/nvda/` imports only node builtins, `@guidepup/guidepup`, and its own
siblings. There are exactly two escapes: `capture-check.mjs` imports
`../../training/page-server.mjs`, and `guest-run.test.ts` imports
`../../../scripts/guest-run.mjs`. The first is a genuine directory-level cycle
(capture → training → capture) and must be inverted; neither is load-bearing.

**The host-side fleet tooling never touches guidepup.** `local-vm.ts`,
`worker-health.mjs`, `host-capacity.mjs`, `host-metrics.mjs`, `worker-stats.mjs`,
`fleet-consistency.mjs` plus `scripts/{doctor,deploy-worker,check-worker-code,compare-workers}.mjs`
and `scripts/local-worker/*` all run on the Mac and import nothing from
`src/capture/nvda/`. `action.yml` demonstrates the converse: on a Windows runner it
starts `node src/capture/nvda/server.mjs` directly and has no VM, no `utmctl`, no
pool. **Worker and fleet have different install targets and different operating
systems.** That is a deployment boundary, not a taste boundary.

**`src/spike/` is not spike code.** `judge.ts`, `local-judge.ts`, `rules.ts`,
`layers.ts` and `verify-gate.ts` are the production judging engine, imported by the
CLI, the report and the eval harness. Only `run-spike.ts`, `judge-sample.ts` and
`judge-file.ts` are harnesses. The directory name is historical and actively
misleads; Clean Code's naming chapter (2nd ed., §"Meaningful Names" — avoid
disinformation) is the reason to fix it while we are drawing boundaries anyway.

## Decision

**Six published packages plus one private workspace.** Each published package
exists because some real consumer wants it *without* one of the others — except
`scorer`, which is separate on versioning grounds and says so.

| package | licence | runs on | why it is separate |
|---|---|---|---|
| `@a11y-witness/evidence` | Apache-2.0 | anywhere | zero deps; the only thing an alternative screen-reader backend needs |
| `@a11y-witness/scorer` | AGPL | host w/ Python | weights are the API; a retrain is a breaking change to scores |
| `@a11y-witness/judge` | AGPL | anywhere | score an archived capture with no worker at all |
| `@a11y-witness/nvda-worker` | AGPL | **win32 only** | a GitHub Windows runner needs this and nothing else |
| `@a11y-witness/worker-fleet` | AGPL | macOS/Linux host | `doctor`/`worker-ctl` run where there is no NVDA |
| `a11y-witness` | AGPL | host | the front door; drags in axe/playwright a library consumer does not want |
| `@a11y-witness/lab` | AGPL, **never published** | host | our own corpus, gates and dataset pipeline |

`evidence` gets the project's own vocabulary as its name (`evidence:check`, "did
the evidence move") rather than a generic `contracts` or `types`.
`nvda-worker` names the screen reader so `voiceover-worker` can exist later
without renaming anything — ADR 0001 deferred VoiceOver, it did not rule it out.

### Public API surface, and what is deliberately not public

**`@a11y-witness/evidence`** — all contract, no I/O. Deliberately no `node:fs`, no
`process.env`, so a guest, a browser or a third party can import it.
- `.` — the wire types: `CaptureRequest`, `CaptureResult`, `CaptureStructure`,
  `CaptureInteraction`, `CaptureBackend`, `NavigationStrategy`, `CapturedAnnouncements`.
- `./verify` — the pure predicates: `captureReachedThePage`, `captureHasSubstance`,
  `captureIsSelfConsistent`, `captureRanRequestedProbes`, `captureMentionsTitle`,
  `pageCensus`, `captureDoubt`, `titleOf`.
- `./wcag` — `WCAG_22_AA` and its criterion type.
- Stability: highest in the repo. A breaking change here majors every downstream
  package, which is the intended disincentive.

**`@a11y-witness/scorer`** — the trained model as an artefact, not a library.
- `.` — `scorerPaths()` returning absolute paths (`weights`, `trainingReport`,
  `scoreScript`, `requirements`, `encoderDir`) resolved from `import.meta.url`;
  `encoderPresent()`; `scorerProvenance()` reading `training-report.json`.
- bin — `a11y-scorer-fetch-encoder`.
- **Not public: the training program.** `train-screenreader-model.py` stays in
  `lab`. Shipping a trainer implies a promise that a consumer can reproduce
  training; we cannot make that promise (the corpus is not distributed). The
  AGPL obligation is met by the source being public in this repo, not by the
  tarball carrying it.
- Stability: **the weights are the API.** A retrain that moves a score flips a
  consumer's pass/fail without any code change, so it is a **major** bump. This is
  the whole reason the model is not folded into `judge`.

**`@a11y-witness/judge`**
- `.` — `judge()`, `validateJudgment()`, and the types `JudgeInput`, `Judgment`,
  `Finding`, `Severity`.
- `./layers` — `layerOf`, `orderByLayer`, `LAYER_LABEL`, `ExperienceLayer`.
- `./rules` — `ruleFindings`, `RuleInput` (the deterministic layer, per ADR 0002).
- `./internal` — `hasEvidenceFor`, `evidenceFor`, `findingsFromScores`,
  `scoreCapture`, `applyGate`. Exported so `lab`'s tests can drive the real gate
  rather than a copy (the lesson `capture-faults.mjs` already taught: a test that
  asserts on its own fixture string is not testing the throw site) but documented
  as carrying **no semver guarantee**. `docs/METHODOLOGY.md` records that these
  guards were tuned against the eval cases; a public promise on tuned thresholds
  would freeze numbers we intend to move.
- Peer deps: `@a11y-witness/scorer` for the default `local` backend;
  `@anthropic-ai/sdk` optional for the `anthropic` backend.

**`@a11y-witness/nvda-worker`** — Windows only, but **NOT** via `"os": ["win32"]`.

> **Corrected during M5, by measurement.** npm applies the platform check to WORKSPACE MEMBERS, not just to
> installed dependencies, so `"os": ["win32"]` made `npm install` fail outright on macOS:
> `npm error notsup Unsupported platform for @a11y-witness/nvda-worker@0.1.0: wanted {"os":"win32"} (current:
> {"os":"darwin"})`. Removing the package from the root `dependencies` did not help — workspace membership
> alone is enough. Since this repo is developed on a Mac (CLAUDE.md's "the usual case"), the field and the
> monorepo are mutually exclusive, and `publishConfig` cannot add `os` at publish time either.
>
> The field bought a clean install refusal on the wrong platform. What replaces it is a loud runtime failure
> that already existed: `@guidepup/guidepup` throws `No available supported screen readers` at import where
> no screen reader is present, which is exactly the situation `os` was guarding against — and the README says
> Windows in its first line. A worse error message on a rarer mistake was the cheaper trade against not being
> able to install the repo at all.
- bin — `a11y-nvda-worker`, `a11y-capture-check`.
- `.` — `captureWithNvda()` (the one-shot entrypoint ADR 0003 Phase 1 asked for),
  `CAPTURE_PROTOCOL_VERSION`, `codeVersion()`.
- **Not public:** `capture-core` internals, `speech-channel`'s `tls.connect` shim,
  `browser-session`, the `diagnostics` payload shapes.
- **The HTTP contract is the real API**, and `CAPTURE_PROTOCOL_VERSION` versions it
  *independently of the package semver*. Conflating them would be expensive in both
  directions: a package major must not invalidate 2,122 cached captures, and a
  protocol bump must not wait for a major. Documented on the package README.
- `@guidepup/guidepup` pinned **exactly** `0.31.0`, not `^0.31.0` — see ADR 0033
  for why: it parses NVDA's speech before we see it, so its version is evidence,
  and a caret range would let a consumer's `npm update` silently change what a
  capture says.

**`@a11y-witness/worker-fleet`** — host-side lifecycle and diagnosis.
- bin — `a11y-doctor`, `a11y-worker-ctl`, `a11y-worker-deploy`, `a11y-worker-compare`.
- `.` — `leaseWorker`, `leaseWorkerPool`, `DEFAULT_WORKER`, `AfterRun`,
  `isAfterRun`, `guestReachableUrl`, `hostAddressForWorker`.
- `./health` — `assessWorker`. **Not `shouldRetireWorker`**, corrected during M6: it lives in
  `capture-decisions.mjs` with the rest of a run's accept/reject/retry/evict decisions, and pulling one
  member out of that cohesive set to satisfy a package boundary would be the boundary dictating the code
  rather than describing it. It stays in `lab`.
- `./capacity` — `availableHostMemoryMb`, `workersHostCanRun`.
- `fleetScriptPaths()` for the `.sh`/`.ps1` provisioning files, same
  resolve-from-`import.meta.url` pattern as `scorer`.
- **Not public:** `host-metrics`, `worker-stats`, `fleet-consistency`. These are
  measurement internals whose shapes change every time we measure something new,
  and CLAUDE.md's own history is a record of that happening.

**`a11y-witness`** (unscoped, the CLI) — takes the memorable name so `npx
a11y-witness` works with no wrapper package to maintain.
- bin — `a11y-witness`.
- `.` — `reportLines`, `Report` only, so a consumer can render our report shape.
- Depends on `evidence`, `judge`, `worker-fleet`. **Not** on `nvda-worker`: the CLI
  speaks HTTP to a worker, and a Windows consumer installs both deliberately.
- `playwright` / `@axe-core/playwright` stay optional deps, as today.

**`@a11y-witness/lab`** — private, `"private": true`, never published: `src/eval`
plus fixtures and cases, `src/training/*`, `page-server.mjs`, `src/spike`'s three
harnesses, `score-rules`, `stability-gate`, `evidence-check`, `corpus-snapshot`,
`compare-layers`, and the Python analysis/training programs. ADR 0008 gives the
reasoning.

### The cycle gets inverted, not tolerated

`capture-check.mjs` stops starting a page server and takes `--base-url` instead;
`page-server.mjs` moves to `lab`, which is the only other caller. Continuous
Delivery (Humble & Farley, 2010, §"Building Dependency Graphs") treats circular
component dependencies as acceptable only as a temporary build-ladder; we have no
reason to accept one at all here. Project references (ADR 0005) make it a build
error afterwards.

## Consequences

- Clean Code (2nd ed., §"Independent Deployability") is the frame: strong
  boundaries let components ship separately so only the changed unit is
  redeployed — and it is explicit that this structure has a real cognitive cost
  paid for clearer places to change. Six packages is us accepting that bill once,
  at the smallest count the measured graph supports.
- Building Micro-Frontends (Mezzalira, 2021, §"Monorepo") argues for grouping by
  domain seam rather than by folder, and warns that a monorepo's failure mode is
  tight coupling between packages that share a tree. The four seams here are
  domain seams *and* deployment-target seams: contract, judgment, capture-on-Windows,
  fleet-on-host.
- Continuous Delivery (2010, §"Managing Libraries") warns against both extremes —
  "components everywhere" and "the one component to rule them all" — and says
  componentization should follow real deployment, lifecycle, build-time,
  technology or team boundaries. Every split above cites one of those; `scorer`
  cites lifecycle explicitly.
- The `nvda-worker` package makes ADR 0003's Action honest: a Windows runner
  installs one package instead of cloning the repo.

## Residual risks and open questions

1. **`scripts/score-screenreader-model.py` does not exist on `main`.** It is
   referenced as the default by `local-judge.ts:312` and by three npm scripts, and
   `git cat-file -e main:scripts/score-screenreader-model.py` fails; it survives
   only in unreachable `kanban checkpoint` commits. The default judge backend
   therefore cannot run from a clean checkout, and `@a11y-witness/scorer` cannot be
   built until it is restored. M0 must confirm this and M3 is blocked on it.
2. **`local-judge.ts` resolves the scorer relative to the process cwd**
   (`".venv/bin/python"`, `"scripts/score-screenreader-model.py"`). That works only
   when cwd is the repo root, which is never true for an installed package. This is
   the concrete bug the `scorerPaths()` seam exists to fix.
3. **The encoder is 87 MB and gitignored.** A consumer's first score needs a
   network fetch plus a Python environment, so "install one package and run" is
   two steps for the judge path, not one. Whether that is acceptable, or whether the
   scorer should ship a quantised self-contained encoder, is open.
4. **Moving worker files touches three path-coupled things**: `action.yml`'s
   `node src/capture/nvda/server.mjs`, and the hashed-file list shared by
   `deploy-worker.mjs` and `check-worker-code.mjs`. CLAUDE.md records what a wrong
   hash list costs — guests serving stale code for an hour with no clue which file
   is wrong.
5. **`CAPTURE_PROTOCOL_VERSION` must not move during the migration.** Gate the
   worker extraction on `npm run evidence:check` reporting SAME; a CHANGED result
   means a full recapture of 2,122 captures.
6. Open: whether `worker-fleet` should be `os`-restricted. `utmctl` is macOS-only
   but the health/capacity predicates are portable, so restricting the package
   would block a Linux consumer from the useful half.
