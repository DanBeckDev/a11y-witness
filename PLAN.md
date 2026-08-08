# a11y-witness — Plan of Attack

## North star

Make the real assistive-technology experience of any website measurable and improvable. Drive a real screen reader through real navigation, use AI to judge whether the experience is coherent and usable, and make every judgment trustworthy and checkable. Open core (AGPL-3.0, dual-licensed): the engine is open; a hosted product can sit on top.

## Guiding principles

1. **Model how screen readers are really used**, reading in browse mode, jumping by headings and landmarks, completing tasks, operating controls. Never tab-through; tabbing tests keyboard reachability, not the reading experience.
2. **Trustworthy by construction.** Every finding cites a WCAG criterion, carries a calibrated confidence, and is verifiable by a human against the actual announcements. The overlay vendors lost the market (and drew an FTC fine) by over-claiming. We do not.
3. **Prove the riskiest thing first.** The core bet is unproven; everything waits on M0.
4. **Open core.** AGPL-3.0 engine (dual-licensed: free under AGPL, commercial licence available), with a hosted/enterprise layer possible later. Copyleft keeps a competitor from closing a hosted fork; dual licensing keeps the business open.
5. **Layered, complementary coverage (ADR 0002).** Rule engines (axe-core) cover the mechanical/visual ~57% a screen reader cannot perceive; we cover the lived-experience remainder that needs human judgment; what neither can determine is flagged for a human. We do not reimplement contrast/ARIA rules, and we do not pretend a screen reader sees visual issues.

### Next architecture steps (from ADR 0002)

- [x] **Integrated axe-core** (rule-based layer): `src/scan/axe.ts` runs it via Playwright (A/AA tags) on the same URL; the `witness` CLI now emits a two-layer report (rule-based + lived-experience), run concurrently. Proven: catches 1.4.3 contrast (which the screen-reader layer cannot perceive) and agrees with the lived-experience layer on overlapping structural criteria (1.1.1). Clean on correct markup.
- [x] **Made the axe layer optional, and importable** (amendment to ADR 0002). The code is 99 lines and ~1s concurrent with a ~53s capture, but Playwright pulled ~536 MB of Chromium as a hard dependency, and a team already running axe would get duplicate findings from two engine versions in one CI. Now `optionalDependencies` + dynamic import (absence is a supported state, not a crash), `--no-axe`/`A11Y_AXE=0`, and `--axe-results <file>` to consume results they already have — three real-world shapes accepted, all mapped through the same code so a finding cannot differ by who scanned, with a warning when the recorded URL disagrees. The report says "not run" rather than "0 violations", because silence must not read as a pass. Required decoupling the capture-integrity page title from axe first (`src/scan/page-title.ts`), independently of the worker so the check is not circular.
- [x] **Interaction model, part 1 — structural navigation.** The capture now skims by element type (headings, landmarks, form fields) via NVDA quick-nav, swept in both directions so it works regardless of cursor position (Guidepup has no "move to top"). Reveals presence AND absence (e.g. a page whose visual titles are not real headings shows zero headings). Wired into the judge (recall + verify); no eval regression. `packages/lab/src/capture/nvda/capture-core.mjs`.
- [x] **Interaction model, part 2 — operate controls.** Two lived-experience probes that activate controls and judge whether the screen reader hears the result, neither of which a rule engine can do. Both activate *in place* during the form-field quick-nav sweep (a separate next/previous sweep fails: after the sweep the cursor sits at the end, so on a sparse page "next" returns nothing — the only control is the *current* position). (a) **Disclosure state change**: activate a "collapsed" control and record what is announced; an empty announcement = the state change is not conveyed (4.1.2). (b) **Form submit (opt-in `--probe-forms`, since activating a submit button has side effects)**: submit with no valid input and capture the `spokenPhraseLog` delta (every phrase announced after the submit, so a live-region alert is not overwritten by a following focus move); if no error is announced the user is never told what failed (3.3.1 Error Identification, 4.1.3 Status Messages). Wired into the judge (recall + verify). `packages/lab/src/capture/nvda/capture-core.mjs`.
- [x] **Fixed the flakiness via the Guidepup docs.** Cross-referencing the official API surfaced `windowsActivate`, which explicitly focuses the Edge window instead of hoping the launch took focus — a real cause of empty/partial captures. (The other, found later via structured diagnostics: a Windows permission dialog silently blocking the interactive session.)
- [x] **Refactored the interaction traversal to NVDA quick-nav** (`moveToNext/PreviousFormField` + in-place activation) instead of raw Tab, which stalled on sparse pages and escaped into the browser chrome. Note: NVDA's "B" button quick-nav misses plain `<button>`s that "F" (form field) reaches, so the sweep navigates by form field.
- [x] **Debug mode / structured diagnostics (all levels).** Every capture phase records a diagnostic (`browserLaunched`, `windowsActivate`, `nvdaStart`, `afterStart`, `readThrough` with stopReason + firstStepError, `structural`, `formProbe`, `interaction` sweepLog, `done`) instead of a silent catch; surfaced via `server.log` and the CLI `--debug`, with a 0-announcement WARNING. This is what pinpointed the permission-dialog outage. `packages/lab/src/capture/nvda/capture-core.mjs`.
- [x] **Validated part 2 against paired W3C tutorial examples.** Disclosure pair (`disclosure-good` announces the state change → clean; `disclosure-bad` never updates `aria-expanded` → 4.1.2 caught) and form-validation pair (`forms-validation-good` announces the error via a live region → clean; `forms-validation-bad` shows it visually only → 3.3.1 + 4.1.3 caught), both with zero false positives. Added as eval cases; the signal lives in `interaction.stateChanges` / `interaction.formChanges`, invisible to a static read.

### Next: reproducible testing + distribution (ADR 0003)

Real NVDA runs in GitHub Actions (via `guidepup/setup-action`), which makes capture reproducible by anyone AND is the foundation of the chosen distribution vector — a GitHub Action teams drop into their own CI. Dependency-ordered:

