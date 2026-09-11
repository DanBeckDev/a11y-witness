---
"a11ign": patch
---

**A landmark sweep that stopped fewer times than the page has landmarks is now reported as short, even when
none of its announcements could be read as a landmark.**

It used to read "cannot say", and a finding treated "cannot say" as a full examination. On a page whose
named form Edge 152 announces as a "section", the sweep stopped once where the page has two landmarks, and
a criterion could pass as if the page had been examined in full. It now reads as short, so the pass is
withdrawn to "can't tell". A sweep that stopped as many times as there are landmarks, or more, still
reads "cannot say": a stop is not always a landmark, and counting stops would invent a complete sweep.
