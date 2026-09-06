# What is not working

Everything on this list is a thing the tool does wrong, cannot do, or cannot show. Nothing here is a task
that is merely unfinished — [`reliability-plan.md`](reliability-plan.md) holds those, as an ORDERED list
where every item carries a done-condition that is a command and its expected output. **This file is the
RECORD, that one is the PLAN**, and an entry usually appears here first and moves there when somebody
decides to act on it.

(This paragraph said the plan "is deleted" for part of 2026-08-28, which was true when written and stopped
being true an hour later. Two documents naming each other is exactly the fact-stated-twice shape, so if
you find them disagreeing again, the plan's per-item status is the one derived from a command.)

**Read this before quoting any number about this project.** Each entry states what was measured, on what,
and when. Where a claim rests on my local `runs/` rather than the lab's corpus, it says so — that
distinction has been wrong twice in one afternoon and is the first thing to check.

## How the numbers on this page stay findable

This file used to carry the same number more than once — four entries all titled `## 18.`, two each titled
`## 15.` and `## 20.` — because a number was assigned by whoever wrote the entry, from memory of what the
highest number so far was, with nothing checking it. CLAUDE.md records what that cost: two wrong citations
in two days, because a later, wrong reader guess ("read to the LAST section with a given number") was
itself written down as the fix.

**The rule now: a bare number always means the CURRENT entry, and a duplicate gets a letter appended in the
order it was committed** — `18a` is the oldest superseded attempt, `18c` the newest superseded attempt, and
the bare `18` is current, whatever position it happens to sit in. This is checked by
`packages/lab/src/packaging/not-working-numbering.test.ts`, which refuses a second bare use of any number —
so this can only happen again if someone edits past a passing test. Position in the file proves nothing
either way, which is why every current-vs-superseded note also names the commit and the wall-clock time
that decided it, per `git log -S "<the headline>" -- docs/not-working.md`, rather than trusting where the
heading sits.

A duplicate is not always a supersession: `§15`/`§15a` are two unrelated findings that happened to claim the
same number, not one correcting the other. Both stay fully written, refutations and all — this scheme is
about which number to type when you mean "the current one", never about deleting or resolving the history.

---

## 1. CLOSED 2026-08-29 — the shipped weights now state where they came from

**Verified by the gate that was written to refuse it:** `npm run release:provenance` exits 0 —
*"PASS — all 1 of 1 from the shipped weights, 3 pending changeset(s) and the CHANGELOG examined and
clean"*. `training-report.json` reads `dataset.records = 2487` and
`.changeset/promote-candidate-198816d2.md` states `records: 2487` with the floor, the encoder hash and
the feature schema beside it. Promoted in `c3c2bc0`.

Note what closed it: **the DATA changed, not the gate.** The gate was correct and correctly red for as
long as the shipped weights had no traceable provenance, which is the state this entry described.

<details><summary>What this said while it was open</summary>

`packages/scorer/models/screenreader-scorer` holds a model trained on **2,485 records**. Nothing states
its provenance. The two pending promotion changesets both describe **2,403**, and are byte-identical to
each other — one release note, written twice, for a model that never shipped.

ADR 0007 makes the weights the scorer's API and the changeset the only record of which model produced a
given finding, which is the question somebody asks when they dispute a WCAG assertion. So the first
release would publish weights nobody can trace a finding back to.

`npm run release:provenance` now refuses this, names the provenance it wanted stated, and is the second
stage of `release:gate`. **The gate is the fix; the DATA is still wrong.** Closing it is a decision only
the maintainer can take, because it is a major release:

- the lab has a gated candidate at **2,487 records** — `releaseEligible`, held-out acceptance passed,
  and `promote:model --dry-run` confirms it clears the regression check against the shipped 2,485
- its exact bytes are in `runs/fetched/candidate.promoted-*`, and the candidate itself is intact on the
  lab at `runs/model-candidate`
- promoting it writes the changeset that closes this entry

Until then the gate is correctly red, which is the honest state rather than a defect in the gate.

</details>

## 2. CLOSED 2026-09-05 — the two remaining vetoes are unclosable by definition, not open work

> **The count in the REOPENED entry below is correct and the reading of it was incomplete.** Two vetoes on
> model-decided subtypes do reach a report — `form_change_observed_absent` on both
> `3.3.1:validation-error-silent` and `4.1.3:form-activation-silent` — and the entry below asks the right
> question: is this ADR 0015 corpus work, a stale classification, or the wrong-shaped cross? It is neither
> of the first two. Both are `IMPOSSIBLE_BY_DEFINITION`, now declared as such in `corpus:unclosable-map`
> (`audit-corpus-starvation.mjs`), and the headline test — zero free vetoes reaching a report **that ADR
> 0015's remedy can do anything about** — is true again, for a reason the count alone cannot distinguish
> from "somebody accepted a veto they should not have". It is not that; it is a classification that was
> simply never audited for this feature.
>
> **The mechanism, read from the featurizer rather than assumed.** `cross_with_observation`
> (`screenreader_features.py`) computes `form_change_observed_absent` as `asked AND NOT bool(formChanges)`
> — the probe ran and found NO CONTROL TO PRESS, never "the probe ran and the page said nothing". The
> activation function in `capture-core.mjs` pushes a `formChanges` entry on every completed press, silent
> ones included (`after: ""` is still an entry); the array stays empty only when nothing was found to
> activate, or the press threw before recording. So `form_change_empty` — a different, already-unclosable
> feature two rows above — is what these subtypes' silence should read 1 on, and does. This feature reads
> something else: whether the probe found nothing to press at all.
>
> **3.3.1 and 4.1.3 are the two subtypes whose whole point is a submission that gets rejected or ignored,**
> so a control to press is guaranteed by the case definition rather than incidental to it. Census against
> `case-matrix.mjs`'s `CASES` (no capture needed): 143/143 positives of 3.3.1 carry `probeForms: true`;
> 149/150 of 4.1.3, the one exception being `filter-status-silent-link`, which activates through
> `probeNavigation` instead — its own comment says why, "probeForms deliberately never activates a link."
> That case's `observed.formChanges.asked` is false, so it lands in the all-zeros "never asked" row rather
> than "asked-and-absent" — a different mechanism landing on the same value.
>
> **Measured on the captures, not an export, and this is why no fresh export was needed to close it.**
> `interaction.formChanges` is a capture field that predates the schema, so a stale export missing
> `observed` cannot touch it:
>
> ```
> captures of 3.3.1 + 4.1.3                                   : 502
> observed.formChanges.asked === false                        :   2   (both filter-status-silent-link)
> formChanges EMPTY while asked (the veto's constant-1 shape)  :   0
> ```
>
> Zero of 500 asked-and-found-nothing. The feature cannot be 1 on either subtype for a reason about what a
> positive of the subtype IS — the `IMPOSSIBLE_BY_DEFINITION` test — and it is a different fact from the
> five focus/context subtypes already declared under `UNREACHABLE_WITHOUT_PERTURBING`, which never run the
> probe at all. Both land on the value 0; only one of them is a corpus question.
>
> **What this is NOT closing.** Whether these two heads should move to rules instead, the way
> `4.1.2:state-change-silent` and 1.4.13 did, remains open and is not decided by this — it is an ADR 0021
> decision about which layer owns the subtype, and deciding it to make a veto go away would be the wrong
> reason. And nothing here touched `scorer-shortcuts.baseline.json`: a classification fix changes what a
> veto MEANS, not the tracked baseline's acceptance of it, and no baseline write happened for this reason.

### REOPENED 2026-09-06 — the test still holds, the count did not

> **The CLOSED claim below is stale, and the test it was built on is still the right one.** Computed
> today from `packages/lab/scripts/scorer-shortcuts.baseline.json` at `3ffd775` (HEAD for that file),
> cross-referenced against `packages/lab/rule-ownership.json` at `ae9565c` (current HEAD): **21 rows, 68
> vetoes, 21 closable — not 13.** Of the 21 closable, 19 sit on a subtype `rule-ownership.json` marks
> `decidedBy: "rules"` and cannot reach a report. **Two do not:**
>
> ```
> 3.3.1:validation-error-silent   positives=143   closable: form_change_observed_absent (-1.21)
> 4.1.3:form-activation-silent    positives=150   closable: form_change_observed_absent (-1.42)
> ```
>
> Neither subtype has an entry in `rule-ownership.json`, which under this project's own convention means
> MODEL-decided — the same two heads §2's original body spent most of its length on. So the headline is
> false today: the free-veto count that can reach a report is **two, not zero.**
>
> **What changed, precisely, is not carelessness.** `git log` on the baseline file shows three commits
> since the `CLOSED` one (`bda844f`, 2026-08-31): `7a99ae2` (2026-09-02, records 3.3.3's baseline —
> rules-owned, its vetoes shielded), `f66e216` (2026-09-02, records 3.2.1/3.2.2 — closable EMPTY on both),
> and `3ffd775` (2026-09-05, accepts 1.4.13's eight closable vetoes — also rules-owned). Separately,
> `3.3.2:unnamed-form-field` was retired as a subtype in this window, its records relabelled to
> `4.1.2:unnamed-control`. **None of those three commits is what exposed 3.3.1 and 4.1.3.** The feature
> that does, `form_change_observed_absent`, appears ZERO times in `bda844f`, `7a99ae2` and `f66e216`, and
> 17 times in the current file — a schema change (the feature-cross work, `not-working.md` §11), not a
> baseline someone waved through. Nobody has run `scorer:shortcuts:baseline`'s deliberate-act ritual
> against THIS reason for THESE two subtypes; the veto simply arrived with the retrain and has not been
> looked at.
>
> **The old vetoes on these two heads did close, genuinely.** `state_unchanged` no longer appears on
> either subtype's veto list at all (the `silent-toggle-inert` accompanying defect the CLOSED entry
> below describes). `form_change_nonempty` is still a real veto on both — logits -2.42 and -3.60 — but is
> now classified UNCLOSABLE rather than closable, which is a separate, already-argued state.
> `form_change_observed_absent` is the new arrival and nobody has read it yet.
>
> **What would close it: the exact playbook §2's own body already wrote for `form_change_nonempty`,
> applied to the new feature.** Read the exported corpus — `form_change_observed_absent` against
> `provenance.subtype` on the 143/150 positives of these two subtypes — and find out which of: the channel
> is genuinely never observed for a probe-coverage reason (§11), or it is observed and empty for a page
> reason, or the classification itself is stale. Whether these two heads should move to rules instead, the
> way `4.1.2:state-change-silent` and `1.4.13` did, is a real option this file does not decide here.

### CLOSED 2026-08-31 — ZERO free vetoes can now reach a report

> **CLOSED 2026-08-31, and the number is zero.** Every closable veto that remains is on a subtype
> `rule-ownership.json` marks `decidedBy: "rules"`, so none can reach a report:
>
> ```
> corpus-wide closable      21 -> 13
> 3.3.1:validation-error-silent   1 -> 0 closable
> 4.1.3:form-activation-silent    1 -> 0 closable
> closable AND model-decided       2 -> 0
> ```
>
> `state_unchanged` was the last one, and it took a `silent-toggle-inert` accompanying defect — a
> disclosure that never opens — to make it vary. It now reads 1 on one of 143 positives in each subtype,
> which is enough: the audit's criterion is strictly `{0.0}` across every positive.
>
> **The two attempts are the interesting part.** The first was withdrawn this morning because the ninth
> rotation starved `2.4.3` of furniture. What changed was not the piece: lifting a STALE exclusion
> elsewhere in this register took `2.4.3` from 8 cases to 35, and a subtype with 35 sees every furniture
> shape by construction. Two items this file listed separately were one item.
>
> **And I read the result wrong before reading it right.** The first check said the fix had failed —
> `state_unchanged` 0 of 143 — because `explain-feature` reads `with-realism.jsonl` and I had re-run
> `export` but not `build-realism`. Same shape as the `scorer:shortcuts` corpus defect found the same day:
> a number computed from a file nobody refreshed. The capture had been right all along.
>
> Cost: 712 captures, 178 ids renamed and 178 added, ~2 hours of fleet time.

> **THE NUMBERS BELOW WERE STALE AND ARE NOW CORRECTED FROM THE ARTEFACT, 2026-08-30.** This section said
> "41 closable, 16 unclosable" against a total of 57, measured on scratch weights before protocol 8 and the
> v16 promotion. `packages/lab/scripts/scorer-shortcuts.baseline.json` — which is TRACKED, so it could have
> been read at any time — says **52 total, 35 closable, 17 unclosable across 18 heads**. It also says
> `2.4.1:skip-link-inert` no longer carries `vague_link_without_context` at all: it has 14 positives after
> A2's doubling and exactly two vetoes. **So the ROTATIONS argument this section used to hang on that veto
> describes a veto that no longer exists**, and the 237-case / 474-capture price it quotes is not owed here.
> Deriving a section from memory when the number is committed to the repo is the mistake, not the number.

> **AND THEN THE SAME MISTAKE AGAIN, ONE LAYER OUT — corrected the same day.** Everything below was
> computed over all 18 heads, and **44 of the 53 vetoes are on subtypes `rule-ownership.json` marks
> `decidedBy: "rules"`.** The model does not decide those, so those vetoes cannot reach a report at all.
> ADR 0015 already made this exact self-correction once, and states the rule: *"A defect in a component is
> not a defect in the product until you check what the product does with it."* I did not check, and the
> 96% headline below is a component number presented as a product one.
>
> **The product number is four.**
>
> ```
> RULES-owned  44 vetoes (42 probe-gated) — cannot reach a report
> MODEL-alone   9 vetoes ( 8 probe-gated) — these do
> of those, CLOSABLE and able to reach a report:  4
>   3.3.1:validation-error-silent   pos=143   form_change_nonempty, state_unchanged
>   4.1.3:form-activation-silent    pos=143   form_change_nonempty, state_unchanged
> ```
>
> Four vetoes, two heads, 143 positives each. That is the whole of §2 as a PRODUCT defect, and the remedy
> is ordinary ADR 0015 corpus work: give some of those positives a working disclosure so `state_unchanged`
> can be 1, and a non-empty form change. Neither needs a protocol bump.
>
> **The three focus heads are the clearest case and the reason this matters.** They carry 24 of the vetoes
> and they are ALL rules-owned — 2.1.1, 2.1.2 and 2.4.3 are decided by rules that read `focusOrder`
> directly and are exact. The model cannot see `focusOrder` at all: no evidence unit encodes it and no
> feature reads it. That blindness is CORRECT under the layer split rather than a defect, and a head with
> no relevant signal and 8 positives will fit whatever separates them, which is what a free veto is.
>
> What survives from the work below regardless: the classification was genuinely incomplete (5 features
> where the gate reaches 10), the focus cases genuinely never captured what a user hears, and four chain
> defects were real. What does not survive is the size of the claim.

### PROMOTED 2026-08-30 as schema v17 — and one of the four turned out to be definitional

The v17 candidate passed held-out acceptance and shipped. **The promotion gate refused the first
attempt**, which is the most useful thing that happened:

```
REGRESSION  4.1.3:form-activation-silent: 2 -> 3 closable veto(es)
            worst: validation_error_missing (-5.97)
```

Making `validation_error_missing` require a SUBMIT turned it definitionally absent from a subtype whose
activation is a FILTER — *"Filter the catalogue to show only bags and notice how many results remain"*.
Measured: **4.1.3 has 143 cases and 0 with a `type=submit` control; 3.3.1 has 143 of 143.** Not 142 of
143. So it is `IMPOSSIBLE_BY_DEFINITION`, it is now classified as such, and the re-run passed on its own
terms rather than by anyone lowering a bar.

**A fix that made one head better surfaced a relationship nobody had written down**, and it could only
appear once the feature was precise enough to be constant. Worth remembering before the next entry is
added to that list: a more precise feature will keep finding these, and each has to be argued.

That removes one of the four below. Recount after the next baseline recording.

### The four that remain, priced

`3.3.1:validation-error-silent` and `4.1.3:form-activation-silent`, each on `form_change_nonempty` and
`state_unchanged`, 143 positives apiece. They split into two different problems and only one is worth
paying for.

**`state_unchanged` needs an accompanying defect that does not exist.** It can only be 1 when a toggle was
activated and its state did NOT change — a silent disclosure, which is `4.1.2:state-change-silent`'s own
defect. `ROTATIONS` offers eight accompanying defects and not one of them is a broken disclosure:

```
bare-edit  fake-heading  filename-alt  generic-alt  generic-heading  position-only-table
unnamed-graphic  vague-link
```

So closing it means adding a ninth, and `case-matrix.mjs:3049` prices that in its own words: *"GROWING
THIS LIST RE-ROLLS EVERY MULTI-DEFECT CASE, and there is no version of it that does not"* — measured at
**237 cases changed and 474 captures invalidated** when it last went from 5 entries to 11. A2's cheaper
trick does not apply: a second failure mechanism draws new rotations from the SAME list.

**Recommendation: do not pay it for this.** 474 captures to close two free vetoes on two heads of 143
positives each is poor value, and the repo's own rule is that enlarging `ROTATIONS` is a deliberate,
BUNDLED change. If a future protocol bump is happening anyway, add the ninth rotation in the same run —
that is the only moment it is cheap.

**`form_change_nonempty` is a real question and I got its cost wrong.** An earlier draft here said it was
"a reading of the subtype definitions, so it costs minutes". It is not, and the check that refuted it took
one command: **29 of the 143 cases in each subtype already carry disclosure furniture** (`SCALE_BUCKETS`'s
fourth bucket), a disclosure activation lands in `formChanges` with `kind: "disclosure"`, and a working one
announces something. So `form_change_nonempty` should be 1 on those 29 positives and the veto should not
exist — and the baseline says it does.

One of these is true and they need different responses:

- the disclosure furniture is not being ACTIVATED on those pages, so the channel is empty for the
  probe-coverage reason §11 is about — a capture question;
- or it is activated and announces nothing, which would make the furniture a silent disclosure and
  therefore an undeclared accompanying DEFECT on 29 conformant-by-construction pages, which is worse;
- or the entry is stale and the veto has already gone.

**Answerable by reading the exported corpus** — `form_change_nonempty` against `provenance.subtype` on
records carrying the disclosure bucket — which is `lab:job`, not minutes of thought. Nobody has looked,
and until somebody does this item's cost is unknown rather than small. Recording that is the point:
"a count is where an investigation stops", and so is a guess about one.

**And the shape underneath is not what this entry assumed.** Cross-tabulating the baseline against the ten
features whose ONLY source is a form probe (`not-working.md` §11):

```
ALL vetoes:      50 of 52 sit on a purely probe-gated feature   (96%)
CLOSABLE vetoes: 34 of 35 sit on a purely probe-gated feature   (97%)
```

A veto exists because the feature is 0 on every positive of the subtype. For 96% of these the zero is not
a fact about any page — it is a fact about which probes the case definition turned on. **No page can fix
that**, so ADR 0015's "the remedy is the CORPUS, never the weights" does not apply to them, and the work
list said otherwise for as long as it has existed.

`UNREACHABLE_WITHOUT_PERTURBING` already made this argument and **applied it to five features where the
gate reaches ten** — corrected 2026-08-30. `probeForms` also gates `postSubmitFields`
(`capture-core.mjs:2061`), so `post_submit_present`, `validation_error_announced` and
`validation_error_missing` were unreachable for the identical reason, and `status_update_announced` reads
`formChanges` itself. Twelve items — four on each focus subtype — were on a work list nobody could
complete. The unclosable map went 22 → 37 pairs.

**Reclassifying is not fixing, and the falling number must not be read as progress.** The weights are
unchanged and every one of those negative weights still fires on a real page. What changed is that the
list now says which of them a corpus could ever close.

| head | positives | worst veto before | worst veto now |
|---|---|---|---|
| `2.1.1:control-unreachable-by-keyboard` | 8 | `vague_link_without_context` | `state_unchanged (-2.05)` |
| `2.1.2:focus-trapped` | 12 | `vague_link_without_context` | `state_unchanged (-3.08)` |
| `2.4.3:focus-order-scrambled` | 8 | `vague_link_without_context` | `state_unchanged (-3.37)` |

`vague-link-inert` is what moved them — `bare-edit-inert`'s trick one feature along. The exclusion it
replaced had a recorded reason (an anchor is a tab stop and would corrupt the channel those subtypes are
measured on), and checking it against the actual predicates showed it did not hold: both compare
`structure.formFields` against `interaction.focusOrder`, and neither reads `structure.links`.

### What is still open, precisely

**`2.4.1:skip-link-inert` now carries `vague_link_without_context (-4.51)` as its worst.** Its three
multi-defect cases drew rotations `[filename-alt, bare-edit-inert]`, `[generic-alt, position-only-table]`
and `[fake-heading, unnamed-graphic]` — none contains `vague-link`, so the substitution never fires. That
is chance, not design.

Reaching it means enlarging `ROTATIONS`, and that table's own comment prices it: going from 5 entries to
11 changed **all 237 multi-defect cases and invalidated 474 captures**. "Enlarging an option space
necessarily re-rolls selections from it, and the only honest response is to treat it like a
CAPTURE_PROTOCOL_VERSION bump: do it deliberately, bundled, and pay the recapture once." So this waits
for a bundled corpus change rather than being forced now.

**`state_unchanged` is the new worst on all three focus heads.** A focus case activates nothing, so the
feature is 0 on every one of its positives while other subtypes carry it. The same inert trick will not
work — a disclosure that is never activated produces no state change either — so this needs a different
lever.

**Two findings on 2026-08-29 that reframe it, neither acted on because both cost a capture.**

*The zero means two things.* `state_unchanged = float(any(...))` over the recorded state changes, and
`any([])` is `False` — so `0` is BOTH "a control was activated and its state changed" (a real non-finding)
and "nothing was ever activated, so this capture cannot say". That is absence collapsed into zero, in the
feature layer: the same defect as `census.heading` absent vs 0, `sameState: undefined` vs false, and the
recovery metric read with `?? 0`. It does not by itself remove the free veto — a feature constant at 0
across a subtype's positives is a free veto whatever the 0 means — but the constancy is partly an ARTEFACT
of the encoding rather than a fact about focus pages.

*The exclusion that makes the remedy "unavailable" rests on a stale measurement.*
`audit_applicability.py` says corpus furniture cannot fix these three heads, citing `component-index`'s
`notFor`, whose recorded reason is: *"`focusOrder` truncates at 12 stops, so four more push the case's own
controls out of the window"*. **`MAX_TAB_STOPS` is 150 now.** The exclusion may still be correct, but not
for the reason written down — and one command settles it:
`npm run lab:pipeline -- --pipeline=verify --only=focus-order-tabindex+`. Until that runs, "unavailable"
means "not re-measured since the cap changed".

**And 57 is measured on 18 heads with the corpus as it stands.** The remaining vetoes concentrate in
subtypes with few positives; `2.4.1` and `2.4.2` have 7 each against a recall cliff CLAUDE.md puts near
140. Corpus DEPTH is the underlying constraint, not the veto mechanism.

## 3. CLOSED on the fourth attempt — the ring's ROLES, not its size

`stalled` requires the SAME control to repeat, so a trap letting focus cycle among a dialog's controls
read as `cycled` — identical to a conformant page whose Tab order wraps. Both routes out were costed and
neither taken: Escape collides with NVDA's own way out of focus mode, and comparing the cycle's size
"would miss a trap in a modal containing most of the page's controls".

**The second route was right about the CYCLE and wrong about its CONTENTS.** A conformant wrap visits
everything the page has; a modal cycle visits what the dialog has, and the structural sweep already
records the whole page. `keyboard-trap-modal-cycle` is the canary — a `focusin` guard, three controls in
the dialog, four fields behind it:

| | stops | `cycled` | `stalled` | distinct | swept fields |
|---|---|---|---|---|---|
| trapped | 6 | true | **false** | **3** | 5 |
| conformant | 17 | true | false | 14 | 5 |

0 fires on a conformant page across 2,134 captures; `rules:gate` reports `2.1.2:focus-trapped 1/1 EXACT`
with 0 false positives over 934 conformant records. No probe change and no recapture — the evidence was
in every capture already taken.

**BOTH cycling rules were withdrawn on 2026-08-28, and the whole entry above is the corpus being
convincing about the wrong thing.** `rules-real-pages` scored them on 86 conformant real pages:

| rule | new findings on conformant pages |
|---|---|
| ring vs `domCensus.tabbable` (the wider denominator) | **9** |
| ring vs swept FORM FIELDS (the original cycling branch) | **7** |

A consent banner confines Tab to its own controls while the quick-nav sweep walks the whole document, so
the ring is smaller than the swept fields — which is *exactly* what the corpus case demonstrated. Measured:
tfl.gov.uk ring 5 of 28 swept (three of them "Accept all cookies"), networkrail ring 4 of 7, and the corpus
case ring 3 of 5. **The same evidence.** Under 2.1.2 a modal confining Tab conforms whenever the user can
leave by a documented means, and nothing in a capture says whether they can.

So the "0 fires on a conformant page across 2,134 captures" above was true and did not mean what it
appeared to: the corpus contains no consent banner, no date picker, no modal that confines focus
legitimately. 2.1.2 keeps only the STALLED detection.

**A THIRD attempt — pressing Escape on the confinement — was built and was inert.** `anchorToTop` presses Escape as its first action before the focus walk, so a dialog that responds to it is already closed and a confined ring ALREADY means *confined after an Escape*.

**A FOURTH attempt passes, and it changes the question.** The first three asked how MUCH of the page the ring covers; size is exactly what a consent banner also differs by. This asks what the ring OFFERS: tfl reads `link, link, button, button, button` ("Accept all cookies"), networkrail `link, button, button, button`, the corpus trap `edit, edit, edit`. Every banner offers a way out; the trap offers none. A ROLE test via `parseAnnouncement`, never the words. `rules-real-pages`: **PASS, 0 new findings on 86 conformant pages**. A3 in `docs/reliability-plan.md` carries all four attempts.

**Cost to the corpus, paid:** adding a third `focus-trapped` case re-rolls that subtype's multi-defect
pairings, so 6 existing pages moved and need recapturing on the lab. Measured before committing rather
than discovered afterwards.

## 4. CLOSED — all 15 signal types are shown to discriminate

**11 from real captures, 4 synthetic.** The five that were exempt were ALL focus-probe types, and the
exemption was the right call for the right reason: no capture on disk carried `interaction.focusOrder` or
the probe's mark for a case using them, and a hand-built fixture would have asserted my model of the
probe rather than the probe. The gap was in the evidence, not the method.

So the evidence was captured — five cases, both variants, across the real fleet. All five discriminate,
and the extraction refuses any trim that changes either verdict. Each is mutation-checked by stripping the
diagnostics and interaction block it is decided from.

**A caution about how nearly this went wrong.** My first harness reported all five BLIND, and I almost
recorded that as a finding. `check-signals` said `OK` on the same capture — two checks disagreeing about
one corpus, which this repo already names as the signal. It was my harness: `signalMatches(capture,
signal)` called as `(signal, capture)`. The same argument-order defect as `captureFault(code, message)`,
made while reading the file that documents it.

## 5. CLOSED — all 107 `.mjs` files typecheck

**107 of 107, from a real 32.** The figure this entry used to carry — 53 — counted files bearing a
`// @ts-check` marker, and **21 of those were outside the `tsc` program entirely**, so the marker was a
comment. Proved by planting `const X: number = "s"` in a marked file and watching nothing happen. Two
assertions now make an inert marker impossible, and `AT_LEAST` is 107, which may only rise.

**Every batch found real defects rather than missing annotations.** The ones that could bite:

- `waitForPageToSettle` treated a FAILED census as a reading, so two consecutive CDP failures compared
  equal and the page was declared settled — the only defence against capturing a client-rendered shell
- `stopPid(child.pid)` on a `process.exit` handler, where a spawn that never started has no pid and
  `kill(undefined)` throws, losing the rest of the cleanup
- `stalenessMs(null)` threw, against its own docstring: *"null means cannot tell, deliberately distinct
  from healthy — claiming health from a missing timestamp is how a monitor ends up reporting green on a
  dead process"*
- two required parameters with `= {}` defaults that made their own guards silently never fire
- a state shape spelled twice and already drifted; a map type that could not express the invariant its
  store exists to protect; four options types inferred from their own defaults, so the options WITHOUT
  defaults vanished

And three lessons about the tool itself, each established by compiling a probe rather than by reading: a
JSDoc union does not narrow when the discriminant is `string`, because `""` is falsy; two adjacent JSDoc
blocks silently discard all but the last, which was true in five places; and a shape typed by glancing at
how a value is USED describes the uses, not the value — I did that four times before learning to read the
body first.

## 6. Nobody knows how the scorer behaves on a user's pages

Calibrated against 94 real pages from five publishers. A page shape absent from that set could be
mis-scored systematically and nobody would learn.

**Decided against collecting**, not merely unbuilt — see `SECURITY.md`. This tool is aimed at pages behind
an organisation's authentication and the transcript IS the page's text; a report useful enough to act on
carries that. What bounds the risk is design: a model finding is unmapped, so it becomes `cantTell` — a
referral, never an assertion. The layer that ASSERTS is deterministic and measured at 0 false positives
over 1,183 conformant records.

This is the item that pins the Monitoring section of the ML Test Score, and under the minimum rule that is
the score.

## 7. CLOSED — both gates proven, and the one that could not see a silent judge now can

`promote:gated`'s wiring runs against a planted git repo; `eval:gate`'s against an injected scorer.
Neither needed the thing it was assumed to need — a lab, or the Python venv. That was the original
complaint, and proving it surfaced something worse.

**A scorer reporting nothing at all scored 59% recall, against a floor of 0.55.** The deterministic rules
supply that on their own, so the gate that exists to measure judge quality could not notice the judge
disappearing. Not a wrong threshold so much as a missing measurement: one number for two layers, when
this project's central claim is that they do different jobs.

Recall is now reported and floored per layer, keyed on whether a finding carries a `mapping` — rules
always set one, `findingsFromScores` never does:

```
                       combined   trained scorer   rules
shipped                    92%              33%      59%
scorer reporting nothing   59%               0%      59%     <- now FITNESS: FAIL
```

The floor is 0.20, chosen from those two measurements rather than from preference, and it is a ratchet
like the one above it: raise it when real-page calibration lifts the model's own contribution, never
lower it to make a run pass.

## 8. EXERCISED 2026-08-30 — the dry run found two real defects on its first attempt

This said five changesets were pending, `access: "restricted"`, and `release.yml` had never run for real —
so *"every guard around publishing is untested against an actual publish"*, and *"the first release will
exercise all five for the first time simultaneously, which is the one thing this repo's own rules say not
to do."*

**It has now been dry-run, and the warning was earned.** Three attempts, two genuine defects, both in the
workflow rather than in the packages:

| attempt | what happened |
|---|---|
| 1 | `sh: 1: .venv/bin/python: not found` — **`release:gate` cannot run on a runner.** Seven of its twelve stages need the Python venv or the CORPUS, and the corpus is gitignored and hours of fleet time. `npm run release:gate` there could only ever fail |
| 2 | `changeset status` ran AFTER `release:version` consumed the changesets, so it reported *"packages changed but no changesets found"* and exited 1 — failing the very step it was meant to illustrate |
| 3 | **PASS.** All five locks exercised: dispatch-only, `dry-run` defaulting true, the `confirm` string, `access: restricted`, and `action-smoke for e51c34fd: success` |

Both fixes are in. `release:gate:ci` is the part a runner can prove — safetensors, provenance, no open
migration, every package usable from a tarball — and the workflow now emits a warning naming the eight
stages it did NOT run and the lab command that does. The step's own comment demanded exactly this: *"if
the gate cannot run in CI, fix the gate rather than skipping it here."*

**A third thing the run taught, about the guards rather than the code.** `action-smoke` is path-filtered,
so a commit touching only `.github/workflows/release.yml` never gets one — and guard 5 requires a run for
the EXACT commit. The refusal already names the remedy (`gh workflow run action-smoke.yml --ref <sha>`),
which is the guard being usable rather than merely correct. Worth knowing before someone reads a refusal
as a broken pipeline.

**Still not published, deliberately.** `.changeset/config.json` says `access: "restricted"` and PLAN.md B5
(the name) is unsettled and is the user's call. What has changed is that publishing is no longer a path
nobody has walked.

## 9. FOUND AND CLOSED 2026-08-28 — three defects that were on no list

None of these was on this page or in the plan. Each was found by disbelieving something, and each is the
same shape: **a check that reported cleanly having examined the wrong thing, or nothing.**

**The DOM census was exported and nowhere else.** Six modules run the deterministic rules against a
capture and six spelled the evidence extraction themselves. `dom` was built only by the dataset exporter —
so the first rule to read it would have scored perfectly on 1,183 conformant records and never once fired
for a user, with nothing to say so. A gate that does not exercise what ships is this repo's most-recorded
defect; **a gate that exercises what does NOT ship is the same defect with the alarm disconnected**,
because the green result actively vouches for the silence. It was already loaded and pointed at 2.1.2,
which is where A3 was headed.

The same audit found the opposite direction live in two more callers: `calibrate-abstention.mjs` — the
sweep that scores REAL pages through the product path, whose ASSERTED-WRONGLY column CLAUDE.md calls the
number this project steers by — and `rules-check.ts` inside `eval:gate`, both passing a RAW capture, so
every census-reading rule returned on its first line. The identical bug was fixed in two audits on
2026-08-26 and reached neither. `oracleCounts` is now one named step and `rule-oracles.test.ts` DISCOVERS
every rule caller and requires each to extract or be exempt with a reason; a list is what let this reach
four of six.

**`worker:code` reported "nothing to compare" while five workers served, all of them stale.** One env var
apart: the bare command said nothing to compare, `eval $(fleet:env)` first said `5 stale worker(s)`. The
inventory was already imported and already read twelve lines below to print the REMEDY — so the command
could name the five workers it should have checked while insisting it had none. That is `lab:inventory`'s
rule at another layer ("'none here' and 'none anywhere' are different answers"), and it lands harder here:
this command exists to stop a corpus being captured on the wrong code, so a false clean from it IS the
failure it prevents. Every reading now names its source.

**`tabbable` counted markup rather than tab stops.** Caught before any corpus run, while two captures
existed: a closed mega-menu or an `inert` background would have inflated the denominator, and a conformant
page would then read as having left most of itself unvisited — a limit of the measurement reported as a
finding about the page, this project's oldest defect. `checkVisibility()` and `inert` are separate checks
because an inert subtree renders and takes no focus, which is the modal-dialog pattern exactly.

**What connects them, and what to do about it.** Two of the three were found by running a command *twice*
with something changed and noticing the answers disagreed. The third was found by asking what the
CONFORMANT capture would look like. Neither is a technique a gate can run — but both become cheap once a
check names what it examined, which is what all three fixes now do.

## 10. FOUND AND CLOSED 2026-08-28 — a modal makes two channels describe DISJOINT halves of one page

Not on any list, and found only because a new corpus case gave the corpus its first CONFORMANT page with a
focus-confining dialog. `rules:gate` failed on it, with 2.1.1 reporting:

    never focused: ["Full name","Email","Phone","Delivery notes"] — while Tab completed a full cycle

Every word true and the conclusion wrong: close the dialog and all four are reachable.

**The cause generalises past the rule.** Measured on that capture:

| channel | found |
|---|---|
| quick-nav sweep (`structure.formFields`) | 4 — the page BEHIND the dialog |
| tab walk (`interaction.focusOrder`) | 4 — House number, Street, Town, Close, INSIDE it |

**Disjoint sets with matching counts.** Every count-based guard in that function compared 4 against 4 and
concluded the walk had covered the page. This whole family of rules compares a count from quick-nav against
a count from Tab, assuming both survey the same universe — and on a modal they survey different halves, so
the counts can agree while describing nothing in common.

The guard is therefore not another count: if Tab reached NOT ONE of the controls the sweep announced, the
two channels describe different states and no absence claim is available. A rule accusing 100% of a page's
announced controls has found a broken measurement, not a broken page.

**The first fix subsumed the rule**, and that is the part worth remembering. Guarding on "the ring is
smaller than the swept controls" is 2.1.1's own PREMISE, so it silenced every genuine finding — caught in
seconds by a unit test written for exactly that case. The two criteria read that comparison in opposite
directions; overlap is what separates them.

**Two pieces of tooling made this findable**, and neither existed that morning: the fetchable `capture`
artifact (the lab named two failing records and nothing could show what the rule SAW on them — the same
capture from a laptop was clean, so the difference WAS the defect), and the gate's evidence line, which had
been describing a branch withdrawn hours earlier and now reports `focusOrder on 80 of 2482 record(s)`.

## 12. RESOLVED — it was the INSTRUMENT, not the corpus. The two "regressions" were not real

> **EVERYTHING BELOW WAS WRITTEN BEFORE THE CAUSE WAS FOUND, and the cause was this gate reading the
> wrong corpus.** `scorer:shortcuts` audited `screenreader-evidence.jsonl`; the trainer trains on — and
> `scorer:shortcuts:baseline` records the baseline against — `with-realism.jsonl`. So a report built from
> one corpus was compared against a baseline built from another.
>
> `form_change_nonempty` is strictly `{0.0}` across the positives on the base corpus and carried by **2 of
> 184** on the one the head actually saw. The head could never have taken it for free. There was no
> regression, and nothing about the recapture caused one.
>
> **I had written up three remedies and was about to ask which to take. All three were wrong**, because
> there was nothing to remedy — and one of them was "re-record the baseline", which would have written the
> instrument's error into the artefact that defines what is accepted.
>
> Fixed by pointing all three veto audits at the trainer's dataset, with a guard that they agree and a
> second anchoring on the trainer script so a rename cannot re-open it. `release:gate` then passed all
> twelve stages.
>
> **The analysis below is kept because the reasoning was sound and the premise was not** — that is the
> useful half. "Two gates disagreeing about one corpus is the signal" is written in `CLAUDE.md`, and here
> the two halves of ONE gate disagreed, which is why it read as a finding rather than as silence.

**OPEN, and it is blocking a release.** The corpus was fully recaptured under
`CAPTURE_PROTOCOL_VERSION 10` on 2026-08-31 — 1,394 captured, 0 failed, and every corpus gate green:

```
check-signals      1462 discriminating, 0 blind, 0 contaminated, 0 stale
rules:gate         RULES PASS — 14 of 14, 2,488 records examined and clean
rules:coverage     PASS — every rule-only criterion has fired on a real page
rules:real-pages   PASS — all 86 of 86 conformant real pages clean
```

Then `release:gate` refused at `scorer:shortcuts`:

```
REGRESSION  3.3.2:unnamed-form-field: 2 -> 3 closable veto(es)
REGRESSION  4.1.2:unnamed-control:    2 -> 3 closable veto(es)
```

**The new veto is `form_change_nonempty` on both**, identified with `corpus:starvation` after two wrong
guesses — `validation_error_missing` reads 1 on 4 of 184 and `post_submit_present` on 10 of 184, so
neither was constant. Guessing one feature at a time is the wrong shape for this question and the tool
that answers it already existed.

**Why it moved, measured.** `3.3.2:unnamed-form-field` has 184 positives and **13 form-change entries
between them** — `route=3, submit=4, taskButton=6`, every `after` empty, every `baselineQuiet` true. So
the feature was riding on a handful of records either way, and a full recapture tipped it from
non-constant to constant. It is fragile rather than broken, and it was marginal before.

**What it is NOT.** Not definitional: nothing about an unlabelled form field precludes a form change
announcing something. Not `perturbs-measurement`: these subtypes are measured on names, not on
`formChanges`. So it does not belong on either unclosable list, and classifying it there to clear the gate
would be exactly the move `audit-corpus-starvation.mjs` warns against — *"this list is not a way of
lowering a number"*.

**And BOTH are `decidedBy: "rules"`**, so neither veto can reach a report. That makes this a component
defect rather than a product one, by the same argument §2 had to be corrected for — but it still blocks
`release:gate`, because the gate is deliberately blind to ownership and should be: a head the rules
override today is one the rules may not override tomorrow.

**The options, none of them free.** Give more of those subtypes' positives an activatable control so the
feature can vary (a corpus change, and therefore another recapture); establish that 13 entries across 184
positives is too thin for the audit's `MIN_CORPUS_OCCURRENCES` and fix the threshold rather than the
corpus; or re-record the baseline, which asserts the veto is understood and accepted, and would be
honest only once somebody has decided which of the first two is right.

**Not decided here, and not forced.** Overriding a gate that caught a real regression is the thing it
exists to prevent, and this one was found by the gate rather than by anybody looking.

## 13. DECIDED 2026-08-31 — five heads stay trained despite detecting nothing

`2.1.1:control-unreachable-by-keyboard`, `2.1.2:focus-trapped` and `2.4.3:focus-order-scrambled` read
recall **0.000** in the shipped training report; `2.4.1:skip-link-inert` reads 0.077 and
`2.4.2:route-title-stale` 0.286. The model cannot see `focusOrder` — no evidence unit encodes it and no
feature reads it — so a head asked to find a focus defect has nothing to find it with.

**Kept, and the reasoning is worth more than the outcome.** Removing them would be a MAJOR release of
`@a11y-witness/scorer` (ADR 0007: the weights are the API) for **no user-visible change**, because all
five are `decidedBy: "rules"` and the rules read `focusOrder` directly and are exact. And the heads are
independent `nn.Linear` — a head that fits nothing does not degrade the others, so the cost of keeping
them is training seconds and vector space, not accuracy.

**What would change this.** If ownership of any of the five moved to the model, a head at recall 0.000
would start deciding a criterion it cannot see — so the day `rule-ownership.json` changes for one of them
is the day this decision must be revisited, and that is the trigger to watch rather than the recall number.

Recorded as a DECISION rather than left open, because "five heads detect nothing" reads as neglect and is
not: it is the layer split working exactly as ADR 0021 designed it.

## 15. REFUTED 2026-09-01 — masking free vetoes closes every one and costs a real finding

**CURRENT §15 — committed 2026-09-01 22:16 (`9181776`), the later of two UNRELATED findings that both
claimed this number** (a plain numbering collision, not one superseding the other — the two are on
different topics). The other is §15a, further below in the file, committed 01:16 the same day: "the
capture can now ask whether a dialog can be LEFT". Neither is wrong; they simply cannot both answer to
"§15" for a reader with no other clue which one is meant.

Built, measured over three gated chains, and reverted. Recorded here in full because every number in it
is one somebody proposing this again would otherwise have to buy back at ~6 minutes of lab time each.

**The idea.** ADR 0015's free veto — a feature strictly `{0.0}` across a subtype's positives, which the
head may weigh negatively at no cost to recall because no held-out split can punish it — has been a
REPORT for months, and `scorer:shortcuts` can only ever recommend corpus work. Turn it into a training
CONSTRAINT instead: zero those columns before fitting, so the shortcut cannot be taken.

**Measured 2026-09-01 on the run that finished that morning: 9 closable vetoes across 5 subtypes, and 8
of the 9 are a head penalising a feature that answers a DIFFERENT criterion's question** —
`2.4.1:skip-link-inert` and `2.4.2:route-title-stale` both on `validation_error_missing` (3.3.1's);
`3.3.2:unnamed-form-field` and `4.1.2:state-change-silent` both on `status_update_announced` (4.1.3's)
and `validation_error_announced` (3.3.1's). The ninth is impossible by definition.

**FIRST: the plan's own remedy was refuted before it was built.** `sparkling-strolling-treasure.md`
Phase 1a proposed splitting each ambiguous feature into `asked AND x` / `asked AND not-x`, so "never
asked" becomes both-columns-zero. Checked against these nine first: for a subtype whose positives never
run `probeForms`, BOTH conjunction columns are constant zero across those positives. One free veto
becomes two. That would have cost a schema bump, a re-export and a retrain to discover.

**What the constraint actually did, over three chains:**

| | vetoes | held-out acceptance |
|---|---|---|
| baseline | 9 closable / 39 total | passes |
| mask any column CONSTANT across positives | **0 / 0** | 2.4.4 −20 findings, 1.3.1 −16, 1.1.1 −8, 3.3.1 −8 +4 FP, 4.1.3 −8, 2.4.6 −6 +10 FP |
| mask only STRICTLY-ZERO columns | **0 / 0** | 3.3.1: 2 FN, one case |
| ...and exempt `by-definition` complements | 0 closable | 3.3.1: 2 FN, the same case |

The first version was simply wrong: a column constant at `1.0` is a subtype's DEFINING evidence, and
gradient is proportional to the input, so only a ZERO column is fitted by negatives alone. ADR 0015 says
"strictly {0.0}" and I generalised it to "constant" because it sounded equivalent. That is 58 findings.

**Why the last row is not a regression, and is still a refusal.** On `3.3.1:validation-error-silent` the
masked head is BETTER on every split that was measured:

```
                   baseline      masked
threshold           0.4845       0.9153
calibration recall  0.9587       1.0000
calibration prec.   0.9748       0.9918
train / validation / test        identical
```

It separates better, so the Neyman–Pearson cut rises, and one marginal acceptance case
(`acceptance-b2-error-vessel/bad`) falls below the stricter threshold. That is exactly the mechanism
§6 of CLAUDE.md records — *"the threshold is set by the single worst negative, so one record reads as a
model regression"* — arriving from the recall side rather than the precision side.

**It is still the right refusal.** At the shipped cut that page's 3.3.1 failure would be missed, and a
missed finding is a user-visible loss whatever produced it. The gate was not lowered and nothing was
promoted; `everything` stopped at `acceptance` all three times, which is the pipeline working.

**ANSWERED 2026-09-01, and the answer is neither hypothesis.** The open question was that record's
SCORE: at 0.90 this is threshold variance and the constraint should ship; at 0.30 the head genuinely lost
it. The evaluator could not say, so it was given the ability and the probe re-run on a branch:

```
3.3.1: 2 acceptance false negative(s):
  acceptance-b2-error-vessel/bad [3.3.1:validation-error-silent 0.544 vs cut 0.915]
```

**0.544 against a 0.915 cut — a margin of 0.37.** That is not a record sitting on the threshold, so the
threshold-variance reading is refuted: the masked head genuinely ranks this case low. **The constraint
costs a real finding, and it stays reverted permanently rather than pending.**

Note what the first attempt at answering this got wrong, because it is the same defect one level up. The
score first reported was the CRITERION's, and a criterion is the OR of its heads' decisions — so its
score is an indicator, and a false negative always reads `0.000` against a `0.5` cut. That looked like a
total collapse and is merely "false negative" written in decimals. The number that means something is the
HEAD's, against its own cut, and `subtype_scores` had held it all along three lines from where the report
is assembled. Both fixes are on `main`; the probe branch is gone.

Two things are worth keeping from the attempt even though the code is gone. The `by-definition` /
`perturbs-measurement` split in `runs/unclosable-vetoes.json` is exactly the right seam and no consumer
outside `audit-scorer-shortcuts.py` had ever used it — the two groups need OPPOSITE treatment, because
one is a true implication and the other suppresses a finding a real page could carry. And `train` runs
BEFORE `shortcuts` in the `everything` chain, so anything that teaches the trainer to read that map must
chain `corpus:unclosable-map` itself or it reads a map left by a previous run.

## 14. DECIDED 2026-08-31 — the model is not given the observation metadata

Protocol 10 made every capture record what it ASKED, per channel. The RULES read it (`oracleCounts` feeds
`ruleEvidence`). The model does not, because `modelInput()` is an allowlist drawn around announced content.

**Not crossed, and the reason changed during this work.** The original argument was that the boundary
exists to keep the DOM out, and "did we ask?" is not a DOM fact — which is true, and was a good reason to
consider crossing it. What settled it the other way is that the measurable harm has gone: the ten features
reading probe-gated channels carried the free vetoes this register was largely about, and **that count is
now zero**. Every closable veto remaining is on a rules-decided subtype.

So the trade is a feature correlated with CAPTURE CONDITIONS — which ADR 0015 is entirely about, and which
`corpus:starvation` would have to police — bought against a harm nobody can now measure. That is the wrong
side of this project's own rule: *before optimising any number, run the path a user runs and check the
number is the one they would see.*

**What would change this.** A measured false finding traceable to one of those ten features reading a `0`
that means "nobody asked". `capture:explain` now names every such channel per capture, so the evidence for
that would be in hand rather than inferred — which is the difference between this being a decision and
being an assumption.

## 11. Ten of the 28 model features read a `0` that means "nobody asked"

Measured 2026-08-30 on the authoritative corpus, 6,467 captures, `lab:job -e job=observation-ambiguity`.

Every structured feature is `float(bool(channel))` or `float(any(...))`, and `any([])` is `False`. So a
`0` means BOTH *"the page has none of these"* and *"nothing looked"*, and no column can tell them apart.
This asks how often each is which, which nothing had ever done.

**Ten features have no source but a probe-gated channel** — `stateChanges`, `formChanges` and
`postSubmitFields`, none of which has a transcript fallback the way all four `table_*` features do:

```
state_change_present  state_changed  state_unchanged
form_change_present   form_change_nonempty  form_change_empty  status_update_announced
post_submit_present   validation_error_announced  validation_error_missing
```

And the probe that fills them did not run on most of the corpus:

```
formChanges       empty on 4830 captures, of which 3006 never asked   62.2%
postSubmitFields  empty on 5496 captures, of which 3070 never asked   55.9%
```

`probeForms` is off by default (`case-matrix.mjs:222`) and on for ~17 cases. So on roughly three
records in five, all ten features read `0` for a reason that is nothing to do with the page — and the
model has no way to know that. This is the same fact `applicability.py:147-152` records from the other
end: *"a precondition may only rule a subtype out when the subject is KNOWN absent, and the record does
not currently carry which probes ran."*

**The sweeps are FINE, and that correction is the more useful half.** The first version of this audit
put "the sweep missed it" and "there is no census to compare against" in one column and reported
`heading 94.9% UNSUPPORTED`, which reads as a capture path missing nine headings in ten. Split apart:

| channel | empty | sweep MISSED it | nobody asked / no census | page really has none |
|---|---|---|---|---|
| `heading` | 568 | **9 (1.6%)** | 530 | 29 |
| `link` | 3103 | **8 (0.3%)** | 2597 | 498 |
| `graphic` | 5200 | **4 (0.1%)** | 2865 | 2331 |
| `formControl` | 2797 | **29 (1.0%)** | 1925 | 843 |
| `landmark` | 2740 | **416 (15.2%)** | 2242 | 82 |
| `tableCells` | 6095 | 1 (0.0%) | **6094 (100%)** | **0** |

Two things fall out of that table and neither was known:

- **`landmark` is the outlier at 15.2%**, and that is the independent confirmation of why
  `landmark_present` was deleted — measured on 6,467 captures rather than on the 16 that prompted it.
  Every other sweep is under 2%. **Do not go looking for a general sweep defect; there is not one.**
- **`tableCells` is never observable when empty** — 6,094 of 6,095, because `probeTables` is opt-in.
  The four `table_*` features survive this only because each falls back to the transcript
  (`table_evidence`, `screenreader_features.py:691`). The channel is unusable; the features are not.

**What this does NOT establish, so nobody quotes it as if it did.** The audit measures CHANNELS, and a
feature is only as ambiguous as its weakest source — which is why the `table_*` claim above had to be
withdrawn once the fallback was read. And it says nothing about whether removing the ambiguity would
IMPROVE anything: a new column correlated with capture conditions is itself a shortcut, which is
ADR 0015's whole subject. That is a measurement somebody still has to take.

**MEASURED, v16 -> v17 on the same corpus, the featurizer the only variable:**

```
3.3.1:validation-error-silent   0.876 -> 0.950   +0.074   <- the head `kind` was added for
4.1.3:form-activation-silent    0.874 -> 0.882   +0.008
1.1.1:filename-alt              0.938 -> 0.950   +0.012
all 15 others                          unchanged, none down
```

The targeted head gained 7.4 points of recall and its threshold fell from 0.851 to 0.448 — a cleaner
signal it can lean on earlier. The two neighbours moved because every head reads the same shared vector.
`calibrationBlockers: 0`, `releaseEligible: true`.

**And the same report confirms the focusOrder analysis outright:**

```
2.1.1:control-unreachable-by-keyboard   recall 0.000
2.1.2:focus-trapped                     recall 0.000
2.4.3:focus-order-scrambled             recall 0.000
2.4.1:skip-link-inert                   recall 0.077
2.4.2:route-title-stale                 recall 0.286
```

**The model detects none of them.** It cannot see the tab ring — no evidence unit encodes `focusOrder` and
no feature reads it — so a head asked to find a focus defect has nothing to find it with. Every head in
this report with poor recall is `decidedBy: "rules"`, and every model-alone head is strong
(`1.3.1:unassociated-table` 1.000, `3.3.1` 0.950, `4.1.3` 0.882). That is the layer split working exactly
as ADR 0021 designed it, and the strongest argument yet that those heads' free vetoes were never the
problem worth solving.

**`baselineQuiet` is the same defect, still open.** `capture-core` attaches it to every `formChanges`
entry beside `kind`, with the same argument — *"a consumer deciding what this activation proves needs to
know whether the measurement was sound. Carried on the evidence rather than left in a log, because a log
nothing reads is a comment."* `kind` is now read (schema v17). `baselineQuiet` still is not, by anything.

It means the speech baseline was not settled when the delta was taken, so `after` is untrustworthy **in
either direction** — and `validation_error_missing` reads an empty `after` as "nothing was announced",
which is the fixed-sleep defect exactly: *"a fixed wait expired early, the probe timed out, and the miss
was recorded as 'the page announced nothing' — precisely the signature of a non-conformant disclosure."*

**MEASURED 2026-09-01, and the answer is DO NOT BUILD IT.** `lab:job -e job=observation-ambiguity`, on
the authoritative corpus:

```
1719 formChanges entr(ies): 1117 settled  65.0%   0 NOISY  0.0%   602 unstated  35.0%
```

**`baselineQuiet` has never once read `false`.** A feature conditioned on it would gate on a value that
occurs zero times in 1,117 stated observations — dead code, not a safeguard. That closes the item in the
opposite direction to the one the plan assumed, which is what taking the measurement was for.

**The instrument was checked before the result was believed**, because a field that has never taken its
other value is indistinguishable from one that CANNOT. `waitForSpeechQuiet` genuinely returns
`{quiet:false}` on budget exhaustion and the caller writes `BASELINE-NOT-QUIET` to `sweepLog`, so the path
exists and is reachable. The zero is a real result: at `BASELINE_QUIET_BUDGET_MS = 20_000` the baseline
settles every time. That budget was raised once already *"because it was too short for a browser recycle
AND nothing could say so"* — this is that fix, measured.

**And the measurement immediately exposed the next one, which the corpus could not answer.** "Settles
comfortably" and "settles at 19.9 s of 20" both print `true`. The verdict is now a constant and carries no
information; the MARGIN is what distinguishes a robust wait from one record from the cliff — the shape
`choose_threshold` already cost this repo, where three heads sit at the top of the grid and one negative
crossing leaves them no valid cut. `baselineWaitedMs` is now recorded on the entry and the audit reports
p50/p95/max against the budget. It rides the same bundled protocol bump as the frame sweep and the dialog
probe, so it costs no recapture of its own.

Until captures carry it the audit prints `waited: NOT RECORDED on any entry -- so headroom is unknown, not
comfortable`, which is the rule this whole section is about applied to its own report.

**`unstated` is counted apart from `notQuiet` and never folded in**, and there is a test that fails if it
is. A capture taken before the field existed has not said its baseline was noisy — reading that absence as
`false` would commit this section's own subject inside the audit that reports it.

**READ THE 96% WITH §2's SECOND CORRECTION.** The "50 of 52 vetoes" above is a fact about the 18 HEADS.
Only 9 of those vetoes are on subtypes the model actually decides, and only 4 of those are closable — the
rest are on `decidedBy: "rules"` subtypes and cannot reach a report. The observation ambiguity this section
documents is real and measured; its consequence for the shipped product is four vetoes on two heads.

**The fix, and what it rests on.** The three focus subtypes ran NO form probe at all — 0 of 28 cases —
which is the whole reason all 8 of their vetoes are probe-gated. They now do, with
`probeOrder: "focus-first"` so the tab ring is walked before the sweep activates anything. Bounded to
**56 captures of 2,924**: `probeOrder` is forwarded under the omit-when-absent rule, so 1,434 non-focus
cases serialise byte-identically and no case is added, so nothing is re-bucketed.

`probeOrder` had to be plumbed first. `capture-core.mjs` and `server.mjs` have accepted it since the
determinism work and **no case could ever ask for it**, because the host runner enumerates its options by
name while the manifest hop forwards `probe*` by prefix. `probe-chain.test.ts` could not see that,
because it derives its flag list FROM THE CASES — so an option no case uses is never checked, and
therefore no case can start using it. It now also runs from the worker's boundary inward, and that
inversion found a second unreachable option (`probeElementsList`) unprompted.

**MEASURED 2026-08-30, 27 of 28 cases recaptured** (one transient `NVDA is not running`, retryable).
Read from `focus-order-tabindex.bad`:

```
probeOrder mark   {"order":"focus,sweep","requested":"focus-first"}   <- plumbing works end to end
focusOrder        14 stops                                            <- the ring SURVIVED activation
formProbe mark    {"activated":0}                                     <- the probe RAN
formChanges       0     stateChanges 0     postSubmitFields 0
```

**`activated: 0` is the result, and it is not a failure.** These pages carry inputs and links and no
submit control, so there was nothing to activate — a real user tabbing this form would find the same. What
changed is the MEANING of the zero: it was "nobody asked" and it is now "we asked and the page had
nothing". Those were indistinguishable before, `observationAmbiguity` counts these captures as asked, and
that distinction is the whole of §11.

It also proves the ordering claim the gate could not: focus-first leaves `focusOrder` intact **with** the
form probe running, which is what `gate:probe-order` structurally could not answer because it captures
with `probeForms: false`.

**What it does NOT buy, stated plainly: the free vetoes.** All three of these subtypes are
`decidedBy: "rules"`, so their vetoes never reach a report — see §2's second correction. Filling those
channels would need the pages to grow an activatable control, and that work is not worth doing for a head
whose output the product does not use.

**`gate:probe-order` had never run once through its documented route.** Dispatched as a lab job it died
`sh: 1: ansible-playbook: not found`, exit 127 — the gate dispatches to the control plane by default, and
a `lab-job.yml` entry IS the control plane's dispatch, so it called itself. Three jobs were wired that
way. Its first real run:

```
SAME   form-unlabelled/good                     SAME   keyboard-trap-modal-cycle/good
SAME   image-missing-alt-behind-consent/good    SAME   https://tfl.gov.uk/modes/tube/
PAGE-MOVED  https://www.nls.uk/join/   interaction.focusOrder: 10 -> 150
INCONCLUSIVE — only 4 of 5 examined
```

Focus-first is **evidence-neutral on every corpus page**. The one exception is a live site whose search
panel opens under its own probes, which is D7 and not an ordering fault. Note what it does NOT establish:
the gate captures with `probeForms: false`, so it shows the ORDER is neutral, not that activation leaves
the ring intact. That is what `--pipeline=verify --only=` on the seven cases answers.

**CLOSED — the page earned the documented exception, which was one of the two options this paragraph
offered.** It used to end *"it is not fixed here"*, and it is: `nls.uk` carries
`movesUnderItsOwnProbes: "its search panel opens when a control is activated; focusOrder 10 -> 150"`, and
`classifyMovers` splits the verdict three ways instead of one. The gate reads **PASS — all 4 of 4**.

Three states rather than two, and that is the whole of it: `undeclared` is a page that moved and nobody
said it would — a real finding about probe order; `expected` is a declared mover, excluded from coverage
because a page that rewrites itself cannot answer a question about the ORDER probes ran in; `stale` is a
declaration on a page that has stopped moving, which must be reported rather than quietly honoured, or the
exception list becomes a place findings go to die.

That last state is the one worth having. An exception nobody re-checks is indistinguishable from a bug
somebody decided to live with, and this repo has the `MAX_TAB_STOPS` exclusion — *"the reason written down
is stale; the exclusion may still be correct, but not for that reason"* — as the worked example.

**Correction to §2 while here.** This is NOT the fix for `state_unchanged`'s free veto, which an earlier
draft of the plan claimed. Splitting it into observed-columns leaves the focus positives reading `0` on
the new column too, so the veto simply moves — exactly as `landmark_present`'s moved onto
`heading_present` at the next retrain. A free veto is closed by the CORPUS, and ADR 0015 says so.

**MEASURED 2026-09-03 — the evidence §14 said would separate a decision from a guess now exists.**

§14 declined to give the model observation metadata and named what would reopen it: *"`capture:explain`
now names every such channel per capture, so the evidence for that would be in hand rather than
inferred."* Run over the authoritative corpus (`job=observation-ambiguity`):

| channel | empty | of which NEVER ASKED |
|---|---|---|
| `formChanges` | 5,148 | **3,177 — 61.7%** |
| `postSubmitFields` | 5,862 | **3,289 — 56.1%** |
| `formControl` sweep | 2,865 | **1,872 "cannot say" — 65.3%**, against 950 (33.2%) where the page genuinely has none |

**So the majority of these zeros are artefacts, not page facts** — which is what §11 asserted and nobody
had counted. It does not by itself overturn §14: that decision rests on the SHORTCUT risk (a feature
correlated with capture conditions is ADR 0015's whole subject), and a number showing the problem is real
is not a design that avoids creating a worse one. What it removes is the option of leaving the question
open on the grounds that the size was unknown.

**Two findings the report surfaced that nothing was looking for.**

- **`baselineQuiet` is UNSTATED on 602 of 1,851 `formChanges` entries (32.5%)** — captures taken before
  the field existed. The report is explicit that this is not the same as NOISY, and that *"reading absence
  as false is the defect this whole report is about"*. Zero are actually noisy, which is the good news;
  a third simply predate the guarantee.
- **A PAIR WAS SPLIT BY THE INSTRUMENT.** 4 of 6,975 captures failed to park the pointer, and one of them
  — `icon-button-unnamed.good` — was measured differently from its mate. CLAUDE.md is unambiguous that a
  pair differing for a reason unrelated to accessibility is *"the one defect this project cannot
  tolerate"*, and the report notes the sharpest part: Ctrl over an image is Edge's MAGNIFIER overlay, so a
  split on an `image-*` case is precisely where the remedy mattered most.

  **Retaking it does NOT fix it.** Tried 2026-09-03: both halves recaptured with `--no-cache` on the same
  worker, 0 failed, and the audit re-run against the fresh captures reports the identical split. So the
  park fails REPRODUCIBLY on that page rather than flaking — the more useful answer, because the remedy is
  to find what defeats `parkPointer` there rather than to capture it again.

  **And the near-miss is worth more than the finding.** The first re-run of the audit appeared to confirm
  the split, and the log it was read from was stamped four minutes BEFORE the recapture — a stale artefact
  read as current, which is the mistake this repo has recorded six times. It was caught by comparing that
  log's timestamp against the recapture's, not by noticing anything wrong with the numbers, which looked
  exactly right.

## 15a. CLOSED 2026-09-01 01:16 (`dffb47c`) — shares a number with §15 above (an unrelated finding, not a supersession). The capture can now ask whether a dialog can be LEFT, and the answer moved a rule

Capture-protocol 11 bundles three additions: `structure.frames`, `interaction.dialogEscape` and
`formChanges[].baselineWaitedMs`. Bundling is the point rather than an economy on it — each is individually
too small to justify ~8 h of fleet time (measured 2026-09-02; the ~4.5 h this said before was an
estimate nobody had checked against the 7 h 22 m protocol-8 run) and this register says so about the
frame sweep outright.

**The dialog probe's first finding is against this project's own shipped rule.** `addKeyboardTrap` ended
with a paragraph claiming a safety net it did not have: *"`anchorToTop` presses Escape before the walk, so
a ring that survives to be measured here has ALREADY outlived an Escape."* That Escape is pressed in browse
mode with focus on the body, and a real dialog scopes its handler to itself, so it never fires. The
false-positive class the paragraph assumed away is real: **any modal that closes on Escape and holds no
operable control in its ring.** The rule accused exactly such a page the moment one existed.

An observed release now silences it, on both paths. **Absence is not a release** — a capture that never ran
the probe cannot say, and reading that silence as conformance is the opposite error.

**Proved not deaf, exactly rather than statistically.** Re-run over 2,150 focus captures with and without
the observation, the guard silenced **exactly one**: the conformant page it was built for. Confirmed on the
authoritative corpus — `rules:gate` PASS 14 of 14 over 2,502 records, `rules:real-pages` PASS 86 of 86.

**Three captures, each correcting the one before, and none of it was reasoning.**

| what the capture said | what was actually wrong |
|---|---|
| good and bad byte-identical, Escape recorded on the DOCUMENT | the probe sat after the sweep, and a sweep is browse mode — it never moves DOM focus, so the `focusin` guard never engaged |
| the conformant ring walked the whole page, the failing one cycled 4 fields | a document-level Escape handler let `anchorToTop` release the trap, so the pair differed by RING SHAPE — the confound three withdrawn rules died of |
| scoped handler, identical rings, still no reaction | **NVDA consumes the first Escape** to leave focus mode; the probe presses twice |

`keyboard-trap-modal-escape` is the sibling of `keyboard-trap-modal-cycle`, which structurally cannot
express this — it conforms via a Close BUTTON, correctly, so neither of its pages handles Escape at all.
`MODAL_TRAP_TOTAL_FORM` was withdrawn 2026-08-28 with a note saying the page *"will be needed the moment a
probe can ask whether Escape releases focus"*. This is that moment.

**Still open, and honestly so:** the frame sweep has run and correctly found none, on pages that have none.
That is not proof it works — it is the `canary that cannot express the fault` rule pointed at my own new
channel. It needs a page with a named and an unnamed iframe before anything may rest on it.

## 16. FOUND AND CLOSED 2026-09-01 — the gate that guards the cache was comparing by COUNT

`evidence:check` decides whether a capture change is evidence-neutral, which is whether 2,122 cached
captures may be kept. `normalise` is `String(entry)` — `"[object Object]"` for every object — so mapping it
over a list of objects made every entry identical.

**Measured on the real function: a `formChanges` entry whose `after` went from `"Error: name is required"`
to `""` reported SAME.** Exactly two compared fields hold objects, `interaction.formChanges` and
`interaction.stateChanges`, and they are the evidence for 3.3.1, 4.1.2 and 4.1.3 — including the head that
gained 7.4 points of recall in v17 by reading `formChanges[].kind`.

It is the same defect the object branch was written to fix, one shape along: that branch was added for
`routeChange`, a bare object, and objects INSIDE an array went on reading as a count. Its own comment states
the principle — *"comparing nothing while appearing to compare something is worse than the omission it
fixes"*. `gate:stability` had it too, on `stateChanges`, surviving the fix its own `formChanges` comment
describes.

**Found because `evidence-fields.test.ts` fired on the new protocol-11 fields**, which it could only do
because a capture carrying them existed. The guard that discovers fields from disk rather than from anyone's
memory is what turned a routine addition into finding this.

## 17. MEASURED 2026-09-01 — the arrow-key gap is real, and building the PROBE first would be the wrong order

*"What It Cannot Hear"* item 2 says arrow-key widgets *"already cost accuracy"* — 2.1.1 abstains via
`SHARES_ONE_TAB_STOP` because a capture cannot tell *reachable by arrows* from *unreachable* — and
prescribes routing in `moveToNextRadioButton` / `moveToNextComboBox`. The claim is TRUE and the prescribed
first step is wrong, which one measurement settles:

| | arrow-key widget occurrences |
|---|---|
| the synthetic corpus, **4,926** captures | **0** — not one radio button, tab, menu item, tree item, option or grid cell |
| real pages, 26 captures | **13 radio buttons across 2 pages**, both W3C's own WAI tutorials |

**`SHARES_ONE_TAB_STOP` has never fired on the corpus.** The abstention it names costs nothing there and
everything on real sites — ADR 0019's thesis for the fifth time, and the sharpest instance yet, because
this is not a thin feature but a *completely absent* one.

**So the first step is a CORPUS CASE, not a probe.** A probe built now would produce evidence that nothing
could validate: `check-signals` would have no positive to fire on, `rules:gate` no record to score, and the
whole thing would ship exercised only by the real pages it was written from. That is *"a gate that does not
exercise what ships is not a gate"*, arrived at from the other end — not a gate reading the wrong corpus,
but a corpus with nothing in it to read.

A radio-group case is cheap and rides any bundled recapture. The probe is worth building the moment there
is something for it to be wrong about.

**ITEM 6 (typing feedback) MEASURES THE SAME WAY, and the two should be planned together.** Handlers
across all 3,948 generated pages:

```
onclick    1407 pages   707 cases        onkeydown    31 pages   31 cases   (Tab and Escape, not typing)
onsubmit    346 pages   173 cases        onchange     14 pages    7 cases
oninput       0 pages    0 cases   <-- live validation while typing does not exist in this corpus
```

So *"route in `press` into a focused edit, diff the log"* would build a probe with nothing to observe. The
first step is a page that validates on `input`, exactly as item 2's first step is a page with a radio
group. **Neither probe can be shipped without its case**, because a case whose signal cannot fire is
reported BLIND and this project's own rule is to remove it rather than leave it — `keyboard-trap-modal-total`
was withdrawn on precisely that ground.

**The instrument was checked before the zero was believed**, which is now the third time in this section:
a shell loop reported `onsubmit: 0` — a value I already knew to be 346 — because zsh mangled the quoting.
A zero is only a measurement when the same instrument can produce a non-zero.

**`combo box` is a different shape and needs saying separately:** 12 occurrences in the corpus against 9 on
26 real pages. Thin rather than absent — which is what §2 already records about the six combo-box records
behind 138 disclosure ones — so a combobox probe CAN be validated today, and a radio/tab/menu one cannot.

**And the measurement was wrong twice before it was right**, which is the reason it is written down rather
than asserted. The first version read `parseAnnouncement(...)?.role`; the role lives at `.objects[].role`,
so it returned `undefined` for every announcement and reported `0` everywhere — including for `button`,
which occurs 1,569 times. A zero from a reader that can return nothing else is not a measurement. It was
caught by asking whether the instrument could find ANYTHING, which is the only question that separates the
two. Same shape as the landmark-name defect this repo fixed three commits ago: *"a landmark's name is in
`containers`, not `objects`"*.

## 18. MEASURED IN FULL — every cell is a rate, and "politeness is irrelevant" was wrong

**CURRENT §18 — committed 2026-09-01 19:46 (`f0fb925`), the newest of four entries that all claimed this
number.** Superseded, physically below in REVERSE chronological order (18c 19:29, then 18b 18:19, then
18a 04:41 last) — the file's insertion order, not a reading order, which is exactly why the letter is what
to trust. Each keeps its reasoning and refutation intact. See "How the numbers on this page stay findable"
near the top of this file for why the bare number always means the current entry.

Six repeats per condition, one page shape, `training:repeat`:

| trigger | what NVDA says of its own | region | heard |
|---|---|---|---|
| **button**, synchronous update | nothing | `polite` | **6 of 6** |
| **checkbox**, synchronous update | `"checked"` | `polite` | **2 of 6** |
| **checkbox**, synchronous update | `"checked"` | `alert` / `assertive` | **5 of 6** |
| **checkbox**, update deferred 400 ms | `"checked"` | `polite` | **0 of 6** |
| **typing**, six characters | six echoes | `polite` | **0 of N** |

**The behaviour, and every row is consistent with it.** When NVDA has nothing of its own to say the live
region is the only thing in the queue and it is announced every time. When NVDA is already speaking, a
POLITE region — which by definition waits for idle — is usually dropped, while an ASSERTIVE one interrupts
and mostly survives. Deferring the update past the control's own announcement makes it worse, not better.

**"POLITENESS IS IRRELEVANT" WAS WRONG, AND IT WAS WRONG FOR THE REASON THIS FILE KEEPS RECORDING.** That
claim came from a diagnostic pair with ONE capture per variant, where both happened to announce. Measured
properly the difference is 2 of 6 against 5 of 6. **One capture is not a measurement, and I made that
mistake four times on this entry alone** — politeness, then the control, then the settle window, then
politeness again from the other side.

**It is not our timing, and proving that is what the instrumented failed remedy bought.**
`waitPastControlState` fired on 6 of 6 deferred captures, waited a further five seconds each, and marked
`SECOND-WAIT-AFTER-OWN-STATE caught=false` every time. Keeping a change that failed to move the number,
and instrumenting it rather than reverting it, is the only reason that evidence exists: *"it never fires"*
and *"it fires and hears nothing"* are the two readings that separate a tool defect from a screen-reader
behaviour, and without the mark they are the same silence.

### All three of item 3's controls, tested — and what blocks each is different

*"What It Cannot Hear"* item 3 names a live region updated by **a link, a `<select>` or a checkbox**. Each
was tried:

| control | result | what blocks it |
|---|---|---|
| **checkbox** | operable; region heard **2 of 6** | NVDA drops a polite region while it is speaking |
| **`<select>`** | not operated | `SECURITY.md`: the jump-menu idiom sets `location.href` from an `onchange`, so changing a select can NAVIGATE |
| **link** | not operated — `formChanges` empty on 6 of 6 | `SECURITY.md`: *"activating one navigates away"*; `probeNavigation` is separately opt-in for exactly that |

**The link test is worth keeping because it measured the tool, not the screen reader.** The page's link
called `preventDefault` and would have been safe, and the probe still declined it — correctly, because a
probe cannot know that before pressing. Reading `0 of 6` as an NVDA behaviour would have been wrong, and
`formChanges` being empty rather than silent is what says so.

**So item 3 is delivered to the limit the safety policy permits, and the remainder is not a defect in this
tool.** One control is operable and its evidence is bounded by NVDA; the other two are excluded by a
deliberate decision that activating them can leave the page under measurement. Widening to either would be
a `SECURITY.md` change argued on its own, never as a way to make a corpus case pass.

### What follows for the corpus — a conclusion now, not a guess

`filter-status-silent-checkbox` and `validation-live-silent` stay withdrawn. **Not for want of a longer
wait, not because a live region cannot be heard, and not because the pages are wrong** — but because at
2 of 6 (and even at 5 of 6) the evidence is inherently non-deterministic, and a case that appears
intermittently teaches the model noise. `gate:stability` exists to refuse exactly that.

**An `alert`-based variant is NOT the fix**, and the reason is worth stating so nobody tries it: it would
lift the rate to 5 of 6 and still be flaky, and a result count is a `status`, not an `alert`. Choosing the
role that captures better rather than the role the content warrants is fitting the page to the tool.

### What follows for the PRODUCT, which is the more valuable half

**A status message fired by a control that announces its own state reaches an NVDA user roughly one time in
three.** No static analyser can see that: the markup is correct, the region is correct, `aria-live` is
correct, and the message is genuinely there. It is precisely the class of failure ADR 0019 says the corpus
cannot express and only a real screen reader can reach — found, in the end, by building two cases that
ought to have worked.

Two consequences: it bounds what 4.1.3 can claim and belongs in `docs/known-gaps.md`; and **using
`aria-live="polite"` on a message triggered by a checkbox or radio is advice this project can now give with
a number attached.**

**What is NOT established.** The mechanism inside NVDA — six captures per condition shows a direction, not
a queue policy. All of it is one page shape on one NVDA and one guidepup, both pinned in the cache key.

### The earlier entries, kept because each reasoning was sound and each premise was not

## 18c. CHARACTERISED 2026-09-01 19:29 (`98e2e99`) — SUPERSEDED by §18 above. NVDA drops a live region when it is already speaking, and the more it has to say the more reliably

Four measurements, and one explanation fits all of them:

| trigger | what NVDA says of its OWN | region announced |
|---|---|---|
| button, synchronous update | nothing | **reliable** — `filter-status-silent` has always discriminated |
| checkbox, synchronous update | `"checked"` | **2 of 6** |
| checkbox, update deferred 400 ms | `"checked"` | **0 of 6** |
| typing, six characters | six echoes | **0 of N** |

**A button announces nothing of its own, so the live region is the only thing NVDA has to say and it says
it every time.** Give NVDA something of its own and the region starts to disappear; give it more and the
region disappears entirely. That is a fact about the screen reader, not about this tool.

**IT IS NOT OUR TIMING, AND THAT IS THE PART THAT NEEDED PROVING.** `waitPastControlState` waits a second
time whenever everything heard is the control's own state. On the deferred page it fired on **6 of 6**
captures, waited a further five seconds each time, and its own mark reads:

```
toggle SECOND-WAIT-AFTER-OWN-STATE caught=false     x6
```

**The remedy that "did not work" is what produced this finding.** Keeping it and instrumenting it — rather
than reverting a change that failed to move the number — is the only reason `caught=false` exists to be
read. "It never fires" and "it fires and hears nothing" are the two readings that separate a tool defect
from a screen-reader behaviour, and without the mark they are the same silence.

**Three earlier headlines on this entry were wrong**, each disproved by measurement rather than argument:

1. *"a polite live region does not announce while NVDA is speaking"* — refuted by a diagnostic pair where
   `polite` and `assertive` both announced
2. *"the control is the cause"* — refuted, a button with the same region is reliable
3. *"the settle window loses a race"* — built, deployed, re-measured, 2 of 6 before and 2 of 6 after

**What this means for the corpus, and it is now a justified conclusion rather than a guess.**
`filter-status-silent-checkbox` and `validation-live-silent` stay withdrawn because their evidence is
**inherently** unstable — not because a live region cannot be heard, and not for want of a longer wait. A
case whose evidence appears 2 times in 6 is a training record that teaches the model noise.

**And it is a real accessibility finding, which is what this tool exists to produce.** A status message
fired by a control that announces its own state is conveyed to an NVDA user unreliably. No static
analyser can see that — the markup is correct, the region is correct, `aria-live` is correct. It is
exactly the class of failure ADR 0019 says the corpus cannot express and only a real screen reader can
reach. It belongs in `docs/known-gaps.md` as a limit on what 4.1.3 can claim, and it is worth reporting
upstream.

**What is NOT established**, so nobody quotes it as if it were: the mechanism inside NVDA. Six captures per
condition is enough to show the direction and nowhere near enough to characterise a queue policy. The
numbers above are rates on one page shape, on one NVDA version, pinned by `guidepupVersion` in the cache
key.

### The earlier entries, kept because the reasoning was sound and the premise was not

## 18b. A LIVE REGION REACHES THE DELTA 2 TIMES IN 6 — measured 2026-09-01 18:19 (`39954a0`), SUPERSEDED by §18 above — and both earlier headlines were wrong

> **THIS SECTION HAS BEEN WRONG TWICE, AND THE CORRECTION IS THE POINT.** It first said a polite live
> region does not announce while NVDA is speaking. A diagnostic pair refuted that outright: same checkbox,
> one `polite` region and one `assertive`, and **both announced**. It then said the fault was the capture's
> settle window losing a race. That was refuted too — the fix was built, deployed and re-measured, and the
> rate did not move.
>
> **What is true is a RATE, and nothing below it should be read as a mechanism.** Six repeats of one
> unchanged page, `training:repeat`:
>
> ```
> 4 x "checked"            <- the checkbox's own state, and nothing from the page
> 2 x "Showing 2 bags."    <- the live region
> ```
>
> `gate:stability` names it exactly: `VARIES formChanges counts 1,1,1,1,1,1`. **The count never moves,
> only the content** — the rot a count-based check structurally cannot see, which is why this took three
> attempts to state correctly.
>
> **Every wrong turn today came from concluding off ONE capture.** Three readings of one case, all single
> captures, all different: `"checked"` on both variants; then good `"Showing 2 bags."` and bad `"checked"`;
> then `"checked"` on both again. Each looked like a finding, and two of them became withdrawals. This
> project already knows better — `gate:stability` repeats a page and `identity:rate` prints a 95% upper
> bound rather than a zero — and **a withdrawal is a conclusion like any other.**
>
> **The remedy that did not work is kept and instrumented**, which is the only reason the next person can
> tell the two apart. `waitPastControlState` waits again whenever everything heard is the control's own
> state, on sound reasoning, and writes `SECOND-WAIT-AFTER-OWN-STATE caught=…` to `sweepLog` either way.
> "It never fires" and "it fires and finds nothing" need opposite work, and three inert remedies have
> shipped here for want of that distinction.
>
> **What IS fixed and is independent:** `pageResponseTo` separates a toggle's own state from the page's
> answer, so `formActivationIsSilent` — a silence test written for buttons, where an empty delta means the
> page said nothing — can fire on a control that always says "checked". That was a real defect and the
> earlier withdrawal blamed the live region for it.
>
> **What is still open is the intermittency itself**, and it is the one thing nobody has explained: why
> NVDA voices a `polite` region after some checkbox toggles and not others. Items 3 and 6 wait on that, and
> `filter-status-silent-checkbox` and `validation-live-silent` stay withdrawn — not because a live region
> cannot be heard, but because the evidence is not yet stable enough to train on.

### The original entry, kept because the reasoning was sound and the premise was not

## 18a. A POLITE LIVE REGION DOES NOT ANNOUNCE WHILE NVDA IS SPEAKING — found 2026-09-01 04:41 (`12ca1a7`), SUPERSEDED by §18 above — found by two cases that should have worked

Measured 2026-09-01, twice, by two unrelated mechanisms:

| case | what activated | live region | `announced` |
|---|---|---|---|
| `filter-status-silent-checkbox` | a checkbox toggle | `role=status aria-live=polite` | **empty on both variants** |
| `validation-live-silent` | six typed characters | `role=status aria-live=polite` | **empty on both variants** |

Both were withdrawn — the first BLIND, the second CONTAMINATED — and both probes are verified working: the
toggle records `{kind: "toggle", after: "checked"}` and the typing records
`{typed: true, echoed: "1 2 3 4 5 6"}`. The activation happens; the page's response is not heard.

**Not a race.** The second waits through `waitForAnnouncement`, which waits for speech and then for it to
settle. The common factor is that NVDA had something else to say at the moment the region updated — the
control's own state in one case, the character echo in the other.

**The hypothesis, recorded as a hypothesis.** `aria-live="polite"` means *speak when idle*, and neither
moment is idle. Switching a case to `assertive` would make it pass and would be fitting the page to the
tool, which is how a corpus stops describing the web.

**What it costs: 4.1.3 entirely, and the live half of 3.3.1.** Both criteria depend on hearing a live
region. Every existing 4.1.3 record uses a BUTTON, which announces nothing of its own — so the corpus has
only ever exercised the one case where the region has silence to speak into.

**The measurement that settles it, and nobody has taken it:** does a polite region EVER announce in a
capture, and does an assertive one? One page, two variants, one capture run. Until then this is a
capability gap of the same kind as the seven in *"What It Cannot Hear"* — found, as three of those were,
by building something that ought to have worked.

**And `reportDynamicContentChanges` is a candidate route.** NVDA has a command for exactly this and
guidepup exposes it; nothing here has ever called it.

## 19. ITEM 7's BLOCKER IS WRONG — guidepup does expose a route to 3.1.2

*"What It Cannot Hear"* item 7 says language changes need *"synth-level observation, not a keystroke —
there is no guidepup command for it"*, and rates it the hardest of the seven. The premise is false, and
checking it took one command against `NVDAKeyCodeCommands`:

```
reportTextFormatting          NVDA+F — and NVDA's formatting report INCLUDES LANGUAGE
reportTextFormattingInReview  the same, at the review cursor
selectSynthesizer, moveToNextSynthSetting, ...   the synth itself is reachable too
```

**NVDA's Document Formatting settings carry a "Report language" option**, and with it on, NVDA+F answers
*what language is the cursor in* — which is not the same question as *did the voice change*, and is a
checkable proxy for it. 3.1.2 fails when a passage of another language carries no `lang`; a formatting
report that says the document language everywhere is exactly that failure, observable as text.

**Two cautions before anyone builds it.** The setting is not a default, and CLAUDE.md's rule is *"record
them; do not tune them — NVDA's defaults are what a real user experiences"*. That rule is about the
READING experience, and NVDA+F is an explicit thing a user does; but the decision belongs in the open
rather than inside a probe. And guidepup 0.30+ has `getSetting('section.key')`, so whether the option is
on can be RECORDED per capture rather than assumed — which is what makes the difference between evidence
and a guess about the guest's configuration.

**MEASURED ON THE FLEET, and it sharpens the item rather than closing it.** `/diagnostics` returns NVDA's
config: **396 characters, no sections at all**, so every setting is at NVDA's default and `reportLanguage`
carries no override. That is the fact; the citation that follows it is NVDA's documented default for
Report Language, which is **off**.

So the shape of item 7 is now precise, and it is not the shape the entry describes:

| | |
|---|---|
| **at NVDA's defaults** | automatic language switching changes the VOICE and emits no text. A voice change is exactly what this pipeline cannot capture — it reads the speech stream, not the synthesiser |
| **with Report Language ON** | NVDA speaks the language, and it lands in the transcript like anything else |

**So item 7 is not blocked on a missing command. It is blocked on a PROJECT RULE**, and that is a much more
useful thing to know: *"record them; do not tune them — NVDA's defaults are what a real user experiences,
so configuring away from them makes the evidence less representative."*

That rule is right and this is the case that tests its edge. Turning Report Language on would make 3.1.2
observable and would make every capture describe a user who has changed a setting most users have not. The
honest options are to capture 3.1.2 under a declared non-default profile and say so in the evidence, or to
accept that this criterion is out of reach at defaults and record it as such in `criterion-coverage.ts`.
**That is a product decision, not an engineering one**, which is why it is written here rather than settled
in a commit.

**What is still worth measuring first:** whether `getSetting('documentFormatting.reportLanguage')` reads
back what this section assumes, and whether NVDA with it ON actually speaks a language change in a capture.
Both are one capture on a free fleet, and neither should be assumed — this section has already had to
correct the claim it was built on once.

**MEASURED 2026-09-02, and it removes one of the two options this entry offers.**

The entry proposes recording whether Report Language is on, per capture, via
`getSetting('documentFormatting.reportLanguage')` — *"which is what makes the difference between evidence
and a guess about the guest's configuration."* Read off a live worker, `screenReaderSettings` carries these
sections and no others:

```
addonStore  braille  development  general  math  remote  schemaVersion
screenCurtain  speech  speechViewer  update  uwpOcr  virtualBuffers  vision
```

**`documentFormatting` is not among them.** NVDA materialises only what has been WRITTEN, so a setting at
its default has no key to read — which is the same fact this entry already found from the other side (*"396
characters, no sections at all"*), now confirmed through the API rather than the file.

So the recording route does not work as the entry assumes: **you cannot read whether Report Language is on
without having turned it on.** The absence is indistinguishable from off, and it is the ordinary state of
every guest. That does not change the product decision — it removes the reassurance that the decision could
be made safe by recording it afterwards.

The second measurement the entry asks for — whether NVDA with the option ON actually speaks a language
change — is untouched, because taking it means turning the option on, which is the decision itself.

## 20. CLOSED 2026-09-01 — the capture was transient; what was broken is that NOTHING REFUSED IT

**CURRENT §20 — committed 2026-09-01 18:53 (`bba5fd1`).** §20a below (13:25 the same day, nested under
"The original entry") is the pre-closure investigation this entry closed — kept for the reasoning, not as
a competing answer.

The pathological capture was never a page defect. A fresh `--no-cache` capture of the same page was clean
in 22 s with `graphics 1/1` and `observed.graphics.complete: true`; the "reproduction" that sent three
hypotheses down the wrong road was `capture-only` serving the CACHE, now fixed.

**So the open question was never "why was that capture bad" — transient faults happen and
`/health.vitals.recoveries` exists to count them. It was "why did the pipeline accept it".**

`captureIsSelfConsistent` is the check that should have refused it, and it asks about HEADINGS only:
*"the read-through announced a heading but the heading sweep found none"*. `headings-none-refunds` is a
**no-headings case by construction**, so the check was vacuous on the one page where it was needed.

What the capture actually held:

```
readThrough  330 s / 12 lines (maxSteps)     against ~20 s / 30 for the same base page
links        swept 0, census 6               observed.complete false, stop {prev,next} silent
graphics     swept 0, census 1               likewise — the tree even named it, "DSC_0421.jpg"
```

**The census cross-check already existed and nothing rejected on it.** `crossCheckStructure` has computed
that comparison into a diagnostic every run — the same shape as the 604 unread `sweepLog` crashes, one
check along.

The rule now also refuses a sweep that went SILENT on a page the tree says is populated, and **all four
conditions are required** because each rules out a legitimate shape:

| | |
|---|---|
| census > 0 | the tree says it is there, so "the page has none" is excluded |
| sweep found 0 | a total absence, not a shortfall |
| `complete: false` | not the documented residual gap between quick-nav and the tree |
| `stop` silent both ways | NVDA answered nothing, rather than "no next link" — its own terminus |

That last pair is the whole discipline of `observed`: **`exhausted` is the screen reader's own answer and
`silent` is an inference we refuse to trust.**

**It does not reject evidence whose absence is the finding**, which is this project's oldest rule. An
unnamed control, a missing alt, a page with no headings — in every one the CENSUS is 0 too, so the first
condition excludes them. Verified rather than argued: run over **2,164 captures on disk it rejects 0**,
and the pathological signature is pinned in `silent-sweep.test.ts` alongside each legitimate shape it must
still accept. Mutation-checked.

### The original entry

DEMOTED to a subsection 2026-09-03, and the demotion is the point. It was left as a sibling `##` heading
still ending `— OPEN`, so this file asserted both OPEN and CLOSED about §20 for two days and the backlog
carried a row for work that was finished. "The original entry" above it did not demote it — a `###` line
does not make the `##` that follows a child.

That is the same defect this file's own header names ("closed" spelled fourteen ways) arriving one level
in: a closure recorded as a NEW section beside the old one rather than over it. `backlog.test.ts` now
refuses a record that carries an OPEN and a CLOSED heading under one number, because a marker a human has
to remember to change is a marker that does not get changed.

#### 20a. ONE PAGE CAPTURES PATHOLOGICALLY, and `grants-audit` is what caught it

Committed 2026-09-01 13:25 (`9f4f71d`), before §20 above closed it — the same numeral was reused here even
after the demotion this section's own header describes, which is the residual instance of that defect this
audit found rather than the one it already knew about.

The protocol-13 corpus run captured **1,481 of 1,481 cases with 0 failures** and then STOPPED at
`grants-audit`, which is the pipeline working: *"a label for a defect nothing captured teaches the head to
predict it from something else."*

**One record of 2,667.** `headings-none-refunds+also-filename-alt` is labelled with the `filename-alt`
accompanying defect, which declares it grants `filename_graphic_present`, and its capture carries no
graphic. 35 of the other 36 `filename-alt` records carry it.

**The page is CORRECT and the capture is not**, which is the distinction `observed` exists to make:

```
structureCensus  graphic 1   names include "DSC_0421.jpg"     <- the tree sees it, by name
domCensus        graphic 1                                     <- the DOM sees it
graphics swept   []
observed.graphics {asked: true, complete: false, stop: {prev: "silent", next: "silent"}}
```

Without `observed` this reads as *"the page has no image"* and sends you to fix the corpus. It says
instead that the sweep asked, twice, and NVDA answered nothing.

**Reproduced, and it is the whole capture rather than one channel.** Recaptured on a free fleet at the
same commit and it came back identical:

| | read-through | stop | links | graphics |
|---|---|---|---|---|
| `headings-none-refunds` | **22 s / 30 lines** | `repeatBottom` | 6/6 | 0/0 |
| `…+also-filename-alt` | **330 s / 12 lines** | `maxSteps` | **0/6** | **0/1** |
| `…+also-generic-alt-fake-heading` | 19 s / 21 lines | — | 0/0 | **1/1** |
| `…+also-silent-toggle-inert` | 21 s / 25 lines | — | 6/6 | 0/0 |

27 seconds per read step, against about one second on every sibling. Every sweep silent except `lists`,
which completed normally — so it is not a dead speech channel.

**Three hypotheses ruled out by measurement, so nobody re-runs them:**

- **Not the pointer.** `pointerParked {x: 0, y: 0, attempts: 1}` — parked cleanly, first try, nowhere near
  the image. The Ctrl-over-an-image magnifier that `pointer.mjs` exists for is not this.
- **Not "an image on a heading-less page".** `+also-generic-alt-fake-heading` carries an image on the same
  base page and captures in 19 s **with its graphic found**.
- **Not a missing file.** Both images 404 — `/DSC_0421.jpg` and `/summary-panel.png` are equally absent
  from the page server, and only one page is pathological.

**What is left, and it is unverified:** the two differ in their ALT TEXT — `alt="DSC_0421.jpg"` against
`alt="graphic"`. A filename alt is the one NVDA might spell character by character, and this pipeline has
already seen NVDA spell a field name out (`"T, o, w, n"`). That would not obviously cost 27 s a step, so
it is a lead rather than a diagnosis.

**Why the record must not simply be dropped.** `MAX_SILENT_STEPS` cannot fire here: it needs NVDA to have
been silent at STARTUP as well, and `speechChannel` heard the first line fine. So the read ground through
its whole budget correctly, by a rule that is right in general. Whatever is wrong is upstream of that.

**The chain is left STOPPED rather than forced green.** Making this pass means either fixing the capture or
withdrawing a label, and both need the cause. `retrain` and `export-acceptance` completed; the train and
the thirteen gates after it have not run.

## 21. RESOLVED 2026-09-02 — the chain clears all nine stages; the 2.4.2 veto regression is gone

Four dispatches, each stopping later than the last, and every stop was a real defect. Recorded in order
because the sequence is the useful part:

| stage | what it caught |
|---|---|
| `grants-audit` | one record labelled for a defect its capture did not carry — and `capture-only` had no `--no-cache`, so it "reproduced" the bad capture twice from the cache |
| `applicability-audit` | `1.1.1:missing-alt` required `_has("graphics")`, which its own defect makes invisible |
| `acceptance` | my radio-group case invented the subtype `2.1.1:arrow-keys-inert`, unowned and therefore model-decided |
| `promote` | **`2.4.2:route-title-stale`: 1 → 5 closable vetoes** |

**`retrain`, `export-acceptance`, `grants-audit`, `applicability-audit`, `train`, `shortcuts` and
`acceptance` all pass.** The model trains and the held-out set is clean.

**The veto regression is not mine, and the numbers say so.** Against the tracked baseline:

```
baseline   2.4.2:route-title-stale   positives 14   closable 1   worst validation_error_missing (-2.79)
now        2.4.2:route-title-stale   positives 14   closable 5   worst validation_error_missing (-2.72)
```

Positives unchanged, worst veto the same feature at the same weight, and nothing in this session touched
2.4.2's cases. A free veto needs the feature to be `{0.0}` across the positives AND its weight to reach
−1.0; the first did not change, so the second did. **That is a retrain moving weights on a 14-positive
head**, which is the instability CLAUDE.md already documents for small heads — *"the threshold is set by
the single worst negative, so one record reads as a model regression"*, one layer along.

**THE FIVE, READ AT LAST — and both of my earlier readings of them were wrong.** The audit wrote no
report; making it write one (`runs/scorer-shortcuts.json`) is what finally showed them:

```
validation_error_missing          -2.72   the baseline's only veto — form-probe-gated
filename_graphic_present          -2.59   NEW
generic_graphic_present           -2.15   NEW
unit_is_plain_heading_candidate   -1.92   NEW
plain_heading_candidate_present   -1.78   NEW
```

**Four of the five are GRAPHIC and HEADING features, not form-probe features at all**, so the entire
form-probe argument below was aimed at one veto out of five. `NAV_MARKUP` — the 2.4.2 page body — is a nav
with two links and a view div: no image, no heading-like text. Those four were **always** `0` on all 14
positives; nothing about the corpus changed. Only their WEIGHTS crossed the −1.0 threshold in this retrain.

That is the conclusion the counts supported all along, now with the feature identities to prove it: **a
retrain moving weights on a 14-positive head**, not a regression anything in this session caused.

**THE VETO CANNOT REACH A REPORT, AND THAT IS THE FACT THAT SETTLES THIS.** `rule-ownership.json`:

```
2.4.1:skip-link-inert     decidedBy=rules
2.4.2:route-title-stale   decidedBy=rules
```

§2's own second correction says what follows: *"only 9 of those vetoes are on subtypes the model actually
decides … the rest are on `decidedBy: "rules"` subtypes and **cannot reach a report**."* The head is
trained — §13 decided deliberately that five such heads stay trained despite detecting nothing — and its
finding is discarded before any user sees it. **The free veto is real in the weights and inert in the
product**, and §2's headline (*zero free vetoes can reach a report*) is still true with this regression
standing.

So `promote` is refusing on something that cannot change an answer this tool gives. Two responses are
available and they are not equivalent:

- **Corpus work.** Bounded, and cheaper than the price quoted below: `withAccompanyingDefects` re-rotates
  *"the hosts after it WITHIN THAT SUBTYPE ONLY"*, so adding host pages to 2.4.2 recaptures 2.4.2's family
  — tens of captures, not the 474 that enlarging `ROTATIONS` globally costs. 2.4.2 has 2 hosts × 3 rounds
  = 6 of 12 rotation slots; 4 hosts would cover all 12 and guarantee `filename-alt` and `generic-alt`
  appear. It would also raise a 14-positive head, which §2 calls the underlying constraint.
- **Teaching the gate about `decidedBy`.** Tempting, and the higher-risk change by far — **weakening a
  gate to make it pass is the one move this repo has never survived**. If it is ever made it should be
  argued on its own, not as the tail of a run it happens to unblock.

**Recorded, not chosen.** The first is real work worth doing and needs its own capture-and-retrain cycle;
the second is a design decision about what `promote` is for. What is NOT true is the reason I gave first:
this was never too expensive, and the 474-capture figure belongs to a different change.

**It is also the same shape §2 already priced for `2.4.1:skip-link-inert` — chance in the rotation deal,
not a gap anyone left.** 2.4.2 has six multi-defect cases and they drew `silent-toggle-inert`,
`generic-heading`, `vague-link`, `unnamed-graphic`, `position-only-table` and `bare-edit`. Neither
`filename-alt` nor `generic-alt` is among them, so no positive of this subtype can carry
`filename_graphic_present` or `generic_graphic_present`. §2 records the identical finding one subtype
along, in the same words: *"none contains `vague-link`, so the substitution never fires. That is chance,
not design."*

Furniture cannot close it either, and the reason is worth keeping: `filler()` deliberately withholds
images because *"150 image cases and 141 label cases are defined by exactly what those channels contain"*.
**Protecting 1.1.1 from furniture is why 2.4.2 starves.**

**So the recorded decision applies unchanged**: reaching it means enlarging `ROTATIONS` or adding
multi-defect cases to this subtype, and that table prices itself — going from 5 entries to 11 changed
**all 237 multi-defect cases and invalidated 474 captures**. *"Enlarging an option space necessarily
re-rolls selections from it, and the only honest response is to treat it like a `CAPTURE_PROTOCOL_VERSION`
bump: do it deliberately, bundled, and pay the recapture once."*

This waits for that bundle, exactly as 2.4.1 does. It is the second instance of one shape, which is the
argument for doing both in a single deliberate change rather than either alone.

**The near-miss is still the useful half, and it got worse before it got better.**

**I ALMOST CLASSIFIED THESE AS UNCLOSABLE, AND THE DATA SAYS THEY ARE NOT.** The argument was tidy:
2.4.2 sits in neither unclosable category while the three focus subtypes carry the identical form and
state features under `perturbs-measurement`, and 2.4.2's evidence comes from the one probe that
*"ACTIVATES A LINK and can leave the page under measurement"*. `probeFormSubmit` records
`navigatedOnSubmit` when the URL moves, so a form probe really can destroy a route-change measurement
before `probeRouteChange` runs. It reads as decisive.

One count refutes it:

```
2.4.3:focus-order-scrambled   already classified perturbs-measurement   probeForms on 10 of 10 cases
2.4.2:route-title-stale       the regression                            probeForms on  4 of 14 cases
```

**A subtype that runs the form probe on every case is classified unclosable**, so "the case cannot run
`probeForms`" was never the criterion — the focus pages run it and have nothing to activate, which is what
`formProbe: {activated: 0}` records. And 2.4.2 is the case where that differs: a route-change page can
carry a control that is activated WITHOUT navigating — a disclosure, a non-submitting button — so the
features can be made non-zero without touching the channel the subtype is measured on.

**So the vetoes are closable, the gate is right, and the remedy is the corpus** exactly as ADR 0015 says.
The work is bounded: give some of the 14 route-change pages an activatable, non-navigating control.

Recorded rather than done, because it is a design change to a 14-positive head that needs its own capture
and retrain to verify — and because the near-miss is the more useful half. Reclassifying would have turned
the gate green, removed four items from a work list somebody CAN complete, and looked like progress.
`corpus:unclosable-map` exists so that call is made from data; this is the first time it has caught me
about to make it from a story.

**`unclosable-vetoes` is now fetchable**, because it was not when it mattered: `promote` names only the
worst veto per subtype and the transcript truncates the rest at *"... and 13 more"*. Reading the four
features needed an ssh shell, which `lab-fetch.yml` exists to remove — the `grants-audit` lesson one report
along.

**RESOLVED 2026-09-02, and checked against the artefact rather than remembered.** The chain now
completes all nine stages with `FITNESS: PASS`. The specific regression this entry is about has cleared:

| | when this was written | now |
|---|---|---|
| `2.4.2:route-title-stale` closable vetoes | **5** | **1** (`validation_error_missing`, −2.98) |
| positives | 14 | **25** |

Read from `scorer-shortcuts.baseline.json` at HEAD, not from a run's transcript.

**The cause is probable rather than proven, and the distinction is kept deliberately.** The remedy this
entry prescribed was corpus work — *"give some of the 14 route-change pages an activatable,
non-navigating control"* — and the protocol-14 case additions grew the subtype from 14 positives to 25
while the closable count fell from 5 to 1. That is consistent with the prescription having been satisfied
as a side effect. It is not the same as having verified that those particular pages carry that particular
affordance, and nobody has checked. One closable veto remains, which is the ordinary state for a head
rather than a regression.

**Worth recording about the entry itself:** it was carried on the backlog as "stale — it says the chain
stops at `promote`, and the chain completes", i.e. as doc hygiene worth minutes. That was wrong. It held
a real unresolved defect with a bounded remedy, and the only reason the mischaracterisation cost nothing
is that the defect had independently resolved. **A heading that has stopped being true and an item that
has stopped being open are different things**, and reading the entry rather than its heading is what
separated them.

## Closed since this list was written

**`2.4.4` reading validated here and never-fired on the lab** — it was never a contradiction. The lab's
run was 26 Aug 23:19 and the fix that taught the audit to count eval fixtures landed 27 Aug 10:04,
eleven hours later. Re-run at HEAD, the lab reports `2.4.4 assessed 68 1 validated on real evidence`
and agrees with local.

Establishing that meant comparing a journal timestamp against `git log` by hand, because the journal
carried no code identity at all — so the fix is not the number, it is that the question is now answerable.
`run-job.yml` stamps `<job> at <sha12>[ DIRTY]` into the unit description, systemd opens every journal
with it, and `lab:status` prints `What code produced this run` outright. A journal predating the stamp
says `NOT STATED` rather than going quiet.

Two more found by pulling that thread, both fixed: `promote:model` named its changeset from a COUNT of
`.changeset/`, so one promotion overwrote another's release note — that is what the duplicate above is —
and `lab:fetch` looked for a literal `promote-candidate-4.md` while the lab held `-6`, so the one
artefact that entry exists to rescue was unfetchable.

## How to read the numbers on this page

- **Lab, not local.** Item 2 quotes the lab. My local `runs/` is a partial copy and its audits
  describe the copy: it reported six criteria as "NEVER FIRED ANYWHERE" while the lab reported every one
  of them validated. That is not a bug in either — it is what a stale corpus does — and building this list
  on the local numbers was avoided by an hour, not by design.
- **A count is where an investigation stops.** Where an entry gives one, it also gives what to look at.
- **Nothing here is closed by declaring it.** That was the previous list's job and it is done.

## 22. 2.4.7 ACCUSED 37 CONFORMANT REAL PAGES, and the test that could have caught it argued the other way

**Measured and fixed 2026-09-06.** The first `rules:real-pages` run after the recaptured corpus landed
reported **42 new findings on pages whose publishers declare them conformant**. 37 were one defect.

### What was wrong

2.4.7's F55 predicate treats an ORPHANED focusout — a `focusout` with no matching `focusin` anywhere
before it — as a script strip, unconditionally. Its own comment argued the case, and for a log that begins
before any focus exists the argument is sound: the missing focusin IS the signal, because a script that
blurs on receipt can beat the browser's own `focusin` event.

It is wrong at exactly one place: **the log's first event.** The listener is installed after the page has
loaded, so whatever already holds focus at that instant received it before anything was watching. When it
then leaves — an ordinary Tab — the log opens on a focusout with no focusin, which is byte-for-byte the F55
signature and is nothing of the kind.

### The measurement, taken in both directions BEFORE the fix was written

```
37 of 37 conformant real pages reported for 2.4.7  ->  exactly ONE orphan each, and it was log[0], every time
9 of 9 corpus positives (focus-removed-on-receipt-*) ->  log[0] is a FOCUSIN; orphans at index 2 and 9-23
```

On nhs.uk the next focusin arrives at the SAME millisecond as that opening focusout — a Tab, not a strip.
On `focus-removed-on-receipt-order.bad` the orphan sits at index 2, after a real focusin the listener saw.
The two shapes differ ONLY in whether a focusin precedes them, which is what makes it a discriminator
rather than a threshold.

**Recall paid nothing.** The reason both halves were measured first is the failure that would have cost
more than 37 false positives: *a rule can be clean because it has gone DEAF*, where a real-page number
looks excellent for the worst possible reason. Cutting 37 accusations while silently losing the nine
positives would have looked like a triumph in every report this project produces.

### The part worth keeping

**A test asserted the opposite, having NAMED the mechanism in its own comment.** It read *"a lone focusout
with nothing preceding it at all is still F55 -- it is orphaned by definition"*, and its comment said:

> `anchorToTop`'s own Escape/Ctrl+Home can blur whatever a PRIOR probe left focused, **before this log was
> installed** for `probeFocusOrder` specifically, so the log can legitimately open on a bare focusout with
> no matching focusin in it.

It then called that indistinguishable from a genuine orphan and resolved the ambiguity by assumption. That
is CLAUDE.md's *"a comment that names an ambiguity, above code that resolves it by assumption"* — recorded
there three times over, always about a PROBE, and here for the first time about a TEST. A test written that
way does not merely miss the defect; it defends it, and a later reader finds a passing assertion where the
question was.

The fix is in `rules.ts`'s `focusLossEvidence`; the rewritten test keeps the reversal in its comment rather
than quietly asserting the new answer. Both new shapes are verbatim from real stored logs — nhs.uk and
`focus-removed-on-receipt-order.bad` — because a shape I typed out is a claim about the evidence and not
the evidence.

Safe against truncation in the one direction that matters: `capture-probes.mjs` cuts the log with
`slice(0, FOCUS_EVENT_LOG_DIAGNOSTIC_LIMIT)`, so it drops the TAIL and never the head, and `log[0]` is
always the first event the listener saw. **If that ever becomes a head-drop, the exception becomes unsound
and must go with it** — which is stated at the code, not only here.

### What the remaining 5 were

Read individually against their stored captures, not diffed: four are the documented combo-box case
(`"combo box, collapsed, Sort by: Newest"`, where NVDA announces the VALUE where a name would go), and one
is a real unnamed graphic on ons.gov.uk inside a link with no name of its own. Every one carries
`mapping: "secondary"`, so **ASSERTED-WRONGLY was 0** — the column that matters, and the one that collapsing
with `referred` made meaningless for a day.

## 23. ONE EXEMPTION, SEVEN SITES, SIX FOUND BY RUNNING IT — and the seventh was on the shipping path

**Measured across one night, 2026-09-05/06.** `rule-ownership.json` gained `modelHead: false`, meaning the
RULES decide a subtype outright and no head is ever fitted for it. It is one boolean. Threading it took
seven changes, and only the first was found by design.

| # | site | how it was found |
|---|---|---|
| 1 | `subtypes_by_criterion_for` — remove the subtype so no head is fitted | designed |
| 2 | the trainer's must-be-present declaration check | designed |
| 3 | `ownershipFailures` in `rules:score` | a gate failing |
| 4 | `REAL_SUBTYPES` in `subtype-vocabulary.test.ts` | a test failing |
| 5 | `rules:gate`'s coverage table | a gate failing |
| 6 | the trainer's PER-CRITERION LOOP — `torch.stack([])` | **a train dying after the encoder pass**, having already rotated the previous release-eligible model aside |
| 7 | `score.py`'s `verify_artifact` — `criterion 2.4.7 has no scorer heads` | **held-out acceptance refusing to LOAD the artefact** |

### Why sites 6 and 7 existed at all, and it is not carelessness

A criterion with NO subtypes had been **impossible** until this field existed. Both sites were correct
against every artefact ever produced before it, and both read the newly-possible state as corruption. That
is not a missed call site; it is a new state in a domain, and every consumer that enumerated the old states
had to learn it.

### The one that matters most

**Site 7 is on the path that SHIPS.** A v19 artefact could not be loaded at all — `verify_artifact` is what
the product calls, so this was not "the gate cannot grade it", it was "the model cannot be used". It was
found because a gate ran, not because anyone reviewed the diff. Sites 1-5 are checks; 6 and 7 are the two
that only a real run reaches, and 7 is the only one a USER would have hit.

### What the remedy was, each time, and where it does not generalise

`subtype-vocabulary.test.ts` records the right instinct — **redefine what "real subtype" means once,
rather than exempt at each site** — and that closed sites 1-5. It could not reach 6 or 7, and the reason is
worth having: those are not about VOCABULARY, they are about a LIST BECOMING EMPTY. A definition of "real
subtype" says nothing about what `for criterion in criteria` does when the criterion has none.

Both are now guarded, and both guards assert the PREMISE first —
`test_criterion_with_no_head.py`'s opening assertion is that the real declarations actually DO empty a
criterion, so the guard is live rather than passing over an impossible case. `test_headless_criterion_loads.py`
pins both directions: a DECLARED headless criterion loads, an undeclared one still fails loudly, and the
check is `is False` rather than truthiness because every pre-v19 artefact simply OMITS the field and a
truthy test would accept those too.

### The generalisation

**When a change makes a previously impossible state possible, the call sites that need updating are the
ones that ENUMERATE states — and they are found by running, not by grepping the new identifier.** Sites 6
and 7 contain neither the string `modelHead` nor `rule-ownership`; nothing textual connects them to the
change. What connects them is that both assumed a non-empty list.

## 24. TWO CORRECT FIXES THAT COMBINE INTO A DEFECT, and nothing textual connects them

**Caught before capture, 2026-09-06, by one reviewer holding both branches.** Neither peer could have seen
it from their own worktree, and neither was wrong.

### The two fixes

- **§43** (`agent/focus-reveal-start-position`): `probeFocusReveal` starts its Tab walk from wherever the
  previous probe left DOM focus, so `revealed: false` meant "nothing revealed FROM HERE". The fix blurs
  `document.activeElement` first, so the walk starts at the first tabbable element.
- **§42** (`agent/focus-listener-before-focus`): the focus-event listener installed too late to witness
  whatever already held focus, so the log's first event was an unmatched `focusout` and 2.4.7's F55 rule
  had to special-case `i === 0`. The fix installs the listener right after `waitForDocument` — before the
  sweep and every focus-touching probe — and DELETES the special case.

Both correct. Both mutation-checked. Both green on the full suite.

### What they do together

**A `blur()` with nothing receiving focus afterwards emits an orphaned `focusout` — byte-for-byte the F55
signature.** With the listener now live from document load and the `i === 0` exception deleted, our own
diagnostic blur can be reported as a WCAG 2.4.7 conformance failure against a page that does nothing wrong.
Worse than the 37 false positives §42 was closing, because this one is manufactured by our own probe and is
indistinguishable, in the evidence, from a page defect.

### Why the log cannot solve it

`focusLandedOnADifferentControl` clears only a COMPLETED receipt, deliberately: an orphaned focusout
followed shortly by an unrelated focusin is exactly what a genuine script strip looks like — it is
`focus-removed-on-receipt-order.bad`'s own shape. No cleverer read of the log separates our blur from a
real one. It needs a marker or an omission, not a better predicate.

### How narrow it actually is, which is the useful half

Measured by reading the install point rather than reasoning from the general case: any focus caused by a
witnessed action already has a prior focusin in the log, and `focusLossEvidence`'s "ordinary hold" branch
(`heldMs >= FOCUS_SCRIPT_WINDOW_MS`) clears it, because it was held from an earlier probe until now. The
genuine danger is one shape: **a page `autofocus` surviving untouched from page load to the start of
`probeFocusReveal`** — a login or search field on a page whose sweep never touches it.

### The remedy, and why it is an OMISSION rather than a MARKER

Make the diagnostic blur never enter the log: `INSTALL_FOCUS_EVENT_LOG_EXPRESSION` already stores its
handlers as `window.__a11yFocusIn`/`__a11yFocusOut` so they can be detached and reattached — which
`collectFocusEventLog` already does on teardown — so the blur brackets itself with `removeEventListener`
and `addEventListener` inside the same page-side expression.

A marker would have worked and is worse: it adds semantics for `focusLossEvidence` to interpret and for a
future reorder to get wrong. **The bracket travels with the blur** rather than depending on where it sits
in the sequence, and §43 exists precisely because the probe order was load-bearing by accident. A fix that
reintroduced an ordering dependency to protect an ordering fix would be circular.

### The generalisation, and it is §23's arriving somewhere new four hours later

**Nothing textual connects the three files.** The blur is in `browser-session.mjs`; the rule that misreads
it is in `rules.ts`; what makes them meet is an install point in `capture-core.mjs`. Grep for any
identifier in one and you reach neither of the others. §23 said it about a previously-impossible state
becoming possible: *the sites needing updating are the ones that ENUMERATE states, and they contain none of
the new identifier's text.* Here it is two independent changes each valid alone, where the connection is a
runtime ORDERING rather than a call graph — and the only thing that saw it was one reader holding both
diffs at once. Review does not compose: a sub-reviewer given either branch would have approved it.
