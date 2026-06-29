# Evaluation methodology and AI usage

## Why this document exists

`a11y-witness` claims to be *trustworthy* AI for accessibility. That claim is
only credible if the way we use AI is itself held to the standards the field
has established for LLM-based evaluation. This document audits our design
against those practices, states plainly where we comply and where we do not,
and records the biases we have to guard against. It is deliberately
self-critical: the point is to find the gaps before we build on top of them.

## The gap this fills (external grounding)

Independent measurement supports the premise that an automated pass is *necessary
but not sufficient*. Automated tooling reliably covers only a minority of WCAG:
axe-core finds, on average, ~57% of issues and flags the rest "incomplete" for
manual review (Firth 2024, ch.31); Deque's Automated Accessibility Coverage
Report finds automated tools can evaluate roughly 16 of the 50 WCAG 2.1 AA
success criteria (~30%), leaving ~70% to manual or user testing (Cruse &
Boudreau 2025, ch.3). A clean automated report can therefore be a *false
assurance* — the illusion of conformance without a usable experience (ibid.,
ch.22): "what WCAG defines is the floor, not the ceiling." The failures that slip
through are common, not exotic — the WebAIM Million 2024 audit found 44.6% of
home pages with empty links, 48.6% with unlabeled inputs, and 28.2% with empty
buttons (Matuzović 2024, ch.3/9), and 17.3% of pages used ambiguous link text
such as "click here" or "more" (Firth 2024, ch.17). `a11y-witness` targets this
gap: it judges what a real screen reader announces as a user navigates, which is
where the unmeasured ~70% lives.

The hybrid design is the field's own prescription, not an improvisation. Firth
(2024, ch.32) states it directly: "a test can determine whether there is alt text
on an image, but a human can determine whether the alt text makes sense… this is
why both are required." Our split — deterministic rules for the mechanically
checkable absences (missing names) and a discriminative entailment model for the
judgment calls (link purpose, descriptive headings, alt quality) — operationalizes
that division. The entailment verifier itself is a standard tool for the job: a
184M-parameter NLI model (DeBERTa-v3-MNLI) of the kind Huyen (2025, *AI
Engineering*, ch.4) names as the canonical "specialized scorer" for checking
whether a claim is entailed by its evidence.

## The system under audit

- **Capture (no AI).** A real screen reader (NVDA) is driven through a real
  browse-mode read-through; the output is an ordered transcript of what it
  announced. See `docs/adr/0001-capture-architecture.md`. Announcement strings
  are screen-reader- and version-specific, so detection signals (e.g. NVDA's
  empty-name marker U+FFFC and the literal "Unlabelled") are validated against
  our *own* NVDA captures, not transferred from third-party documentation. A
  published "edit, blank" example, for instance, does not match what our NVDA
  pipeline emits — in our captures "blank" is empty-line noise, not an empty
  name — and keying on it would mis-fire (see the note in `src/spike/rules.ts`).
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

## Grounding in W3C guidance

The approach is anchored in primary W3C material, not just our own intuition:

- **POUR alignment.** W3C's [Accessibility Principles](https://www.w3.org/WAI/fundamentals/accessibility-principles/)
  separate requirements that are perceivable without sight from those that are
  not. Their "observable" set (text alternatives, heading structure, link
  purpose, form labels, names/roles/values, reading order, language) matches
  exactly what our eval marks as `expect`-able; their vision/interaction set
  (contrast, colour, keyboard, focus visible, timing, target size) matches what
  we deliberately do not flag. Our observable-subset scoping is W3C's own
  distinction, not an arbitrary one.
- **WCAG version coverage.** Each criterion is tagged with the version that
  introduced it (`src/wcag/criteria.ts`), parsed from the 2.0, 2.1, and 2.2
  specs. We can therefore report against **WCAG 2.1 AA**, the version most law
  and regulation references (for example EN 301 549), as well as 2.2 AA. Every
  criterion new in 2.2 needs interaction, vision, or cross-page context, so the
  subset a read-through detects is identical under 2.1 and 2.2; the version
  changes only how a finding is labelled.
