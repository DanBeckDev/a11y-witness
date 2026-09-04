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
| ~~**3.1.2**~~ — **CLOSED 2026-09-03. The case is done (29 captured, gate PASS) and THE RULE CANNOT BE WRITTEN**, so this line asserted work nobody can do. An announcement CONFIRMS a passage was marked; silence is equally what a correct monolingual page produces — so accusing an UNMARKED passage needs the language of the TEXT, which is language detection and the DOM's territory. `criterion-coverage.ts` already says so (`status: "reachable"`, not `assessed`) and [known-gaps §36](./known-gaps.md) sets it out. The residual — a MARKED passage that is not announced — is a row of its own below, and needs one capture before it can be built. | ~~a page with a passage in another language~~ |
| ~~**1.3.1 via `reportEmphasis`**~~ | **REFUTED 2026-09-03** — NVDA implements emphasis reporting only for MSHTML, and we capture in Chromium Edge. Built, captured, CONTAMINATED, withdrawn. [known-gaps §33](./known-gaps.md) |
| ~~**The arrow-key probe**~~ | **ALREADY EXISTS** — `RADIO_GROUP_PAGE`, 15 cases under `control-unreachable-by-keyboard`, criterion 2.1.1, `probeArrows` on. §17's *"0 in 4,926 captures"* predates it. |
| ~~**Typing feedback**~~ | **BLOCKED BY A MEASURED LIMIT, not missing work.** The case was built and WITHDRAWN: §18 measures typing + a polite region at **0 of N** — six character echoes leave NVDA no idle moment, so the region is never announced. A new case would be BLIND, which `check-signals` refuses. |

Then, per case: the rule, and only then the setting it needs. **Setting last is the order `reportLanguage`
got wrong** — it is on, nothing reads it, and it is now a backlog row of its own.

### C — After that corpus is captured, because they read it

- **Ten features read a `0` that means "nobody asked"** ([§11](./not-working.md)) — measured at 61.7% /
  56.1% / 65.3%. **BUILT 2026-09-03, verdict pending.** The encoding is committed and the schema migration
  is declared open; what is left is the retrain that lets its four gates say whether it helped, and that
  needs the corpus B produces. Two pairs are crossed, not all ten — a refutation should cost two reverts.
- **4.1.3's real-page grounding** — **the corpus half is DONE** (2026-09-03): W3C's `after/survey.html`
  carries an `error` `formState`, `capture-real-pages` forwards it, and `real-page-form-consent.test.ts`
  guards whose page may carry one. What remains is a **real-page capture run**, which needs a free worker.
  **Know the ceiling before running it: ONE page, error path only.** The consent guard admits only origins
  whose publisher put the form there to be submitted (`w3.org/WAI/demos/`), only the half its publisher
  calls conformant, and **never a `success` state** — that one completes a form on somebody else's site on
  every corpus run, for ever. So `4.1.3: 0 of 37` becomes 1 of 37, from the error announcement, and that
  is the honest ceiling rather than a shortfall. Widening it is a SECURITY.md decision argued on its own,
  never a way to make a criterion easier to reach.

### D — Independent of all of the above, and can be done whenever

- **Audit every criterion against its official text** — the `wcag-criterion-check` skill, run over the 17
  criteria that carry a claim. Independent of the fleet and of every other row: it is reading, and it can
  be done while a capture runs. **Do the 10 `assessed` first** — those ASSERT, so a misread criterion
  there is a wrong accusation on a real page, where a misread `out-of-scope` is only a missing one.

- **The split pair** — `parkPointer` failed on `icon-button-unnamed.good` and not on its mate. **Not
  reproducible; the recapture that appeared to reproduce it had SKIPPED the case** (see the row for why).
  Re-measure with `--no-cache` and NOT `--resume`, then read the mark's PowerShell error text. Needs a
  free worker, which is the only reason it is not done.

### Cannot be scheduled, and should not be given a rank

- ~~**The 3.5-hour stall.**~~ **FIXED 2026-09-03** — [known-gaps §37](./known-gaps.md). This entry said
  it *"needs a recurrence to diagnose"* and that listing it as next *"would pretend it is actionable"*.
  That was wrong: the cause is one line's position in `runCapture`, readable without any recurrence at
  all. **"Cannot be scheduled" is a claim like any other and this one went unchecked for a day.**

