# Architecture audit

An outside-in structural review of the repository at `dba4278` (main), carried out 2026-09-02/03. It asks
whether the boundaries the ADRs drew are the boundaries the code has, whether the contracts between the
parts have a single owner, and whether the verification machinery can see the failures that matter. It does
not re-audit the accessibility evidence itself; `not-working.md`, `known-gaps.md` and the ADRs already do
that better than an outsider could.

**Updated 2026-09-05 against `55cb006` (main).** [§14](#14-follow-up-review-2026-09-05) adds four missed
contract failures, reproduces the judge-composition hazard, and corrects the release-versioning prediction.
It also distinguishes closed findings from a new schema migration. Sections 1–13 retain the original
snapshot's measurements and recommendations, with dated corrections at the affected findings; §14 takes
precedence where they differ. This is a documentation review, not a release-readiness verdict.

**How to read the confidence marks.** Every finding cites `file:line`. Findings marked **verified** were
re-checked in this session by running a command or reading the cited lines a second time. Findings marked
**read** come from one reading pass with citations. Findings marked **predicted** were derived from reading
a dependency's source and were not observed happening. Original line numbers are as of `dba4278` and will
drift; §14's citations are at `55cb006`. In §14, **reproduced** specifically means an executable probe,
not merely a second reading of the source.

---

## 1. Verdict in one page

The repo is in better structural health than its size and velocity would predict. The package split of ADR
0004 holds where it was designed to: the declared graph is a DAG, `evidence` is genuinely pure, `control`
has no npm dependencies and a test checks its import closure (not its runtime data dependencies; §3.2),
and the fault-code and client-assigned capture-ID contracts are useful foundations. The latter is bounded
result recall, not duplicate-execution prevention; see §14.4. Its strongest asset is not any module but a
**testing pattern**: about thirty meta-tests that discover a population (every npm script, every argv reader, every module that POSTs
`/capture`, every evidence field on disk), require each member to be classified or exempted with a reason,
and open with a vacuity guard. That pattern is why a repo of 103,535 source lines with one author and
50–98 commits a day had 0 lint errors and 1,868 passing tests at the original snapshot. Those checks provide
meaningful protection against shape drift; they do not establish that silent corruption has never occurred.

The problems are of three kinds, and they share a cause.

1. **The contracts between parts have no single owner.** The capture wire shape is declared in at least six
   places that disagree; the worker's protocol version and fault codes are reached from other packages by
   regex and string literal because the package exports the wrong subpaths; the `runs/` layout is spelled
   eleven times; 95 environment variables are read with no module defining any of them. The repo's own
   most-repeated lesson is "a fact stated twice drifts", and it has been applied rigorously to *evidence*
   and hardly at all to *interfaces*.
2. **Four modules have grown past the point where their seams are visible.** `capture-core.mjs` is ten
   responsibilities in 4,727 lines with no section markers; `server.mjs` is a nine-line router beside 700
   lines of policy and fifteen loose state variables; `rules.ts` and `case-matrix.mjs` each hold three or
   four concerns that already have clean seams. None of this is hidden by long functions, because ESLint
   forbids them; it is hidden by file size.
3. **The verification architecture has blind spots exactly where the product meets a consumer.** The
   GitHub Action's axe layer cannot launch a browser and the smoke test cannot see that; the published CLI
   binary is never executed by any automated path; a published export points at a file the tarball does
   not ship and the isolation gate skips its only consumer; the git hooks that hold the pre-push gates are
   installed by nothing; the 30 Python tests run under no automated gate. Every one of these is the shape
   the repo names most often, "a check that passes having examined nothing", one layer further out than
   where the repo has been looking.

Two findings are correctness hazards in the shipped product rather than structure, and they come first in
the ranked list: the live scoring path and the training path build different model inputs, and the rules
layer's asserting findings can be suppressed by a referring one from the model.

### The ten findings to act on first

| # | finding | confidence | section |
|---|---|---|---|
| 1 | The live path feeds the encoder a unit type (`landmark-navigation`) that no training record carries: Python `evidence_units` and TS `evidenceUnits` disagree | verified | §4.1 |
| 2 | Runtime and weights are coupled without a compatibility window. The original `v17` → `v18` migration closed; a new `v18` → `v19` mismatch is open at the follow-up snapshot | verified; updated 2026-09-05 | §4.2 |
| 3 | `withRuleFindings` dedupes by criterion, so an unmapped model referral can drop a rule assertion on that criterion. Reproduced on 1.1.1; no persistent composition regression test yet | reproduced 2026-09-05 | §4.3 |
| 4 | The GitHub Action's axe layer never runs: `chromium.launch()` with no channel on a runner that skipped the browser download; the smoke never reads `ruleBased` | verified | §7.1 |
| 5 | `@a11y-witness/worker-fleet/cli-flags` exports `src/cli-flags.mjs`, which the tarball does not ship; 42 importers, all in the private `lab`, which the isolation gate skips | verified | §3.1 |
| 6 | The capture wire contract has no owner: a stale published `CaptureRequest`, six parallel result shapes, an untyped second contract in diagnostic mark names, protocol version regex-scraped in four places, fault codes copied as literals, four to six `POST /capture` body builders, and the product CLI sending no `captureId` | verified | §5 |
| 7 | `control` and `worker-fleet` form a cycle: the published `worker-fleet` reads the private `control`'s `inventory.yml` from four modules | verified | §3.2 |
| 8 | The deprecated UTM path is still the CLI's default lease order, still exported and shipped with two bins, still `doctor`'s only capacity check, and still the newcomer route in `docs/README.md` | read | §8 |
| 9 | Nothing installs the git hooks; the 30 pytest files run under no automated gate; every release-integrity gate is dispatch-only | verified | §7.2 |
| 10 | `capture-core.mjs`, `server.mjs`, `rules.ts`, `case-matrix.mjs`: four god-modules whose seams are already measured and clean | read | §6 |

**Current-status caveat:** #2 is now a different migration (`v18` → `v19`); #3 has a runtime reproduction;
the new findings and corrected priorities are in §14. File size alone is not a defect: §6's proposed splits
are justified by separate responsibilities and mutable state, not a line-count threshold.

---

## 2. The system as it is

### 2.1 Size and shape

| package | licence | published | source lines | tests | role |
|---|---|---|---|---|---|
| `evidence` | Apache-2.0 | yes | 4,037 | 9 | wire types, announcement grammar, predicates, WCAG list |
| `scorer` | AGPL | yes | 6,467 (38 `.py`) | 4 + 29 py | trained heads, Python scoring program, feature contract |
| `judge` | AGPL | yes | 8,218 | 22 | rules, backends, criterion coverage, outcomes |
| `nvda-worker` | AGPL | yes | 10,958 (25 `.mjs`) | 35 | the Windows capture worker |
| `worker-fleet` | AGPL | yes | ~5,120 + 4,485 shell/ps1 | 28 | host-side lease, health, capacity, fleet status, provisioning |
| `cli` | AGPL | yes | 3,755 | 10 | the `a11y-witness` front door and the Action runner |
| `lab` | AGPL | **private** | 38,339 | 111 | corpus, capture runner, exports, gates, audits, trainer |
| `control` | AGPL | **private** | 973 node + 39 YAML | 4 | Ansible, the job catalogue, the pipeline runner |
| `nvda-speech` | GPL-3.0 | **private** | 5,768 py | 1 py | NVDA announcement composition ported off Windows |

Totals: 103,535 source lines (ts 40,935; mjs 37,308; py 14,893; yml 6,038; ps1 2,401; sh 1,713); 223 TS
test files (1,696 tests) and 30 Python test files (172 tests); 1,372 commits; 114 root npm scripts; 70 core
documentation files at 1.31 MB / 20,055 lines. Baseline at `dba4278`: `lint` 0 errors and 990 warnings
(all `no-magic-numbers`, triaged); `typecheck` clean; every test passes; 122 of 124 `.mjs` files carry
`// @ts-check`.

`lab` is 37% of all source and 50% of all tests. 61 of the 114 root scripts (53%) point into it; 73 (64%)
point into a private package. The repo's operational interface is root npm scripts into `packages/lab`, and
the published packages are reached only through them.

### 2.2 The declared dependency graph, which is a DAG

```
evidence <- scorer <- judge <- cli
                        ^
nvda-worker <- worker-fleet ---+
                    ^
lab -> {evidence, judge, scorer, worker-fleet, nvda-worker}     (nothing depends on lab)
control -> {}                                                    (by design, ADR 0012)
```

Every declared workspace dependency is imported at least once. The only undeclared workspace imports are
two tests (`packages/lab/src/packaging/public-api.test.ts:98` imports `a11y-witness`;
`packages/nvda-worker/src/field-match.test.ts:19` imports `evidence`), both surviving on root hoisting.
`tsconfig` project references match actual imports exactly for the five TS projects that exist.

### 2.3 The pipeline, capture to outcome

1. `cli.ts` leases a worker (`:277`), captures over HTTP (`:728`) concurrently with an optional axe scan
   (`:412`), and builds a `JudgeInput` with `oracleCounts` (`:493-501`).
2. `judge()` (`judge/src/judge.ts:601`) dispatches on `JUDGE_BACKEND`, default `local`: `judgeLocally`
   spawns `score.py --stdin` with the annotated capture (`local-judge.ts:445`), and `findingsFromScores`
   drops rule-owned subtypes and emits findings with no `mapping`.
3. `withRuleFindings` (`judge.ts:635`) appends `ruleFindings` for criteria the model did not mention.
4. `criterionOutcomes` (`outcomes.ts:244-310`): a `conformance` finding gives `failed`, any other gives
   `cantTell`, then abstention, truncated and incomplete feeds, applicability, `passed`.

This is the ADR 0021 design and it is implemented. The README's "Part 1" (`README.md:128-150`) still
describes the ADR 0002 design (a generative pass refined by a DeBERTa gate) and links `src/spike/*` paths.

---

## 3. Package boundaries: where the declared graph and the real one differ

### 3.1 A published export the tarball cannot satisfy — verified

`packages/worker-fleet/package.json` maps `./cli-flags` to `./src/cli-flags.mjs`; its `files` list ships
`dist`, `src/local-worker`, `src/provisioning`. `npm pack --dry-run` in that directory produces 133 files
including `dist/cli-flags.mjs` and no top-level `src/*.mjs`. From a tarball the import fails with
`ERR_MODULE_NOT_FOUND`; in the workspace it resolves through the symlink. It is the most-imported subpath in
the repo (42 sites, every one in `lab`). `scripts/isolation-gate.mjs:143-147` skips private packages by
design, and `cli/isolation-smoke.mjs` never imports it, so the gate that exists to catch exactly this class
("exports subpaths that do not resolve", `isolation-gate.mjs:16`) is green. The fix is one character class:
point the export at `./dist/cli-flags.mjs`, which already exists.

### 3.2 A real cycle: `control` <-> `worker-fleet` — verified

`control` reaches `worker-fleet` by relative import at `fleet-playbook.mjs:50-63` and `lab-pipeline.mjs:56`.
That direction is sanctioned: `control-has-no-dependencies.test.ts:47-79` walks the import graph and refuses
any package-name specifier, so relative reach is the only mechanism. The reverse edge is the problem.
`worker-fleet` reads `../../control/ansible/inventory.yml` and `group_vars/a11y_workers.yml` from
`fleet-env.mjs:82-83`, `fleet-status.mjs:69-71`, `fleet-discover.mjs:457` and `fleet-wake.mjs:137`. So the
published `@a11y-witness/worker-fleet` ships code whose data file lives in a package that is never
published, and `fleet-env.mjs:133-201` carries a hand-rolled YAML reader ("a stack, not a parser") to read it
without a dependency. Either the inventory-reading modules belong in `control`, or the inventory path must
be injected rather than resolved relative to the package.

### 3.3 `lab` bypasses `worker-fleet`'s API at 26 source sites — verified

| target in `worker-fleet/src` | exported? | sites |
|---|---|---|
| `worker-http.mjs` | yes, as `./worker-http` | 12 (`capture-client.mjs:25`, `repeat-capture.mjs:24,27`, `capture-real-pages.mjs:27`, `capture-screenreader-dataset.mjs:11`, `capture-fixtures.mjs:48`, `page-identity-rate.mjs:39`, `capture-check.mjs:17`, `scripts/gate-probe-order.mjs:38`, `bench-capture.mjs:15`, `stability-gate.mjs:45`, `evidence-check.mjs:35`) |
| `worker-health.mjs` | yes, as `./health` | 3 |
| `host-address.mjs` | no | 6 |
| `fleet-env.mjs` | no | 3 |
| `fleet-consistency.mjs`, `worker-code-check.mjs` | no | 1 + 2 |

The same module is imported three ways in one repo: `@a11y-witness/worker-fleet/worker-http` from `cli`,
`../../../worker-fleet/src/worker-http.mjs` from `lab`, `../../worker-fleet/src/...` from `control`.
`packages/lab/scripts/generate-coverage-doc.ts:18,20` also reaches `../../judge/src/*.js`, bypassing the
`./coverage` export. Because `lab` and `control` have **no `tsconfig.json`**, they are outside `tsc --build`
and project references cannot police them; they are type-checked only by the root `noEmit` program, which
is why `pretypecheck` must build first. The package holding 27 of the 31 source-level bypasses is the one the
compiler-enforced graph of ADR 0005 cannot see.

### 3.4 A published package whose tests need a private one — verified

Twelve of `scorer`'s 29 pytest files load `lab` scripts by path or spawn them:
`test_unclosable_map_is_current.py:43` runs `node packages/lab/scripts/emit-unclosable-vetoes.mjs`;
`test_grants_map_is_current.py:49-50` imports `packages/lab/src/training/case-matrix.mjs`; ten more load
the trainer or evaluator by `importlib`. The trainer, evaluator and audits live in `lab` and their tests
live in `scorer`. Including tests, there are four more cycles (`nvda-worker`<->`worker-fleet`,
`lab`<->`worker-fleet`, `lab`<->`control`, `lab`<->`scorer`), all through test files.

### 3.5 Smaller boundary facts

- `worker-fleet/src/doctor.mjs:55` reads `../../scorer/models/screenreader-scorer/`; a published package
  resolving a sibling's model directory by relative path.
- `check-worker-code.mjs:41,63`, `deploy-worker.mjs:49,237`, `worker-code-check.mjs:235` hard-code
  `packages/nvda-worker/src` as a repo-relative path.
- Third-party: `yaml` is declared only by `cli` and imported undeclared by six test files in `lab`,
  `control`, `worker-fleet`; `axe-core` is required at `cli/src/scan/axe-tags.test.ts:20` and declared
  nowhere; `@huggingface/transformers` is dynamically imported at `judge/src/verify-gate.ts:141-143` and
  declared in no manifest (verified, grep exit 1).
- The CLI depends on `worker-fleet`, which depends on `nvda-worker`, which depends on guidepup; every CLI
  install pulls the Windows worker. `cli/isolation-smoke.mjs:57-58` asserts only the absence of a *direct*
  dependency.
- Root `package.json` lists all six workspace packages as dependencies, which changes nothing about
  resolution, and duplicates `cli`'s optional dependencies and `nvda-worker`'s guidepup pin (as `^0.31.0`
  against the worker's exact `0.31.0`).
- `data/accessibility-sources.json` has no importer. ADR 0008 said in August: "if nothing does, it should be
  deleted rather than packaged". `src/` at the root contains only `.DS_Store`; `models/` contains an empty
  directory protected by an 18-line `.gitignore` rationale.
- Lab Python reaches the scorer by `sys.path.insert` in five files, and `compose-multi-defect-probe.py:30`
  inserts the cwd-relative string `"packages/scorer/python"`, the working-directory guess that
  `spawned-paths.test.ts` forbids for JS.

---

## 4. Correctness hazards in the judge path

These are not structure. They are here because the structural audit found them and nothing else has.

### 4.1 The live path and the training path build different model inputs — verified

The exporter builds every training record's `evidenceUnits` through the TypeScript `modelInput`
(`lab/src/training/export-screenreader-dataset.mjs:5`, `build-realism-tier.mjs:43`, both importing
`@a11y-witness/scorer/evidence-units`). That function **deliberately omits landmarks**
(`scorer/src/evidence-units.ts:98-112`), for a measured reason: the landmark sweep is nondeterministic and
swung a conformant page across a threshold. The live path does not use it. `local-judge.ts:445` sends the
annotated capture to `score.py --stdin`; `score.py:80-93` has its own `evidence_units`, which **appends
`landmark-navigation`** from `structure.landmarks`; and `screenreader_features.py:1129,1156` read
`record.input.evidenceUnits` from whatever built it. So every live page, and every real-page calibration,
feeds the encoder a unit type that appears in no training record. `model-input.test.ts:59` checks two JS
suspects and cannot see `score.py`. `test_live_capture_carries_the_parse.py` calls `raw_capture_record` "a
fifth copy" of the contract and pins only the `parsed` block.

The remedy direction is not a choice: the weights were fitted to the TypeScript units, so the Python side
must stop appending landmarks, or better, stop having its own implementation. Whether `MODEL_INPUT_VERSION`
moves is a decision to record; the corpus does not need recapturing.

### 4.2 The default backend cannot score at HEAD — verified

**2026-09-05:** the specific `v17` → `v18` incident below closed in `68e3ada`. A new, explicitly tracked
`v18` → `v19` migration is open at `55cb006`; the shipped safetensors metadata still says `v18`. The
coupling remains, but this is not the original migration left unfinished. See §14.1.

`model.safetensors` metadata reads `representation: screenreader-structured-v17`; `training-report.json`
agrees; `screenreader_features.py:96` sets `FEATURE_SCHEMA_VERSION = "screenreader-structured-v18"`;
`packages/scorer/models/schema-migration.json` records the migration as opened 2026-09-02. `verify_artifact`
(`score.py:169-268`) raises, `scoreCapture` rejects (`local-judge.ts:422-437`), `judge()` has no catch, and
`cli.ts:801` dies. The last three `action-smoke` runs on 2026-09-02 fail at judging with `scorer
representation schema does not match the runtime`. This is deliberate and documented in the backlog, and
`release:gate` correctly refuses while it is open.

The architectural point is that the runtime constant and the shipped weights are coupled with **no
compatibility window**: a grammar fix that changes what the featurizer sees makes the product inoperable for
everyone until a retrain lands, and the retrain is gated behind a fleet recapture measured at ~8 hours. A
runtime that can score a `v17` artefact with `v17` features (or refuse only the criteria the change touches)
would let the grammar fix ship without taking the product down. **Follow-up qualification:** a compatibility
path needs the exact old featurizer, feature order and weights together; selectively suppressing criteria
is not by itself proof of compatibility. The simpler alternative is to promote runtime and weights
atomically, keeping experimental schema changes off the consumer release path until their gates pass.

### 4.3 A referral from the model can suppress an assertion from the rules — verified by reading

```ts
// judge.ts:635-640
const seen = new Set(verdict.findings.map((f) => criterionOf(f.wcag)));
const extra = ruleFindings(input).filter((f) => !seen.has(criterionOf(f.wcag)));
```

Deduplication is by criterion. 1.1.1 and 1.3.1 each have learned heads beside rule-owned subtypes, so a
model finding on `1.1.1:generic-graphic` (no mapping, so `cantTell`) removes a rule finding on
`1.1.1:unlabelled-image` (`conformance`, so `failed`). The outcome for the criterion becomes `cantTell`
where the rules had it `failed`, which inverts the ADR 0021 division of labour. The comment above the
function still describes the ADR 0002 world ("the absence-of-name criteria the model judges poorly").
Nothing tests `withRuleFindings`; `judge.test.ts` covers `validateJudgment` only.

**2026-09-05, reproduced:** the real `judge()` composition, with a loopback model stub and transcript
`["graphic, image", "Unlabelled graphic"]`, turns the rules-only `1.1.1: failed` into `cantTell` when
the stub supplies an unmapped 1.1.1 referral. This proves the merge defect without loading model weights.
Use the explicit **Unlabelled** announcement for this reproduction: the bare empty-name graphic and the
current 1.3.1 rules are secondary-mapped, so they are not equivalent assertion fixtures. It does not
measure how often the local model emits the colliding referral.

### 4.4 The tables that decide which channel feeds which criterion disagree — read

Four tables answer the same question: `EVIDENCE_CHANNEL` (`local-judge.ts:178`), `SWEEPS_FEEDING`
(`outcomes.ts:83`), `COMPLETENESS_OF` (`outcomes.ts:180`), `CRITERION_COVERAGE[c].channels`
(`criterion-coverage.ts`), plus `applicability.py:150` in Python. For 4.1.2 they give three different
answers: `formFields || controls`; `["formField"]`; `["controls","formFields","stateChanges","structureCensus"]`.
`outcomes.test.ts:204` pins one table's coverage of assessed criteria; nothing pins the tables to each other.
The asserted-versus-referred mapping is likewise stated twice, as the fourth argument of `add()` in
`rules.ts` and again in `ACT_RULES` (`act-rules.ts`), and `act-rules.test.ts:57-80` pins only the rules one
fixture happens to fire; `ACT_RULES` has no runtime consumer.

**2026-09-05:** `mapping-parity.test.ts` now compares the criteria asserted by source call sites with the
ACT declarations, and `8c0d171` corrected the 3.3.3/3.2.x runtime mappings. That closes the claim that
nothing compares the mappings; it does not unify the channel tables or check every branch's semantics.

### 4.5 Dead and unverified code on the published judge surface — read

About 330 lines of `judge.ts` are the rented-LLM backends (prompts `:191-295`, clients `:432-505`, consensus
`:549-600`, codex `:647-687`) with zero tests; `docs/history-2026-08.md:45` records the Anthropic backend as
never verified. `verify-gate.ts` needs an undeclared dependency and two environment variables nothing in
the repo sets, and runs only on the non-local path. Both are reachable from the published `./internal`
subpath. The CLI's opt-in shadow scorer (`cli.ts:212-214, 317-349`) defaults its interpreter to
`packages/cli/.venv/bin/python`, which does not exist, and sends the capture without `annotateCapture`, so
the featurizer will always refuse it: a dead duplicate of `scoreCapture`. The `cli.ts:5-6` header still says
the judge "uses the local Codex login".

---

## 5. The capture wire contract has no single owner

The HTTP contract between host and worker is the most important interface in the system, and ADR 0004 says
so: "the HTTP contract is the real API". It is declared, partially, in at least six places.

| where | what it declares | what it misses |
|---|---|---|
| `evidence/src/index.ts:18-23` `CaptureRequest` | `url, task, strategy?` | every probe flag and `formState` the CLI sends (`cli.ts:736-739`), and `captureId`, `async`. The worker accepts 20 fields (`server.mjs:439-465, 996, 1003`) |
| `evidence/src/index.ts:28-92` `CaptureResult`, `CaptureInteraction` | the result | `media`, `observed`, `interaction.routeChange`, `navigatedOnSubmit`, `postSubmitNames`; types `after` as `string` where the worker writes `null` |
| `nvda-worker/src/capture-core.mjs:483-486` JSDoc typedefs | the result, as the worker writes it | `meta`; and `structure-declarations.test.ts:35` scans `.ts` only, so this copy is pinned by nothing |
| `cli.ts:191-205` `CaptureResponse` | a hand-declared subset | `environment`, then casts for it at `:551, :564` |
| `cli/src/action/summary.ts:20-60` `RunResult`; `lab/src/harnesses/assert-action-report.mjs:38-57` | the JSON output shape, twice | no test pins `printJson` against either |
| `local-judge.ts:69`, `criterion-coverage.ts:487`, `evidence-units.ts:52`, `rules.ts:36-56` | four more partial views | `RuleInput.interaction` restates `formChanges` with a divergent type; `RuleInput.diagnostics` is declared for a reader that does not exist |

Three further facts make the contract harder to hold than its declarations suggest.

- **A second contract lives in string literals.** `verify.ts` (lines ~400-620, 996-1067) and
  `conformance.ts` interpret `diagnostics: unknown[]` by mark name: `sweep`, `structureCensus`,
  `readThrough`, `repeatBottom`, `prevStop`, `nextStop`, `focusConfinement`, `exhausted`, `focusModeStuck`,
  `deadline`, `cap`, `silent`. The worker writes them at 98 `diag.mark` sites, evidence reads them, and no
  type names them. The repo's own record has one incident of exactly this shape: `refreshBrowseBuffer`
  guarding on a mark nothing ever set.
- **The protocol version and fault codes are reached by scraping.** `CAPTURE_PROTOCOL_VERSION` lives in
  `capture-core.mjs:303`, which imports guidepup and so cannot be loaded on a host; four host modules
  regex-scrape the source file for it (`deploy-worker.mjs:232`, `check-worker-code.mjs:60`,
  `protocol-guard.mjs`, `control/src/fleet-playbook.mjs:258`). `FAULT` codes are copied as literals into
  `lab/src/training/capture-decisions.mjs:57` and `capture-real-pages.mjs:326` because no `./capture-faults`
  subpath is exported. CLAUDE.md's rule "recovery is keyed on fault codes, never on message text" is met on
  the worker and defeated on the host by the export map. Three message-text matches also survive on the
  worker itself (`server.mjs:559, 1214`; `capture-core.mjs:1548`).
- **Six modules build a `POST /capture` body by hand** (`cli.ts:728`, `lab/src/capture/capture-client.mjs:246`,
  `capture-screenreader-dataset.mjs:386`, `repeat-capture.mjs`, `worker-fleet/src/compare-workers.mjs:58`,
  `local-vm.ts`), each listing request fields against `captureOptions`. Only the lab client sends a
  `captureId` (`capture-client.mjs:79`), so the socket-loss recovery that CLAUDE.md describes at length does
  not reach the product CLI (verified: `cli.ts:736-739` sends none).

The response envelope (`environment`, `screenReader`, `task`; the 500 shape with `fault`) and the `/health`
shape have no type anywhere; `fleet-consistency.mjs:31-38` names environment fields as string paths. The
worker's own README documents 3 of 5 routes and 5 of 20 request fields.

---

## 6. Four modules past the point where their seams are visible

None of these is made of long functions; ESLint's 70-line and complexity-15 limits hold everywhere (the
longest function in `capture-core` is 49 code lines). They are made of many responsibilities per file.

### 6.1 `packages/nvda-worker/src/capture-core.mjs` — 4,727 lines, 101 top-level functions

Roughly 2,830 lines are comment and 1,900 are code. The only section marker is `:111` "Tunables". Clustered
by line range, it is ten modules:

| cluster | lines | owns state |
|---|---|---|
| orchestration (`captureWithNvda`, `runCapturePhases`) | 516–683 | |
| browser lifecycle | 684–1043, 4680–4727 | `reusableBrowser`, `browserCaptures`, `activeApp`, `navigatedExistingWindow` (`:744-786`) |
| page identity and readiness (10 fns) | 1044–1406 | |
| NVDA lifecycle (17 fns, 6 exported) | 1381–1837 | `screenReader` (`:1381`), `speechChannel` (`:325`) |
| read-through | 1838–1972 | |
| probe orchestration | scattered | |
| structural sweeps (15 fns) | 2361–3066 | |
| tables | 3067–3225 | |
| focus and elements list | 3234–3475 | |
| control activation | 3537–3960 | |
| forms (pure half already in `field-match.mjs`) | 3961–4261 | |
| eight behavioural probes, one shape each | 4262–4679 | |

The internal import graph of the package has no cycles, and `capture-pure.mjs` (886 lines, carved out for
CI, now carrying 13 of the 35 test files) proves the extraction is workable. The cost the repo will weigh is
its own: splitting the file changes `codeVersion()` (a redeploy) and the hashed `WORKER_FILES` list, and must
be proved evidence-neutral with `evidence:check`. Nothing about the evidence changes, so
`CAPTURE_PROTOCOL_VERSION` does not move.

### 6.2 `server.mjs` — a nine-line router beside 700 lines of policy

The router is `:863-872`. Around it: boot hygiene, environment reporting with two memos and a cache,
request validation, a recovery circuit breaker, the hard timeout, a warm-up state machine, per-capture
desktop hygiene, readiness rules, and process-level fault triage. Worker lifecycle is **fifteen module-level
variables** (`busy` `:180`, `inFlight` `:1060`, `warm`/`warming`/`warmAttempts`/`lastWarmAttempt`
`:644-689`, `worked`/`consecutiveRecoveries` `:500-505`, three caches, two memos). `busy` and `inFlight`
describe one fact and are set in different places (`:979` vs `:1122`); `/progress` reads both.
`powershell.mjs` calls itself "one bounded runner shared by everything on the guest", and two of the eight
modules that spawn PowerShell use it.

### 6.3 `packages/judge/src/rules.ts` — 1,885 lines, three families

About 1,250 lines are comment and 635 are code. The `add*` emitters cluster into three families that
already share helpers and nothing else: the tab-ring family (2.1.1, 2.1.2, 2.4.1, 2.4.3; shares
`channelRelation`, `comparableNames`, `tabOrderCanProveAbsence`), the name family (1.1.1, 3.3.2, 4.1.2;
shares `reportIfUnnamed`, `hasEmptyName`), and the interaction family (2.4.2, 3.2.x, 3.3.3, 4.1.2 state).
Three files would fall out without touching `ruleFindings` (`:1829-1885`). 91 tests across six files cover
it, so the split is refactor-under-test.

### 6.4 `packages/lab/src/training/case-matrix.mjs` — 5,023 lines, four concerns

1,594 case pairs across 16 criteria and 23 subtypes, assembled by 22 module-level `cases.push(...)` calls
(`:1377` to `:4188`) whose **source order is the corpus order**. Four concerns share the file: case
definitions; HTML rendering primitives and twenty `*Variant()` page builders; corpus assembly, FNV-1a
hashing and furniture rotation (`:2397-2523`); and ~790 lines of capture-time signal predicates
(`:4237-5021`) that read captures rather than generate pages. The tuple tables (`:1385`) and bulk generators
(`:1803-1814`) are already declarative data. The clean first cut is predicates into their own module (their
consumers already import them by name) and page builders into a second.

### 6.5 Honourable mention: `cli.ts` — 813 lines, mostly correctly thin

The heavy domain logic has been pushed down into `judge` and `evidence` through declared subpaths; nothing
reaches into a sibling's internals. What remains that should not: its own capture client, its own recapture
policy separate from the lab's `capture-decisions`, a form-state ordering at `:255` that duplicates
`forms/coverage.ts:97` under a comment saying the two "must" agree with nothing pinning them, and
`CRITERION_STATES` (`forms/coverage.ts:27-33`), a second table of criterion knowledge beside
`criterion-coverage.ts`.

---

## 7. Where the verification architecture cannot see

The repo's testing pattern is its greatest strength (§9). These are the places it has not yet reached, and
each is the "check that examines nothing" shape one layer further out than where the repo has looked.

### 7.1 The GitHub Action's axe layer is structurally dead — verified

`action.yml:111` defaults `axe` to `"true"`; `action.yml:184` runs `npm ci` with
`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1"`; `cli/src/scan/axe.ts:179` calls `chromium.launch()` with no
`channel`. The comment at `action.yml:177-178` says axe "needs Playwright's API but not its bundled
Chromium"; the code disagrees, and the log of `action-smoke` run 33682348144 shows it:

```
Scanning ... (rule-based axe-core + real screen reader) ...
axe-core scan failed (continuing without it): browserType.launch: Executable doesn't exist at
  C:\Users\runneradmin\AppData\Local\ms-playwright\chromium_headless_shell-1228\...
```

Every Action consumer gets `ruleBased: null` through the catch at `cli.ts:675-681` while the header
announces the rule layer. `assert-action-report.mjs:38-50` never reads `ruleBased`, so the smoke is green.
`axeAvailable` (`axe.ts:167-175`) proves importability, not launchability. Fix: `chromium.launch({ channel:
"msedge" })` (Edge is on the runner and is what the capture drives), or `npx playwright install chromium` in
the Action, and an assertion on `ruleBased` in the smoke. Related: the Action has no input for `--forms`,
`--plan` or `--emit-form-config`, so ADR 0024 is unreachable from the one surface where `probe-forms` is
already on and the page owner is present.

**2026-09-05:** the `--forms` omission is fixed: `action.yml:91` declares `forms`, and `:378` passes it
to the CLI (`5d5a482`). `--plan` and `--emit-form-config` remain separate CLI capabilities. The browser
launch/importability distinction above remains: `scan/axe.ts:179` still calls `chromium.launch()` without
a channel, and the Action still skips browser download. The old Actions run cited here was not rerun.

### 7.2 Gates that exist and run nowhere automated — verified

| gate | where it runs | where it does not |
|---|---|---|
| pre-commit and pre-push hooks | this checkout only: `core.hooksPath` is set in `.git/config` | no `prepare`, no `postinstall`, no line in CONTRIBUTING telling a clone to set it. A fresh clone has no hooks |
| the 30 pytest files | a laptop with `.venv` | `lint.yml` has no Python, so `npm test` prints its honest SKIP and exits 0; the lab has no pytest (`lab-job.yml:504-505`) |
| `scorer:verify`, `release:provenance`, `scorer:migration`, `gate:isolation` | `release.yml`, dispatch only | no push or PR checks packaging or provenance drift |
| `capture:check` | `capture-regression.yml`, path-filtered to `nvda-worker` and `lab/src/training` | changes to `deploy.yml`, `fleet-env.mjs` or `worker-http.mjs` never trigger it; no lab job exists for it |
| any Ansible check | nowhere | no `ansible-lint`, no `--syntax-check`, no `--check` dry run, `check-modules.py` invoked by nothing; six custom modules (811 lines of PowerShell) have no test |
| the published `dist/cli.js` bin | nowhere | `action.yml:354` and the root `witness` script both run `packages/cli/src/cli.ts` through `tsx`; the isolation smoke only checks the file exists |

### 7.3 Release mechanics — corrected by experiment on 2026-09-05

- **Private-pin failure prediction disproved.** The original audit inferred that `type = "none"` meant
  a private package's dependencies would not be rewritten. It does not: an actual `changeset version`
  in a disposable worktree updated lab's pins while leaving its own version unchanged, and the offline
  lockfile refresh succeeded. The pending scorer major bumps `judge` and `cli`, **not `worker-fleet`**.
  Exact pins still cause dependent releases; ADR 0007 wants that cascade. Record the actual plan when
  changing release policy rather than treating all packages as dependents of the scorer. See §14.1.
- `release.yml:14-17` calls `access: "restricted"` in `.changeset/config.json` a lock that makes a real
  publish fail. Every public package sets `publishConfig.access: "public"`, and changesets prefers that
  (`getPublishPlan.mjs:618`). Only the shell check at `release.yml:178-184` blocks it.
- `release.yml:161` echoes `$status` under `set -u` after the variable was renamed `smoke_status` at `:150`;
  the in-flight branch dies with "unbound variable".

### 7.4 Smaller verification gaps — read

- `pure-graph.test.ts:26` lists `edge-args.test.ts` in `MUST_BE_PURE`; the file was renamed
  `browser-args.test.ts`, and the `existsSync` skip at `:50` passes the entry having examined nothing.
- `tsconfig.mjs.json` is a second full typecheck pass over **zero additional files** (`tsc --listFiles`: 778
  vs 771, no file unique to the second), doubling `typecheck` to ~3.8 s inside a ~5 s pre-push budget. The
  rationale pinned by `typecheck-coverage.test.ts:98-110` ("allowJs in the root pulls every `.mjs` into the
  main program where `@ts-check` fails under strict") is no longer true, and `tsconfig.json:19-21` contradicts
  `:31-35` in the same file.
- `.c8rc.json:88` excludes `scripts/coverage.mjs`, which does not exist.
- `packages/cli/README.md:64-67` documents that a consent-wall capture "exits 2"; `cli.ts:485-487` warns and
  continues to exit 0. Only the Action runner exits 2. No CLI exit-code table exists.
- `backlog.test.ts` enforces "every record heading ending `— OPEN` appears on the backlog"; exactly one
  heading in 2,885 record lines carries that marker, so it guards one of roughly six open items.
- `scripts/build-packages.mjs:20-31` discovers buildable packages by the presence of a `tsconfig.json` and
  the absence of `private`, and orders them by hand-kept `references` that have drifted from
  `package.json` twice (`cli/tsconfig.json:8-10`, `scorer/tsconfig.json:10-24`). A private package that
  gains a `tsconfig.json` is silently never built.

### 7.5 Drift between the Action, its examples and its docs — read

- The CLI has no fail-on threshold at all (exit 0 on any completed run); only the Action runner does.
  `reportLines` is not a pure function of its input: `report.ts:78-81` reads `JUDGE_BACKEND` at render
  time, and the exported `Report` type pulls types from `judge` and `evidence`, so a consumer of the
  renderer must depend on both.
- `examples/workflow.yml:63-66` sets `probe-forms: "false"` with the comment "Off by default";
  `action.yml:90` defaults it on. `examples/workflow.yml:49-51` says "EIGHT WCAG criteria";
  `action.yml:37` says seventeen. `docs/github-action.md:88-91` says the local setup "installs CPU torch"
  and "has not run on a Windows runner"; `action.yml:239-248` says torch is gone and `action-smoke` runs it.
- `action.yml:269-270` pip-installs `onnxruntime transformers safetensors numpy` unpinned into the runner's
  system Python, a second spelling of the pins in `packages/scorer/requirements.txt:11-14`; the pip cache
  key at `:256` is a constant string under a comment saying it is "keyed on the pinned set"; the 87 MB
  encoder is downloaded on every run.
- `action.yml:33-49` hand-lists which criteria each layer covers, a prose copy of `criterion-coverage.ts`.
  The `task-completable` output (`:378`) reads a value the local judge derives as "no blocker"
  (`local-judge.ts:552`) while the input text (`:28-31`) says the local judge never answers that question.

---

## 8. The deprecated path is still the default path

CLAUDE.md's banner (`:56-69`) declares the local UTM VMs deprecated and the bare-metal fleet the capture
path. The code and the docs have not followed.

- **The CLI leases a local VM by default.** `cli.ts:277` calls `leaseWorker`, whose order
  (`local-vm.ts:203-212`) is explicit `--worker`, then `A11Y_LOCAL_VM=0`, then `findLocalVm()`, then
  `http://localhost:8765`. It never reads `inventory.yml`. `resolveWorkerPool` (`fleet-env.mjs:353-369`) has
  the corrected inventory-first order, and `worker-precedence.test.ts:83` pins "every module that reads BOTH
  sources asks the inventory FIRST", which is why it cannot see `leaseWorker`: it reads one source.
  `capture-screenreader-dataset.mjs:668-713` does a third inline resolution. Two precedence orders coexist,
  and the product uses the deprecated one.
- **`doctor`'s capacity, contention and pool-consistency checks live only in the UTM branch**
  (`doctor.mjs:208-245`); a bare-metal fleet reaches only `checkConfiguredFleet` (`:282`). `workerControlFix`
  (`:92-98`) still advises re-registering `.utm` bundles.
- **~2,460 lines** (`local-worker/` 1,482; `local-vm.ts` 370; `deploy-worker.mjs` 315; `guest-run.mjs` 173;
  `normalise-fleet.mjs` 79; `fleet-scripts.mjs` 42), plus `host-capacity` and `host-metrics` (360 lines that
  size a QEMU pool on a Mac), are exported from `index.ts:13-14`, shipped in the tarball with two bins, and
  asserted present by `isolation-smoke.mjs:15-19`.
- **The deprecation reaches no other document.** `grep -ic deprecat` returns 0 in `docs/local-worker-vm.md`,
  `docs/getting-started.md`, `README.md`, `docs/control-plane-proxmox.md`, `packages/worker-fleet/README.md`.
  `docs/README.md:11-12` routes a newcomer to build a VM. `README.md:254` describes the VM auto-start as the
  default. `docs/backlog.md` has no entry for retiring it.

Removing it touches `index.ts` and the smoke, four npm scripts, `doctor`, `check-worker-code.mjs:100`, two
lab capture entry points, `cli.ts:277`, four docs and two tests. Until then the minimum is: make
`leaseWorker` inventory-first, and put the deprecation banner on the five docs.

---

## 9. Duplication with no owner

The repo's first rule about facts is "make the copies unable to disagree". It is applied to evidence and
not to infrastructure. Each row is a fact with more copies than owners.

| fact | copies | owner |
|---|---|---|
| where `runs/` and its artefacts live | `DATASET_ROOT` resolution in 11 files; repo-root resolution in 14 scripts; the capture filename `${id}.${variant}.json` spelled 7 times; three env names for one root (`RUNS_ROOT`, `A11Y_RUNS_ROOT`, `A11Y_*_ROOT`); two anchoring conventions (`process.cwd()` in `src/training`, `import.meta.url` in `scripts/`) | none. `capture-progress.mjs:28` is the only module that names one path |
| how to read a capture | `readCapture` at `evidence-diff.mjs:295`, `check-signals.mjs:53`, `export-screenreader-dataset.mjs:91`, `capture-cache.mjs:162`, with differing error semantics (throw with cause vs swallow to null); usable-capture predicate in 3 files, one weaker | none |
| the gate exit-code contract | `verdict.mjs:56-58` (0 pass / 1 fail / 2 inconclusive) adopted by 7 of ~25 gate scripts; elsewhere exit 2 means usage, stale build, missing precondition, worker refused or no run, and exit 3 means wedged, dirty targets, fleet inconsistent or wrong page | a shared type, no shared runner; 24 of 29 scripts define their own `main`, 46 hand-roll the entrypoint guard |
| argv parsing | `refuseUnknownFlags` guards all 52 CLIs (verified by `cli-flags.test.ts`), but parsing is a hand-rolled `arg()` in 10 files, and the 8 unguarded readers are all `.ts` | validation owned; parsing not |
| environment configuration | 95 distinct `process.env` names across packages, 17 read in more than one package (`A11Y_WORKER` in three; `DATASET_PAGES_PORT` read by `worker-fleet` from `lab`'s config; `JUDGE_BACKEND` re-derived in `doctor`); six key- or shell-selecting variables (`A11Y_CONTROL_HOST`, `A11Y_PVE_KEY`, `A11Y_SSH_KEY`, `A11Y_DEBUG_VM`, `A11Y_VM_NAME`, `A11Y_DEBUG`) documented nowhere; 23 more `A11Y_*` in shell and PowerShell | none. `fleet-env.mjs` covers two |
| the worker port | `a11y_port` in `group_vars`, `worker_port` in the role defaults, literal `8765` at 21 sites, `DEFAULT_WORKER_PORT` in node reading only `a11y_port` | a change to `worker_port` splits the role from every other consumer silently |
| the HTTP client | `requestJson` used by 21 files; raw `fetch` survives at `doctor.mjs:106-108`, `capture-status.mjs:46`, `capture-check.mjs:300`, `capture-screenreader-dataset.mjs:257`, outside `assertWorkerUrl` and the keepalive policy | mostly owned |
| wake-on-LAN | `fleet-wake.mjs:57-113` and `wake.yml`, one per host that may wake the fleet | two by design (ADR 0012); the packet format is fixed by spec |
| provisioning | `provision-nvda-worker.ps1` (810 lines) and `roles/worker/` (1,369 task lines + 811 module lines), "until parity is demonstrated". Parity is a prose procedure (`ansible/README.md:60-76`) with no test, no checklist and no backlog entry, and the role has already moved ahead (the Edge pin) | none |
| `provisionRevision`, a capture cache key | computed once (`stamp-provision-revision.ps1:50-54`) from four files: the script, `run-server.cmd`, `apply-foreground-lock-timeout.ps1`, and the role's `defaults/main.yml`. **Not** the role's task files or modules, so a change to `policy.yml`, `nvda.yml` or any module `.ps1` does not move the cache key, while a comment edit to the script invalidates every cached capture on a fleet the script no longer provisions | the file list is pinned by nothing |
| Windows trimming | `windows-trim.mjs` at every worker boot, `provision-nvda-worker.ps1`, `build-lean-worker-image.ps1`, `roles/worker/tasks/*.yml` | four places, two packages |
| vocabularies | `VAGUE_LINK_NAMES` (`rules.ts:668`) vs `VAGUE_LINKS` (`features.py:240`); `FILENAME_RE` vs `FILENAME_GRAPHIC`; `ANNOUNCED_ERROR_TEXT`, `ERROR_TEXT`, `ERROR_WORD` | the 2.4.4 overlap is declared deliberate; the rest are not |

Two more cross-language facts are pinned, and worth naming as the model for the rest: `MODEL_INPUT_VERSION`
is declared in TS and Python and `test_input_contract_version.py:28` holds them equal; the announcement
grammar has a deliberate second implementation in `field-match.mjs` and `field-match.test.ts:47` holds it
equal over real corpus announcements.

---

## 10. The documentation architecture

The documentation is 1.31 MB against 103,535 source lines, one line of prose per five of code, and most of it
is measured and honest. The problems are structural: where knowledge lives and what pins it.

### 10.1 CLAUDE.md carries the architecture, and the ADRs do not

CLAUDE.md is 184 KB / 2,377 lines: about **57% incident narrative** (~1,360 lines), 16% operating
instructions, 15% architecture facts, 11% command reference. It names 94 of the 114 npm scripts, against
32 in `docs/lab-cli.md`, "the complete lab and fleet command line". It contains twelve in-place
self-revisions ("This paragraph used to say", "UPDATE: out of date", "said the opposite", "retracted") and
172 lines (7%) of UTM measurements it declares out of date, with the `worker:ctl` block still directly under
the DEPRECATED banner, which is the exact shape the banner warns about.

At least eleven architectural decisions live only there, with no ADR (grep across all 24):

| decision | where it lives |
|---|---|
| `.mjs` worker vs `.ts` control plane | CLAUDE.md:2335; CONTRIBUTING.md:79 |
| the Python scorer boundary, venv, `A11Y_PYTHON` | SECURITY.md; CLAUDE.md |
| the capture cache key's composition | CLAUDE.md:593–698 (ADRs 0007, 0016 cite it as existing) |
| the HTTP capture protocol: client-minted `captureId`, 404 vs 202, bounded store | CLAUDE.md:699–737; `capture-protocol-plan.md` (a plan) |
| deprecation of local UTM VMs; bare metal is the capture path | CLAUDE.md:56–69 only |
| guidepup exact pin as evidence | CLAUDE.md:758–781 (ADR 0004:137 defers to it) |
| the speech channel as a TLS socket; `socket.destroy(err)` | CLAUDE.md:1158–1211 |
| recovery keyed on fault codes | CLAUDE.md:1315–1335 |
| browser preset as evidence; Edge preset byte-identical | CLAUDE.md:531–577 |
| `ready` vs `ok` readiness semantics | CLAUDE.md:738–757 |
| the fleet must run this checkout before capture | CLAUDE.md:1996–2034 |

### 10.2 Trackers and records disagree about what is open

Three documents describe themselves as the plan or backlog (`docs/backlog.md:3`, `PLAN.md:26`,
`docs/reliability-plan.md:3`). `docs/README.md` labels `capture-integrity-plan.md` and
`control-plane-plan.md` "the OPEN plan" while every status line in both reads MET. `known-gaps.md:12`
says every item was closed on 2026-08-27; §21 is open with no status word and §25–28 are dated
2026-09-02. `backlog.md:110` says the 3.5-hour stall has "no record entry"; it is in `known-gaps` §24 and
§27 and CLAUDE.md:2049. A backlog row under "Accepted designs, not yet built" says it is built. PLAN.md's
B7 and B8 are open in PLAN and closed in `not-working` §8 and §2. Nothing pins any of this.

### 10.3 ADRs: seven status mismatches, three unimplemented, several superseded

ADRs 0001 and 0003–0008 say `Status: Proposed` in the file; `docs/adr/README.md` says accepted.
`adr-index.test.ts` pins presence and count, not status. 0002 is partially implemented (axe shipped, the
generative judge did not), 0011 and 0014 not at all. 0001 still describes "one PowerShell script" and
VoiceOver/Orca backends; 0005 describes "seven packages", "seven files" hashed, a root solution file with
project references, and `.mjs` shipping unbuilt, none of which is now true (`worker-fleet`'s `.mjs` are
compiled into `dist`). `control-plane-plan.md:208` measured ADR 0012 "BROKEN ON THE CONTROL PLANE ITSELF"
and the ADR is unamended.

### 10.4 What is generated and what is pinned

Exactly one document is generated (`docs/coverage.md`), and it regenerates byte-identical.
`docs/screenreader-coverage.md`, which bounds what the tool may claim, is hand-maintained and no test reads
it. Thirteen tests pin documents to code (commands documented, coverage doc, ADR index, backlog, doc
references, documented criteria, backend default, action refs, provenance, isolation gate, rule oracles,
referenced scripts, promotion). Not pinned: ADR status, screenreader coverage, any status word other than
"— OPEN", PLAN.md blockers, `docs/README.md`'s role labels, deprecation notices, the numeric claims in
CLAUDE.md, and whether a package's smoke test matches its README example (asserted in comments only).

### 10.5 Discoverability

`packages/README.md` tables six packages; nine exist. `control` has no package-level README.
`README.md:318` describes `nvda-speech` as "the speech-channel client"; it is a GPL-3 Python port of NVDA's
announcement composition. `README.md:96` says "nothing trained yet". "How does a capture become a finding",
end to end, exists in no single document; a new engineer reaches it by reading CLAUDE.md:18–37 and three
ADRs.

---

## 11. What is architecturally strong, and should be protected

- **The meta-test pattern**: discover the population, classify or exempt every member with a reason, guard
  against vacuity, register a mutation proof. `commands-documented`, `cli-flags`, `worker-code-check`,
  `evidence-fields`, `everything-chain`, `gates-are-proven`, `lab-job`, `playbook-variables`,
  `spawned-paths`, `published-imports`, `licence-boundary`, `mjs-parses`, `no-win32-imports`,
  `control-has-no-dependencies` and about fifteen more. This is the mechanism to extend to the gaps in §3,
  §5 and §7, not a new one.
- **`evidence` is pure**: no `node:` import, no `fs`, no `process` in any non-test file. **`control` has no
  dependencies**, enforced transitively. **`capture-pure.mjs` is pure** and injects `sleep`.
- **Useful protocol foundations**: `CAPTURE_PROTOCOL_VERSION` independent of semver; the
  client-minted `captureId` with unavailable/running distinguished (404 does not prove non-execution;
  §14.4); fault codes as an additive wire field; `ready`
  distinct from `ok`; the browser preset in the cache key.
- **Mechanical quality holds**: 0 lint errors, no function over 49 code lines in the largest module, 164
  `catch` sites with zero empty, 122 of 124 `.mjs` type-checked, exact guidepup pin.
- **The credential split (ADR 0012) is physical**, and the "which worker" URL is inexpressible from a job
  (`lab-job.yml:768-807`, tested).
- **One hasher for the worker code**, pinned; **one place computes `provisionRevision`**.

---

## 12. Recommendations, in the order the repo's own cost model implies

The repo orders work "by what consumes what" and prices any capture-path change by whether it moves a cache
key. Applied here: correctness first, then the contracts that everything reads, then decomposition (which
consumes the contracts), then the documentation that describes the result.

### Stage 0 — small, high-value, no cache cost

1. `score.py:86`: stop appending `landmark-navigation`, or delete the Python `evidence_units` and have
   `local-judge.ts` send the units the TS `modelInput` builds. Add a test that runs one corpus capture
   through both paths and asserts identical `evidenceUnits`. Decide and record whether `MODEL_INPUT_VERSION`
   moves.
2. `judge.ts:635`: dedupe `withRuleFindings` by subtype, or never drop a `conformance` finding for a
   `secondary` one. Add the test that reproduces §4.3.
3. `worker-fleet/package.json`: `./cli-flags` -> `./dist/cli-flags.mjs`. Add to `isolation-gate` a check
   that every `exports` target is inside `files`, for every package including private consumers' imports.
4. `axe.ts:179`: `chromium.launch({ channel: "msedge" })`; `assert-action-report.mjs`: assert `ruleBased`
   is non-null when `axe` was requested.
5. Declare or delete `@huggingface/transformers`; fix `pure-graph.test.ts:26`; fix `release.yml:161`; remove
   `.c8rc.json:88`; delete root `src/` and `models/`; delete or use `data/accessibility-sources.json`.
6. Install the hooks: `"prepare": "git config core.hooksPath scripts/git-hooks"` at the root, and one line in
   CONTRIBUTING. Run pytest somewhere automated: a `setup-python` step in `lint.yml`, or pytest on the lab.
7. `cli/README.md:64-67`: document the exit code the CLI actually produces, and add an exit-code table.

### Stage 1 — give the contracts an owner

8. **One wire module in `evidence`**: `CaptureRequest` with every field the worker accepts; `CaptureResult`
   with every field the worker writes; the response envelope; the `/health` and `/progress` shapes; and a
   `DiagnosticMark` union naming every mark the worker emits. Derive the worker's JSDoc from it (a `.d.ts`
   the `.mjs` can `@typedef {import(...)}`), derive `RuleInput`, `CaptureResponse`, `RunResult` and the four
   channel tables from it, and extend `wire-types-describe-the-wire.test.ts` to ground `interaction` and
   `diagnostics`, not only `structure`.
9. **Export what the host needs from `nvda-worker`**: a guidepup-free `./protocol-version` subpath (moving
   the constant out of `capture-core.mjs`) and `./capture-faults`. Delete the four regex scrapes and the
   literal fault strings.
10. **One capture client**, in `worker-fleet` beside `requestJson`: builds the body from the
    `CaptureRequest` type, mints `captureId`, performs the `GET /capture/<id>` recovery. Replace the six
    hand-built bodies, including the CLI's. Replace the four raw `fetch` calls.
11. **Move the inventory readers to `control`** (`fleet-env`, `fleet-status`, `fleet-discover`, `fleet-wake`),
    or inject the inventory path. `control` already reaches `worker-fleet` relatively; the reverse edge is
    the one that must go. Then make `leaseWorker` inventory-first, and extend `worker-precedence.test.ts` to
    discover single-source readers too.
12. **Give `lab` and `control` a `tsconfig.json`** with project references, so the compiler-enforced graph of
    ADR 0005 covers the package holding the bypasses. Then replace the 26 relative imports into
    `worker-fleet/src` with package imports, adding exports for `host-address`, `fleet-env`,
    `fleet-consistency`, `worker-code-check` where `lab` legitimately needs them, and fix
    `generate-coverage-doc.ts:18,20`.
13. **Move `scorer`'s lab-dependent tests to `lab`**, or make them self-contained; a published package's
    suite should pass without a private one present. Remove the four audit scripts and `explain_feature.py`
    from `scorer`'s shipped `files` (they resolve `parents[3] / "runs"`, a repo-layout dependency in a
    tarball).
14. **A `runs/` layout module** in `lab` naming every root and artefact path, and one `readCapture`; a **gate
    runner** that owns the verdict exit codes and the entrypoint guard; one argv parser behind
    `refuseUnknownFlags`; a **configuration reference** listing every `A11Y_*` variable, generated from the
    source by the same discovery `cli-flags.test.ts` uses.
15. **`provisionRevision`**: hash the role's task files and modules, and stop hashing the script once the
    role is the provisioner. This moves the cache key, so bundle it with the stage-3 recapture the backlog
    already plans. Track script-to-role parity as a table in the role's README with a test, or retire the
    script.

### Stage 2 — decompose along the measured seams

16. `capture-core.mjs` into NVDA lifecycle, browser lifecycle, page identity, sweeps, probes, forms, and
    orchestration. No behaviour change; prove it with `evidence:check` SAME; update `worker-files.mjs`;
    redeploy. `server.mjs`: collect the fifteen state variables into one lifecycle object with `busy` and
    `inFlight` as one fact; move policy out of the router file.
17. `rules.ts` into its three families; `case-matrix.mjs` into definitions, page builders, and signal
    predicates, with the tuple and bulk tables as data.

### Stage 3 — make the documents describe the system

18. Write short ADRs for the eleven decisions in §10.1, each a page. Fix the seven ADR status lines and pin
    index-to-file status in `adr-index.test.ts`. Amend 0001, 0005 and 0012 with dated updates.
19. One tracker: retire PLAN.md's blocker list into the history record, correct `docs/README.md`'s role
    labels, fix `known-gaps.md`'s header, and widen `backlog.test.ts` to every unclosed heading (a heading
    with no status word is open).
