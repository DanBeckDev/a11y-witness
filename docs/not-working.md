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

## 2. CLOSED 2026-08-31 — ZERO free vetoes can now reach a report

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

## 15. CLOSED 2026-09-01 — the capture can now ask whether a dialog can be LEFT, and the answer moved a rule

Capture-protocol 11 bundles three additions: `structure.frames`, `interaction.dialogEscape` and
`formChanges[].baselineWaitedMs`. Bundling is the point rather than an economy on it — each is individually
too small to justify ~4.5 h of fleet time and this register says so about the frame sweep outright.

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