- [x] **Phase 0 — Prove real NVDA in GitHub Actions.** `capture-spike.yml` on `windows-2022` with `guidepup/setup-action@0.20.0` captured `structure-good.html` with NO personal VM: 10 transcript phrases, 5 headings, 5 landmarks via structural quick-nav. Premise confirmed — capture is reproducible on GitHub-hosted infra. (Read-through + structural nav exercised; the interaction probes come in Phase 1's fixture diff.)
- [x] **Phase 1 — Capture-regression CI.** `capture-check.mjs` + `capture-regression.yml` drive the real worker over the tutorial pages on a `windows-2022` runner and assert stable signals (read-through lines, headings/landmarks presence AND absence, controls found, both interaction probes firing) — tolerant of NVDA's run-to-run variance, never exact transcripts. Green and path-filtered. First automated test of the capture half. Surfaced and fixed two real issues the VM hid: Edge's first-run welcome UI leaking into heading-less captures (a capture-integrity bug, fixed by suppressing the FRE), and phantom elements from stale `lastSpokenPhrase` (fixed with a no-movement guard).
- [x] **Phase 1b — Harden announcement-text capture; characterize its limits.** Added a version- and mode-robust second signal: after a submit, re-read the form fields' persistent state (Escape to leave focus mode, Ctrl+Home to anchor, then LAND on each field — grounded in the NVDA user guide), so an accessible form's marked-invalid field announces "invalid entry"/its associated error. The judge now weighs BOTH the immediate announcement (4.1.3) and this field re-read (3.3.1) as POSITIVE evidence: conveyed if either names the error, failure only if both are absent. **Honest finding:** the post-submit error capture is nondeterministic in *both* channels even on the stable VM (NVDA post-action behaviour), so the CI capture gate asserts only robust signals (probe fires + control identified), and the good/bad distinction is validated by `npm run eval` on representative fixtures (good clean, bad → 3.3.1, 0 FP). **Residual:** reliably determining error-conveyance on a live page is inherently best-effort; the principled next step is to treat a non-conveyed error as needs-human-review (Layer 3, ADR 0002) rather than a hard automated pass/fail.
- [x] **Phase 2 — Pluggable judge backend.** The judge's model call is now one seam (`ask()` in `judge.ts`) dispatching on `JUDGE_BACKEND`: **codex** (default — the author's local login, no metered cost) or **anthropic** (BYO `ANTHROPIC_API_KEY`, `JUDGE_MODEL` overrides; official SDK, `claude-opus-4-8`, adaptive thinking, streamed; SDK lazy-imported so Codex-only users never load it). Both return text; `extractJson` handles either. Codex path re-validated on the eval (100% recall, 0 FP). The Anthropic backend is implemented to the SDK spec but not exercised here (no API key on the author's machine, by design); first real run will be in CI / the Action with a key. Preserves the no-metered-API constraint: the author's runs stay on Codex.
- [x] **openai backend (OpenAI-compatible).** Added behind the same seam (`JUDGE_BACKEND=openai`, `JUDGE_BASE_URL`, optional `JUDGE_API_KEY`/`JUDGE_MODEL`): plain `/v1/chat/completions` over fetch, so it serves hosted OpenAI *and* any local engine (llama.cpp/vLLM/Ollama). Reasoning models with a separate `reasoning_content` field leave `content` clean; a `<think>` strip covers servers that inline it. **Empirically measured** against a local **Qwen3.6-27B Q4_K_M** (llama.cpp, 98K ctx) on the W3C eval subset: **88% recall** (caught 1.1.1/1.3.1/2.4.4/4.1.2; missed only the judgment-heavy 1.4.5 images-of-text), **0 false positives on the clean reference page** (no over-flagging — the main small-model risk), 2 FP only on the confounded `w3c-bad-after` demo page (Codex stumbles there too). Verdict: a 27B Q4 is a viable **self-hostable, zero-API-cost judge** for the high-signal majority, with a real but bounded recall gap on the subtlest criteria vs a frontier model. Not yet run on the full 21-case suite (slow at ~34 tok/s) or the interaction cases.
- [x] **Phase 3 — The GitHub Action.** `action.yml` at the repo root: a **composite** action (container actions do not run on Windows, and NVDA needs Windows) that sets up NVDA, starts the capture worker, drives `src/cli.ts`, renders a job summary, and updates a single PR comment via `gh pr comment --edit-last --create-if-none`. Inputs cover `url`, `task`, the user's own `anthropic-api-key`, `fail-on`, `probe-forms` and `axe`; outputs expose the finding count, task-completability and the raw JSON path for artifact upload. `examples/workflow.yml` is copy-pasteable; `docs/github-action.md` explains the choices.

  **`fail-on` defaults to `never`.** A tool that breaks builds the day it is installed gets uninstalled; one that reports first and gates when asked gets adopted. An *unrecognised* `fail-on` throws rather than defaulting to never, because a workflow typo that silently produces a permanently green check is the failure nobody notices.

  The setup steps are the four faults this project already paid for, carried across with their reasons: install NVDA from this checkout rather than `guidepup/setup-action` (which installs the pre-0.29 layout and fails as "NVDA is not supported"), disable the Speech Viewer (its focus event lands in the interaction delta), suppress Edge's first-run surface (quick-nav escapes an empty document into browser chrome), and poll `/health.ready` rather than `ok` (a worker answered `ok` while NVDA could not start).

  Verified as far as it can be locally: 12 tests over the renderer and the pass/fail policy, the exit contract exercised four ways, and a **real end-to-end run** — real NVDA capture, real judge, `4.1.2 blocker` on a genuinely unnamed button — rendered through the Action's own reporter. That run found a real defect in `src/cli.ts`: `--json` emitted `ruleBased: []` when axe had been SKIPPED while the text report correctly emitted `null`, so a consumer rendered unchecked contrast as "0 violations". Both paths now read one value and cannot diverge.

  **Not verified: the Anthropic judge backend.** This project deliberately has no metered API key (the judge runs via Codex), so `JUDGE_BACKEND=anthropic` is implemented to the SDK spec and unexercised — the same caveat Phase 2 recorded. The first real run of that path will be someone else's CI, which is worth saying out loud rather than discovering. **Marketplace listing is still to do** and needs a tag plus a publisher account.
- [ ] **Phase 4 (later) — Hosted open-core layer.** Managed capture pool + judge-as-a-service + dashboard, once the Action proves demand.

### Next: a distributable, semantically-versioned multi-package repo (ADRs 0004–0008)

ADR 0003 chose the GitHub Action as the primary distribution vector. That serves CI
users and nobody else: the repo is one `private: true`, `version: 0.0.0`,
`noEmit: true` package, so **nothing here can be installed, and therefore nothing
here can be pinned.** A consumer who wants to score archived captures, or run their
own worker pool, or write a JAWS backend, has no route in.

The layout below is measured, not assumed. Two findings from the import graph
overturned the obvious core/workers/model split:

- **`packages/lab/src/capture/verify.ts` and `src/wcag/criteria.ts` have zero imports** and are
  imported by the CLI, the report, the scan layer, the judge, the eval harness,
  three files in `packages/lab/src/training/`, and `packages/lab/scripts/evidence-check.mjs`. They are not
  capture code — they are the **shared evidence contract**, and their location under
  `packages/lab/src/capture/` is the only thing that makes a three-way split look workable.
- **Worker and fleet have different operating systems.** Everything in
  `packages/lab/src/capture/nvda/` imports only node builtins, guidepup and its own siblings;
  everything host-side (`local-vm`, `worker-health`, `host-capacity`, `doctor`,
  `worker-ctl`) never imports guidepup. `action.yml` proves the split is real: on a
  Windows runner it starts `server.mjs` directly with no VM, no `utmctl`, no pool.

Also: **`src/spike/` is the production judging engine**, not spike code. Only three
of its files are harnesses.

| package | licence | runs on | separate because |
|---|---|---|---|
| `@a11y-witness/evidence` | Apache-2.0 | anywhere | zero deps; all an alternative capture backend needs |
| `@a11y-witness/scorer` | AGPL | host + Python | the weights are the API — a retrain is a major |
| `@a11y-witness/judge` | AGPL | anywhere | score an archived capture with no worker at all |
| `@a11y-witness/nvda-worker` | AGPL | **win32** | a GitHub Windows runner needs this and nothing else |
| `@a11y-witness/worker-fleet` | AGPL | macOS/Linux | `doctor`/`worker-ctl` run where there is no NVDA |
| `a11y-witness` | AGPL | host | the front door; carries axe/playwright optionals |
| `@a11y-witness/lab` | AGPL, **unpublished** | host | our corpus, gates, dataset pipeline and eval fixtures |

npm workspaces (pnpm's `workspace:` protocol is rejected by npm 11.5.1 with
`EUNSUPPORTEDPROTOCOL` — measured), inter-package deps as published semver ranges,
`tsc --build` with project references so the dependency graph is compiler-enforced,
`.mjs` shipped verbatim, Changesets for independent per-package semver. ADRs 0004
(boundaries and public API), 0005 (tooling and build), 0006 (naming, registry,
licensing), 0007 (versioning and release), 0008 (what stays internal).
`docs/glossary.md` pins the new vocabulary — in particular **scorer** (the trained
model, which produces numbers) versus **judge** (the layer that turns numbers plus
rules into findings), because conflating them makes "the model changed" and "the
thresholds changed" the same sentence when they need different version bumps.

#### Migration order — riskiest assumption first, and it is not a file move

The whole plan rests on one unproven claim: **that a consumer can install and run one
package in isolation.** Every step below is ordered to test that as early and as
cheaply as possible, and the first step moves no files at all.

- [x] **M0 — Prove isolation before restructuring anything.** Done; findings in
  **`docs/isolation-spike.md`**. Both predicted defects confirmed, plus two that were not
  predicted: Node **refuses type stripping inside `node_modules`**
  (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`), so shipping unbuilt `.ts` is impossible rather
  than merely awkward and ADR 0005's build is load-bearing; and the committed weights
  (`screenreader-structured-v4`) do not match the committed trainer (`v1`), so **a fresh clone
  cannot score at all**. `.mjs` ships and imports verbatim, which validates the worker package's
  shape. Nothing invalidates ADR 0004's boundaries.

  The scorer program and `check-screenreader-hardening.py` were never committed and now are, with
  a test asserting every referenced `scripts/…` program is tracked in git. The trainer mismatch is
  open: the `v4` trainer is uncommitted work belonging to another session, coherent with ~17 other
  files, so it is an ownership decision rather than a fix.

  Two failures are already known from reading the code and must be confirmed here:
  `local-judge.ts:311-312` resolves the scorer as `".venv/bin/python"` and
  `"scripts/score-screenreader-model.py"`, both relative to the process cwd, which is
  never the repo root for an installed package; and
  **`scripts/score-screenreader-model.py` does not exist on `main`** — verified with
  `git cat-file -e main:scripts/score-screenreader-model.py`, which fails. It survives
  only in unreachable `kanban checkpoint` commits, so the default judge backend
  cannot run from a clean checkout today. Restoring it is a prerequisite for M3, and
  it is a real defect independent of packaging.

  If M0 finds that isolation is structurally impossible for the judge path (e.g. the
  87 MB encoder cannot be fetched without our credentials), the scorer-as-npm-package
  decision in ADR 0004 needs revisiting **before** any file moves.
- [x] **M1 — Workspace scaffolding, zero moves.** DONE (`2b6f44f`, `5c146e3`),
  verified from a clean clone of the remote: 365/365 tests, typecheck clean, `build`
  and `gate:isolation` both working. Both gates are **shown to reject** — the
  isolation gate fails an omitted dependency and a truncated `"files"` while passing
  a sound package, and a reference cycle is a build error (TS6202, exit 4) while a
  sound composite project still emits `.d.ts`. Two deviations from the plan, both
  measured: `npm run build` **discovers** `packages/*` rather than reading a solution
  file, because an empty `"files": []` is a hard error (TS18002) and a maintained
  project list is one more thing that can go stale; and `npm ls --workspaces` errors
  "No workspaces found!" on an empty glob, which is cosmetic and goes away with M2.
  `tsconfig.base.json` was omitted from the first commit and every local check passed
  anyway — the clean clone caught it, and the guard is now generalised to *any*
  tsconfig `extends` target being tracked.
- [x] **M2 — Extract `@a11y-witness/evidence`.** DONE (`cf8578d`) at `0.1.0`,
  Apache-2.0, **not published** — the release is prepared and the decision deferred.
  Verified in a tree containing only staged content: `npm ci` links the workspace,
  `prepare` builds `dist`, 365 tests / 0 fail, typecheck clean, gate 1/1, and
  `npm run eval` through the local judge still reports recall 100% with 0 false
  positives on conformant pages. The gate **rejected the package three times** first,
  each a real defect a consumer would have received and none visible from inside the
  workspace: two wrong field names in the README's own example, and a tarball with no
  `dist` because `npm pack` does not build. `"prepack": "tsc --build"` is now a
  documented requirement for every package.
- [x] **M3 — Extract `@a11y-witness/scorer`.** DONE (`c5b9813`) at `0.1.0`,
  AGPL-3.0-or-later, not published. Gate met: `npm run eval` unchanged against the
  local backend, and behaviour preservation measured directly — **28 fixtures scored
  byte-identically before and after**, including the VoiceOver capture that must be
  refused; scoring from `/` matches scoring from the repo root.

  Two things this milestone did not anticipate. **The trainer was a runtime dependency
  of scoring** — `score.py` loaded it by file path and called nine symbols out of it —
  which ADR 0004 forbids shipping. All nine were feature-pipeline or inference, so
  `screenreader_features.py` became the feature contract and ships *with the weights
  it describes*; the trainer went 607 → 303 lines and stays unpublished. And the M0
  defect was **four** cwd-relative resolutions, not one: `cli.ts`'s shadow scorer,
  `fetch-encoder.py`'s output directory (87 MB into whatever directory the consumer
  stood in) and the trainer's own `--encoder`/`--output` defaults.

  Also closed two checks that would have passed by examining nothing after the move:
  `scorer-artifact.test.ts` read the schema from the trainer, and
  `referenced-scripts.test.ts` matched only `scripts/`.
- [x] **M4 — Extract `@a11y-witness/judge`.** DONE (`04841b9`) at `0.1.0`,
  AGPL-3.0-or-later, not published. `src/spike/` is retired; its three harnesses are
  `packages/lab/src/harnesses/`, its NVDA fixtures are `packages/lab/src/eval/fixtures/nvda/`. Gate met:
  `rules:gate` PASS and `npm run eval` recall 90% with 0 false positives on conformant
  pages — unchanged.

  It exposed three defects, all of the same shape (a path that was right only because
  of where a file sat), and all found by the committed-content-only check rather than by
  anything in the repo: **`npm ci` failed outright**, because `prepare` ran in `judge`
  before its siblings were built — fixed with project `references`, the first real use
  of the `composite: true` ordering guarantee M1 put in place; the local judge's
  interpreter default was `<repo>/.venv/bin/python` derived as `../../` from its own
  source, which became `packages/.venv/bin/python` (now `python3` on the PATH, with
  `A11Y_PYTHON` winning); and the artefact test's `repoRoot` became `packages/`.

  The isolation gate also turned out to handle only LEAF packages: nothing is published,
  so npm could not resolve `@a11y-witness/evidence` for `judge` and failed with E404. It
  now packs the internal closure and installs the tarballs together.
- [x] **M5 — Extract `@a11y-witness/nvda-worker`.** DONE (`b03fab1`) at `0.1.0`,
  AGPL-3.0-or-later, not published. `packages/lab/src/capture/nvda/` retired; `.mjs` ships verbatim so
  there is no build step. **`CAPTURE_PROTOCOL_VERSION` did not move** — still 4, nothing
  invalidated. All four gates met, in order:

  | gate | result |
  |---|---|
  | `evidence:check` | 44 SAME, 3 CHANGED — all 3 triaged to causes outside M5, then re-verified SAME |
  | `capture:check --worker=…` | ALL CAPTURE CHECKS PASSED, from the new location |
  | `worker:code` | matching on both sides (`8498203513af544c`) |
  | `gate:stability` | **6/6 canaries stable** |

  The cycle inverted by moving the boundary rather than adding machinery: ADR 0004 named
  one escape, but `capture-check.mjs` and `capture-books.mjs` also serve
  `packages/lab/src/eval/pages/tutorials`, which makes both LAB harnesses. They are `packages/lab/src/harnesses/` now and
  the worker package imports nothing outside itself. Consequence: the worker does **not**
  ship `a11y-capture-check`, and ADR 0004 records the deviation.

  Two ADR corrections came from contact with reality. **`"os": ["win32"]` is impossible
  here** — npm applies the platform check to workspace members, so it broke `npm install`
  on macOS outright, and `publishConfig` cannot add `os` at publish time. And `typecheck`
  had been **reporting clean over nothing**: ~25 package test files stopped being
  type-checked as M2–M5 moved them (measured with `tsc --listFiles`: 0 in the program,
  now 24) — my own regression, introduced in M2 and found in M5.

- [x] **M6 — Extract `@a11y-witness/worker-fleet`.** DONE (`659a8e7`) at `0.1.0`,
  AGPL-3.0-or-later, not published. Five bins; the UTM provisioning assets ship with it.
  Gate met: `doctor` finds all three workers, measures capacity, and every FAIL carries
  its remedy.

  It broke `doctor` first, in the way this milestone is about: the lifecycle script was
  resolved as `../scripts/local-worker/…` relative to the module, so after the move
  doctor reported **"no local VM tooling here" on a host with three registered VMs**.
  Same class in `deploy-worker`/`check-worker-code` (`resolve("packages/nvda-worker/src")`,
  a repo-layout guess), and in `fleetScriptPaths()`, which had to resolve `../src/…`
  because tsc does not copy `.sh`/`.xml` into `dist` — the isolation gate caught that one.

  ADR correction recorded: `shouldRetireWorker` stays in `capture-decisions.mjs` with the
  run's other accept/reject/evict decisions rather than moving to `./health`.
- [x] **M7 — Extract `a11y-witness` (the CLI).** DONE (`22e7181`) at `0.1.0`, unscoped so
  `npx a11y-witness` needs no wrapper; the root package became `a11y-witness-monorepo`
  because npm refuses two workspace members with the same name. `reportLines` and
  `Report` are the whole public surface.

  Gate met, against a live worker on the UW demo pair:

  | run | result |
  |---|---|
  | `before.html --no-axe` | 1.1.1 ×3, 1.3.1, 2.4.4, 4.1.2 — layered perceive → navigate → interact, and the report states that visual criteria come from the rule layer |
  | `after.html --no-axe --json` | **0 findings, `taskCompletable: true`**, `ruleBased: null` (did not run, not "ran and found nothing"), `captureVerified: true`, 102 announcements, 8 headings |

  The clean twin matters more than the findings, and both match what `RELEASE.md`
  records. The smoke test caught a third wrong API guess of mine (`reportLines` takes the
  judgment nested under `verdict`); and `git add -- src` swept up another agent's
  untracked test file, which the committed-content check surfaced as 0 failures becoming
  7.
- [x] **M8 — Collapse the remainder into `@a11y-witness/lab`.** DONE (`e09bbcd`),
  `"private": true`, never published. **`src/` no longer exists**; root `scripts/` holds
  only monorepo tooling. The `.ps1` provisioning went to `worker-fleet` (ADR 0004 always
  said `fleetScriptPaths()` covered `.ps1`; M6 moved only the `.sh`), and
  `guest-run.test.ts` followed its subject there.

  The isolation gate now skips private packages and **announces** the skip, because a
  gate that overstates its own coverage is the failure it exists to prevent.

  Gate: `release:gate` stops at `check-signals` for the pre-existing 418-stale-capture
  reason, exactly as before M8; every other stage verified individually — clean tree
  371 tests / 0 fail, `gate:isolation` 6/6, `rules:gate` PASS, `verify.corpus.test.ts`
  6/6, acceptance `passed: true`, `npm run eval` recall 90% with 0 false positives on
  conformant pages.

  Six path defects surfaced, all the same shape — a path that was right only because of
  where a file sat: two tests resolving the repo root from `process.cwd()`; four Python
  programs anchoring the scorer at `parents[1]`, with one variable serving both the scorer
  package and the corpus; 34 repo-relative fixture paths in `cases.ts` that made
  `npm run eval` report an empty corpus; and `referenced-scripts.test.ts` matching
  `scripts/foo.py` inside `packages/lab/scripts/foo.py`, reporting 9 present programs as
  missing.

- [ ] **M9 — `1.0.0` across the board, once an external consumer has used the APIs.**
  Everything stays `0.x` until then, deliberately: `0.x` makes a wrong boundary cheap
  to correct, and publishing `1.0.0` before anyone has consumed the API converts a
  guess into a promise.

Ordering rationale: M0 tests the assumption that could invalidate the design; M1
adds enforcement before anything can drift; M2–M4 walk up the dependency graph from
the leaf, so each step's consumers are already extracted and every gate is a
same-result comparison rather than a judgement call; M5 is deferred until the release
machinery is proven because it is the step that can cost hours of worker time.

### NVDA correctness audit (`docs/nvda-correctness-audit.md`)

Systematic review of the capture worker against the official NVDA user guide (four parallel dimension reviews, re-verified on the live worker). **Verdict: no incorrect or unsafe usage.** A follow-on three-whys root-cause pass then fixed the recurring *capture* issues at their roots:
- [x] **Root 1 — control + verify the browser NVDA reads.** Capture-integrity net (each capture must contain a page signature, else fails loudly — caught wrong-content reads the old test silently passed); Edge launched as a chromeless `--app` window (no chrome/banners/tabs to wander into); verify-and-retry (re-capture until the page is confirmed, since CI-desktop focus is racy).
- [x] **Root 3 — establish known NVDA state.** `anchorToTop()` (Escape → browse mode, Ctrl+Home → top) before the read-through, structural sweep, and post-submit re-read (also cancels auto-say-all); safe once `--app` controlled the env.
- [x] **Root 2 — prefer persistent state over transient speech** (mitigated): post-submit `aria-invalid` re-read + judge positive-evidence + verify-retry.
- [x] Softened an unsupported "F reaches buttons B misses" comment (defend-or-retract); pinned the NVDA install dir.

Remaining backlog:
- [x] **Product-level verify-and-retry in the control plane.** `scanWithAxe` now returns the page title; the `witness` CLI verifies the worker's capture contains it and re-captures (up to 3x) if NVDA read the wrong content, warning if still unconfirmed. Brings the gate's robustness to end-user captures. Validated e2e on a public page (happy path: title matched, no retry, judged normally).
- [ ] **Elements List (`NVDA+F7`) enumeration** — the guide's purpose-built bulk listing; cleaner than repeated quick-nav (read the dialog via list nav, not `lastSpokenPhrase`).
- [ ] **Pin a known NVDA settings profile** (symbol level, element-reporting toggles, "Report live regions", auto-focus-mode) for cross-version reproducibility.
- [ ] **Use Space (not Enter) for any future checkbox/radio probe; enter focus mode deliberately if a probe ever types into a field.**

## First full dataset run (2026-07-26) — what it broke, and the plan

45 pairs / 90 captures, 94 minutes. Everything captured; **30 of 45 pairs exported** (60
records). The pipeline works; the **labelling matrix and the worker's OS defaults** are the
weak links. Each item below is grounded in a captured transcript, not a guess.

### Root 1 — signal definitions went stale when the capture changed (8 cases)

The `badSignal` checkers and the capture probes are coupled, and nothing tests them
together. When a probe's output shape changes, its signal silently stops discriminating.

- [x] **`state-change-silent` (disclosure ×3).** The signal still means "the announcement
  was empty". The probe was changed today to *re-read the control*, so `after` is never
  empty: good is `"...focused, expanded"`, bad is `"...focused, collapsed"`. The signal must
  compare the **state word**, not test for emptiness. Caused by our own probe fix.
- [x] **`form-activation-silent` (form-error ×2).** Checks `formChanges`, which is identical
  on both sides (`"Newsletter signup, document"`). The discriminator is in
  `postSubmitFields`: good carries `"invalid entry, Enter an email address before joining."`,
  bad carries nothing. Point the signal at the field that holds the evidence.
- [x] **`table-unassociated` (×3).** The evidence is plainly there — good announces
  `"row 2, Destination, column 1, Riverside"` (header names in data rows), bad announces
  `"row 2, column 1, Riverside"`. Check for header names in data-row announcements.

### Root 2 — wrong instrument: a regex where structure is the discriminator (4 cases)

- [x] **`form-unlabelled` ×4 — was INVALID, the worst failure mode**, because the
  signal fires on the *good* page too. Pattern `(?:edit text|edit)[, ]*\s*$` matches a bare
  `"edit"` line, and NVDA announces a *correctly labelled* field across two lines
  (`"form, Recipient name"` then `"edit"`). So it can never discriminate.
  `structure.formFields` does, cleanly: good `"Recipient name, edit"` vs bad `"edit"`.
  Reuse the bare-role-no-name logic already in `src/spike/rules.ts` rather than writing a
  third copy.

### Root 3 — NVDA transforms the string before speaking it (3 cases)

- [x] **`image-filename-alt-exhibit`.** Pattern expects `harbour_07-final.jpg`; NVDA says
  `"harbour 07-final dot jpg"` — punctuation spoken, underscore flattened. Any
  filename-derived pattern needs the spoken form, and this generalises to the whole family.
- [x] **`icon-button-unnamed` ×2.** Pattern wants a bare `"button"`; NVDA says
  `"button, ￼"`. Match the object-replacement character, as the image rules already do.
- [ ] **Open question, not a page defect (corrected):** the *good* page announces
  `"button, O"`, and I first read that as the button being named after its icon glyph. The
  page is fine — it carries `aria-label="Open project menu"`. So `"O"` is a **truncated
  read**, most likely `lastSpokenPhrase` sampled mid-utterance. Harmless for the label (the
  signal keys on the bad page's U+FFFC) but it means a transcript can silently lose most of
  an announcement, which matters everywhere else. Worth chasing on the capture side.

### Root 4 — systemic: the labels are unvalidated instrumentation — FIXED

This is the same root as the capture audit's Root C, one level up: we assert on captures and
never assert that a *signal* can tell good from bad.

- [x] **`npm run training:check-signals`** asserts every `badSignal` fires on bad and stays
  silent on good, against captures already on disk, so it costs no worker time. It reports
  two distinct verdicts because they need different fixes: BLIND (never fired on bad) and
  CONTAMINATED (fired on good — worse, since a signal that flags both sides discriminates
  nothing). Written test-first: it reproduced the export's verdict exactly (30 discriminating
  / 11 blind / 4 contaminated) before a single signal was touched.

  It then earned its keep immediately. Two of my repairs were overreaches that the export
  alone would have hidden as "still 15 broken": conflating two criteria under
  `form-activation-silent` reported the filter-status GOOD pages as failing, and the new
  `unnamed-form-field` type wrongly captured `form-placeholder-only`, whose placeholder
  *becomes* the name. Both surfaced in seconds.

  **Result: 45/45 signals discriminate. Export goes 30 -> 45 observed, 60 -> 90 records,
  0 skipped, 0 invalid — with no new captures.**

### Worker reliability (from the 0xD1 bugcheck that killed 4 cases)

- [x] **Stop Windows Update rebooting the worker.** Proven twice in one run
  (`id=1074 winlogon.exe has initiated the power off ... on behalf of NT AUTHORITY\SYSTEM`
  at 09:02:55 and 09:09:30, mid-run). A capture worker is an appliance; it must not choose
  its own downtime.
- [x] **Suppress Edge background/startup-boost processes — and its auto-updater.** 5 `msedge` processes were alive
  on an idle, freshly booted machine with 0 captures run. Teardown does not tear down, and
  94 minutes of launch/kill churn is the context in which a driver faulted.
- [x] **Faulting driver named: `viogpudo.sys`, the VirtIO GPU display driver.** WER kept the dump
  (`C:\Windows\Minidump\072626-3484-01.dmp`, 0.4 MB) but for a kernel bugcheck it records no
  module, only the signature: `d1`, P1 `fffff8071b7d80b8`, P2 `2` (DISPATCH_LEVEL), P3 `8`
  (execute), P4 **the same address as P1**. Code jumped to an address it could not execute at
  raised IRQL — typically a driver whose code page went away underneath it. Naming the module
  needs windbg against that dump, so that is what we did -- Debugging Tools installed on the
  guest (`winsdksetup.exe /features OptionId.WindowsDesktopDebuggers /quiet`), `!analyze -v`
  with public symbols:

  ```
  MODULE_NAME:        viogpudo
  IMAGE_NAME:         viogpudo.sys
  PROCESS_NAME:       dwm.exe
  FAILURE_BUCKET_ID:  AV_CODE_AV_PAGED_IP_viogpudo!unknown_function
  faulting address:   viogpudo+180b8
  ```

  `Red Hat VirtIO GPU DOD controller v22.7.38.43`. The bucket matches the raw signature
  exactly: an attempt to EXECUTE at a paged-out instruction pointer, which is why P1 == P4 and
  P3 == 8. It faulted in the context of **dwm.exe**, the compositor -- and our workload is
  brutal on exactly that path, creating and destroying an Edge window per capture, 90 times a
  run, each forced to the foreground.

  So: a guest display-driver bug, not our code, and not Windows Update or Edge (which only
  added load). Options now that it is named, none yet done:
  - update the virtio-win guest drivers (this one is from a 22.7 package);
  - or change the VM's display device -- the VM currently runs `-device virtio-ramfb`, and a
    different backend may avoid `viogpudo` altogether;
  - or stop churning windows: reuse one Edge window across captures instead of launching a new
    one each time, which would cut the driver's stress path enormously. Not trivial -- a
    chromeless `--app` window has no address bar to navigate with -- but it is also the single
    biggest remaining efficiency win, so the two motivations point the same way.
  The two background activities found alongside it (Edge auto-updating itself mid-run, per
  WER reports from `MicrosoftEdgeUpdate.exe` and Edge's `setup.exe` with
  `EdgeInstallerError 0x220`; and Windows Update rebooting twice) are now both disabled, so
  the conditions have changed even though the driver is unidentified.
- [x] **Make a run wait out a transient worker.** A connection failure fails the case
  immediately, so one outage cascaded into 4 lost cases. The worker self-heals via
  auto-logon; the run needs to be patient, not clever.

### Efficiency and reliability backlog — identified, measured where possible, NOT done

Current cost per capture is **~12.4s**, measured across three guests over 7 interleaved rounds each
(medians 12.4 / 12.4 / 12.3, IQR <= 0.6). The breakdown below predates the speech-channel probe, when
the same pool ran 36.7 / 42.0 / 93.7s; the phase SHARES still hold, the absolute numbers do not: `structural` 4.8s, the readiness gate
4.5s, `readThrough` 1.6-3.6s, the rest setup and teardown. Re-measured later on a busy 36 GB Mac
it is ~27s with one guest up and ~45s with three — the phase shares hold, everything just
dilates, so quote the host state alongside any figure here.

Two costs have since been characterised and are worth reading before optimising anything else:
**`windowsActivate` is now the largest single phase at ~10s**, and it is Edge cold-starting on
every capture because Edge is launched and quit each time (`waitedMs: 10784` against an 800ms
settle). And a **mute NVDA** (stochastic; ~55% of instances die before their 25-capture recycle) used to
cost ~184s each to recover; the read now stops after
8 silent advances, bringing that to ~86s. Both are detailed in `CLAUDE.md`.

### Found 2026-08-08: the scorer abstains on real pages, and one asset unblocks three things

- [ ] **Build the real-page calibration corpus — see `docs/adr/0010-real-page-calibration-corpus.md`.**
  Measured: 28 of 32 real eval fixtures fall outside the training corpus's own k-NN support (real pages
  0.50-0.84 cosine, corpus 0.847-0.99). The scorer now abstains rather than extrapolating, which took
  false positives on conformant pages from 2 to **0** and eval recall from 90% to **59%**. The missing
  31 points were the model predicting beyond its competence.

  The same missing asset blocks the conformal abstention threshold, ADR 0009's realism tier, and any
  real-page recall claim above 59%. Sources must publish their own conformance (W3C WAI Tutorial
  sub-examples, W3C BAD), because a corpus we label ourselves only measures our agreement with
  ourselves. **Inventory finding: all six top-level tutorials are already test fixtures, so expansion is
  the sub-examples within them.** Labelling is the cost; capture is mechanical.

  Note the self-inflicted part: ADR 0009 shrank page sizes 40 links -> 6 for affordability, widening the
  gap that causes abstention, and named the realism tier as mitigation without building it.

- [ ] **Decide the error rate to defend.** It sets the abstention rate, so it decides how much the tool
  reports versus declines. A product and legal judgement, and the required input to conformal
  calibration — only answerable once the calibration set exists.

- [ ] **`4.1.2:missing-role` (74 records) is out of scope for a screen-reader-only tool, and should say
  so.** A div styled as a button: `formFields` is empty and "button" never appears, so from
  screen-reader output on a single page it is indistinguishable from prose. Knowing it should be a
  control needs the visual/DOM layer — axe-core's job, and why this tool sits alongside it. Claiming
  those 74 is what produced false positives.

- [ ] **A state-change rule needs the probe to record ACTIVATION, not focus.** Reverted (see the comment
  where it lived in `packages/judge/src/rules.ts`): it reached 69/69 on the corpus, took 4.1.2 recall
  50.7% -> 74.5%, and reported the conformant W3C menus tutorial as failing, because a menu button that
  does not open on focus produces evidence structurally identical to a disclosure that never announces
  its state. Capture gap, not a rule to tune. Worth 69 records once fixed.

### Found 2026-08-07 during the recapture, all open

Five defects surfaced by actually running the thing. Recorded because four of them are tooling that
*reports* wrongly rather than code that breaks — the class this project keeps being bitten by.

- [ ] **The host-memory cap approved two guests on a host with 0.1 GB free.** It reported
  `~14867 MB available ... 2 of 3 local workers will be used` while `Pages free` was 0.1 GB and the
  compressor held 55.7 GB (compressed into an 8.8 GB footprint) after a hibernate. `vm_stat` counts
  compressed pages as available, so **the estimate rises as the host gets sicker** — this file already
  says so, and the cap still fell for it. The second guest's footprint then collapsed to 1.4 GB against
  the healthy one's 6.25 GB (`top -o mem`, not RSS) and its NVDA went mute repeatedly:
  `recoverable fault: NVDA is running but not speaking`. 6 recoveries in 32 captures, against 0 in 244.
  Needs a signal compression cannot inflate, **and** a mid-run check — the pool is sized once at start
  and never re-examined.
- [ ] **`worker-ctl up --vm=<name>` ignores the flag and reports a different VM's health.** It said
  `already started / answering, NVDA still warming up` for `a11y-worker-3` while `utmctl` showed that
  guest **stopped** — it was describing the default worker. A command that names one VM and verifies
  another is this repo's recurring lesson in a new costume, and worse than the deploy-verification case
  because the wrong answer is *plausible*.
- [ ] **`training:status --json` emitted nothing parseable while the run was demonstrably healthy**
  (captures landing on disk, worker at 0 failures). It is the command `next_command` tells you to run
  and the one you would rely on overnight. Either the JSON shape moved or the progress file is not read
  as expected. Do not guess — read it against a live run.
- [ ] **Soften the power guard from refuse to warn above a low-battery floor.** Added the same day (see
  `power-guard.mjs`), and the very first real use blocked an attended run at 100% battery, which is
  friction rather than protection: the operator was sitting there and could plug in. A guard that
  blocks the common case gets switched off, which is worse than a softer one that survives. Keep the
  refusal only when the charge genuinely cannot outlast the run. Note also that `caffeinate` does **not**
  save you — Low Power Sleep at 1% fires regardless of a power assertion, so the honest value of that
  half is narrower than its commit message claimed.
- [ ] **Rebuild `a11y-worker-2`.** Deleted after the host hibernated at 1% with guests running and the
  recovery stop timed out waiting for RPC, leaving Windows unbootable in Automatic Repair. Rebuild with
  `clone-worker.sh` from a healthy guest rather than repairing — Automatic Repair had already failed its
  own first attempt. Not urgent: the memory cap permits two guests, and `a11y-worker-3` fills that slot,
  so this restores a spare and not capacity.
- [ ] **A `pmset` sleep hook that stops guests cleanly before the host suspends.** The power guard
  prevents a *run* starting into this, but nothing protects guests already up when the host loses power
  for an unrelated reason — which is exactly how worker-2 was destroyed.

Ideas below are ordered by expected value, each with the reason it is still open — so nobody
re-derives the analysis.

- [ ] **BLOCKER for the recapture: the structure sweeps are truncated by the capture deadline, and
  truncation is indistinguishable from absence.** Measured 2026-08-06 on
  `table-unassociated-headers/bad` (40 links, 40 list items, 29 headings), four captures, one guest,
  **0 recoveries and 0 failures** — so this is not the mute fault and not focus mode:

  | field | four captures | page truth |
  |---|---|---|
  | headings | 29, 29, 29, 29 | 29 — stable |
  | links | **27, 34, 33, 26** | 40 — never reached |
  | lists | **0, 0, 0, 0** | present — false zero |

  `MAX_SWEEP_STEPS` is 40, exactly the filler's link count, but at 26-34 the cap is not what binds —
  the shared capture deadline is. Links stops at a varying point; `lists` runs afterwards, finds the
  budget already spent, and returns 0. **`lists: 0` on a page full of lists is the exact conflation
  this project forbids**: "the page has no lists" and "we ran out of time" become the same evidence.
  The `break` at `capture-core.mjs:1388` records no stop reason, so it is invisible in the same way
  the 604 silent `sweepLog` crashes were.

  Caused BY the page rescale (`6d5fcae`), which made pages 20-40x bigger without scaling the sweep
  budget. It is why `gate:stability` reports 4/6 — though note the gate's summary points at the wrong
  field: `headings 29,29,29,29,5` was a genuine one-off, and headings are stable on repeat. The
  unstable field is `links`.

  Not a shortcut feature — the filler is identical across a pair, so it does not correlate with the
  good/bad label the way U+FFFC did. It is noise, but it makes `links`/`lists` unreliable and any
  signal reading them can flip.

  Fix: a per-sweep budget scaled to page size, and a `deadline` stop reason so a truncated sweep can
  never again read as absence. Then deploy, `capture:check`, `evidence:check`. It changes what the
  evidence means, so it needs a `CAPTURE_PROTOCOL_VERSION` bump — free right now, because the 848-pair
  recapture is already required, and bundling them pays the cost once. **Do not start the recapture
  until this is fixed**, or the false zeros are written into every capture.

  **UPDATE, and it is worse than a truncation bug: the rescale made a capture 5-10x slower, so the
  848-pair recapture estimate of ~5.8h is wrong by roughly an order of magnitude.** Timed end to end
  on one guest, deployed code, quiet host:

  | page | capture time |
  |---|---|
  | `table-unassociated-headers/bad` — 40 links, 29 headings | **123.4s** |
  | `form-unlabelled/good` — 14 links | **58.1s** |
  | documented baseline before the rescale | 12.4s |

  The 123.4s is the capture hitting `DEFAULT_BUDGET_MS` (120s), so **the overall budget ceiling is
  itself truncating evidence** — that is why the list sweep reports `deadline`. Per-sweep detail on the
  40-link page shows where it goes: `heading` 13.8s + 12.6s and `link` 0.3s + 20.6s, ~50s of sweeping
  in one capture. Each sweep step is 2 round trips (`perform` + `spokenPhraseLog`) at ~225ms, so cost
  is linear in element count and the filler multiplied element count by 20-40x.

  1,696 captures at these rates is **~18h on three workers, ~42h on one** — not one overnight run.

  So the per-sweep budget fix is necessary but not sufficient: fair allocation stops `lists: 0` being a
  false zero, but it cannot make a 40-link page affordable. The options, and this is a research-design
  decision rather than a code one:

  1. **Shrink `SCALE_BUCKETS`** (currently up to `{links: 40, sections: 28}`). The rescale's goal was
     realistic structure; most of that realism is present at 14-20 links for a fraction of the cost.
     Cheapest, and it keeps the recapture to one night.
  2. **Cut the round trips per sweep step** from 2 to 1. Structural, benefits every capture including
     un-rescaled ones, but it touches the most defect-prone code in the repo.
  3. **Accept ~18h** across three workers and run it over a weekend. Note the host-memory cap means
     three guests on a 36 GB Mac is exactly the over-commitment that produced starved workers.

  Do not pick one of these without the user: option 1 changes what the corpus represents.

  **SECOND UPDATE, after shrinking the buckets (ADR 0009) and regenerating the pages.** The cost fix
  works — 123.4s -> 28.1s on the page that was hitting the budget, a 4.4x win. But two things came out
  of verifying it that matter more than the win:

  - **The cost model was wrong and the test that encoded it passed anyway.** Predicted 12.4s for an
    unfurnished page, measured **28.1s**; predicted 21s for `{6,4}`, measured **37.2s**. The 12.4s came
    from CLAUDE.md, measured on a different host state. So the honest recapture figure is **15.4h on one
    worker, 8.1h on two** — it fits a night on two guests, not one. `scale-buckets.test.ts` now carries
    the measured constants and names the pool in its assertion, because the comfortable single-worker
    number was hiding the constraint. Corrected within the hour, but it passed against an unchecked
    model first, which is this repo's own count-based-check trap.
  - **`lists: 0` SURVIVES the fix, and is therefore not a budget problem.** A 6-link page with 6 list
    items, captured in 37.2s against a 120s budget, still reports zero lists. So the list sweep has a
    defect independent of truncation — the deadline was masking it, not causing it. This is unfinished
    and is the next thing to diagnose: `stop`/`stopPhrase` are now on the wire for exactly this, so
    start by reading `nextStop` for the `list` sweep rather than reasoning about it.

  Reproduces in ~90s. Two throwaway probes exist under this session's scratchpad
  (`probe-sweep.mjs`, `dump.mjs`); they lease the page server, capture N times against a named worker,
  and print the per-field counts with `/health.vitals` after each.

- [x] **Removed a redundant anchor: 15.8s -> 13.4s per capture.** Measuring before optimising
  corrected my own claim that the time was mostly browser setup. On a typical page with NVDA
  reused it was: structural 4.7s, documentReady 3.9s, afterStart 3.0s, windowsActivate 2.2s,
  readThrough 1.6s. `anchorToTop` (Escape + Ctrl+Home + a settle) was running THREE times per
  capture at ~2-3s each, and only two are needed. The one before the readiness gate was left
  over from when the read-through followed immediately; the gate is position-independent and
  the anchor after it re-establishes the state anyway. `documentReady` 3.9s -> 1.7s, wall
  15.8s -> 13.4s, with fidelity byte-identical (29 phrases, 23 role words, 8 heading-levels
  across 6 pages — the same numbers as before) and capture-check green on all 7 pages.

- [ ] **Reuse one Edge window across captures instead of launching a new one each time.**
  Re-costed after the above, and it is worth less than I first said: with `windowsActivate`
  at 1.9s and `browserClosed` at 0.3s, removing the per-capture browser launch buys ~2s of
  13.4s, not the majority. Still the right fix for the `viogpudo` crash, since window churn is
  what stressed that driver, but the efficiency case alone no longer justifies the risk to the
  `--app` isolation that keeps NVDA out of browser chrome.
  The biggest remaining win, and it is *two* wins: it removes the per-capture browser launch
  and foreground fight (a large slice of the remaining time), and it directly targets the
  crash. `viogpudo.sys` faulted in `dwm.exe` while we created and destroyed 90 windows in a
  run, so cutting that churn attacks the driver's stress path rather than working around it.
  Blocked on navigation: the window is deliberately chromeless (`--app`), so there is no
  address bar to drive, and reusing it needs another mechanism — most likely CDP via
  `--remote-debugging-port`, which also gives a real `Page.loadEventFired` to replace part of
  the readiness gate. Non-trivial, and the `--app` isolation that keeps NVDA out of browser
  chrome must survive it (that was Root 1 of the correctness audit).
- [x] **Found the real cost, and it was not the sweeps: `anchorToTop` at ~3s a call.**
  Instrumented every sweep with timing and round-trip counts before optimising, which was the
  right call because the intuition was wrong. All six structural sweeps together cost **1.7s**
  across 18 round trips at ~95ms each. The phase around them cost 4.7s. The difference was
  `anchorToTop` -- two `nvda.press` calls at roughly 1.3s each plus a 400ms settle -- and it
  ran twice per capture, so ~6s of a 13.4s capture.

  The one before the structural sweep is redundant by construction: `collectByType` sweeps
  BOTH directions precisely so it reaches every element regardless of the starting position,
  which is the job the anchor was doing. Removed. A/B on the same page, same config, one
  worker changed and one untouched as a control:

  | | wall | first sweep |
  |---|---|---|
  | anchor present (control) | 17.1s | 4.7s |
  | anchor removed | 13.5s | 2.0s |

  **21% faster, identical output (12 phrases both).** capture-check green on all 7 pages
  including probe values.

  It also surfaced a dedup flaw worth keeping. Reaching an element from a different direction
  makes NVDA prefix the container it just entered -- `"main landmark, Children's story time,
  heading, level 3"` versus `"Children's story time, heading, level 3"` -- and the raw prefix
  key treated those as two elements, so heading and landmark counts went 4 -> 5. Harmless to
  the assertions, but noise in the evidence. Dedup now strips a leading container prefix, and
  the counts are back to 4/4.

- [ ] **Halve the structural sweep's round trips.** Much less attractive now that the sweeps
  are measured at 1.7s of a ~13s capture. The remaining `anchorToTop` (after the readiness
  gate, ~3s) is the biggest single item left, and it is NOT removable the same way: it is what
  puts the first line back as the last-spoken phrase, without which the read-through captures
  the document title instead of the h1. Each step is two calls: `perform(move)`
  then `lastSpokenPhrase()`. Issuing several moves and reading `spokenPhraseLog()` once would
  roughly halve them on the largest remaining phase. The catch is the no-movement guard, which
  is per-step today and is what stops phantom elements being recorded — a batched version has
  to detect "the cursor stopped moving" from the log instead. Untried.
- [ ] **Update the virtio-win guest drivers.** `viogpudo.sys` is from a 22.7 package
  (`Red Hat VirtIO GPU DOD controller v22.7.38.43`) and is the named cause of the only crash
  we have seen. Cheap to try, and it is remediation rather than mitigation.
- [ ] **Or change the VM's display device.** The VM runs `-device virtio-ramfb`; a different
  backend may not load `viogpudo` at all. Worth testing against the driver update, since
  whichever works is the one to codify in `create-utm-vm.sh`.
- [ ] **Trim the readiness gate (~1.4s of 4.5s).** Check `lastSpokenPhrase()` after anchoring
  and only issue the `reportTitle` round trip when it comes back blank — cheap on the happy
  path, full diagnostic on the failure path. Deliberately not done: it weakens
  `documentReady.title` on the happy path, and this gate is what took the flake rate from 25%
  to ~3%. Revisit only if the gate stops being load-bearing.
- [ ] **A second worker VM.** One worker is one capture at a time by design; scaling is
  horizontal (ADR 0001) and the host has headroom. Needs a dispatcher across a pool, which
  nothing implements. Deliberately after the per-capture work: parallelism multiplies whatever
  the per-capture cost is.
- [ ] **Multiple NVDA instances on one machine, if we ever want it.** Blocked by our own
  tooling, not by NVDA: NVDA's single-instance guard is a per-desktop mutex
  (`Local\NVDA_{desktopName}`) and its Remote Access port is configurable, but guidepup
  hardcodes `NVDA_PORT = 6837` with no way to select an instance. One constant to plumb
  through, plus an upstream PR. **Verify multiple interactive Windows sessions actually work
  on the worker before touching guidepup** — that is the load-bearing unknown, and in-session
  parallelism is impossible regardless because a session has one foreground window.
- [ ] **Chase the truncated read.** `icon-button-unnamed-menu`'s good page announces
  `"button, O"` where its two siblings announce their full `aria-label`, and it reproduced
  across runs, so it is deterministic rather than flaky. Both the transcript and the structural
  sweep saw `"O"`, so the accessible name really was that at query time. Harmless today — no
  other case shows it — but a transcript silently losing most of an announcement matters
  everywhere.
- [ ] **Pin an NVDA settings profile** (symbol level, element-reporting toggles, "Report live
  regions", auto-focus-mode) for cross-version reproducibility. Pre-existing backlog item from
  the correctness audit; announcement strings are version- and settings-specific, and we now
  have two runs where the same page was announced two different ways.

### Capture efficiency (written, staged, not yet validated on the VM)

Measured: 50s per capture, of which only 13s is work (`readThrough` + `structural`).

- [x] **Deployed and validated** persistent NVDA (recycled every 25, `A11Y_REUSE_NVDA=0` to
  revert), the Edge-window poll replacing the fixed 12s sleep, the conditional startup
  settle, and per-capture speech-log clearing. Validate with `capture-check` **plus** the
  disclosure and form probes by value, then benchmark with `packages/lab/scripts/bench-capture.mjs`.
  **Measured on the worker: 28.8s -> 13.3s per capture**, with identical output (3 phrases on
  every run, before and after). `windowsActivate` 13.3s -> 1.5s, `nvdaStart` 2.1s -> 0.5s
  (reused on 3 of 4 captures), `afterStart` 3s -> 0s. `capture-check` passes all 7 pages
  including the value assertions -- `disclosure-good` reaches `expanded`, `disclosure-bad`
  stays `collapsed` -- so the reuse does not leak state between captures.

  Note the baseline: 28.8s, not the 50s measured during the dataset run. The 50s was a
  machine degraded by accumulating Edge processes and background updates, which is its own
  argument for the policy fixes above. The new readiness gate costs 4.5s of the remaining
  13.3s and is the obvious next target, but it is the gate that removed a 25% flake rate, so
  it earns its keep for now.
- [x] **Elements List (`NVDA+F7`) — analysed and DECLINED, with a measured detour.**
  The audit backlog proposed it as a cleaner replacement for repeated quick-nav. On
  inspection it is a poor trade: the form-field sweep does not merely enumerate, it drives the
  disclosure and form-submit probes **in place** on each control, and inside a modal Elements
  List dialog you cannot activate a control where it stands. Adopting it would mean
  re-architecting the two probes that took the most validation effort to get right, in exchange
  for maybe 1-2s on read-only heading/landmark enumeration, via version-sensitive modal UI.

  While looking at it I found what seemed a safer win in the same place: the sweep runs BOTH
  directions per type, with a comment explaining that Guidepup has no "move to top" -- which is
  no longer true, since `anchorToTop()` runs immediately before it. Anchoring per type and
  sweeping forward only should have been cheaper and more deterministic. Measured, it was
  **worse**: `structural` 4.8s -> 11.7s, and one capture dropped from 12 phrases to 2.
  `anchorToTop` (Escape + Ctrl+Home + a 400ms settle) costs more than the single cheap
  backward probe it replaced, and I did three of them. Reverted; baseline confirmed restored at
  4.8s and 12/12/12 phrases.

  Left alone deliberately. The remaining costs are `structural` 4.8s and the readiness gate
  4.5s, and both are earning their keep.

- [x] **Second worker VM: measured 1.90x on real cases.** Same 10 mixed-family cases, same
  starting point, one worker then two:

  | | wall | per case | notes |
  |---|---|---|---|
  | 1 worker  | 318s | 31.8s | |
  | 2 workers | 167s | 16.7s wall (33.4s per worker) | **1.90x** |

  Only **5% per-case degradation** under contention, which is much better than the naive
  concurrent test suggested (that one had both workers capturing the SAME page simultaneously
  — maximally contended; a real run offsets them). Zero failures either way, the queue
  balanced 5 cases each, and fidelity is IDENTICAL on the files present in both runs: 62
  phrases, 51 role words (82%), 22 heading-levels. Signals still discriminate 10/10.

  Extrapolated to the current 836-case matrix: **7.4h serial -> 3.9h on two workers.**

  Cost: **4 GB per VM**, which is the documented Windows 11 minimum and measured sufficient.
  I had claimed 6 GB was the floor, reasoning from an 8 GB guest reporting "3.5 GB in use" --
  wrong metric. That figure includes Windows' file cache, which grows to fill whatever it is
  given, so it says nothing about demand. Tested directly instead: the same 10 cases on 4 GB
  VMs took **165s against 167s on 8 GB**, evidence byte-identical (62 phrases, 51 role words,
  22 heading-levels), and **zero pagefile use** on either guest, so the result is not being
  faked by paging. Combined host footprint fell from ~10 GB to **3.0 GB**.

  So four workers is ~16 GB of a 36 GB host, not the ~24 GB I projected.

- [x] **2 vCPU per worker: no cost at all.** Same 10 cases on a two-worker pool, 4 vCPU each
  then 2 vCPU each: **165s vs 166s**, evidence identical. A capture is not CPU-bound any more
  than it is memory-bound -- it spends its time waiting on NVDA round trips. 2 vCPU is now the
  default, which halves the core budget per worker.

- [x] **Third worker: 2.36x, and the returns have started to bend.** Same 10 cases:

  | workers | wall | speedup | per-worker per-case | efficiency |
  |---|---|---|---|---|
  | 1 | 318s | 1.00x | 31.8s | 100% |
  | 2 | 165s | 1.93x | 33.0s | 96% |
  | 3 | 135s | 2.36x | 40.5s | 79% |

  Evidence identical at every step. The third worker costs 23% per-case efficiency where the
  second cost 4%, and the queue distributed 5/4/4 cases -- with only 10 cases the tail is
  lumpy, so some of the loss is granularity rather than contention.

  **Later finding: the 23% was host memory, and it gets worse than this table shows.** A worker
  VM costs the host ~7 GB, not its configured 4096 MB, so three is ~21 GB on a 36 GB machine.
  Measured again on a busier host, the same page on the same worker took 44.5s with three guests
  up against 27.4s with one, and the over-committed guests also produced mute-NVDA failures --
  so the third worker was costing reliability, not just efficiency. The pool now sizes itself
  from available memory (`A11Y_MAX_WORKERS` overrides), which on that host allows two.

  **836-case run: 7.4h -> 3.8h -> 3.1h.**

  Host cost of three: **69% of 1400% CPU and 2.3 GB of 36 GB**. Neither is the limit, which
  says the bottleneck is inside the guest -- NVDA and Edge serialising per capture -- not the
  host. That is why per-case time rises while the host stays idle, and why a fourth worker is
  worth trying but unlikely to be linear.

### tiny11 / a debloated Windows image — assessed, NOT recommended now

Proposal: build a stripped Windows 11 image (tiny11builder) to run workers on 2 GB and go
faster. Assessed against the facts rather than the pitch.

**The premise is already satisfied without it.** Stock Windows 11 runs this workload at 2 GB:
the same 10 cases on three 2 GB workers took **142s against 135s at 4 GB**, with **zero
pagefile use on all three guests** and byte-identical evidence. So 2 GB is not something a
custom image is needed to unlock.

**And memory was never the bottleneck.** Measured, at three workers: 69% of 1400% host CPU
and a couple of GB resident. Per-case time rises with worker count (31.8s -> 33.0s -> 40.5s)
while the host stays idle, which places the constraint inside each guest -- NVDA and Edge
serialising one capture at a time -- where an image diet does not reach.

**What it would cost us:**
- **tiny11 removes Microsoft Edge.** We drive Edge specifically: a chromeless `--app` window
  is what keeps NVDA's quick-nav out of browser chrome (Root 1 of the correctness audit), and
  provisioning sets Edge policies. Reinstalling Edge into a debloated image is possible but it
  is the one component the pipeline cannot do without, and it is the component the image
  deliberately strips.
- `tiny11core` additionally removes Windows Update, Defender and WinRE. Tempting for an
  appliance -- we spent real effort stopping Update rebooting mid-run -- but it is explicitly
  **unserviceable**: no updates, languages or features can be added afterwards.
- ARM64 is supported, with a known quirk (the arm64 image has no `OneDriveSetup.exe`, so the
  script errors on that step).
- It is a second image pipeline to build, validate and keep current, and every worker would
  need re-provisioning and re-validating against `capture-check`.

**Where it would genuinely help, neither of which binds today:** disk, at ~28 GB per bundle if
we ever want many workers per host (though APFS cloning makes copies nearly free), and boot
time, which is 15s and not on any critical path.

- [x] **Ran the cheap version, and it closes the line of enquiry.** Disabled Defender
  real-time scanning, the search indexer (WSearch) and SysMain on all three workers -- the
  background work a debloated image removes -- and re-ran the same 10 cases:
  **137s against 135s with them all running.** No improvement, within noise. Evidence
  identical. Reverted, since it bought nothing and an unreverted experiment is a liability.

  So image weight is not the constraint, and a customised tiny11 that kept Edge could not help
  either. It is worth being precise about what this rules out: not that tiny11 works, but that
  the thing it does cannot buy us time.

  Per-phase, with the services off: structural 4.7s, afterStart 3.0s, windowsActivate 2.2s,
  readThrough 1.5s, documentReady 0.7s, wall 12.4s. Every item is NVDA round trips and fixed
  settles. **The only lever left inside a capture is making fewer round trips** -- the batched
  sweep already in this backlog -- and beyond that, more workers.

- [ ] **A fourth worker.** Cheap to test now (clone-worker.sh, ~4 GB, 2 vCPU). Expect ~2.7x
  rather than 3.2x on this trend. Worth it only if 3.1h is still too slow, since each worker
  adds a Windows guest to keep patched and provisioned.

- [ ] **Then** consider a second worker VM (~5 GB, host has headroom). Needs a dispatcher
  across a pool, which nothing implements yet. Deliberately after the above: parallelism
  multiplies whatever the per-capture cost is.

## Worker reliability pass (2026-07-28)

Three workers looked intermittently broken all day. Almost all of it was one thing.

**Root cause: the first capture after a VM boots fails `nvda.start`; every one after it works.**
Windows is still settling after auto-logon. Because whichever VM had been up longest worked, the
fault appeared to move between guests, and it was successively misdiagnosed as a bad clone, a stub
NVDA install, and a wedged worker. Fixed by retrying the start once after 8 s.

Found while chasing it:

- **Failed captures leaked Edge.** No `try/finally` around the capture, so a thrown `nvda.start`
  skipped cleanup. Eight orphaned `msedge` processes were measured on one 4 GB guest — which is
  the load that makes the *next* start time out. Failures compounded. Cleanup is unconditional now.
- **A dropped NVDA speech channel killed the worker.** It arrives as an async unhandled rejection
  and the handler exited(1), trusting the scheduled task to restart a clean worker. It does not:
  a worker sat dead for three minutes with `RestartCount 5` set. It now forgets the stale NVDA and
  keeps serving.
- **Deploy verification was blind.** `utmctl exec` returns success and no output whether or not it
  ran, and the hash check meant to catch a stale deploy *also* went through `exec` — so it returned
  empty, not mismatched, and two workers served old code for an hour. Workers now report a code
  hash on `/health`; `npm run worker:code` compares it and shares no failure mode with the deploy.

### Open

- **`tableCells` — the delta fix is in, verification pending.** 18 captures of one unchanged page
  returned 4, 2, 4, 4, 1, 4, 4 cells. `walkTable` now reads a `spokenPhraseLog` delta instead of
  `lastSpokenPhrase`, which was the wrong read all along: a single sample returns the *previous*
  phrase when the announcement has not landed (indistinguishable from "did not move") or nothing
  (which the walk took for the end of the table). Priming, silence tolerance and the settle were all
  compensating for that. Confirm with `npm run training:repeat -- --times=5 --probe-tables` before
  trusting it; until that passes it stays opt-in and out of the dataset.

- **Worker stability: root-caused and fixed.** The chain, end to end: my warm-up retried on every
  `/health` poll → each attempt restarts NVDA → NVDA raises a modal dialog on the guest desktop
  (`nvdaHelperRemote (injection_terminate)`) → the dialog blocks input → the next capture HANGS →
  `busy` is never released → every later request gets 429 → the worker looks dead. One guest took
  QEMU down with it. Two fixes: warm once at boot and never touch NVDA while idle, and a hard capture
  timeout as the backstop.

  **The wedge fix is proven end to end**, not merely deployed. With the timeout forced to 8 s via
  `A11Y_CAPTURE_HARD_TIMEOUT_MS`, a ~13 s capture was abandoned
  (`capture exceeded the hard timeout of 8000 ms`), health immediately reported `busy=false
  ready=true`, and the NEXT capture was accepted rather than refused with 429. The override was
  reverted and a normal capture confirmed at 9 phrases.

  **Root-caused (2026-08-01).** A guest sat wedged in UTM state `stopping` with a QEMU process that
  had been alive for over a day and would not respond to `utmctl stop`. `kill -9` on that process
  cleared it and the VM came back READY in 45 s. UTM surfaces the hard kill as
  `QEMU exited from an error: Unknown`, which is cosmetic -- utmctl stayed responsive, the other VMs
  kept serving, and an in-flight run kept capturing throughout. So the dialog is a SYMPTOM of a
  killed process, not a fault in itself, and the real failure is a QEMU process outliving its VM.
  Check `ps -o etime` on the qemu process before believing UTM's state.

  Still unexplained: worker-3's earlier `QEMU exited from an error`. It happened while the restart loop was
  running, so the loop is the obvious suspect, but that is inference — it has not recurred since.
- **Empty-capture flake (~1–3%).** A capture occasionally returns 0 phrases (the documented
  ForegroundLockTimeout/foreground symptom). It is *contained*, not fixed: `captureMentionsTitle`
  rejects it and the dataset retries 3x then writes it to `captures/rejected` rather than
  recording nothing as something — verified on a real pooled run (78 captured, 1 rejected of 79).
- Nine screen-reader behaviours are still not driven at all; see `docs/screenreader-coverage.md`.
  The highest-value are status messages/live regions (4.1.3), dialogs and focus return, and
  arrow-key widgets.

## Worker scaling, measured properly (2026-07-30)

The question was whether more workers help, and whether a 2 GB guest lets us run more of them.

**Method matters here, and my first attempt was wrong.** Single timed runs gave 214 s and then 145 s for
the *same* six-worker configuration — a 48% swing — so every conclusion drawn from single runs was
noise, including "2 GB is 22% slower" and "the curve turns over at six workers". Both withdrawn.

The cause was specific rather than inherent: a **freshly cloned VM is still settling**, and I measured
immediately after adding one every time. With a settled pool, three runs of one configuration agree to
±4%. Benchmark a settled pool, or do not bother.

Alternating 3-worker and 6-worker runs, three each, 25 cases (50 captures) per run, all clean:

| pool | runs | median | per case | spread |
|---|---|---|---|---|
| 3 workers | 223, 232, 224 s | **224 s** | 9.0 s | 4% |
| 6 workers | 133, 138, 168 s | **138 s** | 5.5 s | 25% |

**Six workers is 1.62x three** — a full 1,061-pair recapture drops from ~2.6 h to ~1.6 h. More workers
also means more variance (25% vs 4%), since one slow guest drags a run.

**2 GB is not the lever, and the tiny11 premise is dead twice over.** The earlier "2 GB is free"
measurement predates the graphics/links/lists sweeps, so it no longer describes this capture; the one
re-test suggested 2 GB was slower, but it was a single run and is not trustworthy either. What IS clear
is that host RSS did not track configured guest RAM at all (10.4 GB for three 2 GB guests, 10.7 GB for
four 4 GB guests), so RAM is not what constrains worker count. A slim image can only help with something
that is not binding.

**Workers 4-6 were deleted after measuring**, on the reasoning that ~1 h saved per full recapture does
not pay for three more Windows guests to patch, provision and keep in sync — and full recaptures are now
rare because the cache makes incremental runs nearly free. Re-clone with
`scripts/local-worker/clone-worker.sh` if a big run is coming: the numbers above say what it buys.

## Milestones

### M0 — Spike: is the core bet real? (now)

Prove that an AI model can judge the real screen-reader experience trustworthily, then prove we can capture that experience from a real screen reader.

**Capture half — proven on Windows/NVDA.**

VoiceOver capture was deferred: macOS AppleScript automation is fragile and deprecating (`-1708`), and VoiceOver cannot be containerised or run by contributors. Capture moved to NVDA on Windows, the most representative and most reliably automatable target. See `docs/adr/0001-capture-architecture.md`.

- [x] NVDA capture running on a Proxmox Windows VM via Guidepup, in an interactive session, driven remotely. `packages/lab/src/capture/nvda/`
- [x] Real browse-mode read-through of a real page, producing a faithful transcript that audibly contains the page's actual defects (unlabelled graphics, "Click here" links, unmarked headings). Fixture: `src/spike/fixtures/nvda-w3c-bad-before.json`
- [x] End-to-end: capture (Windows) piped to the Codex judge (control plane) yields a grounded, hallucination-free verdict. `src/spike/judge-file.ts`
- [ ] Productionise the worker as the `POST /capture` HTTP service behind `packages/lab/src/capture/backend.ts` (currently a scheduled-task recipe).

**Judge half — works end-to-end; recall now strong, calibration next.**

- [x] Produces WCAG-cited, confidence-scored verdicts, grounded in the verified WCAG 2.2 A/AA criteria and citing only from that list. `src/spike/judge.ts`, `src/wcag/criteria.ts` (validated against the W3C spec)
- [x] On the short planted sample, catches the defects and avoids false positives. `src/spike/judge-sample.ts`
- [x] **Recall fixed via a two-stage judge:** an exhaustive recall pass (task-independent) then a keep-biased grounding/verification pass. On the 79-line real capture this went from 1 finding to 8 distinct, correctly-cited ones (1.1.1, 1.3.1, 1.4.5, and four 2.4.4 link-purpose issues), with no regression on the planted sample.
- [x] **Eval suite** scoring the judge against authoritative ground truth (W3C BAD before/after reports, a chrome-free conformant reference page from W3C WAI, and a planted sample), with an automatic scorer that reports recall on failure cases and false-positive counts on conformant ones. `packages/lab/src/eval/`, `npm run eval`.
- [x] **Recall 100%** on observable failures (before + planted) with **0 false positives** there. Fixed a `1.3.1` over-flag (no heading-level-skip flags; requires plain-text-title evidence).
- [x] **Consensus mode** (`JUDGE_CONSENSUS=N`): judge N times, keep only findings recurring in a majority, to cut run-to-run noise. Opt-in (N x cost).
- [x] **Resolved a conformant-page false positive by research, not punting.** The WAI "Change Text Size or Colors" finding was verified against W3C's own source markup (a correct `<a>` with descriptive text), confirmed a false positive, root-caused to the role-less skip-link nav at the top of the read, and fixed with a judge guard (descriptive text IS a name; reserve 4.1.2 for role-only-no-name).
- [x] **Cleaned the "after" fixture** (stripped the W3C demo switcher chrome) and **added the W3C BAD survey page** as a form-heavy failure case. Recall is now 100% across all three failure cases, including unlabelled form controls (`4.1.2`) the home pages did not exercise.
- [x] **Quantified consensus; not defaulting it.** `JUDGE_CONSENSUS=3` suppresses *flaky* false positives (varying criterion run to run) but NOT *stable* ones, and costs N x. The one surviving conformant-page FP (WAI) is stable, so consensus does not fix it and is not worth forcing on every run. Consensus stays opt-in as a reproducibility/precision lever.
- [x] **Fixed a wrap-around capture bug.** NVDA "read next" looped back to the top of long pages, duplicating ~36% of the WAI transcript (150 -> 88 phrases after the fix). Cheaper, cleaner captures. `packages/lab/src/capture/nvda/capture-core.mjs`.
- [x] **Methodology audit + contamination test.** `docs/METHODOLOGY.md` audits our LLM-as-judge usage against established practice and recalibrates the headline numbers as preliminary. A fresh, never-published authored page (`packages/lab/src/eval/pages/contamination-test.html`) scored 4/4 recall with 0 false positives, which is evidence that recall is genuine judging rather than memorization, and is also our first held-out case. The biggest remaining gap is an expert-labeled human-agreement baseline.
- [x] **Grounded in primary W3C material.** Criteria are version-tagged (2.0/2.1/2.2, parsed from each spec) so findings can be reported against WCAG 2.1 AA (the legal baseline, e.g. EN 301 549) as well as 2.2 AA. The observable-subset scoping is validated against W3C's POUR principles, and the tool is positioned against ATAG (a Part B tool whose own outputs must meet Part A). See `docs/METHODOLOGY.md`.
- [ ] **Remaining conformant FP is a known, proven, low-confidence (~0.66) artifact**, not a judge logic gap: NVDA announces the top-of-page skip-link/controls region as role-less text (e.g. "Change Text Size or Colors"), which the judge reads as a possibly-unexposed control even though the source is a correct link. Real fixes: capture-side skip-link handling, or cross-check a flagged control against the page DOM before reporting (a tool feature, not more prompt patching). Confidence-tiering the report (surface <0.7 as "needs human check") would also neutralize it.
- [x] **W3C tutorial baseline (all 6 topics).** 12 paired good/bad pages authored fresh from the W3C WAI tutorials (images, forms, page structure, tables, menus, carousels) with W3C-derived ground truth: `packages/lab/src/eval/pages/tutorials/`. Good pages score 0 findings; bad pages are caught in every topic (100% recall, 0 false positives). It surfaced (and then fixed, via a generalising hint) a real recall gap on missing table-header association. Carousels test only the observable subset; their motion/keyboard/focus issues are documented as out of scope for a passive read. Authoritative, contamination-resistant, held-out.
- [ ] Grow the eval set further (MDPI LLM-auditing dataset, public-sector accessibility statements, ACT Rules cases).

**Acceptance:** on real pages, the judgment is credible AND reasonably complete, and a human can verify each finding from the transcript. The capture clears this bar; the judge's recall does not yet.

### M1 — v1 open-source tool

- [ ] CLI: `a11y-witness <url> --task "..."` produces an evidence-backed report (findings, WCAG references, confidence).
- [ ] Real navigation as reusable strategies: read-through, by-heading, by-landmark, forms, task completion.
- [ ] Portable control plane (container) that dispatches to capture workers and runs the judge. Judge made provider-pluggable (Codex CLI / OpenAI / Anthropic / local) so others are not tied to one account.
- [ ] Make the NVDA worker reproducible and usable by others (per ADR 0001): a one-command PowerShell bootstrap for any Windows box, and a GitHub Actions `windows-latest` job so contributors run the full pipeline with zero infra.
- [ ] Repo polish: examples, contribution guide, basic CI (typecheck and lint).
- [ ] **Installable, independently versioned packages** so adoption is per-module
  rather than all-or-nothing and consumers can pin what they trust: ADRs 0004–0008
  and the M0–M9 migration order above. This is the other half of ADR 0003's
  distribution story — the Action serves CI; packages serve everyone else.
- [ ] First launch artifact / blog post (this is the content roadmap's first concrete deliverable).

### M2 — Trust layer (the moat)

- [ ] Calibrated confidence and reproducible runs.
- [ ] Human-in-the-loop review and confirmation workflow.
- [ ] Provenance: every finding linked to the exact announced evidence and WCAG criterion.

### M3 — Coverage and the development workflow

NVDA on Windows is the primary backend, proven in M0 and productionised in M1. M3 broadens coverage behind the same `CaptureBackend` interface.

- [ ] A scalable worker fleet: Packer image + Terraform (Proxmox and cloud), with job dispatch across a pool of workers.
- [ ] VoiceOver support (macOS), for Mac and iOS user coverage. Requires a Mac in the pool; AppleScript automation is fragile, so budget for it.
- [ ] JAWS support (Windows; commercial, hardest to automate, deliberate fast-follow). Known gap.
- [ ] Orca support (Linux), as an optional fully-portable local dev and CI tier.
- [ ] Multi-step flow automation (Playwright driving the page, the screen reader driving assistive tech).
- [ ] CI integration: run in a pipeline and catch accessibility regressions, including inaccessible AI-generated UI, before merge.

### M4 — Launch and standing

- [ ] Run across notable sites and publish an assistive-technology readiness report.
- [ ] Conference talk; engagement with the W3C accessibility community.
- [ ] Later: hosted cloud and enterprise features on top of the open core.

## Known risks

- **Trustworthiness of AI judgment.** The make-or-break. M0 decides it.
- **JAWS automation difficulty.** Commercial and awkward to drive; budget time for it.
- **Representative coverage.** Most desktop screen-reader users are on Windows (NVDA and JAWS), so we lead with NVDA. VoiceOver (Mac and iOS) and Orca (Linux) follow behind the same interface; broad coverage is required for credibility, not optional.
- **The default judge backend does not run from a clean checkout.**
  `scripts/score-screenreader-model.py` is absent from `main` (verified: `git cat-file
  -e main:scripts/score-screenreader-model.py` fails) yet is the documented default in
  `local-judge.ts` and behind three npm scripts. It survives only in unreachable
  `kanban checkpoint` commits. Anyone cloning this repo cannot run the local judge,
  and `@a11y-witness/scorer` cannot be built until it is restored. See M0.
- **AGPL on published libraries will deter some adopters**, which pulls directly
  against the adoption goal. ADR 0006 resolves it by keeping the engine AGPL and
  licensing the contracts package Apache-2.0, so third-party capture backends are
  legally writable. That split is effectively irreversible and needs an explicit
  sign-off before the first publish.
- **Packaging can silently change the evidence.** Moving the worker touches
  `action.yml`'s hardcoded server path and the hashed-file list that
  `deploy-worker.mjs` and `check-worker-code.mjs` share — the mechanism that once had
  two guests serving stale code for an hour. `evidence:check` reporting SAME is the
  gate; a CHANGED result costs a 2,122-capture recapture.
- **Capture is OS-bound.** No single portable container runs the whole product; capture workers live where the operating system allows (Windows for NVDA, a Mac for VoiceOver). The portable core hides this from users, but it shapes the infrastructure. See ADR 0001.