20. Split CLAUDE.md: operating instructions, architecture facts and command reference stay (about 1,000
    lines); the incident narrative moves to `docs/incidents/` or into the record files it already
    duplicates, with one-line pointers. Delete the 172 lines it calls out of date.
21. Deprecation banners on the five VM documents; rewrite `README.md` "Part 1" to the ADR 0021 product and
    fix the `nvda-speech` and "nothing trained yet" lines; complete `packages/README.md`; add a `control`
    README; generate and pin `screenreader-coverage.md` the way `coverage.md` is.

### Ongoing

22. Add `ansible-playbook --syntax-check` and `check-modules.py` to `lint.yml`; run the release-integrity
    gates (`scorer:verify`, `release:provenance`, `scorer:migration`) on every PR, since they need no corpus;
    delete `tsconfig.mjs.json` and its pinning rationale; run the published `dist/cli.js` in
    `action-smoke`; verify the exact-pin cascade with a scratch `changeset version` and record the intended
    behaviour in ADR 0007.

---

## 13. Method

- Baseline measured directly: `npm run lint`, `npm run typecheck`, `npm run test:ts`, pytest, `git log`
  churn and volume, `npm pack --dry-run`, `find`/`wc` per package, `tsc --listFiles`.
- Seven parallel deep dives, each with a fixed brief and a requirement to cite `file:line`: the dependency
  graph; `nvda-worker`; `evidence`/`judge`/`scorer`; `lab`; `control`/`worker-fleet`; `cli`, build, test
  and release; documentation architecture.
