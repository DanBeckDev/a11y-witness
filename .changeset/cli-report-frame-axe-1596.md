---
"a11ign": patch
---

**The CLI's text report no longer prints axe findings inside an embedded frame as the page's own.** On `https://www.w3.org/WAI`, `npx a11ign` listed three violations that were all inside the embedded YouTube player, with nothing to say so. The job summary had the same defect and #1388 fixed it there.

The rule-based layer's count line now splits out findings inside a frame, for example "3 violation(s), 3 inside a frame". Each such finding is marked "(in a frame; origin not examined)", and a caveat below the list says the content may be third-party. The rule and the wording are #1388's: a finding is inside a frame when its axe target crosses a frame boundary. The result does not record whose frame it is, so the report never says it IS third-party. Findings that are not inside a frame print as before (#1596).
