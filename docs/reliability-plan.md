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

## A3 — CLOSED on the fourth attempt. Ask what the ring OFFERS, not how big it is

**Status: CLOSED on the fourth attempt, 2026-08-28.** This line read `open` under a `CLOSED` heading for two days — a file that states an item's status twice will eventually disagree with itself, and the heading is the half people read.

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

### THIRD ATTEMPT: the Escape probe, built and retired the same hour

The done-condition below said this needs a probe that presses Escape on a confined ring. That was built,
deployed to all five workers, and captured against a purpose-built pair: two variants **byte-identical
apart from one `keydown` handler**, both carrying the same focus guard, so the ring SIZE is constant across
the pair and no rule fitted to it could learn "is there a modal" instead of "is there a trap". That pair is
the control the corpus has never had, and it was the right idea.

The capture retired the approach:

| variant | ring | swept | cycled | Escape probe | result |
|---|---|---|---|---|---|
| bad | 3 | 5 | true | asked; all 4 stops inside the ring | trapped, correctly |
| good | **12** | 5 | **false** | never asked | **its dialog was already closed** |

The good variant's walk never touched a dialog field. **`anchorToTop` presses Escape as its first action**,
and `probeFocusOrder` calls it before the walk — so any dialog that responds to Escape is gone before the
ring is ever measured. The probe could only ever run on dialogs that IGNORE Escape, where it reports "no
release" by construction. Inert, in the `refreshBrowseBuffer` sense: it ran, and it could not change an
outcome.

**And the consequence retires the item, not just the attempt.** A confined ring already means *confined
after an Escape has been pressed*. That is exactly the condition of the rule withdrawn the same morning —
the one that produced 7 false positives on 86 conformant real pages. So confinement-despite-Escape is
demonstrably not a 2.1.2 failure, and no amount of pressing Escape was going to make it one.

The reason is in the criterion. 2.1.2 asks that focus can be moved away *using only a keyboard*. Dismissing
a consent banner with its Accept button is exactly that. So deciding this case requires ACTIVATING the
dialog's dismiss control — and `probeForms` is deliberately OFF for real pages, because "pressing *Book* on
a stranger's site is not a review". **The blocker is a policy this project chose on purpose, not a missing
probe.**

One incidental finding, recorded because it cost nothing to see and would cost a lot to rediscover: the
good variant's first stop announced `"Full name, edit, focused, H"` — an `h` typed into the field. Releasing
focus into an editable mid-capture puts NVDA in focus mode, and the sweep's quick-nav keys then type
themselves into the page. That is the 353-capture defect this repo already records, reproduced by a page
built to press Escape.

### Where three attempts left it — and why that conclusion was wrong

After the third withdrawal this section read: *2.1.2 assesses the STALLED case and nothing else, and closing
it needs a policy decision about activating a dismiss control.* Three attempts, each refuted by evidence the
previous one could not see:

| attempt | refuted by |
|---|---|
| ring vs swept form fields | 7 false positives on 86 conformant real pages |
| ring vs rendered tab stops | 9 false positives on the same pages |
| press Escape and re-walk | `anchorToTop` already presses Escape; the probe cannot observe a release |

**The escalation was premature, and it is worth keeping as the mistake it was.** Two of the premises behind
it did not survive checking:

- *"We never touch pages we do not own."* False. `capture-real-pages.mjs` runs `probeNavigation: true`,
  which activates a link. The policy `probeForms` encodes is "do not submit forms", not "do not interact".
- *"Separating them needs a wordlist, which 2.4.4 forbids."* A conflation. The banner's WORDS are a
  wordlist; the control's ROLE is not, and `parseAnnouncement` already extracts it.

Both were checkable in minutes and neither was checked before declaring the item blocked and handing it
back. Escalating a decision is a real answer, and it has the same evidence bar as any other.

### FOURTH ATTEMPT — and it passes

The three above all asked HOW MUCH of the page the ring covers. That was never three coincidences: SIZE is
exactly what a consent banner also differs by, so a rule fitted to it learns *is there a modal*, not *is
there a trap*.

The question is what the ring **offers**. Measured on the pages that did the accusing:

| ring | roles | verdict |
|---|---|---|
| tfl.gov.uk | `link, link, button, button, button` — "Accept all cookies" | silent |
| networkrail | `link, button, button, button` — "Allow all cookies" | silent |
| corpus trap | `edit, edit, edit, edit` | **fires** |

Every consent banner offers a control that dismisses it. The trap offers nothing: you can type, and Tab
cycles. That is 2.1.2 read literally — focus must be movable away *using only a keyboard*, and activating a
button in the ring is exactly that. It composes with the third attempt's finding: a ring measured here has
ALREADY outlived `anchorToTop`'s Escape, so one that offers no control has no documented means left.

