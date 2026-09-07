---
---

Documentation only — six closed capture-probe diagnoses moved out of `capture-probes.mjs` into
`docs/capture-probe-incidents.md`. No consumer-visible change.

**Empty deliberately, and the reason is NOT the one that applies to a test file.** `@a11ign/nvda-worker`
ships its sources (`files` is `["src", "!src/**/*.test.ts", ...]`), so `src/capture-probes.mjs` **is** in the
tarball — measured, 36 files packed and that one among them. A consumer therefore receives different bytes.
What they do not receive is different behaviour: the diff is **15 insertions and 32 deletions, and zero of
them are non-comment lines** in either direction.

So this is a third category, distinct from the two the gate already reasons about, and worth naming because
#132 will change the gate for one of them and must not change it for this one:

| | |
|---|---|
| a packed file whose behaviour changed | needs a real changeset |
| a file npm never packs (a `.test.ts`) | the gate should not have fired at all — that is #132 |
| **a packed file, comments only** | the gate is RIGHT to fire, and `--empty` is the honest answer |

Recorded rather than left to silence, per `.changeset/README.md`: `changeset status` cannot tell "nobody
wrote one" from "somebody decided none was needed", and only one of those is a decision.
