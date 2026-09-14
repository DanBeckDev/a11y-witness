---
"a11ign": patch
---

**The job summary no longer presents axe findings inside an embedded frame as the page's own.** On `https://www.w3.org/WAI`, the page the docs recommend, the summary read "Rule layer (axe-core): 3 violation(s)". All three were inside the embedded YouTube player. The run artifact's conformance block said third-party content is not distinguished from the author's own, but the report never repeated it.

The rule layer's count line now splits out rows inside a frame, for example "3 violation(s), 3 inside a frame". Each such row is marked "in a frame; origin not examined", and a caveat beside the table says the content may be third-party. A row is treated as inside a frame when its axe target crosses a frame boundary. The result does not record whose frame it is, so the report never says it IS third-party. Findings that are not inside a frame render as before (#1388).
