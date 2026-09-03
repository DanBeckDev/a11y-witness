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

Rewritten 2026-09-03, because the previous ordering had been overtaken: stages 1 and 2 are closed, forms
v1 shipped, and the settings audit added work that did not exist when it was written. The convention is
[`known-gaps.md`](./known-gaps.md)'s and it does not change — **not by size, and not by what is closest to
finished, but by what CONSUMES what.**

### A — First, because it could change the capture settings everything else is then captured under

- **The live-region experiment**, and its first step is NOT the rate sweep.

  It goes first for a sequencing reason rather than an importance one. Speech rate is an NVDA setting, and
  as of 2026-09-03 **NVDA settings are a cache-key input** — so if the experiment says rate matters, every
  capture taken before it is invalid. Running it after a corpus recapture means paying for it twice.

  > **ATTEMPTED 2026-09-03, and the attempt corrected the plan.** `gate:stability` was dispatched as a
  > baseline and came back **PASS — 8 canaries × 5 captures, all fields identical**, including the
  > live-region canary. That is not the intermittency going away: the canary is
  > `filter-status-silent-solar/bad`, a BUTTON case, and §18 records that a button *"announces nothing of
  > its own — so the corpus has only ever exercised the one case where the region has silence to speak
  > into."* The fault lives on the CHECKBOX case, which is withdrawn.
  >
  > So there is currently **no page in the corpus on which this fault can be observed**, and the first
  > step is a diagnostic page — a control that announces its own state beside a polite region — repeated
  > enough times to give a rate. A speech-rate sweep run today would have measured the easy case and
  > reported it stable, which is the third wrong turn §18 warns about rather than a new one.

### B — Then ONE corpus change, and the batching argument is the same one stage 3 made

**Four separate items all have the same first step: a corpus case that does not exist.** Each is §17's
rule — *"a probe built now would produce evidence nothing could validate"* — and each, taken alone, costs
its own capture round. Taken together they are one corpus change and one capture of the new cases.

| what | the case that has to exist first |
|---|---|
| **3.1.2** — the setting is ON and nothing reads it | a page with a passage in another language, marked in one variant and not the other |
| **1.3.1 via `reportEmphasis`** | a page conveying emphasis semantically in one variant and with CSS only in the other |
| **The arrow-key probe** ([§17](./not-working.md)) | a radio group or roving-tabindex widget — measured: **0** in 4,926 synthetic captures |
| **Typing feedback** ([§17](./not-working.md)) | a page that validates on `input` — measured: `oninput` on **0 of 3,948** generated pages |

Then, per case: the rule, and only then the setting it needs. **Setting last is the order `reportLanguage`
got wrong** — it is on, nothing reads it, and it is now a backlog row of its own.

### C — After that corpus is captured, because they read it

- **Ten features read a `0` that means "nobody asked"** ([§11](./not-working.md)) — measured at 61.7% /
  56.1% / 65.3%, so the size is known and the design is not. Any fix is a featurizer change needing a
  retrain, and a retrain consumes the corpus.
- **The pathological page** ([§20](./not-working.md)) — a corpus question, answered against the corpus
  that exists after B.
- **4.1.3's real-page grounding** — a per-page forms config in `real-page-corpus.mjs`, so
  `capture-real-pages` drives configured pages and `build-realism` stops reporting `4.1.3: 0 of 37`. The
  capability is proven; this is the corpus half.

### D — Independent of all of the above, and can be done whenever

- **The split pair** — `parkPointer` fails REPRODUCIBLY on `icon-button-unnamed.good`. Recapturing does
  not fix it, which is the useful half: the remedy is to find what defeats the park on that page.
- **`unlabeled` → `unlabelled`** — a vendor changed a role string, so every cached capture of an unnamed
  graphic is stale against it. Found while triaging `evidence:check`; nothing to do with our changes.

### Cannot be scheduled, and should not be given a rank

- **The 3.5-hour stall.** It needs a recurrence to diagnose, and the instrumentation is now in place.
  Listing it as "next" would pretend it is actionable; the honest state is *armed and waiting*.

