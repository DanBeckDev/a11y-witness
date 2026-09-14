---
"@a11ign/nvda-worker": patch
"@a11ign/evidence": patch
---

**Every capture's `environment` now records the CSS viewport the page was read at: `innerWidth`, `innerHeight`
and `devicePixelRatio`.** They are read from the page after it settles and before any probe runs.

**Why.** Captures launch the browser maximized with no window size, so the width is whatever each worker's display
is. Responsive pages show different content either side of a breakpoint. Two captures of one page yielded different
findings at different widths, and nothing recorded which width produced which evidence (#1513).

**What changes.**
- The fields are absent when the width was not measured, whether by an older worker or a read that failed. They are
  never zero.
- A capture retried after a recoverable fault records the retry's read.
- `/health` is unchanged.
- The published `CaptureResult.environment` type declares all three as optional.

**What does not.** The width is not part of the capture cache key, and it is not a fleet-consistency field. The
capture protocol is unchanged, and so is the browser's command line. Pinning the window size is separate work.