- Every finding that describes a defect rather than a shape (§3.1, §3.2, §3.4, §4.1–4.3, §5's
  `CaptureRequest` and `captureId` claims, §7.1, §7.2, the undeclared dependency) was re-verified in this
  session against the cited lines or by running a command. §7.3 is derived from reading `@changesets`
  source and is marked predicted. The `action-smoke` log evidence in §7.1 was read from GitHub Actions run
  33682348144.
- Not done in the original review: a runtime test of the §4.3 hazard against a page that fires both a
  learned head and a rule on one criterion; a scratch `changeset version` for §7.3; any capture. The
  follow-up in §14 adds a stubbed-model composition test and the versioning experiment; a real learned-head
  collision and live capture remain outside this review.

---

## 14. Follow-up review, 2026-09-05

Reviewed **`55cb006`**, fetched from `origin/main`, in a dedicated `codex/architecture-audit-followup`
worktree. A second disposable worktree held the release-versioning experiment. No shared checkout,
worker, capture corpus, model artefact or live job was modified. New findings below cite this revision.

### 14.1 Revalidation and corrections

| original finding | status at `55cb006` | evidence / qualification |
|---|---|---|
| §3.1 missing published `cli-flags` target | **Open; reproduced** | After a full build, `npm pack --dry-run --ignore-scripts --json --workspace=@a11y-witness/worker-fleet` lists `dist/cli-flags.mjs` but not the exported `src/cli-flags.mjs`. |
| §3.5 undeclared cross-package `yaml` imports | **Open; adjacent lockfile defect fixed** | `9607ada` locked CLI's already-declared dependency; it did not declare the test consumers' dependencies. For example, `packages/lab/src/packaging/trainer-callers.test.ts:29` still imports `yaml` without a lab declaration. Do not mistake lockfile synchronisation for dependency ownership. |
| §4.1 live/training evidence-unit divergence | **Open; read** | `packages/scorer/python/score.py:86` still appends landmarks; `packages/scorer/src/evidence-units.ts:98` deliberately omits them. No cross-language parity run was made here. |
| §4.2 schema mismatch | **Old migration closed; new one open** | Safetensors header: `screenreader-structured-v18`; `screenreader_features.py:112`: `v19`; `models/schema-migration.json` explicitly records that new migration. `score.py:251` still requires equality. Do not weaken this refusal. |
| §4.3 model referral suppresses rule assertion | **Open; reproduced through `judge()`** | An explicit unlabelled graphic fails 1.1.1 with rules alone; adding a model referral changes the composed outcome to `cantTell`. This was a stubbed model-output test, not a trained-model evaluation. |
| §4.4 unguarded ACT/runtime mapping duplication | **Partly closed** | `packages/judge/src/mapping-parity.test.ts:38` discovers asserting calls; both parity tests pass. The independent channel/applicability tables remain. |
| §7.1 Action cannot take a forms config | **Closed** | `action.yml:91,378`; other Action and browser-launch findings are not thereby closed. |
| §7.2 Python coverage in CI | **Open; read** | `lint.yml` has no Python setup; the root `test:python` still skips without `.venv/bin/pytest`. The follow-up did not run Python tests. |
| §7.3 private dependency pins will break versioning | **Disproved** | Changesets 3.0.1 versions scorer to 1.0.0 and judge/CLI to 0.1.1; lab stays 0.1.0 but its scorer/judge pins update. `npm install --package-lock-only --ignore-scripts --offline --no-audit --no-fund` then exits 0. Worker-fleet stays 0.1.0. |

