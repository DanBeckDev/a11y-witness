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
  guards whose page may carry one. What remains is a **real-page capture run**, which needs a free worker — and it must be
  `-e role=calibration`. **Measured 2026-09-05: this is NOT what the morning's run did.** That run was
  `--role=training`, 39/39 captured, clean — and the survey page is one of the 50 `calibration` pages, so
  none of this row was touched by it. "A capture ran" and "this page was captured" are different claims.
  **Know the ceiling before running it: ONE page, error path only.** The consent guard admits only origins
  whose publisher put the form there to be submitted (`w3.org/WAI/demos/`), only the half its publisher
  calls conformant, and **never a `success` state** — that one completes a form on somebody else's site on
  every corpus run, for ever. So `4.1.3: 0 of 37` becomes 1 of 37, from the error announcement, and that
  is the honest ceiling rather than a shortfall. Widening it is a SECURITY.md decision argued on its own,
  never a way to make a criterion easier to reach.

### D — Independent of all of the above, and can be done whenever

- ~~**Audit every criterion against its official text**~~ — **COMPLETE 2026-09-05. All 55.** The 17 that
  carry a claim were done 2026-09-04 (9 clean, 8 findings, each its own row above); the residue — 33
  `out-of-scope` reasons and 4 `reachable` ones — was done the next day, each read on w3.org rather than
  by family. **12 more findings, and two changed a STATUS**: 1.4.13 and 2.4.7 were declared unreachable
  and are not, so `out-of-scope` — *"no amount of work decides it"* — was false for both. The residue was
  ranked last on the grounds that a misread there costs a finding we never make; that holds, and it
  understates them, because **a wrong reason is what the next person reads before deciding what to
  build.** Three said "needs a whole flow" for criteria saying *"process"*, three summarised a two-part
  criterion by one part.

- **The split pair** — `parkPointer` failed on `icon-button-unnamed.good` and not on its mate. **Not
  reproducible; the recapture that appeared to reproduce it had SKIPPED the case** (see the row for why).
  Re-measure with `--no-cache` and NOT `--resume`, then read the mark's PowerShell error text. Needs a
  free worker, which is the only reason it is not done.

### Cannot be scheduled, and should not be given a rank

- ~~**The 3.5-hour stall.**~~ **FIXED 2026-09-03** — [known-gaps §37](./known-gaps.md). This entry said
  it *"needs a recurrence to diagnose"* and that listing it as next *"would pretend it is actionable"*.
  That was wrong: the cause is one line's position in `runCapture`, readable without any recurrence at
  all. **"Cannot be scheduled" is a claim like any other and this one went unchecked for a day.**


### Before publish — FILE SIZE. Asked for by the repository owner 2026-09-05.

**"I get very worried when I see that a file is 3,000 lines long. In my head a file should be a maximum
of 300 lines."** Recorded here rather than acted on immediately, by agreement, and it sits BEFORE the
publish row on purpose: it is a condition of going to production, not a tidy-up afterwards.

The measurement first, because it changes what the fix should be:

| file | lines | of which | now |
|---|---|---|---|
| `case-matrix.mjs` | 5,699 | almost entirely DATA — 1,645 case definitions | **4,074** — two cuts, `signal-predicates.mjs` 904, `page-templates.mjs` 479, `page-furniture.mjs` 298 |
| `capture-core.mjs` | 4,969 | **3,020 comment, 201 blank, 1,748 code** | **4,856** — one post-mortem moved; the rest was checked and is load-bearing |
| `rules.ts` | 1,993 | | in flight |

**Two cuts on `case-matrix.mjs`, and the seam was not the one this row proposed.** Splitting by CRITERION
would have MOVED cases; the boundary that was already there runs the other way — everything from
`structuralTextParts` to the end of `signalMatches` READS A CAPTURE and answers "did this signal fire",
everything above it BUILDS PAGES, and neither half calls the other in either direction. Then the HTML page
templates and the furniture machinery, both interleaved across ~2,000 lines rather than contiguous, cut by
parsing the file with the TypeScript compiler API for exact statement boundaries instead of by line range —
which also surfaced a leading comment that no longer described the function under it, orphaned when
`LINK_STATUS_PAGE` was inserted between the two on 2026-09-01.

**The check is the corpus hash and it is not optional.** `CASES.length` 1,645 and
`sha256(JSON.stringify(CASES)).slice(0,16)` = `104ba6685264d1bd`, identical across all three states, plus a
byte-identical export surface. Furniture is dealt by index WITHIN a subtype, so a case that MOVED would
re-bucket its neighbours and recapture pages nobody meant to touch, and a diff of this size cannot be read
for that by eye.

**`capture-core.mjs` came down by 161 lines and that is the honest answer.** A 176-line changelog of every
`CAPTURE_PROTOCOL_VERSION` bump moved to `docs/capture-protocol-version-history.md` — a record, not intent
the next reader needs. The ten next-largest comment blocks were then sampled and every one was call-site
adjacent, NVDA-specific or WCAG rationale: the file's remaining 2,961 comment lines are the thing CLAUDE.md
protects, not padding. **The acceptance test needed correcting mid-unit and the correction is worth
keeping:** `stripComments` leaves an empty line where a comment was, so byte-identical stripped output is
unachievable at the same time as shrinking the file. What proves the point instead — and proves it more
directly — is that all 1,767 non-blank stripped lines are identical AND in the same order, checked
programmatically, with an independent classification pass agreeing on 1,767 code lines either side.

**A flat 300-line cap is the wrong instrument here and the reason is this repo's own record.** Its most
expensive recurring defect is a remedy applied at ONE call site when the behaviour reaches several — four
instances on 2026-09-05 alone, and three were caught only because the sibling probe sat twenty lines away
in the same file. Splitting a sequential capture pipeline across fifteen files makes those siblings
invisible to each other. What the repo constrains instead is the unit of REASONING:
`max-lines-per-function` 70, `complexity` 15, `max-params` 4, and a PHYSICAL-line budget of 90 that exists
because `skipComments: true` lets a comment-dense function run to twice its lint budget.

**What is genuinely wrong, and what to actually do:**

- ~~**`case-matrix.mjs` has no cohesion argument at all.**~~ **FIRST CUT DONE 2026-09-05: 5,676 -> 4,801,
  with `signal-predicates.mjs` at 904.** The seam was not the one this row proposed. Splitting by CRITERION
  would have moved cases; the real boundary was already there and ran the other way — everything from
  `structuralTextParts` to the end of `signalMatches` READS A CAPTURE and answers "did this signal fire",
  everything above it BUILDS PAGES, and neither half calls the other in either direction. Re-exported from
  `case-matrix.mjs` rather than repointing `check-signals`, the acceptance matrix and the corpus tests, the
  same call `evidenceUnits` already made. **The check that matters is the corpus hash and it is not
  optional:** `CASES.length` 1,645 and `sha256(JSON.stringify(CASES)).slice(0,16)` = `104ba6685264d1bd`,
  identical either side, plus a byte-identical export surface. Furniture is dealt by index WITHIN a
  subtype, so a case that MOVED would re-bucket its neighbours and recapture pages nobody meant to touch,
  and a diff this size cannot be read for that by eye. A second cut (the HTML page templates; the furniture
  machinery — `SCALE_BUCKETS`/`fnv1a`/`bucketFor`/`withRealisticScale`/`filler`) is in flight under the
  same test.
- **`capture-core.mjs`'s 1,748 code lines are ~30 probes sharing one shape.** The probes are a real seam;
  the orchestration around them is not. `probeFocusReveal`, `probeFocusContext`, `probeDialogEscape` and
  `probeArrowNavigation` are siblings that already reference each other's lessons — move them together or
  not at all, or the cross-reference that has saved this project four times stops working.
- **Some of the comment bulk belongs in `docs/`.** A capture-path incident is worth recording; recording
  it inline at forty lines is how a 1,748-line file wears 3,020 lines of prose. The test is whether the
  next person reading THAT FUNCTION needs it: NVDA quirks and ordering constraints yes, post-mortems no.
  Note that the 2026-09-05 session made this measurably worse and knows it.

**Do NOT do this before the v19 verdict lands.** Moving 1,645 case definitions while a model chain is
mid-flight makes its result uninterpretable, and `check-signals` would be comparing against a corpus that
moved underneath it.

### Last, for the reason known-gaps already gives

- **npm publish.** *"A changeset describes weights, so it should describe the final ones."* Stage C
  produces new weights, so publishing before it means publishing a description that stops being true.

---

## The recapture at protocol 15 is RUNNING, and it is also the validation run for today's worker work

Dispatched 2026-09-05 after `capture:check` passed **twice** against a real worker — once on the merged
capture path at protocol 15, and again after the `capture-core.mjs` split landed. **39 PASS, 0 FAIL both
times.** That is the only check that exercises real NVDA on a real page, and it is what makes the split
safe to have merged: nothing offline can validate a 4,800-line move through a capture pipeline.

```
capture-core.mjs   4,885 -> 362      captureWithNvda + runCapturePhases, and nothing else
capture-setup.mjs           1,575    browser + NVDA lifecycle and the shared primitives
capture-probes.mjs          3,082    the structural sweep and the ~30 probes
```

**The split is three files rather than two because the dependency graph said so, not because of a line
count.** A two-way cut makes `withTimeout`, `anchorToTop`, `waitForSpeechQuiet`, `refreshBrowseBuffer`,
`reportedTitle`, `waitForPageToSettle`, `readWithRetry` and `ensureSpeechChannel` cross both ways — a
cycle. The primitives live in the leaf; `capture-core.mjs` depends on both and nothing depends back on it.
**The sibling constraint held**: `probeFocusContext`, `probeTypedFeedback`, `probeArrowNavigation`,
`probeDialogEscape` and `probeFocusReveal` cite each other's specific lessons in their own comments and
moved as one contiguous block.

**Six source-scanning tests failed LOUD on the move**, each naming the function that had moved, and were
repointed only after verifying the pattern exists at the new location — "the test is green now" is not the
same check. A seventh caught CLAUDE.md's hashed-file count going 24 → 26.

