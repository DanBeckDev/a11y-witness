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
- ~~**4.1.3's real-page grounding**~~ — **CLOSED 2026-09-05, and THIS ROW'S OWN PREDICTION WAS WRONG.** The
  real-page capture run this row asked for HAS RUN (`-e role=calibration`, 49/49, zero failures), and it
  did NOT turn `4.1.3: 0 of 37` into `1 of 37` as predicted here — it stayed at `0 of 37`, which is CORRECT
  rather than a shortfall, for two independent reasons stated in full under "Accepted designs, not yet
  built" below (the survey page is a `calibration` page and `build-realism` excludes calibration pages by
  design; separately `routeChange.announced` is deliberately masked because the probed link is almost
  always a skip link). This row asked for a capture that could never move the number it named — see the
  "Needs your hands" section's own 4.1.3 paragraph for the confirmed, current state.

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
| `case-matrix.mjs` | 5,699 | almost entirely DATA — 1,645 case definitions | **4,121** — checked `wc -l` 2026-09-06, matches the two-cuts figure below exactly. Drifted from 4,074 the same day, unrelated to the split: the 2.4.7 false-positive fix (agent/2-1-2-false-positives) rewrote the comment on the three `focus-removed-on-receipt-*` cases to record why 2.1.1 stays primary and why `alsoFails: ["2.4.7:..."]` waits on a rule-ownership bucket that does not exist yet (`assert_declaration_matches_data` would crash the next retrain without it). The two-cuts split, not the exact count, is what to trust. |
| `capture-core.mjs` | 4,969 | **3,020 comment, 201 blank, 1,748 code** | **DONE, and superseded by the three-way split below: `capture-core.mjs` 334, `capture-setup.mjs` 1,575, `capture-probes.mjs` 3,132 (checked `wc -l` 2026-09-06). This row's own "4,856" was the state ONE post-mortem-move ago; the recapture-validated split further down this page (`capture-core.mjs 4,885 -> 362`) then ran, and `capture-core.mjs` has since drifted 362 -> 334 from unrelated later edits, and `capture-probes.mjs` 3,082 -> 3,132 from TWO changes that landed the same day and were merged together: the census moving before `probeRouteChange` (known-gaps.md §40) and the 2.4.7 fix raising `FOCUS_EVENT_LOG_DIAGNOSTIC_LIMIT` to match the rule's own raised cap. **Neither branch's own row was right after the merge** — each counted its own change and not the other's, and `backlog-file-facts.test.ts` caught the difference at the merge, which is exactly what a pinned number is for — the split, not the exact count, is what to trust.** |
| `rules.ts` | 1,993 | | `rules.ts` drifted 1,381 -> 1,483 the same day as the split below, unrelated to it: the 2.4.7 false-positive fix redesigned `addFocusEventFindings` to read the whole stored focus-event log instead of a capture-side verdict (agent/2-1-2-false-positives). The split, not the exact count, is what to trust. **DONE 2026-09-06** — `9b13696` split cross-channel evidence into `channel-comparison.ts`. Drifted 1,483 -> 1,507 on 2026-09-06 for the F55 START-BOUNDARY fix: one `if (i === 0) return null;` plus the comment carrying the measurement that justifies it — 37 of 37 conformant real pages had their ONLY orphaned focusout at `log[0]`, while 9 of 9 corpus positives open on a focusin and orphan at index 2+. Checked `wc -l`: `rules.ts` 1507, `channel-comparison.ts` 729. |

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
  and a diff this size cannot be read for that by eye. **SECOND CUT DONE — checked `wc -l` 2026-09-06:**
  `page-templates.mjs` 479, `page-furniture.mjs` 298, `case-matrix.mjs` down to 4,074, all under the same
  corpus-hash test. Not "in flight" any more; the FILE SIZE table above was stale on this point.
- ~~**`capture-core.mjs`'s 1,748 code lines are ~30 probes sharing one shape.**~~ **DONE** — this is the
  three-way split lower on this page (`capture-core.mjs` -> `capture-core.mjs`/`capture-setup.mjs`/
  `capture-probes.mjs`), validated by `capture:check` twice against a real worker before merging. See that
  section for why three files rather than two, and the FILE SIZE table above for current counts.
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

## `/progress` described the last capture FOR EVER, and the symptom was already in the repo

**`inFlight` was set at every capture's start and never reset** — not on success, not on failure. So after
a worker's first capture ever, `/progress` reported that capture's url and a forever-growing `elapsedMs`,
on an idle worker correctly reporting `busy: false`. `respondWithProgress` already had the right
`!inFlight` branch; it was simply unreachable.

**THE MEASUREMENT WAS ALREADY WRITTEN DOWN, IN THIS REPO, AS A THING TO WORK AROUND.** `fleet-status.mjs`
carries it verbatim:

> Measured on a11y-worker-2: `{busy: false, capturing: ".../table-unassociated-hilltown/bad.html",
> elapsedMs: 2526239}` — 42 minutes after that capture finished, **and still climbing.**

That comment exists to explain why `activityOf` reads `progress.busy` rather than `health.busy`. The
consumer defended itself, correctly, and the SOURCE went on handing stale state to anything else that
asked — while "still climbing" is precisely the tell that a value is never reset. **A diagnostic that was
recorded, correct, and read as a quirk to route around rather than a bug to fix**: the same shape as
`pointerParkFailed`'s `ms` field discriminating timeouts for weeks unread, the 604 silent `sweepLog`
crashes, and `/progress` itself having been served since forever and consumed by nothing.

