# a11y-witness — the road to a general release

## North star

Reach the half of accessibility testing that rule scanners structurally cannot: whether what a screen reader
announces, as someone reads and operates a page, adds up to something a person can use.

**In two halves, because they are different jobs.** Where the screen reader's own output settles the
question — a control that announced `collapsed`, was activated, and still announces `collapsed` — the tool
WITNESSES and ASSERTS. Where the question needs a person, it does the TRIAGE rather than the judging: finds
the moment worth looking at, quotes the announcement, and reports `cantTell` rather than guessing.

Recorded here because it was decided on evidence rather than taste, and the evidence is specific. Measured
2026-08-24 on the product path across 18 real pages their publishers declare conformant: **0 criteria
asserted wrongly, 4 referred**. The rule layer is exact on every criterion it owns with 0 false positives
across 1,183 conformant records; the trained scorer never asserts at all, and
[ADR 0021](./docs/adr/0021-the-layer-that-decides-must-be-the-layer-allowed-to-claim.md) records why that is
the right division rather than a shortfall — a subtype whose evidence is decisive belongs with the layer
allowed to state a conclusion from it.

The ambition this replaces — "automate that judgement" — was not wrong to hold, but it is not what the
measurements support, and a north star nobody can verify is a slogan.

## What this file is

**The backlog for one thing: making this generally releasable.** Nothing else belongs here.

It was rewritten on 2026-08-09, when it had reached 1,299 lines of finished work and fixed defects. The
history is in [`docs/history-2026-08.md`](./docs/history-2026-08.md) — read that before re-attempting
anything that looks obviously worth trying, because a lot of it already failed once and the measurements
are recorded.

## Where we actually are

Verified at `39ecc3b` (2026-08-22): 805 tests, lint and typecheck clean, `release:gate` passing end to end
against the recaptured corpus, CI green, `capture:check` passing against a real worker, and the GitHub Action
exercised as a consumer would use it. The infrastructure is in good shape.

The honest shape of the product today:

| | |
|---|---|
| criteria assessed **on a real page** | **10** of WCAG 2.2's 55 A/AA — 1.1.1, 1.3.1, 1.4.2, 2.1.2, 2.4.4 in full; 2.1.1, 2.4.1, 2.4.2, 2.4.3, 4.1.2 **partially**, each with its boundary recorded in `criterion-coverage.ts` |
| criteria the trained scorer covers | 8; at floor **0.70** it scores **20 of 22** calibration pages with **0** false accusations. **Read the positive side as ONE defect, not three** — every form control on all three publisher-declared inaccessible pages is the same unnamed combo box in one template's shared chrome (ADR 0015) |
| false positives on conformant pages | **0**, measured — `release:gate` 2026-08-22: recall 78% over 48 failure-case runs, 0 false positives |
| captures that read the **wrong page** | **0 of 54** on the path that can produce it — ceiling ≈5.6% |
| capture reliability | **0 failures in 2,124 captures** — the full corpus recapture, 4 bare-metal workers, 4 h 34 m, no evictions and no degraded workers retired |
| people other than the author who have run it | **0** |
| free vetoes in the shipped weights | **225** across all 13 heads — a head penalising a feature that is 0 on every one of its training positives, learned at no cost because one page demonstrates one thing. `npm run scorer:shortcuts` (ADR 0015) |
| 4.1.2 on a page that also has a table, or any correctly named control | **not reported** — measured, causal, and being fixed by the corpus rather than the weights |

> **Two of those rows were wrong until 2026-08-21/22, in opposite directions.**
>
> **Capture reliability was pessimistic**: "4 errors in 60 back-to-back captures, clustered at the end
> (speech-channel decay)" described the UTM pool before `ensureSpeechChannel`'s probe and before the fleet
> was bare metal. The current figure is a full corpus run.
>
> **The criteria count was optimistic, and 2.1.2 is why.** It was listed as assessed on a real page while
> `addKeyboardTrap` had never once fired against known evidence: no case targeted 2.1.2, it was absent from
> `rule-ownership.json` so `rules:gate` did not cover it, and it reads `interaction.focusOrder`, which no
> capture carried because `probeFocus` was dropped at the third of three hops that each enumerate case
> fields by hand. The rule shipped, was correct, and was unreachable. It is now validated end to end —
> `2.1.2:focus-trapped 1/1 rules: EXACT` — so the **6** is honest for the first time.
>
> The lesson generalises past this row: **a criterion in a coverage table is a claim, and a claim needs a
> case, a capture, a signal and an owner.** `criteriaAssessableFrom` (`criterion-coverage.ts`) exists to
> make that answerable mechanically rather than by reading four files.
>
> **Four of the nine are PARTIAL, and that is the honest shape rather than a shortfall.** Three of them —
> 2.4.1, 2.4.2, 2.4.3 — were added on 2026-08-22, and in each case the criterion has several failure modes
> of which a screen reader can prove one. Naming which one, in `criterion-coverage.ts`, is what stops a
> partial claim being read as a whole one.
>
> **All three are failures a static analyser structurally cannot reach**, which is the clearest statement so
> far of what this tool is for:
>
> | | the mode assessed | why markup cannot answer it |
> |---|---|---|
> | 2.4.1 | a skip link that is present and **inert** | a checker sees a link and a plausible href and passes it |
> | 2.4.2 | the route changes and the **title does not** | the markup is valid at every instant; the failure is the transition |
> | 2.4.3 | the tab order **contradicts the reading order** | the DOM has no reading order to contradict until something walks it |
>
> **2.4.2 is recorded as PARTIAL, which is the honest shape.** Page Titled has
> three failure modes and only one is worth a screen reader. A missing title is vanishingly rare — zero
> across 4,895 captures, and absent from the failures covering 96% of WebAIM's million-page survey — and
> whether a title *describes* its topic is judgement, the wall 2.4.6 also stops at. What is now assessed is
> the single-page-app transition: the route moves and the title does not, so the reader still announces the
> page you left. **A static analyser cannot reach that at all** — the markup is valid at every instant, and
> the failure is the transition — which makes it the clearest example so far of a claim this tool can make
> and the rule layer beside it cannot.

That last row is the one that matters most, and no amount of green CI substitutes for it.

### CORRECTION, 2026-08-24: the table above counts criteria that had never run on a real page

The row *"criteria assessed **on a real page** — 10"* was not measured on real pages. It counts criteria
the rules are WRITTEN for. Measured directly, over 3,210 corpus captures and 77 real ones, by running
`ruleFindings` and tallying what came out:

| rule → criterion | fired on corpus | fired on a REAL page |
|---|---|---|
| `addMissingHeadings` → 1.3.1 | **0** | **0** |
| `addAutoplayingAudio` → 1.4.2 | **0** | **0** |
| `addInertSkipLink` → 2.4.1 | 12 | **0** |
| `addStaleRouteTitle` → 2.4.2 | 9 | **0** |
| `addVagueLinks` → 2.4.4 | 62 | **0** |
| 1.1.1 · 2.1.2 · 3.3.2 · 4.1.2 | 350 · 11 · 265 · 425 | 19 · 1 · 6 · 52 |
| 2.1.1 · 2.4.3 | 9 · 13 | 45 · 31 — **first ran 2026-08-24, and both were wrong** |

