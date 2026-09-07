---
"@a11ign/judge": patch
---

The 2.4.2 (Page Titled) `stale-route-title` rule no longer fires on two shapes that read identically
to a real route change under its "the first heading changed" proxy: a link announced as opening in a
new window/tab (WCAG's own Understanding text calls this shape structurally inapplicable — activating
it cannot change this document's title, because no navigation of this document occurred), and a
heading announced inside a `dialog` container (a modal that just opened, or a consent overlay
switching panels within itself). Both are read from NVDA's own announcement rather than inferred from
page content.

This rule has always mapped `secondary` (`cantTell`, a referral) — it has never asserted a conformance
failure — so the change reduces false REFERRALS, not false assertions. A genuine stale-title route
change is still reported exactly as before.
