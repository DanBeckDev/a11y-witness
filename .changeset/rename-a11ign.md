---
"a11ign": major
"@a11ign/evidence": major
"@a11ign/judge": major
"@a11ign/nvda-worker": major
"@a11ign/scorer": major
"@a11ign/worker-fleet": major
---

The product is renamed: formerly a11y-witness, now a11ign. The npm scope, the unscoped CLI package, the
binary names and every cross-package import specifier change with it (issue #66). Nothing had been
published under the old name, so this is a rename landing in the tree before the transfer to the
`a11ign` GitHub organisation, not a migration for existing consumers.