**Five of eleven rules have never fired on real evidence, and two have never fired at all.** A rule that
has never executed is not a covered criterion; it is an untested assumption with a criterion number.

The two that left that pool did so by accident. `MAX_TAB_STOPS` was 12 while real pages carry a median of
79 focusable elements, so `addKeyboardUnreachableControl` — which refuses to claim anything unless the tab
cycle closes — could never close one, and `addBrokenFocusOrder` found fewer than two shared names and
returned early. Raising the cap ran both for the first time: 2.1.1 reported keyboard-unreachable controls
on **23 of 35 conformant pages**, 2.4.3 on 19. Neither regressed. Both had been wrong all along and silent.

Other rows in that table need the same reading. *"0 false positives on conformant pages"* was measured on
the corpus, where no page has more than 22 focusable elements. *"20 of 22 calibration pages"* is now 38
pages, and the sweep that produced it was passing `truncatedSweeps: []` where the product passes the real
value — 18 referrals measured against 151 reported.

**The generalisation, and it is the reason the section below is sequenced the way it is:** every gate this
project owns runs on a corpus built from the same assumptions as the code it checks, so a shared wrong
assumption is invisible to all of them at once. That is ADR 0019's thesis, and 2026-08-24 found it in a
probe constant, a name normaliser, a calibration sweep, a promotion gate and a test's own fixtures.

---

## The goal, and the sequence to reach it

**The end state:** someone who is not the author installs this, points it at a site they own, and gets
screen-reader-witnessed findings they can act on — each carrying either an assertion the evidence settles
or a referral worth a person's time, with a stated error bound that holds on pages nobody trained on.

Four phases. They are ordered by dependency, not by preference, and each exits on a **measurement** rather
than on work being finished. The blocker list below (B1, B5, B7, B8) distributes across them.

### Phase 1 — The tool stops making claims it has never tested

*Exit: every rule has either fired on real evidence, or is reported as unvalidated. No rule reports on a
criterion it has never demonstrated.*

The instrument has to be honest about its own coverage before anything else is worth measuring, because
every later number is computed through it.

1. **Ship the never-fired audit as a gate.** It is the general form of today's defect: it would have named
   2.1.1 and 2.4.3 in the morning instead of after they misfired, and it names the next five now.
2. **Fix 2.4.3's evidence.** It compares tab order against `structure.formFields`, which is assembled from
   a sweep walking BACKWARDS and FORWARDS from the caret — on `check-for-flooding` that array is exactly
   reverse document order. The rule's premise is false. The capture already records `prevStopPhrase` /
   `nextStopPhrase` and discards the direction; recording the two walks separately makes document order
   recoverable. **This is a capture change and costs a recapture of the real pages.**
3. **Validate or retire the five.** 1.3.1 and 1.4.2 have never fired anywhere; 2.4.1, 2.4.2 and 2.4.4 have
   never fired on a real page. Each needs either a real page that exercises it or an honest `PARTIAL`
   entry in `criterion-coverage.ts` saying it is unproven.
4. **Re-measure `asserted-wrongly` on the product path** once 1–3 land.

### Phase 2 — A model can actually be promoted

*Exit: a candidate passes `job=promote` on its own merits, and the report states the false-positive bound
it holds rather than a precision that restates its own constraint.*

1. **The promotion gate demands recall 1.000 on every head**, which no learned model can meet. It carries
   the identical flaw `regressions()` already has a scar for — comparing a candidate measured on a harder
   population against an incumbent measured on an easier one — twelve lines away in the same file. **This
   is a decision about what the gate should require, not a bug to quietly fix.**
2. **Establish a baseline.** The shipped model is `screenreader-structured-v7`; the runtime computes `v15`,
   so the shipped weights cannot be scored at all and "is the candidate better?" is currently unanswerable.
   Either promote a v15 as the first-of-schema baseline, or record explicitly that no comparison exists.
3. **B8 — MEASURED DOWN FROM 225 TO 67 on 2026-08-24, and the headline understates it.** Removing
   `vague_link_present` as a model input took 2.4.4 from 27 false positives to **0** with recall rising,
   and cleared 2.4.6 to 1.000/1.000 in the same change. Six heads now carry **zero** free vetoes:
   all three 1.1.1 subtypes, both 1.3.1 subtypes, 2.4.4 and 2.4.6.

   The remaining 67 are not spread evenly, and where they sit changes what they cost:

   | | free vetoes |
   |---|---|
   | in **rule-decided** heads, whose model output `findingsFromScores` suppresses | **59** |
   | in heads that actually decide something in production | **8** (3.3.1 and 4.1.3, four each) |

   So the number that reaches a user went 225 → **8**. The 59 sit on `2.1.1`, `2.1.2`, `2.4.1`, `2.4.2`
   and `2.4.3` — every one a head with **3 to 7 positive records**, which is ADR 0015's mechanism stated
   exactly: a head that has never seen a positive carrying a feature can veto it at no cost. The remedy
   is corpus, not weights, and it is Phase 3.1 — these five are the same criteria the rule layer decides,
   so nothing ships on them today either way.
4. **Keep the NP bound honest.** ADR 0022 gives population FP ≤ 0.5% at 95% confidence, recorded as
   `exact: false` because out-of-fold scores come from K fold models where the proposition assumes one.
   Closing that needs negatives held back from training entirely.

### Phase 3 — The claims are defensible on pages nobody trained on

*Exit: an error rate on real pages with enough pages behind it to be meaningful.*

The calibration set is **38 pages, so the finest error rate it can express is ~2.6%** — the sweep says so
itself. A tool that asserts conformance failures needs better resolution than that.

1. **Grow the real-page corpus**, especially conformant pages. The three publisher-declared *inaccessible*
   pages are capped by labelling discipline, not by effort: statements, WCAG-EM reports and GDS monitoring
   all aggregate to the site, and an audit years apart from a capture describes a different page.
2. **DECIDED 2026-08-24 — the promise is split by layer, because the layers differ in kind.** The question
   was whether the tool claims *zero on this corpus* or *a bounded rate with a finite-sample guarantee*.
   Both, and which one depends on who is speaking — ADR 0021's division doing product work:
   - **The rules keep "zero".** They are deterministic, carry no threshold, and nothing was tuned to make
     the number come out. "0 false positives across 1,183 conformant records" is a measurement and stands
     — now paired with `rules:coverage`, because a rule that never fires scores zero too.
   - **The scorer states a BOUND**, not a zero: population false-positive rate ≤ 0.5% at 95% confidence,
     distribution-free (ADR 0022), recorded as approximate. Its old "0 false positives on development"
     was the constraint restated — the threshold was chosen to make it true — and a figure that cannot be
     wrong cannot be informative.

   What this deliberately does NOT do is adopt conformal risk control. It is the more general tool, and the
   generality is not needed: type-I error IS the risk being bounded here, and Neyman-Pearson states it
   directly with a tighter order-statistic result. Revisit if a criterion ever needs a non-binary loss.
3. **Watch the cliff.** Three heads sit at 0.95, the top of the grid. One more negative crossing leaves
   them no valid cut at all.

### Phase 4 — Someone else can use it

*Exit: a stranger installs it, runs it on their own app, and the findings survive contact with them.*

