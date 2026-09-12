---
"@a11ign/nvda-worker": minor
---

Before the sweeps, a capture now returns focus to the top document when focus sits inside a frame that
nothing of ours put it in. On #951's page, #953 measured that on 6 of 6 collapsed captures: a chat widget's
frame held focus before the first probe, so every sweep type walked the widget instead of the page.

- **The decision.** It is taken once, from the reading `runProbeSequence` already makes before its first
  step, and only when that step is the sweep. Under `probeOrder: focus-first` the Tab walk runs first, so no
  restore happens.
- **The restore.** It blurs the focused frame and focuses the window through CDP, and adds nothing to the
  page.
- **The record.**
  - A `focusRestore` diagnostic mark on every capture, either `attempted: false` with the reason, or
    `attempted: true` with the frame.
  - `observed.headings.focusRestored: { from, left }`, where `left` comes from the first sweep's own
    `focusInFrame`.
- **The backstop.** Any sweep that starts inside a frame is marked incomplete: `complete: false`, with
  `heldBy` naming the frame.

This is an evidence change, and it shares `CAPTURE_PROTOCOL_VERSION` 17 with #170's `formInputs`.
