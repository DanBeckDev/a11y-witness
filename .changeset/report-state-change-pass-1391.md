---
"@a11ign/judge": patch
"a11ign": patch
---

**The job summary now shows a state change the screen reader announced correctly, as evidence observed.**
When a disclosure control is announced `collapsed`, activated, and then announced `expanded` (or the reverse),
the report quotes both announcements under "Evidence observed". Before this, a run could collect exactly that
evidence and the report said nothing about it. The line never names a WCAG criterion or says anything passed: one
control behaving correctly is not a result for the page.

**`@a11ign/judge/rules` exports `announcedStateChanges(changes)`.** It lists the state-change pairs whose state
changed, read through the same checks as the `4.1.2:state-change-silent` rule: a role whose activation is Enter,
the same control named before and after, and an expandable state on both sides. A combo box, a pair naming two
different controls, or a pair without an expandable state is never listed, exactly as the rule never reads it.
The rule's own findings are unchanged.