This is targeted revalidation, not a fresh measurement of every count or every claim in §§1–13. In
particular, it did not re-run GitHub Actions or any fleet-dependent gate. The repository's current
operating model is the bare-metal fleet; the historical UTM material is not an instruction to operate it.

### 14.2 P1 — an external model can assign itself assertion authority — reproduced

**Boundary:** `packages/judge/src/judge.ts:304-319,549-565`; consumer:
`packages/judge/src/outcomes.ts:246-260`.

`validateJudgment` validates the required finding fields but returns the original object as `Finding`.
An extra `mapping: "conformance"` field survives. `judgeOnce` filters invented criterion numbers but
does not remove that field. `criterionOutcomes` consequently treats the model's finding as an assertion
that the criterion failed. This contradicts the rule/model authority separation in ADR 0021.

**Probe:** pass an otherwise valid 2.4.4 model judgment with evidence `"click here, link"` and
`mapping: "conformance"` through the built `validateJudgment`, then `criterionOutcomes`. The observed
outcome is **`failed`**, not `cantTell`. No rule evidence is needed to acquire that authority. The runtime
boundary cannot rely on a provider honouring the prompt/schema: Codex, Anthropic and unconstrained
OpenAI-compatible responses also reach it.

**Scope:** this affects the supported **opt-in generative backends**, not the default local scorer,
whose findings are constructed internally. It does not demonstrate a current local-model false positive.

