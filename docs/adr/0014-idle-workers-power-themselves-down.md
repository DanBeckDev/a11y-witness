# ADR 0014 — Idle workers power themselves down, and only they may decide it

## Status

Proposed. Not implemented. Depends on ADR 0012's credential split and does not change it.

**The wake gate has PASSED on all four boxes (2026-08-22)** — see "Prerequisites" — and the threshold is
measured. Every question this ADR raised is answered except one, and that one is **deferred rather than
answered**: nobody has measured what these machines draw idle, it needs a plug meter rather than a remote
query, and it was deprioritised on 2026-08-22. Do not read the silence as "measured and found small"; it
means the justification for building this has not been established either way, so the ADR stays proposed.

**Do not implement the sleep half for a box that has not passed the wake gate.** Auto-sleep on a machine
that cannot be woken does not save power, it removes a worker from the fleet permanently.

## Context

`ansible/README.md` states the position already: *"Twelve mini PCs idling is real power for no evidence, so
**off is the resting state**."* Nothing enforces it. `wake.yml` and `sleep.yml` both exist and work;
`sleep.yml` is never called by anything. There is no timer, no cron, no `fleet:sleep` npm script, and no
self-shutdown in the worker — verified by search, not assumed.

The measured consequence: on 2026-08-21 a11y-worker-2 reported `uptimeMinutes: 7205` — five days
continuously up, having served 14 captures. The other three were the same. A resting state that nothing
implements is a preference, not a policy.

### The credential asymmetry is the whole design, and it already exists

ADR 0012 split the control plane along what each side must hold. The relevant half:

> **Wake-on-LAN needs no credential.** A magic packet is an unauthenticated UDP broadcast … the lab can
> turn machines ON, and cannot turn them off or reconfigure them.

So the fleet's power model is already asymmetric, and asymmetric in an awkward direction for this feature:
**waking is free, sleeping is privileged.** `sleep.yml` needs the SSH key and therefore lives in the control
container, next to the ability to reconfigure twelve machines.

That rules out the obvious design. A timer in the control container running `sleep.yml` every N minutes
would work, but it puts a scheduled, unattended, fleet-wide power action next to the credential ADR 0012
exists to keep away from routine automation — and it makes one box's clock responsible for another box's
availability.

### A worker deciding its own idleness needs no credential at all

The worker already knows everything required: whether it is `busy`, how many captures it has served, and
when the last request arrived. Shutting *itself* down requires no key, no inbound authority, and no
scheduled fleet-wide action. The privilege split stays exactly where ADR 0012 put it, and the symmetry
completes: **a machine that needs no secret to be woken needs none to go to sleep.**

## Decision

**A worker powers itself off after a measured idle period. Nothing else may decide it.**

Four properties, each of which exists because of a specific way this could go wrong:

1. **Idle is measured from the last HTTP request of ANY kind, not from the last capture.**

   The pool dispatches **one case per worker at a time** from a shared queue, so a worker legitimately sits
   between cases while its peers work — and a retry is minutes, not seconds. A worker that sleeps in that
   gap is indistinguishable from a dead one, which is this repo's most expensive recurring shape and the
   exact fault `fleet:status` and `/health.vitals.recoveries` were built to surface.

   Keying on any request means a run's own `/health` polling holds every worker awake for as long as the
   run lives, without the run having to know this feature exists.

2. **Never while `busy`.** `sleep.yml` already refuses a busy worker, for the stated reason that a capture
   is 12–520 s of screen-reader work with no way to resume it, and that from the host a killed box looks
   like a flaky worker rather than like us. Self-sleep inherits the rule unchanged.

3. **It announces itself, before and after.** `/health.vitals` reports the countdown, and the worker logs
   the decision to `server.log` before shutting down. *A box that slept and a box that died must never be
   the same observation* — the same rule that makes 404 and 202 different answers on `/capture/<id>`, and
   the same reason `fleet:status` now distinguishes a finished capture from a running one.

