---
"@a11ign/evidence": patch
---

`censusElementCounts` and `censusFromDiagnostics` no longer report `candidates` (a fact about how many
CDP page targets the census's read had to choose from) as an element type. Both readers now share one
predicate (`censusNumericCounts`) instead of two copies of the same denylist. `graphicUnnamed` and
`graphicExempted` are unaffected — they are genuine sub-counts, not incidental leakage.
