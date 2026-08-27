---
"@a11y-witness/scorer": major
---

Retrained scorer weights (`candidate`).

**Major, and not because the API changed — because the weights ARE the API.** A consumer's build can go
from passing to failing with no code change on their side, which is breaking however small the diff looks.

Provenance, so a disputed finding can be traced to the model that produced it:

- records: `2403`
- in-distribution floor: `0.5587`
- derived floor: `0.5587`
- floor source: `training-set-minimum`
- encoder: `53aa51172d142c89d9012cce15ae4d6cc0ca6895895114379cacb4fab128d9db`
- feature schema: `screenreader-structured-v15`

Per-subtype thresholds:

- `1.1.1:filename-alt` threshold `0.32926517724990845`
- `1.1.1:generic-alt` threshold `0.3435784876346588`
- `1.1.1:missing-alt` threshold `0.13268446922302246`
- `1.3.1:fake-heading` threshold `0.7896580696105957`
- `1.3.1:unassociated-table` threshold `0.46140962839126587`
- `2.1.1:control-unreachable-by-keyboard` threshold `0.00769696244969964`
- `2.1.2:focus-trapped` threshold `0.9553012847900391`
- `2.4.1:skip-link-inert` threshold `0.40875449776649475`
- `2.4.2:route-title-stale` threshold `0.6416189074516296`
- `2.4.3:focus-order-scrambled` threshold `0.9016615748405457`
- `2.4.4:regex` threshold `0.7862641215324402`
- `2.4.6:regex` threshold `0.2761210799217224`
- `3.3.1:validation-error-silent` threshold `0.7326130867004395`
- `3.3.2:unnamed-form-field` threshold `0.6583433151245117`
- `4.1.2:state-change-silent` threshold `0.2845833897590637`
- `4.1.2:unnamed-control` threshold `0.9458902478218079`
- `4.1.3:form-activation-silent` threshold `0.8407196402549744`

Held-out acceptance: passed.
