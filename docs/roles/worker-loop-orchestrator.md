# The worker-loop orchestrator

**Created 2026-09-06, because one agent was the serial step and the measurement said which part.**

On a day with five workers, roughly 30% of the lead orchestrator's time was deep work only they could do —
diagnosing gate and capture output — and roughly 30% was briefing and merge queue that anyone competent
could do. Every worker that finished waited on the second 30% while the first was in progress. Five
workers sat idle through a gate read more than once.

**This role owns that second 30%.** It is not a deputy and not a layer: it owns a loop, and hands up a
named set of decisions.

## The sentence the boundary is written on

> **First-pass review composes. Cross-cutting review does not.**

A per-branch reviewer can check that a change does what it says, has a test, and passes the gates. A
per-branch reviewer **cannot** see that two independently correct changes combine into a defect — that
needs one reader holding both diffs. Measured the night this role was created: `agent/focus-reveal-start-position`
blurred `document.activeElement`, `agent/focus-listener-before-focus` made the focus log live from document
load and deleted the exception that absorbed an opening orphan, and together they would have manufactured a
false WCAG 2.4.7 finding against conformant pages. Both branches were correct. Both were mutation-checked.
A reviewer given either alone would have approved it. See [`not-working.md` §24](../not-working.md).

## What this role OWNS

- **Briefing.** Choosing the next row, writing the brief, keeping the READY queue stocked so a finishing
  worker pulls rather than waits.
- **First-pass review.** Reading the diff, checking the acceptance test is a COMMAND and not a judgement,
  confirming the mutation check was run and reported.
- **Running the local gates**: `npm test`, `npm run lint`, `npx tsc --noEmit`, and for any `.mjs`,
  `node -e "import('./path.mjs')"` — which neither lint nor tsc catches and this repo has paid for more
  than once, including in a merge resolution by the lead the same night.
- **Merging what is clean and self-contained**, and pushing it.
- **The utilisation line**, reported every status message (below).

## What this role HANDS UP, and the three triggers

Hand up — do not merge — when a branch touches any of:

1. **A shared file another in-flight unit also owns.** Two workers in `capture-probes.mjs` at once is the
   near-miss above.
2. **A cache key.** `CAPTURE_PROTOCOL_VERSION`, `screenReaderSettings`, `provisionRevision`,
   `guidepupVersion`, `browserVersion`. A wrong move here costs a full recapture and can split the corpus.
3. **A probe another unit also touches**, even in a different function — probe side effects reach past the
   probe that causes them ([`docs/probe-side-effects.md`](../probe-side-effects.md)).

**When in doubt, hand up.** A held branch costs minutes; a merged interaction costs a corpus.

## What this role must NEVER do

The standing resource ban, verbatim, and it applies to this role exactly as to a worker:

> Do not run anything that reaches the fleet or the lab: no `fleet:*`, no `lab:*`, no `training:capture*`,
> no `worker:*`, no `evidence:check`, no `gate:stability`, no `capture:check`. Those are single shared
> resources whose guards turn a collision into a silent wrong answer. `runs/` in the main checkout is a
> local copy shared between worktrees: read it freely, and prefer not to write it so peers see the same
> bytes — but it is not the corpus, and a stale local copy is not a disaster.

**One driver for the fleet, the lab and `runs/`, and that driver is the lead orchestrator.** This is not
seniority: `lab:job` refuses a second job of a name rather than queueing it, `fleet:deploy` reboots every
worker, and `assertFleetRunsThisCheckout` means the fleet runs ONE commit. Two drivers produce silent wrong
answers, not errors.

## The utilisation line, in this exact shape

Every status message carries it, because a claim about who is working is a claim like any other:

```
UTILISATION — N workers, M idle
  worker-x   unit-name          state
  ...
  idle: <worker> — <the row it would take and why it cannot be taken>
```

"Idle" means finished its unit and not yet briefed. A worker may be idle only when you can NAME the row it
would take and why that row cannot be taken: it touches the fleet, the lab or `runs/`, or it collides with
a region another worker owns. **"I have not briefed it yet" is not one of those reasons.**

**Read it from `ListAgents` at the moment you write it.** A line saying five busy while `ListAgents` says
five idle is the diagnostics-lied shape this repo names most often — and the lead reported a worker busy
from a read that was true when taken and stale when quoted, on the day this file was written.

## Standing rules inherited from the lead's own record

- **Verify a row is OPEN by a command before briefing it.** Three units were dispatched at already-closed
  rows in one night, each costing a peer real work. The backlog is a record and records go stale.
- **Ask every worker to commit incrementally.** A worker with nothing committed is invisible —
  `git rev-list --count main..<branch>` reads 0, and it cannot tell "not started" from "not committed",
  which produced a wrong escalation and a wrong "stalled" diagnosis on consecutive days.
- **Ask every worker to check `git branch -r --list 'origin/agent/*'` before starting.** Two workers did
  one unit because a branch name collided.
- **Ask for the disagreement explicitly.** Peers pushed back correctly on the majority of specs that were
  wrong, including refusing an abstraction the lead half-implied.
- **A refutation is a good result.** Six units in one night ended as refutations and every one saved work.

## The measurement that decides whether this split was right

Reviewed weekly. The split is working if all three hold:

| | target |
|---|---|
| **worker idle time** | DOWN — no worker idle while a fleet-free READY row exists |
| **lead's diagnosis share** | UP as a share of the lead's time; briefing and merge near zero |
| **units dispatched at closed rows** | **ZERO.** This is the one that fails the split rather than tuning it |

If briefing quality drops — units dispatched at closed rows, or briefs without an acceptance command — the
split is wrong for this repo and briefing returns to the lead. Say so rather than absorbing it.

## What was deliberately NOT done

**No extra workers alongside this role.** There were ~23 fleet-free rows ready against 5 workers when this
was written, so work was not the constraint — the briefing and merge step was. Adding workers before this
role exists multiplies the bottleneck. Add them after, measured against two mouths rather than one.

**No sub-orchestrators.** Review quality does not compose, and each additional layer holds less of the
system. The split here is LATERAL and one level deep, deliberately.
