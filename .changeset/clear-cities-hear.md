---
"a11ign": patch
---

The warning printed when a capture cannot be trusted to describe the requested page (a consent overlay
the tool could not dismiss, or content that still doesn't match the page's title after retrying) now gets
the same WHAT/TRY/WHERE remediation a worker fault does, instead of a bare sentence — issue #398. The
underlying judgement is unchanged: this only makes the message actionable.

