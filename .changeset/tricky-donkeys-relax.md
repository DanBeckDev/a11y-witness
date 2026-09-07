---
"@a11y-witness/judge": patch
---

`CRITERION_COVERAGE["4.1.3"].status` (exported from `@a11y-witness/judge/internal`) changes from
`"assessed"` to `"partial"`, with a `needs: ["screen-reader"]` field added. The criterion's note was
already explicit that only one of its four categories (success/results of an action) is covered --
waiting-state and progress status messages are not -- and the status field now agrees with it.

This does not change what the shipped judge asserts: `assessedCriteria()` (the count of criteria that
produce findings) is a separate, untouched export, and 4.1.3 still ships a finding exactly as before. A
consumer reading `CRITERION_COVERAGE` directly to distinguish exact coverage from partial coverage will
now see 4.1.3 correctly classified as the latter.
