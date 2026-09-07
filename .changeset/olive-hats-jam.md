---
"a11ign": patch
---

The human-readable report now says `asserted` and `referred` where it previously said `FAILED` and
`NEEDS REVIEW` for a per-criterion outcome — worded per ceo's ruling on #242. The ACT vocabulary term
(`failed`/`cantTell`) is named exactly once, in the legend's own parenthetical, never repeated at each
finding.

`--json` and the `ActOutcome` values it carries (`"inapplicable" | "passed" | "failed" | "cantTell" |
"untested"`) are unchanged: `printJson()` never imports from `report.ts` and passes `outcomes:
CriterionOutcome[]` through to `JSON.stringify` untouched, so a script parsing `--json` output is
unaffected — only the human-facing text report's wording moved.
