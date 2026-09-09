---
"@a11ign/evidence": minor
"a11ign": minor
---

`npm run witness` now prints an early, in-flight notice within roughly a minute of capture start when a
page looks like it is heading toward a "contained" doubt (a consent overlay Escape could not dismiss) —
previously this warning only appeared after the whole capture finished, which could be several minutes
later with no intervening output.

The early reading uses the SAME threshold `captureDoubt`'s finished-capture verdict already applies
(`@a11ign/evidence/verify`'s new `earlyContainmentVerdict`), read off marks the worker's `/progress`
endpoint already reports — nothing new is recorded by a capture, and no cached evidence is affected. The
notice is purely informational: it never changes whether or how a capture proceeds, and prints at most
once per capture. `earlyContainmentVerdict` and its `EarlyContainmentVerdict` type are additive exports.
