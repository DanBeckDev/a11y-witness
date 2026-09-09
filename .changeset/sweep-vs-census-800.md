---
"a11ign": patch
---

#800 asked whether IKEA serves 265 form controls or the sweep walks more than is there. **Neither is
established, and the reason is that the question cannot be asked of any capture on disk: the two numbers
describe different moments and one of the instruments moves the page it measures.**

`sweepAgainstCensus` compares each sweep's `found` against the census's **raw** element count — never
`distinct`, which #737 established counts nameless elements as separate names. It issues **no verdict**
from these captures, and the ratios are reported with the reason:

```
type        ratios (complete sweeps only)   completeness   verdict
formField   --   --   --   2.17 2.12        t t t c c      not-simultaneous
graphic     --   --   1.41 1.41 --          n n c c t      not-simultaneous
heading     0.96 0.96 1.16 1.16 1.16        c c c c c      not-simultaneous
landmark    0.86 0.86 0.86 0.86 0.86        c c c c c      not-simultaneous
link        --   --   --   --   --          n n t t n      not-simultaneous
```

**Two distinctions had to be built before that was visible, and each changed the answer once.**

**A ratio only means anything from a sweep that ENDED.** `sweepCompleteness` draws three states:
`exhausted` and `silent` are a sweep running out of elements; `deadline`, `cap`, `error` and
`focusModeStuck` are a sweep being cut off, and its `found` is a lower bound. Read without that,
`formField` gives `0.45 0.45 2.27 2.17 2.12` and looks like a comparison changing sign; three of those
five are truncations. These are `examinationState`'s three states (#677), one level down at the sweep.

**A ratio only means anything if both sides describe the same moment.** The census is read at t≈0 and
`formField` walks at t≈300-400 s, activating 64 controls while it walks — so on a lazy-loading page every
ratio above 1 is the page growing between two reads, and nothing here can tell that from over-walking.

**`heading` is the nearest thing to a control and shows why.** No `onItem`, walks at ~100 s, and it
announces **80 on all five captures** while the census reports 83 then 69. A numerator holding still under
a denominator that moves 17% is not that numerator's control.

**The gate is not permanent and not a placeholder.** It opens on `readAtMs` — a field no capture carries,
because `structureCensus.atMs` is stamped at MARK time and the census is read at the top of
`navigateByStructure` and marked after it returns, so that field is off by the whole capture. A test pins
the behaviour the fix unlocks so the gate cannot quietly become permanent.

One thing ruled out cleanly: **the sweep is not double-counting.** All 265 announcements on the 14:31
capture are distinct, and still 265 after normalising away every state word.

`sweepNeverRan` and `sweepCompleteness` live in `sweep-costs.mjs` as the one place that decides how far a
sweep got, because a second spelling is how two readers drift apart.
