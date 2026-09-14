---
"@a11ign/judge": patch
---

**1.4.13, 3.2.1 and 3.2.2 no longer read `inapplicable` when their probe never ran or checked something.** Each of these criteria is now read from its probe's own verdict (#1378):

- **The probe never ran, or could not tell** (for example, the census was unavailable): `cantTell`, "not collected".
- **The probe had nothing to act on** (nothing focusable, or no edit field): `inapplicable`, as before.
- **The probe checked one control, one field, or a short run of tab stops and found no failure:** `cantTell`, saying one control was examined and not the page. It is never `passed`, because one control does not show that the page conforms.

Previously, every one of these states read "The page exposed nothing of the kind".
