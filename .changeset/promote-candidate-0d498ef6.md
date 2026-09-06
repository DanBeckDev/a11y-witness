---
"@a11y-witness/scorer": major
---

Retrained scorer weights (`candidate`).

**Major, and not because the API changed — because the weights ARE the API.** A consumer's build can go
from passing to failing with no code change on their side, which is breaking however small the diff looks.

Provenance, so a disputed finding can be traced to the model that produced it:

- records: `2834`
- in-distribution floor: `0.6557`
- derived floor: `0.6557`
- floor source: `training-set-minimum`
- encoder: `53aa51172d142c89d9012cce15ae4d6cc0ca6895895114379cacb4fab128d9db`
- feature schema: `screenreader-structured-v19`

Per-subtype thresholds:

- `1.1.1:filename-alt` threshold `0.4907197654247284`
- `1.1.1:generic-alt` threshold `0.35058069229125977`
- `1.1.1:missing-alt` threshold `0.34309253096580505`
- `1.3.1:fake-heading` threshold `0.21515928208827972`
- `1.3.1:no-headings` threshold `0.7287715077400208`
- `1.3.1:unassociated-table` threshold `0.4843919575214386`
- `1.4.13:focus-panel-undismissable` threshold `0.9718829393386841`
- `2.1.1:control-unreachable-by-keyboard` threshold `0.9278021454811096`
- `2.1.2:focus-trapped` threshold `0.9983422756195068`
- `2.4.1:skip-link-inert` threshold `0.9932528138160706`
- `2.4.2:route-title-stale` threshold `0.9597633481025696`
- `2.4.3:focus-order-scrambled` threshold `0.9766406416893005`
- `2.4.4:regex` threshold `0.7914491891860962`
- `2.4.6:regex` threshold `0.6290492415428162`
- `3.2.1:focus-context-change` threshold `0.9799695014953613`
- `3.2.2:input-context-change` threshold `0.9788278341293335`
- `3.3.1:validation-error-silent` threshold `0.45402929186820984`
- `3.3.3:error-remedy-missing` threshold `0.9684345722198486`
- `4.1.2:state-change-silent` threshold `0.42754459381103516`
- `4.1.2:unnamed-control` threshold `0.3148304522037506`
- `4.1.3:form-activation-silent` threshold `0.9645275473594666`

Held-out acceptance: passed.
