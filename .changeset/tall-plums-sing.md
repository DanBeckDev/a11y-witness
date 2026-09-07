---
"@a11y-witness/judge": minor
---

Added a deterministic rule for WCAG 1.3.5 Identify Input Purpose (Failure F107): a form field that
already declares an `autocomplete` attribute, but whose value is not a recognised input-purpose token
from the HTML autofill vocabulary, is now flagged as a `secondary` finding. Fields with no `autocomplete`
attribute at all are not flagged — this covers only the malformed-value half of the criterion, not
whether a purpose is declared in the first place. `1.3.5:input-purpose-invalid` is now a rule-owned
subtype.
