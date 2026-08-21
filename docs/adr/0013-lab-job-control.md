# ADR 0013 — Drive long lab jobs through Ansible and systemd, not through a remote shell

## Status

Accepted, 2026-08-21. Narrows ADR 0012's "there is no service between them" rather than contradicting it,
and applies ADR 0001's "SSH is only for provisioning and debugging" to a case that rule did not anticipate.

## Context

Training runs, dataset exports, corpus builds, abstention sweeps and real-page captures were started by an
operator typing:

    ssh root@192.168.1.96 'pct exec 121 -- bash -lc "..."'

**None of that existed in the source tree.** `pct exec` and `ssh root@` appear nowhere in the repo, so the
way this project's most expensive operations were launched was untested, unversioned and unreviewable. Every
other moving part here — the worker, the page server, NVDA, the VM pool, the Windows fleet — has a defined
interface; the lab had a shell prompt.

Two days of that cost, measured:

| incident | root cause |
|---|---|
| four capture shards ran against `--worker=http://:8765` for 29 min while every worker sat idle | a bash array evaporating across `nohup bash -c`, plus a truthiness check and a `catch` that classified `ERR_INVALID_URL` as "mid-boot" |
| a heredoc arrived mangled | shell string construction across two hops of quoting |
| an `scp` silently did not land | verification sharing a failure mode with the action |
| release-eligible weights destroyed | a `git checkout` over a git-tracked build artifact written in place |
| four `pgrep -f X` waiters matched their own command lines and never fired | no process identity |
| a job reported "still running" 28 minutes after finishing | no progress record for that job type |

Only the second is a transport failure. That re-attribution shaped the decision: **most of the pain was
missing validation and missing supervision, and a better transport fixes neither.** Both were fixed
alongside this, and are not what this ADR is about.

## Decision

**Ansible dispatches; systemd supervises. No new service, and no new listening socket.**

- `tasks/run-job.yml` turns a job name plus argv into a transient systemd unit,
  `systemd-run --unit=a11y-job-<name> --remain-after-exit`, then polls for it to stop, reads its exit code
  back, prints its output, releases the handle, and asserts on the code. It is deliberately the same shape
  as `tasks/run-interactive.yml`, which already does this for Windows workers through a one-shot scheduled
  task.
- `lab-job.yml` holds a **catalogue of named jobs**. There is no `command` parameter. Callers pass choices:
  a job name, and for a capture a worker NAME resolved through the inventory.
- `lab-status.yml` is read-only and answers from **two independent sources** — systemd's view of the process
  and the job's own progress file.
- The lab joins `inventory.yml` as group `a11y_lab`, so the fleet is still defined once.

`ansible.builtin.command` with `argv:` never invokes a shell, so the quoting class is removed by
construction rather than by care.

## Why not an HTTP job API on the lab

This was designed first and rejected. `ansible/README.md` already rejected an `/admin/update` route on a
**worker**, and every clause transfers with more force to a route whose purpose is running training jobs:

> The worker has **no authentication of any kind** … A mutating route there is unauthenticated remote code
> execution on twelve boxes. […] It could not provision a bare machine, collect logs, or manage power state
> anyway, so the SSH path would still be needed. **Ansible subsumes the HTTP route; the reverse is not
> true.**

The lab holds the capture corpus (not reproducible — `browserVersion` is a capture cache key), the
`a11y-corpus` GitHub deploy key, the release weights, and the ability to wake twelve Windows machines that
auto-log-in on the same L2 segment. A Unix-socket variant reached over an SSH tunnel would have been
defensible, and it also exposes the design's emptiness: SSH would then *be* the authentication, and the HTTP
hop would buy exactly one thing — a durable handle to a process that outlives the session. `systemd-run
--unit=` gives that for zero new code and zero new surface.

**On protocol, since that was the question asked.** WebSocket is wrong: bidirectional and binary-oriented,
bypassing HTTP intermediaries, where job control is unidirectional. SSE's `Last-Event-ID` recovery is
genuinely the right tool for a dropped progress stream, but an agent driving this cannot hold an
`EventSource` across turns. Async request-reply — dispatch, then poll a durable handle — is the canonical
answer when the client is not an addressable callback endpoint, and it is what the worker already does with
its client-minted `captureId`. **This decision keeps that pattern and changes only the carrier:** the handle
is a deterministic unit name, and `lab-status.yml` is the `GET`.

## How this sits with ADR 0012