This is B7 → B1 → B5, and it is last for a reason that changed today: **a tool that refers on 7 of 10
conformant pages cannot be handed to anyone.** 2.4.3 currently fires on 71% of conformant real pages and
2.1.1 on 31%. Phase 1 is what makes Phase 4 defensible rather than embarrassing.

1. **B7 — publishing (ours, cheap).** ADR 0007 chose Changesets and independent per-package semver and it
   was never built, so nobody can `npx a11y-witness`. Half the documented product is unreachable.
2. **B1 — the first outside user (yours).** Partly blocked by B7.
3. **B5 — the name, and the first publish (yours).**

### What this sequence deliberately does not do

- **It does not add criteria.** 11 rules exist and 5 are unproven; a twelfth would be a sixth unproven one.
- **It does not tune weights to make a number look better.** The abstention floor caught a page the tool
  should not have scored, and lowering it would have hidden that.
- **It does not treat the corpus as the gate.** The corpus is a controlled instrument for contrast, and it
  cannot express what real pages do — that is settled, five times over.

---

## Blockers — a general release should not happen until these are closed

**Status, 2026-08-22.** The line below is kept because it was true when written and is a useful record of
what closing a blocker by measurement looks like. It is no longer the whole list: a re-audit on 2026-08-22
found **two technical blockers nobody had written down**, and one of them means no stranger can install the
CLI at all.

> *2026-08-09: B2, B3 and B4 are closed by measurement. B1 and B5 are yours — neither can be done from
> inside the project. Everything technical that a release was waiting on has a number against it now.*

**The current list is B1, B5, B7 and B8.** B1 and B5 remain yours. B7 and B8 are ours, and B7 partly
blocks B1 — a stranger can use the Action from `@main`, but cannot `npx a11y-witness`, so half the
documented product is unreachable from outside this checkout.

| | blocker | whose | state |
|---|---|---|---|
| **B1** | someone outside the project runs it on an app they own | yours | open; partly blocked by B7 |
| **B5** | the name, and the first publish | yours | open |
| **B7** | **the release machinery decided in ADR 0007 does not exist** | ours | open, and cheap |
| **B8** | **the scorer's 225 free vetoes** | ours | fix in flight |

### B7. Nothing can be installed, and the mechanism to change that was decided and never built

**Why it blocks.** ADR 0007 chose Changesets, independent per-package semver, and a rule that "a PR that
changes any `packages/*` source **must** include a changeset. CI fails" otherwise. Measured 2026-08-22,
none of it is present:

| | |
|---|---|
| `@changesets/cli` in `package.json` | **absent** |
| `.changeset/` | **does not exist** |
| a CI job that enforces the changeset rule | **none** |
| a publish workflow | **none** |
| git tags / GitHub releases | **zero** |
| `npm view a11y-witness` | **E404 — nothing is published** |

Two consequences that are already visible in the documentation, and both were found by checking rather
than reported:

- `packages/cli/README.md` opens with `npx a11y-witness https://example.com` — a command that cannot
  work for anyone, and which is what npm would show as the package's front page.
- The Action was documented as `a11y-witness/a11y-witness@v1` in two files: the wrong owner and a tag
  nobody has cut. Fixed 2026-08-22 to `@main`, which resolves but moves under consumers.

**Done looks like.** Changesets installed and wired, a publish workflow, and a first tag — at which point
the Action can be pinned and the CLI can be installed. **It does not require deciding the name (B5):**
the packages can be published under the current name or held until B5 resolves, but the machinery should
exist either way, because building it under time pressure on release day is how a bad version number
becomes permanent.

**Note it is genuinely cheap** — one dependency, one config file, one workflow — which is precisely why it
went unnoticed. Nothing was hard enough to become a visible task.

### B8. The trained scorer penalises features it was never shown, and 225 of them

**Why it blocks.** Not because the product is wrong today — the layer split contains most of it, and the
deterministic rules are exact where they own a subtype. It blocks because **the defect class is invisible
to every quality gate this project has**, so shipping without closing it means shipping a number nobody
can defend. See [ADR 0015](./docs/adr/0015-one-defect-per-page-taught-the-scorer-to-veto.md).

**Done looks like.** `npm run scorer:shortcuts` materially lower after a retrain on the multi-defect
corpus, **and** held-out acceptance no better than it was. The second half matters more than the first:
the splice probe removed vetoes and cost 3.3.2 eight false positives, and could not distinguish "the veto
was load-bearing" from "spliced input is incoherent". Real pages are the experiment.

**State.** Corpus rebuilt (furniture plus 60 two-defect pages), recapture in flight 2026-08-22. Starved
feature/subtype pairs 263 → 178 by construction, with the rest awaiting the retrain.

### B1. Someone other than the author runs it on an app they own

**Why it blocks.** Every verification in this repo is one person's, on one Mac, against W3C's own pages.
That is a real gap, and it is the gap most likely to contain a wrong assumption nobody has noticed. A
stranger's first run is also the only way to find out whether six criteria of screen-reader evidence is
worth six minutes of CI to somebody who did not build it.

**Done looks like.** One person outside the project adds the Action to a repo they own, runs it on a page
they care about, and says plainly whether the output was worth it. Their reaction is the deliverable — not
a bug list.

**Whose call.** Yours. This cannot be done from inside.

### B2. ~~The intermittent capture failure is explained or bounded~~ — BOUNDED, 2026-08-09

**Why it blocks.** `capture:check` failed 5 checks, then 1, then passed twice, on unchanged code. A
consumer whose CI goes red for a reason we cannot explain uninstalls the tool — this repo's own note says a
tool that breaks builds the day it is installed gets uninstalled.

It is probably the same fault as the stale virtual buffer (B3): observed once with the correct page title
and the previous page's content. Two guards already catch it — `capture:check`'s identity retry, and the
CLI's `captureMentionsTitle` marking such a capture unverified — but "guarded and unexplained" is not the
same as bounded.

**Done looks like.** Either a diagnosis, or a measured failure rate with a retry that makes it invisible to
a consumer. A number, not a hope.

### B3. ~~The stale virtual buffer, diagnosed~~ — DIAGNOSED AND REMEDIED, 2026-08-09

**Why it blocks.** It can put evidence from the WRONG PAGE into a report. For a tool making accessibility
claims that is the most damaging failure available to it, however rare.

**What is known.** Observed once: correct document title for the page requested, the previous page's
content, one phrase kept over 40 advances, ~2.5 s per step against a normal 0.7 s. NOT reproduced in 25
consecutive page transitions during the real-page corpus capture, with a detector proven to fire on a
constructed fault. `reuseBrowser` is a per-request option now, so browser reuse can be isolated without
editing the guest.

**Watch out.** Two detectors were wrong before one was right — the first measured its own regex, the second
flagged a shared site template as staleness. Prove any new detector fires on a constructed fault before
trusting a negative result.

**Done looks like.** A mechanism, or a bound. The v3 scan in `docs/history-2026-08.md` is the shape to
reuse.

**Progress, 2026-08-09 — a mechanism found and remedied, but not yet a bound.**

