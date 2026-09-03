# Backlog

**This is the one place that answers "what is open".** It was created 2026-09-02 because the answer was
previously "read 2,700 lines of two other files and infer it".

## Why this file exists, and the rule

[`known-gaps.md`](./known-gaps.md) and [`not-working.md`](./not-working.md) are **records**. They are
long-form, they are valuable, and they are where a closed item's *lesson* lives — the measurement, the
wrong turn, the thing that would have caught it. Neither is a tracker, and known-gaps says so in its own
header.

The consequence was that open work could not be found mechanically. Section numbers are not unique
(`not-working` has four `§18`, two `§20`, two `§15`, two `§14`), entries are not in numeric order, and
"closed" is spelled at least fourteen ways across the two files — `DONE`, `CLOSED`, `RESOLVED`,
`REFUTED`, `MEASURED`, `DECIDED`, `CHARACTERISED`, `EXERCISED`, `STALE`, `MOVED`, `FOUND AND CLOSED`,
`MOSTLY NOT A GAP`, `WRONG CAUSE`, `MOSTLY WRONG`. Grep cannot separate a finished item from a live one.

> **Every row is ready to pick up.** Checked 2026-09-02: each names its next action, and none of them
> needs a decision from the repository owner first. Where an item once did, the decision has been made and
> recorded — ADR 0024 for the forms consent question, and the registry check that settles `PLAN.md` B5's
> naming half. An item that turns out to need a decision does not belong here until the decision exists;
> a backlog whose rows stall on "go and ask" is a reading list.
>
> **The rule: if it is open, it is on this page.** Detail may live in a record entry, and this page links
> to it rather than restating it — a fact stated twice is this repo's most-repeated defect, and two
> copies of a status is exactly the shape that drifts. `backlog.test.ts` enforces one direction of that:
> any record heading marked `— OPEN` must appear here.

---

## The order these should be done in

The convention is [`known-gaps.md`](./known-gaps.md)'s and it is not restated lightly: **not by size, and
not by what is closest to finished — by what CONSUMES what.** Applied here it reorders the page, because
three separate items all touch the capture path and each one costs a recapture if it lands alone.

**1 — Now. Consumes nothing, and one of them is a falsehood.**

- ~~The axe reporting gap.~~ **DONE 2026-09-02** — [known-gaps §26](./known-gaps.md). Left here for one
  more read because it justifies the stage: it went first as the only item where the tool made a FALSE
  STATEMENT about its own coverage, and a wrong claim outranks a missing capability.
- **`not-working` §21 is stale.** Minutes, and a stale entry has already sent me chasing a fixed problem
  twice this week.

**2 — Before anything capture-heavy.**

- ~~Readiness ignores a non-modal foreground window.~~ **DONE 2026-09-02** —
  [known-gaps §27](./known-gaps.md), which also closes a second defect found while fixing it: the dialog
  sample was taken at BOOT, so `/health` had been answering "no dialogs" from up to six days earlier.
  The sequencing argument held: it went before stage 3 because everything there needs a great many
  captures, and this was the fault that let a worker report `ready` while taking none.
  **Needs `npm run fleet:deploy` before stage 3 captures**, since it changes `codeVersion()`.

**3 — ONE capture-path change, ONE protocol bump, ONE recapture.**

> **DONE 2026-09-03 — and the stage cost minutes, not the ~8 hours budgeted.** The candidate pipeline
> ran all seven stages in **21.7 minutes**: 1,594 cases discriminate (0 blind, 0 contaminated), RULES
> 17/17, every rule-only criterion fired, 86/86 conformant real pages clean, candidate promoted, and the
> v18 weights are committed. The schema migration is closed.
>
> **The recapture never happened, because it was never needed.** This stage was written as "ONE
> capture-path change, ONE protocol bump, ONE recapture" and `CAPTURE_PROTOCOL_VERSION` never moved:
> every change was ADDITIVE to the capture — an optional request field, a new channel — or outside it
> entirely. So all 1,462 cases were **cache hits and 0 captures were taken**. What actually needed
> redoing was the export and the train, because `FEATURE_SCHEMA_VERSION` moved when the grammar learned
> to see a check box. **The bundling argument was still right and the cost estimate was wrong**, and the
> reason is worth keeping: a protocol bump forces a recapture, and nothing here bumped it. Ask which of
> the two versions moved before budgeting a day of fleet time.
>
> **Two defects on the way, both in the LAB rather than the corpus.** `packages/cli` declared `yaml` and
> the lockfile was never refreshed, so it resolved locally (something else had pulled it in) and failed
> on the lab. Then the fix landed and failed identically, because **the lab pulls and rebuilds and never
> installed** — the sibling of a defect recorded beside that very step. Both are now guarded: an extended
> `lockfile-in-sync` test fails in seconds on a laptop, and `run-job.yml` runs `npm ci` before building.
>
> **Superseded, kept for the record:** `FEATURE_SCHEMA_VERSION` moved v17 -> v18
> on 2026-09-02 because the announcement grammar can now see a `check box` and a `menu button` — it could
> see NEITHER, returning no objects at all, so every feature reading `objects` was blind to them. Found by
> pointing `--emit-form-config` at a W3C tutorial page, where a correctly-labelled
> `"Subscribe to newsletter, check box"` was reported as an unnamed control: a false 4.1.2 against
> conformant markup. `release:gate` refuses everything while the migration is open, which is the correct
> state — it closes when this stage's retrain promotes weights stamped v18.

