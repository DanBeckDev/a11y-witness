---
"@a11ign/judge": patch
---

**2.4.3 Focus Order no longer reports a reordering when the page's Tab order simply started part-way round.** The
focus probe records a Tab walk that can begin past the page's first control, leave the page through the browser's own
controls, and come back in at the start. Read as a straight line from its first stop, that walk put the page's first
control last, and 2.4.3 fired on a page whose Tab order matches its reading order. On
`ico.org.uk/action-weve-taken/enforcement/` it reported "Cookie options" as moved from first to last.

The walk is now read from where Tab enters the document: the first page control after the browser's address bar. A
walk with no address bar is read as before, because a control first in reading order and last in the walk may really
be last in Tab order. A genuinely different Tab order still fires either way (#1514).
