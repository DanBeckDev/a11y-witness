# a11y-witness

> Working name, easy to change later. Judge the real assistive-technology experience of a website with AI.

Most accessibility tools check whether code satisfies mechanical rules, and they reliably catch only about a third of WCAG. The rest is the lived experience: whether what a screen reader actually announces, as a real person navigates, is coherent and usable.

`a11y-witness` drives a **real screen reader** through a page the way a real user navigates it, reading in browse mode, jumping by headings and landmarks, completing a task, and uses an AI model to judge whether that experience was coherent and usable. Every finding cites the specific WCAG criterion it rests on, carries a confidence level, and can be checked by a human against the actual announcements.

It does **not** tab through the page and call that a screen-reader test. Tabbing only reaches interactive controls and skips the way screen-reader users actually read and explore a page. Modelling real navigation is the whole point.

## Status

Early. The current focus is the **M0 spike**: proving that an AI model can judge the real screen-reader experience trustworthily enough to be credible. See [`PLAN.md`](./PLAN.md).

## Quickstart (the spike)

The spike drives **VoiceOver** on macOS, the cheapest first target. NVDA and JAWS on Windows are planned coverage milestones; see `PLAN.md` for why they matter.

Prerequisites:
- macOS, with VoiceOver automation enabled (System Settings, Accessibility, VoiceOver) and your terminal allowed to control VoiceOver. Guidepup documents the exact toggles: https://www.guidepup.dev/docs/guides/voiceover
- Node 20 or newer.
- Codex installed and logged in (`codex login`). The AI judge runs through the Codex SDK on your existing Codex subscription, so there is no metered API cost.

```bash
npm install
npm run spike -- https://example.com "Find the contact details and read them"
```

The spike opens the page, drives VoiceOver through real navigation, captures what it announces, and prints an AI judgment of whether the experience was usable, with WCAG-cited findings you can verify against the transcript.

## Licence

Apache-2.0, open core. The engine is open source; a hosted version and enterprise features may sit on top of it later, the same model NetBox Labs uses.
