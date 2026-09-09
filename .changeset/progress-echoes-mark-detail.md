---
"@a11ign/nvda-worker": minor
---

`/progress`'s `phases` array now echoes every field a diagnostic mark carries (e.g. `structureCensus`'s
heading/landmark counts), not just `{event, atMs}`. That detail was already being recorded in memory on
every capture; this endpoint was discarding it at the final response step. Purely additive: existing
consumers reading `event`/`atMs` see no change, and the response only ever reports what was actually
observed, never a heuristic verdict computed from it. Does not change `CAPTURE_PROTOCOL_VERSION` (nothing
about what stored evidence means has changed), but does change `codeVersion()` since `server.mjs` is
hashed — deploy with `fleet:deploy` before relying on this over HTTP.
