---
"a11ign": patch
---

Fixed #567: the Action's own PR-comment step (`if: always()`, so it still reports when an earlier step
failed) crashed with `Cannot find package '@a11ign/worker-fleet'` whenever that earlier failure happened
before `npm ci` had run in the Action's own checkout — which defeated the honest "no report was produced"
message #493 added, since the step that would print it died on import first. The Action no longer depends
on a workspace package to report its own failure.
