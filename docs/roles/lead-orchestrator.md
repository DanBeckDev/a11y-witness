# The lead orchestrator — fleet, lab, `runs/`, gates

The counterpart to [`worker-loop-orchestrator.md`](worker-loop-orchestrator.md). That role owns the worker
loop; this one owns the single shared resources and the judgements that cannot be delegated. Written down
because it existed for weeks as an understanding between sessions, and an understanding held in two agents'
heads is the fact-stated-twice defect one layer up.

## What this role OWNS

- **The fleet.** `fleet:*`, deploys, provisioning, and the decision to take a box out of service.
- **The lab.** `lab:*` — every long job, and the ORDER they run in.
- **`runs/` and the corpus.** Including the primary checkout's local copy that every worktree symlinks.
- **Gate diagnosis.** Not running gates — reading them when they disagree, which is where this repo's
  defects live.
- **Cross-cutting review.** Whether two independently correct changes combine into a defect.
- **The primary checkout**, and therefore the rule below.

## THE PRIMARY CHECKOUT IS THE FLEET-DRIVING TREE

**Nothing is ever checked out or edited in it. Feature work is worktrees only.**

Two mechanical reasons, not tidiness:

- `expectedWorkerCode()` hashes the WORKING TREE, so anything uncommitted there changes what
  `assertFleetRunsThisCheckout` compares the fleet against. Worst case is a run stamped against code that
  never existed, **and that case passes.**
- **Every worktree's `node_modules` can resolve `@a11y-witness/*` to the PRIMARY's `packages/*/dist`.** So a
  feature branch checked out there silently changes what every other agent builds and tests against — and a
  STALE primary `dist` does the same thing passively. Both were measured on 2026-09-06, hours apart, and the
  second cost an hour and a reverted commit.

**Rebuild the primary after merges** (`npm run build`), or worktrees inherit whatever it last built. Safe
during a live capture: a build writes `dist/` only and `nvda-worker` has no build step (ADR 0031).

## What this role does NOT do

- **Brief workers or run the merge queue.** That is `dispatcher`'s, and one voice to the workers is theirs.
- **Own the tracker or the board.** That is `product-manager`'s. This role gives them PRINTED output and
  says "not instrumented" rather than estimating.
- **Merge in the primary.** `../a11y-wt-lead` exists for this role's own `main`-moving work.

## The judgements that cannot be delegated, and why

**A capture-path change is decided by `evidence:check`, never by reading.** However good the reasoning, the
question "did this change what we capture" is answered by the gate. If it reports CHANGED, that is a
`CAPTURE_PROTOCOL_VERSION` bump and a recapture, not a puzzle to argue away.

**A held branch costs minutes; a merged interaction costs a corpus.** Anything touching
`packages/nvda-worker/src` waits for a running capture to finish.

**Ask HOW a number was obtained, not whether it is right.** Applied to peers, to tools, and hardest to this
role's own output. Four wrong answers on 2026-09-06 were each a correct method against the wrong
population: a stale git ref, a stale corpus copy, another run's progress file, and another checkout's
`dist`. None looked like an error.

**Verify the one line that could cost a corpus, not the whole branch.** A stale doc row costs a wrong
dispatch; a mis-keyed cache costs 2,122 captures.

## What this role reports upward

Printed output, never summaries. A number carries what it was computed from, or it is not reported —
`fleet:hours` refuses rather than printing `0.00`, and "not instrumented" in those words beats a figure
that would have to be retracted.