**What this run is deciding:** the v19 feature-schema migration, and whether `2.4.7` fires on the nine F55
cases now that their evidence will actually be collected. If it still reads `NEVER FIRED ANYWHERE`, the
threshold's unverified lower bound is the next suspect and `FOCUS_SCRIPT_BLUR_WINDOW_MS = 50` is where to
look — **not before**, because a threshold tuned to make a test pass is a canary that cannot express the
fault.

## CAPTURE_PROTOCOL_VERSION 14 -> 15, and the reason is the sharpest thing found today

**`rules:coverage` reported `2.4.7 partial 0 0 NEVER FIRED ANYWHERE — the claim rests on nothing`**, on a
rule shipped that afternoon, with nine `focus-removed-on-receipt-*` cases built specifically to exercise
it. The rule was silent because **the evidence was never collected.** Fetching
`focus-removed-on-receipt-order.bad` settled it in one line: captured `07:01:11Z`, hours before the probe
existed, `focusOrder` and `focusConfinement` in its marks, **no `focusEventLog` at all**, and carrying the
OLD `formProbe` mark name rather than `formFill`.

**ADDING A PROBE DOES NOT INVALIDATE THE CAPTURE CACHE.** `workerCode` is deliberately outside the cache
key — correctly, so that a reworded comment cannot invalidate 2,122 captures — so every case whose PAGE
did not change was served its pre-probe capture. `focusEvents`, `focusReveal` and the census/focus
`candidates` field are all new fields a RULE reads, which is this constant's own stated trigger: *"a new
field a signal reads"*. None of them bumped it.

**It presented as PARTLY working, which is the worst way.** A case with no cache entry captures fresh, so
1.4.13's cases — added the same day — got the new probe and its rule fired 15 times. The F55 cases are
older and their pages did not change. **A probe that reaches only the cases nobody had captured before is
indistinguishable from a probe that works.**

**Two independent detectors found it, hours apart, and the cheap one was right first.**
`evidence-fields.test.ts` reported `interaction.focusEvents` compared and present on no capture — *"coverage
that looks real and examines nothing"* — in under a second, while a multi-hour lab chain was finding the
same thing at stage 11. It is a PENDING entry now, naming the recapture that closes it, and that guard
retires the entry itself once the field arrives, so it cannot outlive its reason.

**The bump costs a full recapture and that is what it is for.** The alternative was downgrading 2.4.7's
claim in `criterion-coverage.ts` while the rule, the probe and nine corpus cases all sat there working —
paying nothing and knowing nothing. The three channels are bundled deliberately, per this file's own rule
that the cheap moment to pay a recapture is alongside any other pending bump rather than twice.

**The deploy guard worked and is worth recording as such**: `fleet:deploy` refused, named
`--allow-protocol-change`, and the flag was then passed deliberately rather than discovered.

## Audit findings closed since the recapture started

| finding | what it turned out to be |
|---|---|
| **`control` ↔ `worker-fleet` was a real cycle** — the PUBLISHED `worker-fleet` read the PRIVATE `control`'s `inventory.yml` from four modules, with a hand-rolled YAML reader ("a stack, not a parser") to avoid taking a dependency. | **CLOSED**, and not by one uniform remedy — the four were measured separately and split. `fleet-status`, `fleet-discover` and `fleet-wake` had ZERO cross-package dependents in either direction, so they MOVED into `control`, where their consumers already live; their sibling imports now cross back the sanctioned way, by relative path. `fleet-env.mjs` could NOT move: `doctor` and `check-worker-code` are published bins that transitively depend on it. Its inventory paths became an optional parameter defaulting to today's constants — five call sites, zero changes — and the comment says outright that a default does not make an installed tarball correct, it makes a hidden assumption a named one. **The remaining two references are EXEMPT and worded as an open gap, not a clean bill of health.** `worker-fleet-does-not-read-control.test.ts` mirrors `control-has-no-dependencies.test.ts` in the reverse direction, walking everything reachable from the package's exports and bins — derived from `package.json`, not hand-listed — and refusing any import or `new URL()` resolving into `control` without a reasoned exemption. Mutation-checked by disabling the exemptions. |
| **The capture regression did not fire on the code that DISPATCHES a capture** — `capture-check.mjs` reaches six files and three were outside every path pattern, including `capture-client.mjs`, changed the same day for deadline clipping and lost-acknowledgement recovery. The `pull_request` trigger did not list the harness itself. | **CLOSED.** This workflow has silently stopped running once before — its own comment records an M8 rewrite pointing it at "a directory holding two lab files and no capture code at all" — so the fix DERIVES the import closure rather than adding three path lines. **Its mutation check caught a bug in the test itself**, which is the better half: the parser terminated the push block on `\npull_request:` while the YAML indents it two spaces, so push ran to end-of-file and swallowed the other trigger's paths. A test examining MORE than it claims is the same defect class as one examining nothing, and it would have vouched for a filter it never read. |
| **Five of ten probes were missing from `docs/screenreader-coverage.md`** — the document whose own opening line is *"Anything we have not driven is not evidence we are missing — it is a claim we cannot make."* Thirteen tests pin documents to code and NONE read this one. | **CLOSED.** Its maintenance instruction was "keep it current when you add a probe", which is a rule asking a human to remember. Six rows added, plus the fact none of them stated: all six are gated on `probeFocus`. **The second direction found a false positive in itself** — it accused three real functions the document discusses in prose, so the property is now "the name refers to SOMETHING" rather than "the document may only discuss the wire". A new gate that cries wolf on its first run is one somebody switches off. |
| **Four copies of `readCapture` with differing error semantics, and one weaker usable-capture predicate.** | **CLOSED, and bigger than the audit described**: two consumers had NO try/catch around their `JSON.parse` at all, so a torn file crashed a whole run with a bare, path-less `SyntaxError`. `capture-cache.mjs`'s swallow is KEPT but made local and explicit — a cache has a cheap automatic remedy for a corrupted entry and nowhere else has that excuse. The weak predicate was the exporter's, missing the `screenReader === "NVDA"` check that the other two have; scanned across 2,178 captures it has never admitted anything (the field has been hardcoded since the first commit, established with `git log -S`) — **fixed anyway**, because it is the one consumer that builds what the model trains on. |
| **195 Python tests ran nowhere automated; nothing installed the git hooks; a published export 42 sites import could not resolve from a tarball.** | **ALL CLOSED.** The export one is the sharpest: `isolation-gate.mjs` names that exact failure in its header and answers it by running each package's SMOKE TEST, which only exercises the subpaths it happens to import — and nothing imported that one. |
| **Seven ADRs said `Proposed` while the index called them accepted**, across three status formats so no single grep saw them all. | **CLOSED**, with the index as the authority: it carries the qualification a header cannot. |
| **One worker port declared three times in three languages.** | **PINNED.** Narrower than the audit stated — `provision-role.yml` already passes the inventory's value — and the narrowing is recorded, because an overstated finding fixed as stated leaves the real one unaddressed. |

## The architecture audit — `docs/architecture-audit.md`, commissioned 2026-09-05

An outside-in audit by an external architect, with a follow-up review. **It is a record, not a second
tracker** — its own closing line says so — so its open findings live here. Every row below was
**re-verified at HEAD by this session before being assigned**, because several had already moved.

| finding | verified here | who |
|---|---|---|
| ~~**A model finding can assign itself ASSERTION AUTHORITY.**~~ **FIXED.** `validateJudgment` now RECONSTRUCTS each finding field by field rather than casting the model's object, so `mapping` and any other extra field cannot survive. Verified structurally as well as by test: `criterionOutcomes` has exactly ONE caller in the product path and every model-controlled object reaches it only through `validateJudgment` — the `local` backend builds its findings internally — so there is no second route to the authority. Original: `validateJudgment` returns the original object, so an extra `mapping: "conformance"` survives and `criterionOutcomes` treats a model finding as a hard conformance failure. Contradicts ADR 0021's whole division — rules are the only layer that may assert — and the runtime cannot rely on a provider honouring the schema. | **REPRODUCED.** The same 2.4.4 model finding: `failed` with the field, `cantTell` without. | agent |
| ~~**A model REFERRAL can suppress a rule ASSERTION, and it reaches the DEFAULT backend.**~~ **FIXED.** `withRuleFindings` now exempts `conformance`-mapped rule findings from the criterion dedupe entirely; only `secondary` ones are still deduped, which preserves the original no-duplicate-noise intent. `criterionOutcomes` needed no change — it already composes an assertion and a referral on one criterion correctly, and the bug was purely the pre-filtering. **Reproduced before fixing**, through the real `judge()` with a loopback backend, after a first attempt whose fixture never triggered the rule at all. `withRuleFindings` had ZERO test coverage before this. Original: `withRuleFindings` builds `seen` from the MODEL's criteria and drops rule findings on those criteria. Its comment argues it "cannot add false positives" — true, and beside the point: it REMOVES true positives. **The audit scoped this to the generative path and it is broader**: `judge.ts:622` applies it to `local`, whose findings are all `cantTell` by construction, so our own scorer can silence a rule that asserts. | Mechanism confirmed by reading. A fixture where the 1.1.1 rule actually fires is the first task, and skipping it would be *a canary that cannot express the fault*. | agent |
| ~~**The live path and the training path build different model inputs.**~~ **FIXED, and MEASURED first.** Both implementations run over all 23 real-page captures carrying landmarks: Python emitted an extra unit for every one — **mean 11.6 extra units per page against a ~150-unit total (7.6%), worst case 25 (16.1%)**. Not marginal. *"Stop having its own implementation"* is NOT reachable — `score.py --capture-json` is a documented standalone entry point for a consumer with no TypeScript upstream — so the append was deleted and a parity test now spawns the real `score.py` and compares unit lists. `MODEL_INPUT_VERSION` does not move, recorded in `score.py` itself: it versions record SHAPE, and training records were always built the TS way. Original: `score.py:86` appends `landmark-navigation`; `evidence-units.ts:98` deliberately omits it. Every live page feeds the encoder a unit type in no training record — and it is the exact field the TS side removed after measuring it swing a conformant page's 3.3.2 score **0.004 → 0.39 across a 0.35 threshold**, clean once and failing once on two acceptance cases. `model-input.test.ts` checks two JS suspects and structurally cannot see `score.py`. | **CONFIRMED at HEAD**, both sides read. | agent |
| ~~**A published export the tarball cannot satisfy**~~ — `worker-fleet` mapped `./cli-flags` at `./src/cli-flags.mjs` while `files` ships only `dist` and two `src` subdirectories. 42 import sites. `isolation-gate.mjs` names this exact failure in its header and answers it with each package's SMOKE TEST, which only exercises subpaths it imports — and `isolation-smoke.mjs` never imports this one. | **FIXED `5374691`.** Repointed at `dist`; `exports-are-shipped.test.ts` now checks every export of every public package against `files` AND existence, mutation-checked. | done |
| ~~**The Action's axe layer is structurally dead.**~~ **FIXED.** `launchBrowser` tries the bundled Chromium and falls back to `channel: "msedge"` only on failure — never a hard-coded channel, so a developer with no Edge is unaffected — and reports WHICH answered, as evidence rather than an implementation detail. `axeAvailable` now launches and closes a browser instead of proving an import, so it answers the question its name asks. `assert-action-report.mjs` gains `--require-rule-layer`, refusing `ruleBased === null` while explicitly permitting `[]` — a scan that ran and found nothing must never be rejected. Mutation-checked by reverting the launch AND by disabling the smoke wiring, which reproduced the original bug exactly (exit 0 on a null rule layer). Original: `chromium.launch()` with no channel, `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1"`, and `assert-action-report.mjs` never reads `ruleBased` — so every Action consumer gets `ruleBased: null` while the header announces "rule-based axe-core + real screen reader". `axeAvailable` proves the module IMPORTS, not that a browser LAUNCHES. | **All three legs confirmed at HEAD.** | agent |
| **Losing the async acceptance loses the recovery path.** The client awaits the initial POST outside any transport-recovery block and throws on a lost 202, despite already holding the ID needed to recover. `capture-async.test.ts` covers dropped POLLS, not a lost acknowledgement. | audit-reproduced on a loopback; not re-run here | open |
| **Result recall is not an idempotency contract.** `begin(id)` deletes a previous result and replaces it with `running`; after completion another POST with the same ID executes again, with no payload-conflict check. So **404 means "not retained here"**, not "never started" — and the comments overclaim it in both directions. | audit-reproduced against the store; the POST path was read, not run | open |
| **The timeout ladder does not bound the whole operation.** The client's deadline starts after an independently budgeted 30 s acceptance, and no inner read is clipped to remaining time; the worker permits 60 s preparation plus a 520 s capture against a 560 s client budget. | audit-reproduced on a loopback | open |
| **`control` ↔ `worker-fleet` is a real cycle.** The published `worker-fleet` reads the private `control`'s `inventory.yml` from four modules, with a hand-rolled YAML reader to avoid a dependency. | read | open |
| **Nothing installs the git hooks; the Python tests run under no automated gate.** Every release-integrity gate is dispatch-only. | read | open |

