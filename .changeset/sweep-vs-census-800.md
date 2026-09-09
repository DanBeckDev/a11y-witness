---
"a11ign": patch
---

#800 asked whether IKEA serves 265 form controls or the sweep walks more than is there. **Every sweep that
ran to completion says the sweep walks more than is there** — the row's second branch.

`sweepAgainstCensus` compares each sweep's `found` against the census's **raw** element count — never
`distinct`, which #737 established counts nameless elements as separate names and so inflates the very
denominator the check rests on. Across the five IKEA captures, every one `targetMatch: matched` on one URL
with no navigation:

```
type        verdict          ratios (complete sweeps only)   completeness
formField   sweep-exceeds    --   --   --   2.17 2.12        t t t c c
graphic     sweep-exceeds    --   --   1.41 1.41 --          n n c c t
heading     agrees           0.96 0.96 1.16 1.16 1.16        c c c c c
landmark    agrees           0.86 0.86 0.86 0.86 0.86        c c c c c
link        cannot say       --   --   --   --   --          n n t t n
```

**A ratio only means anything from a sweep that ENDED.** `sweepCompleteness` draws three states, not two:
`exhausted` and `silent` are a sweep running out of elements; `deadline`, `cap`, `error` and
`focusModeStuck` are a sweep being cut off with elements it never reached, and its `found` is a lower
bound. The same three states `examinationState` draws for the report (#677), one level down at the sweep.

**That distinction changed the answer.** Read without it, `formField` gives `0.45 0.45 2.27 2.17 2.12` and
looks *unstable* — a comparison changing sign on one page in one day. Three of those five are truncations:
the morning pair stopped `deadline/deadline` and the 14:07 one stopped `cap/cap` at `MAX_SWEEP_STEPS`. The
two sweeps that actually ended agree with each other.

**`heading` and `landmark` agree on all five**, which is what makes the disagreement a finding rather than
a broken census: the instruments *can* agree, so it is specific to two buckets.

**`link` has no usable observation at all** — three never ran and two were cut off. Its raw `0.13`/`0.12`
would read as "the sweep reaches an eighth of this page's links"; both walked ~76 trips before the clock.
A lower bound is not a reach.

One thing ruled out cleanly: **the sweep is not double-counting.** All 265 announcements on the 14:31
capture are distinct, and still 265 after normalising away every state word.

`sweepNeverRan` and `sweepCompleteness` live in `sweep-costs.mjs` as the one place that decides how far a
sweep got, because a second spelling is how two readers drift apart.
