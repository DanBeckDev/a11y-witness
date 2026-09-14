---
"@a11ign/nvda-worker": patch
---

**A capture that left the site before its focus pass now records `focusReveal` and `focusEvents` as not run.** Before, `observed` named only `focusOrder` and the four opt-in focus probes, so those two channels had no record and did not read as "not examined" (#1575).

The worker's skipped-focus channels are now the focus step's channels. A test pins them equal, as text, to `@a11ign/evidence`'s `FOCUS_STEP`.
