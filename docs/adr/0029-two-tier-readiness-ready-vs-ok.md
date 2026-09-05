# ADR 0029: Two-tier readiness — dispatch on `ready`, never on `ok`

## Status

Accepted. Cited in practice by CLAUDE.md's "Readiness: `ready`, not `ok`" section, which carries the
incident and the mechanism; not previously recorded as a decision anywhere.

## Context

`/health` needs to answer two different questions for two different callers: "is the HTTP server up at
all" (a load balancer's question) and "can this worker take a capture right now" (the pool's question). A
single boolean cannot answer both, and collapsing them into one was tried first: a worker answered `ok`
while NVDA could not start, and the pool dispatched to it anyway — a failure that hid for a day because
`ok` looked like the right signal to check.

The next attempt over-corrected: gating readiness on `screenReader`/`warmedUp` being confirmed live. That
produced an NVDA restart loop — polling readiness re-triggered a screen-reader check, which cycled NVDA,
which destabilised the speech channel further, which failed the next readiness check, restarting the loop
— and put modal dialogs on guest desktops when NVDA's own crash-recovery UI appeared mid-cycle.

## Decision

**`/health` reports two independent signals: `ok` (the HTTP server answers) and `ready` (the environment is
fit to start a capture). The pool dispatches on `ready`. `ok` is not used for that decision at all.**

`ready` is computed from environment facts that do not require exercising NVDA: Edge is resolvable,
`ForegroundLockTimeout` is 0, and the worker is not already busy. `screenReader` and `warmedUp` are
reported on `/health` for diagnostic visibility but are **deliberately not gated on** — a caller can see
them, but nothing in the dispatch path blocks on them.

`ready:false` immediately after boot is a normal, self-correcting state ("not yet"), not a fault report.
Warm-up retries are capped (3 attempts, 30 s apart) specifically so that polling readiness cannot itself
cycle NVDA.

## Consequences

- A worker that is up but cannot yet take work is distinguishable from one that is genuinely down, without
  the pool having to interpret a single flag two ways.
- Nothing in the readiness path can trigger an NVDA restart, which removes the restart-loop failure mode by
  construction rather than by tuning retry counts further.
- `ok:true, ready:false` is an expected, frequent state during boot and must not be alerted on as a fault;
  only a `ready` that never becomes `true` after the warm-up budget is a real problem.
- A worker whose screen reader is actually broken but whose environment checks pass will still be dispatched
  to and will fail its capture — this ADR does not claim `ready` predicts capture success, only that the
  environment is fit to attempt one. Catching a degrading screen reader is a separate, already-solved
  problem (`/health.vitals.recoveries`, `shouldRetireWorker`), not readiness's job.

## Alternatives considered

- **One boolean (`ok`) for both questions.** Rejected by direct incident: a worker answered `ok` while NVDA
  could not start, and the pool's dominant failure mode hid for a day because there was no second signal to
  disagree with it.
- **Gate `ready` on NVDA/screen-reader confirmation.** Rejected by direct incident: this is what produced
  the restart loop and the guest-desktop modal dialogs. Confirming the screen reader is live is itself an
  action with side effects (it can cycle NVDA), which makes it unsafe to run on every readiness poll.
- **Report `screenReader`/`warmedUp` and gate on them with a longer cool-down between checks.** Not needed:
  the problem was not check frequency, it was that any readiness-triggered screen-reader action can
  destabilise the very thing it is checking. Reporting without gating removes the incentive to touch NVDA
  during a health check at all.
