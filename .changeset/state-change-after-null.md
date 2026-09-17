---
"@a11ign/evidence": patch
"@a11ign/judge": patch
---

**A failed disclosure re-read is no longer printed as the word "null" (#1616).** When the probe's re-read after activating a disclosure control fails, the capture records the entry with `after: null` and `error` set. The published `CaptureInteraction` type now declares `stateChanges[].after` as `string | null`, and says what `null` means: the re-read failed, not that nothing was announced. The verifier's title check no longer matches the word "null" from such an entry, and the judge's prompt omits the pair instead of showing `-> "null"`.