A **role** test via `parseAnnouncement`, never the words, so it cannot become the 2.4.4 wordlist shortcut
and behaves identically on a banner in any language.

**And the pair can no longer teach the old shortcut.** The previous cases paired a guarded dialog against an
UNGUARDED one, so they differed by ring size — the very feature that fooled all three rules. The rebuilt
pair carries the identical guard on both sides:

    good  stops 7  distinct 4  swept 5  confined=true   3 edits + "Close, button"
    bad   stops 7  distinct 4  swept 5  confined=true   4 edits

Every count identical; one role different. A size-keyed rule is refuted **by construction** rather than by
hoping — the ADR 0015 free-veto discipline applied to a pair instead of a head.

Deliberately conservative: any actionable role anywhere in the ring silences it, including a Submit button
in a genuinely trapped form. That miss is the right one to accept — 2.1.2 is non-interference under WCAG
5.2.5, so a wrong accusation says the whole page is unusable.

### Done when — MET

- `rules-real-pages`: **PASS — no conformant page gained a finding**, 86 conformant pages. This is the gate
  that killed the other three, and the only one that could: the corpus has no consent banner, no date
  picker and no modal that confines focus legitimately, and it said 4/4 exact for every failed attempt. ✅
- `check-signals` 226 discriminating, 0 blind, 0 contaminated; rule and corpus signal pinned equal by
  `focus-trap-parity.corpus.test.ts`. ✅
- The corpus pair holds ring size, `cycled`, swept fields and tab order constant, so the refuted feature is
  unavailable to any rule fitted to it. ✅

### The lesson worth more than the branch

**The corpus said 4/4 exact and the real pages said 9 false positives, and the corpus could not have known.**
It contains no consent banner, no date picker, no modal that confines focus legitimately — so the feature
that separated it perfectly was measuring "is there a dialog", not "is there a trap". That is ADR 0019's
thesis arriving again, and the specific reason `rules-real-pages` exists.

Second: **I recorded this as closed before the check that could refute it had run.** The corpus evidence was
real and the conclusion did not follow from it. A done-condition naming the gate that can see the failure —
which this item now has — is what stops that.

---

## B1 — CLOSED 2026-08-31. All three ran, and two of them shrank B2

**Status: CLOSED.** `scorer:explain-feature` was built for the first two and answered both in one output.

| measurement | answer |
|---|---|
| `form_change_nonempty` on `3.3.1` / `4.1.3` | **DEFINITIONAL, both.** 143 positives each, 143 read 0, and each carries exactly ONE form change — `submit=142 taskButton=1` and `taskButton=143` — whose `after` is empty, which IS the finding. Classified in `IMPOSSIBLE_BY_DEFINITION` |
| `baselineQuiet: false` | **0 of 286.** True on every record in both subtypes. Conditioning the featurizer on it would add a latent guard rather than fix anything, so it is recorded and not shipped |
| `observation-ambiguity` re-run | `formChanges never asked` **62.2% → 61.3%**, `postSubmitFields` 55.9% → 55.0% — a delta of exactly 56 on each, which is exactly the 56 captures recaptured. The change did what it was meant to |

**A plausible hypothesis was refuted, which is why the tool was worth building.** 29 cases in each subtype
carry disclosure furniture and a working disclosure announces something, so `form_change_nonempty` should
have been 1 on those. It is not: **a disclosure activation lands in `stateChanges` and never in
`formChanges`**. Reasoning from the case definitions gave the wrong answer twice, in two different
directions; one command gave the right one.

**§2 is now two vetoes.** Recorded against the re-run baseline: 51 total, 21 closable, and exactly **two**
that are both closable AND on a subtype the model decides — `state_unchanged` on `3.3.1` and `4.1.3`.
Closing them needs a broken-disclosure accompanying defect, which is a ninth `ROTATIONS` entry, which is
priced inside B2 and worth doing only there.

---

## B1 (superseded) — the original framing

**Status: CLOSED, see above. Each was one `lab:job`, minutes, no fleet.** They exist because each is a question I
answered with a guess during the 2026-08-30 session and then had to withdraw.