**The inventory is the durable half, and it is now a table in `server.mjs` rather than in a message.** All
16 module-level mutable touchpoints, each answered against one question: *is this genuinely per-PROCESS, or
per-CAPTURE masquerading as per-process?* The second kind is where the next `dialogCache` lives. Fifteen
are per-process by design and the reasons are recorded — `results` (bounded history across captures, which
IS the feature), `worked` and `consecutiveRecoveries` (a circuit breaker's memory must span captures), the
boot caches (facts fixed until restart), the warm-up lifecycle (explicitly meant to survive). `inFlight`
was the one the shape could hide, and it was the only one.

**No split proposed, and that is the right answer.** The state groups cleanly by the concern that already
owns it elsewhere — `capture-results.mjs`, `desktop-prepare.mjs`, `diagnostics.mjs` — and what remains in
`server.mjs` is irreducibly the HTTP-request and process-lifecycle policy tying those to five routes. The
audit called it "a nine-line router beside 700 lines of policy"; the router being thin is not the defect,
and the policy turns out to be cohesive.

## `probeFocusReveal` was declared ON in the CLI and never sent — every user capture ran 1.4.13's probe OFF

Found while tracing request-field propagation for the wire-contract work, not by a failure.

`defaultArgs()` sets `probeFocusReveal: true` with a comment explaining that 1.4.13 needs it, and it was
**never forwarded**. Six hand-named parameter lists sit between `Args` and the wire — `captureAndScan`,
`recaptureUntilItReadsThePage`, `runWitness`, the `CaptureRequest` interface, and `captureViaWorker`'s own
destructure and body — and every one of them listed the other four probe flags and omitted this one.
`probeFlags()` on the worker defaults an unsent flag to `false`.

**So every CLI-driven capture has run 1.4.13's probe off since the day it was turned on**, and silently:
an un-asked probe returns an empty channel, which is indistinguishable from a conformant page's evidence.
The lab path was unaffected — `capture-real-pages.mjs` sends it directly — which is why the corpus shows
`1.4.13: 37 of 37` while the product could not have produced one.

**The guard could not see it, and its own header says why.** `probe-consent.test.ts` checks that
`defaultArgs()` DECLARES `true`; it never checks that the value survives six hops **inside the same file**.
Its header already names the shape — *"the CLI is a sixth hop outside `probe-chain.test.ts`'s chain"* —
without the file having a test for its own internal hops. `probe-forwarding.test.ts` now derives the
canonical flag set from `Args` and asserts every flag reaches every named hop.

**Two of the three new pinning tests caught defects in THEMSELVES before being trusted**, which is the part
worth keeping: one extraction regex over-matched across three typedefs at once (a lazy match anchored to
the wrong brace), and one matched a COMMENT as a field named `flag` — the exact source-text trap
`source-text.ts` was written for and catalogues three prior instances of. Both were caught by the mutation
check rather than by review, and the second is now fixed with `stripComments`.

**And one premise was carried in, checked, and voided.** `packages/control` was believed to be a second
permanent exception to one-owner, on the grounds that it constructs a capture body and can import nothing.
It does not construct one at all — grepped for `probeForms`, `captureOptions` and `POST /capture`, nothing.
The real control-plane involvement was `fleet-playbook.mjs` scraping `CAPTURE_PROTOCOL_VERSION`, a
different finding already closed. **One owner, one real exception** — `capture-core.mjs`'s JSDoc, which
cannot import a TypeScript type because the module is guidepup-poisoned, and is now pinned by a test that
reads it as text.

## FIVE PUBLISHED BINS COULD NOT RUN, and one of them exited 0 with no output

The most user-facing defect of the day, and it would have shipped. Found by closing the audit's
*"the published `dist/cli.js` bin is executed by nothing"* row — and closing it required actually
running the installed bin, which is the only reason it was found at all.

**Two stacked defects, both on `a11y-witness` and on four more bins:**

1. **No shebang.** `ENOEXEC` on any POSIX host the moment npm creates the `.bin` symlink.
2. **Worse, and silent.** The `isProgram` guard compared `import.meta.url` — which Node's ESM loader
   resolves THROUGH symlinks — against a raw, unresolved `process.argv[1]`. On every macOS install
   `/var` and `/tmp` are themselves symlinks to `/private/var` and `/private/tmp`, and `os.tmpdir()`
   — where `npx` stages a package before running it — is `/var/folders/…`. **So the bin ran, matched
   nothing, skipped `main()` entirely, and exited 0 with no output at all.**

**Reproduced independently before merging**, by invoking both guards through a `/var` path: the old
one prints `SILENTLY SKIPPED`, the new one `MAIN RAN`. A user typing `npx a11y-witness` would have
got silence and a success exit code.

**Why the gate that exists for this could not see it.** `isolation-smoke.mjs` checked the bin file
EXISTS. That is the same shape as the `cli-flags` export the same gate missed earlier today —
presence rather than function — and it is the third instance in one day of a smoke test covering only
what it happens to touch.

**The fix's own first version passed against the live bug**, and catching that is the better half:
`execFileSync`'s `cwd` and `require.resolve()` both silently canonicalize a path, so a smoke test
built from either sidesteps the exact defect it is meant to catch. `checkIsolation` now passes the
consumer directory's RAW, un-realpath'd path explicitly.

**Then the same shape was grepped for and found four more times** — `a11y-doctor`,
`a11y-worker-code`, `a11y-worker-compare`, `a11y-worker-deploy`, all missing shebangs and all
carrying the unresolved guard. Three verified live through their real `.bin` symlinks;
`a11y-worker-deploy` was fixed identically but NOT executed, because it reaches for fleet and SSH
state even under `--help` — the resource ban read correctly as applying to a raw binary and not only
to an npm script.

`entry-points.test.ts` now maps every declared `bin` to its build source and refuses any guard
comparing `process.argv[1]` without `realpathSync`. `server.mjs` carries the identical pattern and is
EXEMPT with a reason — Windows' `.cmd` shim does not resolve the same way, and it is a held
capture-path file — rather than silently skipped.

**Two dispatch-only gates also moved into `lint.yml`**, measured rather than assumed: `scorer:verify`
(0.3 s) and `gate:isolation` (~18 s, 6/6 on Linux), both pure tracked-file checks with no network,
venv or corpus dependency. `release:provenance` and `scorer:migration` did NOT move, and the reason
is not caution: `scorer:migration` is **blocked on this tree right now** by the v18→v19 migration, so
gating pushes on it would break every push for the duration of legitimate in-flight work —
`release:provenance`'s own header already predicts exactly that failure mode.

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
| ~~**Losing the async acceptance loses the recovery path.**~~ **CLOSED — verified 2026-09-06 by RUNNING `capture-async.test.ts`, not by reading it.** `pollForResult` (`capture-client.mjs`) now wraps the initial `POST {async:true}` in a try/catch that calls `reconcileLostAcceptance` on a transient failure, asking the worker by the client-minted `captureId` rather than throwing it away. Test `"A LOST 202 IS RECONCILED BY THE SAME ID, not thrown away"` reproduces the exact loopback scenario the audit describes (accept, then destroy the response socket before the client reads it) and passes: `posts: 1`, recovered result returned. 12/12 in the file pass. | ran `npx tsx --test packages/worker-fleet/src/capture-async.test.ts` — 12/12 pass | closed |
| **Result recall is not an idempotency contract.** `begin(id)` deletes a previous result and replaces it with `running`; after completion another POST with the same ID executes again, with no payload-conflict check. So **404 means "not retained here"**, not "never started" — and the comments overclaim it in both directions. | **STILL ACCURATE at HEAD, checked 2026-09-06** by reading `capture-results.mjs`'s current `begin`/`recall` — the described behaviour is unchanged and is now the module's own documented, deliberate design ("404 IS BOUNDED RESULT RECALL, NOT PROOF THE CAPTURE NEVER RAN", with the reasons for not closing it with payload-fingerprint suppression stated in the same file). Reads as an accepted limitation rather than a live TODO; left under "open" rather than moved to "Decided — not defects" because that reclassification is a judgement call outside this pass's scope. | open |
| ~~**The timeout ladder does not bound the whole operation.**~~ **CLOSED by `4d640f5` (2026-09-05), "the timeout ladder now covers the complete server-side handler" — architecture-audit.md §14.5, both items.** Item 1 (no inner read clipped to remaining time): `remaining(deadline)` is now threaded through every wait in `awaitCompletion` and `reconcileLostAcceptance`. Item 2 (the 560 s/580 s mismatch): `CAPTURE_CLIENT_TIMEOUT_MS` raised to `620_000`, keeping the same 40 s margin above the worker's true worst case (`DESKTOP_PREPARE_TIMEOUT_MS` 60 s + `CAPTURE_HARD_TIMEOUT_DEFAULT_MS` 520 s = 580 s). **Verified 2026-09-06 by running the test, not by reading the commit**: `budget-ladder.test.ts`, 12/12 pass, including `"the shared client ceiling covers desktop preparation PLUS the hard timeout, not the hard timeout alone"` and `"no capture client declares its own ceiling below the worker's TRUE worst case"`. | ran `npx tsx --test packages/nvda-worker/src/budget-ladder.test.ts` — 12/12 pass | closed |
| ~~**`control` ↔ `worker-fleet` is a real cycle.**~~ **CLOSED — this is the SAME finding as the row above ("Audit findings closed since the recapture started"), duplicated here with a stale `open` tag left on it.** See that row: split by measurement rather than one uniform remedy, guarded by `worker-fleet-does-not-read-control.test.ts`. Verified 2026-09-06 that file exists and its tests pass as part of the full suite. This duplicate row is left here (rather than deleted) only long enough to record that the duplication — not the finding — was the defect: two tables in one backlog disagreeing about one row is exactly the shape this file exists to prevent. | duplicate of the CLOSED row above | closed |
| ~~**Nothing installs the git hooks; the Python tests run under no automated gate.**~~ **CLOSED — the SAME duplicate shape as the row above.** See "195 Python tests ran nowhere automated..." in the CLOSED table above: `scripts/install-git-hooks.mjs` + `"prepare"` in `package.json` (verified 2026-09-06, both present), `requirements-ci.txt` + `actions/setup-python@v5` + `pytest` in `.github/workflows/lint.yml` (verified present, lines naming `195 pytest files ran NOWHERE AUTOMATED until 2026-09-05`). | duplicate of the CLOSED row above | closed |
| ~~**Provisioning duplication with no owner.**~~ **MEASURED AND DECIDED.** `provision-nvda-worker.ps1` and `roles/worker/` were said to coexist "until parity is demonstrated", with no test, no checklist, and no backlog entry. Built the missing checklist (every concern a worker's environment needs, both paths read, matched concern-by-concern) and it settles the question: the role is more correct on every divergence with real consequences (the Edge pin and its enforcement, the blank-password guard's severity, a Wake-on-LAN-preserving NIC fallback the script's own fallback can silently break), and the script's real remaining audience was never "a fleet box with no Ansible" — `bootstrap-windows-worker.ps1` and PXE `autounattend.xml` both leave a box Ansible-reachable before the role would need to run — it is the solo local-worker workflow in `docs/getting-started.md`. Parity is no longer the goal for the FLEET path; retiring `provision.yml` from fleet use is quantified (one recapture, already measured at 3h46m) and not executed this pass, per the unit's own resource ban on a recapture running concurrently. | [`docs/provisioning-parity.md`](./provisioning-parity.md) | done |
| ~~**`provisionRevision` cannot see 5 of 6 `a11y.worker` modules or any of the 10 role task files.**~~ **DECIDED, NOT A GAP — this row's premise was examined and REFUTED in `provision-stamp-inputs.test.ts`, checked in the same commit range as this row (`9435105`) but never reflected here.** That file's own EXEMPT table gives each of the five modules a SPECIFIC, DIFFERENT reason it does not belong in the stamp — not "the identical argument" this row claimed: `a11y_defender`/`a11y_nic_power`/`a11y_power_timeouts` "affect reachability, never capture content"; `a11y_onedrive`'s risk is an intermittent one-off event `gate:stability`'s content comparison already catches, not a persistent per-guest state; `a11y_nvda.ps1`'s installed build is ALREADY a separate, live-measured cache-key field (`screenReaderVersion`/`guidepupVersion`), so stamping the installer too would be redundant rather than closing a gap. The file's own header states the conclusion directly: **"ONE FILE IS A GENUINE GAP: `a11y_speech_viewer.ps1`"** (singular) — already fixed, per that same stamp. Verified 2026-09-06 by running the test: `npx tsx --test packages/worker-fleet/src/provision-stamp-inputs.test.ts`, 5/5 pass, including `"the speech-viewer setting is HASHED — the one gap this audit found is closed, not reworded"`. | ran the test; read its EXEMPT reasons, not just their presence | closed |

**What the audit says is STRONG, recorded because a register of defects is not a picture of the system:**
the ADR 0004 package split holds, the declared graph is a DAG, `evidence` is genuinely pure, and the
repo's strongest asset is *a testing pattern* — about thirty meta-tests that discover a population,
require each member to be classified or exempted with a reason, and open with a vacuity guard. Three of
today's fixes are that pattern applied where it was missing.

## Open defects

| | what would tell you it is fixed | detail |
|---|---|---|
| **`rules:gate` AND `rules:real-pages` READ ONE CORPUS THROUGH DIFFERENT PATHS, so a capture-layer fix is invisible to one of them — found 2026-09-06.** `export-screenreader-dataset.mjs:236` bakes `ruleEvidence: oracleCounts(capture)` at EXPORT time, so the census in `screenreader-evidence.jsonl` is frozen under whatever trust rule was current when the export ran. `rules:real-pages` reads CAPTURES and sees a change immediately; `rules:gate` reads the EXPORT and sees nothing until a re-export. **Measured**: after merging the census trust-rule tightening, every rule finding across all 2,796 exported records was byte-identical — 1,398 conformant, 10 with a finding, same per-criterion counts — while the same change demonstrably alters what a capture-reading rule concludes. | The two paths agree about what a rule may read, or the divergence is stated where somebody running either gate will see it. | **This is the "two gates disagreeing about one corpus" signal from the 1.3.1 episode**, where `rules:gate` said `29/29 EXACT` and `rules:coverage` said `fired 0x` about the same rule. Here it is worse in one respect: it presents as **the fix appearing not to work**. Anyone who lands a capture-layer fix, runs `rules:gate`, and sees no movement will conclude the fix is wrong — and be wrong. Not urgent, and it must not be forgotten: the whole reason it was caught is that a prediction was checked against the artefact instead of accepted. |


**THE RECAPTURE LIST FOR THE TWO WORKER FIXES — derived and verified 2026-09-06, so it is not re-derived
under time pressure.** The 2.4.7 predicate and the census-before-navigation fix both change what a capture
STORES, so the affected cases must be recaptured before any gate can see the difference. Computed from the
authoritative export by running `ruleFindings` over all 2,796 records and taking the union of: records
where 2.4.7 fires, the `focus-removed-on-receipt` positives, and records that navigated AND carry a census.

**44 case ids across 10 families** — and 19 (the 2.4.7 set) + 25 (the census set) = 44, which is the
arithmetic already agreed. **Verified that the ten family prefixes cover EXACTLY those 44: 0 missed, 0
extra.** That check matters because `route-title-stale` is also a string prefix of `-catalogue`, `-claim`
and `-enrolment`, which is why all four are listed separately — a trailing `+` means the base case and its
`+also-`/`+with-` variants, never everything sharing the prefix.

```
npm run lab:pipeline -- --pipeline=verify --only=\
  focus-removed-on-receipt-booking+,focus-removed-on-receipt-claim+,focus-removed-on-receipt-order+,\
  image-missing-alt-behind-consent+,keyboard-trap-modal-cycle+,keyboard-trap-modal-escape+,\
  route-title-stale+,route-title-stale-catalogue+,route-title-stale-claim+,route-title-stale-enrolment+
```

**NO `--no-cache` ON THIS COMMAND, and the first version of this row had it wrong.** `lab:pipeline`
accepts exactly `--pipeline= --ref= --only= --list --local --status --log`, so `refuseUnknownFlags` would
have REFUSED the run — the guard working, at the worst possible moment. It is unnecessary anyway: the
`capture-only` job's own argv already ends `--no-cache`, with a comment recording why it must
(*"`training:capture --only=<case>` on a case that already has one returns the STORED capture and reports
success... it re-serves the evidence from before the change"*), found on 2026-09-01 when this job
"reproduced" a pathological capture twice and it was the cache both times.

**`verify` runs `capture-only`, `grants-audit`, `check-signals` — NOT `rules:gate`.** That is a separate
dispatch afterwards, and it is the one carrying the acceptance numbers.

`--no-cache` because the PAGES have not changed — `workerCode` is deliberately outside the cache key, so
a cached capture would be served unchanged and the fix would be invisible. `--pipeline=verify` deploys the
fleet first, which is the one deploy both worker fixes share.


| | what would tell you it is fixed | detail |
|---|---|---|
| **MEASURED 2026-09-06: fixing 2.4.7 ALONE takes `rules:gate` to zero, and nothing else lurks.** Ran `ruleFindings` over all 1,398 conformant records in the authoritative export and grouped every finding by criterion. **The only criterion producing ANY finding on a conformant record is 2.4.7 — 20 findings across 10 records. Zero from the other fourteen.** So the headline claim holds exactly as stated for every declared rule, and the single blocker is one undeclared one. | Nothing to do — this is the measurement that says the 2.4.7 unit is sufficient rather than merely necessary. | Worth having BEFORE the fix, because "10 conformant records failed" leaves open whether one fix closes it or whether more surface once the loudest is silenced. It closes it. |
| **2.4.7's F55 DETECTOR HAS NEVER ONCE BEEN RIGHT — found 2026-09-06, and it blocks promotion of ANY weights.** `rules:gate` scored 1,398 conformant records and found 10 false positives. **The criterion is 2.4.7 Focus Visible, NOT 2.1.2** — this row said 2.1.2 for an hour because the failing case names (`keyboard-trap-modal-*`) read as a keyboard trap, and `rules:gate` names failing RECORDS rather than criteria. That inference was stated as fact and sent a peer after the wrong rule for an evening; it was settled by fetching the exported record and dropping the criterion filter. **Both directions are wrong at once:** 10 false positives on conformant records, and `POSITIVES: 9 | with focusEvents evidence: 9 | CAUGHT: 0` — every `focus-removed-on-receipt-*.bad` record carries real evidence (`checked: true`, 13-27 events) and reads `scriptRemovedFocus: []`. The probe ran, produced a log, and the predicate found nothing on the pages built to demonstrate the failure. | **TWO-SIDED, and the second half is what makes it real:** `rules:gate` back to 0 false positives across all 1,398, AND 2.4.7's own positives CAUGHT, count printed. Silencing the ten alone reads 0 FPs and 0 of 9 caught — half the acceptance, worth nothing. **This is the 2.4.3 deafness trap** and it is why the second half exists. | **DIAGNOSED FROM THE EVENT LOGS, both sides.** The predicate flags a `focusin`→`focusout` pair under `FOCUS_SCRIPT_BLUR_WINDOW_MS = 50`. On the conformant modals that pair IS present — `id=0 "Full name"` at 3189/3189 — but a `focusin` on a DIFFERENT id follows 1 ms later: a focus trap claiming focus for the dialog, which W3C's F55 does not cover at all ("removes focus from the content **entirely**"; every example a destination-less `.blur()`). On the positives the pair NEVER FORMS: `focusout id=1 "Delivery instructions"` appears with **no `focusin`, ever, on either lap** — the script took focus and stripped it faster than a `focusin` could fire. **So `heldMs` is the wrong axis for both halves: DESTINATION separates the false positives, a MISSING `focusin` identifies the true ones.** Answers `known-gaps` §39, which asked whether the 50 ms bound was too tight — it is not a threshold problem. `focusEventVerdict` is worker-side (`capture-pure.mjs`), so its OUTPUT is what the corpus stores: the fix needs 19 cases recaptured (`--pipeline=verify --only=`), NOT a protocol bump.
| **THE REAL-PAGE FINDINGS BASELINE IS NOT A BASELINE — decided 2026-09-06.** `packages/lab/baselines/real-page-findings.json` was built from captures whose census read ANOTHER DOCUMENT on **20 of 20 pages sampled** (known-gaps §40). So it cannot be diffed against a post-fix run: a "new finding" would mean "the census finally read the right page", and an unchanged one would mean nothing. | **After the recapture: run `rules:real-pages`, read EVERY difference from the old baseline individually against the stored evidence, and REWRITE the baseline from what survives that reading. Not diffed and accepted.** The 18 findings previously checked by hand across the 86 conformant pages get re-checked wherever they read a census; the transcript-based ones stand unchanged, because the transcript was never affected. | The CEO's decision, and it is the one that stops a wrong baseline being laundered into a right one by a green diff. A baseline absorbs whatever it is not asked about — the same reason any 2.4.7 finding surviving the fix is read individually before being called noise. |
| ~~**PREDICTED: the real-page gate will report NEW 2.4.7 findings**~~ — **REFUTED THE SAME HOUR, by fetching three of the pages it named.** The prediction was that protocol-15 real-page captures would carry `focusEvents` for the first time and that cookie banners, being focus traps, would produce the same false positive as the synthetic modals. The first half is right and the second is wrong. Measured on three fresh captures, all from sites the gate's own INCONCLUSIVE output names as carrying consent dialogs: `design-system.service.gov.uk/components/details/` **296 events, `scriptRemovedFocus: []`**; `/components/radios/` **222 events, `[]`**; `check-for-flooding.service.gov.uk/river-and-sea-levels` **54 events, `[]`**. The probe ran, saw hundreds of events, and found nothing. **THE MISTAKE WAS TREATING "focus trap" AS ONE THING.** The synthetic modals implement a trap that MOVES focus on `focusin` — which is what produces the 0 ms `focusin`→`focusout` pair the predicate misreads. A real cookie banner is usually an OVERLAY that contains focus by tab order and DOM position; nothing moves focus on receipt, so no 0 ms pair exists and the predicate is correctly silent. Containing focus and relocating it are different mechanisms and only the second trips this bug. | Still re-run `rules:real-pages` AFTER the 2.4.7 fix — not because of this prediction, which is dead, but because the CEO's rule stands on its own: one run that means something. | **The prediction was recorded before the result and refuted by measurement within the hour, which is the only reason it cost nothing.** Kept struck through rather than deleted: the reasoning was plausible, it was acted on, and the correction — that a trap which CONTAINS focus is not a trap that RELOCATES it — is worth more than the prediction was. Three pages, not 49; the full run may still surface a real one, and per the CEO any 2.4.7 finding that survives the fix is checked individually against its stored log before being called noise or added to the baseline. A banner that strips focus with no destination is a real F55 whoever published the page. |
| **`rules:real-pages` is INCONCLUSIVE, and it is a named v19 revert condition — 2026-09-06.** Exit 2: *"only 27 of 85 from conformant real pages scored against the baseline were examined"*. 32 captures carry a census the run refuses to trust — `targetMatch=fallback`, a real second CDP target existed and none was confirmed to be the page navigated to. All the Cookiebot-iframe shape (GOV.UK Design System, caselaw.nationalarchives, check-for-flooding). | A real-page recapture (`capture-real-pages`, ~1.6 h across the fleet) makes it conclusive. **This is the census guard WORKING** — it refuses an untrusted census rather than reading another document's numbers — so the finding is that the captures on disk predate the fix, not that the gate is broken. | Blocks closing v19 either way: a revert condition that cannot answer is not a condition that passed. |


| | what would tell you it is fixed | detail |
|---|---|---|
| ~~**THE PUBLISHED ACTION INSTALLS NVDA ITSELF FROM AN UNVERSIONED INSTALLER**~~ — **PUBLISH-BLOCKING, CLOSED 2026-09-06. The report half was the blocking half and it is done; the mechanism this row NAMED was partly wrong. THE NVDA BUILD WAS NEVER FLOATING, and this row overstated it.** `@guidepup/setup` reads no version argument and no override — its source (0.25.2 `select-targets.js`/`resolve-manifest.js`) unconditionally loads `node_modules/@guidepup/guidepup/manifest.json`, shipped INSIDE the client package, which names `"version": "0.2.1-2026.1.1"` under a verified `sha256`. `@guidepup/guidepup` is pinned at 0.31.0 by `package-lock.json`, which the cache key already hashed. **So the chain `package-lock.json -> guidepup -> manifest -> NVDA build + sha256` was intact, and the claim that "the key describes the CLIENT, not the screen reader" was wrong: the client DETERMINES the screen reader.** | **FIXED, and the remedy is better than the one designed for it.** `@guidepup/setup` is now an exact-pinned devDependency (0.25.2) — the installer genuinely could drift even while reading a pinned manifest — and the cache key hashes the MANIFEST FILE rather than a hand-typed version string, which is stronger, carries the sha256 and needs no maintenance when guidepup bumps. `Report.environment` now renders "Screen reader runtime: NVDA 2026.1.1, guidepup 0.31.0" from the RUNNING capture, and `--json` gains `environment`, which it had been missing entirely. | **The half that was real is the REPORT half: nothing recorded which NVDA a run used.** A pin says what was asked for; the report must say what was there — the `browserVersion` memo lesson, where a cached value described a version the captures were not taken under. Found by reading the installer's SOURCE rather than its `--help`, which is why the row is a correction rather than a confirmation. |
| **THE PUBLISHED ACTION INSTALLS AN UNPINNED PYTHON RUNTIME, BEHIND A CACHE KEY THAT CANNOT EXPRESS WHAT IT HOLDS — found 2026-09-06.** `action.yml` runs `pip install --quiet onnxruntime transformers safetensors numpy` with no version constraints, and caches the wheels under `key: a11y-witness-pip-${{ runner.os }}-onnxruntime-transformers-safetensors-numpy` — a constant string of package NAMES. So which inference runtime a consumer scores against is decided by whenever that cache was first populated, and nothing anywhere records it. **The comment four lines above says *"Keyed on the pinned set, so a stale cache cannot serve a different runtime than the one asked for"*, and there is no pinned set.** A comment naming the exact protection it does not provide, which is the `browserVersion` memo defect — a premise nothing made true — in the one artefact strangers actually run. It matters more here than it would elsewhere: this project keys its CAPTURE cache on `browserVersion`, `screenReaderVersion`, `guidepupVersion` and `screenReaderSettings`, on the stated principle that a version change IS an evidence change. The scorer's own runtime is the single version in the chain nobody pinned. | Pin the four packages to versions, put those versions IN the cache key, and make the comment true. Prefer the versions the lab's venv resolves, so the Action and the lab score on one runtime rather than two nobody compared. **Then read a GREEN `action-smoke` — the pin cannot be verified any other way, and action-smoke is red on the v18/v19 lock until the migration closes.** That is the one real constraint: this is cheap to write and unverifiable today, so it rides the first green run after the verdict, which somebody is going to read anyway. | Publish-blocking. Nothing else in the chain is unpinned; `requirements-ci.txt` pins the CI side and `worker_edge_version` pins Edge by SHA256, which is the standard this falls short of. |


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

## OPEN — ~38 architecture-audit findings that never reached this page at all

**Found 2026-09-06 by an AUDIT → BACKLOG → HEAD pass**, prompted by two peer sessions independently
finding stale rows on this page the same night — see [`architecture-audit.md`
§15](./architecture-audit.md#15-follow-up-review-2026-09-06--findings-never-triaged-into-the-backlog) for
the full per-finding detail and evidence. This page's own "architecture audit" section (below) triaged
roughly twenty of that document's findings; the rest — most of its §§3.3–3.5, 4.4–4.5, part of §5, §6.5,
most of §7.2–7.5, every §8 sub-finding, and its §§10.1, 10.2, 10.5 — had no disposition anywhere: not
fixed, not refuted, not recorded open. A finding in neither state is invisible, which is this project's
own "a check that examines nothing" shape applied to its own tracker.

Checked at HEAD, reading code rather than commit messages. Of ~50 findings with no prior disposition, 8
are already fixed and 1 was already closed under different wording (§10.4 — corrected in §15, not listed
below). The rest are genuinely open:

> ### STATUS AT 2026-09-06 — most of this list is now CLOSED, and two entries were REFUTED
>
> Worked through in one session by five peer sessions with one reviewer. The bullets below are kept as
> WRITTEN so the diff is readable against what was found; this box is what is true now.
>
> | finding | now |
> |---|---|
> | §3.3–3.5 export bypasses | **CLOSED.** `./host-address`, `./fleet-env`, `./fleet-consistency`, `./worker-code-check` added to `worker-fleet`'s `exports`; every `lab` site repointed at the package name; `generate-coverage-doc.ts`'s two bypasses of `judge` fixed |
> | §3.3–3.5 undeclared dependencies | **REFUTED as publish-blocking.** Every undeclared use is in a `.test.ts`, and no test file ships — both tarballs are `dist`-only and `npm pack --dry-run \| grep -c test` is 0. `axe-core`/`playwright` are optional BY DESIGN and documented as such; `@huggingface/transformers` is a deliberately non-literal dynamic import behind an opt-in gate. Declared anyway as dev-dependency hygiene. **`gate:isolation` did not catch it because there was nothing to catch** |
> | §4.4 the four channel tables disagreeing for 4.1.2 | **CLOSED** by `channel-tables-4.1.2.test.ts`, mutation-confirmed at 218 captures |
> | §4.5 `cli.ts`'s "local Codex login" header | **CLOSED** — stale since the `local` default landed 2026-08-04 |
> | §4.5 `verify-gate.ts`'s undeclared env vars and dependency | **CLOSED**, and it exposed a real bug: `JUDGE_GATE=on` without the package crashed the whole `judge()` call with a bare `Cannot find package`. Now rejects naming the fix |
> | §7.2 no Python in CI | **CLOSED** — `requirements-ci.txt` + `setup-python` + pytest in `lint.yml` |
> | §7.2 no Ansible check anywhere | **CLOSED** — `ansible-check.yml`, syntax-check plus `check-modules.py` at 230/0, proved in a scratch venv so a missing collection could not pass silently |
> | §7.3 `release.yml:161`'s `$status` under `set -u` | **CLOSED.** Both forms executed: the old one dies `status: unbound variable` and the operator never sees the "wait, do not start another" guidance |
> | §7.4 `pure-graph.test.ts` naming a retired file | **CLOSED**, and it was guarding five files while reporting six. `MUST_BE_PURE` is now verified to EXIST before it is walked |
> | §7.4 `.c8rc.json`'s phantom exclude | **CLOSED** |
> | §7.5 `examples/workflow.yml` contradicting the Action's default | **CLOSED, and it was wrong three ways** — `probe-forms` inverted, a `task:` comment true only because of that inversion, and the same unguarded `upload-artifact` path bug that discarded this repo's own action-smoke evidence for 85 runs. Pinned by `example-matches-action-defaults.test.ts`, DERIVED from `action.yml`'s declared defaults |
> | §7.5 `action.yml` pip-installing unpinned versions behind a constant cache key | **CLOSED, structurally** — its own row above (publish blocker B2). `packages/scorer/requirements.txt` now pins all six packages exactly; `action.yml`'s cache key hashes that file (`hashFiles('packages/scorer/requirements.txt')`) and its install step greps its four pins straight out of it rather than repeating them, with a count guard. `requirements-ci.txt` carries the identical `numpy`/`safetensors` pins, checked by `python-ci-requirements.test.ts`. Same residual as B4 below: verifiable by reading, not yet by a green `action-smoke` |
> | §8 the UTM path | **DEPRECATION CLOSED, deletion deferred by decision.** ~2,190 lines measured UTM-only (not ~2,460 — general-purpose functions inside those files were excluded); every UTM entry point now warns to stderr, enforced by a discovery test with vacuity guards; the three docs corrected |
> | §10.2 `packages/README.md`, `packages/control/`'s missing README, root `README.md` | **CLOSED.** The README said "nothing trained yet" while the trained scorer IS the product and the same document said so 40 lines later; `nvda-speech` was misdescribed; and its "18 of 55" had drifted from the generated `coverage.md`'s 19 **in a sentence claiming the number could not drift** — deleted rather than updated, which is the right remedy off the list |
>
> #### SECOND PASS, same day: five more entries were found stale, verified by reading code at HEAD
>
> | finding | now |
> |---|---|
> | §5 the consolidated wire contract | **CLOSED, and not the way it was assigned.** `capture-screenreader-dataset.mjs` had already stopped hand-building its POST body on 2026-08-28 (`adfe293`) — it goes through the same shared `captureTolerantly` client `cli.ts` uses. The one genuine duplicate left was TS-to-TS, not cross-language: `cli.ts`'s own `CaptureRequest`/`CaptureResponse` were hand-typed independently of `@a11y-witness/evidence`'s canonical ones. Fixed by deriving (`Pick`/`Omit`/`Required`) rather than building a new shared module — `wire-request-describes-the-wire.test.ts` and `wire-types-describe-the-wire.test.ts` already pin the TS/`.mjs` boundary for `CaptureRequest`/`CaptureResult`, so there was nothing left needing the `name-normalisation.test.ts` treatment. Mutation-checked: renaming a field in `evidence/index.ts` broke `tsc --build` immediately |
> | §6.5 `CRITERION_STATES` cross-check | **CLOSED.** `packages/cli/src/forms/coverage.test.ts`'s `"CRITERION_STATES covers exactly the assessed, forms-probe-backed criteria -- DERIVED from CRITERION_COVERAGE, not hand-listed"` cites this exact finding by name and derives the SET (not the per-criterion `needs`/`mode`, which genuinely cannot be derived — see that test's own comment) |
> | §9 raw `fetch` surviving at four call sites | **CLOSED**, and more thoroughly than assigned — `97e757d` ("convert the five remaining raw-fetch-to-worker sites") fixed the original four PLUS five more `worker-fleet` sites a wider sweep found in passing (`protocol-guard.mjs`, `compare-workers.mjs`, `check-worker-code.mjs`, `code-drift.mjs`), leaving one deliberate exemption (`capture-screenreader-dataset.mjs`, fetching the page server's HTML rather than the worker's JSON API) — all pinned by `worker-http-client-owner.test.ts`. **One further raw fetch was found in passing, not covered by that test:** `deploy-worker.mjs:132`'s `healthCode()`, on the deprecated local-UTM `worker:deploy` path. Not fixed here — noted for whoever next touches that file |
> | §10.1 eleven architectural decisions with no ADR | **6 of 11 CLOSED.** `docs/adr/` grew from 24 to 30 since the audit; ADRs 0025–0030 write up the capture cache key's composition, the async-capture client-minted id, bare-metal replacing local VMs, fault-code recovery, `ready`-vs-`ok` readiness, and fleet code-parity-as-precondition — content-checked against each decision's CLAUDE.md citation, not just matched by title. **5 remain with no ADR:** `.mjs` worker vs `.ts` control plane, the Python scorer boundary/venv/`A11Y_PYTHON`, guidepup's exact pin as evidence, the speech channel as a TLS socket, and the browser preset as evidence |
> | `PLAN.md`'s B1/B7 self-contradiction | **Already resolved, not by this pass — the claim about it was stale.** Read every B1/B7 mention in `PLAN.md` (10 of them): all agree B7 is CLOSED 2026-08-31 and B1 is open-but-no-longer-blocked-by-B7, including a line that says so in the past tense (`PLAN.md:385`, `PLAN.md:408-413`) and a blockers table with B7 struck through (`PLAN.md:419`). No edit to `PLAN.md` was needed; the correction is entirely to this page's own stale claim about it |
>
> **Still open and assigned:** `PLAN.md`'s remaining un-ADR'd decisions have no ADR yet (5 of the original
> 11), the `deploy-worker.mjs:132` raw-fetch gap just found, and Windows-trimming duplication across
> `windows-trim.mjs`/`provision-nvda-worker.ps1`/`build-lean-worker-image.ps1`/`roles/worker/tasks/*.yml`
> (still 3-4 places, unchanged). **Still open and unassigned:** none — `packages/cli/README.md`'s exit-2
> claim (checked this pass) is already fixed, at `packages/cli/README.md:93`.
>
> **And one finding that was NOT in the audit at all, found while triaging it:** the CLI hung for
> **10 minutes 20 seconds in silence** when nothing answered — `ECONNREFUSED` is a transient network code,
> so the lost-acceptance recovery ran to the full 620 s budget against an address nothing had ever
> answered. Closed, and the fix was shown to fail first: 5.5 s with it, past a 15 s bound without.

- **Package boundaries (§3.3–3.5):** `lab` still bypasses `worker-fleet`'s exports at `host-address.mjs`,
  `fleet-env.mjs`, `fleet-consistency.mjs`, `worker-code-check.mjs`, and `generate-coverage-doc.ts` still
  bypasses `judge`'s `./coverage` export. `scorer`'s pytest suite still reaches into `lab` by path in at
  least two files. `doctor.mjs` still reads `../../scorer/models/...` by relative path.
  `yaml`/`axe-core`/`@huggingface/transformers` are still undeclared dependencies of their importers.
  `data/accessibility-sources.json` still has no importer.
- **Judge-path ownership (§4.4, §4.5):** the four evidence-channel tables (`EVIDENCE_CHANNEL`,
  `SWEEPS_FEEDING`, `CRITERION_COVERAGE.channels`, `applicability.py`) still disagree for 4.1.2 —
  `mapping-parity.test.ts` closed the assertion/ACT-mapping half only, not this one. The rented-LLM
  backends are still untested; `verify-gate.ts` still needs undeclared env vars and a dependency; the
  CLI's shadow scorer is still a dead duplicate pointing at a `.venv` that does not exist; `cli.ts`'s
  header still claims "the local Codex login" against a `local` default.
- **Wire contract (§5, partial):** no single consolidated `CaptureRequest`/`CaptureResult`/health/
  `DiagnosticMark` module exists yet, and `capture-screenreader-dataset.mjs` still builds its own POST
  body. (Two of §5's three items — the protocol-version/fault-code subpaths and the CLI's `captureId` —
  are already fixed; see §15.)
- **`cli.ts` duplication (§6.5):** `CRITERION_STATES` (`forms/coverage.ts`) still has no test comparing it
  against `criterion-coverage.ts`'s `CRITERION_COVERAGE`.
- **CI/verification gaps (§7.2–7.5):** no Ansible check runs anywhere (`check-modules.py` is invoked by
  nothing). `release.yml:161` still reads `$status` under `set -u` after the variable was renamed
  `smoke_status` — an unbound-variable crash waiting for its branch to execute. `pure-graph.test.ts` still
  names the retired `edge-args.test.ts` instead of `browser-args.test.ts`, silently unchecked via its own
  `existsSync` skip. `.c8rc.json:88` excludes a script that does not exist. `packages/cli/README.md`
  still documents the Action runner's exit-2 behaviour as the CLI's own. `examples/workflow.yml` and
  `action.yml` still default `probe-forms` oppositely. `action.yml` still pip-installs unpinned versions
  behind a pip-cache key that is a constant string.
- **The UTM path (§8), the sharpest gap of the lot — this was a top-10 audit finding with no backlog row
  of any kind:** ~2,460 lines of UTM-only code are still exported/shipped with two bins, and three of the
  five docs the audit named (root `README.md`, `docs/control-plane-proxmox.md`,
  `packages/worker-fleet/README.md`) still say nothing about deprecation. (`leaseWorker`'s inventory-first
  order and `doctor`'s fleet-aware checks are already fixed — commits `dd6299b` and `126f56c`; see §15.)
- **Duplication with no owner (§9, excluding rows already tracked elsewhere on this page):** the gate
  exit-code contract, argv parsing, raw `fetch` surviving at four call sites, and Windows-trimming logic
  in three separate files. The `runs/` layout is **closed** (`packages/lab/src/dataset-paths.mjs`,
  enforced by `dataset-paths.test.ts`). The 95-variable environment configuration is **measured, not a
  duplication defect** (`docs/architecture-audit.md`'s §9 table row) — the cross-package subset does not
  disagree anywhere; the open item is 15 names read in 2+ files with no documentation, which is a
  documentation task, not more code.
- **Documentation architecture (§10.1, 10.2, 10.5):** eleven architectural decisions still live only in
  CLAUDE.md with no ADR. `PLAN.md` still self-contradicts on B1/B7's open/closed status.
  `packages/README.md` still tables six packages against nine that exist, `packages/control/` still has no
  README, and root `README.md` still misdescribes `nvda-speech` and still says "nothing trained yet".

**The paragraph that used to stand here — "cheap and genuinely open" — sent a reader at five rows that
were all already closed.** Checked 2026-09-06: the `pure-graph.test.ts` filename (fixed, reads
`browser-args.test.ts` at line 38), the `.c8rc.json` phantom exclude (entry gone), the `release.yml:161`
unbound variable (reads `smoke_status` throughout), `cli.ts`'s "local Codex login" header (line 9 is now
the comment recording the fix), and the UTM docs deprecation note (all three — root `README.md`,
`docs/control-plane-proxmox.md`, `packages/worker-fleet/README.md` — carry one; the status box above
already said so). See the STATUS box's SECOND PASS entry above for what else this same check found. There
is no small, cheap, genuinely-open item left in this section as of this pass.

## ~~OPEN — the census fix does not reach the focus-event path~~ — CLOSED 2026-09-06

**Verified by running the test this section's own remedy names, not by reading the fix.** `capture-pure.mjs`
carries a dated comment, `"THE SEAM THIS CLOSED, 2026-09-06"`, at exactly `focusEventVerdict`: it now takes
`{ events, error, targetMatch, candidates }`, calls `focusTargetIsSuspect({ targetMatch, candidates })`
first, and returns the same `checked: false` "cannot say" shape the no-log branch already used when the
target is suspect — precisely the remedy this section specified. `focusTargetIsSuspect` is the WORKER-SIDE
TWIN this section predicted (`.mjs`, not importing the TypeScript `censusTargetIsSuspect`), pinned equal by
`focus-target-suspect-parity.test.ts` exactly as recommended. Ran it: `npx tsx --test
packages/nvda-worker/src/focus-target-suspect-parity.test.ts` — 1/1 pass, `"focusTargetIsSuspect and
censusTargetIsSuspect agree on every case"`.

Original finding, kept for the record rather than deleted, because the shape it names — a remedy applied at
one call site when the behaviour reaches several — is this repo's most expensive recurring defect and worth
the two paragraphs:

`f95c95d` made a suspect census read as `null`, checking every `census.heading === 0` consumer — the right
check for the CENSUS and the wrong SCOPE for the uncertainty underneath it, since `choosePageTarget` taking
the wrong CDP target also reaches the F55 focus-event detector through the same `pageTarget()` machinery,
unprotected at the time. **"A remedy applied at ONE call site when the behaviour reaches several"** — the
fifth recorded instance. Bounded even before the fix: `mapping: "secondary"` so it refers rather than
asserts, and F55 only runs during `probeFocusOrder` — a wrong referral is still wrong, which is why it was
closed rather than left as an accepted bound.

| | |
|---|---|
| **2.4.7's F55 rule ships and its LOWER BOUND is unverified.** `FOCUS_SCRIPT_BLUR_WINDOW_MS = 50` separates a script stripping focus from an ordinary Tab transition. The negative side is measured twice on real pages — 24 real focusin→focusout pairs at a minimum gap of 633 ms, a **12.6× margin**, and an earlier 38.9× on a different page — so it will not false-positive. **No capture has ever recorded a real script `blur()`**, so nothing says whether a borderline true positive lands under 50 ms. The failure direction is the safe one (a too-tight threshold is SILENT, not accusatory) and the rule is `secondary` so it refers rather than asserts — which is why it ships rather than waits. Now also in [known-gaps §39](./known-gaps.md) — this is the document a user reads to learn the tool's limits, and it did not have this one. | Capture `focus-removed-on-receipt-{order,claim,booking}` and read the real gap. The cases exist in `case-matrix.mjs`; the chain captures them. **Do not tune the threshold to make a test pass first** — a canary that cannot express the fault is worthless, and this register records three occasions when a clean result from a check that could not have failed was read as confirmation. |
| **`rule-ownership.json` has no 2.4.7 entry.** It is keyed on the corpus's own declared subtypes and there is no 2.4.7 subtype yet, so the omission is currently correct. The moment the `focus-removed-on-receipt-*` cases declare one, that file needs `decidedBy: "rules"` — and until it does, `asserting-subtypes.test.ts` and the shortcuts audit's rule-decided shield both read 2.4.7 as model-decided, which it is not. | Add it WITH the case, not after. This is the `3.3.2` shape: a subtype whose ownership nobody recorded, found later by a gate that could not attribute it. |


## Accepted designs, not yet built

| | what would tell you it is fixed | detail |
|---|---|---|
| **1.4.2 Audio Control has a RULE and no corpus case — declared 2026-09-06 so the gap is loud rather than invisible.** `addAutoplayingAudio` emits `1.4.2:autoplay-uncontrollable` and nothing in the corpus produces it. Found by the completeness test's first run, which is the test earning its keep: an undeclared emitter is invisible to `rules:gate`, and that is exactly how 2.4.7 hid. **The first instinct was a named exception, and the CEO refused it** — *"an exception makes it invisible again by a different route, however honest the sentence beside it."* So it is DECLARED (`rules`, `secondary`) with no case: no records carry the subtype, so no head is created, and `rules:coverage` now says what is true — **"never fired anywhere, the claim rests on nothing."** | A corpus case exercising autoplaying audio a user cannot stop, and a media-autoplay probe to capture it — this corpus has neither. Then `rules:coverage` reports 1.4.2 fired on real evidence rather than never. | **The reason it matters more than an ordinary missing case:** 1.4.2's only evidence source is `mediaCensus`, which until 2026-09-06 was read AFTER our own navigation probe moved the page **and carried no `targetMatch` at all** (known-gaps §40). So this rule has been reading a document that may not have been the page, with nothing able to say so, for as long as it has existed — and no corpus case could ever have caught that. |


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
| **4.1.2's SETTABILITY clause cannot be assessed by this tool** | Found auditing `known-gaps.md` for staleness, 2026-09-05 — already stated in `criterion-coverage.ts`'s own 4.1.2 note and `docs/coverage.md`, but not in the one document a user reads to learn this tool's limits. It asks whether an AT can programmatically SET a value the user can — a UIA/IA2 automation-surface question. This project's capture emulates the keyboard, so it witnesses operability, not settability; a control the AT cannot set presents as one that does not respond, indistinguishable from 2.1.1's failure in speech. Structural, not a corpus gap. [known-gaps §38](./known-gaps.md) |

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

**PRECONDITION ADDED 2026-09-05, and it is reported as a SENTENCE, never as a tick.** `action-smoke.yml`
must be green **against the v19 weights, on the exact commit that ships** — reported as
`green on <sha>, weights <schema>`, not as "green".

The reason is a measurement, not caution. `gh run list --workflow=action-smoke.yml`, 200 runs:
**114 success, 85 failure, and the most recent success was 2026-09-03T12:16** — the day
`schema-migration.json` records the v18→v19 migration as opened. Every red run since dies in the same
place, `score.py:536` → `verify_artifact` → *"scorer representation schema"*, which is the migration's
own lock working exactly as designed.

**Eighty-five consecutive red runs is the shape a workflow gets ignored in.** So the first green after
the lock closes is the one that carries information, and it must be LOOKED AT rather than assumed —
the run reaches the judge step, which means NVDA installs, a real capture runs, and only scoring is
blocked. A green that arrives without anyone reading which weights it scored would be the
`ok`-versus-`ready` conflation this project has already paid for once.

**No hands are needed to make it happen**: it triggers on push, so the next push after v19 lands or
reverts exercises it. What needs a human is reading the result and naming the sha and the schema.

**AND EVERY ONE OF THOSE 85 RED RUNS THREW AWAY ITS OWN REPORT — fixed 2026-09-05.** The
`if: failure()` step that exists to keep the evidence read `path: ${{ steps.witness.outputs.result-json }}`,
an output that step sets on its LAST line. So on a failure it was never set, the expression rendered
empty, and the upload died with *"Input required and not supplied: path"* — a failure handler that fails
precisely when it is needed, and `if-no-files-found: ignore` kept it quiet. It now names
`$RUNNER_TEMP/a11y-witness-result.json` directly, a constant assigned before the CLI is invoked, and
warns rather than ignores when it collects nothing. This does not change the verdict above — the runs
were red for the migration lock, which is correct — but it means the diagnosis above was reconstructed
from LOG TEXT when an artefact should have been sitting there, and any future red run for a DIFFERENT
reason would have been equally bare. Fourth instance in one evening of a diagnostic that cannot report
itself.


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

## The next action — REWRITTEN 2026-09-06 05:20, because the chain below RAN and this section outlived it

**The `everything` chain of 2026-09-05 17:29 is history. Everything under the fold below is kept as the
record of what it was for; it is no longer an instruction.** What is true now:

| | |
|---|---|
| the recapture | **DONE, twice.** 39 of 39 real pages, 0 failed, both times — once at `4d8a75a` and again at `3439b04` after the census-identity fix |
| `rules:gate` | **PASS — 20 of 20 rule-owned subtypes, 1,398 conformant records, 0 false positives**, with `2.4.7:focus-removed-on-receipt` at **9/9 EXACT**. That is the first run where 9/9 is a real number: the `alsoFails` label only reached the exporter on 2026-09-06 |
| `rules:real-pages` | **42 new findings → 5 → 0.** The 42 were read individually, not diffed; 37 were one defect (see below). The 5 that survived were read one at a time and every one is `mapping: "secondary"` → `cantTell`. **ASSERTED-WRONGLY: 0** — the column that matters, and the one collapsing it with `referred` made meaningless for a day |
| the baseline | **REBUILT from evidence read individually**, 10 findings → 13 over the same 85 pages. Two 2.4.3 findings LEFT, both the wrong-document census: the fix landing, not a rule going quiet |
| v19 | premise re-derived on the recaptured corpus; the postSubmit pair is **withdrawn in code**, v19 is the `formChanges` pair alone. `shippedSchema` is still v18: nothing is promoted |

**THE 37, because it is the most useful thing found tonight.** 2.4.7's F55 predicate treated an ORPHANED
focusout — one with no matching focusin — as a script strip, unconditionally, and its comment argued the
case. The log's FIRST event is the listener's start boundary: whatever already held focus when the listener
was installed necessarily has no focusin in the log, so an ordinary Tab opens every real page's log looking
exactly like F55. Measured before the fix was written, in both directions:

    37 of 37 conformant real pages  -> exactly ONE orphan each, and it was log[0], every time
    9 of 9 corpus positives         -> log[0] is a FOCUSIN; their orphans sit at index 2 and again at 9-23

So recall paid nothing. A TEST asserted the opposite and had **named the mechanism in its own comment**
before concluding against it — "before this log was installed" — which is this repo's "a comment that
names an ambiguity, above code that resolves it by assumption", appearing in a test rather than in a probe.

### THE ONE THING BLOCKING A CONCLUSIVE `rules:real-pages`, and it is a named v19 revert condition

    24 capture(s) opened on a COOKIE/CONSENT overlay and NEVER REACHED A HEADING
    30 capture(s) have a census this run does not trust: a real second CDP target existed and none was
       confirmed to be the page navigated to
    INCONCLUSIVE — only 31 of 85 were examined, so this says nothing about the rest

Both refusals are CORRECT and are why there is no corpus of wrong answers. Both are the tool, not the
pages. The second is now investigable rather than merely alarming: `candidates: 2` was a count with no
identity — `graphicUnnamed`'s defect one field along — and `choosePageTarget` records `candidateUrls`
as of `3439b04`, deployed, with the recapture that reads them running. The three plausible second targets
(a consent vendor's iframe promoted to a page target, an `about:blank` the `--app` window left, the real
page under a URL it normalised) need three different remedies, which is why the count alone could not
start the work.

<details><summary>The 2026-09-05 chain, kept as the record of why v19 was opened and what it had to clear</summary>

**`npm run lab:job -- -e job=everything -e ref=main` was dispatched at 17:29 on `ea03f8e`.**

> ### THE NUMBER THAT JUSTIFIES v19 RESTS ALMOST ENTIRELY ON AN INFERENCE — measured 2026-09-05, 23:5x
>
> `schema-migration.json` opens with *"61.7% of empty formChanges and 56.1% of empty postSubmitFields"*
> are "nothing looked" rather than "the page has none". That is the whole case for the feature cross. Run
> now against the corpus on disk, `corpus:observation-ambiguity` says:
>
> ```
> formChanges       empty on 3724, of which 2227 never asked  59.8% (2209 of those by the pre-9 fallback, not the record)
> postSubmitFields  empty on 4344, of which 2255 never asked  51.9% (2217 of those by the pre-9 fallback, not the record)
> ```
>
> The percentages are close to the originals. **The parenthesis is the finding: 2,209 of 2,227 — 99.2% —
> and 2,217 of 2,255 — 98.3% — are the pre-protocol-9 FALLBACK.** `channelWasAsked` returns
> `byRecord: true` only when a capture carries an `observed.<channel>` block; without one it infers the
> answer from the `formProbe` mark. So only **18** formChanges verdicts and **38** postSubmitFields
> verdicts come from a capture that actually recorded whether it was asked. The rest is a best guess about
> old captures.
>
> **This does not refute the migration and it is not a reason to revert.** The inference is a reasonable
> one and it is the only answer those captures can give. What it means is that the CEO's condition —
> re-derive on the RECAPTURED corpus — is not a formality, it is the first real measurement of this
> quantity. Every capture at protocol 15 carries a real `observed` block, so the recaptured number is
> `byRecord` throughout and can move in either direction.
>
> **And it was invisible until this morning.** `emptyByFallback` was introduced by `fdfa3a5` ("'asked'
> meant two things, and the audit read the weaker one"). Before that commit the audit printed the
> percentage with no indication of how much of it was inferred — a number with no provenance, which is
> this file's own most-repeated rule arriving on the figure that a schema migration was opened on.
>
> **What to do when the chain finishes**, and it is one command, on the LAB because a laptop copy answers
> `unknown`: `npm run lab:job -- -e job=observation-ambiguity`. Read the parenthesis first. If the
> fallback share is near zero and the percentage holds, the case for v19 is measured rather than inferred
> for the first time. If the percentage collapses once it is measured properly, that is a REVERT — and it
> is the outcome this whole exercise existed to make visible.

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

</details>

## How an item leaves this page

Delete the row, and put the *lesson* in the record — `known-gaps.md` for something the project did not
yet do, `not-working.md` for something that was wrong. A closed row that stays here is how a tracker
becomes a second record and stops being read.
