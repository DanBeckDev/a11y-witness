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
- feature schema: `screenreader-structured-v16`

Per-subtype thresholds:

- `1.1.1:filename-alt` threshold `0.5914950966835022`
- `1.1.1:generic-alt` threshold `0.3223552107810974`
- `1.1.1:missing-alt` threshold `0.2379615157842636`
- `1.3.1:fake-heading` threshold `0.5011726021766663`
- `1.3.1:no-headings` threshold `0.6234076023101807`
- `1.3.1:unassociated-table` threshold `0.7236061096191406`
- `2.1.1:control-unreachable-by-keyboard` threshold `0.5592986941337585`
- `2.1.2:focus-trapped` threshold `0.9797188639640808`
- `2.4.1:skip-link-inert` threshold `0.9781535863876343`
- `2.4.2:route-title-stale` threshold `0.8749621510505676`
- `2.4.3:focus-order-scrambled` threshold `0.9680853486061096`
- `2.4.4:regex` threshold `0.7917467951774597`
- `2.4.6:regex` threshold `0.49253442883491516`
- `3.3.1:validation-error-silent` threshold `0.8513928055763245`
- `3.3.2:unnamed-form-field` threshold `0.7008717656135559`
- `4.1.2:state-change-silent` threshold `0.3091897666454315`
- `4.1.2:unnamed-control` threshold `0.9561774730682373`
- `4.1.3:form-activation-silent` threshold `0.9252893924713135`

Held-out acceptance: passed.
