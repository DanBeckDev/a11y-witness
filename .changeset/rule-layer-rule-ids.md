---
"@a11ign/judge": minor
"a11ign": patch
---

**A precedence reason now names the axe rule that violated the criterion (#1606).** Where axe-core's violation outranks or disagrees with the screen-reader layer on a criterion both cover (#1342), the reason read "axe-core reported a violation of 2.4.4". It now reads "axe-core reported link-name as a violation of 2.4.4", naming every violating rule. **Breaking for a consumer of `@a11ign/judge/outcomes`:** each `RuleLayerCoverage` entry is now `{ verdict, rules }` (the new `RuleLayerEntry` type) instead of a bare verdict string. `rules` lists the axe rule ids that violated the criterion, and is empty for a criterion that was not violated.