ADR 0012 rejected a lab↔control API, and the rejection has two independent legs:

- **Availability coupling** (`:76-77`) — "a failure mode where the lab is up, control is not, and a run
  cannot start against workers that are perfectly healthy." That is about a machine-to-machine dependency
  **inside the run path**. This is operator→lab, outside it, and `ssh` remains available if Ansible is not.
  **Does not apply.**
- **Cost and surface** (`:84-86`) — "It adds a service to write, secure and keep running." This applies
  verbatim, and it is why the answer is Ansible: **nothing is added.** No daemon, no port, no token, no
  supervision, no dependency. ADR 0012's "there is no service between them, deliberately" remains true after
  this change.

ADR 0012's selection criterion is worth restating because it is the standard this had to meet: "That
privilege split falls out of the **physics** rather than out of policy, which is why it will not erode." An
HTTP API's controls would all have been policy — a whitelist, a token, a bind address. Agentlessness is
physics: there is no route because there is no listener.

## Consequences

- **The lab is reached directly at its own IP, not through `pct exec` on the Proxmox host.** That second hop
  was the entire source of the quoting problem, and removing it was free — the container has always had its
  own sshd.
- **Mutual exclusion is the unit name**, which holds against an operator on an ssh session too. An
  in-process flag could not, because there are two paths to the resource.
- **A job survives its launcher.** Transient units are parented by PID 1, so killing the playbook — or
  losing the connection — loses the poll and never the job. Verified by killing `ansible-playbook` mid-run
  and recovering the state afterwards.
- **Jobs must be added to the catalogue**, which is friction by design. A job that is not worth writing down
  is not worth running against the corpus.
- **Worker playbooks still run from CONTROL**, which holds the fleet key. Only the lab playbooks are
  runnable from a developer's machine, because the lab uses the Proxmox key. That asymmetry is ADR 0012
  working, not a gap.

## Three things measured, which any reimplementation must respect

Each of these would otherwise be a silent bug, and each was hit before it was understood. `lab-job.test.ts`
pins all three.

1. **Poll `SubState`, never `systemctl is-active`.** Under `--remain-after-exit` an exited unit stays
   `active (exited)` for good, so `is-active` returns true forever and a waiter written that way hangs
   indefinitely reporting "still running" for a finished job — *the original incident, reproduced inside its
   own fix.*
2. **`Result` and `ExecMainStatus` are populated WHILE the job runs.** Observed `Result=success
   ExecMainStatus=0` on a job seven minutes from finishing. They mean nothing until `SubState` leaves
   `running`, which is this repo's "404 and 202 are different answers" rule in a new costume.
3. **`--remain-after-exit`, not `--collect`.** A collected unit is unloaded on exit and takes its exit code
   with it. Verified both ways on the container: `exit 42` leaves `Result=exit-code ExecMainStatus=42`
   rather than vanishing.

Also: set `PYTHONUNBUFFERED=1` in the runner's fixed environment, or a six-minute training job shows nothing
in `journalctl` but its `Started` line until it exits.

## Alternatives considered

- **A job queue (BullMQ, pg-boss, Graphile Worker).** Each needs a daemon — Redis or Postgres — and a fresh
  dependency tree beside the corpus, which is the supply-chain surface ADR 0012 exists to keep away from
  valuables. They are built for many short retryable jobs across many workers; this is one box, ~6 job
  types, concurrency 1, and **retries are actively wrong** here, because a retried real-page capture is a
  second live fetch of somebody else's site.
- **Jenkins or Concourse.** A JVM, a plugin supply chain and an authenticated web UI to patch forever — an
  order of magnitude more than the service ADR 0012 already rejected as over-engineering for one operator.
  At ten people this would be the right answer.
- **A self-hosted GitHub Actions runner.** The credible second-best, and it nearly won: it polls
  **outbound**, so nothing listens at all, and `workflow_dispatch` inputs with `type: choice` are exactly
  the enum containment described above, with authentication, history, logs and `gh run watch` for free.
  Rejected because **the main repo is public**, and a self-hosted runner on a public repo means fork-PR
  execution on the box holding the corpus — mitigable only by a configuration that must never be wrong.
  Revisit in a private ops repo if scheduled nightly work becomes the point.
- **`tmux` or `at`.** A detached session is not a durable handle: no exit code, no structured status, and
  "is it running" becomes `tmux has-session`, which is the `pgrep` problem with extra steps.