NVDA's virtual buffer belongs to the *window*, not to the navigation. Browser reuse re-points an existing
window over the DevTools Protocol, which does **not** rebuild that buffer — so the buffer can still hold the
previous page while `document.title` is already the new one. That is exactly the reported signature: correct
title, previous page's content. `refreshBrowseBuffer` now issues NVDA+F5 (`refreshBrowseDocument`) on the
reuse path only, and absorbs the re-announcement so it cannot be miscounted as read-through movement.

Two things about this are worth more than the fix:

- **The remedy shipped dead the first time.** The guard read a flag that nothing ever set to `true`, so it
  returned early on every capture. Three `capture:check` runs then passed, and it would have been natural to
  credit the fix — while it had never once executed. What found it was asking for the *diagnostic mark*
  rather than the green result. The function now marks `browseBufferFresh` when it skips, so "did not need to
  refresh" and "never ran" can never again be the same silence.
- **One deploy remains unexplained, and is recorded as unexplained.** After a deploy that reported
  `2/2 worker(s)` on the expected hash, neither refresh mark appeared on a reused window — not the success
  and not the failure. The obvious theory, that `/health.code` proves only that the files landed, is
  **wrong**: `CODE_VERSION` is computed once at module load (`server.mjs:172`), so the hash does reflect the
  code the process loaded, and a push without a restart would report stale. No mechanism has been
  established. What is established is the practice that found it — **confirm a capture-path change by its
  diagnostic mark, not by a green result or a matching hash**, because both were present while the remedy
  was inert.

**The number B2 asked for, measured 2026-08-09:** `npm run identity:rate -- --worker=<url> --rounds=20`

| | |
|---|---|
| captures | 60, of which **54 navigated an already-open window** — the only ones that can express the fault |
| buffer refreshed | 54 of 54 |
| **wrong page** | **0** — 95% upper bound about **5.6%** by the rule of three |
| silent / unrecognised | 0 / 0 |
| capture errors | 4 (6.7%), **all four consecutive at the end of the run** |

So: a mechanism, a remedy verified firing by its own mark, and a bound. **B3 is closed** — the mechanism is
known and eliminated rather than detected. **B2 is bounded, not proven absent:** 5.6% is a weak ceiling, and
the honest statement is that the fault has been observed exactly once ever and not once in 54 attempts on the
path that produces it. Raise `--rounds` if a tighter number is wanted; each round is three captures.

Two things the run says that the headline does not:

- **The four errors are the documented speech-channel decay, not this fault.** One hard timeout followed by
  three consecutive `NVDA is running but not speaking`, after 56 unbroken captures — the survival curve in
  `CLAUDE.md`, arriving on schedule. They are reported separately and excluded from the rate, because a
  capture that failed did not read the wrong page; counting them would inflate the fault under test with the
  worker's reliability.
- **The earlier identity failure was this, not staleness.** The single `capture:check` failure this session
  came on a host saturated by a concurrent retrain and was an *empty* read. The harness reported "read the
  wrong content" for both cases, which is why it looked like a stale buffer; it now names which.

### B4. ~~The error rate to defend, decided~~ — ANSWERED 2026-08-09, **SUPERSEDED 2026-08-21**

> **UPDATE: the floor WAS lowered, and the section below is out of date.** Everything here is a correct
> measurement of a model trained on generated pages only. Once the realism tier reached 53 pages from 39
> publishers, the same sweep on a 22-page calibration set reports **20 of 22 real pages scored with 0 false
> positives** at floor **0.70** — so "do not lower the floor" and "anti-correlated with the truth" describe
> a scorer that no longer exists.
>
> Two things below are worth keeping rather than deleting. The *reasoning* still holds exactly: a floor is
> only lowerable if the model's accepted predictions are worth having, and that has to be measured on
> held-out pages rather than argued. And the 3-of-4 false-positive rate is why the realism tier was built at
> all. What changed is the model, not the standard.
>
> Note also that the floor is no longer *derived*: it is chosen on the calibration set and passed to the
> trainer, which records `derivedFloor` and `floorSource` beside it. The derived value would have scored one
> more page and turned an honest abstention into a miss.

`node packages/lab/scripts/calibrate-abstention.mjs` sweeps candidate floors over the 7 calibration pages
and reports what each one costs. Measured:

| floor | pages scored | conformant scored | FALSE POSITIVES | inaccessible caught |
|---|---|---|---|---|
| **0.847 (shipped)** | 0 | 0 | **0** | 0 of 0 |
| 0.75 | 1 | 1 | **1** | 0 of 0 |
| 0.70 | 4 | 4 | **3** | 0 of 0 |
| 0.55 | 7 | 4 | **3** | **0 of 3** |
| 0 (accept everything) | 7 | 4 | **3** | **0 of 3** |

Read the bottom row. Accepting every real page would have the scorer accuse **3 of 4 pages W3C publishes as
conformant** of 4.1.2 failures, while catching **0 of the 3** it publishes as inaccessible. Our own
deterministic rules find nothing on those conformant pages, so "false positive" is the right label.

On real pages this model is not merely uncertain — its output is **anti-correlated with the truth**: findings
where there are none, silence where there are real failures. Abstention is not conservatism here, it is the
only defensible behaviour, and the shipped floor of 0.847 is doing exactly the job it was added for.

**What this changes.** The realism tier stops being desirable polish and becomes the fix for a specific
measured defect. And no error rate needs choosing until a model exists whose accepted predictions are worth
having — asking "what error rate do we accept?" of this one is the wrong question.

**Honest bound on the analysis.** Seven calibration pages support an error-rate granularity of about 1/(n+1)
≈ 12.5% and nothing finer, so this is not a conformal calibration; it is the measurement a conformal
calibration would need. The script says so in its own output.

### B5. The name, and publishing

**Why it blocks.** Parked deliberately — the packages are unpublished because the name is undecided. A
general release needs a name, a registry presence, and the licence/attribution story checked once under
that name.

**Whose call.** Yours.

---

## `evidence:check` said CHANGED after the capture fix — the triage, so nobody redoes it

Exit 1 on 48 sampled pairs: 43 same, 2 drift, 3 changed. **None of the three was caused by the fix.** Two
were the CACHE carrying artefacts already diagnosed and fixed, and one is a screen-reader token this codebase
already treats as unstable.

| changed | cached → fresh | what it was |
|---|---|---|
| `icon-button-unnamed.bad` | `"￼, button"` → `"button"` | **U+FFFC**, Edge autofill |
| `icon-button-unnamed.good` | `"o, button"` → `"open account search, button"` | **focus-mode key echo** |
| `image-missing-alt.bad` | `"graphic"` → `"unlabeled graphic"` | an unstable NVDA token |

**The first two: measured before acting.** A scan of all 2,122 cached captures found 4 with U+FFFC, 1 with a
one-or-two-character control name, and 0 with the doubled quick-nav signature. Five files, so a full
four-hour recapture would have been the wrong response to a 0.2% residue. They were quarantined under
`captures/contaminated-20260809/` and recaptured — 6 captures, 0 failed, each pair from the same worker. The
hand scan is now `verify.corpus.test.ts`, which was verified failing against the corpus that carried them.

Two of the five had the artefact on **one variant only**, which is the shape that matters: an accessible form
focuses the field it rejected, so only the conformant half echoes — the contaminant then correlates with the
property under test and is available to the scorer as a shortcut feature.