> **This is the reordering that matters, and the reason the order section exists.** A
> `CAPTURE_PROTOCOL_VERSION` bump invalidates every cached capture — **measured at ~8 h across the five
> bare-metal boxes**, not the ~4.5 h an older document claimed. Three items below each change what a
> capture records. Landed separately that is up to three recaptures and a day of fleet time; landed
> together it is one. `CLAUDE.md` already states the rule for a single change — *"the cheap moment to pay
> it is bundled with any other pending bump"* — and nothing was applying it across a work queue.

- **[ADR 0024](./adr/0024-a-form-is-configured-with-states-not-values.md) — forms v1.** The largest item
  and the one that consumes the most: it adds `captureOptions`, changes what a capture may do to a page,
  and unblocks four criteria. Everything else in this stage is smaller and should ride with it.
- **The arrow-key probe** ([not-working §17](./not-working.md)) — note §17's own finding that the CORPUS
  work comes before the probe, so that ordering is internal to this item.
- **The 3.1.2 route** ([not-working §19](./not-working.md)) — a new observation, so a new protocol.

Run `npm run evidence:check` before bumping. If it reports SAME the change is evidence-neutral and the
recapture is not needed; if CHANGED, it is genuine and this is the moment to pay it once.

**4 — After the recapture, because they consume the corpus.**

- **Ten features read a `0` that means "nobody asked"** ([not-working §11](./not-working.md)). It sits
  here for two reasons. Any eventual fix is a featurizer change needing a retrain, and a retrain consumes
  the corpus — so doing it before stage 3 means doing it twice. And its first step is a MEASUREMENT
  (`job=observation-ambiguity`) against the corpus, which should be the recaptured one.
- **The pathological page** ([not-working §20](./not-working.md)) — a corpus question, answered against
  the recaptured corpus.
- ~~**4.1.3's real-page grounding**~~ — **DEMONSTRATED 2026-09-03**, [known-gaps §29](./known-gaps.md).
  It consumed forms v1 exactly as this ordering predicted, and became possible the moment stage 3 landed.
  What remains is corpus work rather than capability: a per-page forms config in `real-page-corpus.mjs`.

**Cannot be scheduled, and should not be given a rank.**

- **The 3.5-hour stall.** It needs a recurrence to diagnose and the instrumentation is now in place
  (`workerLogTail`, verified on the fleet). Listing it as "next" would be pretending it is actionable;
  the honest state is *armed and waiting*.

**Last, for the reason known-gaps already gives.**

- **npm publish.** *"A changeset describes weights, so it should describe the final ones."* Stage 4
  produces new weights, so publishing before it means publishing a description that stops being true.

---

## Open defects

