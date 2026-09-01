---
"@a11y-witness/scorer": major
---

The first published scorer weights.

**Major, and not because the API changed — because the weights ARE the API.** A consumer's build can go
from passing to failing with no code change on their side, which is breaking however small the diff looks.
On a FIRST release there is no such consumer yet; the level is declared for what every later release of
these weights will be.

**THIS IS THE ONLY PROMOTION ENTRY, AND FOUR OTHERS WERE FOLDED INTO IT.** `.changeset/` held five pending
promotions and exactly one described the weights that ship. The other four recorded promotions no consumer
ever had — v7, v15 twice and v16 — and each declared `major`, so a first changelog would have opened with
four breaking-change notices against versions nobody could have been running. A changelog records what
consumers experienced, and before a first release they experienced nothing.

Deleting them outright was the wrong other option: ADR 0007 makes the weights the API and the changeset the
only record of their provenance, so the LINEAGE has to survive even when the entries do not. It is below.

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

## Lineage

Every promotion that led to these weights, folded in from the changesets they were written as. None was
published; they are kept because provenance is the changeset's job and a deleted entry takes it with it.

| promotion | records | feature schema | published |
|---|---|---|---|
| `promote-v15-scorer` | — | `screenreader-structured-v7` | no |
| `promote-candidate-4` | 2,403 | `screenreader-structured-v15` | no |
| `promote-candidate-198816d2` | 2,487 | `screenreader-structured-v15` | no |
| `promote-candidate-876f3d15` | 2,525 | `screenreader-structured-v16` | no |
| **`promote-candidate-d7762085`** | **2,525** | **`screenreader-structured-v17`** | **these weights** |

v16 → v17 is the change worth naming, because it is the one a reader can act on: the featurizer learned to
separate a MEASURED state change from an unmeasured one, and `3.3.1:validation-error-silent` went from
0.876 to 0.950 recall on the same corpus with the featurizer as the only variable. Two neighbours moved
with it, because every head reads the same shared vector.

The v17 schema string is read from the shipped `safetensors` metadata rather than from any report, since
`training-report.json` does not carry it — checked, not assumed.
