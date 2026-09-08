---
"@a11ign/worker-fleet": patch
---

#515: `doctor`'s control-plane-isolation check reads the fleet SSH key at
`~/.ssh/a11y-witness_ed25519` again, not `~/.ssh/a11ign_ed25519`. The rename (#66) moved the string in
the tree; it did not rename the file on anybody's machine, so the check was looking for a path that does
not exist and reporting the control plane COMPLIANT with the key sitting there under its old name.
`A11Y_SSH_KEY` still overrides and is unaffected — set it if your key is named something else, which is
what that variable has always been for.
