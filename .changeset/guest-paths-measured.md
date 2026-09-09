---
"@a11ign/nvda-worker": patch
"@a11ign/worker-fleet": patch
---

The Windows worker's checkout, its shared `ProgramData` directory and Edge's capture profile are named
again as they are on the machines. The rename (#66) moved the strings in the tree; it did not move the
directories on the guests, so the worker's profile resolution and every provisioning script pointed at
paths that do not exist — and a successful deploy would have created a fresh, unwarmed browser profile
beside the real one. `A11Y_REPO_PATH`, `A11Y_EDGE_PROFILE` and `A11Y_BROWSER_PROFILE` still override and
are unaffected.
