---
"a11ign": patch
---

`npm run lab:full-page-claims` counts how many real-page captures lose Requirement 2's full-page claim
under #894's `ranOutShortOfTheCensus`, and names the sweep that withheld it, per page.

Added as a lab job (`lab:job -e job=full-page-claims`) rather than a local script, because it reads
`runs/real-page-corpus`: a copy in any other checkout is only as fresh as its last sync, so a corpus-wide
count is a verdict only when the lab runs it. That is CLAUDE.md's "a gate that reads `runs/` is not yours to
report", and this is what lets the rule be obeyed rather than worked around with a loop over SSH.

Counts "cannot say" separately from "says no": captures with no usable census, and captures predating #887's
`trips`, are reported as their own totals rather than folded into the clean or the failing side.
