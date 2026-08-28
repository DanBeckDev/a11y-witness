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

## 1. The shipped weights are not the weights anything says shipped

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

## 2. Free vetoes — 41 closable, down from an undifferentiated 60

**Measured on freshly trained weights** (`train -e out=scratch`, so nothing touched the candidate
awaiting a promotion decision). Two things moved: the total 60 → 57, and the audit now separates vetoes
worth corpus work from vetoes nothing can close — **41 closable, 16 unclosable and each named with its
reason**. See `reliability-plan.md` A1; before that split, the work list included items nobody could
complete.

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
lever, and it is the next one to design.

**And 57 is measured on 18 heads with the corpus as it stands.** The remaining vetoes concentrate in
subtypes with few positives; `2.4.1` and `2.4.2` have 7 each against a recall cliff CLAUDE.md puts near
140. Corpus DEPTH is the underlying constraint, not the veto mechanism.

## 3. WITHDRAWN — cycling-trap detection was exact on the corpus and wrong on the web

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
legitimately. 2.1.2 keeps only the STALLED detection. A3 in `docs/reliability-plan.md` carries the numbers
and what closing it needs.

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

## 8. Nothing has ever been published

Five changesets pending, `access: "restricted"`, and `release.yml` has never run for real. Every guard
around publishing is therefore **untested against an actual publish** — including guard 5, the
consumer-path query added today, which has been mutation-checked but never seen a real dispatch.

The first release will exercise all five for the first time simultaneously, which is the one thing this
repo's own rules say not to do. Worth a dry run before the real one, which the workflow supports.

---

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
