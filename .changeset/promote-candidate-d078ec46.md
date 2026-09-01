---
"@a11y-witness/scorer": major
---

Retrained scorer weights (`candidate`).

**Major, and not because the API changed — because the weights ARE the API.** A consumer's build can go
from passing to failing with no code change on their side, which is breaking however small the diff looks.

Provenance, so a disputed finding can be traced to the model that produced it:

- records: `2609`
- in-distribution floor: `0.5587`
- derived floor: `0.5587`
- floor source: `training-set-minimum`
- encoder: `53aa51172d142c89d9012cce15ae4d6cc0ca6895895114379cacb4fab128d9db`
- feature schema: `screenreader-structured-v17`

Per-subtype thresholds:

- `1.1.1:filename-alt` threshold `0.39594128727912903`
- `1.1.1:generic-alt` threshold `0.23987896740436554`
- `1.1.1:missing-alt` threshold `0.2582312524318695`
- `1.3.1:fake-heading` threshold `0.4837130606174469`
- `1.3.1:no-headings` threshold `0.7453203201293945`
- `1.3.1:unassociated-table` threshold `0.43648990988731384`
- `2.1.1:control-unreachable-by-keyboard` threshold `0.8241653442382812`
- `2.1.2:focus-trapped` threshold `0.9874963164329529`
- `2.4.1:skip-link-inert` threshold `0.9922459125518799`
- `2.4.2:route-title-stale` threshold `0.991015613079071`
- `2.4.3:focus-order-scrambled` threshold `0.9731454849243164`
- `2.4.4:regex` threshold `0.8672730326652527`
- `2.4.6:regex` threshold `0.4147566854953766`
- `3.3.1:validation-error-silent` threshold `0.4844878017902374`
- `3.3.2:unnamed-form-field` threshold `0.598865807056427`
- `4.1.2:state-change-silent` threshold `0.3775307238101959`
- `4.1.2:unnamed-control` threshold `0.6541351079940796`
- `4.1.3:form-activation-silent` threshold `0.9229658842086792`

Held-out acceptance: passed.