**What the audit says is STRONG, recorded because a register of defects is not a picture of the system:**
the ADR 0004 package split holds, the declared graph is a DAG, `evidence` is genuinely pure, and the
repo's strongest asset is *a testing pattern* — about thirty meta-tests that discover a population,
require each member to be classified or exempted with a reason, and open with a vacuity guard. Three of
today's fixes are that pattern applied where it was missing.

## Open defects

| | what would tell you it is fixed | detail |
|---|---|---|
| ~~**THE CENSUS CAN MEASURE THE WRONG DOCUMENT, and two unrelated sites proved it**~~ — **FIXED AND VERIFIED 2026-09-05.** `choosePageTarget` now prefers the target whose PATH AND QUERY match the page `openPage` navigated to, tags every census `matched`/`fallback`/`no-expected-url`, and the expectation is cleared in `captureWithNvda`'s `finally` so a long-lived worker cannot compare against the previous capture's URL. **Verified on the two pages that PROVED the defect**, recaptured with the fix live: `bathingwaters.sepa.org.uk` went `dom[173,253,6,18,80]` → `dom[47,79,5,9,38]` and `lbhf.gov.uk/council-tax` went from that same identical row → `dom[85,4237,12,1392,54]`, both `targetMatch: "matched"`, both now carrying their own site's vocabulary. 4,237 links and 1,392 form fields is a real council-tax page; the old 253/18 was a consent widget wearing its name. ORIGINAL FINDING FOLLOWS. — found 2026-09-05 by review, confirmed independently. `bathingwaters.sepa.org.uk` and `lbhf.gov.uk/council-tax` return a **byte-identical** `domCensus` — `heading:173, link:253, landmark:6, formField:18, tabbable:80, partLangCount:30` — and near-identical `structureCensus`. Two unrelated government sites cannot do that. `structureCensus.names` on both contains ZERO site-specific terms and dozens of Cookiebot marketing strings, and all 14 `graphicUnnamedDetail` entries name `ancestorName: "What is behind 'Powered by Cookiebot™'"` with `ancestorRole: rootwebarea` — a DIFFERENT DOCUMENT'S root, not an ancestor inside the site. **The TRANSCRIPT reaches each site's real content on both**, which is the most useful fact here: the capture was on the right page and only the CDP query went astray. Root cause, evidenced but not reproduced live: `choosePageTarget` (`browser-session.mjs:109`) takes the FIRST `type: "page"` target that is not `devtools://` and **never checks its URL against the page navigated to**; `browser-session.test.ts` has no scenario with two page-type targets, which is exactly this case. | **BOUNDED 2026-09-05: 47 of 88 (53%).** 2 proven by cross-organisation identity; 45 strongly implicated by two clean within-site controls — on `w3.org` six siblings collapse to one signature while `survey.html` escapes with `formField:15` against their `0`, and on `design-system.service.gov.uk` eleven collapse while `/components/text-input/` escapes with `link:477` matching its real side-nav. *A real per-page census would never be LESS informative than a shared one.* **The SYNTHETIC corpus is clean** — 15 distinct signatures across 28 captures spanning 14 families, both shared signatures explained, and the mechanism predicts it (one page-type target, no vendor widget). Untested there: families that probe a second window or iframe. **THE FIX MUST NOT BE VALIDATED WITH `evidence:check`, and the instinct to reach for it is the trap.** That gate samples the SYNTHETIC corpus one case per family, and synthetic pages are exactly the ones that are clean — it would compare unaffected pages, report SAME, and be *a gate that does not exercise what shipped* for the fifth time here. Validate with a REAL-PAGE recapture comparing censuses before and after: ~40 minutes, and the only thing that measures it. No `CAPTURE_PROTOCOL_VERSION` bump — no probe is added and no parsing changes; a bump would force a 4.5-hour synthetic recapture to fix a defect synthetic pages do not have.**, and a sweep grouping every real-page capture by its `domCensus` signature answers it: any signature shared by two different URLs is contamination, which is a positive test rather than an absence test. In flight. **Then** decide the fix: `choosePageTarget` is shared by every worker and every capture, so it is an evidence change needing `evidence:check` and a `CAPTURE_PROTOCOL_VERSION` judgement. **This is not a 1.1.1 problem.** The census reaches `ruleEvidence`, a deliberate SIBLING of the model's `input`, so it can silently feed the wrong document's numbers to every census-based rule — `1.3.1:no-headings`, `3.1.2`'s `partLangCount`, `2.4.1`, `2.1.2`'s tabbable denominator — AND to the exported corpus. | `browser-session.mjs` `choosePageTarget` |
| ~~**Why no gate caught it, and the answer is not reassuring.**~~ — **CLOSED 2026-09-05.** `furnitureCaptures()` gated only on `census.heading === 0` — a page that never rendered — so it structurally could not see a census that counted *another* document with a nonzero heading count. And both affected pages held `[]` in the baseline only because their publishers happen to declare bare `claimExcludes: ["1.1.1", …]` for their own unrelated real image issues, which `check-real-page-findings.ts` filters before comparing — an exclusion doing exactly what it was designed to do, hiding this by coincidence. **What was built:** `targetMatch` alone could not answer it, and that is the part worth keeping. `"fallback"` conflates FORCED (a real second page-type CDP target existed, a vendor widget among them, neither confirmed) with VACUOUS (exactly one target, so the fallback IS the only correct answer — true of every synthetic capture). So `choosePageTarget` now also carries `candidates` (`pages.length`), and `censusTargetIsSuspect` is `targetMatch` present, not `"matched"`, and `candidates` either absent or `> 1`. A suspect census then reads as **`null` from `pageCensus`/`domCensus`** — the same "cannot say" every existing reader already handles — rather than as a third state nothing downstream knows, so `addMissingHeadings`, `channelRelation` and `tabOrderCanProveAbsence` are protected through the one seam they all go through. The capture is NOT refused and `targetMatch` is NOT handed to the rule layer: the transcript reached the real page on both affected variants, so discarding real screen-reader evidence over one auxiliary oracle is the wrong trade, and leaking capture-mechanism knowledge into four rules is the same judgement repeated four times. `check-real-page-findings.ts` reports `suspectCensusCaptures()` by name and reduces gate coverage as `furnitureCaptures()` already does. **Measured before merging:** all 2,032 captures on disk predate `targetMatch` entirely and stay trusted — the field cannot retroactively accuse a capture it was never computed for. The exposure is the 49 calibration captures taken between `targetMatch` shipping and `candidates` shipping, which the deploy-and-recapture that `browser-session.mjs` needed anyway resolves. | **DONE** | `check-real-page-findings.ts` `furnitureCaptures` / `verify.ts` `censusTargetIsSuspect` |

