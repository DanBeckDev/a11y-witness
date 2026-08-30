---
"@a11y-witness/scorer": major
---

Retrained scorer weights (`candidate`).

**Major, and not because the API changed — because the weights ARE the API.** A consumer's build can go
from passing to failing with no code change on their side, which is breaking however small the diff looks.

Provenance, so a disputed finding can be traced to the model that produced it:

- records: `2525`
- in-distribution floor: `0.5587`
- derived floor: `0.5587`
- floor source: `training-set-minimum`
- encoder: `53aa51172d142c89d9012cce15ae4d6cc0ca6895895114379cacb4fab128d9db`
- feature schema: `screenreader-structured-v17`

Per-subtype thresholds:

- `1.1.1:filename-alt` threshold `0.5224750638008118`
- `1.1.1:generic-alt` threshold `0.2896837592124939`
- `1.1.1:missing-alt` threshold `0.23577257990837097`
- `1.3.1:fake-heading` threshold `0.5112959146499634`
- `1.3.1:no-headings` threshold `0.6229730844497681`
- `1.3.1:unassociated-table` threshold `0.7170230746269226`
- `2.1.1:control-unreachable-by-keyboard` threshold `0.27427592873573303`
- `2.1.2:focus-trapped` threshold `0.9817374348640442`
- `2.4.1:skip-link-inert` threshold `0.9777466654777527`
- `2.4.2:route-title-stale` threshold `0.8808057308197021`
- `2.4.3:focus-order-scrambled` threshold `0.9682316184043884`
- `2.4.4:regex` threshold `0.8216695189476013`
- `2.4.6:regex` threshold `0.5087588429450989`
- `3.3.1:validation-error-silent` threshold `0.4480331838130951`
- `3.3.2:unnamed-form-field` threshold `0.7057158350944519`
- `4.1.2:state-change-silent` threshold `0.3094142973423004`
- `4.1.2:unnamed-control` threshold `0.9152524471282959`
- `4.1.3:form-activation-silent` threshold `0.9555568695068359`

Held-out acceptance: passed.
