---
"@a11ign/judge": patch
---

**A criterion both layers cover now weighs axe-core's violation instead of ignoring it (#1342).** `criterionOutcomes` never read the rule layer for a criterion the screen-reader layer covers, so the V1 rehearsal's axe `link-name` violation reached neither 2.4.4 nor 4.1.2, and on a page whose sweeps had finished such a criterion read `passed`. Now a violation beside the screen-reader layer's `cantTell` is `failed`, asserted by axe-core; beside `passed` or `inapplicable` it is `cantTell`, a disagreement between the layers with no assessor; the screen-reader layer's own `failed` stands; and a criterion axe found no violation of keeps its screen-reader outcome. Each reason states both layers' facts.
