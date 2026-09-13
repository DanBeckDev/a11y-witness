# Agent practices — every session in this repo (chairman's direction, 2026-09-11)

These load with CLAUDE.md in every session. They are habits, not gates; the org clock on #912 reads
whether they are followed.

## Model routing for subagents

- `model="haiku"` for data gathering: file reads, counting, directory walks, grep, API listings.
- `model="sonnet"` for analysis and judgment over gathered material.
- `model="opus"` only for multi-step reasoning that a cheaper tier has measurably got wrong.
- Measured 2026-09-10 over 30 days: Opus carried 66% of billable tokens and Haiku under 1%, with no
  routing rule anywhere. Every subagent call names its model.

## Context

- `/compact` at 50–70% context fill, before auto-compact; quality degrades past 70%.
- `/clear` between unrelated topics; a fresh window beats stale history.
- Batch related requests into one message; every round-trip re-sends the whole config stack.

## Web research

- Measured 2026-09-11 over 30 days: 576 web search and fetch calls put about 2.9 million tokens of page
  content into main-session contexts. Run research in a subagent (`haiku` to gather, `sonnet` to
  digest) so the pages stay in its context and only the digest reaches yours; ask for a digest with
  sources, never a page dump. One fetch that the main session must read itself is the exception, not
  the habit.

## Timers and state

- Every session holds one standing cron (engineers every 10 min, the fleet operator every 10 min while
  fleet-gated rows remain, the product-manager every 30 min) and declares it on #912 after every start
  or restart. `CronList` is the first command after any restart: a restart wipes every cron silently.
- The row is the state. Read the row, the PR and the API before acting on any message, including one
  from ceo.
- A product PR opens as a DRAFT and is marked ready only when the reviewer writes "convinced";
  docs-and-tests PRs open ready. Nobody merges by hand.
- **A settled draft with green checks and no verdict is reviewed by whichever engineer is free, unasked.**
  The clock still names a reviewer when a draft has no verdict at its head — this means you need not wait
  for that message, not that it stops. **So an engineer with no row in build and a reviewable draft open
  is NOT idle: reading it is the work.** The reason is a single point of failure rather than a
  preference — on 2026-09-12 every verdict from 14:02Z onward was engineer-to-engineer, and it worked
  only because the clock named a reviewer each time, so between wake-ups a settled draft could wait
  thirty minutes for somebody to be told. Twice that night a verdict arrived before the message did,
  which is this rule happening before it was one.

## Assertions

- **An emptiness assertion names where its positive control lives.** `assert.deepEqual(offenders, [])`
  passes when the population is empty, so somewhere there must be an assertion that it is not — and the
  writer has to be able to point at it. A control you believe in is not one you can point at.
- **Where the population comes from decides whether a machine can help you.** Measured over 236 such
  assertions, 2026-09-12: 64 derive from a local collection (`const xs = ys.filter(…)`), and
  `local/uncontrolled-emptiness` refuses those unpinned — **64 derive from a CALL** (`f().filter(…)`),
  where no rule can trace the source without guessing at what `f()` returns, so those have **only this
  line**. 73 are accumulators and 17 unclassified, both with their own rows.
- **This is a habit and this repository loses habits**; the reason it stays one is that the alternative
  is a rule that infers intent, which is the defect this family is about one level up. A habit that
  decays beats a guard that guesses, and #1157 records the trade rather than pretending it is not one.
