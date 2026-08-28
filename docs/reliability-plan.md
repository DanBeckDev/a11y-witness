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

## A1 — the weights-side audit reports vetoes nobody can close, and cannot say so

**Status: doing.**

`audit-corpus-starvation.mjs` carries `IMPOSSIBLE_BY_DEFINITION` and its comment states the cost:

> Not a shortcut when the subtype is DEFINED by not hearing it. Reporting those put items on a work list
> that nobody can complete, and inflated the two features at the top of the ranking.

`audit-scorer-shortcuts.py` has no such concept — grep it for `impossible` and there is nothing. So
`scorer:shortcuts` reports **57 veto pairs across 18 heads** with no way to distinguish a veto that is
worth corpus work from one that is structurally unclosable. That is a lesson learned at one layer and not
carried to the next, which CLAUDE.md already names as its own recurring shape.

Measured 2026-08-28, the case that makes it concrete: `state_unchanged` is now the worst veto on all three
focus heads. It is 0 on every focus positive because a focus case activates no control — and it cannot be
made 1 without turning `probeForms` on, which runs at `capture-core.mjs:1834`, **before**
`probeFocusOrder` at 1840, on a path whose own comment says "ORDER IS LOAD-BEARING". Activating a control
changes the page before focus is walked, which corrupts the very channel those subtypes are measured on.

So it is unreachable *without perturbing the channel under test* — a category the corpus-side table does
not have either, and a real one.

**Done when:**

```bash
npm run lab:job -- -e job=shortcuts -e out=scratch
# the report separates closable vetoes from unclosable ones, names the reason for each unclosable
# one, and the headline count is of the CLOSABLE ones
```

and the two tables cannot drift: the JS side emits them, Python reads them, a test pins them equal —
the same shape `corpus:grants-map` → `audit_grants.py` → `test_grants_map_is_current.py` already has.

---

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