**The third needs no action, and the reason is already in the code.** `rules.ts` records that `"unlabeled"` is
the UNSTABLE token — it was missing 1.1.1 on a third of captures of an image with no alt text — so the rule
keys on the STABLE hint (`"To get missing image descriptions, open the context menu."`) which both versions
carry. Worth knowing that the corpus is internally consistent here: 214 of 2,122 graphic-bearing captures use
the bare form and **0** use `"unlabeled graphic"`, because the corpus was captured on a different guest
(`192.168.64.6`) from the one that produced the fresh comparison (`.4`).

**Conclusion: the capture fix is evidence-neutral. No `CAPTURE_PROTOCOL_VERSION` bump, no recapture.** That
is what `evidence:check` exists to establish — the cache key is a proxy, the field-by-field diff is the direct
measurement — and it is also a reminder that a CHANGED verdict is the start of a triage, not a verdict on the
change under test.

**Re-run after the recapture: 48 compared, 46 same, 1 drift, 1 changed** — down from 43/2/3, with the one
remaining change being the unstable `"unlabeled graphic"` token above.

### ~~The one thing this uncovered that is still open: the fleet-consistency guard is inert~~ — CLOSED, 2026-08-22

Two guests appear to announce an unnamed graphic differently — `.6` (which captured the corpus) says
`"graphic"`, `.4` (which produced the fresh comparison) says `"unlabeled graphic"` — and **they share a cache
key**, so nothing prevents their evidence from blending. The key covers NVDA and Edge versions, the Windows
build, the architecture and `provisionRevision`, and the last of those reads **`"unstamped"`** on these
guests, exactly as `CLAUDE.md` warns for guests created before the stamp existed. A guard whose
discriminating field is a constant is not a guard.

> **CLOSED, and by a different route than the one proposed here.** The remedy below — re-provision the pool
> together so both stamp a real revision — is done: all four bare-metal workers report
> `provisionRevision: 67d7a53-7bfec1a8cd547b47`, and `fleet:status` now ends with
> `fleet CONSISTENT — these workers are interchangeable for capture`. The guest pair this section describes
> (`.4` and `.6`, UTM VMs on a Mac) is not the fleet any more.
>
> **But the interesting part is why the guard stayed inert after that was fixed, and it was not
> `provisionRevision`.** `browserVersion` is the FIRST entry in `fleet-consistency.mjs`'s `MUST_MATCH`, and
> the worker memoised it for the life of its process on a premise its own comment stated: *"an executable's
> version (updating Edge or NVDA restarts this process)"*. Nothing makes that true. Measured on
> a11y-worker-2: `/health` reporting Edge `151.0.4129.93` at five days' uptime while `msedge.exe` on disk
> was `.101`, written four days INTO that uptime. Every guest agreed on the same stale value, so a split
> fleet read as consistent — **a guard whose discriminating field is a constant**, exactly as this section
> says, arriving through a memo rather than through an unstamped key.
>
> Fixing the memo made `fleet:status` say it in one line, and revealed that only ONE of the four guests had
> actually updated. The fleet is now pinned to one Edge build by `roles/worker/tasks/edge-version.yml`,
> because the EdgeUpdate registry policies provisioning was relying on are documented as domain-join only
> and these boxes are standalone. The whole corpus was recaptured against the aligned fleet on 2026-08-21:
> 2,124 captures, one `browserVersion`, 0 failures, and `release:gate` PASS afterwards.
>
> The rule worth keeping from all of this: **a correct check fed a value that cannot express the fault is
> not a check** — and this section was right about the shape a year before the cause was found.

