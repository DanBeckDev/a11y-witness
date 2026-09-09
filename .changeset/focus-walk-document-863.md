---
"a11ign": patch
---

**`probeFocusOrder` reported `cycled` at 14 stops and `truncated` at 90 on the same requested URL ten
minutes apart, and the two walks were on different websites.**

```
capture    stops  verdict     the document the walk actually ran on
12-49-29     14   cycled      accounts.google.com/v3/signin/identifier
12-59-26     90   truncated   calendly.com/scheduling
```

Across the eight calendly captures on disk the split is **4/4 with no exception**: every `cycled` walk ran
on Google's sign-in page, every `truncated` walk ran on a calendly URL. `probeConfiguredForm` activates
"Continue with Google" and the focus probe runs afterwards — the #685/#691 mechanism, one probe further on
than the census fix (#699) reached.

**The census cannot contradict it and is not wrong to fail to.** It reads at t≈0 and correctly reports
`targetMatch: matched` for calendly; the walk happens ~300 s later somewhere else. Every mark is truthful
about its own moment, and the capture as a whole reads as one page.

**So the `focusOrder` mark now records which document it walked.** `pageState(focus)` (#758) already
fingerprints it, but as a separate mark joined to this one only by ordering — and 2.1.1, 2.1.2, 2.4.1,
2.4.3 and 2.1.4 all read `focusOrder` as evidence about the requested page. The URL is read **before** the
first Tab, for the reason `censusBeforeNavigating` is where it is.

**The row's hypothesis is refuted, and stating that is part of the answer.** It expected `cycled` at 14 to
be a FALSE COMPLETION, since `focusOrderCycled` compares phrases — the ambiguity `sweepInDirection`
refuses in its own comment. Measured on **all 16 `cycled` verdicts in the corpus: every one is a genuine
ring return**, the opening three phrases appearing at exactly two indices, `0` and `length - 3`, never in
the middle. The ambiguity is real and nothing in the corpus shows it firing, so nothing is changed on
suspicion.

**And the same table forced a second finding.** IKEA reports `stops: 0` on every capture with `cycled`,
`stalled` and `truncated` all false — three booleans over four loop exits, so "the first Tab announced
nothing" and "this page has no tab stops" arrived identically, beside the same capture's
`focusConfinement` mark reporting `controlsOnPage: 265`. The walk now records **why** it ended
(`cycled`/`stalled`/`silent`/`deadline`/`cap`), and `sweepOutcomes` reports a `silent` walk so 2.1.2 and
2.4.3 get a `cantTell` instead of a clean channel from a probe that never read one.

`truncated` keeps its exact meaning, derived from the stop reason rather than recomputed, with a test
driving both formulas over every combination — it is what `sweepOutcomes` turns into the `cantTell` that
stops 2.1.2 claiming an unearned pass, and narrowing it would quietly convert those into assertions. The
new outcome gates on the PRESENCE of `stop`: a capture taken before this cannot say which ending it had,
and inventing truncation in old evidence is the wrong direction to be wrong in.