**Remedy:** reconstruct an allowlisted model finding and force its mapping to `secondary` (or omit it).
Keep trusted rule findings on a distinct construction path; validating that `conformance` is an enum
member would not fix the authority problem. Add a malicious/extra-field model-response test through the
validator and final criterion outcome. This comes before expanding or refactoring the backend surface.

### 14.3 P1 — losing the async acceptance loses the recovery path — reproduced

**Boundary:** `packages/lab/src/capture/capture-client.mjs:122-142,163-170`; worker:
`packages/nvda-worker/src/server.mjs:1056-1080`; dataset caller:
`packages/lab/src/training/capture-screenreader-dataset.mjs:413-418`.

The default async path awaits the initial POST **outside** any transport-recovery block. Only after
receiving 202 does it poll the client-minted ID. If the worker accepts the request but the 202 is lost,
the client throws, even though it already knows the ID needed to recover the result. That ID is local
to the failed call, not returned to its caller. The dataset caller's catch handles `CAPTURE_LOST`, not
this transport exception; the special sync recovery path does not help the default path.

**Loopback probe:** a fake worker reads `POST /capture`, destroys that response socket, and would return
200 with a completed transcript on `GET /capture/<id>`. The actual async client throws `ECONNRESET` and
the request log contains **one POST, zero GETs**. No Windows worker or real capture was used. Existing
`capture-async.test.ts` tests dropped *polls*, but not this lost acknowledgement.

