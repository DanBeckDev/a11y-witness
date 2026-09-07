---
---

`worker-fleet` is a published package and this changes `src/cli-flags.mjs`, which builds into the
shipped `dist`. It is a BUG FIX to a guard that was silently inert through a symlink: a CLI invoked via an
npm `.bin` link now refuses an unknown flag instead of ignoring it and reporting success.

No API changes and no behaviour change on the direct path — the guard already fired there. Recorded as
empty rather than a patch bump because no consumer imports `cli-flags` today; if that changes, this is the
entry to point at.