| ~~**3.2.1 and 3.2.2 ASSERT on a title change**~~ — **FIXED 2026-09-04.** The criterion's note: "A change of content is not always a change of context ... unless they also change one of the above." The rule READ "two titles differ" and ASSERTED a change of context, so a page appending a result count, or an SPA putting its filter in the title, conformed and was accused. **Downgraded to `secondary`** on the same test as 3.3.3 — **IN `act-rules.ts` ONLY. The rule kept emitting `conformance` for a further day**, and this row said DONE throughout; corrected 2026-09-05 when a review reproduced it. See the 3.3.3 row for what that cost and the guard that now prevents it.** Two residual gaps stay open and are stated in the rule's `assumptions`: attribution is assumed (a title moved by a timer is credited to the focus), and F55 — "using script to remove focus when focus is received", where focus IS the change of context — is missed entirely, though `focusOrder` could witness it. | **DONE**, with the two residuals stated | [audit](./wcag-criterion-audit.md) |
| ~~**3.3.3 ASSERTS a conformance failure and does not guard either of the criterion's two exceptions**~~ — **FIXED 2026-09-04.** The criterion forbids withholding a suggestion that is KNOWN, and only where doing so would not "jeopardize the security or purpose of the content". The rule READ "the announced error carries no instruction" and ASSERTED a different thing, so "Incorrect password" — required behaviour — was a conformance failure, and so was "That username is taken". **Downgraded to `secondary` — AND THE RULE WAS NOT.** `act-rules.ts` was edited, the audit was written, this row was marked DONE, and `rules.ts:467` went on passing `"conformance"` for a day, so a login page correctly saying "Incorrect password" was still reported as a hard conformance failure — the exact example the downgrade was argued from. **Three tests believed they covered it and all three were green**: one reads the static `ACT_RULES` array (correct, and never calls `ruleFindings`), one calls `ruleFindings` with a fixture of a bare graphic and a combo box (reaching neither function), and one asserts against prose that also said non-asserting. That is the limit of a fixture-driven test — it covers the paths its fixture walks, and a call site nobody built an input for is invisible however many such tests exist. `mapping-parity.test.ts` now derives both sides from SOURCE and compares them, mutation-checked both ways. The downgrade itself is decided by CLAUDE.md's own test rather than taste: the seven `secondary` subtypes are so "deliberately, BECAUSE THEY INFER THE FAILURE WHERE THE FOUR READ IT DIRECTLY". This one infers. It fires on the same evidence and stays rules-owned; it reports `cantTell`. | **DONE** | [audit](./wcag-criterion-audit.md) |

