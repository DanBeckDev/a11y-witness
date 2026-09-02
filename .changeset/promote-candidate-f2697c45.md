---
"@a11y-witness/scorer": major
---

Retrained scorer weights (`candidate`).

**Major, and not because the API changed — because the weights ARE the API.** A consumer's build can go
from passing to failing with no code change on their side, which is breaking however small the diff looks.

Provenance, so a disputed finding can be traced to the model that produced it:

- records: `2677`
- in-distribution floor: `0.5587`
- derived floor: `0.5587`
- floor source: `training-set-minimum`
- encoder: `53aa51172d142c89d9012cce15ae4d6cc0ca6895895114379cacb4fab128d9db`
- feature schema: `screenreader-structured-v17`

Per-subtype thresholds:

- `1.1.1:filename-alt` threshold `0.41332948207855225`
- `1.1.1:generic-alt` threshold `0.3625195324420929`
- `1.1.1:missing-alt` threshold `0.2571086883544922`
- `1.3.1:fake-heading` threshold `0.47346362471580505`
- `1.3.1:no-headings` threshold `0.7472029328346252`
- `1.3.1:unassociated-table` threshold `0.44019511342048645`
- `2.1.1:control-unreachable-by-keyboard` threshold `0.8266831040382385`
- `2.1.2:focus-trapped` threshold `0.9875777959823608`
- `2.4.1:skip-link-inert` threshold `0.9922633767127991`
- `2.4.2:route-title-stale` threshold `0.9924707412719727`
- `2.4.3:focus-order-scrambled` threshold `0.9734094142913818`
- `2.4.4:regex` threshold `0.8625924587249756`
- `2.4.6:regex` threshold `0.4043566584587097`
- `3.3.1:validation-error-silent` threshold `0.4819203317165375`
- `3.3.2:unnamed-form-field` threshold `0.5954856276512146`
- `3.3.3:error-remedy-missing` threshold `0.9664919972419739`
- `4.1.2:state-change-silent` threshold `0.24824735522270203`
- `4.1.2:unnamed-control` threshold `0.6495020985603333`
- `4.1.3:form-activation-silent` threshold `0.9557103514671326`

Held-out acceptance: passed.
