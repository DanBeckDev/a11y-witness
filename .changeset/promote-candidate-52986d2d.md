---
"@a11y-witness/scorer": major
---

Retrained scorer weights (`candidate`).

**Major, and not because the API changed — because the weights ARE the API.** A consumer's build can go
from passing to failing with no code change on their side, which is breaking however small the diff looks.

Provenance, so a disputed finding can be traced to the model that produced it:

- records: `2607`
- in-distribution floor: `0.5587`
- derived floor: `0.5587`
- floor source: `training-set-minimum`
- encoder: `53aa51172d142c89d9012cce15ae4d6cc0ca6895895114379cacb4fab128d9db`
- feature schema: `screenreader-structured-v17`

Per-subtype thresholds:

- `1.1.1:filename-alt` threshold `0.39500242471694946`
- `1.1.1:generic-alt` threshold `0.26844775676727295`
- `1.1.1:missing-alt` threshold `0.24746473133563995`
- `1.3.1:fake-heading` threshold `0.47880542278289795`
- `1.3.1:no-headings` threshold `0.7451062798500061`
- `1.3.1:unassociated-table` threshold `0.43404150009155273`
- `2.1.1:control-unreachable-by-keyboard` threshold `0.8236352801322937`
- `2.1.2:focus-trapped` threshold `0.9874933362007141`
- `2.4.1:skip-link-inert` threshold `0.9924825429916382`
- `2.4.2:route-title-stale` threshold `0.9911589026451111`
- `2.4.3:focus-order-scrambled` threshold `0.9731521606445312`
- `2.4.4:regex` threshold `0.8583082556724548`
- `2.4.6:regex` threshold `0.4163309335708618`
- `3.3.1:validation-error-silent` threshold `0.4865831434726715`
- `3.3.2:unnamed-form-field` threshold `0.6099113821983337`
- `4.1.2:state-change-silent` threshold `0.37439650297164917`
- `4.1.2:unnamed-control` threshold `0.6577301025390625`
- `4.1.3:form-activation-silent` threshold `0.953313410282135`

Held-out acceptance: passed.
