# Reliability plan

**This is the ORDERED PLAN for what is still open.** Its sibling
[`not-working.md`](./not-working.md) is the RECORD — what the tool gets wrong, measured, with what it was
measured on. A defect belongs there the moment it is found; it belongs here only if there is work to do
and a condition that says when the work is done.

The distinction is not bookkeeping. The previous plan was deleted when all twelve of its items reached
their done-conditions, and everything that survived it was a defect rather than a task. What follows is
the residue of that plus what closing it surfaced.

**Every item carries a DONE CONDITION that is a command and an expected output.** An item with a
done-condition of "it looks right" is not on this list.

---

## A1 — CLOSED. The weights-side audit now says which vetoes nobody can close

Measured on the lab, `job=shortcuts -e out=scratch`:

```
41 CLOSABLE veto pairs across 18 heads (57 in total).
16 further veto pair(s) are UNCLOSABLE and excluded from the counts above:
  by-definition — the subtype IS the absence of that announcement, so no page can carry both
  perturbs-measurement — capturing it would destroy the channel the subtype is measured on
```

**The number people steer by went from 57 to 41**, and every excluded pair is named with its reason. The
two kinds stay separate because a reader acts on them differently: `by-definition` is permanent,
`perturbs-measurement` is a statement about this probe and would change if the probe did.

The bar for a `perturbs-measurement` entry is naming the call site whose ORDER makes it unreachable —
`capture-core.mjs:1834` activating controls before `probeFocusOrder` at 1840, on a path whose comment
says "ORDER IS LOAD-BEARING". "We could not think how" is not a reason; it is the state every entry
started in.

Emitted rather than duplicated (`corpus:grants-map`'s route) and pinned by
`test_unclosable_map_is_current.py`, which caught a real stale entry on its first run:
`2.4.1:skip-link-inert: ["skip_link_moves_focus"]` named a feature the pipeline has never computed. It
forgave nothing — and made that subtype look handled, which is a plausible reason nobody noticed its
actual worst veto.

## A2 — `2.4.1` and `2.4.2` have 7 positives each, against a recall cliff near 140

**Status: open. Blocked on a bundled corpus change, deliberately.**

`2.4.1:skip-link-inert` carries `vague_link_without_context (-4.51)` as its worst veto, because its three
multi-defect cases drew rotations containing no `vague-link` and the `vague-link-inert` substitution
therefore never fires. Chance, not design.

Reaching it means enlarging `ROTATIONS`, and that table prices itself:

> going from 5 entries to 11 changes which pairing every existing host gets. Measured when this was
> extended: all 237 multi-defect cases changed, invalidating 474 captures. … the only honest response is
> to treat it like a CAPTURE_PROTOCOL_VERSION bump: do it deliberately, bundled, and pay the recapture
> once.

**Done when** a bundled corpus change lands that (a) enlarges `ROTATIONS` so every focus criterion can
draw `vague-link`, (b) adds depth to the subtypes under 20 positives, and (c) pays one recapture for all
of it. Not before — forcing it now buys one veto for 474 captures.

---

## A3 — the residual modal-trap gap needs Escape, and Escape is ambiguous

**Status: open. Named, costed, not started.**

A cycling modal trap is detected now, by the cycle covering a strict subset of the page's controls. A
dialog holding MOST of a page's controls shrinks that subset toward nothing, so the detection degrades
exactly where the dialog is largest.

Closing it needs the probe to press Escape and see whether focus leaves. Escape is *also* NVDA's own route
out of focus mode (`script_disablePassThrough`, which `anchorToTop` relies on), so a probe pressing it
changes two things at once and the evidence cannot say which moved.

**Done when** `docs/screenreader-coverage.md` records a probe that presses Escape and can attribute the
result, and a corpus case whose dialog holds most of the page's controls discriminates.

---

## Not on this list, and why

- **Promoting the scorer** and **publishing** are decisions, not tasks. `not-working.md` §1 and §8 carry
  the state and what each would take.
- **Consumer telemetry** is decided against, in `SECURITY.md`.
