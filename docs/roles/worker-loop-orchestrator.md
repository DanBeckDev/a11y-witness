# The worker-loop orchestrator — `dispatcher`

The agent filling this role is named **`dispatcher`**. It reports to **`orchestrator`** — the lead orchestrator, which owns the fleet, the lab, `runs/`, every corpus-reading gate and all cross-cutting review — and hands up to it the three triggers below. It sends its utilisation line to **`ceo`** with every status message.

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
  **`npm run mutate` is the required form, and a hand-typed sequence is not evidence.** It runs the
  test first and refuses if it is already red, copies the file aside rather than `git checkout --`,
  **proves the mutation actually landed**, requires the test to FAIL, then restores and runs the test
  again. Its exit code is the report: **0** the guard bites, **1** it did not — suspect the guard
  before the code, **2** refused before mutating, **3** the restore failed. Built 2026-09-06 after two
  agents got the sequence wrong in one day: one destroyed uncommitted work with `git checkout --`
  mid-check, and two guards shipped GREEN against the very defect they were written for — one because
  a quoting slip made the edit a no-op, one because it read a whole document where it meant to read
  one section. **A worker reporting "mutation-checked" without that exit code is reporting a
  memory.**
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

### THE FLEET TREE, NAMED

**`/Users/danielbeck/Documents/repos/personal/a11y-witness` — the primary checkout — is the tree the fleet
and the lab are driven from. NO OTHER AGENT MERGES IN IT.** `dispatcher` merges in
`../a11y-wt-dispatch`; the lead's own `main`-moving work goes through `../a11y-wt-lead`.

The rule is not "one merger", it is **"nobody merges in the tree the fleet is driven from"**, and the
reason is mechanical rather than territorial: `expectedWorkerCode()` (`worker-code-check.mjs`) hashes the
WORKING TREE, so a half-resolved merge there makes `assertFleetRunsThisCheckout` hash a state nobody
intended. Best case a refused capture; worst case a whole run stamped against code that never existed —
**and that one passes.** Losing a conflict resolution costs ten minutes; this costs a corpus.

**AND NOTHING IS EVER CHECKED OUT OR EDITED IN IT EITHER — added 2026-09-06, after the primary was found
sitting on `agent/product-tracker` with two files modified eleven seconds earlier.** The rule above says
nobody MERGES there; that was too narrow. Feature work is worktrees only, and the second reason is the one
nobody had:

**Every worktree's `node_modules` can be a symlink to the primary's, so `@a11y-witness/*` resolves to the
PRIMARY's `packages/*/dist` — not the worktree's.** Measured: `require.resolve('@a11y-witness/judge')` from
a worktree prints a path inside the primary checkout. Two consequences, and both cost real time the day this
was written:

- **Building your own worktree changes nothing a cross-package tool reads.** A generator emitted a page
  missing two paragraphs its source plainly contained, because the primary's `dist` was two hours old. That
  was diagnosed as a broken generator, and a "regeneration" was committed that reverted another agent's
  work. `npm run build` in the worktree had already been tried and proved nothing.
- **So a feature branch checked out in the primary silently changes what every other agent compiles and
  tests against**, on top of moving the hash. The stale-`dist` case is the passive version of this; a
  feature branch there is the active one.

**Rebuild the primary after merges** — `npm run build` — or every worktree inherits whatever it last built.
Verified safe during a live capture: a build writes `dist/` only, `nvda-worker` has no build step at all
(plain `.mjs`, ADR 0031), and `workerSourceDirty()` reads `git status -- packages/nvda-worker/src`. Measured
worker source 0 dirty either side and `worker:code` 10/10 after.

**And when a tool reads stale code, resolve the module and print the PATH, not the link type.** The check
that missed this was `ls -ld node_modules/@a11y-witness/judge`, which answered *is this a symlink* when the
question was *to which checkout*. `node -e "console.log(require.resolve('@a11y-witness/judge'))"` answers the
right one.

A corollary worth stating rather than discovering: **a merge tree cannot faithfully run the corpus-reading
gates**, because its `runs/` is a symlinked copy and those gates are the lead's to run by ruling anyway.
That is correct, not a gap.

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

