---
"@a11ign/evidence": patch
---

#869: `OracleCounts`/`oracleCounts()` now pass through an optional `formInputs` field (form controls'
`autocomplete` attribute) for 1.3.5 Identify Input Purpose, mirroring `media`'s existing contract exactly.
Absent on every capture that exists today — no worker-side census populates it yet (issue #170) — so this
is additive only and changes nothing for an existing consumer.