| what | why | done when |
|---|---|---|
| `form_change_nonempty` on `3.3.1` / `4.1.3` | `not-working.md` §2 has four vetoes that reach a report and two are this feature. **29 of 143 cases in each subtype already carry disclosure furniture**, a disclosure lands in `formChanges` with `kind: "disclosure"`, and a working one announces something — so the feature should be 1 on those positives and the veto should not exist | the report says which of three it is: the furniture is never activated (a capture question), it is activated and silent (which would make furniture an undeclared DEFECT on 29 conformant-by-construction pages), or the entry is stale |
| `baselineQuiet: false` count over the corpus | `capture-core` attaches it beside `kind` with the same argument and **nothing reads it**. An untrustworthy delta read as "nothing was announced" is the fixed-sleep defect, which inverted a finding rather than adding noise | a number. Above ~0, `validation_error_missing` should require a sound baseline; at 0 it is a latent guard and can be recorded as such rather than shipped |
| `lab:job -e job=observation-ambiguity` | the focus cases now run the form probe. Whether the "never asked" count actually MOVED is the confirmation, and assuming it did is the defect this whole item is about | `formChanges … never asked` falls from 62.2%, or it does not and the change bought less than claimed |

**Do these before B2.** Two of them can remove work from it, and the third tells you whether the last
corpus change did what it was supposed to.

---

## B2 — ONE `CAPTURE_PROTOCOL_VERSION` 9, carrying everything that needs a recapture

**Status: open, and it is a BUNDLE rather than a task.** A bump invalidates every cached capture —
2,924, measured at ~4.5 h across the bare-metal fleet — so the repo's own rule is to pay it once:
*"do it deliberately, bundled, and pay the recapture once."* Nothing below is worth its own bump; together
they are worth one.

**The root-cause fix, first, because it is mostly a relocation.** A capture records what it HEARD and never
what it ASKED (`not-working.md` §11). `media` is the only channel that gets this right. Generalise it:

```js
observed: {
  tableCells:   { asked: false },
  headings:     { asked: true, terminus: "exhausted" },
  stateChanges: { asked: true, terminus: "deadline" },
}
```

Additive, so the twelve existing channels keep their exact types and **the 28 files that read them are
untouched** — the same shape as `fault` and `captureId`. `collectByType` already computes every terminus
and writes it to `sweepLog`, a debug channel nothing reads, so this moves a fact rather than measuring a
new one. Then `verify.ts` stops being archaeology: `sweepCompleteness` reads `observed` when present and
falls back to today's inference when it is not.

**Then the capture gaps, highest value first.** `docs/screenreader-coverage.md` holds the full list with
the guidepup command for each; these are the ones worth putting in this bump:

1. **Status messages / live regions.** 4.1.3 is *only* about announcements with no focus change, and we
   catch them solely as a side effect of form submit — so a filter result or "3 items added to basket" is
   untested. The machinery is in `activateAndCaptureDelta`; it needs non-form triggers. **We already claim
   this criterion**, which is what makes it first.
2. **Dialogs and modals** — focus on open, focus RETURN on close, whether Escape works.
3. **Arrow-key widgets** — 2.1.1's rule currently ABSTAINS (`SHARES_ONE_TAB_STOP`) because Tab alone
   cannot tell *reachable by arrows* from *unreachable*. Its own comment names driving the arrows as what
   would settle it.

**Done when:** `npm run evidence:check` reports CHANGED (if it reports SAME the bump was not needed and
the design is wrong), `--pipeline=verify --only=` on one subtype passes before the corpus is paid for, and
`check-signals` reads `0 blind, 0 contaminated` afterwards.

**And if `ROTATIONS` is ever going to be enlarged, this is the only moment it is cheap** — 237 cases and
474 captures, which is not worth its own recapture for the two `state_unchanged` vetoes in §2.

---

## B3 — Publish, which is a decision and not a task

**Status: waiting on a person.** `not-working.md` §8 records the dry run: three attempts, two real
workflow defects found and fixed, and all five locks exercised on the third. What remains is not
mechanical — `.changeset/config.json` says `access: "restricted"` and PLAN.md B5 (the name) is unsettled,
and ADR 0006's licence split is gated on the same decision and is effectively irreversible.

**Before a real publish, run the full gate on the lab** — `npm run lab:job -- -e job=release-gate`. The
workflow can only prove 4 of its 12 stages; the human typing `publish-for-real` is asserting the other
eight passed somewhere a corpus and a venv exist.

---

## Not on this list, and why

- **Promoting the scorer** is a decision, not a task; `not-working.md` §1 carries the state. Publishing is
  B3 above, because it now has a done-condition and a prerequisite that were only established by running it.
- **Consumer telemetry** is decided against, in `SECURITY.md`.
- **Enlarging `ROTATIONS` on its own.** 237 cases and 474 captures to close two free vetoes on heads with
  143 positives each is poor value. It is named inside B2 because a bundle is the only context where it
  is cheap, and it is not an item of its own.
- **Anything for the three focus heads' free vetoes.** They are 24 of the 53 and every one is on a
  `decidedBy: "rules"` subtype, so none can reach a report. The v17 training report shows those heads at
  recall 0.000 — the model cannot see `focusOrder` at all, which is correct under the layer split. Work
  there buys nothing a user would notice.
