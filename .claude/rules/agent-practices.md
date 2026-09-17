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

- **No session holds a standing cron. This reverses the rule that stood here until 2026-09-17, and the
  reversal is the point.** Every session used to hold one (engineers every 10 min, the fleet operator
  every 10 min, the product-manager every 30 min), and each firing was a MODEL TURN that woke to ask a
  question a script answers in one API call: about 672 turns a day, most finding nothing. That emptied a
  weekly allowance in three days and put both Codex reviewers on their own quota the same way.
  `CronList` after a restart is no longer the first command; **`CronDelete` on anything you find there
  is.**
- **THE CLOCK WAS NEVER THE DEFECT — a tick that costs no tokens can run all day.** The defect was that
  the tick WAS a model turn. So the tick moved out of the model: `npm run work:tick` runs
  `work-gate.mjs` (two `gh` calls, no model) and hands what it finds to `wake.mjs`, which prompts only a
  session herdr reports as `idle` or `done`, and only once per cause. You are woken WITH the answer
  already in your prompt; you no longer wake to go and look.
- **So: do not create a cron to check for work.** If you think you need one, the gate is missing a
  question rather than you needing a timer — add it to `work-gate.mjs`, where it costs an API call
  instead of a turn, and where the repository can see it. A cron is still right for something that must
  happen at a WALL-CLOCK time regardless of state (a nightly, a board edition); it is never right for
  "has anything changed yet".
- Measured on the agent host 2026-09-17, after the sessions were stopped: no user or root crontab, no
  `at` queue, no systemd timer but `herdr.service`. These were in-session `CronCreate` crons, which is
  why nothing outside the sessions could ever see them — and why this rule, not a host change, is what
  keeps them from coming back.
- The row is the state. Read the row, the PR and the API before acting on any message, including one
  from ceo.
- A product PR opens as a DRAFT and is marked ready only when the reviewer writes "convinced";
  docs-and-tests PRs open ready. Nobody merges by hand.
- **`Acceptance:` and `Closes` are now MERGE-BLOCKING (2026-09-17).** `acceptance` and `ownedPaths` are
  back in `gate`'s `needs`, so a malformed PR body no longer merges red -- it does not merge. Two things
  cost four red runs before this landed, both body defects rather than broken code: a DUPLICATED
  `Acceptance:` section (the checker cannot tell which command to run, so it refuses), and a MISSING
  `Closes` declaration. When a PR finishes no row, the declaration is `Closes: none -- <reason>` with an
  em dash; it is required either way. Editing the body re-runs the check, so a mistake costs a minute.
- **A settled draft with green checks and no verdict is reviewed by the external reviewer (`by reviewer:`);
  an engineer reviews only when ceo names one** — a reviewer stalled past a re-prompt, or a product path
  ceo wants two eyes on. ceo spot-checks the reviewer's first five verdicts and one in five after. The
  chairman's instruction, ruled by ceo on 2026-09-13 (#1394) and effective in ceo's heartbeat v10 (#912,
  comment 5655501080). An engineer with no row in build claims the next Ready row; an open draft is not
  their work unless ceo has named them.
  *A record, not an instruction:* from 2026-09-12 until that ruling, a free engineer reviewed settled
  drafts unasked, because every verdict from 14:02Z that day was engineer-to-engineer and a draft could
  wait thirty minutes between wake-ups for the clock to name someone.

## Routing — who reads what (chairman's direction, 2026-09-14)

- **`product-manager` is the first reader for rows, the queue and process, and rules on them:** filing and
  amendments, Region and done-when wording, holds, lane labels, promotions, claim reports, merge close-outs,
  host-run announcements. An engineer's completion or claim report goes to `product-manager`, never to
  `ceo`. Three things come up from `product-manager` to `ceo`: a ruling they cannot make (a rule or ADR
  conflict, a crossing into a `ceo` lane, the publish path); ONE state reading per `ceo` tick — utilisation,
  queue, drafts awaiting a verdict, anything red — posted on #928 at :05/:25/:45 so the tick at :09/:29/:49
  reads it; and anything for the chairman.
- **`orchestrator` is the first reader for fleet and lab questions** — a capture's history, a worker fact,
  a lab reading. Engineers ask directly; the answer is posted on the row.
- **The author of a draft prompts its parity reviewer** the moment the PR opens and again after every push
  that changes the head: `herdr --session org agent prompt reviewer "Draft #<n> (odd) …"` for odd numbers,
  `reviewer-2` for even. `ceo`'s tick no longer does it; a draft with no verdict 30 minutes after the
  author's prompt is reported to `product-manager`, who re-prompts once and then tells `ceo`.
- **`ceo` keeps:** the publish order and every freeze decision, reviewer spot-checks, the board edition read,
  rulings that reach it through `product-manager`, and the chairman.
- **Why (measured 2026-09-14, ceo's own inbound):** about half of one night's messages to `ceo` were
  read-backs and reports that needed a nod, not a decision; each cost a Fable turn and a tick's latency, and
  reviewer nudges waited up to twenty minutes for a heartbeat that an author could have replaced with one
  command. The rule that stays: the row is the state — a report to `product-manager` changes nothing until
  the row, the PR and the API say so.

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
