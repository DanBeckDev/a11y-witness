---
"a11ign": patch
---

The first command on the README now works. It was `npx a11ign …`, which returns `E404` — nothing is
published yet — so the first executable thing a reader met taught them only that the tool is broken. The
page now leads with the two routes that work today: the GitHub Action, and a clone. The `npx` form is kept,
below, labelled as what it will be rather than what it is.

---

**Why this is a `patch` and not the `--empty` nearly every other changeset here is.** Of the 13 entries
already in `.changeset/`, **12 are empty and the one that is not was written by a machine** —
`promote-candidate-0d498ef6.md`, a `major` on `@a11ign/scorer` that `promote:model` wrote itself. So
this is the first hand-written entry in the repo to declare a bump, which is worth stating rather than
slipping in. The closest precedent — `capture-probes.mjs`, a packed source file — reasoned that a consumer
received different bytes but not different behaviour, so `--empty` was honest. That entry's own table names
three categories; this is a fourth:

| | |
|---|---|
| a packed file whose behaviour changed | a real changeset |
| a file npm never packs | the gate should not fire (#132) |
| a packed file, comments only | `--empty` is honest |
| **a packed file that IS the consumer-facing prose** | a real changeset — this one |

`npm pack --dry-run --json` puts `README.md` among the 55 files in `a11ign`'s tarball, so it ships;
and unlike a comment, a README is not inert to the reader — it *is* what the consumer reads first. A change
that takes its opening command from broken to working is a change to what they receive, even though no code
path moved.

Recorded rather than left to silence, per `.changeset/README.md`: `changeset status` cannot tell "nobody
wrote one" from "somebody decided", and only one of those is a decision.
