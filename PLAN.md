# a11y-witness — Plan of Attack

## North star

Make the real assistive-technology experience of any website measurable and improvable. Drive a real screen reader through real navigation, use AI to judge whether the experience is coherent and usable, and make every judgment trustworthy and checkable. Open core (Apache-2.0): the engine is open; a hosted product can sit on top.

## Guiding principles

1. **Model how screen readers are really used**, reading in browse mode, jumping by headings and landmarks, completing tasks, operating controls. Never tab-through; tabbing tests keyboard reachability, not the reading experience.
2. **Trustworthy by construction.** Every finding cites a WCAG criterion, carries a calibrated confidence, and is verifiable by a human against the actual announcements. The overlay vendors lost the market (and drew an FTC fine) by over-claiming. We do not.
3. **Prove the riskiest thing first.** The core bet is unproven; everything waits on M0.
4. **Open core.** Apache-2.0 engine, with a hosted/enterprise layer possible later.

## Milestones

### M0 — Spike: is the core bet real? (now)

Prove that an AI model can judge the real screen-reader experience trustworthily.

- [ ] Drive VoiceOver (Guidepup) through one real page using real navigation (browse-mode read, then heading jumps); capture the announcement transcript. `src/spike/run-spike.ts`
- [ ] Pipe the transcript and the task to the AI judge; get a WCAG-cited, confidence-scored verdict. `src/spike/judge.ts`
- [ ] Pre-register what "trustworthy enough" means before running it, e.g. across N real pages the judge's load-bearing findings match an expert's, with few false positives.
- [ ] Run it on a handful of real pages and make the go/no-go call.

**Acceptance:** on real pages, the judgment is credible and a human can verify each finding from the transcript. If it is hallucinated or noisy, stop and rethink before building further.

### M1 — v1 open-source tool

- [ ] CLI: `a11y-witness <url> --task "..."` produces an evidence-backed report (findings, WCAG references, confidence).
- [ ] Real navigation as reusable strategies: read-through, by-heading, by-landmark, forms, task completion.
- [ ] Repo polish: examples, contribution guide, basic CI (typecheck and lint).
- [ ] First launch artifact / blog post (this is the content roadmap's first concrete deliverable).

### M2 — Trust layer (the moat)

- [ ] Calibrated confidence and reproducible runs.
- [ ] Human-in-the-loop review and confirmation workflow.
- [ ] Provenance: every finding linked to the exact announced evidence and WCAG criterion.

### M3 — Coverage and the development workflow

- [ ] NVDA support (Windows; Guidepup), the most-used free screen reader.
- [ ] JAWS support (Windows; commercial, hardest to automate, deliberate fast-follow). Known gap.
- [ ] Windows CI runners for NVDA and JAWS.
- [ ] Multi-step flow automation (Playwright driving the page, Guidepup driving the screen reader).
- [ ] CI integration: run in a pipeline and catch accessibility regressions, including inaccessible AI-generated UI, before merge.

### M4 — Launch and standing

- [ ] Run across notable sites and publish an assistive-technology readiness report.
- [ ] Conference talk; engagement with the W3C accessibility community.
- [ ] Later: hosted cloud and enterprise features on top of the open core.

## Known risks

- **Trustworthiness of AI judgment.** The make-or-break. M0 decides it.
- **JAWS automation difficulty.** Commercial and awkward to drive; budget time for it.
- **Representative coverage.** Most desktop screen-reader users are on Windows (NVDA and JAWS), so VoiceOver alone is not representative. M3 is required for credibility, not optional. VoiceOver is simply the cheapest way to prove the mechanism in M0.
