---
"@a11ign/nvda-worker": patch
"@a11ign/worker-fleet": patch
---

The browser profile a capture ran against is now part of the capture cache key and a fleet-consistency
field. A cold profile and a warm one are different evidence — a fresh user-data-dir shows the browser's
first-run surface, which the screen reader can record as page content, and a learning profile changes
what form fields announce. Existing profiles are ADOPTED rather than treated as changed, so no cached
capture is invalidated by this shipping; only a genuinely new or wiped profile moves the key.
