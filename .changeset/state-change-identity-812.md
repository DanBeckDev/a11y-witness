---
"a11ign": patch
---

A 4.1.2 finding is no longer asserted from a before/after pair that names two different controls (#812).

`probeDisclosure` activates a control and records `after` from `reportCurrentFocus` — **whatever holds
focus afterwards**, not a re-read of the control it activated. Those coincide only when activation leaves
focus put, which is why this held across 2,000+ corpus captures and broke on a nav menu that moves focus
into what it reveals. The V1 rehearsal's only 4.1.2 finding was:

```
control  "…, list, with 6 items, Platform, button, collapsed"
after    "Outline, menu button, focused, collapsed, sub Menu"
```

Both say `collapsed`, so the state comparison passed **across two different controls**. The literal
`focused` token is `reportCurrentFocus`'s own output: the capture was saying which question it answered,
and nothing read it.

`addSilentStateChanges` now establishes **identity before state** — the announced names must match, and an
empty name is not an identity. The guard reads the announcement strings, which every capture already
carries, so it applies retroactively with no protocol bump and no recapture.

The claim this makes is narrow: **the capture never made the observation such a finding rests on.**
Whether that control exposes its state change is unknown, not disproved.

The capture also records `afterSource: "focus"` so the record says which question it answered in a field
rather than in a comment, and `probeDisclosure`'s comment no longer promises a re-read of the control or a
read of the accessibility tree — it never did either. Making `after` a true re-read needs a CDP read of
the activated element and is an evidence change: a separate row.
