---
"@a11ign/worker-fleet": minor
---

`doctor --json`'s `next_command` is now a runnable command or `null`, never an English sentence — and a
check that has advice a shell cannot run carries it in a new `note` field instead.

**This can change what your automation reads.** `next_command` was always a string, and could be prose:
a failing `worker` check on a Mac emitted *"unlock the Mac if it is locked, then re-run …/worker-ctl.sh
pool"*, which nothing can execute — and, on a machine where the local-VM path is deprecated, running it
reproduced the refusal it was offered for. **Anything that executed `next_command` looped.** It is `null`
now when no command can be constructed, so a consumer can tell "there is nothing to run, read the checks"
from "here is what to run". If you interpolate `next_command` into a shell line, handle `null`.

The remedy for a deprecated local-VM refusal is now `npm run fleet:status` — the command the refusal
itself names — rather than the script that just refused.
