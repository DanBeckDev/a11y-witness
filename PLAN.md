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
- [x] **Interaction model, part 1 — structural navigation.** The capture now skims by element type (headings, landmarks, form fields) via NVDA quick-nav, swept in both directions so it works regardless of cursor position (Guidepup has no "move to top"). Reveals presence AND absence (e.g. a page whose visual titles are not real headings shows zero headings). Wired into the judge (recall + verify); no eval regression. `src/capture/nvda/capture-core.mjs`.
- [x] **Interaction model, part 2 — operate controls.** Two lived-experience probes that activate controls and judge whether the screen reader hears the result, neither of which a rule engine can do. Both activate *in place* during the form-field quick-nav sweep (a separate next/previous sweep fails: after the sweep the cursor sits at the end, so on a sparse page "next" returns nothing — the only control is the *current* position). (a) **Disclosure state change**: activate a "collapsed" control and record what is announced; an empty announcement = the state change is not conveyed (4.1.2). (b) **Form submit (opt-in `--probe-forms`, since activating a submit button has side effects)**: submit with no valid input and capture the `spokenPhraseLog` delta (every phrase announced after the submit, so a live-region alert is not overwritten by a following focus move); if no error is announced the user is never told what failed (3.3.1 Error Identification, 4.1.3 Status Messages). Wired into the judge (recall + verify). `src/capture/nvda/capture-core.mjs`.
- [x] **Fixed the flakiness via the Guidepup docs.** Cross-referencing the official API surfaced `windowsActivate`, which explicitly focuses the Edge window instead of hoping the launch took focus — a real cause of empty/partial captures. (The other, found later via structured diagnostics: a Windows permission dialog silently blocking the interactive session.)
- [x] **Refactored the interaction traversal to NVDA quick-nav** (`moveToNext/PreviousFormField` + in-place activation) instead of raw Tab, which stalled on sparse pages and escaped into the browser chrome. Note: NVDA's "B" button quick-nav misses plain `<button>`s that "F" (form field) reaches, so the sweep navigates by form field.
- [x] **Debug mode / structured diagnostics (all levels).** Every capture phase records a diagnostic (`browserLaunched`, `windowsActivate`, `nvdaStart`, `afterStart`, `readThrough` with stopReason + firstStepError, `structural`, `formProbe`, `interaction` sweepLog, `done`) instead of a silent catch; surfaced via `server.log` and the CLI `--debug`, with a 0-announcement WARNING. This is what pinpointed the permission-dialog outage. `src/capture/nvda/capture-core.mjs`.
- [x] **Validated part 2 against paired W3C tutorial examples.** Disclosure pair (`disclosure-good` announces the state change → clean; `disclosure-bad` never updates `aria-expanded` → 4.1.2 caught) and form-validation pair (`forms-validation-good` announces the error via a live region → clean; `forms-validation-bad` shows it visually only → 3.3.1 + 4.1.3 caught), both with zero false positives. Added as eval cases; the signal lives in `interaction.stateChanges` / `interaction.formChanges`, invisible to a static read.

### Next: reproducible testing + distribution (ADR 0003)

Real NVDA runs in GitHub Actions (via `guidepup/setup-action`), which makes capture reproducible by anyone AND is the foundation of the chosen distribution vector — a GitHub Action teams drop into their own CI. Dependency-ordered:

- [x] **Phase 0 — Prove real NVDA in GitHub Actions.** `capture-spike.yml` on `windows-2022` with `guidepup/setup-action@0.20.0` captured `structure-good.html` with NO personal VM: 10 transcript phrases, 5 headings, 5 landmarks via structural quick-nav. Premise confirmed — capture is reproducible on GitHub-hosted infra. (Read-through + structural nav exercised; the interaction probes come in Phase 1's fixture diff.)
- [ ] **Phase 1 — Capture-regression CI.** Capture the good/bad tutorial pages on the runner, diff against committed fixtures (first automated test of the capture half). Extract a one-shot capture entrypoint; document `npx @guidepup/setup` as the local path.
- [ ] **Phase 2 — Pluggable judge backend.** Codex (author, local) / BYO Anthropic-OpenAI key (CI + Action users) / hosted (future SaaS). Unblocks all external consumption; preserves the no-metered-API constraint for the author.
- [ ] **Phase 3 — The GitHub Action.** `a11y-witness-action`: on a Windows runner, setup → capture → judge (user's key) → findings as a job summary + PR comment + optional failing check. Example workflow + marketplace listing.
- [ ] **Phase 4 (later) — Hosted open-core layer.** Managed capture pool + judge-as-a-service + dashboard, once the Action proves demand.

## Milestones

### M0 — Spike: is the core bet real? (now)

Prove that an AI model can judge the real screen-reader experience trustworthily, then prove we can capture that experience from a real screen reader.

**Capture half — proven on Windows/NVDA.**

VoiceOver capture was deferred: macOS AppleScript automation is fragile and deprecating (`-1708`), and VoiceOver cannot be containerised or run by contributors. Capture moved to NVDA on Windows, the most representative and most reliably automatable target. See `docs/adr/0001-capture-architecture.md`.

- [x] NVDA capture running on a Proxmox Windows VM via Guidepup, in an interactive session, driven remotely. `src/capture/nvda/`
- [x] Real browse-mode read-through of a real page, producing a faithful transcript that audibly contains the page's actual defects (unlabelled graphics, "Click here" links, unmarked headings). Fixture: `src/spike/fixtures/nvda-w3c-bad-before.json`
- [x] End-to-end: capture (Windows) piped to the Codex judge (control plane) yields a grounded, hallucination-free verdict. `src/spike/judge-file.ts`
- [ ] Productionise the worker as the `POST /capture` HTTP service behind `src/capture/backend.ts` (currently a scheduled-task recipe).

**Judge half — works end-to-end; recall now strong, calibration next.**

- [x] Produces WCAG-cited, confidence-scored verdicts, grounded in the verified WCAG 2.2 A/AA criteria and citing only from that list. `src/spike/judge.ts`, `src/wcag/criteria.ts` (validated against the W3C spec)
- [x] On the short planted sample, catches the defects and avoids false positives. `src/spike/judge-sample.ts`
- [x] **Recall fixed via a two-stage judge:** an exhaustive recall pass (task-independent) then a keep-biased grounding/verification pass. On the 79-line real capture this went from 1 finding to 8 distinct, correctly-cited ones (1.1.1, 1.3.1, 1.4.5, and four 2.4.4 link-purpose issues), with no regression on the planted sample.
- [x] **Eval suite** scoring the judge against authoritative ground truth (W3C BAD before/after reports, a chrome-free conformant reference page from W3C WAI, and a planted sample), with an automatic scorer that reports recall on failure cases and false-positive counts on conformant ones. `src/eval/`, `npm run eval`.
- [x] **Recall 100%** on observable failures (before + planted) with **0 false positives** there. Fixed a `1.3.1` over-flag (no heading-level-skip flags; requires plain-text-title evidence).
- [x] **Consensus mode** (`JUDGE_CONSENSUS=N`): judge N times, keep only findings recurring in a majority, to cut run-to-run noise. Opt-in (N x cost).
- [x] **Resolved a conformant-page false positive by research, not punting.** The WAI "Change Text Size or Colors" finding was verified against W3C's own source markup (a correct `<a>` with descriptive text), confirmed a false positive, root-caused to the role-less skip-link nav at the top of the read, and fixed with a judge guard (descriptive text IS a name; reserve 4.1.2 for role-only-no-name).
- [x] **Cleaned the "after" fixture** (stripped the W3C demo switcher chrome) and **added the W3C BAD survey page** as a form-heavy failure case. Recall is now 100% across all three failure cases, including unlabelled form controls (`4.1.2`) the home pages did not exercise.
- [x] **Quantified consensus; not defaulting it.** `JUDGE_CONSENSUS=3` suppresses *flaky* false positives (varying criterion run to run) but NOT *stable* ones, and costs N x. The one surviving conformant-page FP (WAI) is stable, so consensus does not fix it and is not worth forcing on every run. Consensus stays opt-in as a reproducibility/precision lever.
- [x] **Fixed a wrap-around capture bug.** NVDA "read next" looped back to the top of long pages, duplicating ~36% of the WAI transcript (150 -> 88 phrases after the fix). Cheaper, cleaner captures. `src/capture/nvda/capture-core.mjs`.
- [x] **Methodology audit + contamination test.** `docs/METHODOLOGY.md` audits our LLM-as-judge usage against established practice and recalibrates the headline numbers as preliminary. A fresh, never-published authored page (`src/eval/pages/contamination-test.html`) scored 4/4 recall with 0 false positives, which is evidence that recall is genuine judging rather than memorization, and is also our first held-out case. The biggest remaining gap is an expert-labeled human-agreement baseline.
- [x] **Grounded in primary W3C material.** Criteria are version-tagged (2.0/2.1/2.2, parsed from each spec) so findings can be reported against WCAG 2.1 AA (the legal baseline, e.g. EN 301 549) as well as 2.2 AA. The observable-subset scoping is validated against W3C's POUR principles, and the tool is positioned against ATAG (a Part B tool whose own outputs must meet Part A). See `docs/METHODOLOGY.md`.
- [ ] **Remaining conformant FP is a known, proven, low-confidence (~0.66) artifact**, not a judge logic gap: NVDA announces the top-of-page skip-link/controls region as role-less text (e.g. "Change Text Size or Colors"), which the judge reads as a possibly-unexposed control even though the source is a correct link. Real fixes: capture-side skip-link handling, or cross-check a flagged control against the page DOM before reporting (a tool feature, not more prompt patching). Confidence-tiering the report (surface <0.7 as "needs human check") would also neutralize it.
- [x] **W3C tutorial baseline (all 6 topics).** 12 paired good/bad pages authored fresh from the W3C WAI tutorials (images, forms, page structure, tables, menus, carousels) with W3C-derived ground truth: `src/eval/pages/tutorials/`. Good pages score 0 findings; bad pages are caught in every topic (100% recall, 0 false positives). It surfaced (and then fixed, via a generalising hint) a real recall gap on missing table-header association. Carousels test only the observable subset; their motion/keyboard/focus issues are documented as out of scope for a passive read. Authoritative, contamination-resistant, held-out.
- [ ] Grow the eval set further (MDPI LLM-auditing dataset, public-sector accessibility statements, ACT Rules cases).

**Acceptance:** on real pages, the judgment is credible AND reasonably complete, and a human can verify each finding from the transcript. The capture clears this bar; the judge's recall does not yet.

### M1 — v1 open-source tool

- [ ] CLI: `a11y-witness <url> --task "..."` produces an evidence-backed report (findings, WCAG references, confidence).
- [ ] Real navigation as reusable strategies: read-through, by-heading, by-landmark, forms, task completion.
- [ ] Portable control plane (container) that dispatches to capture workers and runs the judge. Judge made provider-pluggable (Codex CLI / OpenAI / Anthropic / local) so others are not tied to one account.
- [ ] Make the NVDA worker reproducible and usable by others (per ADR 0001): a one-command PowerShell bootstrap for any Windows box, and a GitHub Actions `windows-latest` job so contributors run the full pipeline with zero infra.
- [ ] Repo polish: examples, contribution guide, basic CI (typecheck and lint).
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
- **Capture is OS-bound.** No single portable container runs the whole product; capture workers live where the operating system allows (Windows for NVDA, a Mac for VoiceOver). The portable core hides this from users, but it shapes the infrastructure. See ADR 0001.