### Last, for the reason known-gaps already gives

- **npm publish.** *"A changeset describes weights, so it should describe the final ones."* Stage C
  produces new weights, so publishing before it means publishing a description that stops being true.

---

## Open defects

| | what would tell you it is fixed | detail |
|---|---|---|
| ~~**A capture stalled for 3.5 hours and neither timeout fired**~~ — **DIAGNOSED AND FIXED 2026-09-03**, without waiting for a recurrence. `prepareDesktop` was awaited OUTSIDE the `try`, so it sat outside both the `finally` that releases `busy` and the 520 s hard timeout, which wraps the capture one level further in. It spawns PowerShell three times, and this repo already records PowerShell taking 25 s on a loaded guest. Bounded at 60 s of its own, moved inside the `try`, and a timeout is recorded and continued rather than rethrown. **The backlog said this "cannot be scheduled — it needs a recurrence"; it needed reading the function.** | [known-gaps §37](./known-gaps.md) |
| **Ten of the 28 model features read a `0` that means "nobody asked"** — sized 2026-09-03 at **61.7% / 56.1% / 65.3%** artefacts, so the problem is real. Both obvious routes are closed: masking was REFUTED ([§15](./not-working.md)) and giving the model `observed` was DECIDED AGAINST ([§14](./not-working.md)). | **BUILT 2026-09-03 as a FEATURE CROSS; whether it SHIPS is undecided.** The existing feature crossed with whether it was measured, so "never asked" is the all-zeros row and no column carries a free negative weight. `FEATURE_SCHEMA_VERSION` v18 → v19, `schema-migration.json` open. **What remains is the retrain** — the four gates cannot be run until the in-flight recapture finishes, and a failure means REVERT, not adjust. It does NOT close the five `UNREACHABLE_WITHOUT_PERTURBING` entries: the cross fixes a conflation, and a subtype that never runs the form probe has none to fix. | [known-gaps §35](./known-gaps.md) |
| **3.1.2's MARKED-BUT-SILENT failure is decidable here, and nothing decides it yet** — I closed this row on 2026-09-04 claiming no layer could decide 3.1.2. **That was an over-generalisation from the one case the corpus happens to hold.** WCAG defines *programmatically determined* as "determined by software from AUTHOR-SUPPLIED DATA ... assistive technologies can extract and present", so the question is whether the author supplied it — not what language the text is. Four cases: marked-and-announced is SATISFIED and demonstrable only here; **marked-and-silent is a FAILURE only this tool can witness**; an invalid `lang` is axe's; and only an UNMARKED foreign passage needs language detection. | The rule for marked-and-silent: `partLangCount > 0` and no language announced, comparing PRIMARY SUBTAGS only — `autoDialectSwitching` is `false` by default, so `lang="en-GB"` inside an `en` page announces nothing and would otherwise be accused. Needs its own corpus case, since the existing pair is the undecidable fourth case. | [known-gaps §36](./known-gaps.md) |
| **One corpus pair was split by the INSTRUMENT, and "reproducible" was a RE-READ** — `icon-button-unnamed.good` records `pointerParkFailed` while its mate does not: 4 of 6,975 captures, 1 splitting a pair. **Settled offline 2026-09-03, and both of the earlier guesses were wrong.** The pairing hypothesis is REFUTED: `mateOf` is exact string surgery on `<case>.<variant>`, basenames are unique in a flat directory, and nothing anywhere does prefix matching — so the split names the file it means. And the mechanism is refuted too, more firmly than before: `parkPointer` runs inside `bringUpCaptureEnvironment` **before the page is navigated to**, and takes no page-derived argument at all, so a page-specific failure is not merely implausible, it is impossible. What actually broke was the reproduction: `previouslyCaptured` returns a non-empty set **only** under `--resume --no-cache` and skips on the capture FILES, so the recapture skipped this case and the "identical split" was the same bytes re-read. Two readings of one file are not two measurements. | Re-measure with **`--no-cache` and NOT `--resume`**, then read the fresh `pointerParkFailed` mark — it carries the PowerShell error text, `attempts` and `ms`, which says at once whether it timed out at 5 s or failed to spawn. Needs the fleet, which is mid-recapture. The run now prints what `--no-cache` cannot reach, so this cannot be misread the same way again. | [not-working §11](./not-working.md) |

