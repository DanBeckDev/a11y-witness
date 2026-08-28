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

## A3 — OPEN, and WIDER than it was. Two rules withdrawn; 2.1.2 now detects only a stall

**Status: open. Attempted 2026-08-28, measured, withdrawn. Far better specified than it was.**

I marked this closed earlier the same day, on corpus evidence. `rules-real-pages` then scored the change on
86 conformant real pages and it produced **9 new 2.1.2 findings**. The closure was wrong and this section
is the correction.

### What was tried, and why it looked right

The item said the gap needs an Escape probe and that Escape is ambiguous (it is also NVDA's route out of
focus mode). I argued the premise was wrong: on a conformant page with no dialog, Escape reveals no control
the walk had not already reached, so it cannot discriminate.

**That is true and it answers the wrong question.** The comparison that matters is not conformant-page
versus trapped-page in the corpus — it is **a dialog that RELEASES focus against one that does not**. Escape
is precisely that test. The original item was right and I dismissed it for a reason that does not apply.

The replacement was a better denominator: measure the ring against `domCensus.tabbable` — the page's
rendered tab stops — instead of the swept FORM FIELDS, which go silent when a dialog holds them all. On the
corpus it was exact:

| case | variant | distinct stops | swept fields | tab stops | verdict |
|---|---|---|---|---|---|
| `keyboard-trap-modal-cycle` | good | 14 | 5 | 14 | silent (1.00) |
| `keyboard-trap-modal-cycle` | bad | 3 | 5 | 14 | reported |
| `keyboard-trap-modal-total` | good | 16 | 1 | 16 | silent (1.00) |
| `keyboard-trap-modal-total` | bad | 3 | 3 | 16 | silent before, reported now |

### What the real pages said

    9 NEW 2.1.2 findings on 86 conformant real pages (~10%)

Measured on three, with the probe's own marks beside the rule's:

| page | distinct | tabbable | ratio | probe |
|---|---|---|---|---|
| tfl.gov.uk/modes/tube/ | 5 | 67 | 0.075 | `cycled=true truncated=false` |
| gov.scot/publications/ | 7 | 116 | 0.060 | `cycled=true truncated=false` |
| nls.uk/join/ | 7 | 7 | **1.00** | `cycled=true truncated=false` |

Two hypotheses going in — truncation misread as a wrap, or a weak `cycleClosed` test — and **both are
refuted**: the probe and the rule agree on every page, so the walks genuinely closed. The rings are real.
tfl's first stop is inside the cookie banner; gov.scot's is a date-picker overlay. Six of the nine open with
a consent banner, and a systematic pattern across independent publishers is the signature of a TOOL problem,
not nine site bugs.

nls.uk is worth its own line: it read **7 of 7** in my capture and was accused in the lab's. Same page, same
code, different state — "a capture is not an instant", which this repo already records for the sportengland
search panel.

### Why no floor fixes it

The difference between a conformant modal and a trap is not how much of the page the ring covers. It is
whether focus can **leave**. Nothing in the capture presses Escape, so nothing can ask, and tuning the floor
until real pages went quiet would fit a threshold to a symptom — the way a rule comes to be clean by going
deaf.

### And then the SAME measurement condemned the rule underneath it

Withdrawing the tab-stop denominator took the real-page count from 9 to **7**, not to 0. The remaining
seven were not from it — they came from the CYCLING branch added earlier the same day (`127fb24`), which
the baseline predates.

Measured on two of them, with the swept form fields printed:

    tfl.gov.uk/modes/tube/        ring 5   swept 28   ->  5 < 28 fires
      swept includes: "Manage cookies, button", "Accept only essential cookies, button",
                      "Accept all cookies, button"
    networkrail.co.uk/careers/    ring 4   swept  7   ->  4 <  7 fires
      swept includes: "This website uses cookies, region, Allow all cookies, button"

The ring is the CONSENT BANNER. The sweep sees more because quick-nav walks the whole document, banner and
page alike. Now compare the corpus case the branch was built for: **ring 3, swept 5**. They are the same
evidence, and no threshold separates them — the only candidate features are the banner's own words, which
is the wordlist shortcut this repo already removed from 2.4.4.

So the cycling branch went too, and `keyboard-trap-modal-cycle` with it: without a branch that can fire,
`check-signals` correctly reports the case BLIND. **2.1.2 now detects only the STALLED case** — Tab pressed
and the same control announced each time — which is unambiguous, and is what the single real-page 2.1.2 in
the baseline (scotcourts) has always been.

That was the harder call of the two. The denominator was one day old; this branch had a case, a gate entry
and a green `rules:gate`. All of that was real and none of it was evidence about the web.

### What is left in the tree

- `domCensus.tabbable` **stays**. It was never the wrong measurement, only an insufficient one, and it is
  the denominator the Escape-based rule will need. Additive, so no protocol bump.
- The rule and the corpus signal keep only the STALLED test, pinned equal by
  `focus-trap-parity.corpus.test.ts`.
- `keyboard-trap-modal-total` and `keyboard-trap-modal-cycle` are both **removed**. With no branch that can
  fire on them, `check-signals` reported them BLIND — correctly, a case whose signal cannot fire is a
  training record with no discriminating evidence. Both page shapes are recorded in `case-matrix.mjs` where
  they stood, so they are re-creatable; what they lack is a conformant sibling whose dialog RELEASES focus.
- `criterion-coverage.ts` records 2.1.2 as `partial` with the measured boundary rather than an assumed one.

### Done when

- A probe presses Escape after a CLOSED, confined ring and records whether focus left, attributing the
  result — Escape is also NVDA's `script_disablePassThrough`, so the probe must distinguish "the page
  released focus" from "the screen reader changed mode". `press("Escape")` not
  `perform(exitFocusMode)`; that difference is already measured and documented in CLAUDE.md.
- It runs **only** on a detected confinement, so a conformant page with no dialog never pays for it and
  never produces the ambiguous evidence.
- `keyboard-trap-modal-total` is restored WITH a conformant sibling whose dialog releases on Escape — the
  control, without which the corpus cannot express the distinction the rule turns on.
- `rules-real-pages` shows **0 new findings** on the 86 conformant pages. That gate, not the corpus, is
  what settles this: the corpus has no modals-by-design and structurally cannot answer it.

### The lesson worth more than the branch

**The corpus said 4/4 exact and the real pages said 9 false positives, and the corpus could not have known.**
It contains no consent banner, no date picker, no modal that confines focus legitimately — so the feature
that separated it perfectly was measuring "is there a dialog", not "is there a trap". That is ADR 0019's
thesis arriving again, and the specific reason `rules-real-pages` exists.

Second: **I recorded this as closed before the check that could refute it had run.** The corpus evidence was
real and the conclusion did not follow from it. A done-condition naming the gate that can see the failure —
which this item now has — is what stops that.

---

## Not on this list, and why

- **Promoting the scorer** and **publishing** are decisions, not tasks. `not-working.md` §1 and §8 carry
  the state and what each would take.
- **Consumer telemetry** is decided against, in `SECURITY.md`.
