# Production readiness

What "ready" means here, item by item, with the things we deliberately did **not** do and why.

The structure is the Production-Grade Infrastructure Checklist from *Terraform: Up and Running*
(ch. 8). Its argument is that most teams have no shared definition of production-ready, so each
component ships missing something different — and its rule is the useful part: *"consciously and
explicitly document which items you've implemented, which ones you've decided to skip, and why."*
Applying it to a11y-witness surfaced four gaps nobody had written down. Two are now fixed, two are
accepted with reasons.

**Scope.** a11y-witness is a developer tool: a CLI plus a pool of local Windows capture workers. It is
not a hosted service, so several checklist rows are legitimately not applicable — but they are recorded
as skipped rather than silently omitted, which is the whole point.

| # | Item | Status | Notes |
|---|---|---|---|
| 1 | Install | **Done** | `bootstrap-windows-worker.ps1` takes bare Windows to a working worker; `provision-nvda-worker.ps1` is idempotent and is also the repair path. NVDA is pinned via `@guidepup/setup`. |
| 2 | Configure | **Done, one gap** | Provisioning sets NVDA config, Edge policies, `ForegroundLockTimeout`, auto-logon and the scheduled tasks. **Gap:** `provisionRevision` reads `"unstamped"` on every guest, so the capture cache cannot see a re-provision. Known, documented in `CLAUDE.md`. |
| 3 | Provision | **Done** | Local UTM VMs via `build-vm.sh` / `clone-worker.sh`; CI via `guidepup/setup-action`. |
| 4 | Deploy | **Done** | `npm run worker:deploy` — pushes every hashed file, reboots (mandatory: `utmctl exec` cannot be trusted to restart the worker), then verifies `/health.code` over HTTP. Previously a twelve-step manual process, which is how two guests once ran stale code for an hour. Rollback is `git checkout <ref> && npm run worker:deploy`; git is the source of truth, so there is no bespoke backup to go stale. |
| 5 | High availability | **Partial, by design** | The pool tolerates worker loss: a worker failing three captures in a row is evicted and its cases requeued; a sick VM cannot cancel a run. The **host is a single point of failure** and that is accepted — this is a dev tool on one Mac, not a service with an SLO. |
| 6 | Scalability | **Done** | Horizontal, by adding worker VMs. Capped by *measured host memory* (`vm_stat`), because a VM costs ~7 GB not its configured 4 GB, and over-committing made captures 1.6× slower **and** less reliable. `A11Y_MAX_WORKERS` overrides. |
| 7 | Performance | **Partial, quantified** | Per-phase benchmarks (`bench-capture.mjs`). Mute-NVDA recovery cut 184 s → 86 s; per-capture mean 51.5 s → 41.0 s. **Known unoptimised:** Edge cold-starts every capture, ~10 s of ~27 s. Not taken because the only viable route changes evidence semantics; see `CLAUDE.md` for the analysis and why the other two routes are dead ends. |
| 8 | Networking | **Done** | Guest↔host addressing is derived, not guessed (`hostAddressFor`) — the host's `localhost` is unreachable from the guest, which used to produce whole datasets of empty captures. Firewall rules in provisioning. |
| 9 | Security | **Deliberately skipped** | The worker's HTTP API on `:8765` has **no authentication**, and `/capture` will fetch any URL you give it. That is acceptable only because it is bound to a local VM on a trusted host network. **Do not expose a worker port to an untrusted network or the internet.** Adding auth would be the first requirement of turning this into a hosted product. |
| 10 | Metrics | **Partial** | `/health` reports `ready`, `readiness.checks`, `code`, `environment`, and `vitals` (`uptimeMinutes`, `freeMemoryMb`, `captures`, `failures`, `recoveries`). `recoveries` is the leading indicator — it counts faults the worker papered over, so a degrading guest shows up there while captures still succeed. Runs write a progress file with an ETA. **No aggregation or alerting**, which a single-operator tool does not need. |
| 11 | Logs | **Done** | `server.log` on each guest (console *and* file, deliberately), `page-server.log` on the host. **Now rotated** at 16 MB with one generation kept — previously it grew for the life of a guest, which was a slow-motion disk exhaustion nobody would have attributed correctly. |
| 12 | Data backup | **Accepted risk — read this one** | The corpus (`runs/`, ~27 MB, 2,122 captures) is **gitignored and not backed up**. It represents many hours of worker time and is the ground truth for `check-signals` and the corpus gate. It is reproducible (`npm run training:capture`) but not cheaply. `npm run corpus:snapshot` writes a timestamped archive; **syncing that somewhere durable is the operator's call** and is not automated, because choosing a destination is a decision this repo should not make for you. |
| 13 | Cost optimization | **Done** | VMs are stopped at rest and a run starts only what it needs, then puts each back as it found it. The pool cap prevents paying for VMs that make the run slower. |
| 14 | Documentation | **Done** | `CLAUDE.md` (operational, with the failures behind each rule), `docs/nvda-worker-runbook.md` (error string → real cause → fix), `docs/getting-started.md`, ADRs, `docs/METHODOLOGY.md` for the claims we will and will not make. |
| 15 | Tests | **Done, with honest limits** | 125 unit tests, the corpus gate over all 2,122 captures, `check-signals`, `capture-check` on the VM, `evidence:check` for capture changes, and `eval` for judge quality. **Two cannot run in CI** — `eval` needs a local Codex login and the corpus gate needs `runs/` — and that is stated rather than papered over. |

## The gates, and what they are for

Layered, because they answer different questions. Run the ones your change touches.

| Command | Question it answers | CI? |
|---|---|---|
| `npm run lint` / `typecheck` / `test` | Does the code hold together? | yes |
| `npm run doctor` | Can I run right now, and what is the next command? | n/a |
| `npm run worker:code` | Are the guests running the code in this checkout? | no (needs the VMs) |
| `npm run evidence:check <worker>` | Did a capture change alter the **evidence**, or only the timing? | no (needs a worker) |
| `capture-check` on the guest | Do the capture probes still produce the values they must? | yes, path-filtered to `src/capture/**` |
| `npm run training:check-signals` | Does every dataset case still discriminate good from bad? | no (needs `runs/`) |
| `npm run eval` / `eval:gate` | Is the judge still good enough? | no (needs Codex login) |
| `npm run witness -- <url> --task …` | Does the product actually work end to end? | no |

`evidence:check` is the one worth understanding. The capture cache keys on `provisionRevision` and
`CAPTURE_PROTOCOL_VERSION`, so changing either invalidates all 2,122 captures — which meant every
capture optimisation "cost a full recapture" before anyone could tell whether it changed what NVDA
says. The key is a conservative proxy; `evidence:check` is the direct measurement. `SAME` means ship
without invalidating; `CHANGED` means the recapture is real, and the cheap moment to pay it is bundled
with any other pending protocol bump.

## What is explicitly not claimed

- **Judge quality has no expert baseline.** `docs/METHODOLOGY.md` is the authority: the guards were
  tuned against the same 34 fixtures the eval scores, and scoring is single-run. Do not quote eval
  numbers as a headline.
- **A screen reader cannot see visual issues.** The report says so, and says "not run" rather than
  "0 violations" when the axe layer is absent, because silence must not read as a pass.
- **Some criteria need a human.** That is a property of accessibility, not a gap in the tool, and the
  external literature agrees: automation "struggles with interpretive, context-driven aspects" of the
  screen-reader experience.
