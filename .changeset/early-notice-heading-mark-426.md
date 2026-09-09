---
"@a11ign/evidence": patch
---

The consent-overlay doubt is reported as soon as the heading sweep has a result, rather than after every
structural sweep has finished.

`earlyContainmentVerdict` read the `structural` mark, which is written only after the heading, landmark AND
formField sweeps — and `formField` is the expensive one. Measured across the 14 most recent real captures,
`structural` lands between 23.1s and 402.5s (the latter on a 453-second capture). The heading sweep's own
`found` is identical to `structural.headings` on all 14, so the verdict is unchanged and only its arrival
moves: 402.5s to 99.0s on the worst case, 238s to 85s on calendly.

Additive and fallback-only: a capture with no heading-sweep mark still decides off `structural` exactly as
before, so no cached capture is invalidated and no protocol bump is needed.

#426's bar moved with this, from "inside the first minute" to "as soon as the first sweep has a result".
The minute is unreachable at any gate — `pageState`, the denominator, does not itself land until 61-68s on
10 of the 14 captures, because the read-through ahead of it is 81-86% of that window.