It is **not** a live production defect: `rules.ts` already keys 1.1.1 on the stable hint rather than the
`"unlabeled"` token, for this precise reason, and the corpus is internally consistent (214 bare, 0
`"unlabeled"`). But it means the fleet cannot currently prove its guests are interchangeable, and the remedy
is the one already documented — **re-provision the pool together** so both stamp a real revision, rather than
one at a time, which would let two differently prepared guests share an `"unstamped"` key. Not attempted here:
`a11y-worker-3` was in a running-but-not-answering state (a real fault by `worker:ctl`'s own reckoning) and was
stopped, so a two-guest comparison could not be made.

## B6. ~~Captures must survive a heavy real-world page~~ — CLOSED, 2026-08-10

Opened when the first real website this tool was ever pointed at produced a Node stack trace and no report.
Eleven defects, all found by pointing it at that one page, and **not one of them is reachable by the
2,122-capture corpus** — which is the argument for B1 demonstrated rather than asserted.

| what was wrong | how it presented |
|---|---|
| `windowsActivate` unbounded at a second call site | hung 234 s inside a 280 s budget |
| `powershellValue` `execFileSync`, no timeout, in `/health` | `/health` dead for 150 s; "the worker is dead" |
| `findFile` walked the disk on every `/health` | same, from a different syscall |
| `RECOVERABLE` was a regex that could not match `ECONNRESET` | worker EXITED when NVDA's socket closed as instructed |
| boot hygiene ran synchronously inside `listen` | `NOT ready` for 147 s, worse with every capture |
| fallback launcher never passed `--remote-debugging-port` | census impossible, reported as a timeout |
| `MAX_SWEEP_STEPS = 40` — the corpus maximum | page sampled, not validated |
| **one repeated announcement ended a sweep** | **graphics 5 of 66 on a page with duplicate alt text** |
| **one silent step ended a sweep** | **headings 3 of 10, no error anywhere** |
| CLI had no timeout below the worker's own | stack trace instead of the worker's diagnosis |
| `worker:deploy` verified once, immediately | "stale or failed" on guests that had deployed fine |

**Every sweep now ends on `exhausted` — NVDA's own "no next heading" — in both directions**, and the report
states reach as a number: `heading 10/10, landmark 5/4, link 51/58, graphic 59/66`. `evidence:check` reads 46
same, 1 drift, 1 changed, and that one change is the pre-existing cross-guest token difference, so the sweep
work is **evidence-neutral: no protocol bump, no recapture.**

**Two vCPUs was the enabler.** The guests were configured with 2 of the host's 14 cores. Raising them to 6 took
a capture of that page from "abandoned at 280 s" to 2:33, and `example.com` from 90 s to 19 s. Diagnosed by
elimination after a RAM hypothesis was proposed and refuted — memory pressure makes a server slow, and this one
went completely silent while the port stayed open, which is starvation, not swapping.

### The pattern all eleven share, and the rule that falls out

**An ambiguous signal was treated as definitive, and the ambiguity was usually already documented.**
`sweepInDirection`'s own comment said "an unchanged phrase is ambiguous between 'did not move' and 'moved to
something announced the same way'" — and then stopped on the first repeat. `beginsWithRole`'s comment recorded
the landmark-prefix trap twice, and did not strip containers. The remedy was present as prose and absent as
code.

> **When a comment names an ambiguity, the code below it must not resolve that ambiguity by assumption.**
> Every one of these cost a real finding, and every one was cheap to fix once the page that could express it
> existed.

The residual `link 51/58` and `graphic 59/66` are NOT known defects: both sweeps end on NVDA's own signal, so
the gap is between two instruments — the AX tree counts nodes NVDA's quick-navigation does not visit, such as a
graphic inside a link announced as one item. Stated as a number so a reader can judge it.

## Direction, settled by measurement on 2026-08-11

Three candidate directions were tested against evidence rather than argued about. Two are closed.

**A fast announcement ORACLE — closed, because it already exists.** `@guidepup/virtual-screen-reader`
is a shipping screen-reader simulator for unit tests: jsdom, testing-library, jest/vitest matchers,
Storybook. Searching for prior art before building cost an hour and saved the build.

The spike is still worth having, and `packages/nvda-speech` records it: NVDA's composition IS portable —
**6,703 of 6,704 headings reproduced from page source with no screen reader**, and symbol expansion
reproduces `alt="Logo.svg"` → "Logo dot svg" exactly. That is a publishable result and the strongest
evidence-of-contribution this project has produced. It is not a product.

Note what Virtual Screen Reader deliberately is NOT: it targets an idealised spec-compliant AT, validated
against Web Platform Tests, and its heading output is `heading, X, level 1` where NVDA says
`X, heading, level 1`. It answers "what does the spec imply?". It explicitly models no aria-live, no
timing, no interruption, and says "there is no substitute for testing with real screen readers".

**OCCURRENCE — open, unclaimed, and now measured as viable.** Did the page TELL the user what happened?
No existing tool answers it: axe has no AT, Virtual Screen Reader has no live regions or agency, an
LLM-on-DOM sees markup rather than speech, and ARIA-AT tests screen readers against a spec rather than
testing your app through one.

The open risk was reliability, and the argument was that flakiness wrecks ENUMERATION but not VERDICTS.
Measured on the `form-error-silent` pair, three runs each (`npm run verdict:stability`):

| variant | runs | verdict | correct |
|---|---|---|---|
| good — announces its error | 3 | informed, identical announcement each time | yes |
| bad — announces nothing | 3 | not informed, empty each time | yes |

**6 of 6, stable and correct**, on the same infrastructure that produced 3/8/12/13 form fields and
5/59/60 graphics the night before. The reason is structural rather than lucky: a verdict needs one bit,
and an announcement either happened or it did not — variance in HOW MUCH was captured cannot change
WHETHER the error was spoken. Enumeration needs completeness; occurrence needs a witness.

So the reliability problem that dominated 2026-08-09/10 is a problem for the half of the product that is
already commoditised, and much less of one for the half that is not.

**What follows.** Task journeys (ADR 0011) stop being out-of-scope-for-release and become the direction;
breadth of criteria stops being the axis to optimise. The VM fleet stops being an embarrassment and
becomes the reason the unique claim is hard to copy.

## Risks we are choosing to accept, and must therefore state

These are not blockers. They ARE things a reader must be told, and every one is already written into
`RELEASE.md` — this list exists so nobody quietly stops mentioning them.

- **QUALIFIED 2026-08-22 by ADR 0015 — read the entry below with these two corrections.**

  **"2 of 2 inaccessible caught" is ONE defect, observed twice.** Every form control on all three
  publisher-declared inaccessible pages is the same unnamed combo box in the site chrome three pages of one
  W3C template share. The findings are real; they are not three failures, and real-page recall must be
  quoted in distinct defects from now on.

  **And the reason the third is missed is not the abstention floor.** The shipped weights produce NO finding
  on it at any floor. The head penalises `table_present` (-1.26 logits) and `form_field_named` (-4.33) —
  features that are 0 on all 147 of its training positives, so the weights were free — and that page is
  built from 14 layout tables. Ablation on the unedited capture moves it 0.4525 -> 0.9752. Measured across
  all 13 heads: **225 free vetoes** (`npm run scorer:shortcuts`).

  So the numbers below are correct as measurements and describe a narrower competence than they read as.
  The fix is the corpus, not the weights, and it is in flight.

- **RESOLVED 2026-08-21: the realism tier is shipped, and "19 pages is not enough" was right about 19 and
  wrong as a conclusion.** The tier is now **53 pages from 39 publishers** and the scorer scores **20 of 22**
  held-out real pages with **0 false positives**, against 4–6 of 22 before. The superseded measurement is
  kept below because it is why the bigger attempt was made.

  | | previous | shipped now |
  |---|---|---|
  | realism tier | 19 pages, 1 publisher | **53 pages, 39 publishers** |
  | abstention floor | 0.7192 (derived) | **0.70 (chosen on calibration)** |
  | real pages scored, of 22 | 4–6 | **20** |
  | false positives on conformant real pages | 0 | **0** |
  | inaccessible caught (of those in support) | 2 of 2 | **2 of 2** |
  | held-out acceptance | 58 TP / 0 FP / 0 FN | **58 TP / 0 FP / 0 FN** |

  Three things made the difference, and only the first is "more data":

  1. **39 publishers rather than one.** The old tier was all W3C, so it made W3C pages marginally more
     familiar and moved nothing else — which is exactly what "identical cosines, to 4 dp" was reporting.
  2. **The publisher's disclosed exceptions were finally honoured.** The mask had been INERT for its whole
     existence: the join read `claimExcludes` off the captured file, which never wrote that key, so every
     page trained every head as conformant — including criteria the publisher states in writing that it
     fails. 53 of 53 pages now carry an exception.
  3. **The floor is chosen on held-out data instead of derived from the training set's own minimum.** The
     derived value scored one more page but converted an honest abstention into a MISS on W3C's own
     "purchase form, broken" demo.

  What the tier caught that no generated corpus could: `4.1.2:unnamed-control` moved its threshold from
  **0.05 to 0.9**. The trainer picks the lowest threshold reaching zero false positives, so every value
  below 0.9 false-positives on real conformant pages — an 18x error that synthetic data made look safe.

  > **Superseded (kept deliberately).** With a 19-page single-publisher tier: false positives on conformant
  > real pages 3 of 4 → 2 of 4, inaccessible caught 0 of 3 → 0 of 3, nearest-neighbour cosines identical to
  > 4 dp, and 4.1.2 on the generated corpus slightly worse (10 → 11 FP). At the then-shipped floor of 0.847
  > neither model scored any real page, so it would have changed nothing a user sees. The conclusion drawn
  > was that a tier needs materially more than 19 pages before it pays for itself. That was correct, and it
  > is what motivated going to 39 publishers.
- **The gap is unfavourably shaped.** Pages published as inaccessible sit FURTHER from the training
  distribution (~0.59) than conformant ones (~0.73). The scorer is least at home where a finding matters
  most.
- **No expert baseline.** "0 false positives" is measured against our own labelled fixtures and W3C's
  published conformance claims — not against an auditor's opinion of our findings. `docs/METHODOLOGY.md`
  says so; keep it saying so.
- **One screen reader, one browser, one platform.** NVDA in Edge on Windows. Accessibility support is
  demonstrated for that combination and no other, which the report states per run.
- **Page-scoped, not process-scoped.** WCAG claims conformance for complete processes; we examine one URL.
  ADR 0011 records what changing that would take.
- **Windows runner required.** A real adoption constraint, documented rather than solved.

---

## Explicitly out of scope for a general release

Named so they stop being ambient guilt:

- **Task journeys** (ADR 0011) — the next major capability, not a release blocker.
- **2.2.2 and 2.3.1** — the two remaining non-interference criteria. 2.3.1 is visual and belongs to the
  rule layer; 2.2.2 needs DOM animation detection.
- **EARL consumers.** The export exists; nobody consumes it yet, and W3C publishes EARL as non-normative.
- **Multi-worker scaling.** Measured and documented; one worker is sufficient for a release.
- **A second screen reader.** The capture interface is backend-agnostic by design (ADR 0001), and adding
  VoiceOver or Orca is a project of its own.

---
## After the release

The old M0–M4 milestones were removed on 2026-08-09 because they had stopped describing this project. They
listed the `POST /capture` service, the CLI and the GitHub Actions job as outstanding when all three ship;
they cited `src/spike/` paths that no longer exist; and their "100% recall, 0 false positives" figures were
measured against the LLM judge, which contradicts the honest numbers at the top of this file. They are in
[`docs/history-2026-08.md`](./docs/history-2026-08.md) if the reasoning behind an old decision is wanted.

What is actually next, once the blockers above are closed:

1. **A realism tier.** Train on real-page structure so the scorer stops abstaining. The corpus exists
   (ADR 0010); 19 training pages is a start, and widening it means finding more publishers who state their
   own conformance rather than labelling pages ourselves.

   > **Measured 2026-08-19, and it changes this item's premise.** `calibrate-abstention.mjs` against the
   > current weights, on the seven W3C calibration pages, scoring with the floor bypassed:
   >
   > | | 2026-08-18 weights | current |
   > |---|---|---|
   > | false accusations on pages their publisher calls conformant | 3 of 4 | **0 of 4** |
   > | deliberately inaccessible pages noticed | 0 of 3 | **3 of 3** |
   >
   > So the checks are now CORRECT on real markup, and the shipped floor of 0.847 scores **none** of these
   > pages — every one sits at cosine 0.59–0.76. The tool is correct and silent, which is a different
   > problem from the one this item was written for: it is no longer "the scorer is not ready for real
   > pages", it is "we cannot yet justify where to set the floor".
   >
   > **Re-run the same day on 19 calibration pages**, after adding twelve GOV.UK Design System components
   > as a second publisher — 16 conformant claims and 3 inaccessible:
   >
   > ```
   > floor   scored  conformant scored  FALSE POSITIVES  inaccessible caught
   > 0.847   0       0                  0                0 of 0     <- shipped: says nothing
   > 0.7     4       4                  0                0 of 0
   > 0.65    16      16                 0                0 of 0
   > 0.55    19      16                 0                3 of 3     <- everything, still no accusations
   > ```
   >
   > Perfect separation across two publishers. **But the effective sample is smaller than 19**: nine of the
   > twelve Design System pages score an identical nearest-neighbour cosine to four decimal places (0.6624)
   > and all twelve fall in 0.6564–0.6624, because a shared header, nav and footer dominate the embedding.
   > Twelve near-identical points are not twelve independent ones, so the harness's "5% granularity" is
   > optimistic. The next publisher should be structurally UNLIKE these rather than a thirteenth page from
   > the same site — that is what buys real granularity, and it is the same mistake as one publisher, one
   > level down.
   >
   > **The realism tier was then TESTED, 2026-08-19, and it is a null result at this scale.** 19 W3C
   > training pages, retrained to a scratch output and swept against the calibration split:
   >
   > | page | base (1,858) | +19 real (1,877) |
   > |---|---|---|
   > | after/template | 0.7217 | 0.7293 ↑ |
   > | after/news | 0.7347 | 0.7247 ↓ |
   > | design-system/details | 0.6764 | 0.6721 ↓ |
   >
   > Net zero inside ±0.01, and the floor stays at 0.847 in both. Accuracy is unchanged — 0 false
   > accusations over 16 conformant pages, 3 of 3 inaccessible caught — so the tier costs nothing and buys
   > nothing. Two mechanisms explain it: the 19 pages are all W3C, so they made W3C pages slightly more
   > familiar and a DIFFERENT publisher's pages slightly less; and the reference is capped at 512 rows, so
   > adding real pages EVICTS synthetic ones and can lower a page's similarity.
   >
   > ### Why more data of the same kind cannot work, with the number
   >
   > Nearest-neighbour similarity across the 1,877 training records:
   >
   > ```
   > min (= the shipped floor)   0.847      <- ONE record sets it
   > 1st percentile              0.8804
   > 5th percentile              0.9191
   > median                      0.993
   > records below 0.70          0 of 1877
   > ```
   >
   > Real pages sit at **0.59–0.73**. The two distributions do not overlap at all, so **no threshold
   > derived from this corpus can admit a real page** — every possible cut lands on the wrong side.
   > Lowering the floor to 0.55 is not calibration, it is abandoning the statistic.
   >
   > Note also that `inDistributionFloor` is a MINIMUM, which is an extreme-value statistic set by one
   > record and insensitive to volume. A quantile is the defensible construction — ADR 0010's own "finite
   > sample control of the error rate among accepted predictions" is a quantile — but it would RAISE the
   > floor to ≥0.88 and make abstention stricter. That is a correctness fix, not a coverage fix, and the
   > two must not be confused.
   >
   > ### What this specifies for the dataset work
   >
   > The corpus's defect is that it is TOO SELF-SIMILAR: a median of 0.993 means every synthetic page has a
   > near-twin. For real pages to fall in support, the training distribution has to reach down into
   > 0.6–0.75, which takes genuinely heterogeneous pages. The requirement is precise and it is about
   > VARIETY, not volume:
   >
   > **One or a few pages from MANY different sites — not many pages from few sites.** Measured three
   > times over: 19 pages from one publisher moved nothing; 12 Design System pages produced nine identical
   > cosines to four decimal places; adding a cluster gives each of its members a near-twin and leaves the
   > distribution unchanged. A hundred sites at one page each would do more than a thousand pages from
   > fifty sites.
   >
   > ### RESOLVED 2026-08-20: the realism tier works, and most of the gap was the STATISTIC
   >
   > Both earlier null results were artefacts. `build-realism-tier.mjs` wrote SEVEN wrong channel names, so
   > real and synthetic records were featurised into different channels and a linear head could separate the
   > two populations on channel tokens alone; and the OOD reference counted RECORDS, including the test
   > split. With both fixed:
   >
   > | | baseline | + 5 real training pages |
   > |---|---|---|
   > | support floor (derived) | **0.7192** | 0.7192 |
   > | held-out real page cosine | 0.7013–0.7251 | **0.8137–0.8309** |
   > | false positives, at every floor | 0 | 0 |
   > | pages scored at the derived floor | 0 | **4, all correct** |
   >
   > **The floor fell 0.847 → 0.7192 with NO new data**, purely from measuring distinct page STRUCTURES
   > rather than records and excluding the test split. That was roughly 70% of the gap to real pages: it was
   > mostly a wrong statistic, not missing data.
   >
   > **And five real training pages moved held-out real pages +0.10 to +0.13 closer.** The floor did not
   > budge, because a floor is a minimum over structures and five pages cannot be the minimum — which is
   > why "did the floor move" was the wrong question all along. The deployment question is whether an
   > UNSEEN real page gets closer, and it does, decisively. `distinctStructures` 763 → 767.
   >
   > So the scorer now speaks on real pages and is correct on them, which it has never done before.
   >
   > **One honest asymmetry qualifies that.** At the derived floor the four CONFORMANT W3C pages are in
   > support (0.81+) and score clean; the three deliberately INACCESSIBLE ones sit at 0.588–0.602 and are
   > still abstained. So the tool can now say "this page is fine" about a real page and cannot yet say
   > "this page is broken". A claim of *fine* without the ability to make its opposite is a false-assurance
   > risk, not a win. The before/after demos are structurally unusual (table layouts, no landmarks), so
   > closing it needs training pages that are structurally unusual too — the evidence-backed argument for
   > collecting for VARIETY rather than volume.
   >
   > Also measured: `captureWasTruncated` condemns **26 of 26** real captures unscoped, and 16 of 26 scoped
   > to channels the model reads. **9 of those 16 are `read-through:capped`** — the 150-line `DEFAULT_STEPS`
   > cap, sized for a corpus whose largest page is 2,118 bytes. Real-page captures are never cached, so
   > raising it for them is free, and it should recover most of the 14 rejected training pages.
   >
   > ### RESOLVED 2026-08-20 (Increment 1): the scorer speaks on real pages, and is right
   >
   > Raising the read-through cap to 600 for real-page captures removed **every** truncation: 38 clean / 0
   > truncated, up from 20 / 18, and the realism tier went 5 usable pages to 19 of 19. Retrained and swept
   > against a freshly recaptured baseline, so the cap change cannot take the tier's credit:
   >
   > | | baseline | +19 real pages |
   > |---|---|---|
   > | conformant real pages | 0.70–0.73 | **0.816–0.835** |
   > | INACCESSIBLE real pages | 0.578–0.586 | **0.698–0.729** |
   > | derived support floor | 0.7192 | 0.7192 |
   > | false positives, any floor | 0 | 0 |
   >
   > At the derived floor the scorer now scores **5 of the 7 W3C calibration pages and is correct on all
   > five** — four conformant clean, and `before/template.html` at 0.7292 caught as a 4.1.2 failure. It can
   > say "this page is fine" AND "this page is broken", so the false-assurance asymmetry recorded above is
   > substantially closed. `before/news` misses the floor by 0.0006, so the floor is now the binding
   > constraint at the margin rather than a chasm.
   >
   > ### The ceiling is PUBLISHERS, not pages — quantified
   >
   > 19 real pages contribute **6 distinct structures**, because `family` groups them by W3C tutorial topic
   > (images 5, forms 5, tables 4, page-structure 2, menus 2, carousels 1) and those pages genuinely share
   > templates. `distinctStructures` moved 763 → 768.
   >
   > So going from 5 pages to 19 — 14 extra pages inside the same six families — bought **+0.004**. The
   > +0.11 came from the structures. The marginal value of a new PUBLISHER is roughly two orders of
   > magnitude above a new page from one already present, measured rather than argued.
   >
   > That fixes Increment 2's specification: **40–60 different publishers, one page each.** Not 40–60 pages.
2. **Task journeys** (ADR 0011). WCAG claims conformance for complete PROCESSES, so a page-at-a-time tool
   structurally cannot assess sign-in or checkout — ours or anyone's. The largest single gap in what this
   category of tool can honestly claim.
3. **The remaining non-interference criteria**, 2.2.2 and 2.3.1, to complete WCAG §5.2.5 coverage.
4. **A second screen reader** behind the existing `CaptureBackend` interface (ADR 0001). VoiceOver is the
   obvious next one and the automation is known-fragile; JAWS is the most representative and the hardest.
5. **An expert-agreement baseline.** The one number that would turn "0 false positives against our own
   labels" into "0 false positives against an auditor".
6. **Assessors as a plug-in point, rather than three hardcoded layers.** There are already three — the
   trained scorer, the deterministic rules, and axe — and only the first two participate in the
   per-criterion picture. axe is bolted on beside them: it gets its own section of the report and
   `criterionOutcomes` still prints `untested` for criteria it assessed seconds earlier in the same run.

   The rule that turns this into an extension point is that **an assessor must declare which criteria it
   COVERS, not just report what it found.** "axe found nothing on contrast" and "axe never looked at
   contrast" are indistinguishable from findings alone, and confusing them is the failure this project is
   organised against. `CRITERION_COVERAGE` is already that shape and is hardcoded to our two layers.

   The payoff is that the visual and DOM criteria become someone else's problem BY DESIGN rather than by
   apology: a contrast checker, a reflow checker or an in-house rule pack each declares its criteria,
   returns criterion-tagged findings, and the coverage picture assembles itself. The claim stops being
   "we check 10 of 55" and becomes "here is the complete picture for this page, from whatever assessors
   were plugged in, and here is exactly what is left for a human".

   Explicitly NOT a reason to reimplement DOM checks here: four of the five DOM-reachable criteria
   (1.3.5, 3.1.1, 3.1.2, 2.5.3) are existing axe rules, and running them through the NVDA fleet would
   spend ~12 s of Windows VM time per page to read an HTML attribute that needs no screen reader at all.

## Known risks

- **JAWS automation difficulty.** Commercial and awkward to drive. Most desktop screen-reader users are on
  Windows (NVDA and JAWS), so leading with NVDA is right, but JAWS is the credibility gap.
- **AGPL on published libraries will deter some adopters**, pulling against the adoption goal. ADR 0006
  resolves it by keeping the engine AGPL and licensing the contracts package Apache-2.0 so third-party
  capture backends are legally writable. That split is effectively irreversible and needs explicit sign-off
  before the first publish — see blocker B5.
- **Packaging can silently change the evidence.** Moving worker files touches `action.yml`'s hardcoded
  server path and the hashed-file list shared by `deploy-worker.mjs` and `check-worker-code.mjs` — the
  mechanism that once had two guests serving stale code for an hour. `evidence:check` reporting SAME is the
  gate; CHANGED costs a full recapture.
- **Capture is OS-bound.** No single portable container runs the whole product; workers live where the
  operating system allows. The portable core hides this from users but shapes the infrastructure (ADR 0001).
- **The scorer may stay abstaining.** The realism tier is the plan, but a frozen-encoder linear head trained
  on generated pages may simply not generalise to real ones. If it does not, the honest product is the
  deterministic rule layer plus real screen-reader evidence — which is still worth shipping, and is what
  ships today.

Two risks were REMOVED as resolved: "trustworthiness of AI judgment — M0 decides it" (M0 is done, and the
answer is the abstention behaviour now documented), and "the default judge backend does not run from a clean
checkout" (verified: `packages/scorer/python/score.py` and the weights are both in `main`).

## Guiding principles

Unchanged, and the reason most of the history file exists:

- **A check must never reject evidence whose absence is the finding.**
- **Unchecked is not clean.** "We could not ask" and "the answer is no" must never be the same output.
- **Automate a check or lose it.** Anything a human has to remember is something that does not happen.
- **Prove a guard fails before trusting it.** A test written against a shape you did not verify is not a
  test.
- **A false positive is an accusation.** For an accessibility tool that is the expensive direction to be
  wrong in, so when the evidence cannot decide, say so.
"""
