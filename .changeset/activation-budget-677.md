---
"@a11ign/evidence": minor
"a11ign": minor
---

The per-field activation gets its own budget, and a control it never reached is no longer reported as a
control that said nothing (#677 part 2).

`formField` is the third of eight sweeps and the only one carrying an `onItem`, and that `onItem`
activates a control and waits for speech. Measured over three real captures, taking 180 ms/trip — what
every other sweep type costs — as the sweep's own price and attributing the excess:

| capture | fields | sweep | attributable to the activation |
|---|---|---|---|
| calendly, `probeForms` on | 18 | 57.2 s | 49.0 s (86%) |
| calendly, `probeForms` off | 46 | 138.7 s | 119.3 s (86%) |
| ikea | 100 | 322.3 s | 283.0 s (88%) |

On IKEA that consumed the whole capture: `formField` stopped on `deadline` and the five sweeps after it —
`graphic`, `link`, `list`, `frame`, `postSubmit` — each returned `deadline` having examined nothing. **Two
structural types out of eight**, and `postSubmit` is where 3.3.1 and 4.1.3 live.

The activation now stops at **half of what remains when its sweep begins**, so the sweeps after it keep at
least as much as it takes. One number, and it is the one that moves if the fleet measurement disagrees.
**The unit is a five-second wait, not a millisecond**: the cost divides out at 4.5–8.8 s per activation
against `STATE_WAIT_MS` of 5,000, so a budget buys a count of waits and covers fewer controls than a
reader would expect.

Controls the budget refused are **counted and reported**. A refused control produces no `formChanges` and
no `stateChanges` — byte-for-byte what a control that announces nothing produces — so the report now says
`40 of 100 form control(s) were NOT ACTIVATED`, and says every control was offered when none were refused.

**Also corrected: the coverage sentence was comparing unlike with unlike, and said it was not.** It
promised "distinct announcements against DISTINCT NAMES the browser reports — like compared with like",
but `distinct` collapses by name and an element with **no** name counts as its own. Measured: calendly
`graphic=63, graphicUnnamed=38, distinct=61` (two collapsed); ikea `graphic=205, graphicUnnamed=0,
distinct=165` (forty collapsed, correctly). So the reach denominator invented a shortfall in our own
report on any page with unnamed elements.

The two sentences now use two denominators, because they ask different questions:

- **`NOT EXAMINED (of N)`** counts every element on the page. An unnamed graphic that was never examined
  is unexamined.
- **`reach R/N`** counts only what a sweep could ever have announced — `distinct` minus the unnamed.

A nameless element is excluded from **reach** and never from **assessment**: 1.1.1 is one of the four
subtypes this project may assert, and its evidence is the unnamed count itself. Captures predating the raw
census fall back to exactly what they reported before.
