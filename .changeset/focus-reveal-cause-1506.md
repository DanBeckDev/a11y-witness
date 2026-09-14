---
"@a11ign/nvda-worker": patch
---

**The focus-reveal probe (1.4.13) now separates a reveal caused by focus from content that arrived on its own.**

**How it separates them.** Each tab stop reads the accessibility-tree census immediately before its Tab, and focus is
credited only with what grew since that read. A late script or an on-scroll element that adds content while the walk
runs is no longer credited to whichever control happened to hold focus.

**What the verdict records.**
- **`revealedNames`:** the names that appeared.
- **`timeSeparated`:** whether a control read was available. It is `false` for a caller that passes none, which keeps
  the old single-baseline comparison.

**What it changes.** For content that arrived on its own, `interaction.focusReveal.revealed` now reads `false` where it
read `true`. That is a change to what the evidence means. The capture-protocol bump that keeps older cached captures
apart ships separately (#1573), and no capture runs at this code until that bump is deployed (#1506).
