---
"@a11ign/evidence": minor
"@a11ign/judge": patch
---

A sweep that ran out inside a container is no longer read as the page having nothing more. `Completeness`
gains `"elsewhere"`, and the new `sweptElsewhere(capture)` returns what triggered it. A link sweep that
reached `exhausted` in both directions, having announced under 0.3 of the census's distinct links,
finished inside a container, such as a chat widget that opened by itself. It never covered the page. A
graphic sweep in the same capture follows that verdict. The first container NVDA announced is named, or
`null`. `sweepCompleteness` reports it, and `captureSupports` refuses absence with the container in its
reason.

In `@a11ign/judge`, `"elsewhere"` refuses an absence claim exactly as `"truncated"` does and counts as an
incomplete feed. Before this change the verdict would have fallen through to "absence allowed".

Nothing changes in what a capture records. A capture is never rejected for this: a keyboard-trap page
traps its sweeps by design, and that trap is the finding. If you switch exhaustively over `Completeness`,
add the new case.
