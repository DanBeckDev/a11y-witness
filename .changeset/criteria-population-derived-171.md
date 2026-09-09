---
"@a11ign/judge": patch
---

`action.yml`'s "the number that matters more on a REAL page" claim was hand-counted and wrong (#171):
it said TWELVE and named only 3.3.3, 3.2.1 and 3.2.2 as exceptions to `RULE_CRITERIA`, while
`criterion-coverage.ts` itself already declares `realPageEvidence.available: false` for two more
rule-owned criteria — 1.4.2 (the probe runs and has simply never observed autoplaying media on a real
capture) and 1.4.13 (the probe has not yet been turned on for real-page captures). The real count is
ELEVEN.

`coverage.ts` exports two new pure functions, `realPageUnfireableCriteria()` and
`realPageAssessableCriteria()`, deriving the real-page-reachable set from `RULE_CRITERIA` and
`CRITERION_COVERAGE`'s own `realPageEvidence` field rather than a hand-maintained list.
`documented-criteria.test.ts` pins `action.yml`'s "still N" number and its except-clause against these
derivations, so the two surfaces cannot drift apart again silently. `RELEASE.md`'s matching prose is
corrected the same way.
