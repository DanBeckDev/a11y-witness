---
"@a11ign/evidence": minor
---

The conformance report now distinguishes a structural type that was **never examined** from one that was
examined and found nothing. A sweep that ran out of time reported the same `0 of 340` as a page with no
links, and the two need opposite responses: the first means the capture is truncated and every conclusion
drawn from it is bounded by the same budget. A type that was examined and then ran out is reported as
partial, which is neither of those. Existing captures without stop reasons are unaffected and continue to
report as examined.
