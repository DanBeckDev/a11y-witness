# a11y-witness

[![lint](https://github.com/DanBeckDev/a11y-witness/actions/workflows/lint.yml/badge.svg)](https://github.com/DanBeckDev/a11y-witness/actions/workflows/lint.yml)
[![capture-regression](https://github.com/DanBeckDev/a11y-witness/actions/workflows/capture-regression.yml/badge.svg)](https://github.com/DanBeckDev/a11y-witness/actions/workflows/capture-regression.yml)
[![licence: AGPL-3.0-or-later](https://img.shields.io/badge/licence-AGPL--3.0--or--later-blue)](./LICENSE)

**a11y-witness drives a real screen reader through a web page and has an AI judge assess whether the experience was actually usable.** Every finding cites a WCAG criterion and quotes the announcement it rests on, so you can check it yourself.

It is three things: a testing pipeline, the reproducible screen-reader infrastructure that makes it runnable by anyone, and an accessibility model of our own being trained on the evidence the first two produce.

It is not a rule scanner, and it is not a wrapper around one. Rule engines automate the mechanical layer well — Deque reports [axe-core](https://github.com/dequelabs/axe-core) finds about 57% of WCAG issues automatically and flags the rest for human review. That remainder is largely the **lived experience**: whether what a screen reader announces, as someone reads and operates the page, adds up to something a person can use. Automating that judgment is what this project is for.

## What it produces

A real run against `https://example.com`:

```
a11y-witness report
===================
URL:   https://example.com
Task:  Read and understand this page

-- Rule-based layer (axe-core): contrast, colour, ARIA, parsing --
0 violation(s):

-- Lived-experience layer (NVDA + AI judge): 4 announcements --
Task completable: yes (overall confidence 0.96)
The screen-reader user can read and understand the page, though the "Learn more" link has unclear purpose.
1 finding(s):
  Navigate — can the user move through the page?
    [MODERATE] 2.4.4 Link Purpose (In Context) (A)  (confidence 0.94)
       The link text "Learn more" does not clearly convey its destination or purpose in context.
       evidence: 4. link, Learn more
```

The `evidence` line is the point. Findings are grounded in a transcript of what NVDA actually said, so a human can confirm or reject each one. Here is a real transcript pair from the fixture suite — the same page with and without alternative text:

```jsonc
// good
["heading, level 1, Project update",
 "The garden project added a shaded seating area.",
 "graphic, A shaded seating area beside the community garden"]

// bad — the illustration has no alternative text
["heading, level 1, Project update",
 "The garden project added a shaded seating area.",
 "graphic, To get missing image descriptions, open the context menu."]
```

Findings are ordered along the screen-reader experience waterfall — **Perceive → Navigate → Interact** (Firth, *Practical Web Accessibility*) — so barriers that stop someone perceiving content come before ones that stop them operating it.

## Three parts

The project is three pieces of work, each useful on its own:

| | what it is | state |
|---|---|---|
| **1. The testing pipeline** | Drive a real screen reader through real navigation, judge the transcript, report WCAG-cited findings alongside axe-core. | **Working end to end** |
| **2. Reproducible screen-reader infrastructure** | Screen readers are OS-bound desktop apps that cannot be containerised. Getting NVDA running, unattended and repeatably, is a genuine engineering problem — so it is solved as a first-class part rather than a prerequisite chore. | **Working**: scripted VM build, one-command Windows bootstrap, CI path |
| **3. An accessibility model of our own** | A model that judges screen-reader evidence against WCAG criteria, trained on paired captures the other two parts produce. | **In development** — dataset being collected, nothing trained yet |

They compound. Part 2 makes part 1 reproducible by anyone; parts 1 and 2 together generate the labelled evidence that part 3 needs, which no public dataset provides — because the training signal here is *what a screen reader announced*, not HTML.

## What it does not do

- **It does not tab through the page and call that a screen-reader test.** Tabbing reaches interactive controls only; it skips how screen-reader users actually read and explore. Modelling real navigation — browse mode, jumping by heading and landmark, operating controls — is the whole point.
- **It does not judge what a screen reader cannot perceive.** Contrast, colour and target size come from the rule-based layer. We do not reimplement those rules or pretend to see them.
- **It is not a compliance certificate.** It produces evidence and cited, confidence-scored findings for a human to act on. Overlay vendors lost the market — and drew an FTC fine — by over-claiming, and [`docs/METHODOLOGY.md`](./docs/METHODOLOGY.md) is an honest audit of where our own evaluation is and is not validated.
- **It does not claim to reproduce what it is like to be blind.** It reports the screen-reader navigation experience judged against success criteria. Disability-simulation framing misleads, and screen-reader users themselves navigate in divergent ways.
- **Where neither layer can decide, it says so.** Whether alt text is *accurate* rather than merely present, or whether a reading order is *meaningful*, goes to a human — the way axe flags "incomplete". We do not silently claim coverage we do not have.

## Part 1: the testing pipeline

Capture is operating-system-bound, so it is split from everything else:

```
  your machine (any OS)                         Windows worker
 ┌──────────────────────────┐                 ┌────────────────────────────┐
 │ witness CLI              │  POST /capture  │ NVDA + Edge                │
 │  ├─ axe-core (Playwright)│ ──────────────► │  browse-mode read-through  │
 │  └─ AI judge             │ ◄────────────── │  heading/landmark quick-nav│
 │      rules + gate        │   transcript    │  operate controls          │
 └──────────────────────────┘                 └────────────────────────────┘
```

- **Capture worker** (Windows): drives **NVDA** via [Guidepup](https://github.com/guidepup/guidepup) through real navigation and returns the announcement transcript over HTTP. Speech is read over NVDA's Remote Access channel, not audio, so the machine needs no sound device. See [`src/capture/nvda/`](./src/capture/nvda/).
- **Control plane** (anywhere): the `witness` CLI runs axe-core and the capture concurrently, then judges the transcript and prints a two-layer report. Architecture rationale: [`docs/adr/0001-capture-architecture.md`](./docs/adr/0001-capture-architecture.md) and [`0002-layered-coverage.md`](./docs/adr/0002-layered-coverage.md).

### The judge is a hybrid

No single model handles every WCAG criterion well, so a generative pass drafts findings from the transcript and two layers refine them:

- **Deterministic rules** (always on, [`src/spike/rules.ts`](./src/spike/rules.ts)) own the *absence-of-name* criteria — an image announced with no alternative text (1.1.1), a control announced as a bare role with no accessible name (4.1.2). These are facts, not judgement calls, so a rule catches them exactly, for free, with no false positives.
- **A discriminative gate** (opt-in, [`src/spike/verify-gate.ts`](./src/spike/verify-gate.ts)) re-scores the *semantic* findings — vague link text (2.4.4), non-descriptive headings (2.4.6) — with a small encoder (DeBERTa-v3 NLI, ONNX) via [transformers.js](https://github.com/huggingface/transformers.js). A discriminative model *scores* a candidate rather than *generating* one, so it cannot invent a finding, which removes the over-flagging small generative models show on clean pages.

The model call itself is one seam (`ask()` in [`src/spike/judge.ts`](./src/spike/judge.ts)):

| `JUDGE_BACKEND` | needs | notes |
|---|---|---|
| `codex` (default) | local Codex login | no metered API cost |
| `anthropic` | `ANTHROPIC_API_KEY` | optional `JUDGE_MODEL` |
| `openai` | `JUDGE_BASE_URL` | hosted OpenAI **or** any local engine (llama.cpp, vLLM, Ollama, LM Studio) |

The `openai` backend makes a self-hosted, zero-cost judge realistic. Measured against a local **Qwen3.6-27B (Q4)** on the W3C subset: it caught the high-signal criteria and produced no false positives on the clean reference page — the main risk with a small model — missing only the most judgment-heavy criterion (1.4.5). That was a subset, not the full suite, and not the interaction cases; see [`PLAN.md`](./PLAN.md) for the caveats.

## Quickstart

Prerequisites: Node 20+, a judge backend (Codex logged in by default — `codex login`), and a capture worker.

```bash
npm install
npm run witness -- https://example.com --task "Find the contact details"
```

Add `--json` for machine-readable output and `--debug` for per-phase capture diagnostics.

To test how a page *behaves* when operated, add `--probe-forms`: the worker submits the form with no valid input and records what is announced, catching forms that fail silently — the error shown visually and never announced (3.3.1 Error Identification, 4.1.3 Status Messages). It is opt-in because activating a submit button has side effects. Disclosure controls are always activated, to check the expanded/collapsed change is announced at all (4.1.2).

## Part 2: getting a real screen reader to run, repeatably

This is not a footnote to the interesting work — it *is* some of the work. Screen readers are operating-system-bound desktop applications, not libraries. VoiceOver cannot be containerised at all; NVDA needs a full interactive Windows desktop, which Windows Server containers do not have. There is no Docker image that runs this product. The reproducible form of NVDA is a **Windows VM**, and a hand-tuned pet VM is not reproducible, scalable or usable by anyone else. So the infrastructure is built and documented as a deliverable. Rationale: [`ADR 0001`](./docs/adr/0001-capture-architecture.md).

| you have | do this | what you get |
|---|---|---|
| a Mac | [`docs/local-worker-vm.md`](./docs/local-worker-vm.md) | A scripted Windows VM: ISO build, unattended install, auto-logon, NVDA provisioning, capture verified — no GUI clicking |
| a Windows box | [`scripts/bootstrap-windows-worker.ps1`](./scripts/bootstrap-windows-worker.ps1) | One idempotent script, then `A11Y_WORKER=http://host:8765` |
| neither | [`capture-regression.yml`](./.github/workflows/capture-regression.yml) | Real NVDA on a GitHub-hosted runner, so a contributor needs no infrastructure at all |

Because a Windows guest is never genuinely idle, the pipeline manages it **on demand**: with a local VM and no `A11Y_WORKER` set, a run starts it, captures, and **puts it back exactly as it found it** — stopped stays stopped, paused re-paused, and one you had already started is left running, so a run never shuts down a worker someone else is using. Cold start is 12–15 s. Override with `--after stop|pause|leave|restore`; naming a worker opts out entirely. Between runs, [`worker-ctl.sh`](./scripts/local-worker/worker-ctl.sh) does `up | pause | stop | status | idle-pause`.

When a worker breaks, the error messages lie — `"NVDA not installed"` usually means a version mismatch, not a missing install. [`docs/nvda-worker-runbook.md`](./docs/nvda-worker-runbook.md) maps error string to actual cause, and [`scripts/diagnose-nvda-worker.ps1`](./scripts/diagnose-nvda-worker.ps1) applies that table automatically across six layers.

## How we know it works

There are no unit tests; verification is layered, and each layer tests something the others cannot.

| command | what it checks |
|---|---|
| `npm run lint` / `npm run typecheck` | mechanical; both gate CI |
| `npm run eval` | judge quality against **34 labelled fixtures** — W3C tutorial pages and paired good/bad cases. Needs a local Codex login, so it cannot run in CI |
| `npm run rules-check` | the deterministic rules in isolation. Exits non-zero on **any** false positive against a conformant page — precision is the entire point of a rule |
| `node src/capture/nvda/capture-check.mjs` | the capture half, on the worker itself. Asserts probe *values*, not just that a probe fired — a check that only asserts "it ran" stays green while the evidence is garbage |
| `capture-regression.yml` | real NVDA on a GitHub-hosted Windows runner |

**On the numbers.** The suite currently reports full recall on the observable failure cases with a small number of false positives, concentrated in the subjective link-purpose (2.4.4) and descriptive-heading (2.4.6) criteria. Treat that as *promising, not validated*, and read [`docs/METHODOLOGY.md`](./docs/METHODOLOGY.md) before quoting it anywhere: the guards were iteratively tuned against these cases, scoring is single-run with no test-retest interval, and **there is no expert human-agreement baseline yet**. That document sets the bar for "trustworthy enough" *before* measuring against it, and lists what is still missing — deliberately, so the goalposts cannot move.

The strongest evidence so far is structural rather than a number: the judge sees the **transcript, not the page**, so it cannot recall a well-known page's documented issues — it has to point at something that was announced. A page authored fresh and never published ([`src/eval/pages/contamination-test.html`](./src/eval/pages/contamination-test.html)) was caught correctly on all four planted violation categories with no false positives on the correct controls, which is evidence that recall is genuine judging rather than memorisation. One page is not a suite.

## Repository map

| path | what lives there |
|---|---|
| `src/cli.ts` | the `witness` pipeline: capture → axe → judge → report |
| `src/capture/` | capture backend interface, the NVDA worker, local-VM lifecycle |
| `src/spike/` | the judge, deterministic rules, the discriminative gate, layering |
| `src/scan/` | axe-core via Playwright |
| `src/eval/` | labelled fixtures and the eval harness |
| `src/training/` | the dataset pipeline |
| `scripts/` | worker provisioning, diagnosis, and the scripted local VM |
| `docs/adr/` | why the architecture is the way it is |

## Part 3: the accessibility model we are building

A frontier model calling an API is the current engine, not the destination. The goal is **our own model of the screen-reader experience** — and the reason it can exist is that parts 1 and 2 manufacture something no public dataset contains: paired captures of *what a screen reader actually announced* on pages that differ by one deliberate accessibility defect.

**Nothing is trained yet.** What follows is the plan of record ([`docs/local-model.md`](./docs/local-model.md)), and the dataset is being collected now.

### Now: a scorer over captured evidence

Deliberately **not** a general-purpose language model. The project already produces a structured signal, so the useful model is a small **discriminative scorer** answering one question at a time:

> Does this captured evidence support WCAG 2.4.4 Link Purpose?

That model can *score* a candidate finding but cannot invent one, which is the property that matters: a generator that hallucinates a violation destroys the trust the whole project depends on. The division of labour stays as it is — deterministic rules keep the exact absence cases, the scorer takes the judgment calls, and the explanation is rendered from captured evidence and a fixed WCAG template.

It slots into the existing `applyGate` seam in [`src/spike/verify-gate.ts`](./src/spike/verify-gate.ts), so it can run as an opt-in gate alongside the current judge and be measured against it before it replaces anything. **The acceptance bar is pre-registered**: it may only replace a model-generated finding once it meets the holdout bar for that criterion with zero false positives on the clean paired pages. Until then it is an independently measured signal and the current judge remains the fallback.

There is a concrete reason this needs its own dataset. Link purpose (2.4.4) is a known weak spot: the zero-shot entailment gate does not separate vague from descriptive link text reliably — validated, they score in overlapping ranges. That is a fine-tune target, not something more prompt-engineering will fix.

### Building the training set

`src/training/` collects screen-reader-only evidence from **45 controlled page pairs**, each a known-good page and a mutated one that breaks a single criterion, so a label comes from the contrast rather than from anyone's opinion. Model input is deliberately limited to what a screen reader produced — **no HTML, DOM, CSS, URL or axe findings** — so a model trained on it cannot learn to cheat by reading the markup. The pages are instruments for producing captures and labels; they are not training input.

```bash
npm run training:generate      # write the page pairs + manifest
npx serve runs/screenreader-dataset/pages -l 5050
npm run training:capture       # ~90 NVDA captures; starts a local VM on demand
npm run training:status        # progress, current case, failures, worker health
npm run training:export        # JSONL, only for pairs where the contrast was observable
```

A long unattended run publishes its state rather than expecting you to watch a log: `training:status` reports progress and separately asks the worker whether it is still capturing, so *finished*, *working* and *wedged* are distinguishable. `--resume` picks up from the captures already on disk. See [`src/training/README.md`](./src/training/README.md).

45 pairs is a **pipeline seed and coverage smoke test, not a trainable dataset**. `docs/local-model.md` sets out the planning bands honestly — roughly 100–200 violation and 100–200 clean captures per criterion for a first useful baseline, and 500–1,000+ each for release quality, which across the current criterion matrix is on the order of thousands of labelled records. Splits must be grouped by page family, template and source so a good and bad version of the same template never straddle train and test, and repeated captures of one page do not count as independent examples. Training weights are handled under an allowlist policy — safetensors only, pinned revision, recorded licence and hash, no pickle formats, no `trust_remote_code` — enforced by [`scripts/verify-safetensors.mjs`](./scripts/verify-safetensors.mjs).

### Later, and unproven: predicting the announcement

The scorer still needs a real screen reader to produce its input, so every run costs a VM. The further ambition is a model that **predicts what a screen reader would announce** for a page, giving a fast path that needs no VM in the loop — with real NVDA remaining the ground truth that trains it and spot-checks it, never removed.

That is a materially harder claim than scoring evidence, and it is stated here as a direction, not a plan with a date. It is also the reason the dataset is built the way it is: paired good/bad captures of controlled pages are exactly the supervision such a model would need. If it does not pan out, parts 1–3 stand on their own.

## Status and roadmap

Working end to end, and under active development. The core bet is demonstrated: a real screen reader is driven through a real page, and the judge produces grounded, WCAG-cited findings that separate broken pages from accessible ones. What is still open is written down rather than glossed over — the full backlog is [`PLAN.md`](./PLAN.md), the honest evaluation audit is [`docs/METHODOLOGY.md`](./docs/METHODOLOGY.md).

**Next: making it consumable.** The primary distribution vector is a **GitHub Action** ([`ADR 0003`](./docs/adr/0003-testing-and-distribution.md)) — teams drop it into their workflow and get findings on the PR, where accessibility regressions actually happen. The groundwork is done: real NVDA runs on a GitHub-hosted Windows runner, and the judge backend is pluggable so it can use the team's own key. A hosted layer on top of the open core comes only if the Action proves demand.

**Trust work, in priority order:** an expert-labelled human-agreement baseline (the single biggest gap), confidence calibration measured against outcomes, reported test-retest reliability, and schema-enforced judge output with the model and prompt version pinned per run.

**Coverage.** More screen readers behind the same `CaptureBackend` interface — JAWS (Windows; commercial and the hardest to automate, a deliberate fast-follow), VoiceOver (macOS/iOS; needs a real Mac, and the AppleScript path is fragile), Orca (Linux; the only one that runs headless in a container, which makes it a useful portable dev tier). Then multi-step flows, with Playwright driving the page while the screen reader drives the assistive technology.

**Capture gaps with known fixes.** Announced *language* (3.1.1/3.1.2 — wrong-voice pronunciation is high-impact and invisible to us today), name/role *mismatch* under 4.1.2 (needs both the visible label and the announced name), NVDA's Elements List for bulk enumeration instead of repeated quick-nav, and a pinned NVDA settings profile for cross-version reproducibility.

**Not covered, and not pretended otherwise.** Braille output, magnification and voice control are all real assistive-technology experiences this tool says nothing about. One screen reader in browse mode is *one* valid lived experience, not the universal one.

## Documentation

| document | what it is for |
|---|---|
| [`PLAN.md`](./PLAN.md) | the working backlog and milestones, with what is proven and what is not |
| [`docs/METHODOLOGY.md`](./docs/METHODOLOGY.md) | how we use AI, audited against LLM-as-judge practice; the biases we are exposed to; the pre-registered bar; what is out of scope and why |
| [`docs/local-model.md`](./docs/local-model.md) | the local discriminative-scorer plan: model shape, data sources, how much data is enough, split rules, weight-handling policy, acceptance bar |
| [`docs/local-worker-vm.md`](./docs/local-worker-vm.md) | building a Windows worker VM on a Mac, fully scripted, plus the traps that cost real time |
| [`docs/nvda-worker-runbook.md`](./docs/nvda-worker-runbook.md) | when a worker breaks: error string → actual cause. The messages are misleading and this table is faster than first principles |
| [`docs/nvda-correctness-audit.md`](./docs/nvda-correctness-audit.md) | a review of how we drive NVDA against the official user guide, and the root-cause pass that followed |
| [`docs/adr/`](./docs/adr/) | why the architecture is the way it is: capture as a network service, layered coverage, testing and distribution |

## Licence

Licensed under the **GNU Affero General Public License v3.0 or later** (`AGPL-3.0-or-later`); see [`LICENSE`](./LICENSE). The AGPL's network copyleft means anyone running a modified version as a service must publish their changes, so the project stays genuinely open and a closed hosted fork is not a free ride.

**Commercial licensing.** If the AGPL does not fit — embedding in a closed-source product, or a proprietary hosted service — a separate commercial licence is available; open an issue to start the conversation. A hosted version and enterprise features may sit on top of the open core later, following the standard open-core model.
