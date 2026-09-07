---
---

`packages/judge/src/rules.ts` changes what two rules read internally (`route.control === null`
instead of `!route.navigated`, both proven equivalent against every path `probeRouteChange` can
return), not what they find. Behaviourally identical -- confirmed by the full test suite passing
unchanged -- so there is no consumer-visible change to version. The new test file and the
`docs/backlog.md` line-count update touch nothing published.

Recorded explicitly rather than left to be inferred from silence, which is what the changeset gate
asks for.
