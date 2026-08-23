# Marketing & Comms Backlog

This tracks the owned-channel comms plan for a11y-witness: building real-world adoption, a dated public track record of growth, and independent third-party recognition, on a no-paid-spend, owned-channels-only budget.

**Budget:** no paid spend — owned channels and Daniel's time only.
**Roles:** Charlotte creates, collates and manages content and channels day to day. Daniel reviews, edits and approves everything before it goes out under his name (2–4 hours/week), and supplies the technical substance, demos and real findings the content is built from.

**How to use this backlog:** check an item off via PR when it's done. Add yourself as `Owner` when you pick something up. Priorities are `High` / `Medium` / `Low` relative to the phase they sit in, not the whole backlog. Open a PR against this file for any status change so history stays visible — don't just edit on `main`.

---

## Objectives, in priority order

1. Reach the people who own accessibility risk day to day — engineers and QA leads shipping consumer-facing products, especially in sectors exposed to ADA/WCAG litigation or compliance audits (retail, finance, higher education, government contractors, healthcare).
2. Convert awareness into one real, named external user — worth more than any vanity metric.
3. Build a dated public record of growth (stars, forks, Action installs, outside PRs).
4. Earn independent recognition — third-party coverage, a conference acceptance, a community citation. Independent validation carries far more evidential weight than anything posted on our own channels.

---

## Phase 1 — Foundation (now → mid-September 2026)

### Repo & site groundwork

