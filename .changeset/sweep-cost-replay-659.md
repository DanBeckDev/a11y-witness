---
"a11ign": patch
---

`npm run bench:capture -- --from-disk --sweeps` answers #659: **the sweep cost is what seeing the page
costs.**

`sweep` is the largest phase on every real page measured and the only one that scales — 78.5% of one run
on its own. That is the case for looking, not evidence of waste: `collectByType` walks the page by
quick-navigation and that is how this tool sees structure at all.

A phase total could not answer it. One phase covers eight sweep types, and one of them (`formField`)
carries a per-field activation the other seven do not — summed, that type's behaviour is everybody's.
Split by type, across six pages replayed from captures already on disk:

```
type        pages  thin  rates (median ms/trip)      spread  cause
formField       4     2  222, 1261, 323, 463            5.7  per-step
graphic         4     2  162, 146, 180, 174             1.2  per-element
heading         3     3  173, 180, 165                  1.1  per-element
landmark        3     3  165, 157, 171                  1.1  per-element
link            3     3  178, 189, 184                  1.1  per-element
list            2     4  200, 220                       1.1  per-element

walk rate (every type with no onItem): 163 ms/trip
```

**Every sweep that only walks runs at the same rate on every page**, across pages differing by an order of
magnitude in element count. The total is trips times a constant, and trips is how many elements there are.
`formField`'s excess over 163 ms/trip is its activation, not a slower walk — and on the two most recent
captures it reads **190** and **202** ms/trip, which is the walk rate, because the probe cost nothing on
those pages.

Two things the replay found in its own first output, both now guarded:

- **A sweep that never ran was contributing `0 ms/trip`** — a starved sweep records `found: 0`, `ms: 0`
  and two baseline round trips, so a naive divisor made it the fastest sweep in the set. Read from the
  stop reason now, never inferred from `ms === 0`.
- **A page whose sweep barely moved was setting the verdict.** One page whose heading sweep found ONE
  heading reported 345 ms/trip against 180 on the page with eighty — the rate was highest where the sweep
  found the least. Pages under 20 round trips are excluded and **counted**, and the floor is measured
  rather than chosen. It changed `heading` from `per-step` to `per-element`.

`--from-disk` also now reads both record shapes. A `runs/witness/` record wraps its capture, so pointing
the tool at the directory #659's own Region names reported "No captures with diagnostics" over 24 of them.
