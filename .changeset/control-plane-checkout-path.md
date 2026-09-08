---
"@a11ign/worker-fleet": patch
---

#526: the control plane's checkout directory is named correctly again in the bootstrap systemd unit and
in `control-plane-isolation`'s reported inventory. The rename (#66) moved the string in the tree; it did
not move the directory on the machine, so the unit's `ExecStart` pointed at a path that does not exist
and the isolation report named one nobody could act on.