- **ATAG positioning.** Under [ATAG](https://www.w3.org/WAI/standards-guidelines/atag/),
  `a11y-witness` is a Part B style tool: it helps authors produce content that
  conforms to WCAG by giving evidence-backed feedback in their workflow. ATAG
  Part A then binds us too: the tool's own outputs (reports, CLI, any future UI)
  must themselves be accessible. We adopt that as a self-requirement.
- **Whose experience.** The judgments target the real barriers described in
  [How People with Disabilities Use the Web](https://www.w3.org/WAI/people-use-web/),
  specifically the non-visual perception and navigation strategies of screen-reader users.
  We characterise findings as the **screen-reader navigation experience judged
  against success criteria**, not as a claim to reproduce "what it is like to be
  blind." A single assistive technology (NVDA, browse mode) is one valid lived
  experience, not the universal one — disability-simulation framing misleads
  (Cruse & Boudreau 2025, ch.21), and screen-reader users themselves navigate in
  divergent ways. Braille output, magnification, and voice control are roadmap,
  explicitly not yet covered.

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
| Human-agreement baseline | Partial | No direct expert labelling yet, but the W3C tutorial baseline derives its ground truth from W3C's own documented techniques, not our judgment, which reduces (does not eliminate) the self-grading concern. A live expert-labelled sample is still wanted. |
| Held-out set / anti-overfitting | Substantial | Beyond the contamination page, 12 paired good/bad pages authored fresh from the W3C tutorials (`src/eval/pages/tutorials/`; images, forms, structure, tables, menus, carousels) form a held-out, contamination-resistant baseline. Good pages score 0 findings; bad pages are caught (100% recall, 0 false positives). A further 12 paired pages authored from published expert references (`src/eval/pages/books/`; Matuzović 2024, Firth 2024) extend coverage to link purpose (2.4.4), descriptive headings (2.4.6), alt-text *quality* vs absence (1.1.1), custom controls (4.1.2), status messages (4.1.3), and layout-table semantics (1.3.1); these are authored and **pending NVDA capture**, after which their `expect`/`allow` sets are tuned to the real transcripts. |
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
- **W3C tutorial baseline (passed, all 6 topics).** 12 paired good/bad pages
  authored from the W3C WAI tutorials (images, forms, page structure, tables,
  menus, carousels; `src/eval/pages/tutorials/`), captured via the real NVDA
  worker. Good pages: 0 findings (precision). Bad pages: the documented failure
  caught in every topic (100% recall, 0 false positives). The baseline surfaced
  a genuine recall gap on missing table-header association, which was then fixed
  with a W3C-grounded recall hint that generalises (the correct table still
  scores clean). This is the value of the baseline: it found a real weakness the
  public-page tests had not. Carousels test only the observable subset; their
  motion (2.2.2), keyboard (2.1.1), focus, and change-announcement issues are
  documented as out of scope for a passive read.
- **Book-grounded baseline (authored, pending capture).** 12 paired good/bad
  pages (`src/eval/pages/books/`) authored from documented failures in two
  published references (Matuzović 2024; Firth 2024), each citing its source
  recipe/chapter. They extend the held-out set into criteria the tutorial
  baseline did not isolate: link purpose, descriptive headings, alt-text quality
  (present-but-unhelpful, distinct from absence), custom controls, status
  messages via a live region, and layout-table semantics. The pages and their
  fully-specified eval cases are committed; the cases are skipped by the runner
  until the NVDA worker captures each page, then activate with no code change.
  Their `expect`/`allow` are provisional until checked against the first real
  capture (see the capture-fidelity note above).

## Out of scope, and why

`a11y-witness` judges only what a screen-reader read-through (plus the opt-in
interaction probes) can observe. The following are deliberately left to static
scanners and other tools — a division of labour, not a blind spot:

- **Visual / sensory:** contrast (1.4.3/1.4.6), use of colour (1.4.1), non-text
  contrast (1.4.11), text spacing (1.4.12), reflow (1.4.10), focus visible
  (2.4.7), target size (2.5.x). Not present in a transcript.
- **Operable / behavioural:** keyboard operability and traps (2.1.1/2.1.2),
  focus order (2.4.3), timing (2.2.x), motion/flashing (2.3.x). Partly
  observable only in a *driven* session; a candidate future scope, not a passive
  read, and called out by the source material as the highest-impact manual-only
  failures (Cruse & Boudreau 2025, ch.20-21).
- **Media production:** captions / audio description (1.2.x). Not screen-reader
  observable.
- **Known fine-tune target, not a prompt fix:** link purpose (2.4.4) is a subtle
  semantic judgment that the zero-shot entailment gate does not separate
  reliably (validated: vague and descriptive link text score in overlapping
  ranges). It is kept in scope and measured, but its recall is expected to be
  weak until a small encoder is fine-tuned for it.
- **Needs richer capture:** page/parts language (3.1.1/3.1.2) — a high-value gap
  (wrong-voice pronunciation) requiring the capture to record announced
  language; name/role *mismatch* under 4.1.2 (visible label vs announced name)
  requiring both signals to be captured. Roadmap, gated on capture support.

## References

### W3C standards and guidance

- [WCAG 2.1](https://www.w3.org/TR/WCAG21/) and [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- [How to Meet WCAG (Quick Reference)](https://www.w3.org/WAI/WCAG22/quickref/?versions=2.1)
- [WCAG overview](https://www.w3.org/WAI/standards-guidelines/wcag/)
- [Accessibility Principles (POUR)](https://www.w3.org/WAI/fundamentals/accessibility-principles/)
- [How People with Disabilities Use the Web](https://www.w3.org/WAI/people-use-web/)
- [ATAG (Authoring Tool Accessibility Guidelines)](https://www.w3.org/WAI/standards-guidelines/atag/)
- [NVDA user guide — Navigating with NVDA](https://download.nvaccess.org/releases/2026.1.1/documentation/userGuide.html#NavigatingWithNVDA) (browse/focus/object modes; portable-copy limitations)

### Accessibility practitioner references

- Manuel Matuzović, *Web Accessibility Cookbook* (O'Reilly, 2024) — links,
  buttons, forms, filters/live regions, tables.
- Ashley Firth, *Practical Web Accessibility*, 2nd ed. (Apress, 2024) — alt
  text, custom controls, headings, link text, tables; the automation-coverage
  and "both are required" framing.
- Dale Cruse & Denis Boudreau, *Inclusive Design for Accessibility* (Packt,
  2025) — the manual-testing gap, "floor not ceiling", simulation critique,
  severity taxonomy.
- [WebAIM Million 2024](https://webaim.org/projects/million/) — annual automated
  audit of the top 1,000,000 home pages (empty links/buttons, missing labels).
- Deque, *Automated Accessibility Coverage Report* — share of WCAG success
  criteria detectable by automated tooling.

### LLM evaluation literature

- [How to Correctly Report LLM-as-a-Judge Evaluations](https://arxiv.org/pdf/2511.21140)
- [From Generation to Judgment: Opportunities and Challenges of LLM-as-a-judge](https://arxiv.org/pdf/2411.16594)
- [Benchmark Data Contamination of Large Language Models: A Survey](https://arxiv.org/html/2406.04244v1)
- [Benchmark Inflation: Revealing LLM Performance Gaps Using Retro-Holdouts](https://arxiv.org/pdf/2410.09247)
- [Evaluating Scoring Bias in LLM-as-a-Judge](https://arxiv.org/html/2506.22316v1)
