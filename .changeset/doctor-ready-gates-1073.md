---
"@a11ign/worker-fleet": minor
---

`doctor`'s `ready` is now computed over the checks a capture run actually needs, rather than over every
check — so a freshly cloned checkout with a worker configured reads **READY** instead of NOT READY.

**What changes for a consumer.** `doctor --json`'s `ready` was `checks.every(c => c.ok)`. It no longer is:
a failing `dataset` check (no training corpus generated) reports its FAIL with its fix and does **not**
make the verdict NOT READY. Every other check still decides, so a failing `worker`, `judge`, `pages`,
`run`, `contention`, `isolation` or `dist-*` still reads NOT READY. **If you reconstructed `ready`
yourself from the `checks` array, your copy and `doctor`'s now disagree** — read the `ready` field.

Each check declares whether it gates, and adding one without declaring is refused rather than defaulted.
