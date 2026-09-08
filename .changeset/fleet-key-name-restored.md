---
"@a11ign/worker-fleet": patch
---

#515: `doctor`'s control-plane-isolation check reads the fleet SSH key back at the filename it had before
the rename (#66). That rename moved the string in the tree; it did not rename the file on anybody's
machine, so the check was looking for a path that does not exist and reporting the control plane
COMPLIANT with the key sitting there under its old name. `A11Y_SSH_KEY` still overrides and is
unaffected — set it if your key is named something else, which is what that variable has always been for.

The filenames are deliberately not written out here: `tracked-prose-leak-guard.test.ts` refuses a named
SSH key path in tracked prose, and a changeset is published prose.
