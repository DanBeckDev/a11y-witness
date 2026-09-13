---
"@a11ign/nvda-worker": patch
---

A capture no longer inherits the previous capture's resolved page URL. The two URLs a capture
tracks — the one it asked for and the one its navigation landed on — now share a single reset at
the capture boundary; before, only the first was cleared there and the second was cleared only when
a navigation happened to run, so a worker serving many captures could carry a stale landing URL
between them.
