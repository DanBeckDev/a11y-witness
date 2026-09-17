---
name: nvda-worker-vm-access
description: "How to reach the fleet and the Proxmox control plane: two credential domains (fleet SSH key; the lab's `a11y-pve` key), and that the lab now takes SSH DIRECTLY (the `pct exec` hop is retired)"
metadata:
  type: reference
---

**REDACTED for the repo copy.** The original of this file names the Proxmox host's address, the exact SSH
key filename, and the container topology behind it — material that materially aids reaching a live system,
which this project's own convention (`SECURITY.md`, and `docs/roles/README.md`'s "Credentials" section)
draws the line at: describe a credential and its domain, never print what would let a reader reach it. The
Mac holding the real file is the single point of failure this whole contingency plan is about; committing
its contents to git would defeat the point of writing this plan.

What is safe to keep, because it is a workflow fact rather than a reachability fact:

- **The Proxmox control plane is LIVE.** There are two credential domains, matching ADR 0012's split: an
  SSH key that reconfigures the bare-metal fleet, and a separate key (referred to only by the name
  `a11y-pve`, per that ADR) that reaches the lab's host. Exactly one machine holds both.
- **The lab takes SSH DIRECTLY — there is no `pct exec` hop.** An earlier version of this file said the
  opposite and instructed routing every command through a container-exec wrapper. That was true once and
  was corrected 2026-08-24 after using the direct route all day; CLAUDE.md records why it mattered — the
  extra hop was the whole source of a quoting bug that once sent four capture shards at a malformed URL for
  29 minutes.
- **The lab is small** (measured as a couple of vCPUs, a few GB) — a retrain runs on the order of 15-25
  minutes wall clock there. Long jobs are dispatched through `npm run lab:job -- -e job=<name>`
  (Ansible → a supervised systemd unit), never a bare ssh command — see ADR 0013. Direct SSH is for
  READING state; jobs go through the job runner.

For the actual host address, key filename and container layout: ask whoever holds today's credentials
(see `docs/roles/README.md`'s "Credentials" section) — this file deliberately does not say, and neither
should its successor.

See [[local-worker-vms-deprecated]].