- [ ] **MKT-001** — Add GitHub Topics (`accessibility`, `a11y`, `wcag`, `screen-reader`, `nvda`, `testing`, `github-actions`) to repo settings. _Owner: Dan · Priority: High_
- [ ] **MKT-002** — Add a social preview image in repo Settings, so links shared to LinkedIn/X/Slack render as a card. _Owner: Dan · Priority: Medium_
- [ ] **MKT-003** — Turn on GitHub Discussions as the public home for questions and case studies, separate from Issues. _Owner: Dan · Priority: Medium_
- [ ] **MKT-004** — List the Action on GitHub Marketplace with clear category tags. _Owner: Dan · Priority: High_
- [ ] **MKT-005** — Pin 2–3 Discussions/Issues that show the roadmap and invite outside contribution. _Owner: Dan · Priority: Low_
- [ ] **MKT-006** — Add a11y-witness to the `/open-source` page on danielbeck.dev (currently lists module-federation/vite and QwikDev/partytown contributions only). _Owner: Dan · Priority: High_
- [ ] **MKT-007** — Refresh the `/speaking` page on danielbeck.dev — last entry is 2022; needs a current "available topics" line covering accessibility testing. _Owner: Dan · Priority: Medium_
- [ ] **MKT-008** — Get a progress update on the real-page evidence dataset (26 of 77 target pages captured per ADR 0016) and a realistic view of when it could reach a publishable point. No action needed on `a11y-corpus` itself — it's intentionally permanent and private. _Owner: Dan · Priority: Medium_
- [ ] **MKT-009** — Set up a simple metrics tracker (see [Metrics to track](#metrics-to-track)) so a baseline is captured before activity ramps up. _Owner: Charlotte · Priority: High_

### Long-form content — danielbeck.dev is the anchor

All long-form pieces are published on **danielbeck.dev** first, then repurposed per the [waterfall model](#waterfall-content-model) below. Match the site's existing format: 7–9 minute reads, tagged, categorised. Daniel's existing readership is AI-engineering/agent-systems focused, not accessibility-focused — the calendar below opens with a piece framed for that existing audience before bridging into accessibility-specific content.

- [ ] **MKT-010** — *"I built a judge that's allowed to say 'I don't know'"* — the hybrid rule+ML judge and abstention design, framed as an AI-engineering case study (held-out acceptance: 58 true positives, 0 false positives, 0 false negatives across 8 scored criteria; the published 225-shortcut audit; the contamination-test page). _Owner: Charlotte (draft) / Dan (review) · Priority: High · Pillar: Rigor/research, audience bridge_
- [ ] **MKT-011** — *"One command, no screen reader required"* — GitHub Action quickstart, screen-recorded demo (3-line YAML → PR comment). _Priority: High · Pillar: Ease of adoption_
- [ ] **MKT-012** — *"Why a11y-witness listens instead of scanning"* — the axe-core 57% stat (Deque's own figure), the README's "Learn more" link example and its transcript. _Priority: Medium · Pillar: What it is / performance_
- [ ] **MKT-013** — *"What axe-core can't see"* — a real finding against a public W3C tutorial page, evidence line included. _Priority: Medium · Pillar: What it does / proof_
- [ ] **MKT-014** — *"The three parts"* — architecture deep-dive: pipeline, reproducible screen-reader infrastructure, the model being trained. _Priority: Medium · Pillar: Rigor/research_
- [ ] **MKT-015** — *"Why this tool will never give you a score"* — the WCAG-EM reasoning against aggregate scores. _Priority: Medium · Pillar: Uniqueness/trust_
- [ ] **MKT-016** — *"Where this sits next to axe-core and the rest"* — honest, sourced competitive positioning (see [Competitive landscape](#competitive-landscape)), framed as complementary, not adversarial. _Priority: Medium · Pillar: Uniqueness_
- [ ] **MKT-017** — Milestone recap post — whatever's true by then (stars, an external PR, Action installs) plus a look ahead. _Priority: Low · Pillar: All four, tied together_

### Conference / speaking

- [ ] **MKT-018** — Watch deque.com/axe-con from September for the 2027 call for speakers. Free, fully virtual, no travel — the primary speaking target given the UK base and budget. Not yet published. _Owner: Charlotte · Priority: High_
- [ ] **MKT-019** — Decide as a team whether CSUN (Anaheim, 8–12 March 2027) is worth the self-funded travel/registration cost — it's in-person only with no speaker travel funding. If yes: Innovation Track and Pre-Conference Workshop track are open now, closing 22 September 2026 (Journal Track closes earlier, 1 September). _Owner: Dan + Charlotte · Priority: Medium, time-sensitive if pursued_
- [ ] **MKT-020** — Note Inclusive Design 24 (#id24) 2027 edition (~September 2027) and Access:Given (Newcastle, UK, 28 April 2027) as free/UK-based options to watch for a future cycle — both fall later in the year than the rest of this plan's near-term window. _Owner: Charlotte · Priority: Low_

---

## Phase 2 — Outreach and amplification (mid-September → November 2026)

- [ ] **MKT-021** — Show HN launch, timed to a real milestone or strong post rather than the calendar — one-shot, so time it well.
- [ ] **MKT-022** — Cross-post into Reddit (r/accessibility, r/webdev, r/programming), dev.to, and the A11Y Slack community — read each community's self-promotion rules first.
- [ ] **MKT-023** — Direct outreach to 8–12 target companies/consultancies with a low-friction ask: "run it once against a page you own, tell us what it finds." This is how the project gets its first external "stranger" (see [Case study plan](#case-study-plan)).
- [ ] **MKT-024** — Submit a PR to `awesome-accessibility` / `awesome-actions` lists.
- [ ] **MKT-025** — Pitch 2–3 podcasts or guest posts once there's a concrete result to talk about (Smashing Magazine, CSS-Tricks, the A11Y Project, Deque's blog).
- [ ] **MKT-026** — If coverage allows, publish the real-page evidence dataset (CC BY 4.0) as its own launch — dedicated post, Show HN/dev.to separate from the tool's own launch, and a listing on Hugging Face Datasets / Papers with Code. Conditional on MKT-008 — don't force a release before ADR 0016's coverage/documentation gaps are genuinely closed.
- [ ] **MKT-027** — Publish a standalone technical write-up of the methodology (held-out evaluation design, corpus construction), independent of any conference cycle. arXiv preprint is a stretch goal.

---

## Phase 3 — Consolidation (December 2026 → January 2027)

- [ ] **MKT-028** — Collect and date-stamp every metric, mention and testimonial gathered so far (screenshot at the moment it happens, not reconstructed later).
- [ ] **MKT-029** — Request short written statements from anyone — company or individual — who used the tool, even informally.
- [ ] **MKT-030** — Compile a dated summary of traction so far: metrics trend, named users, coverage, speaking outcomes.
- [ ] **MKT-031** — Keep publishing at a light, steady cadence so momentum stays visible.

---

## Waterfall content model

One long-form anchor post on danielbeck.dev, repurposed with a different angle per channel — not just re-posted as a link:

| Channel | Angle |
|---|---|
| **danielbeck.dev (anchor)** | Full technical depth, 7–9 min read, matches existing site format |
| **LinkedIn** | Reframed for engineering leaders/consultancies — the business-relevant abstraction, not the code |
| **X thread** | Technical thread pulling out the concrete numbers/code/transcript, native format |
| **YouTube** | Short screen-recorded demo or walkthrough pulled from the same material (channel already exists via danielbeck.dev nav) |
| **dev.to** | Near-verbatim cross-post into its accessibility tag community |
| **Reddit / A11Y Slack** | Share once published, following each community's own rules |
| **Earned (HN, podcasts, newsletters)** | Only once the piece has proven itself — feed in finished material, don't pitch cold |

Worked example — MKT-010 ("I built a judge that's allowed to say 'I don't know'"):
- Blog: full architecture + eval numbers.
- LinkedIn: *"Most AI features either hallucinate confidently or refuse everything. Here's how we taught ours to know the difference."*
- X thread: the actual held-out numbers (58 TP / 0 FP / 0 FN across 8 criteria), the 225-shortcut audit.
- YouTube: a short screen recording of a real abstention happening live — the tool declining to score an unfamiliar page.
- dev.to: cross-post.
- Earned: this is the piece to submit to Hacker News once live — "a small model that says I don't know" is a strong HN-flavoured hook.

---

## Messaging pillars

1. **What it is / how it performs** — axe-core catches ~57% of WCAG issues automatically (Deque's own figure); a11y-witness drives real NVDA through real navigation for the rest, with every finding cited to the transcript line it came from.
2. **What makes it different** — see [Competitive landscape](#competitive-landscape) below. Lead with openness, cost, privacy and evidence-transparency, never "the only tool that...".
3. **Ease of integration/adoption** — a three-line YAML block on a GitHub-hosted Windows runner. No signup, no API key, no local infrastructure. Address the Windows/NVDA requirement head-on, then show the Action already solves it.
4. **The rigor behind it** — the deterministic rule layer is gated on zero false positives against 934 conformant records, re-verified on every push; the scorer's held-out results (58/0/0 across 8 criteria); the project publishes its own blind spots (225 measured shortcuts, the contamination test).

## Competitive landscape

| Category | Examples | How a11y-witness compares |
|---|---|---|
| Rule-based scanners | axe-core, WAVE, Lighthouse, Pa11y, Accessibility Insights | Complementary, not competing — a11y-witness can consume an existing axe run directly. Deque's own figure: axe-core catches ~57% of WCAG issues automatically. Pitch is "add this on top," not "replace your scanner." |
| Closest direct comparator | **AssistivLabs** — commercial, cloud-based, private beta; also drives real NVDA/VoiceOver plus keyboard/mouse/visual checks; claims ~44/55 WCAG AA criteria | Honest comparison: AssistivLabs currently claims broader criteria coverage. a11y-witness's real advantages: free and open source (AGPL), no signup/account, local-by-default judge (nothing leaves the machine), every finding cited to an exact transcript line. **Do not claim broader coverage** — a11y-witness's own docs put current coverage at 14/55 criteria today, on a published growth roadmap. |
| Overlay / auto-remediation vendors | AccessiBe-style widgets | Actively differentiate away from these — the FTC has fined overlay vendors for overclaiming. a11y-witness's README already positions against this ("it will never give you a score"). Never let a11y-witness's own claims drift toward that territory. |

**Message discipline:** never write "the only tool that...". If asked directly about AssistivLabs or similar, answer plainly — the credibility is worth more than winning that one comparison.

## Case study plan

**Tier 1 (achievable now):**
- Run a11y-witness against W3C's own WCAG tutorial pages (already used in the eval fixtures) and publish the findings as a worked example — no consent question, these pages exist to be tested.
- Stronger option, if cleared: run it against Daniel's own production work at NetBox Labs. The most credible "real business" proof available today, but needs employer sign-off first since it touches their product/brand. If declined, write up the pattern found without naming the company.

**Tier 2 (the real prize, sequenced into MKT-023):**
- Pitch the case study itself as the incentive: "run this once, we'll write up what it found together, with your name and quote if you want it."
- Target accessibility-forward companies and consultancies first — clearest incentive to participate, and consultancies can reuse it with their own clients.
- Keep the format light: 500–800 words — problem, finding, change, one quote. Dated, external, not self-published — one of the strongest proof points in the whole plan.

## Metrics to track

Simple, dated, monthly snapshot:

- GitHub stars, forks, watchers
- GitHub Action Marketplace installs
- npm downloads, once the CLI package is published
- External pull requests and contributors
- Named companies/individuals confirmed using the tool
- Blog post views, where available
- LinkedIn and X follower counts and engagement rate
- Earned mentions: press, newsletters, podcasts, community shares
- Speaking submissions made and their outcomes
- Testimonials or quotes collected

## Tone and risk notes

- Match the README's own discipline — precise, sourced, dated claims. This audience is unusually alert to overclaiming.
- Be upfront about the AGPL licence when talking to companies; raise the commercial licensing option proactively once a conversation turns toward production/enterprise use.
- Lead with the GitHub Action path in outward-facing content — no local infrastructure needed. Save the Windows/NVDA worker detail for audiences already past that objection.
- Don't manufacture urgency or inflate traction. A quiet trickle of real, verifiable usage is worth more than a burst of vanity metrics.