### Last, for the reason known-gaps already gives

- **npm publish.** *"A changeset describes weights, so it should describe the final ones."* Stage C
  produces new weights, so publishing before it means publishing a description that stops being true.

---

## Open defects

| | what would tell you it is fixed | detail |
|---|---|---|
| **A capture stalled for 3.5 hours and neither timeout fired** — the worker's 520 s hard bound and the host's 600 s `waitForWorker` both exist and neither ended it. The wedge itself is understood (a notification toast held the foreground, so Edge could never take focus); why two independent bounds failed is not. | A capture that exceeds its bound is abandoned and the run says so — reproduced deliberately, not waited for. | no record entry; found 2026-09-02 on `a11y-worker-6` |
| **Ten of the 28 model features read a `0` that means "nobody asked"** — every structured feature is `float(bool(channel))` and `any([])` is `False`, so "the page has none" and "nothing looked" are one number. **Both known routes are closed**: masking was REFUTED ([§15](./not-working.md), it cost a real finding), and feeding `observed` to the featurizer was DECIDED AGAINST ([§14](./not-working.md), it trades one shortcut for a feature correlated with capture conditions — ADR 0015's whole subject). So this needs a design, not an implementation. | **MEASURED 2026-09-03.** 61.7% of empty `formChanges`, 56.1% of empty `postSubmitFields` and 65.3% of the `formControl` sweep are *never asked* rather than *the page has none* — so the problem is real and sized. What remains is a DESIGN that does not trade this shortcut for a worse one (a feature correlated with capture conditions is ADR 0015's subject), which is why §14's decision stands until one exists. The plan file's conjunction encoding — two computed columns where neither fires when the probe did not run — is the candidate. | [not-working §11](./not-working.md), with [§14](./not-working.md) and [§15](./not-working.md) for the two closed routes |
| **3.1.2 is now OBSERVABLE and still not assessed** — `reportLanguage` is on across the fleet, so NVDA speaks a language change into the transcript. Nothing reads it: there is no rule, and essentially no corpus case carries a `lang` change for one to fire on. This is §17's pattern exactly — the capability arriving before anything for it to observe, which is why the coverage entry says `reachable` rather than `assessed`. | A corpus case with a passage in another language, in both variants (marked and unmarked), then a rule. The case comes FIRST: a rule built now would have nothing to score. | [settings audit](./screenreader-settings-audit.md), [not-working §19](./not-working.md) |
| **The live-region intermittency is unexplained, AND NO CANARY CAN SEE IT** — a region reaches the capture **2 times in 6** on an unchanged page; two mechanisms have been asserted and both refuted. Measured 2026-09-03: `gate:stability` PASSES 8 canaries × 5 captures, all fields identical, **including the live-region canary** — because that canary is `filter-status-silent-solar/bad`, a BUTTON case, and a button announces nothing of its own so the region has silence to speak into. The intermittency lives on the CHECKBOX case, which is withdrawn from the corpus. So the gate is green on the easy half and structurally blind to the fault — CLAUDE.md's own *"a canary that cannot express the fault is worthless"*, arriving in the canary set itself. | **A diagnostic page first**, not a speech-rate sweep: a control that announces its own state (a checkbox) beside a polite region, repeated enough times to give a RATE rather than a verdict. Only then is there something for a rate experiment to move. | [not-working §18](./not-working.md), [settings audit §1](./screenreader-settings-audit.md) |
| **One corpus pair was split by the INSTRUMENT** — `icon-button-unnamed.good` failed to park the pointer while its mate did, so the two halves were measured differently. CLAUDE.md calls a pair differing for a reason unrelated to accessibility "the one defect this project cannot tolerate", and Ctrl over an image is Edge's MAGNIFIER overlay — so a split on an `image-*` case is where the remedy mattered most. Found by `job=observation-ambiguity` 2026-09-03; 4 of 6,975 captures failed to park, 1 split a pair. | **RECAPTURING DOES NOT FIX IT — tried 2026-09-03.** Both halves were recaptured with `--no-cache` on the SAME worker, 0 failed, and the audit re-run against the fresh captures reports the identical split. So the park fails REPRODUCIBLY on that page rather than flaking, which is the more useful answer: the remedy is to find what defeats `parkPointer` there, not to capture it again. The page is an icon button, and Ctrl over an image is Edge's magnifier overlay — the exact condition the park exists for. Fixed when both halves of the pair carry `pointerParked`. | [not-working §11](./not-working.md) |
| **`reportEmphasis` and `includeLayoutTables` are OFF, and both bear on 1.3.1** — read from NVDA's `configSpec.py` 2026-09-03. `reportEmphasis` distinguishes SEMANTIC emphasis (`<em>`, `<strong>`) from text that merely looks bold, which is exactly 1.3.1's question and a distinction no other channel here can make. `includeLayoutTables` is the reason NVDA SKIPS layout tables entirely, so the table sweep cannot see them. | **In this order: a corpus case, then a rule, then the setting.** Setting-last is the order `reportLanguage` got wrong — it is on, nothing reads it, and that is its own row above. A setting with no rule and no case is noise added to 2,488 records. | [settings audit §4](./screenreader-settings-audit.md) |
| **A page that validates on `input` does not exist in the corpus** — `oninput` appears on **0 of 3,948** generated pages, so the typing-feedback gap cannot be closed by building a probe: it would have nothing to observe. `speakTypedCharacters` exists as a guidepup command and has never been called, and it is NOT the blocker. | A corpus case that validates live while typing, in both variants. Batches with the other three case-first items — see the order above. | [not-working §17](./not-working.md) |
| **A vendor changed a role string: `unlabeled graphic` → `unlabelled graphic`** — found while triaging `evidence:check` on 2026-09-03, 2 of 48 sampled captures. Nothing to do with our changes: an upstream update altered what NVDA or Edge says for an unnamed graphic, so **every cached capture of one is stale against it**. | Decide whether it needs a recapture of the affected cases, or whether the `screenReaderVersion` / `browserVersion` keys already cover it — they should, and nobody has checked that they did. | no record entry; see `runs/screenreader-dataset/evidence-check/report.json` |
| **ONE PAGE CAPTURES PATHOLOGICALLY, and `grants-audit` is what caught it** | The page captures like its peers, or is removed with the reason recorded. | [not-working §20](./not-working.md) |

