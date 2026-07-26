# ADR 0002: Layered coverage — rule-based (axe-core) + lived-experience (screen reader + AI judge)

- Status: Proposed
- Date: 2026-06-26

## Context

Two coverage gaps became clear while building the W3C tutorial baseline.

1. **A screen reader cannot perceive visual properties.** Colour contrast, use
   of colour, target size, focus appearance, reflow, and text spacing are real
   WCAG A/AA criteria, but they are never announced. No amount of screen-reader
   capture covers them.
2. **A single passive read-through misses interaction.** Real NVDA use is more
   than reading top to bottom (see https://webaim.org/articles/nvda/): browse
   mode vs focus mode, single-key navigation (H, T, F, B, L, K, D), operating
   controls (Enter/Space/arrows), tabbing through forms, the Elements List, and
   reacting to dynamic state (expanded/collapsed, live regions, focus moves).
   A top-to-bottom read misses keyboard operability, focus management, form
   interaction, state-change announcements, and table-cell header announcements.

Meanwhile, mature rule engines already solve the mechanical/visual layer well.
Deque reports that **axe-core automatically finds ~57% of WCAG issues and flags
~43% as needing human review**. That 43% — the judgment-based, lived-experience
part — is exactly what we automate.

## Decision

Adopt **layered coverage**, each layer doing what it is best at:

- **Layer 1 — Rule-based (axe-core, MPL-2.0).** Run axe-core on the same page
  the capture already loads. Deterministic and high-precision for contrast,
  colour, ARIA validity, parsing, names/roles, target size. Results are tagged
  by WCAG version/level. We do NOT reimplement these checks.
- **Layer 2 — Lived-experience (screen reader + AI judge).** Drive a real screen
  reader and judge the announced experience. Evolve capture from one passive
  read into an **interaction model**: multiple navigation strategies (by
  heading, landmark, form field, table), operating controls in focus mode
  (activate, expand menus, fill forms), and capturing the dynamic state changes
  that result. This covers the interaction issues a passive read misses.
- **Layer 3 — Needs human review.** What neither layer can determine (is
  auto-rotation genuinely distracting; is alt text accurate rather than merely
  present; is the reading order meaningful) is surfaced for a human, the way
  axe flags "incomplete". We never silently claim coverage we do not have.

Findings merge into one report, each attributed to its source (rule-based /
lived-experience / needs-human-review) and its WCAG criterion and version.

## Why complementary, not competing

This sharpens the product thesis rather than diluting it. We do not compete with
axe-core; we cover the blind spot it openly acknowledges. Deque says ~43% needs
human judgment — we automate much of that 43% by driving a real screen reader
and applying an AI judge to the lived experience, while axe covers the ~57% it
does best. Together they approach complete WCAG coverage. Using the industry
standard rather than reinventing contrast/ARIA rules is also the mature choice.

## Consequences

- **New dependency: axe-core (MPL-2.0).** Compatible with our AGPL-3.0 (MPL 2.0
  permits combination with (A)GPL; axe-core stays under MPL as a dependency).
  It runs in the browser we already launch for capture.
- **Capture grows** from a passive read to an interaction model (this is PLAN
  M1's "real navigation as reusable strategies ... forms, task completion").
  More complex, and far more representative of real use.
- **Honest scoping.** We stop implying the screen-reader layer sees visual
  issues; every finding's source and confidence is explicit.
- **The eval must grow** to score each layer: axe findings are deterministic
  (assert exact rule outcomes on fixtures); the AI-judge layer keeps its
  recall/precision eval against the W3C tutorial baseline.

## Status

Proposed. Suggested order: integrate axe-core first (a fast, deterministic win
that immediately closes the visual/mechanical gap), then evolve the
screen-reader capture into the interaction model.

Both are now done. See the amendment below for how Layer 1 changed once it was in use.

## Amendment (2026-07-26): Layer 1 is optional, and may be fed rather than run

The decision above is unchanged in substance — layered coverage, and we still do not
reimplement contrast/ARIA rules. What changed is that **running axe ourselves is no
longer required**.

Two things became clear once the layer existed:

1. **The cost is entirely in the dependency, not the code.** Measured: 99 lines,
   ~1 second, running concurrently with a ~53-second capture, so it adds no wall-clock
   and has needed no maintenance. But `playwright` pulled ~536 MB of Chromium as a hard
   dependency, for one `page.goto` plus `analyze()`.
2. **Most adopters already run axe.** Running a second, differently-versioned copy in
   the same CI produces duplicate findings from two engines that can disagree — worse
   than not having the layer. "Do not reimplement axe" is served better by *consuming*
   their results than by executing our own.

So:

- `playwright` and `@axe-core/playwright` move to `optionalDependencies`, imported
  dynamically. Their absence is a supported state that reports how to enable the layer.
- `--axe-results <file>` imports results produced elsewhere (`{violations}`, an array of
  those from the axe CLI, or a bare violations array), mapped through the same code as
  our own run so a finding cannot differ by who scanned. A recorded `url` that disagrees
  with the target warns.
- `--no-axe` / `A11Y_AXE=0` disable it outright.
- The report distinguishes **"did not run"** from **"ran and found nothing"**. This
  follows directly from the "never silently claim coverage we do not have" rule in the
  Decision above: an empty rule section that reads as a pass is exactly the false
  assurance this ADR exists to avoid.

One coupling had to be removed first. The page title used to verify the worker read the
right page came from axe's Playwright page, so disabling axe would have silently
disabled a capture-integrity check. It now comes from `src/scan/page-title.ts`, which
fetches the page directly — and deliberately **not** from the worker's own report of
what it saw, since verifying a capture against its own claim is circular.
