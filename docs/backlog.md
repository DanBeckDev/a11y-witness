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

### A — Nothing. The experiment this stage held was ALREADY RUN, in full.

**Withdrawn 2026-09-03, and the withdrawal is the useful part.** This stage said the live-region
intermittency was unexplained and prescribed a speech-rate experiment. Both were wrong, and reading the
record properly is what settled it.

`not-working.md` carries FOUR sections numbered 18. The current one — established by
`git log -S`, because the file runs NEWEST FIRST and its position gives no clue — is
**"MEASURED IN FULL — every cell is a rate"**, and it holds a complete table: a polite region is heard
**6 of 6** when the trigger says nothing of its own, **2 of 6** from a checkbox, **5 of 6** if assertive,
**0 of 6** if the update is deferred. The mechanism is characterised, it is NVDA's politeness semantics
working as specified, and `waitPastControlState` proved it *"is not our timing"* by firing 6 of 6 and
catching nothing.

So there was nothing to experiment on. The one thing §18 asked for and nobody had done was to record the
PRODUCT finding, which is now [known-gaps §31](./known-gaps.md): **a status message fired by a control
that announces its own state reaches an NVDA user roughly one time in three.**

> **Two wrong citations in two days, from the same four sections.** The first quoted the oldest §18; the
> correction written into `CLAUDE.md` said *"read to the LAST section"* and was itself backwards. Both are
> fixed, and the rule that replaces them is `git log -S "<headline>"` — a position in a file is a
> convention nobody wrote down, a commit time is a fact.

### B — Then ONE corpus change, and the batching argument is the same one stage 3 made

**Four separate items all have the same first step: a corpus case that does not exist.** Each is §17's
rule — *"a probe built now would produce evidence nothing could validate"* — and each, taken alone, costs
its own capture round. Taken together they are one corpus change and one capture of the new cases.

| what | the case that has to exist first |
|---|---|
| ~~**3.1.2**~~ — **CASE DONE 2026-09-03**, 29 captured, gate PASS at 1,623 discriminating. The RULE is what remains | ~~a page with a passage in another language~~ |
| ~~**1.3.1 via `reportEmphasis`**~~ | **REFUTED 2026-09-03** — NVDA implements emphasis reporting only for MSHTML, and we capture in Chromium Edge. Built, captured, CONTAMINATED, withdrawn. [known-gaps §33](./known-gaps.md) |
| ~~**The arrow-key probe**~~ | **ALREADY EXISTS** — `RADIO_GROUP_PAGE`, 15 cases under `control-unreachable-by-keyboard`, criterion 2.1.1, `probeArrows` on. §17's *"0 in 4,926 captures"* predates it. |
| ~~**Typing feedback**~~ | **BLOCKED BY A MEASURED LIMIT, not missing work.** The case was built and WITHDRAWN: §18 measures typing + a polite region at **0 of N** — six character echoes leave NVDA no idle moment, so the region is never announced. A new case would be BLIND, which `check-signals` refuses. |

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
| **3.1.2 needs a DOM-JOINED rule, not a screen-reader one** — 29 cases captured on real NVDA 2026-09-03, `check-signals` **PASS: 1,623 discriminating, 0 blind, 0 uncaptured**. Building the case surfaced the limit: an announcement CONFIRMS a passage was marked, but **silence is equally what a correct monolingual page produces**, so an unmarked passage is undetectable from speech. A rule firing on silence would accuse every English page of hiding a French one — and it would have PASSED `rules:gate` on this corpus, where the case declares the language. | Join axe's view of `lang` to the capture's view of what was announced. The 29 pairs are the ground truth that verifies it. This is the same join [known-gaps §26](./known-gaps.md) built for the axe layer, pointed at a second criterion. | [known-gaps §32](./known-gaps.md) |
| ~~**The live-region intermittency is unexplained**~~ — **IT IS NOT, and never was after 2026-09-01.** `not-working` §18's current section measures every cell: polite heard 6 of 6 from a button, 2 of 6 from a checkbox, 5 of 6 assertive, 0 of 6 deferred. The mechanism is NVDA's politeness semantics working as specified, and it is provably not our timing. The corpus cases stay withdrawn deliberately — 2-of-6 evidence teaches the model noise, and an `alert` variant is explicitly NOT the fix. | **DONE 2026-09-03** — the one outstanding action was recording the product finding, now [known-gaps §31](./known-gaps.md). | [not-working §18](./not-working.md) |
| **One corpus pair was split by the INSTRUMENT** — `icon-button-unnamed.good` failed to park the pointer while its mate did, so the two halves were measured differently. CLAUDE.md calls a pair differing for a reason unrelated to accessibility "the one defect this project cannot tolerate", and Ctrl over an image is Edge's MAGNIFIER overlay — so a split on an `image-*` case is where the remedy mattered most. Found by `job=observation-ambiguity` 2026-09-03; 4 of 6,975 captures failed to park, 1 split a pair. | **RECAPTURING DOES NOT FIX IT — tried 2026-09-03.** Both halves were recaptured with `--no-cache` on the SAME worker, 0 failed, and the audit re-run against the fresh captures reports the identical split. So the park fails REPRODUCIBLY on that page rather than flaking, which is the more useful answer: the remedy is to find what defeats `parkPointer` there, not to capture it again. The page is an icon button, and Ctrl over an image is Edge's magnifier overlay — the exact condition the park exists for. Fixed when both halves of the pair carry `pointerParked`. | [not-working §11](./not-working.md) |
| **ONE PAGE CAPTURES PATHOLOGICALLY, and `grants-audit` is what caught it** | The page captures like its peers, or is removed with the reason recorded. | [not-working §20](./not-working.md) |

## Accepted designs, not yet built

| | what would tell you it is fixed | detail |
|---|---|---|
| **4.1.3 real-page grounding: the config is WIRED, the capture has not run** — `real-page-corpus.mjs` now carries a `formState` on W3C's own fixed survey and `capture-real-pages` sends it, guarded by `real-page-form-consent.test.ts` (only pages whose publisher put them there to be submitted; only the CONFORMANT half; **never a `success` state**, which would complete a stranger's form on every corpus run). Mutation-checked on both. | A real-page capture run, then `build-realism` should stop reporting `4.1.3: 0 of 37`. Blocked only on the fleet, which is mid-recapture. | [known-gaps §29](./known-gaps.md) |

## Open opportunities — measured, not yet acted on

| | what would tell you it is fixed | detail |
|---|---|---|

## Decided — not defects

Listed so nobody reopens them by mistake, including me.

| | why |
|---|---|
| **Live validation while typing cannot be observed** | NVDA, not the corpus. §18 measures typing plus a polite region at **0 of N** — six character echoes leave no idle moment. `validation-live-silent` was built and withdrawn for this; a new case would be BLIND. A capability bound, not a task. [not-working §18](./not-working.md) |
| **`reportEmphasis` cannot work in this pipeline** | NVDA implements emphasis reporting only for the MSHTML engine (IE, or Edge in IE mode) and we capture in Chromium Edge. Built, captured, CONTAMINATED, withdrawn 2026-09-03. [known-gaps §33](./known-gaps.md) |
| **A vendor changing an announcement string is already covered** | Measured 2026-09-03: `"unlabeled graphic"` became `"unlabelled graphic"` under the SAME NVDA (2026.1.1) and a different Edge (`151.0.4129.59` → `.107`). So the string is EDGE's, not NVDA's, and `browserVersion` is in the cache key — those captures were already invalid. The key did the job it was written for, which is the first time that has been checked rather than assumed. |
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