| **EVERY criterion we make a claim about is checked against its OFFICIAL text, and none has been** — 3.1.2 was argued for a day and settled wrongly because nobody followed the link on *programmatically determined*; the definition inverts what the criterion asks. That is not a 3.1.2 problem. **17 criteria carry a claim** — 10 `assessed`, 7 `partial` — plus 4 `reachable` and 33 `out-of-scope` whose REASONS are also claims. Each was written from a reading of the criterion that nobody has since checked against W3C. | Per criterion, via the **`wcag-criterion-check` skill**: the Understanding page, the normative definition of every defined term, the ACT rules and their examples, then the failure-case table (which case, what evidence, which layer) compared against `criterion-coverage.ts`, `rule-ownership.json`, `act-rules.ts` and `rules.ts`. A discrepancy is reported with the sentence it contradicts, QUOTED. Start with the 10 `assessed` — those ASSERT, so a misread criterion there is a wrong accusation on somebody's page. | [the skill](../.claude/skills/wcag-criterion-check/SKILL.md) |

| **2.4.6 covers HEADINGS and the criterion says "headings AND LABELS"** — found by the criterion audit 2026-09-04. `label` is defined as "Text or other component with a text alternative that is presented to a user to identify a component within web content", and nothing here looks at one: the corpus has a single `2.4.6:regex` subtype built from `headings-vague-*` cases, keyed on `generic_heading_present`. The NOTE is corrected to say which half; the STATUS stays `assessed`, because this file defines that as "we have evidence and a decider", never "this answer is exact" — and we have both for headings. | A `label-vague` subtype: NVDA announces a field's label, so "Field 1", "Input" or "Text box" is as audible as a vague heading. This is a CORPUS gap, not a layer one, which is why it is here rather than in the out-of-scope table. **Do not build a rule for ABSENT labels** — W3C is explicit that 2.4.6 "does not require headings or labels", and points at 3.3.2 for presence. | [audit](./wcag-criterion-audit.md) |
| **1.1.1's CONTROLS/INPUT exception is stated but not enforced** — found by the criterion audit 2026-09-04. "If non-text content is a control or accepts user input, then it has a NAME that describes its purpose", so an `<img>` inside a named button satisfies 1.1.1 through the BUTTON's name. `a11y-witness:unnamed-graphic-count` counts nameless tree images and would accuse one. It does not today — `rules:real-pages` is clean over 86 conformant pages — and the assumption is now written down, which is where every wrong finding this project has shipped came from lacking. | Exclude a nameless image whose nearest ancestor in the tree is a NAMED control from `graphicUnnamed`. Cheap, and testable against the AX tree without a capture. Until then the exception is documented rather than handled, and the difference is one conformant page away from mattering. | [audit](./wcag-criterion-audit.md) |

## Accepted designs, not yet built

| | what would tell you it is fixed | detail |
|---|---|---|
| **4.1.3 real-page grounding: the config is WIRED, the capture has not run** — `real-page-corpus.mjs` now carries a `formState` on W3C's own fixed survey and `capture-real-pages` sends it, guarded by `real-page-form-consent.test.ts` (only pages whose publisher put them there to be submitted; only the CONFORMANT half; **never a `success` state**, which would complete a stranger's form on every corpus run). Mutation-checked on both. | A real-page capture run, then `build-realism` should stop reporting `4.1.3: 0 of 37`. Blocked only on the fleet, which is mid-recapture. | [known-gaps §29](./known-gaps.md) |

## Open opportunities — measured, not yet acted on

| | what would tell you it is fixed | detail |
|---|---|---|
| **Two NVDA settings that change WHAT IT SAYS are not pinned, so drift is invisible** — `reportNotSupportedLanguage` (default `"speech"`) makes NVDA announce a language switch the synthesiser cannot voice, and `autoLanguageSwitching` (default `true`) is the PRECONDITION for the `reportLanguage` we do pin — with it off, that setting is inert, which is the `[documentFormatting]` defect wearing different clothes. Both sit at their defaults on every box today, so the corpus is consistent; nothing would SEE either drift, because `fleet-consistency` compares only the digest of settings we pin. | Both in `CAPTURE_SETTINGS` with their `why`, and the digest moved. **Deliberately NOT done yet**: the digest is a cache key, so it must ride with the next key change rather than throw a recapture away. | [known-gaps §36](./known-gaps.md) |

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

