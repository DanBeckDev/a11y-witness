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

## A2 — depth. `2.4.1` done; `2.4.2` next

**The cost in this item was wrong, and correcting it is the point.** It said the only route to the
`2.4.1` veto was enlarging `ROTATIONS` — 237 cases, 474 captures, protocol-bump territory. That prices a
different approach. The subtype had **one failure mechanism** across all 7 positives, and adding a second
draws new rotations, which reaches the veto for the cost of one subtype.

Measured: appending two hosts to `2.4.1:skip-link-inert` added 14 cases and moved **6 existing pages, all
inside the subtype** — 12 captures. `bucketFor`'s docstring said "inserting a case re-buckets only that
subtype's later cases", which is true and reads as "appending is free"; it is not, because a subtype
orders base cases first and every generated variant is later. Now written down with the measurement.

### `2.4.1:skip-link-inert` — done. 7 positives to 14, one mechanism to two

And the capture refuted one of the two proposed mechanisms, which was worth more than the case:

- **`skip-link-target-not-focusable` is NOT a defect.** Target exists, no `tabindex`, on the belief the
  browser scrolls without moving focus. `nextFocusAfter` came back byte-identical to the conformant
  variant — Chromium moves the sequential-focus starting point anyway, so the block IS bypassed. Deleted,
  with the refutation recorded on the surviving sibling so nobody re-derives it.
- **`skip-link-target-hidden` found a real blind spot.** Its target keeps `tabindex="-1"` and is `hidden`,
  so focus resets to the top and the next Tab lands on the SKIP LINK ITSELF. Both layers tested only
  "landed where Tab would have gone anyway" (index 1) and neither could see "landed before you started"
  (index 0), which is strictly worse.

0 fires on a conformant page across 2,140 captures; the lab reports `1454 discriminating, 0 blind,
0 contaminated`. `skip-link.corpus.test.ts` pins the corpus predicate and the shipped rule equal.

**Done when** (`2.4.2` half): `2.4.2:route-title-stale` has more than one mechanism, its signals still
discriminate on the lab, and the added pairings are measured rather than assumed.

**Still deliberately not done:** enlarging `ROTATIONS`. That remains a bundled change at 237 cases and
474 captures, and nothing here needs it.

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
