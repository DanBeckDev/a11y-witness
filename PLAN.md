# a11y-witness — Plan of Attack

## North star

Make the real assistive-technology experience of any website measurable and improvable. Drive a real screen reader through real navigation, use AI to judge whether the experience is coherent and usable, and make every judgment trustworthy and checkable. Open core (AGPL-3.0, dual-licensed): the engine is open; a hosted product can sit on top.

## Guiding principles

1. **Model how screen readers are really used**, reading in browse mode, jumping by headings and landmarks, completing tasks, operating controls. Never tab-through; tabbing tests keyboard reachability, not the reading experience.
2. **Trustworthy by construction.** Every finding cites a WCAG criterion, carries a calibrated confidence, and is verifiable by a human against the actual announcements. The overlay vendors lost the market (and drew an FTC fine) by over-claiming. We do not.
3. **Prove the riskiest thing first.** The core bet is unproven; everything waits on M0.
4. **Open core.** AGPL-3.0 engine (dual-licensed: free under AGPL, commercial licence available), with a hosted/enterprise layer possible later. Copyleft keeps a competitor from closing a hosted fork; dual licensing keeps the business open.

## Milestones

### M0 — Spike: is the core bet real? (now)

Prove that an AI model can judge the real screen-reader experience trustworthily, then prove we can capture that experience from a real screen reader.

**Judge half — substantially proven.**

- [x] AI judge produces WCAG-cited, confidence-scored verdicts. `src/spike/judge.ts`
- [x] Judge grounded in the verified WCAG 2.2 A/AA criteria and cites only from that list. `src/wcag/criteria.ts` (validated against the W3C spec)
- [x] Catches the planted defects consistently and avoids false positives. `src/spike/judge-sample.ts`
- [ ] Pre-register what "trustworthy enough" means, then confirm across N real pages against an expert.

**Capture half — the remaining risk, now on Windows/NVDA.**

VoiceOver capture was deferred: macOS AppleScript automation is fragile and deprecating (`-1708`), and VoiceOver cannot be containerised or run by contributors. Capture moves to NVDA on Windows, the most representative and most reliably automatable target. See `docs/adr/0001-capture-architecture.md`.

- [ ] Stand up one NVDA-on-Windows capture worker (Guidepup) on a Proxmox VM, behind a `POST /capture` service. `src/capture/backend.ts`
- [ ] Drive one real page through real navigation, capture the announcement transcript, pipe it to the judge, and make the go/no-go call.

**Acceptance:** on real pages, the judgment is credible and a human can verify each finding from the transcript. If it is hallucinated or noisy, stop and rethink before building further.

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
