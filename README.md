# a11y-witness

[![lint](https://github.com/DanBeckDev/a11y-witness/actions/workflows/lint.yml/badge.svg)](https://github.com/DanBeckDev/a11y-witness/actions/workflows/lint.yml)
[![capture-regression](https://github.com/DanBeckDev/a11y-witness/actions/workflows/capture-regression.yml/badge.svg)](https://github.com/DanBeckDev/a11y-witness/actions/workflows/capture-regression.yml)
[![licence: AGPL-3.0-or-later](https://img.shields.io/badge/licence-AGPL--3.0--or--later-blue)](./LICENSE)

**a11y-witness drives a real screen reader through a web page and has an AI judge assess whether the experience was actually usable.** Every finding cites a WCAG criterion and quotes the announcement it rests on, so you can check it yourself.

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

## What it does not do

- **It does not tab through the page and call that a screen-reader test.** Tabbing reaches interactive controls only; it skips how screen-reader users actually read and explore. Modelling real navigation — browse mode, jumping by heading and landmark, operating controls — is the whole point.
- **It does not judge what a screen reader cannot perceive.** Contrast, colour and target size come from the rule-based layer. We do not reimplement those rules or pretend to see them.
- **It is not a compliance certificate.** It produces evidence and cited, confidence-scored findings for a human to act on. Overlay vendors lost the market — and drew an FTC fine — by over-claiming, and [`docs/METHODOLOGY.md`](./docs/METHODOLOGY.md) is an honest audit of where our own evaluation is and is not validated.

## How it works

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

The `openai` backend makes a self-hosted, zero-cost judge realistic: a local **Qwen3.6-27B (Q4)** scored 88% recall with no false positives on the clean reference page over the W3C subset, missing only the most judgment-heavy criterion (1.4.5). Details in [`PLAN.md`](./PLAN.md).

## Quickstart

Prerequisites: Node 20+, a judge backend (Codex logged in by default — `codex login`), and a capture worker.

```bash
npm install
npm run witness -- https://example.com --task "Find the contact details"
```

Add `--json` for machine-readable output and `--debug` for per-phase capture diagnostics.

To test how a page *behaves* when operated, add `--probe-forms`: the worker submits the form with no valid input and records what is announced, catching forms that fail silently — the error shown visually and never announced (3.3.1 Error Identification, 4.1.3 Status Messages). It is opt-in because activating a submit button has side effects. Disclosure controls are always activated, to check the expanded/collapsed change is announced at all (4.1.2).

### Getting a worker

| you have | do this |
|---|---|
| a Mac | build a local Windows VM: [`docs/local-worker-vm.md`](./docs/local-worker-vm.md). Scripted end to end — ISO build, unattended install, NVDA provisioning |
| a Windows box | [`scripts/bootstrap-windows-worker.ps1`](./scripts/bootstrap-windows-worker.ps1), then point at it with `A11Y_WORKER=http://host:8765` |
| neither | GitHub Actions runs real NVDA on `windows-2022` — see [`.github/workflows/capture-regression.yml`](./.github/workflows/capture-regression.yml) |

With a local VM and no `A11Y_WORKER` set, a run manages the VM on demand: it starts it, captures, and **puts it back exactly as it found it** — stopped stays stopped, paused re-paused, and one you had already started is left running, so a run never shuts down a worker someone else is using. Cold start is 12–15s, which is cheaper than leaving a Windows guest idling (it is never actually idle). Override with `--after stop|pause|leave|restore`; naming a worker opts out entirely. Between runs, [`scripts/local-worker/worker-ctl.sh`](./scripts/local-worker/worker-ctl.sh) does `up | pause | stop | status | idle-pause`.

## How we know it works

There are no unit tests; verification is layered, and each layer tests something the others cannot.

| command | what it checks |
|---|---|
| `npm run lint` / `npm run typecheck` | mechanical; both gate CI |
| `npm run eval` | judge quality against **34 labelled fixtures** (W3C tutorial pages and paired good/bad cases). Headline: 100% recall over the failure cases, ~2 false positives — both on the subjective 2.4.4/2.4.6 link/label criteria. Needs a local Codex login, so it cannot run in CI |
| `npm run rules-check` | the deterministic rules in isolation. Exits non-zero on **any** false positive against a conformant page — precision is the entire point of a rule |
| `node src/capture/nvda/capture-check.mjs` | the capture half, on the worker itself. Asserts probe *values*, not just that a probe fired — a check that only asserts "it ran" stays green while the evidence is garbage |
| `capture-regression.yml` | real NVDA on a GitHub-hosted Windows runner |

## Building a training set

`src/training/` collects screen-reader-only evidence from **45 controlled page pairs**, each a known-good page and a mutated one that breaks a single criterion, so a label comes from the contrast rather than a human's opinion. Model input is deliberately limited to what a screen reader produced — no HTML, DOM, CSS or axe findings — so a model trained on it cannot learn to cheat by reading the markup.

```bash
npm run training:generate      # write the page pairs + manifest
npx serve runs/screenreader-dataset/pages -l 5050
npm run training:capture       # ~90 NVDA captures; starts a local VM on demand
npm run training:status        # progress, current case, failures, worker health
npm run training:export        # JSONL, only for pairs where the contrast was observable
```

A long unattended run publishes its state rather than expecting you to watch a log: `training:status` reports progress and separately asks the worker whether it is still capturing, so *finished*, *working* and *wedged* are distinguishable. `--resume` picks up from the captures already on disk. See [`src/training/README.md`](./src/training/README.md).

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

## Status

Working end to end. The core bet is demonstrated: a real screen reader is driven through a real page, and the judge produces grounded, WCAG-cited findings that separate broken pages from accessible ones. What is deliberately still open — calibration, criteria we do not yet cover, and where the evaluation is thin — is written down in [`PLAN.md`](./PLAN.md) and [`docs/METHODOLOGY.md`](./docs/METHODOLOGY.md) rather than glossed over.

JAWS and VoiceOver backends are designed for (the capture interface is screen-reader agnostic) but not implemented.

## Licence

Licensed under the **GNU Affero General Public License v3.0 or later** (`AGPL-3.0-or-later`); see [`LICENSE`](./LICENSE). The AGPL's network copyleft means anyone running a modified version as a service must publish their changes, so the project stays genuinely open and a closed hosted fork is not a free ride.

**Commercial licensing.** If the AGPL does not fit — embedding in a closed-source product, or a proprietary hosted service — a separate commercial licence is available; open an issue to start the conversation. A hosted version and enterprise features may sit on top of the open core later, the same open-core model NetBox Labs uses.