**Remedy:** reconcile a transient acceptance failure by querying the **same ID** within the operation's
remaining budget; distinguish running, completed and unknown. Do not immediately mint another ID and
re-execute. Add an accepted-but-acknowledgement-lost test and a never-accepted test; the two need different
handling. Unknown does not prove that execution never occurred, as the next finding explains.

### 14.4 P2 — result recall is not an idempotency contract — reproduced / read

**Boundary:** `packages/nvda-worker/src/capture-results.mjs:50,71,118-161` and
`packages/nvda-worker/src/server.mjs:1030-1084`.

The store remembers results, but `begin(id)` deletes any previous result for that ID and replaces it
with `running`. The POST handler invokes it without checking for a retained request/result or matching
the request payload. While busy, the worker rejects concurrent captures; **after completion**, another
POST with the same ID can execute again. There is no same-ID/different-payload conflict check.

**Store probes:** `begin("x") → finish("x") → begin("x")` turns `done` back into `running`. With a
one-entry store, completing `x` and beginning `y` evicts `x`; its GET response becomes 404 even though
it definitely ran. The default is eight entries and a restart loses the entire in-memory store.
The actual POST execution path was read, not run against NVDA.

Therefore 404 means **not retained here**, not "never started" and not necessarily "worker restarted".
Both explanations are currently overclaimed in comments/errors. Routine callers mint fresh UUIDs, so
this is not evidence that they currently reuse IDs accidentally; it is a limit on the guarantee the
audit and recovery advice may make. Recapture costs time and can repeat form activation, so it is not
universally side-effect-free (see `SECURITY.md`).

