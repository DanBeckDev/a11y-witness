# Take the laptop out of the path

Written 2026-08-29, after the transport investigation ended somewhere nobody was looking. Revised the same
day for a requirement that changes the shape of it: **more than one person drives this, so everything has to
live in the control plane.** A laptop is not a small exception when there are N of them — it is N unreliable
control planes, N copies of every credential, and N places where state nobody else can see accumulates.

## Why this plan exists

`capture-protocol-plan.md` chased 9 lost responses in 40 through three wrong diagnoses — NAT (there is no NAT
on a LAN), the worker's own timeouts (refuted by measurement), the boxes' NIC power settings (already
correct). The evidence landed here:

```
21:00  Batt  18%     <- gate run, 1 canary lost
21:38  Batt   8%     <- gate run, 2 canaries lost
22:09  Batt   1%     <- gate run, 9 sockets recovered
22:32  AC    15%     <- charging
2026-08-29, AC throughout, 100%   0 of 23 lost, keepalive OFF, same LAN, same boxes
```

**The control plane was a laptop on Wi-Fi, on a draining battery, and it was the only thing in the path that
was.** The workers are mains-powered and wired; they reported 0 failures across 242 captures throughout.

That is not a capture defect. It is where the capture was being driven FROM — the thing this project has
been told about repeatedly (*"it shouldn't rely on this laptop"*, *"what has my Mac battery got to do with
this capture?"*) and answered structurally only for corpus runs.

**Confidence, stated honestly.** The battery correlation is strong and the mechanism — a power-managed
Wi-Fi radio dropping frames on a connection that carries nothing for 12–40 s — is plausible and explains why
a 15 s keepalive appeared to fix it. But there is no direct trace of the radio dropping those frames, and
the user recalls the machine being plugged in throughout, which `pmset` disagrees with (a supply that cannot
keep up under load reads exactly like this). So: **strongly evidenced, not proven** — and the plan below is
worth doing whether or not that last step holds, because a control plane that can run out of battery is a
control plane with a failure mode no amount of protocol work removes.

## What makes this cheap, and it is not what the docs imply

ADR 0012 splits the credentials: the workers are reachable from the control plane, the lab needs the
`a11y-pve` key, and **exactly one machine has both — this laptop**. That is why `lab:pipeline` runs here.

**But gates do not need SSH.** They talk to workers over HTTP `:8765`. Measured 2026-08-29, from the lab:

```
.107 200   .59 200   .175 200   .224 200   .90 200
```

The lab already reaches every worker on the capture channel. The credential split is about **deploy and
provision**, which are Ansible over SSH — and those genuinely do need the control plane. Nothing about
running a GATE does.

So the split that appears to pin the laptop in place does not apply to the work that is actually being hurt
by it. That was assumed rather than checked, for as long as the gates have existed.

The lab also already has what a gate needs: the corpus at `/opt/a11y/runs`, the dataset pages at
`runs/screenreader-dataset/pages`, node_modules, and the venv. It is 4 vCPU / 4 GB — small, and the sizing
question below is real.

---

## L1. Gates become lab jobs

**Status: MET 2026-08-29, and demonstrated by accident — the best kind of evidence.**

Both gates are in `lab-job.yml`. `gate-stability` was dispatched, the LAPTOP-SIDE PROCESS WAS THEN KILLED,
and the job carried on:

```
a11y-job-gate-stability.service  loaded active running  gate-stability at 3ce6bb3cc16f
SubState=running
```

Killing the dispatch did not touch the run: it is a systemd unit parented by PID 1 on a wired,
mains-powered host. (`Result=success` appears in that same output and means NOTHING while `SubState` is
`running` — `Result` and `ExecMainStatus` are populated during a run, which `lab-job.test.ts` pins.)

`lab-job.yml` has no gate entries; `rules-gate` is there because it needs no worker. Add the two that do:

```yaml
gate-stability:   { argv: ["{{ lab_tsx }}", "packages/lab/scripts/stability-gate.mjs"], timeout: 3600 }
gate-probe-order: { argv: ["{{ lab_node }}", "packages/lab/scripts/gate-probe-order.mjs"], timeout: 3600 }
```

They need no new flags: both already default to every worker in `inventory.yml` and shard across the pool.

**Done when:**

- `npm run lab:job -- -e job=gate-stability` runs the gate on the lab and `lab:status` reports it, with the
  laptop free to be closed. The dispatch is Ansible over SSH; the RUN is a systemd unit that outlives it.
- The page server is leased ON THE LAB, so the workers fetch corpus pages from a wired, mains-powered host.
  That is the second half of taking the laptop out — a gate that runs on the lab but serves pages from a
  laptop has moved the orchestration and left the traffic.
- **Measured, both ways:** the same gate from the laptop and from the lab, `polls survived` and
  `sockets recovered` reported by each. If the lab is systematically cleaner, that is the missing direct
  evidence for the battery/Wi-Fi step above, obtained as a by-product rather than by trying to reproduce a
  flat battery.
- `lab-pipeline.test.ts` already requires every job named in a pipeline to exist in the catalogue; the new
  entries are covered by it the moment a pipeline references them.

## L2. ~~Warn when the control plane is on battery~~ — WITHDRAWN, and the reason matters

**Status: withdrawn 2026-08-29, replaced by L2a below.**

The original item was: a run names its control plane, and says when that host is on battery. It was
challenged with *"why do we need to say it runs on low battery as everything will be in the control
plane?"*, and the challenge is right on two counts.

**A warning is the weak form of a fix.** It depends on somebody reading it — this plan's own subject is
removing that class, and proposing a notice was the same mistake in miniature.

**And it warns about a case L1 removes.** Checked rather than assumed: `capture`, `capture-real-pages`,
`capture-acceptance`, `evidence-check`, `rules-real-pages` were already lab jobs, and L1 added the two
gates. So **everything that produces corpus evidence or a gate verdict now runs on the lab.** What remains
on a laptop is diagnostics — `capture:check`, `identity:rate`, `bench-capture`, `worker:compare` — plus
`fleet:deploy` and `fleet:provision`, which are short SSH operations that fail loudly and produce no
evidence.

A diagnostic taken from a flaky host is a much smaller problem than a corpus captured from one, and
`refuseIfBusy` already covers the measurement-hygiene half of it.

## L2a. A verdict-producing gate DISPATCHES to the lab; running it locally is the escape hatch

**Status: MET 2026-08-29.** `npm run gate:stability` and `gate:probe-order` dispatch to the lab; `--local`
runs here and names the control plane in the verdict's own `source`, beside the workers it used.

`LOCAL_FLAG` is exported so a caller's `refuseUnknownFlags` list and the dispatcher cannot disagree, and
`dispatch.mjs` takes `argv` as a REQUIRED argument rather than reading `process.argv` — the argv-guard
discovery test correctly flagged it as an unguarded CLI when it did, and the honest answer was to stop
reaching for global state rather than to exempt it.

The residual is narrow but real: `npm run gate:stability` still executes locally, and its verdict looks
identical to one produced on the lab. Someone debugging will run it, paste the result, and nothing in the
output distinguishes the two.

The fix is the convention this repo already uses everywhere else — **the safe thing is the default and the
other one announces itself** — rather than a label on the unsafe thing:

- `npm run gate:stability` dispatches to the lab, the way a capture run already does.
- `--local` runs it here, and the verdict's `source` says so, exactly as `--worker` already announces a
  one-box run.

**The friction is real and is the correct friction.** Dispatching needs the ref pushed, because
`run-job.yml` refuses a commit other than the one asked for — *"a job that quietly runs four commits behind
reports success for code you did not ask for"*. So `--local` stays genuinely useful for a working tree, and
that is what it is for.

**Done when:**

- The two gate scripts dispatch by default and run locally under `--local`.
- A local verdict names its control plane in `source`; a dispatched one names the lab.
- `refuseUnknownFlags` knows `--local`, and the discovery test that requires every argv reader to be
  guarded still passes.

## L3. EVERYTHING runs on the control plane, because more than one person drives this

**Status: MET 2026-08-29. Verified end to end: laptop dispatches, control sequences under systemd, the lab
executes, a real verdict returns — with the connection gone.**

```
$ npm run lab:pipeline -- --pipeline=gates
started as a11y-pipeline-gates on <the control plane>. It now outlives this terminal.
...
FAIL — 2 signal(s) do not discriminate        <- from check-signals, ON THE LAB
```

The requirement settles what was written as a decision, and the objection recorded as blocking turns out
not to apply.

The requirement is *"this could be controlled by multiple people so everything has to live in the control
plane"*, and it changes the analysis completely. A laptop is not a small exception when there are N of
them: it is N unreliable control planes, N copies of every credential, and N places where state that
nobody else can see accumulates.

### The split I thought this violated is ALREADY violated, on the laptop

ADR 0012's argument is specific: *"the credential able to reconfigure the entire fleet would sit next to
the largest supply-chain surface in the system. A compromised transitive dependency in the capture pipeline
could reach the SSH key and, from there, twelve Windows boxes."* So the thing being kept apart is **npm's
transitive dependencies** and **the fleet SSH key**.

**Those are already together on every operator's laptop** — which holds fleet access, the `a11y-pve` key,
AND runs the entire workspace with `npm test`, `npm run`, a browser and everything else. It is the least
controlled machine in the system and it sits outside the architecture the ADR describes. With multiple
operators that is not one violation, it is one per person.

So moving orchestration onto the control plane does not weaken ADR 0012. It is the first thing that
actually enforces it.

### And the direction of the key is what preserves the threat model

Measured 2026-08-29 on CT 120: **no `node_modules`**, the fleet key present, and the lab's SSH port
REACHABLE — it lacks a key, not a route.

Give control a key **to the lab**, and:

| | control (CT 120) | lab (CT 121) |
|---|---|---|
| fleet SSH key | yes | no |
| key to the lab | **yes, new** | — |
| key back to control | — | **no, and this is the point** |
| `node_modules` | **no** | yes |
| the corpus, the weights | no | yes |

The supply-chain surface stays on the lab; the fleet key stays on a box with no npm dependencies; and the
new key points **control → lab**, so a compromised lab dependency cannot reach the fleet key. That is
ADR 0012's guarantee intact, which giving the LAB a fleet key would not be.

### MEASURED 2026-08-29: ADR 0012 IS BROKEN ON THE CONTROL PLANE ITSELF

Looking for what control was missing turned up what it should not have:

```
/root/a11y-witness/node_modules   56M, 121 packages
/root/.ssh/<fleet key filename>   the fleet key
```

**That is verbatim the configuration ADR 0012 exists to prevent** — *"the credential able to reconfigure
the entire fleet would sit next to the largest supply-chain surface in the system. A compromised transitive
dependency in the capture pipeline could reach the SSH key and, from there, twelve Windows boxes that
auto-log-in to unlocked desktops."* 121 packages, beside that key, on that box.

**And nothing on control needs them.** Checked rather than assumed:

- `code-version.mjs` — the one thing fleet management imports — has **zero bare imports**: `node:crypto`,
  `node:fs`, `node:path`, `node:url` and one sibling module. `deploy.yml` imports it BY PATH for exactly
  this reason, and says so in a comment.
- The only `npm install` in the fleet playbooks is `ansible.windows.win_shell`, which runs on the WINDOWS
  WORKER, not here.

So the split described in the ADR is not implemented on either machine that matters: control carries the
dependencies it was designed to exclude, and every operator laptop carries both credentials AND the whole
workspace. The document is accurate about the intent and describes a system that does not exist.

**The remedy is a deletion, and it is one command** — `rm -rf /root/a11y-witness/node_modules`, recoverable
with `npm install` if something unexpected turns out to need it. It is NOT done in this plan because
deleting 56 MB on a live box is the operator's call, not a side effect of a documentation change.

**A guard belongs with it.** A deletion nobody re-checks is a deletion that reverts the next time somebody
runs `npm install` on that box to debug something — this repo's own rule about anything relying on a human
to remember. `fleet:status` or `doctor` should assert that the control plane has no `node_modules`, and say
what it costs if it does.

### What moves — and MOST OF IT ALREADY HAD, which the plan got wrong

This item claimed three things still ran from the laptop: `fleet:deploy`,
`fleet:provision`, and `lab:pipeline`'s sequencing. **Two of those were already correct.**
`fleet-playbook.mjs` SSHes to the control plane and runs `ansible-playbook` THERE — its header says so
outright, *"typing `ansible-playbook` on the control plane — the hand-crank this file exists to remove"*.
Written into the plan without checking, which is the failure this document is otherwise about.

So the residual was one thing, and it was a credential rather than a command:

**The laptop held a SECOND fleet key, and it opened nothing.** Measured 2026-08-29:

```
laptop   SHA256:4SsFx2Ej3MHH4HX0Wr8MDbnKhEoDE4fTnlmTjyfgOjc   Permission denied on ALL FIVE workers
control  SHA256:6hbVhrdIpvSDPo3nn++nDov5J8sgFNN17g1GgwQJY7s   opens them (A11Y-IDT01MNFPA)
```

Not a copy — a different key, dead, and the sole reason `doctor` reported this machine in violation of
ADR 0012. `bootstrap-control-plane.sh` says why it should never have existed: *"a key on a Mac makes that
Mac load-bearing again by a different route. Generated rather than copied, so this box is
self-contained."*

Moved to `~/.ssh/retired-a11y/` with a note recording the fingerprints and the verification, rather than
deleted — a private key deletion is not reversible and keeping it costs nothing. `doctor` now reads
`OK isolation — no fleet key here, so nothing to isolate it from`, and `worker:code` still reaches all
five boxes, because the fleet tooling never used the local key.

**What genuinely remains on the laptop is `lab:pipeline`'s sequencing**, and it is now the only thing: it
needs a route to both the fleet and the lab, which is exactly what L3's control→lab key made possible. That
is the next mechanical step and it is small.

### What moved, historically

- `fleet:deploy`, `fleet:provision` — already Ansible over SSH from control's own credentials; they run
  there rather than from a laptop that happens to hold a copy.
- `lab:pipeline`'s sequencing — the thing that needed both credentials, which is exactly what this closes.
- Gate dispatch (L2a) — `--local` stops being an escape hatch for one person and becomes what it should be:
  a debugging path that announces itself.
- **An operator drives the control plane. They do not hold the keys.**

### What gets better with more than one person, specifically

- **The unit name is already the lock.** `lab:job` refuses a second job of the same name rather than
  queueing it, and that holds across operators because it is enforced by systemd on one host — not by a
  flag in one person's process. Two people cannot start the same capture twice.
- **`lab:status` is a shared view.** Today, "is a run in flight?" is answerable only by whoever started it.
- **A verdict has one provenance.** With N laptops, N gate results look identical and were produced under
  N different conditions — which is how a transport fault went two days without being attributed.

**Done when:**

- Control holds a key to the lab, and `lab:job`/`lab:status`/`lab:log` work from there.
- `fleet:deploy` and `fleet:provision` run from control.
- A laptop needs NO key to either the fleet or the lab to do ordinary work.
- ADR 0012 gets an amendment recording that the split was silently broken by the operator machine, and that
  this is what restores it — because an ADR whose guarantee is void in practice is worse than none.

---

## Explicitly NOT in this plan

- **Rewriting the capture protocol again.** `capture-protocol-plan.md` A already removed long-lived
  connections, which makes the fault survivable regardless of the control plane. This plan removes the
  CAUSE; that one removed the EXPOSURE. Both are worth having and neither replaces the other.
- **Deleting the keepalive.** Its diagnosis was wrong and it is labelled as such in the code. It costs one
  packet a minute and still covers `A11Y_SYNC_CAPTURE`. Removing it is a separate, cheap change that should
  follow the direct evidence from L1's two-way measurement, not precede it.
- **Moving the corpus or the weights.** They are on the lab because ADR 0012 put them there. Nothing here
  argues with that.
- **Wiring the laptop by Ethernet.** It would probably work, and it is exactly the kind of remedy that
  depends on somebody remembering. The plan's own subject is removing that class.

## How to know it worked

```bash
npm run lab:job -- -e job=gate-stability     # dispatch, then close the laptop
npm run lab:status -- -e job=gate-stability  # it is still running
```

And one number, from L1's two-way measurement: **`polls survived` from the lab against the same figure from
the laptop.** If the lab is reliably zero and the laptop is not, the battery step is evidenced directly and
this plan's premise is confirmed by the thing it built. If both are zero, the premise stands unproven and
the plan is still right for the reason in the header — a control plane that can run out of battery has a
failure mode no protocol work removes.