## THE LOOP IS PULL, AND THE REPORT IS THE TRIGGER — 2026-09-06

**Three workers idled in one hour and all three were the same shape: a finished worker waited on the
dispatcher, and the dispatcher was busy.** Not one was blocked on work. One had reported and not been
briefed; one was waiting on two rulings already settled and not relayed; one went idle without reporting
and was not chased. **A loop whose throughput depends on one agent being free has that agent's latency in
every worker's day.**

**0. PULL BEFORE YOU REPORT, NOT AFTER — a permission is not a trigger.** The first version of this rule
said a finished worker MAY take the top Ready row. Three then finished, reported, and waited anyway:
nothing in *"you may pull"* says WHEN to look, and **reporting feels like the end of the unit**, so the
queue check never happened. That is the same latency wearing a different hat. **The report IS the
trigger** — a completion arrives with its next row attached, in one message. **A lane with nothing in it
is reported the same way, naming what was checked**, which costs the dispatcher one message rather than
costing the worker an hour.

1. **A worker takes the top Ready row in its own lane itself.** First `node scripts/row-claim.mjs claim
   <n> --session=<name>` — the CLAIM check, reading the board's `in-progress`/`session:*` labels, never
   git history — then the collision and region rules, and says what it took. **The brief becomes a CHECK
   on that choice** — so a wrong choice costs a redirect, not an idle hour. **The claim check and the
   region check answer different questions and neither substitutes for the other**: #28 and #30
   (2026-09-06) were each pulled twice by workers who ran the region check correctly and got a true
   answer to *"would I collide in this file"* — the claim was never in a diff to find. `row-claim.mjs`
   claims first and re-verifies after writing, because propagation lag is measured (a board query
   reported a row `Ready` moments after it was known taken); it is NOT proven race-free against two
   sessions writing within the same instant, and closing that narrower gap was refused as
   disproportionate to the defect actually observed twice today — see the script's own header.
2. **A ruling a worker escalated is relayed IN THE SAME TURN IT IS SETTLED**, before returning to
   anything else. Two workers idled on rulings that had already been made.
3. **A worker idle without reporting is asked its state at the NEXT STATUS**, not discovered at the next
   audit.
4. **Re-run the collision check immediately before starting, not when picking.** A region was clear on one
   worker's check and contended on the dispatcher's twenty minutes later, because two commits landed in
   between. Neither was wrong; **the check has a shelf life.**
5. **Set `in-progress` the MOMENT a row is taken — including the moment you discover someone else already
   took it.** Recorded because it was got wrong once, in this row's own incident: a card was moved to In
   progress, then reverted to Ready on seeing another branch, on the reasoning "someone else has it, so it
   is not mine to assign" — which put a claimed row back into the pull queue at the exact moment a second
   worker was looking at it. **The label is the claim; a row you know is taken must show that, whoever
   holds it.** `node scripts/row-claim.mjs check <n>` before touching a row's status, `claim` to take it.
   No command enforces this half — it is a discipline, not a check, and it is this role's to hold.

**This is what the Ready queue was always for.** A queue nobody may pull from is a list, and a list needs
somebody to read it aloud.

## Standing rules inherited from the lead's own record

- **Verify a row is OPEN by a command before briefing it.** Three units were dispatched at already-closed
  rows in one night, each costing a peer real work. The backlog is a record and records go stale.
- **Ask every worker to commit incrementally.** A worker with nothing committed is invisible —
  `git rev-list --count main..<branch>` reads 0, and it cannot tell "not started" from "not committed",
  which produced a wrong escalation and a wrong "stalled" diagnosis on consecutive days.
- **Ask every worker to check `git branch --list 'agent/*'` and `git worktree list` before starting** —
  LOCAL, not `origin/`. Two workers did one unit because a branch name collided, and the check I first
  wrote into every brief was `git branch -r --list 'origin/agent/*'`, which returns EMPTY: agent branches
  in this repo are never pushed. **A guard that always answers "clear" is worse than no guard**, because
  it is cited as having been run. Found by `dispatcher` on its first hour, reading the brief rather than
  obeying it.
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
