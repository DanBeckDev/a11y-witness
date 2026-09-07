---
"a11y-witness": patch
---

`packages/cli/README.md` gains a one-line pointer to the top-level README's routing decision ("which of
the GitHub Action or the local path is yours"), replacing a paragraph that repeated the decision instead
of deferring to it.

---

**Why this is a `patch` and not `--empty`.** `npm pack --dry-run --json` puts `README.md` among the files
`a11y-witness` ships, so it is consumer-facing prose, not an internal doc — the same category #229's
changeset named: *"a packed file that IS the consumer-facing prose"* is a real changeset, unlike a
packed-file change that is comments-only or a file npm never packs at all. The root `README.md` and
`docs/getting-started.md` this same PR also touches are NOT packed by any published package (`npm pack
--dry-run --json` from the repo root packs nothing outside `packages/*`), so only this one file's change
needs an entry.
