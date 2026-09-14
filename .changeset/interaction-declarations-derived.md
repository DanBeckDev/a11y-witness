---
"@a11ign/evidence": patch
"@a11ign/judge": patch
"@a11ign/scorer": patch
---

**`CaptureInteraction` now declares the fields a capture actually writes on its change entries, and every copy of
that shape derives from it.** `formChanges` entries declare `kind`, `baselineQuiet` and `baselineWaitedMs`, and
`stateChanges` entries declare `afterSource` and `error`. All are optional, because older captures do not carry them.
`kind` was already read by 3.3.1 and the submit checks through hand-written copies while the published type omitted
it.

The declarations in `@a11ign/evidence` (verify, left-site), `@a11ign/judge` (`RuleInput`, local-judge) and
`@a11ign/scorer` (evidence units) now derive from `CaptureInteraction` instead of restating it. This is a types-only
change: nothing reads a capture differently.
