# a11y-witness

> Working name, easy to change later. Judge the real assistive-technology experience of a website with AI.

Rule-based scanners automate the mechanical layer well: Deque reports that axe-core finds about 57% of WCAG issues automatically and flags the rest as needing human review. That human-review remainder is largely the **lived experience**: whether what a screen reader actually announces, as a real person navigates and operates the page, is coherent and usable. That is the judgment-based work `a11y-witness` automates.

`a11y-witness` drives a **real screen reader** through a page the way a real user navigates it, reading in browse mode, jumping by headings and landmarks, operating controls, and completing a task, and uses an AI model to judge whether that experience was coherent and usable. Every finding cites the specific WCAG criterion it rests on, carries a confidence level, and can be checked by a human against the actual announcements. It is designed to sit **alongside** a rule-based engine like [axe-core](https://github.com/dequelabs/axe-core), not replace it: the rule engine covers contrast, colour, and parsing that a screen reader cannot perceive; we cover the lived experience it cannot judge. See [`docs/adr/0002-layered-coverage.md`](./docs/adr/0002-layered-coverage.md).

It does **not** tab through the page and call that a screen-reader test. Tabbing only reaches interactive controls and skips the way screen-reader users actually read and explore a page. Modelling real navigation is the whole point.

## Status

Early but working end to end. The **M0 core bet is demonstrated**: a real screen reader (NVDA) is driven through a real page, and an AI judge produces grounded, WCAG-cited findings that discriminate broken pages from accessible ones. See [`PLAN.md`](./PLAN.md). The architecture is in [`docs/adr/0001-capture-architecture.md`](./docs/adr/0001-capture-architecture.md), and an honest audit of how we use AI (and where the evaluation is not yet validated) is in [`docs/METHODOLOGY.md`](./docs/METHODOLOGY.md).

## How it works

Capture is operating-system-bound, so it is split from the rest:

- **Capture worker** (Windows): drives **NVDA** through real browse-mode navigation and returns the announcement transcript over HTTP. See [`src/capture/nvda/`](./src/capture/nvda/) for the setup recipe.
- **Control plane** (anywhere): the `witness` CLI asks a worker to capture a page, then judges the transcript and prints WCAG-cited findings. The judge backend is pluggable (the `ask()` seam in `src/spike/judge.ts`): by default it runs through your local **Codex** login (no metered API cost). Set `JUDGE_BACKEND=anthropic` (with `ANTHROPIC_API_KEY`, optional `JUDGE_MODEL`) for the Anthropic API, or `JUDGE_BACKEND=openai` (with `JUDGE_BASE_URL`, optional `JUDGE_API_KEY`/`JUDGE_MODEL`) for any **OpenAI-compatible endpoint** — hosted OpenAI *or* a local engine (llama.cpp/vLLM/Ollama/LM Studio). The `openai` backend is the path for CI and the GitHub Action, where a local Codex login isn't available, and it makes a **self-hosted, zero-API-cost judge** possible — a local Qwen3.6-27B (Q4) scored 88% recall with clean precision on the W3C subset (see PLAN.md).

### Hybrid verification: model + rules + discriminative gate

The judge is a hybrid, because no single model handles every WCAG criterion well. A generative model drafts findings from the transcript, and two layers refine them:

- **Deterministic rules** (always on, [`src/spike/rules.ts`](./src/spike/rules.ts)) own the *absence-of-name* criteria — an image announced with no alternative text (1.1.1), or a control announced with a role but no accessible name (4.1.2). These are facts, not judgement calls, so a rule catches them exactly and for free, with no false positives.
- **A discriminative gate** (opt-in, [`src/spike/verify-gate.ts`](./src/spike/verify-gate.ts)) re-judges the *semantic* findings (vague link text 2.4.4, non-descriptive headings 2.4.6, and so on) with a small encoder (DeBERTa-v3 NLI, ONNX) run in-process via [transformers.js](https://github.com/huggingface/transformers.js). A discriminative model *scores* a candidate rather than *generating* it, so it cannot invent a finding — which removes the over-flagging small generative models produce on clean pages. It keeps a semantic finding only when the encoder confirms the violation.

Findings are reported along the screen-reader experience waterfall — **Perceive → Navigate → Interact** (Firth, _Practical Web Accessibility_) — so the most fundamental barriers (content that can't be perceived) appear before downstream ones (controls that can't be operated).

The gate is opt-in and self-contained (no API key, no GPU, a few milliseconds per check on CPU). Enable it with:

```bash
npm install @huggingface/transformers
JUDGE_GATE=on GATE_MODEL_PATH=/path/to/onnx-model-dir \
  npm run witness -- https://example.com
```

Optional: `GATE_DTYPE` (default `fp32`) and `GATE_THRESHOLD` (default `0.4`). The model directory uses the standard transformers.js layout (`onnx/model.onnx` plus the tokenizer and `config.json`).

## Quickstart

Prerequisites: Node 20+, and a judge backend — either Codex installed and logged in (`codex login`, the default, no metered cost) or `JUDGE_BACKEND=anthropic` with `ANTHROPIC_API_KEY` set. A reachable NVDA capture worker (see `src/capture/nvda/README.md` to stand one up).

```bash
npm install
A11Y_WORKER=http://<worker-host>:8765 \
  npm run witness -- https://example.com --task "Find the contact details"
```

This drives a real screen reader through the page, captures what it announces, and prints an AI judgment of whether the experience was usable, with WCAG-cited findings you can verify against the transcript. Add `--json` for machine-readable output, `--debug` for per-phase capture diagnostics.

To test how the page *behaves* when operated, add `--probe-forms`: the worker submits the form with no valid input and records what the screen reader announces, catching forms that fail silently (the error is shown only visually and never announced — WCAG 3.3.1 Error Identification / 4.1.3 Status Messages). It is opt-in because activating a submit button has side effects. Disclosure controls are always activated to check that their expanded/collapsed state change is announced (4.1.2).

## Licence

`a11y-witness` is licensed under the **GNU Affero General Public License v3.0 or later** (`AGPL-3.0-or-later`); see [`LICENSE`](./LICENSE). The engine is open source. Because the AGPL's network copyleft requires anyone who runs a modified version as a service to publish their changes, the project stays genuinely open while a closed, hosted fork is not a free ride.

**Commercial licensing.** If the AGPL's obligations do not fit your use, for example embedding `a11y-witness` in a closed-source product or a proprietary hosted service, a separate commercial licence is available. Open an issue to start the conversation. A hosted version and enterprise features may sit on top of the open core later, the same open-core model NetBox Labs uses.
