---
name: local-worker-vms-deprecated
description: "The local UTM worker VMs are deprecated; capture runs on the bare-metal fleet, and the repo docs still say otherwise."
metadata:
  type: project
---

The local UTM worker VMs on the Mac are **deprecated** (stated by the user 2026-08-28). Capture runs on
the bare-metal fleet: five boxes `a11y-worker-2` … `-6` in `packages/worker-fleet/ansible/inventory.yml`,
deployed with `npm run fleet:deploy --ref=<branch>` (git pull on each box), never `npm run worker:deploy`
(which is `utmctl file push` to a VM UUID and cannot reach a physical box).

**Why this needs recording:** the repo contradicted it. `CLAUDE.md`'s "Working on a Mac (the usual case)"
opened with `npm run worker:ctl -- up`, so a capture-path change was taken to a laptop VM while five
bare-metal workers were `ready` and CONSISTENT. A deprecation notice was added there on 2026-08-28, but
`docs/getting-started.md` and `docs/local-worker-vm.md` still document the VM path as primary.

**How to apply:** for anything needing a real capture — `capture:check`, `evidence:check`,
`identity:rate`, a corpus run — use `npm run fleet:status` to pick a ready box and pass
`--worker=http://<ip>:8765`. Do not start a UTM VM. This is the same standing constraint as the user's
"it shouldn't rely on this laptop", "CLI/API-only operations", and "we said we weren't gonna access them
over SSH". See [[nvda-worker-vm-access]].
