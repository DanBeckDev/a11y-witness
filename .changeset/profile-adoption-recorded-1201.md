---
"@a11ign/nvda-worker": patch
---

A worker now prefers a provisioning-recorded fact over inference when reporting whether its Edge profile
was adopted or created fresh. Previously this rested entirely on the presence of Edge's own `Local State`
file: if Edge stopped writing it, every profile would report as fresh, the cache key would move, and
nothing would say so. Where no record exists — every profile provisioned before this — behaviour is
unchanged, so no cached evidence moves. Where the record and Edge's file disagree, the worker logs it
naming both possible causes rather than picking one.