## Accepted designs, not yet built

| | what would tell you it is fixed | detail |
|---|---|---|
| **Form configuration by named states** — **WORKING END TO END 2026-09-02, proven on a real page.** Config layer, draft emitter, coverage calculation, CLI (`--forms`, `--emit-form-config`, `--plan`) and worker-side filling are all built, tested and deployed. Measured against a W3C tutorial page with real NVDA: `filled: [Search, First name:], unbound: [], submitted: true` — both located by ACCESSIBLE NAME. The criteria are decided too — measured on that page, 3.3.1 and 4.1.3 go from `inapplicable` without a config to **`passed`** with a configured error state, because `probeConfiguredForm` submits through `activateAndCaptureDelta` and so lands in `formChanges`, the channel the rules already read. What remains is real-page GROUNDING for 4.1.3 (a conformant and a failing page, both configured). The design is settled; Unblocks 3.3.1, 3.3.3, 4.1.3 and 3.2.2 on pages we do not own, and closes the consent question rather than working around it. | `--emit-form-config` drafts a file from a real page; a configured error state makes 3.3.1 assessable on a site we do not own; an unconfigured form reports `cantTell` naming the command to run. | [ADR 0024](./adr/0024-a-form-is-configured-with-states-not-values.md) |

## Open opportunities — measured, not yet acted on

| | what would tell you it is fixed | detail |
|---|---|---|
| **The arrow-key gap is real** — 2.1.1 abstains via `SHARES_ONE_TAB_STOP` because a capture cannot tell *reachable by arrows* from *unreachable*. The entry also argues the ORDER: corpus before probe. | 2.1.1 stops abstaining on roving-tabindex widgets, with the corpus work done first. | [not-working §17](./not-working.md) |

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
