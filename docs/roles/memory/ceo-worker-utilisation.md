---
name: ceo-worker-utilisation
description: "When acting as CEO over the orchestrator, idle workers are my failure too; verify with ListAgents every round and require a utilisation line in every status."
metadata:
  type: feedback
---

On 2026-09-06 the operator found all five workers (`worker-capture`, `worker-judge`, `worker-audit`,
`worker-contracts`, `worker-config`) idle while the orchestrator alone ran a four-hour recapture, with
~38 fleet-free architecture-audit rows open. The orchestrator had said "waiting on peers" and I accepted
it without checking what the peers were doing.

**Why:** the fleet is the only resource a recapture occupies; workers never touch it. "Waiting on the run"
is the orchestrator's and my job, never a worker's. Idle capacity during a long run is the most expensive
waste this project has, and the orchestrator has a measured tendency to hold units unbriefed.

**How to apply:**
- Run `ListAgents` before replying to any orchestrator status; if the workers read idle, that is the
  first thing to address, before the technical content.
- Standing rule given to the orchestrator: no worker idle while a fleet-free backlog row exists; every
  status carries a utilisation line (five workers, unit each, idle ones with the reason); a queue of
  briefed-but-unstarted rows so a finishing worker picks up without a round trip.
- Treat "five busy" in a report that disagrees with `ListAgents` as the diagnostics-lied shape.
- See [[orchestrating-peer-sessions]] for the partition-by-resource rule that makes fleet-free briefs safe.

**Corrected 2026-09-06, evening:** "queue empty" is NEVER an acceptable idle reason for the dispatcher;
an empty Ready column is the dispatcher's own unit. For a worker it is acceptable for one hour while it
sources from its own lane. The board saw five idle workers three times in one day; the third time the
cause was my own ruling. Permanent fix: the product manager owns a roadmap twenty rows deep so Ready
never drops under three; the dispatcher's status names the next three Ready rows; utilisation is
sampled every 15 minutes into the daily board document from data, not from messages.
