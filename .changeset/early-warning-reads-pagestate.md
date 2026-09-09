---
"@a11ign/evidence": minor
"a11ign": minor
---

The early consent-overlay-style notice `npm run witness` prints during a capture (added in #676) now
reads a different, earlier diagnostic mark and no longer names "consent" specifically.

`earlyContainmentVerdict` previously waited for `structureCensus`, which #426's own fleet measurement
found lands at the very END of a capture — its timestamp equalled the total capture duration in all nine
real captures measured, so a verdict waiting on it is never early. It now reads `pageState`'s raw DOM
element count (recorded immediately before the structural sweep, well before a capture's later probes
run) against the same `structural` mark as before, discriminating the identical real cases 80-90 seconds
sooner: verified against three real captures (theregister.com and hubspot.com as positives from two
different mechanisms, en.wikipedia.org — the slowest of the three — as a control that must not fire).

The notice's own wording no longer names a consent overlay as the cause: hubspot.com fired it from an
unrelated mechanism, so a consent-specific sentence would have been wrong on a real page that triggered
the same, honest "reached almost none of this page" finding.
