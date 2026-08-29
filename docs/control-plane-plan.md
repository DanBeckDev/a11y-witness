# Take the laptop out of the path

Written 2026-08-29, after the transport investigation ended somewhere nobody was looking.

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

**Status: open. The whole point, and it is additive — nothing is taken away.**

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

## L2. The laptop stops being able to do it silently

**Status: open. Without this, L1 is a preference and preferences decay.**

Running a gate from a laptop must still be POSSIBLE — it is the debugging path — but it must SAY so, the way
`--worker` already announces a one-box run. A verdict produced from an unreliable control plane should carry
that in its provenance, because this session spent two days attributing a transport fault to the capture
protocol and the evidence for where it came from was in `pmset`, not in any report.

**Done when:**

- A gate run names its control plane in the verdict's `source`, the way it now names the workers.
- On a host that is on battery, it says so, and says what that cost measurably: 9 of 40 responses at 1%.
  Refusing outright would be wrong — the debugging path is real — but an unlabelled number from a laptop is
  how this went unnoticed.
- `doctor` reports the same, since it is already the "can I run right now?" command.

## L3. Decide what the control plane IS

**Status: open. A decision, and the only item here that is not mechanical.**

L1 moves gates. It does not answer the general question, and three things still run from the laptop today:
`fleet:deploy`, `fleet:provision`, and `lab:pipeline`'s sequencing.

The options, with what each costs:

| | what it means | cost |
|---|---|---|
| **leave deploy/provision on the laptop** | they are operator-initiated, minutes long, and a failure is loud (`fleet:deploy` refuses and names the box). The battery fault hurt long silent runs, which these are not | nothing, but the laptop stays load-bearing for the fleet |
| **give the lab the fleet SSH key** | one machine drives everything; `lab:pipeline` becomes a lab job | puts BOTH halves of ADR 0012's split behind one credential — the thing that ADR exists to prevent |
| **give the control plane (CT 120) the `a11y-pve` key** | the mirror image: the control plane drives the lab | same objection, opposite direction |
| **a third box that holds neither corpus nor weights** | a real control plane: reaches workers over HTTP and SSH, reaches the lab, holds nothing valuable | one more machine to provision and keep current |

The last is the only one that both removes the laptop and respects the split. It is also the only one that
costs hardware. **This is a decision about what the project's operational surface should be, so it is
written here rather than made by whoever next needs a gate to run.**

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
