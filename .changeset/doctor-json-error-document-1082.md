---
"@a11ign/worker-fleet": minor
---

**`doctor --json` now emits a JSON document when it CANNOT produce one.**

A check that threw used to exit 1 with **zero bytes on stdout** and the failure on stderr — where a
`--json` consumer never looks. For a caller, **"could not ask" and "no output" are different facts and
only the first is actionable**: the second is indistinguishable from a command that was never run.

On a throw, `--json` now writes to stdout and still exits non-zero:

```json
{ "ready": false, "error": "<the real failure text>", "checks": [] }
```

**`error` is present only in this document**, so its presence is the signal that no verdict exists. A
successful run is byte-for-byte what it was: `ready`, `next_command`, `checks`, no `error` key. **Read
`error` before `ready`** — a consumer that reads only `ready` sees `false` and cannot tell a
NOT-READY checkout from a run that died.

**`checks` is present and EMPTY rather than absent or partial.** Absent crashes a consumer reading
`.checks[]`. Partial would be worse: it reads exactly like a complete verdict, and nothing in it
distinguishes a check missing because it passed from one missing because the run died under it.

`2>&1` is not a substitute and would be actively harmful here: stdout is a parsed format, so redirecting
stderr into it produces invalid JSON — worse than nothing, because a consumer that parses gets a syntax
error instead of a document.

The human (non-`--json`) output is unchanged and keeps the full stack trace.
