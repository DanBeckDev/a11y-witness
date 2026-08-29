---
"@a11y-witness/scorer": major
---

Retrained scorer weights (`candidate`).

**Major, and not because the API changed — because the weights ARE the API.** A consumer's build can go
from passing to failing with no code change on their side, which is breaking however small the diff looks.

Provenance, so a disputed finding can be traced to the model that produced it:

- records: `2487`
- in-distribution floor: `0.5587`
- derived floor: `0.5587`
- floor source: `training-set-minimum`
- encoder: `53aa51172d142c89d9012cce15ae4d6cc0ca6895895114379cacb4fab128d9db`
- feature schema: `screenreader-structured-v15`

Per-subtype thresholds:

- `1.1.1:filename-alt` threshold `0.6125354170799255`
- `1.1.1:generic-alt` threshold `0.28568199276924133`
- `1.1.1:missing-alt` threshold `0.2454271912574768`
- `1.3.1:fake-heading` threshold `0.5021799206733704`
- `1.3.1:no-headings` threshold `0.2818658649921417`
- `1.3.1:unassociated-table` threshold `0.7586143016815186`
- `2.1.1:control-unreachable-by-keyboard` threshold `0.5798165798187256`
- `2.1.2:focus-trapped` threshold `0.9872035980224609`
- `2.4.1:skip-link-inert` threshold `0.6030886769294739`
- `2.4.2:route-title-stale` threshold `0.9999765157699585`
- `2.4.3:focus-order-scrambled` threshold `0.9636672139167786`
- `2.4.4:regex` threshold `0.7761198878288269`
- `2.4.6:regex` threshold `0.18483798205852509`
- `3.3.1:validation-error-silent` threshold `0.8977609872817993`
- `3.3.2:unnamed-form-field` threshold `0.6633455157279968`
- `4.1.2:state-change-silent` threshold `0.28238606452941895`
- `4.1.2:unnamed-control` threshold `0.9474985003471375`
- `4.1.3:form-activation-silent` threshold `0.9052718281745911`

Held-out acceptance: passed.
