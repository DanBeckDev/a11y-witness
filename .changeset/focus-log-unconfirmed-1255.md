---

---

#1255: no consumer-visible change.

`packages/judge` is touched in three places and none of them reaches a consumer:

- `act-rules.ts` — one string inside the 2.4.7 rule's `assumptions` array, correcting a field name
  (`scriptRemovedFocus`, retired by #14 when ADR 0021 moved deciding from the capture to the rules) to
  the one the capture actually writes (`log`). The ACT rule objects are **not exported** from
  `packages/judge/src/index.ts`, whose entire public surface is `judge`, `validateJudgment`,
  `judgeBackend`, `taskVerdictLabel` and four types; nothing outside this package imports them.
- `outcomes.test.ts` and `rules.test.ts` — tests, which do not ship.

The behaviour a consumer can observe is byte-identical. Recorded with `--empty` rather than left to be
inferred from silence, because "this cannot affect a consumer" is a decision somebody made rather than a
fact the diff states.
