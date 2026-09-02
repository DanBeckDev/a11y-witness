---
"@a11y-witness/scorer": major
---

Retrained scorer weights (`candidate`).

**Major, and not because the API changed — because the weights ARE the API.** A consumer's build can go
from passing to failing with no code change on their side, which is breaking however small the diff looks.

Provenance, so a disputed finding can be traced to the model that produced it:

- records: `2790`
- in-distribution floor: `0.6597`
- derived floor: `0.6597`
- floor source: `training-set-minimum`
- encoder: `53aa51172d142c89d9012cce15ae4d6cc0ca6895895114379cacb4fab128d9db`
- feature schema: `screenreader-structured-v18`

Per-subtype thresholds:

- `1.1.1:filename-alt` threshold `0.4908241033554077`
- `1.1.1:generic-alt` threshold `0.25592881441116333`
- `1.1.1:missing-alt` threshold `0.287521630525589`
- `1.3.1:fake-heading` threshold `0.4104214012622833`
- `1.3.1:no-headings` threshold `0.760279655456543`
- `1.3.1:unassociated-table` threshold `0.438626229763031`
- `2.1.1:control-unreachable-by-keyboard` threshold `0.8131107687950134`
- `2.1.2:focus-trapped` threshold `0.9888521432876587`
- `2.4.1:skip-link-inert` threshold `0.9932681322097778`
- `2.4.2:route-title-stale` threshold `0.9200900197029114`
- `2.4.3:focus-order-scrambled` threshold `0.9679417014122009`
- `2.4.4:regex` threshold `0.8515616655349731`
- `2.4.6:regex` threshold `0.4872058928012848`
- `3.2.1:focus-context-change` threshold `0.9791474342346191`
- `3.2.2:input-context-change` threshold `0.9687156081199646`
- `3.3.1:validation-error-silent` threshold `0.3532114624977112`
- `3.3.2:unnamed-form-field` threshold `0.5844798684120178`
- `3.3.3:error-remedy-missing` threshold `0.9681121706962585`
- `4.1.2:state-change-silent` threshold `0.24240779876708984`
- `4.1.2:unnamed-control` threshold `0.3485846519470215`
- `4.1.3:form-activation-silent` threshold `0.9547531008720398`

Held-out acceptance: passed.
