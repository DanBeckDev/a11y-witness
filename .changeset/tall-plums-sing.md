---
---

Adds the `formInputs` evidence channel and its `RuleInput` field to `criterion-coverage.ts` (issue #79),
groundwork for 1.3.5 Identify Input Purpose's F107 rule. Empty deliberately: the field is additive, no
capture populates it yet, and no rule reads it in this change — `RULE_CRITERIA`'s runtime throw
(`rules.ts:1584`) means registering the rule itself is a public, stranger-facing change, so it is held
out and lands together with #170's worker-side census on one sha instead. No consumer-visible behaviour
changes here.