| | what would tell you it is fixed | detail |
|---|---|---|
| ~~**Eight container roles the GRAMMAR parses and the WORKER does not strip**~~ — **ANSWERED 2026-09-05, and the answer is that they should stay off.** Opened hours earlier as a question, because widening the worker's pattern blind would have been the wrong move — it feeds `dedupeKey`, and stripping `"list, "` from a key could collapse two genuinely different announcements into one. Ran the check the regex's own comment prescribes, over **19,297 sweep announcements from 2,178 captures**: the wider strip changes **2,583 keys**, reduces **0 to empty**, and collapses **0 distinct keys** — it merges nothing, which is the entire point of dedupe. And it is worse than churn: `"list, with 6 items, Opening times…"` becomes `"with 6 items, Opening times…"`, the container word gone and its item count left as a fragment, because *"the item count sits on EITHER side of the comma depending on the container"*. | **DONE** — the ledger records the measurement and the condition that would reverse it: a container announced as a bare `"<role>, "` with nothing between it and the name, which is the shape `form` and `section` have and none of the eight does. | [`container-prefix-parity.test.ts`](../packages/nvda-worker/src/container-prefix-parity.test.ts) |
| ~~**ALL 133 `3.3.2:unnamed-form-field` records were labelled for a criterion their page SATISFIES**~~ — **FIXED 2026-09-05: the subtype is gone, its records are `4.1.2:unnamed-control`.** W3C does not require a label to be ASSOCIATED for 3.3.2 (that is 1.3.1), and 133 of 133 bad pages carry visible label text — zero genuine failures, not most. Six acceptance pairs had the same shape *and* an empty `alsoFails`, claiming a criterion the page meets while omitting the one it fails. **4.1.2 rather than 1.3.1**, because labels here are asserted from EVIDENCE: a bare "edit" proves the accessible NAME is absent and cannot show whether a visible label exists elsewhere, so a 1.3.1 label would record a failure no layer detects — the reasoning that kept 2.4.7 and 3.2.1 off the F55 cases. `3.3.2:placeholder-only` is untouched and correct. | **DONE — but SIX dependents, not five, and the sixth was found by a four-hour chain rather than by a test.** `ACCEPTANCE_ACCOMPANYING`'s `bare-edit` entry went on adding `3.3.2:unnamed-form-field` to 10 held-out cases until 2026-09-05, when the `everything` chain stopped at its ninth stage with `3.3.2: 10 acceptance false negative(s) … 0.088 vs cut 0.668`. Nothing could have caught it earlier: a held-out case labelled with a subtype no head predicts raises no error at all — `eligible_records` drops it — and `rules:gate` reads the TRAINING export and never looks at the held-out set. **This row's own "each surfaced by a test" was the claim that made the sixth invisible**, because a count that reads as complete is not re-counted. The five that WERE test-surfaced: `ABSENCE_CRITERIA` drops 3.3.2 (its only survivor is `unavailable`, so suppressing the model would leave the criterion decided by neither layer), CLAUDE.md's counts, `rule-ownership.json`, a gate fixture, and the generated doc. Both ledgers balance at 24. **Still needs a retrain** to reach the model. | [audit](./wcag-criterion-audit.md) |
| ~~**8 of 25 corpus subtypes had no held-out acceptance coverage**~~ — **CLOSED 2026-09-05, 25 of 25 now covered.** Opened the same day assuming nobody had written the cases. **Seven could not be written**: `pair()` in `acceptance-matrix.mjs` took `probeForms` and `probeTables` BY NAME and dropped every other probe flag, and the generator enumerated the same two — so a case needing `probeFocus`, `probeFocusContext`, `probeTyping`, `probeNavigation` or `probeOrder` was inexpressible. *A gate that cannot represent a case cannot fail on it.* The remedy already existed and had been applied to ONE of two pipelines — the corpus generator forwards `probe*` by prefix and its comment says why: *"enumerating them is how this exact defect happened three times in one feature"*. **Fourth instance, inside the feature whose comment records the first three.** The eighth, `1.3.1:no-headings`, needed no probe and had simply never been written — *"nobody could" and "nobody did" have different fixes, and only one was a bug.* | **DONE** — both hops forward by prefix (mutation-checked), eight pairs added, and `acceptance-matrix.test.ts` pins the ledger EMPTY in both directions so a new subtype cannot silently lose coverage. Cost avoided: 3.2.1 and 3.2.2 had their mapping downgraded the same day and the gate could not have seen it. | [`acceptance-matrix.test.ts`](../packages/lab/src/training/acceptance-matrix.test.ts) |
| ~~**2.4.7 needs the focus EVENT, and 1.4.13's probe is BUILT**~~ — **1.4.13 IS DONE 2026-09-05; 2.4.7's probe is BUILT AND INERT.** 1.4.13 took four root causes, each hiding the next: the reveal baseline taken AFTER `probeFocusOrder` had already opened the panel; one Tab instead of walking the order; the verdict dropped at four hops so `interaction.focusReveal` was `undefined` on every capture; and `focusHeld` comparing a FOCUS-MODE read (`"B, o, o, k, i, n, g…"` — NVDA spells a field name in focus mode) against a BROWSE-MODE one. All 18 cases now discriminate. **And it is a RULE, not a head** — the acceptance gate refused a head with 12 positives against 412 parameters, and `focusRevealVerdict` READS Dismissable directly, which is ADR 0021's own test. Mapped `secondary` on the criterion's OWN exceptions, verified against W3C: *"unless the additional content communicates an input error OR does not obscure or replace other content"* — a census-growth count can tell neither. **2.4.7's probe is merged and inert**: a focus EVENT log over CDP, `focusin`/`focusout` in capture order. W3C lists F55 under 2.1.1, 2.4.7, 2.4.13 AND 3.2.1 together, so this is a finding the tool cannot make at all rather than one it misattributes. | **1.4.13 DONE.** 2.4.7 needs a corpus case and one capture. `FOCUS_SCRIPT_BLUR_WINDOW_MS = 50` is the number to check: the MARGIN is measured — 1,944 ms per real Tab stop, 38.9x — but no capture has yet recorded a script `blur()` to confirm it lands under 50 ms rather than merely under 1,944. | [audit](./wcag-criterion-audit.md) |
| ~~**3.3.7's within-page half may be reachable**~~ — **DECIDED 2026-09-05: it is, and the decision reversed the assumption made hours earlier.** The reason correction kept 3.3.7 out of scope on its EXCEPTIONS, taking them for judgements broad enough to make any rule unsafe. **Assuming that without reading them was the same defect one layer on.** W3C: the SECURITY exception explicitly covers password confirmation — *"having users re-validate their new string is allowed as an exception"* — and ESSENTIAL is narrow, defined as information whose removal *"would fundamentally change the information or functionality"*, with memory games its only example; **verifying accuracy does not qualify.** So the common conformant pattern is one NAMED exception rather than a judgement, and NVDA announces a password field distinctly — the discriminator is in the evidence. Now `reachable`. | **THE ORDER THIS ROW PRESCRIBED CANNOT WORK — corrected 2026-09-05.** It said "a corpus case, then a probe", per §17's rule that a probe built first produces evidence nothing can validate. That rule assumes SOME channel can witness the case, and here none can: `typedFeedback` records the page TITLE either side of typing (it was built for 3.2.2), and no channel re-reads a form after typing at all. So a case built alone is BLIND, which `check-signals` refuses — the case and the probe have to land together. Note the constraint the probe inherits, stated at `capture-core.mjs` where `typedFeedback` is sequenced LAST of the four focus-riders: it is the only probe that CHANGES THE PAGE'S CONTENT, and *"a later probe reading a form this one has filled in is measuring our own input"*. A 3.3.7 probe reads a form after filling it, so it is that hazard by construction and must be ordered against every probe that reads `formFields`. Sequenced behind `probeFocusReveal`'s first capture regardless — one unvalidated worker change at a time. **Map it `secondary`** — not for the exceptions, but because *"these two fields want the same information"* is a LABEL HEURISTIC: "Home address" and "Billing address" are similar strings and different information, which is the `vague_link_present` shape that took 2.4.4 to 27 false positives. | [audit](./wcag-criterion-audit.md) |
| ~~**`provisionRevision` hashes files as they sit on DISK, so it depends on `core.autocrlf`**~~ — **FIXED 2026-09-05, bundled with a stamp move that was happening anyway.** The stamp was a SHA256 over four files read with `Get-FileHash`, which hashes BYTES, and Windows git checks them out CRLF by default while this repo has no `.gitattributes`. Measured: the same four blobs at one commit stamped `dbb7d33409a9341d` from a CRLF checkout and `1052b80ca42398c7` from an LF one. **The reason it outranked its size: a box cloned with `core.autocrlf=false` could never be converged** — it would read INCONSISTENT for ever and re-provisioning would faithfully recompute the same wrong hash, making it the one drift on this fleet with no operator remedy. `ReadAllText` + CRLF→LF now, which also drops a BOM. Proven platform-independent: both byte-forms hash to `b438a80596e50062`. | **DONE** — `provision-stamp.test.ts` pins it, mutation-checked three ways; the fix was deliberately bundled with the `worker_edge_allow_downgrade` change so the stamp moved once rather than twice. | [`stamp-provision-revision.ps1`](../packages/worker-fleet/src/provisioning/stamp-provision-revision.ps1) |
| ~~**A capture stalled for 3.5 hours and neither timeout fired**~~ — **DIAGNOSED AND FIXED 2026-09-03**, without waiting for a recurrence. `prepareDesktop` was awaited OUTSIDE the `try`, so it sat outside both the `finally` that releases `busy` and the 520 s hard timeout, which wraps the capture one level further in. It spawns PowerShell three times, and this repo already records PowerShell taking 25 s on a loaded guest. Bounded at 60 s of its own, moved inside the `try`, and a timeout is recorded and continued rather than rethrown. **The backlog said this "cannot be scheduled — it needs a recurrence"; it needed reading the function.** | [known-gaps §37](./known-gaps.md) |
| **Ten of the 28 model features read a `0` that means "nobody asked"** — sized 2026-09-03 at **61.7% / 56.1% / 65.3%** artefacts, so the problem is real. Both obvious routes are closed: masking was REFUTED ([§15](./not-working.md)) and giving the model `observed` was DECIDED AGAINST ([§14](./not-working.md)). | **BUILT 2026-09-03 as a FEATURE CROSS; whether it SHIPS is undecided.** The existing feature crossed with whether it was measured, so "never asked" is the all-zeros row and no column carries a free negative weight. `FEATURE_SCHEMA_VERSION` v18 → v19, `schema-migration.json` open. **What remains is the retrain** — the four gates cannot be run until the in-flight recapture finishes, and a failure means REVERT, not adjust. It does NOT close the five `UNREACHABLE_WITHOUT_PERTURBING` entries: the cross fixes a conflation, and a subtype that never runs the form probe has none to fix. | [known-gaps §35](./known-gaps.md) |
| ~~**3.1.2's MARKED-BUT-SILENT failure**~~ — **REFUTED AND WITHDRAWN 2026-09-05, and the experiment is what it was for.** Both variants ended with the same `lang` on the same element and differed only in WHEN it was applied. The bet was that NVDA builds its browse buffer at load and would be silent on the scripted one. It is not — measured on `language-marked-silent-poem.bad`, transcript line 3: `"Spanish (not supported), La ciudad duerme bajo una luna clara y el rio sigue su camino."`, with `"English"` announced on the way out. `refreshBrowseBuffer` picks the change up, exactly as the case's own comment allowed for, so the variants are indistinguishable in speech. Three cases withdrawn on `reportEmphasis`'s precedent; 1648 → 1645. **It surfaced as BLIND, not the CONTAMINATED the comment predicted** — `language-unmarked` fires when the language name is ABSENT, so firing on NEITHER variant reads as blind. Right refutation, wrong verdict label, and a gate's verdicts are not interchangeable. | **DONE** — and 3.1.2's residual has no known trigger left, since the one mechanism that looked able to produce a marked-but-unannounced passage does not. The lead-naming rule these cases taught outlives them and is now guarded in both matrices. | [known-gaps §36](./known-gaps.md) |
| **One corpus pair was split by the INSTRUMENT, and "reproducible" was a RE-READ** — `icon-button-unnamed.good` records `pointerParkFailed` while its mate does not: 4 of 6,975 captures, 1 splitting a pair. **Settled offline 2026-09-03, and both of the earlier guesses were wrong.** The pairing hypothesis is REFUTED: `mateOf` is exact string surgery on `<case>.<variant>`, basenames are unique in a flat directory, and nothing anywhere does prefix matching — so the split names the file it means. And the mechanism is refuted too, more firmly than before: `parkPointer` runs inside `bringUpCaptureEnvironment` **before the page is navigated to**, and takes no page-derived argument at all, so a page-specific failure is not merely implausible, it is impossible. What actually broke was the reproduction: `previouslyCaptured` returns a non-empty set **only** under `--resume --no-cache` and skips on the capture FILES, so the recapture skipped this case and the "identical split" was the same bytes re-read. Two readings of one file are not two measurements. **Read offline 2026-09-05, no fleet needed: `parkPointer` (`pointer.mjs`) times `ms` cumulatively across BOTH attempts from one `startedAt`, and that is the field that actually discriminates — the error TEXT often cannot.** A genuine **timeout** (PowerShell exceeding the 5 s `PARK_TIMEOUT_MS` budget — this repo has separately measured PowerShell startup at 8–25 s on a loaded guest, `known-gaps.md`) reads `attempts: 2`, `ms` **≈10,000** (Node kills each attempt at its own 5 s ceiling regardless of how much longer PowerShell needed), `error` the BARE reconstructed command line with nothing appended, because the child is killed before it prints anything. **A transient non-zero exit with no stderr** — the shape already observed pre-retry (12 of 4,926, "every observed failure is `Command failed: powershell ...`") — produces the IDENTICAL error text with `ms` in the tens to low hundreds: **error text alone cannot tell these two apart, only `ms` does.** **An outright spawn failure** (missing binary, EACCES, a fork limit under load) never reaches "Command failed" phrasing — Node's raw system-error text instead, e.g. `spawn powershell ENOENT`, `ms` near-zero. **PowerShell running and genuinely throwing** (a corrupted assembly, `SetCursorPos` itself failing) is the one candidate carrying informative text — the .NET exception appended after the command line — with `ms` well under a second. | On whether it should REFUSE: **escalate, do not hard-fail.** An unparked pointer is never legitimate evidence — unlike the empty-probe case this file protects, there is no reading of a failed park as *the finding*, so retrying costs no signal, and "4 in 7,000" understates it: pre-retry 9 of 12 failures (75%) split a pair, post-retry 1 of 4 (25%) still did. Recommend a new `FAULT.POINTER_PARK_FAILED` thrown after both attempts, added to `worker-recovery.mjs`'s `RECOVERABLE` beside `SCREEN_READER_MUTE`/`SCREEN_READER_START_FAILED` — the existing one-shot fresh-NVDA retry, not a new mechanism, at roughly one extra ~48 s restart per ~1,750 captures. `pointer.test.ts`'s own "never throws" test would have to become "throws after two attempts", a deliberate reversal of a tested decision — not made here. **Still needs a live occurrence to say which candidate actually produced the split**; this is what reads it when one appears. **SETTLED 2026-09-05, offline, with no capture at all: all 11 are TIMEOUTS, and `pointer.mjs`'s own premise is refuted by its own mark.** The four candidates above were applied to the 11 `pointerParkFailed` marks on disk. Every one reads `ms` between **5,032 and 9,134** against a `PARK_TIMEOUT_MS` of 5,000, and **none carries an `attempts` field** — so all 11 predate the retry and each is ONE attempt that hit the ceiling, which is the `attempts: 2, ms ≈ 10,000` prediction with the attempt count halved. A transient non-zero exit returns in tens to low hundreds of milliseconds; none does. So `PARK_ATTEMPTS`' comment — *"the observed failures are transient spawn failures"* — is wrong, and the retry was built on it. **The `ms` field discriminated the whole time and nobody read it**, which is this register's own recurring shape: a diagnostic that was recorded, correct, and unconsumed. `timedOut` is now on the mark, read from `execFile`'s `killed`+`signal` via the `cause` `setCursorPosition` already attached, so the next occurrence states it instead of inviting arithmetic; both fields are required, because a guest shutting down is also `killed: true` and filing a real outage under "this is fine" is the failure in the other direction. **The retry is KEPT despite the refutation**, on a different argument: `Add-Type` compiles C# on first use, so a cold attempt can genuinely be slow where a warm one is not. **`PARK_TIMEOUT_MS` is NOT raised**, because nothing measures how long PowerShell actually needed — only that it exceeded 5 s — and raising it on that would be a guess replacing a guess. The `FAULT.POINTER_PARK_FAILED` recommendation is **withdrawn**: it treats this as a screen-reader fault recoverable by restarting NVDA, and a PowerShell timeout is not. | [not-working §11](./not-working.md), [`pointer.mjs`](../packages/nvda-worker/src/pointer.mjs) |

| ~~**EVERY criterion we make a claim about is checked against its official text**~~ — **DONE 2026-09-04: all 17 audited — the 11 `assessed` and the 7 `partial` — 9 clean and 8 with findings.** Every rule that can ASSERT has been read against its criterion. The findings are separate rows; the two that matter are the asserting ones. What remains of the audit is the 33 `out-of-scope` REASONS, which are claims too but of the harmless kind — a misread there produces a finding we never make, not one we make wrongly. | **DONE** — the record is [`docs/wcag-criterion-audit.md`](./wcag-criterion-audit.md), the repeatable procedure is the [`wcag-criterion-check` skill](../.claude/skills/wcag-criterion-check/SKILL.md). | [audit](./wcag-criterion-audit.md) |