## The next action, and it is sequencing rather than work

> **NO LAB JOB CAN RUN AT ALL WHILE `retrain` IS RUNNING, so there is no way to get any of this early.**
> Verified 2026-09-03 by trying: `lab:job -e job=observation-ambiguity` refused with
> *"would run at 6805ec2f7732, NOT the requested main — another job is running ... Nothing has run."*
> That is `run-job.yml`'s guard, and it is right: a job that quietly runs four commits behind reports
> success for code you did not ask for. It clears itself when the run ends.
>
> Worth knowing because two of the rows below LOOK reachable early. `icon-button-unnamed` is case 16 of
> 1,623, so the split pair's fresh evidence has existed on the lab's disk since the first minutes of this
> run — and it cannot be read until the run finishes. The answer being on disk and the answer being
> readable are different things.

**The in-flight `retrain` job will produce a candidate whose crossed columns are CONSTANT ZERO, and that
is not a refutation.** `lab:retrain` chains generate → capture → check-signals → export → build-realism →
train, and `run-job.yml` pins the whole chain to the commit it was DISPATCHED at. The exporter learned to
emit `observation` after that dispatch, so the export stage will run the old code, every record will lack
the field, and both `formChanges` and `postSubmitFields` crosses will read "never asked" on the entire
corpus. `corpus:distribution` would then refuse them — correctly, and for a reason that says nothing about
whether the cross helps.

known-gaps §35 states the rule this walked into: *"it lands between a corpus recapture and the retrain
that follows, never after — otherwise the retrain is paid twice."* It landed DURING. The cost is one
export and one train, not a recapture, because nothing in those commits touches a page or a worker file —
so every capture stays cache-valid.

So, in this order, once `lab:status -e job=retrain` shows `SubState` has left `running`:

1. **`npm run fleet:deploy`** — all five boxes read STALE against this checkout. Two worker changes are
   committed and undeployed: `browser-session.mjs`'s language census (`documentLang`, `partLangs`) and
   `server.mjs`'s 60 s bound on `prepareDesktop`, which is the 3.5-hour stall. Neither moves
   `CAPTURE_PROTOCOL_VERSION` — the census is additive and nothing reads it yet — so no capture is
   invalidated. `assertFleetRunsThisCheckout` REFUSES the next capture-bearing job until this runs.
2. **`npm run lab:job -- -e job=retrain -e ref=main`** — re-dispatch. `generate` and `capture` are cache
   hits; only export, build-realism and train do real work.
3. **Then ONE command decides v19 and 4.1.3's grounding together:**

   ```bash
   npm run lab:pipeline -- --pipeline=migration-verdict --ref=main
   ```

   Added 2026-09-03, because the alternative was five stages assembled by hand in an order that lived in
   somebody's head — the defect `lab:pipeline` exists to close, still present for the one decision that
   gates a release. It captures both real-page roles, re-exports, trains, and runs every gate:
   `scorer:shortcuts` (closable vetoes must FALL, no head may gain one on a new column, **and its
   constant-column report** — the check that replaced `corpus:distribution`, which could not see a
   constant feature), held-out `acceptance`, `rules-real-pages` (zero new findings on the 86 conformant
   pages), and `rules-coverage` last, which is what says whether `4.1.3: 0 of 37` moved.

   **It does not promote, deliberately.** It answers a question; acting on the answer is `candidate`.
   A failure means REVERT and record it as REFUTED — `schema-migration.json` names every gate so the
   decision cannot be quietly softened into an adjustment.

   The real-page captures come FIRST and that is pinned by a test: `retrain` ends with `build-realism`,
   which reads the captures on disk, so the other order would score a dataset that does not contain the
   change being tested and report success about the wrong corpus.

## How an item leaves this page

Delete the row, and put the *lesson* in the record — `known-gaps.md` for something the project did not
yet do, `not-working.md` for something that was wrong. A closed row that stays here is how a tracker
becomes a second record and stops being read.
