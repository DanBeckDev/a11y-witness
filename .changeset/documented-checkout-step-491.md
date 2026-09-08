---
"a11ign": patch
---

Fixed the copyable GitHub Actions workflow in this package's README: it was missing an `actions/checkout` step, so a reader copying it exactly got an empty workspace and the Action never reached the page.