4. **The threshold is measured, not chosen.** It must exceed the longest realistic inter-case gap by a
   wide margin. Picking a number before reading that distribution is how a fixed sleep gets it wrong in the
   direction that destroys evidence.

   **Measured on the 2026-08-21 full recapture** — 2,120 captures, four workers, 4 h 34 m — as the gap
   between consecutive captures on the *same* worker:

   ```
   worker           n     p50     p95     p99     max
   .224           531   31.9s   44.6s   45.7s   106.1s
   .107           539   31.6s   44.7s   45.8s    91.7s
   .59            533   31.8s   45.1s   46.6s   103.8s
   .175           517   32.6s   45.6s   46.8s   121.0s
   ```

   So under full load a worker is never un-contacted for more than **~2 minutes**, and typically 32 s. Note
   this is the *capture*-to-capture gap and therefore an over-estimate of true idleness: keying on any HTTP
   request means a run's `/health` polling resets the timer far more often than this.

   **A threshold of 20–30 minutes therefore carries an order of magnitude of headroom over the worst
   observed gap**, which is the right shape for a timer whose failure mode is losing a worker mid-run. Do
   not tune it down to chase savings without re-measuring: the tail here is a retry, and a retry is the
   case that matters.

Waking stays as it is: `npm run fleet:wake`, from the lab, holding nothing.

## Prerequisites — and this is a gate, not a checklist

`ansible/README.md` lists three requirements for WoL and warns that **only two are automated**:

1. **WoL enabled in each box's firmware** — a console visit, once per machine, and nothing can automate it
   because the box is off and has no OS to ask.
2. The adapter armed to wake (`a11y_nic_power`). Note the trap already recorded there: an earlier fallback
   wrote `PnPCapabilities = 24`, which Microsoft documents as *also* preventing the adapter from waking the
   machine — it would have made WoL impossible while reporting success.
3. Fast Startup off, or many boards never reach S5 and never wake.

**Therefore: prove each box wakes before enabling self-sleep on it.** Sleep it deliberately, wake it with
`fleet:wake`, confirm it serves `/health`, and record that it did. A box that has not passed that test must
keep the feature off.

**Run 2026-08-22, all four, one at a time so a failure would cost one worker rather than four.** Slept via
`sleep.yml` from the control container, confirmed down by both HTTP and ICMP, then woken **from the lab**
with `npm run fleet:wake` — the path that holds no credential, and the one a run would use:

```
a11y-worker-2    36 s     a11y-worker-4   125 s
a11y-worker-5    38 s     a11y-worker-3   191 s
```

All four came back `ready`, serving, and still on the pinned Edge build. **The spread is the finding**: 36 s
to 191 s for the same operation on nominally identical hardware, and the time includes a full Windows boot
and NVDA warm-up, not just the packet. Anything that wakes a worker must therefore wait on `/health` rather
than on a fixed delay — the same rule as everywhere else in this pipeline — and budget minutes, not seconds. The failure mode of getting this wrong is not a slow run — it is a machine that is
off, unreachable, and needs someone physically present, which is the one outcome this fleet's whole remote
design exists to avoid.

## What this does not do

- **It does not wake anything automatically.** A run that finds a worker asleep must call `fleet:wake`
  itself. Today, with `A11Y_WORKERS` set, nothing does — naming workers means managing them. Wiring the
  pooled path to wake what it needs is a separate change, and should be, because it changes what a run does
  to hardware.
- **It does not touch `sleep.yml`.** That stays as the operator's deliberate, fleet-wide action, and stays
  in the control container.
- **It does not apply to the lab or the control container.** Those hold state and serve on demand.

## Alternatives considered

| | why not |
|---|---|
| A systemd timer in the control container running `sleep.yml` | Puts a scheduled unattended fleet-wide power action next to the credential ADR 0012 isolates, and makes one box's clock responsible for another's availability. Reuses the existing busy-refusal, which is its one real advantage. |
| Windows' own idle sleep timers | Not observable from the fleet tooling, not in git, and drifts per box — the same class of thing `edgePolicy` drift and `StartupBoostEnabled` already demonstrated. And S3 sleep on these boards is what Fast Startup interferes with. |
| Leave it manual | Honest, and the status quo. But CLAUDE.md's own rule is that anything a human must remember does not happen, and five days of continuous uptime on an idle fleet is the evidence. |

## Risks, and what would falsify this

- **A box that sleeps mid-run.** Watch for a worker leaving the pool with zero failures attributed to it.
  If the request-keyed timer does not prevent this, the design is wrong, not the threshold.
- **WoL proves unreliable on some board.** Then that box keeps the feature off permanently; it does not get
  a shorter timer or a retry loop.
- **The saving may not be worth it, and this is now the ONLY thing blocking a decision.** Nobody has
  measured what these boxes draw idle, and it cannot be measured remotely — `/health` reports uptime, not
  watts. It needs a plug meter on one machine for an hour. If the number is small, the correct outcome of
  this ADR is to record that and do nothing: a feature that adds a way to lose a worker should have to earn
  its place with a number, and every other question about it has now been answered.
