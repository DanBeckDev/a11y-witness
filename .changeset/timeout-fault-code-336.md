---
"@a11y-witness/nvda-worker": patch
"a11y-witness": patch
---

The hard capture timeout now carries a fault code (`hard-timeout`) instead of an untagged `Error`, so a
CLI reader gets a plain-language explanation — "the capture ran too long and was abandoned" — instead of
the generic no-remediation path. The message also names how far a partial capture got (the last recorded
progress phase, and how many progress marks were recorded) when the worker reported one, so "we ran out
of time partway through" and "we could not read your page at all" read as the different findings they
are. Additive on the wire: an older CLI reading a fault code it does not recognise already falls back to
"no remediation recorded" rather than failing, and an older worker's untagged timeout error is unaffected
by either side of this change.