| | what would tell you it is fixed | detail |
|---|---|---|
| **A capture stalled for 3.5 hours and neither timeout fired** — the worker's 520 s hard bound and the host's 600 s `waitForWorker` both exist and neither ended it. The wedge itself is understood (a notification toast held the foreground, so Edge could never take focus); why two independent bounds failed is not. | A capture that exceeds its bound is abandoned and the run says so — reproduced deliberately, not waited for. | no record entry; found 2026-09-02 on `a11y-worker-6` |
| **Ten of the 28 model features read a `0` that means "nobody asked"** — every structured feature is `float(bool(channel))` and `any([])` is `False`, so "the page has none" and "nothing looked" are one number. **Both known routes are closed**: masking was REFUTED ([§15](./not-working.md), it cost a real finding), and feeding `observed` to the featurizer was DECIDED AGAINST ([§14](./not-working.md), it trades one shortcut for a feature correlated with capture conditions — ADR 0015's whole subject). So this needs a design, not an implementation. | **MEASURED 2026-09-03.** 61.7% of empty `formChanges`, 56.1% of empty `postSubmitFields` and 65.3% of the `formControl` sweep are *never asked* rather than *the page has none* — so the problem is real and sized. What remains is a DESIGN that does not trade this shortcut for a worse one (a feature correlated with capture conditions is ADR 0015's subject), which is why §14's decision stands until one exists. The plan file's conjunction encoding — two computed columns where neither fires when the probe did not run — is the candidate. | [not-working §11](./not-working.md), with [§14](./not-working.md) and [§15](./not-working.md) for the two closed routes |
| **3.1.2 is now OBSERVABLE and still not assessed** — `reportLanguage` is on across the fleet, so NVDA speaks a language change into the transcript. Nothing reads it: there is no rule, and essentially no corpus case carries a `lang` change for one to fire on. This is §17's pattern exactly — the capability arriving before anything for it to observe, which is why the coverage entry says `reachable` rather than `assessed`. | A corpus case with a passage in another language, in both variants (marked and unmarked), then a rule. The case comes FIRST: a rule built now would have nothing to score. | [settings audit](./screenreader-settings-audit.md), [not-working §19](./not-working.md) |
| **Nobody has read NVDA's `configSpec.py` defaults** — `reportLanguage` defaulted OFF and hid WCAG 3.1.2 until 2026-09-03, and nothing rules out a sibling. `documentFormatting` alone carries `reportTables`, `reportLinks`, `reportHeadings`, `reportLists`, `reportLandmarks`; most default ON, which is why the sweeps work — but that is assumed, not read. | One read of `configSpec.py` on a guest, listing every `documentFormatting` and `speech` default. **The cheapest item on this page**, and it would have caught `reportLanguage` years earlier. | [settings audit §4](./screenreader-settings-audit.md) |
| **The live-region intermittency is unexplained** — a region reaches the capture **2 times in 6** on an unchanged page. Two mechanisms have been asserted and BOTH refuted by measurement (the "polite means idle" reading, and the settle-window race). It costs gaps 3 and 6, keeps two corpus cases withdrawn, and is the largest hole in 4.1.3. | An experiment varying speech rate, run through `training:repeat` so the answer is a RATE — §18 is emphatic that every wrong turn there came from concluding off ONE capture. A hypothesis, not a plan. | [not-working §18](./not-working.md), [settings audit §1](./screenreader-settings-audit.md) |
| **One corpus pair was split by the INSTRUMENT** — `icon-button-unnamed.good` failed to park the pointer while its mate did, so the two halves were measured differently. CLAUDE.md calls a pair differing for a reason unrelated to accessibility "the one defect this project cannot tolerate", and Ctrl over an image is Edge's MAGNIFIER overlay — so a split on an `image-*` case is where the remedy mattered most. Found by `job=observation-ambiguity` 2026-09-03; 4 of 6,975 captures failed to park, 1 split a pair. | **RECAPTURING DOES NOT FIX IT — tried 2026-09-03.** Both halves were recaptured with `--no-cache` on the SAME worker, 0 failed, and the audit re-run against the fresh captures reports the identical split. So the park fails REPRODUCIBLY on that page rather than flaking, which is the more useful answer: the remedy is to find what defeats `parkPointer` there, not to capture it again. The page is an icon button, and Ctrl over an image is Edge's magnifier overlay — the exact condition the park exists for. Fixed when both halves of the pair carry `pointerParked`. | [not-working §11](./not-working.md) |
| **ONE PAGE CAPTURES PATHOLOGICALLY, and `grants-audit` is what caught it** | The page captures like its peers, or is removed with the reason recorded. | [not-working §20](./not-working.md) |

## Accepted designs, not yet built

| | what would tell you it is fixed | detail |
|---|---|---|
| **Form configuration by named states** — **WORKING END TO END 2026-09-02, proven on a real page.** Config layer, draft emitter, coverage calculation, CLI (`--forms`, `--emit-form-config`, `--plan`) and worker-side filling are all built, tested and deployed. Measured against a W3C tutorial page with real NVDA: `filled: [Search, First name:], unbound: [], submitted: true` — both located by ACCESSIBLE NAME. The criteria are decided too — measured on that page, 3.3.1 and 4.1.3 go from `inapplicable` without a config to **`passed`** with a configured error state, because `probeConfiguredForm` submits through `activateAndCaptureDelta` and so lands in `formChanges`, the channel the rules already read. What remains is real-page GROUNDING for 4.1.3 (a conformant and a failing page, both configured). The design is settled; Unblocks 3.3.1, 3.3.3, 4.1.3 and 3.2.2 on pages we do not own, and closes the consent question rather than working around it. | `--emit-form-config` drafts a file from a real page; a configured error state makes 3.3.1 assessable on a site we do not own; an unconfigured form reports `cantTell` naming the command to run. | [ADR 0024](./adr/0024-a-form-is-configured-with-states-not-values.md) |

