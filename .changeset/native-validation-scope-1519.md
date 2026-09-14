---
"@a11ign/judge": patch
---

**3.3.1 Error Identification no longer reads `inapplicable` when a submitted form was rejected with text the tool could not recognise.** An empty submit on `w3.org/WAI`'s search was rejected, the page stayed, and the browser's own "Please fill out this field." sat on the page, never announced. `criterionOutcomes` reported 3.3.1 as `inapplicable` ("the page exposed nothing of the kind"). That is not what happened.

That shape now reads `cantTell`. The reason gives how many names were shown after the submit and how many were never spoken, and says that whether the page identified the error, including a browser's own validation message, needs a person. WCAG's Understanding 3.3.1 leaves whether native browser validation is accessibility supported to that judgement. The reason quotes no name, because which of them is the error cannot be told reliably.

Error text the tool recognises, heard or not, is judged exactly as before. So is a page with no submit, or one whose submit navigated. No finding is added, and no rule changes. 4.1.3 Status Messages still reads `passed` on the page's own changes, and its reason now says a browser's own form validation message is not judged under 4.1.3 (#1519).
