---
"@a11ign/evidence": minor
"@a11ign/judge": patch
---

A sweep that reports reaching the end after finding far less than the page's census is no longer read as
the page having nothing more. `Completeness` gains `"elsewhere"`, and the new `sweptElsewhere(capture)`
returns the sweeps it applies to. It covers a link sweep that reached `exhausted` in both directions having
announced under `LINK_SWEEP_OF_THE_PAGE_FROM` (0.54) of the census's distinct links, on a page with at
least `LINK_CENSUS_FLOOR` (10) of them. Below that floor the rule does not judge. Something held that
sweep: a chat widget, a consent overlay, or a cause nobody has read. This is a verdict about coverage, not
a widget detector. A graphic sweep in the same capture follows the link verdict. The first container the
sweep announced is reported as a hint, or `null`. `sweepCompleteness` reports the verdict,
`captureSupports` refuses to support absence and says what held the sweep, and the new `whatHeldTheSweep`
is the one wording both use.

`@a11ign/judge` now fails closed. `assertableSweep` and the criterion outcomes treat a sweep as examined
only when its verdict is `exact` or `unknown` (`EXAMINED_IN_FULL`). Any other verdict, including one added
later, refuses an absence claim and withdraws a pass. Before this change, a verdict the judge did not list
fell through to "absence allowed" and "examined in full".

Nothing changes in what a capture records. A capture is never rejected for this: a keyboard-trap page
traps its sweeps by design, and that trap is the finding. If you switch exhaustively over `Completeness`,
add the new case.