| ~~**2.4.6 covers HEADINGS and the criterion says "headings AND LABELS"**~~ — **CASES BUILT 2026-09-05, pending capture.** Ten `label-vague-*` pairs: both variants carry a proper `<label for>` and differ only in whether its text says anything ("Field" against "Field of study"). **NOT a rule for ABSENT labels** — W3C says 2.4.6 "does not require headings or labels" and points at 3.3.2, which 115 `form-unlabelled` pairs already cover. Kept in `2.4.6:regex` rather than a new subtype, on the SIGNATURE argument `4.1.2:missing-role` records: a vague heading and a vague label are both *a generic name announced with a role*, one signature, where that head was asked to learn a genuine disjunction. Every vague word also appears in a conformant sense, so the word predicts nothing — the 2.4.4 lesson applied at build time. Measured: 10 added, **0 re-bucketed**. | `check-signals` on the captured pairs. The structured feature `generic_heading_present` is heading-specific and reads 0 on these ten, so the label half rests on the encoder until `generic_label_present` exists — **which must wait for the migration verdict**, since a second feature change inside an open migration makes that verdict uninterpretable. | [audit](./wcag-criterion-audit.md) |
| ~~**1.1.1's CONTROLS/INPUT exception is stated but not enforced**~~ — **FIXED 2026-09-04, and the capture is what settled it.** The criterion: *"If non-text content is a control or accepts user input, then it has a NAME that describes its purpose."* An `<img>` inside a named button or link conforms through THAT control's name. `graphicUnnamed` counted them anyway and refused two verdict runs on `1.1.1 cqc.org.uk` — where the new `graphicUnnamedDetail` shows both nameless images inside a link named "The Care Quality Commission", the site logo, marked up exactly as it should be. **Not a blanket ancestor test**: only a CONTROL's name discharges the requirement, so a nameless image inside a named `region` is still a finding. | **DONE** — mutation-checked both ways, and the fix introduced a false NEGATIVE that the existing census test caught: id-less nodes collided on the string `"undefined"`, so an image with no parent was ADOPTED by an unrelated named link. Absent read as a value, inside a fix for telling two absences apart. | [audit](./wcag-criterion-audit.md) |

| ~~**4.1.3 covers ONE of the criterion's four status-message categories**~~ — **CASES BUILT 2026-09-05, pending capture.** Six pairs: three WAITING-state ("Loading your report") and three PROGRESS ("Step 3 of 10 complete"), built from the existing `statusVariant` with `initial`/`updated`/`expected` as parameters whose defaults reproduce the original case byte for byte — verified by hashing, not assumed. **§18 dictated the design**: only *button trigger + synchronous update + polite region* is deterministic (6 of 6; a checkbox is 2 of 6, a deferred update 0 of 6), so no `setTimeout` appears anywhere and a waiting state is built synchronously on purpose — the criterion asks whether the message reaches AT without focus, not that the wait be real. Measured: 6 added, **18 re-bucketed** (36 captures), all derived variants of the `filter-status-silent` family. | `check-signals` on the captured pairs, reading `formChanges[].after` — the delta taken before any navigation, which is speech the page produced on its own. Never `postSubmitFields`: a re-read cannot show presentation "without receiving focus". | [audit](./wcag-criterion-audit.md) |

| ~~**4.1.2's SETTABILITY clause is absent from our enumeration of it**~~ — **FIXED 2026-09-05, and the fix found two more stale claims in the same note.** The criterion has three clauses; the note said "two of three failure modes are covered" and counted the role-less `<div onclick>` as the third, but that is a second failure mode of the FIRST clause (no role) — so clause 2 was enumerated nowhere and the entry read as covering the whole criterion bar one gap. **The clause is also NOT REACHABLE here, which is now stated rather than left open:** it asks whether an AT can programmatically SET a value (a UIA/IA2 ValuePattern question), while our capture drives NVDA, which operates controls by EMULATING THE KEYBOARD — so a control the AT cannot set presents as one that does not respond, which is 2.1.1's failure and indistinguishable from it in speech. Structural, so no corpus case closes it. Also corrected: the note called `state-change-silent` head-decided with 18 free vetoes, eleven days after ADR 0021 moved it to the rules, and the file HEADER carried its own copy of the clause/mode conflation. | **DONE** — two new assertions in `criterion-coverage.test.ts`, mutation-checked against the actual pre-fix note. | [audit](./wcag-criterion-audit.md) |

| ~~**BOTH stage-12/13 blockers are CLEARED, and ONE new finding replaced them**~~ — **CLOSED 2026-09-05: `rules:real-pages` is at ZERO problems.** — measured 2026-09-05 by re-capturing and re-running the gate rather than by reasoning. `1.1.1` on `cqc.org.uk` is gone: today's capture reads `graphicUnnamed: 0` and `graphicUnnamedDetail: []` where the failing run read 2, so the 1.1.1 Controls/Input exception fix did what it was written to do — the nameless images were inside a named link. `3.2.1` on `service-manual.nhs.uk` is gone too, and its evidence says why: `focusContext` reads `titleBefore === titleAfter`, so that rule was silent and the finding had come from elsewhere. **`rules:real-pages` now reports `FAIL — 1 problem` against 2, with 5 findings GONE** (two of them the `3.3.2` pair, expected — that subtype was deleted). The survivor is **`2.4.3` on `ico.org.uk/action-weve-taken/enforcement/`**, and it is NOT yet read. Two leads, opposite conclusions: the baseline ALREADY accepts `2.4.3` on the sibling page `ico.org.uk/for-the-public/` and ICO's `claimExcludes` does not cover 2.4.3, which argues it is the same real order difference somebody has reviewed once; against that, transcript line 1 is `button, collapsed, Cookie options` while tab stop 1 is `Skip to main content`, and line 14 carries `section, grouping` — the Edge 152 container — so a consent overlay and a grammar change are both in the frame. | **Read the evidence, then decide which of the three causes it is.** Do NOT `--update` to clear the gate: that is how a baseline absorbs a defect, and the sibling-page precedent is a reason to look, not a reason to accept. **THE SURVIVOR IS READ AND ACCEPTED, and this row said it was not for six hours after it was.** `7f3dd59` accepted `2.4.3` on `ico.org.uk/action-weve-taken/enforcement/` into the baseline the same morning, and the row went on naming it as the open blocker — which is this register's own defect, a fact stated twice with the copies drifted. **Re-read independently 2026-09-05 rather than taken on the commit's word**, by fetching the capture and running `ruleFindings` against it: one finding, `mapping: "secondary"` so it REFERS rather than asserts, and its evidence names exactly one control out of position — *"Cookie options"* is transcript line 1 of 70 and tab stop 82 of 82, with every other control in identical order in both channels. So it is cause 3, the finding is right, and none of the three suspects in the original row is what produced it: the `section, grouping` line from Edge 152 is present at line 14 and is not what the rule fired on, and the sibling-page precedent turns out to be the SAME site-wide widget rather than a coincidence — `for-the-public` reads the identical shape, reading order 0 of 99 against tab order 71 of 75. ICO's `claimExcludes` is `["1.1.1","1.3.1","4.1.2"]` and does not cover 2.4.3. **`rules:real-pages` is at zero problems.** | [audit](./wcag-criterion-audit.md) |
| ~~**REOPENED 2026-09-06 — the test still holds, the count did not**~~ — **CLOSED 2026-09-05: both vetoes are unclosable by definition, not open corpus work.** `form_change_observed_absent` (`asked AND NOT bool(formChanges)`) reads "the probe ran and found no control to press", not "the page was silent" — traced from `cross_with_observation` and the activation function that pushes a `formChanges` entry on every completed press, silent ones included. 3.3.1 and 4.1.3 are the two subtypes whose whole point is a submission getting rejected or ignored, so a control to press is guaranteed by construction: 143/143 positives of 3.3.1 and 149/150 of 4.1.3 carry `probeForms: true` (the one exception, `filter-status-silent-link`, activates via `probeNavigation` and lands in the all-zeros "never asked" row instead). Measured on the captures (no export needed — `interaction.formChanges` predates the schema): 0 of 500 asked-and-found-nothing. Now declared `IMPOSSIBLE_BY_DEFINITION` in `corpus:unclosable-map`. | **DONE** — classification added to `audit-corpus-starvation.mjs`, `not-working.md` §2 updated with the resolution and why it differs from "a veto silently accepted". Whether these two subtypes should move to rules instead (ADR 0021) is a separate, still-open decision, not made here. | [not-working §2](./not-working.md) |

## The corpus, measured on the lab 2026-09-05 — and 1.4.13 went from BLIND to full real-page coverage

Read from `retrain`'s own transcript rather than from a stage banner, which is the difference between a
number and a claim about a number.

```
capture          1,645 cases, ALL cached, 0 failed          — the cache is warm and valid
check-signals    1,645 discriminating, 0 blind, 0 contaminated, 0 uncaptured, 0 stale   PASS
export           2,796 records
build-realism    37 realism records from 39 real pages (2 rejected as truncated)
```

**`1.4.13: 37 of 37`** — full real-page coverage, from zero. That is what `probeFocusReveal` bought, and
it is the criterion that started the day at 18 blind cases. `2.1.1`, `2.1.2`, `2.4.1`, `2.4.2`, `2.4.3`,
`3.2.1`, `3.2.2` and `3.3.3` are also 37 of 37.

**`4.1.3: 0 of 37`, and that is CORRECT rather than a shortfall** — see the 4.1.3 row for both mechanisms.
The number was independently claimed as `1 of 37` during this session and refuted from two directions: the
run's own transcript, and the filter at `build-realism-tier.mjs:318`, which is
`realPageFor(url)?.role === "training"` while the only page carrying a `formState` is `calibration`. The
docstring twelve lines above that filter says *"the 7 CALIBRATION pages are excluded"* and the corpus now
has **49** of them — a stale prose count over a correct filter, which is exactly the shape that produced
the wrong claim. **Read line 318, not the paragraph above it.**

**`check-signals` PASSES on the lab and REFUSES locally**, and both are right: every local copy of the
manifest predates the case definitions, so the local one correctly says *"this is a STALE BUILD, not a
broken signal"* and stops. A gate that refuses a corpus it cannot attribute is doing its job; the
authoritative answer is `lab:job -e job=check-signals`.

## CLOSED 2026-09-05 — three guards, each replacing a plausible wrong answer with a refusal

Records, not work. Kept on this page rather than deleted because each names a MEASURED cost, and the
measurement is the argument for the guard — but nothing here is open, and a scan for open rows should
not return them.

