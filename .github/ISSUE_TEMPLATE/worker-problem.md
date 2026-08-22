---
name: A capture worker is broken
about: NVDA, the Windows worker, or the fleet is not behaving
title: ''
labels: worker
---

**Check the runbook first.** `docs/nvda-worker-runbook.md` has an error-string → real-cause table, and the
messages are genuinely misleading — `"NVDA not installed"` usually means a version mismatch, not a missing
install. `npm run doctor` names its own fix for most environment problems.

**Two states that look broken and are not:**

- **A stopped worker VM is the correct resting state.** A run starts what it needs and releases it.
- **Every capture returning 429** means the worker is *wedged*, not dead — a previous capture hung. It
  recovers itself on the hard timeout.

**What `npm run doctor` says:**

```
paste here
```

**What the worker says** — `curl -s http://<worker>:8765/health | jq .`:

```
paste here
```

**`/health.vitals.recoveries`**, specifically. A guest whose NVDA is degrading produces **zero failures**
while running at three times its neighbours' cost, and that counter is the only symptom.

**Host and worker:** OS and version of the machine running the CLI, and how the worker was built (UTM VM,
bare metal, `provision-nvda-worker.ps1`).
