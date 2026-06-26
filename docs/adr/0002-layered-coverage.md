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