| what broke | the guard now in place |
|---|---|
| **`fleet:deploy` rebooted ten machines mid-capture and killed 12 in-flight captures.** `sleep.yml` had refused a busy worker for weeks and `provision-role.yml` had copied it; the one play whose own header explains at length that it REBOOTS every guest checked nothing, and neither did `provision.yml`. | Both refuse now, HARD rather than skipping — a half-deployed fleet runs two `codeVersion`s and `assertFleetRunsThisCheckout` then refuses every capture run, so skipping the busy box leaves you a stale fleet AND a destroyed run. `-e a11y_force_deploy=true` overrides and the refusal names it. `busy-worker-guard.test.ts` DISCOVERS every playbook targeting `a11y_workers` and fails until a new one is classified; `recover.yml` and `restart.yml` are exempt in the OTHER direction, since both exist to act on a worker that is busy AND wedged. Mutation-checked by stripping the guard and by adding an unclassified playbook, and proved against the live fleet — the refusal fired, `failed=1`, `changed=0`. |
| **The deploy's own output showed the WRONG RUN.** `followUnit` ran `journalctl -u <unit>` with no bound, which returns every run since boot oldest-first — so the guard's first correct refusal was read as a successful deploy, because the PLAY RECAP above it was seven minutes old. **The fourth instance of the journal-window defect**, in the one place that had no window at all. | Bounded on `_SYSTEMD_INVOCATION_ID`, which survives here where it does not for `lab:job` (the unit is `--remain-after-exit` and is stopped and `reset-failed` before each run). An empty id falls back to the whole journal and SAYS SO. `journalScope` is pure and exported, the id is validated as 32 hex characters rather than interpolated into a remote shell on the box holding the fleet key, and relaxing that to a truthiness test fails exactly the injection case. |
| **`capture:explain` said nothing about the interaction probes.** `whatItAsked` reads `observed`, which covers the SWEEP channels only — so `focusReveal`, `focusEvents`, `focusContext`, `routeChange` and the rest had verdicts sitting in diagnostic marks that nothing displayed. Reading `cap.focusReveal` (it lives under `interaction`) returned `undefined` and produced the conclusion "the 1.4.13 probe never ran", which was wrong and would have cost a recapture round. | A `WHICH INTERACTION PROBES RAN?` section, in three states — never ran / ran and could not ask / ran and found nothing — printing whatever fields the mark carries rather than a per-probe list of which ones matter. **The both-directions test found two real errors on its first run:** `formFill` was named while 1,182 captures carry `formProbe`, one probe with two names across a protocol version, so keying on either alone reports NOT ASKED for half the corpus; and `dialogEscape`, `typingLanding` and `arrowNavLanding` were on disk and named nowhere, leaving 2.1.2's dialog question, 3.2.2 and the arrow probe unaccounted for. |

## OPEN — the census fix does not reach the focus-event path, found by adversarial review

**Found 2026-09-05 by a peer reading today's merges against this repo's OWN defect catalogue rather than
for general quality, and confirmed independently before being acted on.** It is the gap between two
commits rather than a fault inside either, which is why both passed their own reviews.

`f95c95d` made a suspect census read as `null`, and its commit records checking every
`census.heading === 0` consumer. That was the right check for the CENSUS and the wrong SCOPE for the
uncertainty underneath it: `choosePageTarget` taking the wrong CDP target — the bathingwaters/lbhf
Cookiebot-iframe shape the whole fix exists for — also reaches the F55 focus-event detector, through the
same `pageTarget()`/`evaluateOnPageTarget()` machinery, and nothing there is protected. Verified at HEAD:

```
evaluateOnPageTarget   returns { value, targetMatch, targetUrl, expectedUrl }  — NO candidates
collectFocusEventLog   passes targetMatch through
focusEventVerdict({ events, error })   does not destructure targetMatch at all — silently dropped
```

So a mistargeted capture now correctly suppresses a census finding and still produces an F55 finding
computed from focus events on **the wrong document**, which `addFocusEventFindings` reports as 2.4.7.
**"A remedy applied at ONE call site when the behaviour reaches several"** — this file's most expensive
recurring shape, and the fifth recorded instance.

**Bounded, and the bound is real:** `mapping: "secondary"` so it refers rather than asserts, and F55 only
runs during `probeFocusOrder`. A wrong referral is still wrong.

**The design decision is where the predicate LIVES, and it is the interesting half.** The check belongs in
`focusEventVerdict`, not in `rules.ts` — the argument `f95c95d` made for the census applies unchanged:
handing `targetMatch` to the rule layer leaks capture-mechanism knowledge into every rule reading the
channel and repeats one judgement at each site. `pageCensus`/`domCensus` were the census's shared seam;
`focusEventVerdict` is this one's. That forces the predicate to exist worker-side in `.mjs` while
`censusTargetIsSuspect` lives in TypeScript, so the copies can be neither deleted nor derived across the
boundary — **pin them equal with a test**, CLAUDE.md's third remedy and the one `name-normalisation.test.ts`
already uses for the same language boundary.

| | |
|---|---|
| **2.4.7's F55 rule ships and its LOWER BOUND is unverified.** `FOCUS_SCRIPT_BLUR_WINDOW_MS = 50` separates a script stripping focus from an ordinary Tab transition. The negative side is measured twice on real pages — 24 real focusin→focusout pairs at a minimum gap of 633 ms, a **12.6× margin**, and an earlier 38.9× on a different page — so it will not false-positive. **No capture has ever recorded a real script `blur()`**, so nothing says whether a borderline true positive lands under 50 ms. The failure direction is the safe one (a too-tight threshold is SILENT, not accusatory) and the rule is `secondary` so it refers rather than asserts — which is why it ships rather than waits. | Capture `focus-removed-on-receipt-{order,claim,booking}` and read the real gap. The cases exist in `case-matrix.mjs`; the chain captures them. **Do not tune the threshold to make a test pass first** — a canary that cannot express the fault is worthless, and this register records three occasions when a clean result from a check that could not have failed was read as confirmation. |
| **`rule-ownership.json` has no 2.4.7 entry.** It is keyed on the corpus's own declared subtypes and there is no 2.4.7 subtype yet, so the omission is currently correct. The moment the `focus-removed-on-receipt-*` cases declare one, that file needs `decidedBy: "rules"` — and until it does, `asserting-subtypes.test.ts` and the shortcuts audit's rule-decided shield both read 2.4.7 as model-decided, which it is not. | Add it WITH the case, not after. This is the `3.3.2` shape: a subtype whose ownership nobody recorded, found later by a gate that could not attribute it. |


## Accepted designs, not yet built

| | what would tell you it is fixed | detail |
|---|---|---|
| ~~**4.1.3 real-page grounding: the config is WIRED, the capture has not run**~~ — **THE CAPTURE HAS NOW RUN, and the SUCCESS CRITERION THIS ROW NAMED IS UNREACHABLE BY CONSTRUCTION. Both halves measured 2026-09-05.** The capture: `-e role=calibration`, 49/49, zero failures, and verified on the page rather than on the run's exit code — `w3.org/WAI/demos/bad/after/survey.html` came back with `interaction.formChanges` holding 2 entries and `postSubmitFields` holding 15, sweep log `submit "submit, button" -> "Citylights Survey - Submission Failed …"`. The configured form was filled and submitted on a real site, which is what this row was for. **But this row said the test was `build-realism` should stop reporting `4.1.3: 0 of 37`, and it cannot.** Two independent reasons, neither of which is a defect: (1) **the survey page is `role: "calibration"`, and `build-realism` excludes calibration pages by design** — *"they are the measurement, and training on them would destroy the only independent read we have"* — so the one page carrying 4.1.3's real-page evidence can never enter the realism tier; and (2) `build-realism-tier.mjs` carries a twenty-line comment arguing that `4.1.3: 0 of 37` is the HONEST number, because the second channel `routeChange.announced` is deliberately masked: `probeNavigation` follows the FIRST link and *"on essentially every real page the first link IS the skip link"*, so labelling that silence 4.1.3 would teach the head that silence after any link is a failure, on 37 pages at once — ADR 0015's free-veto problem running the other way. **The chain confirmed it: `4.1.3: 0 of 37` after the capture, exactly as both mechanisms predict.** So the row asked for a capture that could never move the number it named, and it went unnoticed because the capture is genuinely the right thing to do and the number is genuinely the wrong test for it. This is the register's own *check the premise before re-running the expensive thing* rule, one step later: the expensive thing had already run. **What the capture actually bought, and it is worth having:** 4.1.3 is now grounded on a real page as a CALIBRATION measurement, which is what a calibration page is for — the abstention sweep and the false-positive count can see it. What would move the realism number is stated in `build-realism-tier.mjs` and is corpus work, not capture work: *"a real page where the pressed link is known to be a FILTER rather than a skip link — a fact about the page, so it belongs in `real-page-corpus.mjs` beside `claimExcludes`"*. | **Capture DONE. The realism count is a separate, corpus-shaped row** — a filter-link page, declared as one | [known-gaps §29](./known-gaps.md) |

## Open opportunities — measured, not yet acted on

