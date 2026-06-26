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
- **Control plane** (anywhere): the `witness` CLI asks a worker to capture a page, then judges the transcript locally via Codex (your subscription login, so no metered API cost), and prints WCAG-cited findings.

## Quickstart

Prerequisites: Node 20+, and Codex installed and logged in (`codex login`) on the machine running the CLI. A reachable NVDA capture worker (see `src/capture/nvda/README.md` to stand one up).

```bash
npm install
A11Y_WORKER=http://<worker-host>:8765 \
  npm run witness -- https://example.com --task "Find the contact details"
```

This drives a real screen reader through the page, captures what it announces, and prints an AI judgment of whether the experience was usable, with WCAG-cited findings you can verify against the transcript. Add `--json` for machine-readable output.

## Licence

`a11y-witness` is licensed under the **GNU Affero General Public License v3.0 or later** (`AGPL-3.0-or-later`); see [`LICENSE`](./LICENSE). The engine is open source. Because the AGPL's network copyleft requires anyone who runs a modified version as a service to publish their changes, the project stays genuinely open while a closed, hosted fork is not a free ride.

**Commercial licensing.** If the AGPL's obligations do not fit your use, for example embedding `a11y-witness` in a closed-source product or a proprietary hosted service, a separate commercial licence is available. Open an issue to start the conversation. A hosted version and enterprise features may sit on top of the open core later, the same open-core model NetBox Labs uses.
