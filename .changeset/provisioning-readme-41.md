---
"@a11ign/worker-fleet": patch
---

Documentation-only: `src/provisioning/README.md` now names which of the four provisioning paths
(PXE bare-metal, the `scp`+`ssh` script, the self-contained Windows bootstrap script, and the GitHub
Action) an outside contributor without this project's own infrastructure can actually follow, and
`src/provisioning/bare-metal/README.md` states plainly that the bare-metal path assumes infrastructure
(a Proxmox PXE server, the fleet-control container) a stranger does not have (#41).

No code, wire protocol, or capture behaviour changed.
