---
"@a11ign/evidence": minor
"a11ign": minor
---

Every sweep now fingerprints the document it is about to walk, and the report can say **which** sweep a
mid-run navigation happened during (#758).

`documentIdentity` (#687) gives a capture one identity; `targetMatch` (#699) says whether the census
described the requested page. Neither localises a navigation that happens *during* the run — and two
fingerprints per capture bracket **eight** sweeps, so a capture that moved could be seen to have moved and
not to have moved anywhere in particular.

`documentChangedDuring` reads the served URL from each `pageState` mark and names every boundary the
document changed across. On the two calendly captures already on disk:

```
probeForms ON    sweep -> focus   calendly.com/  ->  accounts.google.com/v3/signin/identifier
probeForms OFF   sweep -> focus   calendly.com/  ->  calendly.com/scheduling
```

**Both arms navigated** — the "probeForms off" arm reached another calendly page, so it did not hold
still, and only the per-sweep `found` counts (link 82 against a census of 76, versus link 5) say the ON
arm's sweeps were the ones walking the other document. That correction came from writing the reader: the
first version compared element counts and reported a change in both arms, which is true and useless
because a page that lazy-loads content changes its counts without changing document. **Identity is the
served URL, not the shape** — the same distinction #687 had to draw, one level in.

`collectByType` now calls the existing `markPageState` as `sweep:<type>`, at the **one** place every sweep
reaches the page, so `sweepEveryStructuralType`, `sweepExtraTypes` and `rescanFormFieldsAfterSubmit` are
all covered by a single line and `probeStates` groups them for free — no new mark, no new comparator, and
`FINGERPRINT_KEYS` still spelled once.

The granularity is reported rather than assumed: with per-probe marks the answer is "between sweep and
focus", a window containing eight sweeps; with per-sweep marks it names the sweep. Reporting the first as
though it were the second would be invented precision.

`pageState` also records `tookMs`. Its own header calls the fingerprint cheap, and this adds one per
sweep to what is already the largest phase of a real page — so the cost of the instrument is now a number
in the next capture rather than a claim in a comment.
