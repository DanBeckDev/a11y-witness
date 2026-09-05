# Documentation

Start with the [README](../README.md) for what the tool is and what it produces. This directory is the
detail behind it. `CLAUDE.md` at the repo root is a separate thing — operational instructions for anyone,
human or agent, *working on* the repo rather than using it.

## Getting it running

| doc | read it when |
|---|---|
| [getting-started.md](./getting-started.md) | you have no capture worker and need one (~1.5–2 h, mostly downloading Windows) |
| [local-worker-vm.md](./local-worker-vm.md) | you are on a Mac and want the scripted UTM worker |
| [control-plane-proxmox.md](./control-plane-proxmox.md) | you are running the bare-metal fleet rather than local VMs |
| [github-action.md](./github-action.md) | you want it in CI against your own app |

## What is not done yet

| | when you want it |
|---|---|
| [**not-working.md**](./not-working.md) | **what the tool does wrong, cannot do, or cannot show.** Not a backlog — everything here is a live defect or a measured limitation, each with what was measured and on what. Read it before quoting any number about this project |
| [known-gaps.md](./known-gaps.md) | **the RECORD of what was closed on 2026-08-27**, kept for what each defect cost. Originally the honest list, in the order to do it — what this project does not do or does not yet know, phased by what CONSUMES what: tooling, then the capture path, then the corpus, then the model. Training is LAST because it consumes everything above it |
| [**capture-integrity-plan.md**](./capture-integrity-plan.md) | **the OPEN plan, and the root under all the others: the sweep is treated as a CENSUS when it is a SAMPLE.** Measured across 106 real captures — 97% disagree with the accessibility tree, in BOTH directions (phantom and truncated), 55% open behind a consent banner, 40% carry truncated announcements. The capture already computes the disagreement and nothing reads it |
| [control-plane-plan.md](./control-plane-plan.md) | **the OPEN plan: take the laptop out of the path.** Three wrong diagnoses of a transport fault ended at `pmset` — the gates were driven from a laptop on Wi-Fi whose battery ran 18% to 1% while it lost 9 responses in 40. Measured: the LAB already reaches every worker on `:8765`, so the credential split that appears to pin the laptop in place is about SSH, and gates do not need it |
| [capture-protocol-plan.md](./capture-protocol-plan.md) | **A–C, E MET; D's diagnosis REFUTED and the cause found in the plan above.** The root it did fix: a capture is modelled as a synchronous request and is a 12–520 s asynchronous job, so the connection sits silent for minutes and the answer exists in one socket. Four defects on no list fell out of that. Also settles, with the reasoning, why NOT WebSockets and why NOT a message bus |
| [determinism-plan.md](./determinism-plan.md) | **CLOSED, D1–D7 met.** The one property behind it: same page in, same evidence out, whatever order the probes ran. Written after four rules for one criterion were withdrawn in a day, all of them comparing two measurements taken in different states of the page. `reliability-plan.md` preceded it. What it could NOT anticipate is recorded at the end, and became the capture-protocol plan above |
| [reliability-plan.md](./reliability-plan.md) | the CLOSED plan (A1–A3), kept for the three refutations inside A3 — a rule that is exact on the corpus and wrong on the web, four times over |
| [**proving-a-gate.md**](./proving-a-gate.md) | **how to take a check from BELIEVED to WATCHED FAILING** — the recipe, and the measurements behind it. Nine defects in one session were all checks that could not report themselves, and none had ever been observed to fire. `gates-are-proven.test.ts` holds the count: 5 of 16 |

## Running the long jobs

| | when you want it |
|---|---|
| [**lab-cli.md**](./lab-cli.md) | **the complete lab and fleet command line** — every job, every parameter, every refusal and what it means. Capture, export, training, calibration and the gates all run on machines that are not yours, and there is deliberately no shell: a job is a name from a fixed catalogue |

## When something is broken

| doc | read it when |
|---|---|
| [nvda-worker-runbook.md](./nvda-worker-runbook.md) | a worker misbehaves — has the error-string → real-cause table, because **the messages are misleading**: `"NVDA not installed"` usually means a version mismatch |
| [ufffc-investigation.md](./ufffc-investigation.md) | before re-investigating a stray character in announcements — includes the seven theories that were wrong |
| [nvda-correctness-audit.md](./nvda-correctness-audit.md) | you need to know whether what we capture is what NVDA actually says |

## What the tool can and cannot claim

| doc | what it settles |
|---|---|
| [**coverage.md**](./coverage.md) | **all 55 WCAG 2.2 A/AA criteria and which of four states each is in** — assessed, partial, reachable, or out of scope. Generated from the code and pinned against it, so it cannot drift |
| [screenreader-coverage.md](./screenreader-coverage.md) | every user behaviour we drive, the field it lands in, and — the part that matters — **what we do not drive yet**. A behaviour missing from that table is a claim this project cannot make |
| [METHODOLOGY.md](./METHODOLOGY.md) | how the numbers were produced, and why the eval figures must not be quoted as a headline |
| [glossary.md](./glossary.md) | the vocabulary — capture, probe, sweep, signal, criterion, subtype |
| [local-model.md](./local-model.md) | the trained scorer: what it is, what it abstains on, and why |

## Decisions and history

| doc | what it is |
|---|---|
| [screenreader-settings-audit.md](./screenreader-settings-audit.md) | **which NVDA settings could buy us evidence** — framed demand-side from the seven gaps, with every row marked verified or hypothesis |
| [backlog.md](./backlog.md) | **what is open, right now** — the single tracker. Open work lives here; `known-gaps.md` and `not-working.md` hold the closed items and their lessons |
| [architecture-audit.md](./architecture-audit.md) | **an outside-in structural audit at `dba4278`, revalidated at `55cb006` (2026-09-05)** — package and wire boundaries, consumer-edge verification, and documentation architecture. The dated follow-up adds model-authority and capture-lifecycle findings, reproduces judge composition, and corrects the private-pin release prediction; original measurements remain snapshot-labelled |
| [adr/](./adr/README.md) | 24 architecture decision records, indexed — the *why*, including the alternatives that were rejected and what would falsify each |
| [isolation-spike.md](./isolation-spike.md) | the experiment that shaped the package split, run before anything was moved |
| [history-2026-08.md](./history-2026-08.md) | what happened, month by month, for context a diff cannot give |

## A note on how these are written

Most tables here are **measured**, and the ones that are not say so. Where a document records a mistake, it
records the wrong theories too, so nobody pays to rediscover them. If you find a claim without a
measurement behind it, that is a bug — please report it.
