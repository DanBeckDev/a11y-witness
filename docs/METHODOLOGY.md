# Evaluation methodology and AI usage

## Why this document exists

`a11y-witness` claims to be *trustworthy* AI for accessibility. That claim is
only credible if the way we use AI is itself held to the standards the field
has established for LLM-based evaluation. This document audits our design
against those practices, states plainly where we comply and where we do not,
and records the biases we have to guard against. It is deliberately
self-critical: the point is to find the gaps before we build on top of them.

## The system under audit

- **Capture (no AI).** A real screen reader (NVDA) is driven through a real
  browse-mode read-through; the output is an ordered transcript of what it
  announced. See `docs/adr/0001-capture-architecture.md`.
- **Judge (LLM).** A two-stage pipeline run through the Codex CLI
  (observed model: `gpt-5.4-mini`, reasoning effort `medium`):
  1. *Recall*: enumerate every candidate issue from the transcript, exhaustively
     and task-independently.
  2. *Ground and verify*: assign the single most precise WCAG 2.2 A/AA criterion
     from a fixed, spec-verified list, drop unsupported candidates, assign
     severity and confidence, and judge task-completability separately.
  Optional consensus (`JUDGE_CONSENSUS=N`) runs the pipeline N times and keeps
  only findings recurring in a majority. See `src/spike/judge.ts`.
- **Eval.** Labeled cases scored automatically for recall and false positives
  against authoritative ground truth. See `src/eval/`.

## Best-practice audit (LLM-as-judge)

| Practice | Status | Notes |
|---|---|---|
| Grounding / reference-based judging | Done | The verified WCAG 2.2 A/AA list is injected; the judge may cite only from it. |
| Evidence-constrained judging | Done | The judge sees the transcript, not the page. This is our strongest anti-contamination property: it cannot simply recall a page's known issues, it must point to announced evidence. |
| Task decomposition | Done | Recall vs verify; audit vs task-completability are separated so "task is doable" cannot suppress findings. |
| Structured output | Partial | JSON is requested and parsed, but not schema-enforced or validated; malformed output is only loosely recovered. |
| Self-consistency / ensembling | Done (opt-in) | Consensus mode keeps only recurring findings. Quantified: it removes flaky FPs, not stable ones. |
| Confidence calibration | Not done | Findings carry a confidence number, but it has not been validated against outcomes. |
| Test-retest reliability | Partial | `EVAL_RUNS` can repeat cases, but reliability is not yet reported as a metric. We have observed run-to-run variation. |
| Human-agreement baseline | Not done | No expert-labeled cases. This is now the single biggest remaining gap: the gold standard for any LLM judge is agreement with human experts. |
| Held-out set / anti-overfitting | Started | A fresh authored page (`src/eval/pages/contamination-test.html`) was added as a held-out case, not tuned against; the judge scored it 4/4 recall, 0 false positives. More held-out pages still needed. |
| Contamination control | Partial (initial evidence) | The evidence-constrained design mitigates it, and a fresh, never-published page confirms recall is genuine judging rather than recall-from-memory (see Validation log). The public ground-truth pages (W3C BAD, WAI) remain a caveat; more novel pages needed. |
| Reproducibility | Partial | Reasoning effort is pinned; the model is whatever the local Codex login resolves to; sampling temperature is not controlled; prompts live in-repo but are not versioned. |
| Reporting standard | Not done | We have quoted bare "recall 100%" on n=5 without sample sizes, confidence intervals, or test-retest. |

## Known LLM-judge biases and our exposure

The literature documents several biases in LLM judges. Our exposure:

- **Verbosity / formatting bias** (favoring longer, well-formatted answers): low.
  We judge a fixed transcript and emit structured findings, so there is no
  candidate response whose length we can be swayed by. The recall stage could
  over-include, but the verify stage and grounding constrain it.
- **Position bias** (preferring first or last): not applicable. We do not do
  pairwise or list-ranked comparison.
- **Self-enhancement bias** (a model rating its own output highly): low. The
  judge rates a screen reader's output, not its own generations.
- **Preference leakage / egocentric bias**: possible. A single model family
  makes every judgment; its idiosyncratic preferences are uncorrected.
  Mitigated, not eliminated, by grounding and evidence requirements.
- **Familiar-page prior** (contamination-adjacent): the most relevant risk. The
  model may pattern-match a well-known page and lean toward its expected issues
  rather than judging the transcript on its merits.

## Honest status of current results

As of this writing, our headline numbers (recall 100% on observable failures,
high precision) come from:

- **n = 5 cases**, several of them famous public pages,
- **iteratively tuned** judge guards (risking overfitting to those cases),
- **single-run** scoring (no test-retest interval),
- with **no human-agreement baseline**.

Therefore these numbers are **preliminary and probably optimistic**, and should
not be reported without these caveats. They are evidence that the approach is
promising, not that it is validated.

## Pre-registration: what "trustworthy enough" will mean

To avoid moving the goalposts, we register the bar before measuring it. The M0
go decision requires, on a **held-out set of novel pages** with
independently-derived ground truth:

- the judge's load-bearing findings agree with an expert's at a pre-agreed
  recall, with a pre-agreed cap on false positives per page, and
- test-retest variation within a pre-agreed bound,
- with results reported per the LLM-as-judge reporting standard (sample size,
  intervals, reliability), not as bare point estimates.

(The specific thresholds are to be set with the accessibility expert.)

## Roadmap to close the gaps

1. **Anti-contamination test**: evaluate on novel or freshly-constructed pages
   whose ground truth was not derived from a public report, to show recall is
   not memorization.
2. **Human-labeled set**: have the accessibility expert label a sample, and
   report judge-vs-expert agreement.
3. **Reporting discipline**: report n, test-retest reliability (`EVAL_RUNS`),
   and intervals; stop quoting bare point estimates.
4. **Calibration study**: check whether confidence tracks correctness.
5. **Engineering hygiene**: schema-enforced output, and pin the model, sampling,
   and prompt version per run.

## Validation log

- **Contamination / held-out test (passed, initial).** A page was authored fresh
  for this purpose (`src/eval/pages/contamination-test.html`), never published,
  with a known set of planted violations mixed with correct controls. Captured
  via the real NVDA worker and judged. The judge caught all four planted
  observable violation categories with high confidence (1.1.1 at 0.99, 2.4.4 at
  0.98, 4.1.2 at 0.97, 1.3.1 at 0.93) and flagged none of the correct controls.
  Because no model can have memorized this page, the result is evidence that
  recall reflects genuine judging of the transcript, not recall-from-memory.
  One page is not a suite; more novel pages and an expert-labeled baseline are
  still required.

## References

- [How to Correctly Report LLM-as-a-Judge Evaluations](https://arxiv.org/pdf/2511.21140)
- [From Generation to Judgment: Opportunities and Challenges of LLM-as-a-judge](https://arxiv.org/pdf/2411.16594)
- [Benchmark Data Contamination of Large Language Models: A Survey](https://arxiv.org/html/2406.04244v1)
- [Benchmark Inflation: Revealing LLM Performance Gaps Using Retro-Holdouts](https://arxiv.org/pdf/2410.09247)
- [Evaluating Scoring Bias in LLM-as-a-Judge](https://arxiv.org/html/2506.22316v1)
