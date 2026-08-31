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

## 2. Free vetoes — FOUR of which can reach a report, not the 41 this said

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

**Deliberately not fixed in v17, and the reason is the discipline rather than the risk.** Adding a
condition on a field whose distribution nobody has measured could make the feature deaf, and "run
`rules:gate` after any change that makes a rule quieter" applies to a feature just as well. The
measurement is one line against the exported corpus — how many records carry `baselineQuiet: false` — and
until it exists this stays recorded rather than acted on.

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

**And the job is unusable as a gate while that row stands.** `nls.uk` moving under its own probes makes
the verdict permanently INCONCLUSIVE, so `gate-probe-order` always exits 2 and the job always reports
failure. A gate that cannot pass is one people stop dispatching — this repo's own reason for not letting
a refusal become routine. Either the page earns a documented exception or D7 closes; it is not fixed here.

**Correction to §2 while here.** This is NOT the fix for `state_unchanged`'s free veto, which an earlier
draft of the plan claimed. Splitting it into observed-columns leaves the focus positives reading `0` on
the new column too, so the veto simply moves — exactly as `landmark_present`'s moved onto
`heading_present` at the next retrain. A free veto is closed by the CORPUS, and ADR 0015 says so.

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
