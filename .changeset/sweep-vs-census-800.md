---
"a11ign": patch
---

#800 asked whether IKEA serves 265 form controls or the sweep walks more than is there. **The answer is
neither, and the reason is that the two numbers do not count the same population.**

`sweepAgainstCensus` compares each sweep's `found` against the census's **raw** element count — never
`distinct`, which #737 established counts nameless elements as separate names and so inflates the very
denominator the check rests on. Across the five IKEA captures, every one `targetMatch: matched` on one URL
with no navigation:

```
type        verdict          ratios (found / raw census)
formField   unstable         0.45 0.45 2.27 2.17 2.12
heading     agrees           0.96 0.96 1.16 1.16 1.16
landmark    agrees           0.86 0.86 0.86 0.86 0.86
link        census-exceeds   --   --   0.13 0.12 --
graphic     unstable         --   --   1.41 1.41 0.37
```

**The `formField` comparison changes sign** — the sweep finds less than half the census in the morning and
more than twice it in the afternoon, on one page in one day. A denominator whose comparison inverts is not
measuring its numerator's population, and a verdict read off it would be a real number about the wrong
thing.

**`heading` and `landmark` agree on the same five captures**, which is what makes that a finding rather
than a broken census: the instruments *can* agree, and the disagreement is specific to one bucket.

The three instruments are three definitions — `domCensus.formField` counts DOM form elements,
`structureCensus.formControl` counts AX nodes in `FORM_CONTROL_ROLES` (which excludes `link`, `menuitem`,
`option` and `tab`), and `sweep.found` counts distinct announcements NVDA's form-field key produced.

One thing this rules out cleanly: **the sweep is not double-counting.** All 265 announcements on the 14:31
capture are distinct, and still 265 after normalising away every state word.

`sweepNeverRan` moves into `sweep-costs.mjs` as the one place that decides whether a sweep ran, because a
starved sweep reports `found: 0` and produces a ratio of `0.00` that reads as catastrophic coverage — the
same defect the cost replay found in its own first output, arriving in a different divisor. On these
captures `link` reads `0.00 0.00 0.13 0.12 0.00`, and three of those five are deadline stops.