**Remedy:** either name and document this as bounded result recall, including retention and restart
semantics, or implement duplicate suppression: atomically admit an ID plus request fingerprint, return
the existing state/result for an exact replay, and reject a changed payload. State the retention window
and worker-generation boundary. Persistence is a separate decision; do not promise exactly-once
execution across restart merely because an ID exists. Add replay, payload-conflict and eviction tests
at the HTTP boundary, not only the Map API.

### 14.5 P2 — the timeout ladder does not bound the whole operation — reproduced / read

**Boundary:** `packages/lab/src/capture/capture-client.mjs:164-176,215-238`;
`packages/nvda-worker/src/server.mjs:607-649,1123,1231-1240`;
`packages/worker-fleet/src/worker-http.mjs:68`.

There are two related omissions:

1. The client starts its `timeoutMs` deadline **after** an independently budgeted 30-second acceptance.
   Each loop checks the clock before a two-second sleep, optional ten-second progress read, and
   thirty-second result read. None is clipped to remaining time, and a late completed result is returned
   without another deadline check. A loopback probe with `timeoutMs: 20`, immediate 202 and an immediate
   completed first poll returned **200 after 2,012 ms**. This is a deadline-contract test, not a claim
   that captures should finish in 20 ms.
2. The worker now permits up to **60 seconds of preparation before** the 520-second capture timeout.
   That permits 580 seconds before considering transport or local recovery, against the shared client's
   560-second budget. A locally recoverable failure also gets a fresh per-attempt timeout. The ladder
   tests compare the client budget with one capture attempt, not the complete handler. The permitted
   worst-case mismatch is verified from source; no 580-second worker run was attempted.

