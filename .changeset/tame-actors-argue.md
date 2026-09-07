---
"a11y-witness": patch
---

The GitHub PR comment (`packages/cli/src/action/summary.ts`) no longer prints the raw ACT vocabulary
term `cantTell` at a reader who has no legend to explain it — worded `referred` instead, per ceo's
ruling on #242 (PR #252). Unlike the CLI's own terminal report, there is no legend here to house even
one parenthetical ACT mention, so the term does not appear at all in this renderer's output — a
stricter bound than #242's "exactly one occurrence, in the legend."

`--json` and `ActOutcome` are unchanged: `printJson()` (`cli.ts:719`) has zero references to
`report.ts`, and `summary.ts` reaches the `outcomes` field independently through its own path — a
script parsing `--json` output is unaffected.