| | what would tell you it is fixed | detail |
|---|---|---|
| ~~**A 60 s timeout ABANDONS `prepareDesktop` rather than cancelling it**~~ — **FENCED 2026-09-05, and the blast radius was CONFIRMED before anything was built rather than assumed.** `dialogCache` and `foregroundCache` are read only inside `readiness()`, so nothing an abandoned preparation writes can reach a capture RESULT — the consequence is a stale-but-fresh-looking `/health`, which can misdirect dispatch and never corrupts a verdict. And `marks` cannot cross captures at all: it is a fresh `[]` per `runCapture`, so a late `push` lands in its own capture's array. That bound is what made a fence proportionate instead of real cancellation, which changes the capture's own timing and failure surface and would need a live capture to validate. `prepareDesktop` now takes an `AbortSignal`, checked after each await and before the write that await's result feeds, aborted by the same `.catch()` that already handled the timeout; a dropped write is RECORDED as `desktopPrepareAbandoned` naming the step, because a remedy that leaves no mark is one nobody can confirm ran — `refreshBrowseBuffer` was inert on every capture ever taken and three green runs would have vouched for it. `prepareDesktop` and the two caches moved to a new `desktop-prepare.mjs`: `server.mjs`'s import graph reaches guidepup through `capture-core.mjs`, which throws at import with no screen reader, so a test importing from `server.mjs` would pass on a Mac and die in CI — the same seam `capture-pure.mjs` exists for, and `tests-run-without-a-screen-reader.test.ts` caught it on the first attempt. `worker-files.mjs` is 24 now. Three tests against the real mechanism including the realistic mid-flight case (the dialog write lands before the deadline and is KEPT; only the foreground write arriving after is dropped), mutation-checked by gutting the fence. | **DONE** | `desktop-prepare.mjs` |
| ~~**`nearestNamedAncestor` stops at the CLOSEST named ancestor, which may not be the CONTROL**~~ — **FIXED 2026-09-05, and it WAS a defect rather than an unobservable rule.** The 1.1.1 Controls/Input exception asks *is this image the content of a control*, and the walk answered a proxy: *does the nearest NAMED ancestor happen to be a control*. An intermediate named non-control wrapper — a `div` carrying its own unrelated `aria-label`, which a component library adds routinely — stopped the walk there, the role test then failed against a node the exception was never asking about, and a conforming image was counted as a finding. The walk now tracks TWO answers in one bounded pass over the same ancestor chain: the nearest NAMED ancestor (kept, as the general diagnostic) and, independently, the nearest ancestor whose ROLE is a control; it exits early only once BOTH are settled, so a named wrapper can no longer end the search for a control further out. **The control search deliberately stops at the FIRST control ancestor, named or not** — an image belongs to the control it is nearest to, and chasing a farther NAMED control past an unnamed nearer one would answer a different question than the exception poses about this image. Note this cuts both ways and that is intended: the shape *unnamed control inside a named control* now correctly does NOT exempt, where the old proxy did. **`graphicExempted`/`graphicExemptedDetail` make the exempted population visible**, bounded at 12 like its sibling — the 92-page search could confirm the finding side and structurally could not examine the exemption side, which is exactly where the defect hid. **NO `CAPTURE_PROTOCOL_VERSION` BUMP, and it was MEASURED rather than assumed.** The new fields are additive and nothing reads them yet; the question is whether `graphicUnnamed`'s VALUE can move. It cannot, on either corpus: **no synthetic page puts an image inside a control at all** — every `<img>` in `case-matrix.mjs` and `acceptance-matrix.mjs` is a bare sibling of a `<p>`, and `unnamedIconVariant`'s glyph is `aria-hidden` so it never reaches the AX tree — and all 19 real-page instances have `ancestorRole` `rootwebarea` (18) or `main` (1), meaning no named ancestor before the document root and therefore no control ancestor either. Old and new agree on every page in both corpora, so a 4.5-hour recapture would buy nothing. **The one thing still worth knowing** is the finding that fell out of the original search and is unaffected by this fix: 14 of the 19 are the SAME third-party Cookiebot consent-widget icon on two unrelated sites, so the real-page unnamed-graphic population is dominated by one vendor's widget rather than by the pages under test — `rules:real-pages`' own *furniture, not the page* caveat reaching a rule that does not apply it. | **DONE**; the Cookiebot furniture observation stands on its own | `browser-session.mjs` `nearestNamedAncestor` / `recordUnnamedGraphic` |
| **Two NVDA settings that change WHAT IT SAYS are not pinned, so drift is invisible** — **WRITTEN AND PROVEN 2026-09-05 on `agent/nvda-settings-pin` (66eda19); deliberately NOT merged, because the digest is a cache key and must ride the next key change rather than throw a recapture away.** **THE REASONS THIS ROW GAVE WERE WRONG, and the correction is the point.** It said `autoLanguageSwitching` is the PRECONDITION for the `reportLanguage` we pin. Read from NVDA's own source (`source/config/configSpec.py`, `source/speech/languageHandling.py`, fetched rather than inferred): `shouldMakeLangChangeCommand()` — the gate deciding whether NVDA inserts a language-change marker at all — is `autoLanguageSwitching **OR** reportLanguage`. So `reportLanguage` alone, with `autoLanguageSwitching` off, still speaks the language, and the inference was the repo's own favourite mistake: one setting's precondition read off a sibling's shape. What `autoLanguageSwitching` ACTUALLY preconditions is `reportNotSupportedLanguage` (`shouldReportNotSupported()` is `autoLanguageSwitching AND reportNotSupportedLanguage != "off"`) — that is the real `[documentFormatting]`-shaped pair. And separately it changes `reportLanguage`'s own SPOKEN STRING: `getLangToReport()` reports a root code (`"es"`) when on and the full code (`"es_ES"`) when off. Both still worth pinning, for stronger reasons than the row had. The row's claimed safety net is also gone: the `language-marked-silent-*` pairs it cited were **withdrawn as refuted** the same day, so nothing would surface a drift by accident either. **Both are in `[speech]`, not `[documentFormatting]`.** `captureSettingsDigest` moved from `server.mjs` (which imports capture-core and therefore guidepup, so it was unreachable from a portable test) to `nvda-logging.mjs`, pure and exported; the new test is that the digest MOVES when `CAPTURE_SETTINGS` gains an entry, mutation-checked by freezing the digest and confirming exactly that one test fails. | **Written; held.** Merge it with the next `CAPTURE_SETTINGS`/`CAPTURE_PROTOCOL_VERSION` change. | [known-gaps §36](./known-gaps.md) |

## Decided — not defects

Listed so nobody reopens them by mistake, including me.

| | why |
|---|---|
| **`announcedErrorText` reads `postSubmitFields` unfiltered by `signal.control`** | Raised and argued 2026-09-05, decided to LEAVE. Filtering by control is technically possible — entries do carry a field-label prefix — but `postSubmitFields` ALSO carries page-level entries with no field attribution at all, and GOV.UK's error-summary pattern is exactly that shape and is a calibration page in the corpus. Filtering strictly would make the function blind to it, which is arguably the more important real case. Inert today regardless: corpus cases are single-field fixtures by ADR 0015's one-defect-per-page discipline, and the function runs only at corpus-labelling time, never against a live capture. **The obvious fix would be a regression, not an improvement.** |
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

## The next action — and as of 2026-09-05 17:30 it is RUNNING, so the action is to read its verdict

**`npm run lab:job -- -e job=everything -e ref=main` was dispatched at 17:29 on `ea03f8e`.** Everything
below is what it is doing and what to read when it stops; nothing here needs starting.

**Why `everything` rather than `--pipeline=migration-verdict`, which the previous version of this section
recommended.** They sequence the same work; the difference is where the sequencing LIVES. `lab:pipeline`
runs the ordering in a local node process, so each stage is a supervised unit and the thing deciding what
comes next is a laptop — measured 2026-08-26, five local watchers were killed during one capture and each
time the unit survived exactly as designed while the orchestration did not, so nothing after it started.
As a job the whole chain is ONE unit that outlives the ssh connection, the playbook and the laptop.
`lab:pipeline` is still right for a SHORT chain you want to watch.

**The prerequisite that route does NOT perform for you, and it was done:** `fleet:deploy` at the same ref.
Only the control plane holds both credentials (ADR 0012), so the lab cannot deploy the boxes it is about
to capture on, and `assertFleetRunsThisCheckout` refuses the run 30 seconds in otherwise.

**The real-page captures are already on disk and are fresh**, which is why the chain can start at
`retrain`. Both roles ran today against the current fleet: calibration 49/49 and training 39/39, zero
failures, and the calibration half carries what this whole sequence was waiting for — verified on
`w3.org/WAI/demos/bad/after/survey.html`: `interaction.focusReveal` present (1.4.13's probe, `asked: true`),
`focusEvents` with 116 entries (2.4.7's), `formChanges: 2` and `postSubmitFields: 15` (4.1.3's grounding,
the configured-form path actually submitting). `build-realism` reads those from disk, which is why
`retrain` ending with it is pinned by a test — the other order scores a dataset that does not contain the
change being tested.

### The nine stages, and which of them is a gate

`retrain` (generate → capture → check-signals → export → build-realism), `export-acceptance`,
`grants-audit`\*, `applicability-audit`\*, `train`, `shortcuts`\*, `acceptance`\*, `promote`\*,
`release-gate`\*. Starred stages are gates and the chain STOPS at the first one that fails, naming what
did not run.

### What to read when it stops, in this order

```bash
npm run lab:status -- -e job=everything     # systemd's view, the journal BOUNDED to this run, progress
npm run lab:log -- -e job=everything        # the job's own output, unwrapped
npm run lab:fetch -- -e artifact=everything-transcript   # every stage's FULL output
```

Do not hand-roll `journalctl`. Every one of this register's journal misreads came from improvising around
`lab:status`, which has a task called *"Whether that journal is ONE run or the unit's whole history"*.

- **`shortcuts` is the stage to read first even if it passes.** It compares against a baseline that
  already ABSORBED two model-decided free vetoes (`not-working.md` §2), so a pass there is "no worse",
  never "clean". The audit now prints what a baseline write accepts, but this run does not write one.
- **`release-gate` passing is not the same as being ready to publish.** Steps 2, 3 and 5 of the publish
  procedure need a human's hands and none of them is reached by any chain.
- **A FAILURE AT `train` OR LATER MAY MEAN REVERT, NOT ADJUST.** `schema-migration.json` names every gate
  v19 must clear precisely so the decision cannot be softened into a tweak.

### The two rows that unblock the moment it finishes

Both need the lab, and `run-job.yml` refuses any job while another runs — verified by trying, and it is
right: *"a job that quietly runs four commits behind reports success for code you did not ask for."*

- **`rules:gate` / `check-signals` on a CURRENT export.** Every local copy is stale — the pre-push hook
  says so honestly and skips — so three rule-owned subtypes cannot be attributed here at all. The chain
  produces the export that answers them.
- **The split pair.** `icon-button-unnamed` is captured early in every run, so its fresh evidence exists on
  the lab's disk within minutes and cannot be read until the run ends. The answer being on disk and the
  answer being readable are different things. `timedOut` is now on the mark, so the next occurrence states
  which failure it was instead of inviting arithmetic on `ms`.

## How an item leaves this page

Delete the row, and put the *lesson* in the record — `known-gaps.md` for something the project did not
yet do, `not-working.md` for something that was wrong. A closed row that stays here is how a tracker
becomes a second record and stops being read.