**Remedy:** define which budget is an attempt budget and which is an end-to-end deadline. Carry remaining
time through dispatch, preparation, recovery, polling and result collection; bound optional diagnostics
within that same budget. Make the lifecycle guard check the complete operation. Also define what happens
to accepted work when its caller stops waiting—an elapsed client timer is not worker cancellation.
Use an injected clock for deadline tests instead of adding multi-minute sleeps to CI.

### 14.6 Revised action order and verification limits

Keep the existing correctness priorities: input parity (§4.1), assertion-preserving composition (§4.3),
and a compatible runtime/artefact release (§4.2). Add the model-authority boundary (§14.2) to that first
group. Then repair async acknowledgement recovery and specify replay/deadline semantics (§§14.3–14.5)
before consolidating the capture client or rearranging its modules. Public export/Action smoke fixes
remain valuable. Do **not** spend time fixing the disproved private-pin prediction.

The central lesson is narrower than "more tests": test the actual consumer and each failure boundary.
A Map test does not prove HTTP idempotency; a dropped-poll test does not prove dispatch recovery; a
well-formed finding is not an authorised assertion; ordered individual timeouts do not bound a workflow.
This applies the Clean Code review skill's boundary/learning-test and concurrency principles, not a
prescription to split files mechanically. Book evidence: **BookCtx — _Software Engineering at Google_,
Titus Winters, Tom Manshreck and Hyrum Wright, “Connecting to a Service” (chunk 49)**, on client-assigned
operation IDs, retrying the same operation, and checking that repeated requests carry matching parameters.

**Checks actually run in the isolated worktrees:**

- `npm ci --ignore-scripts --offline --no-audit --no-fund`, then `npm run build`: passed. An initial
  omit-optional install could not build the CLI's Playwright imports; the full locked install resolved it.
- Seven focused suites: `judge.test.ts`, `mapping-parity.test.ts`, `capture-async.test.ts`,
  `capture-client.test.ts`, `capture-results.test.ts`, `budget-ladder.test.ts`, `model-input.test.ts`:
  **49 passed, 0 failed, 0 skipped**. They pre-exist this review; no application or test code was changed.
- Independent Node probes against the built judge, pure result store, and loopback HTTP stubs reproduced
  §§4.3 and 14.2–14.5. Those passing suites do not cover the newly identified conditions.
- Safetensors header inspection, worker-fleet tarball dry run, and actual `changeset version` plus offline
  lockfile refresh in a separate disposable worktree.
- Not run: full lint/typecheck/test matrix, Python/model evaluation, real capture, fleet deployment,
  release gates or GitHub Actions. No claims about current production incidence or model quality are
  derived from the mock-server tests. This section is an audit record; `docs/backlog.md` remains the work
  tracker, not a second checklist to maintain here.
