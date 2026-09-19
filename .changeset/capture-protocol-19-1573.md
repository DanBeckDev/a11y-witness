---
"@a11ign/nvda-worker": patch
---

**`CAPTURE_PROTOCOL_VERSION` moves 18 -> 19**, one bump carrying four meaning changes at once rather than
paying a recapture per change: #1506's focus-reveal crediting fix, #1561's window-width pin (joining
`environmentKey` and `MUST_MATCH`), #1575's skipped-focus channels in a live excursion's `observed` block,
and #1549's visibility-aware DOM heading count -- plus #1467's formChanges own-context fragment strip,
which was on main and capture-side (not a no-op reading strip) when this row was claimed. No capture is
dispatched at code including #1506 until this bump is on main and deployed (#914). The cost is one full
recapture, paid once for all five reasons.
