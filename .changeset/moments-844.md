---
"a11ign": patch
---

**#844 closes on "still no, and here is the number" — a bound rather than an absence.**

#800 asked whether IKEA serves 265 form controls or the sweep walks more than is there. #850 refused any
verdict because no capture recorded WHEN its census was read; #854 added `readAt.startedAtMs` so they
could. **The answer that unlocked is worse than unknown: on the 14 captures now carrying it, the census
lands at 28–67 s and the `formField` sweep walks at 37–280 s.** Knowing both moments proves they are not
the same moment. A gate that opened merely because the moments were recorded would have read *"we can see
the gap"* as *"there is no gap"*.

**The control the row named is what opens it instead.** `heading` carries no `onItem`, so the sweep
changes nothing, and a heading is a heading in the DOM, in the accessibility tree and to NVDA alike — no
role argument reaches it. **A `heading` ratio of exactly 1 is direct evidence the page did not change over
that interval**, whatever its length, and it replaces a threshold on time that somebody would have had to
choose. `populationVerdict` now refuses without it; every row carries `sweptAt` and `apartMs`, so the
comparison is labelled at the point it is produced rather than in a document.

**A ratio below 1 is not a shrinking page.** hubspot's `heading` reads 0.04 — the sweep was sealed inside
a chat dialog and exhausted it (#897). The control returns "could not report" rather than answering about
the page, so a reader is not sent looking for growth that never happened.

**Acceptance 3 reproduced, and gained a control the row did not have.** The heading gap is positive on
salesforce (+5) and ikea (+11), and **exactly zero on eight w3.org captures** — the census and the sweep
agree precisely when the page holds still.

**And the row's first option is refuted by measurement.** The DOM census beside the AX one:

```
capture       DOM formField    AX formControl    sweep found    heading ratio
ikea                     51               136            270             1.16
salesforce                7                18             27             1.11
tfl                    1392                15             34             1.00
w3.org                   15                15             15             1.00
```

**On ikea and salesforce the AX bucket is already wider than the DOM's form elements** — 136 against 51 —
so widening `FORM_CONTROL_ROLES` moves the denominator further from the page. **And tfl rules out page
growth on its own**: `heading` reads 1.00 while `formField` reads 2.27, with 1392 DOM form elements above
both. Three instruments, three populations, on one still page.

The decision is recorded where the census is defined: option 1 refused, option 2 cheap and unable to
attribute, and **only recording the role each announcement came from can tell a narrow bucket from a
growing page** — the successor row.
