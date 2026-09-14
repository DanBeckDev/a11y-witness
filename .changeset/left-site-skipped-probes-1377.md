---
"@a11ign/evidence": patch
---

**When a capture left the page's site during its sweep, the probes that never ran now read NOT EXAMINED.** Before, 1.4.13
(content on focus), 3.2.1 (on focus) and 3.2.2 (on input) read "the page exposed nothing of the kind".

**Why they read that way.** `withinTheSite` named a skipped probe's channel only when its key was in the capture. The
worker writes those probes' fields only when they ran, so a skipped probe left no key and was never named. Now every
interaction channel of a step after the excursion is named, whether or not its key is present, and those criteria read
`cantTell`, naming the control where the examination ended. A sweep's structure key is still named only when present:
the worker writes every sweep's key, `[]` when it found nothing, so an absent one means the capture's code had no such
sweep.

Nothing that ran before the excursion is affected, and `withinTheSite`'s exports are unchanged (#1377).
