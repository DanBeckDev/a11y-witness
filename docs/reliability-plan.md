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

## A3 — CLOSED. The gap did not need Escape; it needed a denominator

**Status: closed 2026-08-28.**

The item as written said the probe must press Escape and watch whether focus leaves, and that Escape is
ambiguous because it is *also* NVDA's route out of focus mode. **The premise was wrong before the
ambiguity mattered.** On a conformant page with no dialog, Escape reveals no control the walk had not
already reached — so the evidence is identical on both variants of the pair. Neither does Shift+Tab. A
signal that cannot differ between good and bad is not weak; it is not a signal. The three-whys question
that broke it open was "what would the conformant capture look like?", not "how do we disambiguate
Escape?".

The real defect was the DENOMINATOR. `addKeyboardTrap` compared the tab ring against the swept FORM
FIELDS — "did focus reach every field" — where 2.1.2 asks "did focus reach the page". While some fields
sit outside the dialog the two agree; when the dialog holds them all, `reached >= onPage` and the rule
returns silently. **It was blindest where the trap is most total**, which is an inverted rule rather than
a conservative one.

`domCensus.tabbable` counts the page's RENDERED tab stops (`checkVisibility()`, and `inert` separately —
an inert subtree renders and takes no focus, which is the modal pattern exactly). Measured on captures
taken for this item:

| case | variant | distinct stops | swept fields | tab stops | verdict |
|---|---|---|---|---|---|
| `keyboard-trap-modal-cycle` | good | 14 | 5 | 14 | silent (1.00) |
| `keyboard-trap-modal-cycle` | bad | 3 | 5 | 14 | reported either way |
| `keyboard-trap-modal-total` | good | 16 | 1 | 16 | silent (1.00) |
| `keyboard-trap-modal-total` | bad | 3 | **3** | **16** | **silent before, reported now** |

The conformant variants matching the tab-stop count EXACTLY is what makes it a denominator rather than
one more estimate.

**Done when — met:**

- `docs/screenreader-coverage.md` records the closure and why the Escape route was refused. ✅
- A corpus case whose dialog holds *every* form field discriminates: `keyboard-trap-modal-total`,
  `check-signals` **226 discriminating, 0 blind, 0 contaminated**. ✅
- Proved with the CONTROL, not a green result: the same capture with the census withheld — which is every
  capture taken before today — yields 0 findings, and with it, 1. ✅

**What it cost that the item did not predict:** the decision is stated twice (`focusIsTrappedIn` in the
plain-node corpus generator, `tabRingCoverage` in the TypeScript rules) and drifted within the hour —
`check-signals` said BLIND while the rule fired on the same capture. `focus-trap-parity.corpus.test.ts`
pins them over every capture on disk AND pins the floor by exported value, because mutation-checking
showed the verdict comparison alone could not see a floor moved 0.5 → 0.95 on a thin local corpus.

---

## Not on this list, and why

- **Promoting the scorer** and **publishing** are decisions, not tasks. `not-working.md` §1 and §8 carry
  the state and what each would take.
- **Consumer telemetry** is decided against, in `SECURITY.md`.
