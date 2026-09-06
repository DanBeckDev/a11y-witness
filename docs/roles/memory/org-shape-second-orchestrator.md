---
name: org-shape-second-orchestrator
description: "Agreed 2026-09-06 org change: a second orchestrator owns the worker loop (brief, first-pass review, merge); the original keeps fleet, lab, diagnosis, CEO reporting; no extra workers until measured."
metadata:
  type: project
---

Decided 2026-09-06 after workers idled three times in one day behind a single serial orchestrator.

**The measured bottleneck:** ~30% of the orchestrator's day was briefing and merge-queue work anyone
competent could do; ~30% was gate/capture diagnosis only it could do. Every finished worker waited for it
to be free to review, merge, choose a row and write a brief. ~23 fleet-free rows were ready against 5
workers, so work was never the constraint.

**The cut (the orchestrator's, adopted over my fleet-vs-review draft):** a second orchestrator owns the
WORKER LOOP: briefing from the READY queue, first-pass review, test-running, merging self-contained
branches. It hands up anything touching a shared file, a cache key, or a probe another unit also touches.
The original keeps fleet, lab, diagnosis and CEO reporting, because diagnosis needs fleet state and code
held together. Rule: *first-pass review composes; cross-cutting review does not.*

**Supporting mechanism:** `docs/backlog-ready.md`, pull not push: each row carries an acceptance command,
bounding CLAUDE.md sections, the region owned, a branch name; claimed by pushing the branch name in; every
row shown open by a command before listing. Role brief at `docs/roles/worker-loop-orchestrator.md`.

**Why no extra workers yet:** with a serial orchestrator more workers means more idle and more briefing
load. Add workers only after the split, if the queue holds more than five rows.

**Measurement that decides whether the split is right:** worker idle time down, the original
orchestrator's diagnosis share up, zero units dispatched at closed rows. If briefing quality drops, the
split is wrong and briefing goes back.

See [[ceo-worker-utilisation]] and [[orchestrating-peer-sessions]].

**Added 2026-09-06 (board-approved):** `product-manager` owns the PRODUCT loop: the tracker (GitHub Issues +
a Project on DanBeckDev/a11y-witness; markdown files demoted to record), the release milestone with a
recorded reason for every date move, and a daily board report generated from GitHub data. Reports to `ceo`.
Never merges, never briefs workers, never touches fleet/lab/runs/. Contingency plan: role files for all
eight agents in `docs/roles/`, memory into the repo, credentials to a secrets store, corpus snapshot
off-lab, Tailscale for a cloud control plane, and a monthly drill that recreates one agent from its role
file on another machine.

**Board decisions 2026-09-06 (approved as proposed by the CEO):** edition 3 is the daily document template;
V1 = one person outside the project runs the tool on an app they own and says whether the output was worth
it (PLAN.md B1), no date until that person is named; the board introduces a candidate matching the stated
profile (#46); the false-positive promise is exactly what was measured, numbers generated from gate
reports (#47); no telemetry ever, opt-in + major version if that ever changes (#48); licence split stays
(5 AGPL + 1 Apache, deliberate), open source only at first publish (#49). Push-everything is the rule:
no work exists only on this machine; the daily report runs in GitHub Actions, no local job.
