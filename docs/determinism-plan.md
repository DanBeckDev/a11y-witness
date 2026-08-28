# The determinism plan

**Thesis: a capture is a sequence of probes over a page that the probes themselves mutate, and every rule
reads the result as if it were one snapshot of one state. That is the defect behind four withdrawn rules in
a single day, and it is the reason fixing one rule keeps breaking another.**

This plan is not "make the tool better". It is one property, stated so it can be falsified:

> **Given the same page, the tool produces the same evidence — and the order the probes run in does not
> change it.**

Everything below exists to make that true and to keep it true.

---

## Why this plan exists

2026-08-28. Four attempts at one criterion (2.1.2's cycling trap), all withdrawn the same day:

| attempt | refuted by |
|---|---|
| ring vs swept form fields | 7 false positives on 86 conformant real pages |
| ring vs rendered tab stops | 9 false positives on the same pages |
| press Escape and re-walk | `anchorToTop` already presses Escape; the probe could not observe a release |
| ring vs actionable roles | **passed** — but only after `rules:gate` caught it failing 2.1.1 |

Every one of them compared two measurements taken in **different states of the page**:

| failure | state A | state B |
|---|---|---|
| 2.1.2 ×3 | the sweep walked the page BEHIND a consent banner | Tab was held INSIDE it |
| 2.1.1 | swept 4 fields behind a dialog | 4 tab stops inside it — **disjoint sets, matching counts** |
| Escape probe | `anchorToTop` pressed Escape and closed the dialog | ...then measured the ring that no longer existed |
| `nls.uk/join/` | one run: 7 distinct of 7 tabbable, silent | another run, same commit: **accused** |

That last row is the whole plan in one line. **Same page, same code, two answers.** It was written off at the
time as "a capture is not an instant" — this repo's own phrase, treated as a fact of life. It is not a fact
of life. It is the tool being non-deterministic, and it is ours, not the web's.

### And our own source already says so

`packages/nvda-worker/src/capture-core.mjs`:

```
// ORDER IS LOAD-BEARING from here down. `probeFocusOrder` re-anchors and leaves the cursor in focus mode,
// and the Elements List opens a modal dialog leaving the caret somewhere arbitrary — so everything
// position-dependent has already run, and these two cannot swap.
```

*Continuous Delivery*, "State in Acceptance Tests":

> A key aspect of testing is to **establish a known-good starting point**… The ideal test should be
> **atomic**. Having atomic tests means that **the order in which they execute does not matter, eliminating
> a major cause of hard-to-track bugs**.

We wrote down the exact condition the literature calls a major cause of hard-to-track bugs, and preserved it
as a constraint instead of removing it as a defect.

### Why fixing one thing breaks another

*Fundamentals of Software Architecture*:

> We call an architecture "brittle" when a single implementation change can cause unexpected rippling side
> effects that break many other (ostensibly unrelated) things… **the broader the scope, the looser the
> coupling should be**.

Several rules hand-roll the same broad-scope comparison — a count from quick-nav against a count from Tab —
with no explicit contract between them. Measured this session: a guard added to 2.1.1 **subsumed the rule it
was guarding** (it asserted 2.1.1's own premise), and a denominator changed for 2.1.2 moved a rule nobody was
editing. That is textbook brittleness, and D4 is the remedy.

### Why we circle instead of converging

*Specification by Example* records a team with our exact problem — slow test data caused timeouts, so they
fixed the database, which revealed tests starting before data was ready, so they added readiness messages,
which revealed cookie expiry, so they introduced business time:

> Find the most annoying thing and fix it, then something else will pop up… Eventually, if you keep doing
> this, you will create a stable system that will be really useful.

So the iteration is right. But every round of theirs **eliminated a source of entropy**. Every round of ours
**added a guard around one**: a floor, then a wider denominator, then a probe, then a role test — four
rounds routing around a state problem none of them addressed.

**That is the difference this plan is trying to make.**

---

## D1 — A page that can express the fault

**Status: open. Cheapest item here, and every other item is unfalsifiable without it.**

The corpus is hermetic and single-state. Measured: exactly **one** page carries `role="dialog"` (added
2026-08-28), and **zero** conformant pages carry a consent overlay. `gate:stability` — the determinism gate —
watches five canaries (`form-unlabelled/good`, `form-error-silent/bad`, `table-unassociated-headers/bad`,
`disclosure-state-silent/good`, and one more): all corpus pages, all single-state, all localhost, none with
an overlay.

So the gate that exists to prove the tool is deterministic **cannot observe the non-determinism that has cost
four withdrawals**. That violates this repo's own rule, learned three times in one day: *a canary that cannot
express the fault is worthless.*

Add conformant corpus pages carrying an overlay that confines focus — a consent banner is the honest shape,
since six of the nine real-page false positives were one. The page must be CONFORMANT: the overlay is
dismissible, so nothing about it is a WCAG failure, and any finding on it is the tool's error.

**Done when:**

- At least two conformant corpus pages carry a focus-confining overlay, one of them dismissible only by a
  button in the ring.
- `npm run training:check-signals` reports them discriminating, 0 blind, 0 contaminated.
- Reproduce the fault before trusting the page: with the 2026-08-28 tab-stop rule temporarily restored, the
  new page must be ACCUSED. A page that does not fire the withdrawn rule cannot police its successor.

---

## D2 — The probe-order invariance gate

**Status: open. This is the item that makes "immutable tool" falsifiable, and it must FAIL when written.**

The property: **capture the same page twice with the probes in different orders, and the evidence must be
identical.** Nothing today asserts this. `capture-core.mjs` declares the opposite in a comment.

This is the gate `gate:stability` should have been. That one repeats the same page in the same order and so
can only catch timing flakiness; it cannot catch a probe changing the page for the next probe, which is the
failure that actually bites.

**Do not fix anything before this fails.** CLAUDE.md's own order — *"write the check that would detect the
problem, run it to confirm the problem is what you think, then fix, then re-run"* — was violated four times
this session, at a cost of two reverts and most of a day.

**Done when:**

- `npm run gate:probe-order` exists, captures each page in ≥2 probe orders, and compares evidence by CONTENT
  (not counts — counts are what hid the disjoint-channel defect: 4 against 4).
- Run against D1's overlay page **it FAILS**, and the diff names which field differs and under which order.
- It is exempt from nothing: a page it cannot capture in both orders is reported as INCONCLUSIVE, never as a
  pass.

---

## D3 — A known starting state for every probe

**Status: open. The actual fix. D2 goes green here or the diagnosis was wrong.**

*Continuous Delivery* again: establish a known-good starting point; make the steps atomic so order does not
matter. Today the only thing resembling this is `anchorToTop`, which is partial (browse mode and caret only)
and which **mutates state itself** — its first action is `nvda.press("Escape")`, which is why the Escape
probe of attempt 3 was inert: any dialog that responds to Escape was already closed before the ring was
measured.

Each probe must begin from a defined state and must record the state it observed, so "did these two channels
see the same page?" is CHECKABLE rather than inferred. The `focusConfinement` diagnostic added 2026-08-28 is
a hand-rolled instance of exactly this question, asked once.

Note the honest tension: an overlay that a real user must dismiss is part of the page. The answer is not to
pretend it is absent — it is to make the state **explicit and recorded**, so a rule can decline to compare
across a change instead of comparing blindly.

**Done when:**

- `npm run gate:probe-order` PASSES on D1's pages and on ≥3 real pages including `tfl.gov.uk/modes/tube/`.
- Every probe emits the state it measured under; a capture where two probes disagree about the state is
  reported, not silently averaged.
- `npm run evidence:check` says whether the corpus moved. If it did, that is a deliberate recapture, budgeted
  once, not discovered afterwards.
- The `ORDER IS LOAD-BEARING` comment is **deleted**, because it is no longer true — and if it is still true,
  this item is not done.

---

## D4 — One owner for the cross-channel question

**Status: open. Removes the brittleness, and it is the reason "every change breaks something else".**

`addKeyboardTrap`, `addKeyboardUnreachableControl`, `addBrokenFocusOrder` and `cycleCoversThePage` all
hand-roll comparisons between the sweep and the tab walk. There is no single place that owns *"do these two
channels describe the same page, and to what extent do they overlap?"*

Measured cost, 2026-08-28: a guard added to 2.1.1 asserted 2.1.1's own premise and silenced every genuine
finding — caught only because a unit test existed for exactly that. The two criteria read the same comparison
in **opposite directions**, and nothing in the code said so.

**Done when:**

- One exported function answers the same-state/overlap question, and `rules.ts` contains no second spelling
  of it. A discovery test enforces this, the way `rule-oracles.test.ts` does for `oracleCounts`.
- `npm run rules:gate` on the authoritative corpus: PASS, 0 false positives, and 2.1.1 / 2.1.2 / 2.4.3 all
  unchanged from their pre-refactor catch rates.
- Mutation-checked: breaking the shared function must fail tests for MORE THAN ONE criterion. If it fails
  only one, the others are still hand-rolling it.

---

## D5 — Make `gate:stability` able to see what it is for

**Status: open. Small, and it closes the loop D1 opens.**

Its five canaries are static local corpus pages. It has never watched a real page or an overlay. Its own
header says every canary is present "because of a specific mechanism it can exercise" — the mechanism that
has actually cost this project four rules is not among them.

**Done when:**

- The canary list includes D1's overlay page and at least one real page.
- Each new canary records the mechanism it exercises, in the existing style.
- Reproduce the fault first: each must be shown to FAIL under the defect it is meant to catch.

---

## D6 — A verdict cannot be built without saying what it examined

**Status: open. Added 2026-08-28 after the question "how is it so easy to examine the wrong thing?"**

It is easy because **a result crosses a boundary as a bare verdict and its SCOPE does not travel with it.**
Every instance in one session:

| where | the verdict | what it left behind |
|---|---|---|
| pre-push hook | `ok check-signals` | "226 of 1461 examined" |
| `worker:code` | "nothing to compare" | "…of the LOCAL pool; inventory.yml has 5, all stale" |
| capture preflight | "Fleet runs this checkout" | "0 worker(s) checked" |
| `rules:gate` | `2.1.2:focus-trapped 12/12 EXACT` | which 12 records, and that the new case was not among them |
| `gate:probe-order` (mine, before it shipped) | would have said `PASS` | that it never reached a real page — Edge serves its own error page, so both orders compare identical |

**This is NOT a modularity problem, and more packages would make it worse**: every package boundary is one
more place for scope to be dropped. The package boundaries here already work, and they work because they are
enforced by DISCOVERY TESTS rather than convention — adding one file tripped six of them (budget ladder,
flag guard, entry-point guard, git-tracking, the `GUARDED` registry with a required reason, and CLAUDE.md's
own count of guarded CLIs). Each caught a real defect and named the incident behind it.

**Nor is printing the number sufficient.** Surveyed across the gate scripts:

```
score-rules.ts       population-in-verdict: 6
evidence-check.mjs   population-in-verdict: 4     <- and it STILL passed on 2 of 48
stability-gate.mjs   population-in-verdict: 0
```

`evidence-check` printed its coverage and passed anyway, because the guard tested `compared === 0` rather
than `compared < expected` — the extreme case, not the middle. So the rule is: **the verdict must be a
function of coverage, not merely accompanied by it.**

**Done when:**

- One shared result shape — `{ verdict, examined, of, source }` — that a gate cannot construct without
  stating its population and where that population came from.
- The verdict is DERIVED from coverage: a gate that examined fewer than it expected reports INCONCLUSIVE,
  and cannot report PASS. `evidence-check`'s 2-of-48 must be inexpressible, not merely caught.
- A discovery test finds every gate script and requires it to return that shape or be exempt with a reason,
  the way `cli-flags.test.ts` does for argv readers. A list would rot; this is the mechanism that does not.
- Mutation-checked on the five rows above: each must become impossible to state, not merely unlikely.
- **A capture must refuse a page nothing is serving.** Added after the same trap caught me THREE TIMES in
  one session — in `gate:probe-order` before it shipped, in a diagnostic script twenty minutes after fixing
  it there, and in a third script two hours after writing the commit message about it. Edge serves its own
  error page on a dead port, so two orders compare IDENTICAL and a gate reports PASS; an ad-hoc capture
  returns `focusOrder: ["192.168.1.15, document, read only"]` and reads as a valid capture of a document.
  The tool already refuses a page whose URL is not the one requested (`landedVerdict`), and that check does
  not fire here: the URL IS right, it is the page behind it that is missing.

  **This cannot be a discipline, and the evidence is that the person who had just fixed it could not hold
  it.** The guarded path is always the ceremonial one — a five-line diagnostic skips the lease because
  leasing feels like overhead for one question, and a diagnostic is exactly when you are moving fast and
  least inclined to doubt the answer. The fix is structural: the worker reports the navigation's HTTP
  status from the DevTools Protocol, and a non-2xx is a refused capture rather than evidence. Then every
  ad-hoc script gets the property for free, which is the only way it survives a hurry.

---

## Not in this plan, and why

- **Replacing guidepup with our own NVDA layer.** Considered and rejected on evidence. Every capture in the
  four withdrawals was ACCURATE — tfl's ring really was those five controls, the corpus trap's really was
  three text inputs, and the lab's capture was byte-identical to a laptop's. guidepup reported the truth every
  time and we drew the wrong conclusion from it. Where it HAS cost us (U+FFFC, the half-open speech socket,
  `capture: "initial"`) all three are fixed. This would be months of work aimed at the one component that has
  been telling the truth, and it would not have prevented a single withdrawal.
- **A database for the corpus.** ~2,500 immutable content-addressed JSON documents, written once, read by
  scanning: a filesystem workload. It would add a daemon beside the corpus, the release weights and the deploy
  key — the surface ADR 0012 keeps clear — and answer no question `lab:inventory` cannot. Revisit when there
  is a query it cannot answer.
- **"Zero defects" as a slogan.** Kept as the target, dropped as a claim. Each item here names the check that
  would catch its defect; that is what turns the goal into a work list instead of an assertion. What is NOT
  reachable is "the live web never changes" — and that was never a defect in the tool. The other three senses
  (same evidence → same findings; same state → same evidence; same URL → same evidence) are all reachable and
  this plan is how.

---

## How to know the plan worked

One number, on the thing that has been wrong all along:

```bash
npm run gate:probe-order        # PASSES on overlay pages and on real pages
npm run rules:gate              # PASS, 0 false positives on the authoritative corpus
npm run rules:real-pages        # PASS, 0 new findings on 86 conformant pages
```

And one behaviour: **`nls.uk/join/` gives the same answer twice.**
