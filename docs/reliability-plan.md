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

## A2 — CLOSED. Both thin subtypes doubled, and the cost in this item was wrong

**The correction is the point.** This said the only route to `2.4.1`'s veto was enlarging `ROTATIONS` —
237 cases, 474 captures, protocol-bump territory. That prices a different approach. Each subtype had
**one failure mechanism** across all 7 positives, and adding a second draws new rotations for the cost of
one subtype.

| | positives | mechanisms | pages moved |
|---|---|---|---|
| `2.4.1:skip-link-inert` | 7 → 14 | 1 → 2 | 6, all inside the subtype |
| `2.4.2:route-title-stale` | 7 → 14 | 1 → 2 | 6, all inside the subtype |

Lab: `1461 discriminating, 0 blind, 0 contaminated`, `grants-audit` PASS, pipeline PASSED.

Three things it turned up that were worth more than the depth:

- **A proposed mechanism was REFUTED by capturing it.** `skip-link-target-not-focusable` — target exists,
  no `tabindex` — returned `nextFocusAfter` byte-identical to the conformant variant, because Chromium
  moves the sequential-focus starting point anyway. Deleted, with the refutation recorded where somebody
  proposing it again will read it.
- **A real blind spot in both layers.** `skip-link-target-hidden` lands focus on the SKIP LINK ITSELF;
  the rule and the signal both tested only "landed where Tab would have gone anyway", never "landed
  before you started", which is strictly worse.
- **`bucketFor`'s docstring was true and misleading.** "Inserting a case re-buckets only that subtype's
  later cases" reads as "appending is free". It is not: a subtype orders base cases first, so every
  generated variant is later than every base case. Measured and written down.

**Still deliberately not done:** enlarging `ROTATIONS`. It remains a bundled change at 237 cases and 474
captures, and nothing here needed it.

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
