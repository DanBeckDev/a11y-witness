---
"@a11ign/nvda-worker": patch
---

**The DOM census no longer counts headings the page does not render.** A capture's census `heading` count used to include every `h1`–`h6` and `role="heading"` element not marked `aria-hidden`. That included an `h1` styled `display: none` below a breakpoint, and headings inside closed menu panels. On `weather.metoffice.gov.uk`'s warnings page the census read 40 headings while the accessibility tree and NVDA's heading sweep read 0. That reads as "forty headings the tree cannot see", when a visitor meets none of them.

The count now includes only headings the browser reports as rendered: `checkVisibility()`, and not inside an `[inert]` subtree. This is the same test the census already applies to tab stops. The headings it leaves out are counted beside it as `headingHidden`, so a capture says how many were set aside rather than dropping them silently. A browser without `checkVisibility` counts its headings as before (#1549).