## Open opportunities — measured, not yet acted on

| | what would tell you it is fixed | detail |
|---|---|---|
| **The arrow-key gap is real** — 2.1.1 abstains via `SHARES_ONE_TAB_STOP` because a capture cannot tell *reachable by arrows* from *unreachable*. The entry also argues the ORDER: corpus before probe. | 2.1.1 stops abstaining on roving-tabindex widgets, with the corpus work done first. | [not-working §17](./not-working.md) |
| **3.1.2 Language of Parts is reachable, but not at NVDA's defaults** — the route exists (`reportTextFormatting` includes language), and it needs NVDA's *Report Language* option, which is OFF by default. §19 is explicit that choosing to turn it on **is a product decision, not an engineering one**: it would make every capture describe a user who changed a setting most users have not. | **This is the one row that still needs YOU**, and the measurement that could have avoided that is done: `documentFormatting` is not a section in `getSettings()` at all, so whether the option is on cannot be recorded without first turning it on. Two honest answers — capture 3.1.2 under a declared non-default profile and say so in the evidence, or record it as out of reach at defaults in `criterion-coverage.ts`. | [not-working §19](./not-working.md) |

## Decided — not defects

Listed so nobody reopens them by mistake, including me.

| | why |
|---|---|
| **No consumer telemetry** | Settled in `SECURITY.md`. The cost is accepted and real: nobody knows how the scorer behaves on a user's pages. [not-working §6](./not-working.md) |
| **`probeForms` stays off in the CLI** | Pressing *Book* on somebody's production site is not a review. ON in the Action, because you own that app. [ADR 0024](./adr/0024-a-form-is-configured-with-states-not-values.md) revisits the mechanism, not the line. |
| **2.1.4 Character Key Shortcuts is assessable by neither layer** | NVDA consumes single letters as quick-nav commands, so the page never receives the keystroke. The DOM route yields *"a handler exists"*, and the criterion asks whether it can be turned off — a settings-UI judgement. axe ships no rule for it either. See the comment on `"2.1.4"` in `criterion-coverage.ts`. |

## Needs your hands, but not your judgement

Neither of these is an open question any more. The first is a procedure; the second is ordinary work that
was waiting on a decision now recorded in ADR 0024.

**npm publish.** `PLAN.md` B5 called this *"the name, and the first publish (yours)"*, and the name half
is settled: **`a11y-witness` and the `@a11y-witness` scope are both unclaimed on the registry**, checked
2026-09-02, so the names already in every `package.json` are available and nothing needs choosing. What
remains is mechanical, in this order:

1. `npm run lab:job -- -e job=release-gate` — the full gate on the lab. `release:gate:ci` is the subset a
   GitHub runner can prove and is **not** a substitute; seven of its twelve stages need the Python venv or
   the corpus.
2. Create the `@a11y-witness` scope on the publishing account, and add `NPM_TOKEN` to the repository
   secrets.
3. Flip `.changeset/config.json` `"access"` from `restricted` to `public`. The workflow refuses to publish
   while it reads `restricted`, deliberately — it is the last stop before the irreversible step.
4. Dispatch `release.yml` with `dry-run: true`. It builds, versions and packs, and stops. Its first ever
   dry run found two real defects, so do not skip it.
5. Dispatch with `dry-run: false` and `confirm: publish-for-real`, typed exactly.

The only judgement left is *when*, and the order section above answers it: after stage 4, because a
changeset describes weights and should describe the final ones. [not-working §8](./not-working.md)

**4.1.3's real-page grounding — DONE as a demonstration, and it needs nothing from you.** Driven against
W3C's own survey demo in BOTH versions with the same config: the conformant page filled three fields,
submitted, and NVDA announced *"Submission Failed"*, so 3.3.1 and 4.1.3 both read `passed` from real
evidence on a real site. The inaccessible twin filled ZERO and reported all three `unbound` — because its
controls have no accessible names, which is the 4.1.2 finding rather than a tool limitation, and is ADR
0024's central claim happening with its own control group.

What remains is corpus work, not capability: a per-page forms config in `real-page-corpus.mjs` so
`capture-real-pages` can drive configured pages, after which `build-realism` stops reporting
`4.1.3: 0 of 37`. Bounded, and no longer a decision. [known-gaps §29](./known-gaps.md)

---

## How an item leaves this page

Delete the row, and put the *lesson* in the record — `known-gaps.md` for something the project did not
yet do, `not-working.md` for something that was wrong. A closed row that stays here is how a tracker
becomes a second record and stops being read.
