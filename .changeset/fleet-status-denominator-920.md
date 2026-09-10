---
"a11ign": patch
---

**`fleet:status` no longer prints CONSISTENT over a subset of the fleet.**

It compared only the boxes that answered and printed `fleet CONSISTENT` over them, with the reachability
count on a separate line — so a reader saw a verdict and a count as two unrelated facts. **An unreachable
box that has drifted read as agreement.** Measured: the status said CONSISTENT over nine boxes while the
tenth, excluded for not answering, was `a11y-worker-4` on Windows `10.0.26200` against the others'
`10.0.22631`. The OS is a capture-cache key, so the fleet was not one fleet, and five captures (#29) were
taken on the divergent box before anyone noticed.

**The verdict now carries its denominator and has three states, two of which must not collapse:**

```
fleet CONSISTENT across 10 of 10 — these workers are interchangeable for capture
fleet UNKNOWN — the 9 compared agree, and 1 of 10 could not be compared …
fleet INCONSISTENT across 4 of 4 — windowsVersion differs …
```

"Nine agree and one did not answer" is a box to reach; "they disagree" is a fleet to re-provision.

**The denominator is the number COMPARED, not the number that answered — the same defect one level
down.** `fleetConsistency` drops a guest that reports no `environment` before comparing, so a box can
answer `/health` and still not be in the set the verdict is about. It now returns `compared` (additive;
`doctor` and the existing tests read only `consistent` and `mismatches`), and the verdict is denominated
by it. Denominating by the reachable count would have fixed the instance and left the class.

**The JSON field `consistent` is renamed `comparedAgree`**, and a `verdict` object carries the answer. A
bare `consistent: true` over nine of ten is the exact misreading this fixes, one serialisation away; no
code in the repository read the old field.

`doctor`'s own fleet check already said "N of M guests agree … the rest could not be asked" — it learned
this first, and the command whose whole job is to describe the fleet never did.
