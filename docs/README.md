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
| [adr/](./adr/README.md) | 19 architecture decision records, indexed — the *why*, including the alternatives that were rejected and what would falsify each |
| [isolation-spike.md](./isolation-spike.md) | the experiment that shaped the package split, run before anything was moved |
| [history-2026-08.md](./history-2026-08.md) | what happened, month by month, for context a diff cannot give |

## A note on how these are written

Most tables here are **measured**, and the ones that are not say so. Where a document records a mistake, it
records the wrong theories too, so nobody pays to rediscover them. If you find a claim without a
measurement behind it, that is a bug — please report it.
