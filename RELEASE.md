# Release status

What is verified, what is not, and what is deliberately deferred. Written to be read before shipping and
believed afterwards — every line is a measurement, not an intention.

## Verified at this commit

Run on a **clean checkout of `HEAD`**, which is what CI and a consumer see:

| check | result |
|---|---|
| unit tests | **462 pass, 0 fail, 2 honest skips** (the two git-dependent tests, in a tree with no `.git`) |
| typecheck | clean — and now actually covering the package tests: `tsc --listFiles` showed **0** of them in the program before M5, 24 after |
| lint | 0 errors (337 warnings, all `no-magic-numbers`, non-blocking by design) |
| `gate:isolation` | **6/6 packages usable when installed**, 1 private package skipped and announced |
| `rules:gate` | **PASS** — every rule-owned subtype exact on real captured evidence, **0 false positives across 1,183 conformant records**. This claim is about the RULE layer only, and it is a measurement: the rules are deterministic and carry no threshold, so nothing was tuned to make the number come out. See the row below for why the same words would be empty about the scorer. |
| `rules:coverage` | The other half of that claim, and it was missing until 2026-08-24: a rule that has never FIRED produces 0 false positives too. Five of eleven had never fired on a real page and two had never fired at all, while `criterion-coverage.ts` listed them as assessed. Exactness on evidence a rule never reached is not a result. |
| scorer false-positive bound | **Population rate ≤ 0.5% at 95% confidence, distribution-free** (ADR 0022), recorded as approximate — out-of-fold scores come from K fold models where the proposition assumes one. This REPLACES "0 false positives on the development set" as the scorer's claim. That number was never a measurement: the threshold was chosen to make it true, so every head reported precision 1.000 by construction and a figure that cannot be wrong cannot be informative. |
| held-out acceptance | **PASS** — `"passed": true`, no failure reasons |
| `npm run eval:gate` (judge quality) | **PASS — recall 78%, 0 false positives on conformant pages**, abstained on 5 of 16 failure cases, 48 failure-case runs (16 cases x 3). Recall was 59% before the realism tier, and 90% before abstention existed, when it carried 3 false positives, 2 of them accusing conformant W3C pages. It failed at one false positive until 2026-08-21; the cause was a mis-authored fixture, not the scorer. See below. |
| `verify.corpus.test.ts` | 6/6 |
| CI (`lint` + `capture-regression`) | **both green** — first time since 1 August; the fix was `capture-pure.mjs` |
| shipped model | `calibrationClean: true`, `generalisationVerified: true` (held-out, 0 errors), `releaseBlockedBy: []` |
| `npm run scorer:shortcuts` | **225 free vetoes across 13 heads** — the one number in this table that is not a pass. See the 4.1.2 operating limitation below; every other check here is blind to it by construction |

> **Read this before the table above reassures you.** Every gate in it evaluates on data that shares the
> corpus's structure, so none of them can see a head penalising a feature that is 0 on all of its training
> positives. Measured 2026-08-22: **225 such free penalties across 13 heads**. A green row is evidence about
> the thing it measures, not a general assurance — see *OPERATING LIMITATION* below and
> [ADR 0015](./docs/adr/0015-one-defect-per-page-taught-the-scorer-to-veto.md).
>
> **The layer split contains it, and that is measured rather than assumed.** Where a deterministic rule owns
> a subtype the scorer is suppressed for it, so `4.1.2:unnamed-control`, `1.1.1:missing-alt`,
> `1.1.1:filename-alt` and every keyboard/navigation criterion are unaffected. The nine subtypes the model
> decides alone are where a veto reaches a report.

Measured on a tree containing only committed content, which is what CI and a consumer see. `release:gate`
itself stops at `check-signals` for the 418 stale captures recorded below — a corpus-state item, deliberately
deferred; every other stage above was run individually.

The judge runs on **our own trained scorer** (`judge-backend: local`) — 27 KB of heads over an 87 MB
encoder. No LLM, no API key, nothing leaves the runner.

> **Corrected 5 Aug.** The figures above were first recorded while `packages/scorer/python/score.py`
> — the program that *is* this backend — had never been committed. It existed only in one working tree,
> so a fresh clone could not run its own default judge, and the numbers were produced by a file no
> consumer received. `npm pack` includes untracked files, which is why installing it appeared to work.
> The program is now tracked, resolves from `import.meta.url` rather than the process cwd, and
> `npm run eval:gate` runs from the committed tree. A test now asserts that
> every `scripts/…` program referenced by `package.json` or `action.yml` is tracked in git.
>
> **The figures this table quotes were wrong until 2026-08-21, and the sentence above used to claim this
> gate reproduced them.** It said "recall 59%, 0 false positives" while the gate actually reported 78% and
> **one** false positive — the number this project most needs to be true was the one that had stopped being
> checked, which is the same shape as the acceptance gate that sat failing while three others were green.

### The one false positive, and why it was the fixture rather than the scorer

`tut-menus-good` was reported as 4.1.2 at **0.9873** on `4.1.2:state-change-silent`, against a 0.9
threshold, while `unnamed-control` sat at 0.0003. For an accessibility tool a false positive is an
accusation, so a gate limit of 0 is right and this was a real block.

The obvious suspects were both recent changes of ours, so both were eliminated by measurement rather than
argument:

- **Not the abstention floor.** Novelty cosine 0.8131, far inside support, and it reproduced with the floor
  set back to its previous 0.7192.
- **Not the new weights.** The previously shipped model from `fb49862` reproduced it exactly, so the realism
  tier, the publisher mask and the threshold move from 0.05 to 0.9 were all innocent.
- **Not the deterministic rules.** `rules.ts` produces no findings at all on that page.

The page was wrong. It carried `<button aria-expanded="false">Support</button>` with **no script** and a
submenu that was never hidden, so "collapsed" was never true, activating the button changed nothing, and the
recorded evidence was structurally identical to a genuine state-change failure. The scorer was reporting a
real defect — just not the one the fixture was written to test, since that pair tests NAMING and the bad
variant is an unnamed icon button with no state changes at all.

`rules.ts` had already diagnosed this exact page and declined to build a rule for it, concluding that "the
evidence does not contain the fact the rule needs". That was the right call about a rule, and it is why the
fixture stood: the rule layer abstained, and the model has no such restraint.

Fixing it needed the page to toggle `aria-expanded` and the panel's `hidden` — the way `disclosure-good.html`
and the generated corpus both express a conformant disclosure — and then a recapture, because a fixture IS a
recorded capture. A second defect surfaced in that recapture: the panel was still being read out, because the
page's own `nav ul{display:flex}` outranks the `hidden` attribute. Both fixed; `tut-menus-good` now reports
nothing and `tut-menus-bad` is still caught at 100% recall.

**Recapturing it was not previously possible.** `capture-books.mjs` wrote to
`resolve(process.cwd(), "src/eval/fixtures/books")`, a path the `packages/` restructure moved, so it would
have created that directory wherever you stood and written fixtures nothing reads — while reporting success.
`capture-fixtures.mjs` replaces it, resolves from `import.meta.url`, and captures over a live worker instead
of only in-process on the guest.

`releaseEligible: true` in `training-report.json` still means calibration and held-out acceptance, and has
never meant `eval:gate`. Both are stated here rather than one implying the other.

### The claim this project exists to make, demonstrated

Against the University of Washington "Accessible University" demo — a third-party, expert-built
inaccessible page and its accessible twin:

| | before (inaccessible) | after (accessible) |
|---|---|---|
| screen-reader layer | 1.1.1, 1.1.1, 4.1.2, **2.4.4**, **1.3.1** | **none** |
| axe | 1.4.3, 3.1.1, 1.1.1, 4.1.2, 1.4.1, 2.5.8 | **none** |

Two findings only the screen-reader layer produced, quoting what a user hears:

```
2.4.4 Link Purpose          heard: "click here, link"
1.3.1 Info & Relationships  heard: "102 announcements, no heading among them"
```

axe reports neither, and not by oversight: its `link-name` rule asks whether a link *has* an accessible
name, and "click here" has one. Meanwhile axe found four things a screen reader cannot perceive at all.
Neither layer subsumes the other — and the accessible twin is clean on both, which matters more than the
findings.

## NOT verified

- **The `anthropic` and `openai` judge backends.** Written to their SDK specs and unexercised; this project
  keeps no metered key. They are opt-in, never the default.
- **The Action on a real Windows runner.** Its logic is covered by 14 renderer/policy tests and by
  `packages/lab/scripts/action-dry-run.sh`, which runs the Action's own bash locally against a live worker. The
  Windows-only setup steps (NVDA install, Speech Viewer, Edge policy) are exercised by
  `capture-regression.yml` on a real runner for the same reasons. `act` cannot help — it is Docker/Linux
  and NVDA needs Windows.
- **`msEdgeImageMagnifyUI`** in `--disable-features`. The name is taken from Microsoft's documented *enable*
  flag and is unverifiable through CDP (`SystemInfo.getFeatureState` answers "Unknown feature" even for
  flags that demonstrably work). It is a belt beside a verified brace — `pointer.mjs` is what actually
  closes that hole.

## Known limitations, stated plainly

- **On a real page, ten criteria are actually assessed — five of them partially.** Eighteen in total can
  produce a finding, but four (2.4.6, 3.3.1, 3.3.2, 4.1.3) come only from the trained scorer, which abstains
  on pages unlike its training data — which today is still many real pages. A fifth, 3.3.3, is decided by a
  rule and still cannot fire on a page you do not own: it reads the form probe, which is deliberately off
  there, because submitting somebody else's form is not a review. A sixth, 1.4.13, is rule-decided since
  2026-09-05 and cannot fire on a real page yet for a different reason: the probe it reads has simply not
  been turned on for real-page captures, not a consent boundary — see `criterion-coverage.ts`. The ones
  that always work are the deterministic rules:
  - **In full: 1.1.1, 1.3.1, 1.4.2, 2.1.2, 2.4.4.**
  - **Only with an opt-in probe: 3.2.1, 3.2.2, 3.3.3** — a page that renames itself when a control is
    focused or typed into, and an announced validation error that names the problem and not the remedy.
    All three are rule-decided and exact, and all three read probes that press, type or submit — off for
    pages you do not own, so on somebody else's site they cannot fire in either direction.
  - **Rule-decided but not yet turned on for real pages: 1.4.13** — content revealed on focus that Escape
    does not dismiss. Rule-decided and reads no probe a consent boundary would gate; it simply has not been
    enabled for real-page captures, which is an open gap rather than a decision, unlike the three above.
  - **Partially: 2.1.1, 2.4.1, 2.4.2, 2.4.3, 3.3.2, 4.1.2** — each covers one failure mode of several, and
    `criterion-coverage.ts` records which mode and why the others are out. Three of them (2.4.1, 2.4.2,
    2.4.3, added 2026-08-22) are failures a static analyser structurally cannot reach: a skip link that is
    present and inert, a route that changes without the title changing, and a tab order that contradicts the
    reading order.

  Everything else comes back `cantTell` or `untested`, and the report says which. Measured on the eval
  fixtures: `abstained 5 of 16 failure cases`, recall 78%, 0 false positives.
  - This is the single most important number for deciding whether the tool is worth running, and it had
    never been stated in one place before. Six of WCAG 2.2's 55 A/AA criteria, plus whatever axe-core adds
    for the visual layer.

- **The trained scorer DECLINES outside its support, and says so rather than guessing.** Measured with a
  k-NN feature-space novelty score (Sun et al., ICML 2022). The problem it solves: a linear head on a
  frozen embedding cannot tell it is extrapolating, and it returned **0.97 and 0.99 for 4.1.2 on two
  conformant W3C pages**. For an accessibility tool a false positive is an accusation, so outside its
  support the scorer reports those criteria as **unchecked, not clean**.
  - **The support has since been widened rather than merely respected, and the numbers below moved with
    it.** When the corpus was generated pages only, every training record sat at cosine **0.847–0.99** from
    its nearest neighbour while **28 of 32** real eval fixtures sat at **0.50–0.84** — entirely outside it,
    which is why abstention was the whole answer. Adding 53 real pages to the training set moved the
    training minimum to **0.5587**, so that 0.847 figure describes a corpus that no longer exists. Quoted
    here because it is the measurement that justified abstention, not a current statistic.
  - That is why eval recall reads 59% rather than 90%: the missing 31 points were the model predicting
    beyond its competence and sometimes being right. Not a capability, and not separable from the score.
  - **On real sites the deterministic rule layer is what finds things**, and it still runs when the
    scorer abstains.
  - **The realism tier IS now shipped, and it reversed the two conclusions this section used to state.**
    Those were: "lowering the floor is not defensible" and "a realism tier of 19 real pages was built,
    measured and NOT shipped". Both were true of a 19-page tier from one publisher. At **53 pages from 39
    publishers** they are not, and the reversal is the deliverable — a limitation that survived a serious
    attempt to remove it is a different claim from one that has now fallen to a bigger attempt.
  - **The real-page corpus is 77 pages** (55 training, 22 calibration) from **39 publishers**, every one
    carrying its own published accessibility statement, captured and disjoint from the eval fixtures.
  - **Abstention on real pages fell from ~4–6 of 22 scored to 20 of 22, with 0 false positives.** Measured
    on the held-out calibration set, same 22 pages both times:

    | model | floor | real pages scored | false positives | inaccessible caught |
    |---|---|---|---|---|
    | previous | 0.7192 (derived) | 4–6 of 22 | 0 | 2 of 2 in support |
    | **shipped now** | **0.70 (calibration)** | **20 of 22** | **0** | **2 of 2 in support** |

  - **The floor is now CHOSEN on held-out data, not derived from the training set's own minimum.** The
    trainer takes `--in-distribution-floor` and records `derivedFloor` and `floorSource` alongside it, so a
    reader can always see both what the data implied and what was picked. This mattered: the derived value
    (0.5587) scored 21 of 22 with 0 false positives but turned an honest abstention into a **miss** on
    W3C's `before/tickets.html`, which the previous model caught as 4.1.2. For an accessibility tool
    "I cannot assess this page" is a safe answer and "no findings" on a page its publisher calls
    inaccessible is a wrong one. **Why that page is missed is now known, and it is not the floor** — see
    the operating limitation below.
  - **Held-out acceptance passes on these weights**: 58 true positives, **0 false positives, 0 false
    negatives** across all 8 criteria, every one stable across repeated captures, and disjointness asserted
    against the realism tier rather than only the base corpus.
  - **What the realism tier actually caught, and no synthetic corpus could.** `4.1.2:unnamed-control` moved
    its threshold from **0.05 to 0.9**. Since the trainer picks the lowest threshold reaching zero false
    positives, that means every threshold below 0.9 false-positives on real conformant pages — an 18x error
    that only generated data ever made look safe.
  - **A publisher's disclosed exceptions are honoured, per head.** 53 of 53 real pages carry at least one
    exception; usable real pages per head range 0–41. Where a publisher states in writing that it fails a
    criterion, that head does not train the page as conformant. This was **inert for its whole existence**
    until 2026-08-21 — the join read a key the captured file never wrote — and a failed join was
    indistinguishable from a publisher with nothing to disclose.
  - **Two of the eight criteria cannot be evaluated on a real page at all.** 3.3.1 and 4.1.3 read only what
    the form-submission probe produces, and that probe is off for pages we do not own, because pressing
    *Book* on a stranger's site is not a review. Measured: **0 of 77 real captures carry `formChanges` or
    `postSubmitFields`**. So they are masked on every real page — they were previously trained as clean on
    41 and 39 pages from evidence that was never gathered, which is indistinguishable from a failed capture.
    They keep perfect held-out performance (8/8 each), because those records carried nothing for them.
  - **OPERATING LIMITATION: the scorer's heads carry 225 free vetoes, measured 2026-08-22, not yet fixed.**
    A head penalises features that are 0 on every one of its training positives — free to learn, and
    invisible to every accuracy metric here, because each shares the corpus's structure. Causal, by
    ablation on unedited real captures: `4.1.2:unnamed-control` moves `before/tickets.html` from 0.4525 to
    0.9752 when three table features are zeroed, and adding one properly named field to `before/news.html`
    drops it 0.9240 → 0.1688. Of the 147 training records carrying an unnamed form field, none has a table
    and none has a named field.

    **How much reaches a report is bounded by the layer split, and this correction matters.** An earlier
    version of this bullet said the *tool* reports an unnamed control only where nothing else is named.
    That is true of the HEAD and not of the product: `4.1.2:unnamed-control` is `decidedBy: "rules"` in
    `rule-ownership.json`, so the scorer is suppressed for it and the exact rule answers — 0 false
    positives across 1,183 conformant records. Verified on the three W3C pages where the head scores worst:
    the rule layer reports `4.1.2: combo box, collapsed, QUICKMENU ---- greater` on **all three**,
    including the one the scorer misses entirely.

    The vetoes that DO reach a report are on the nine subtypes the model decides alone —
    `1.1.1:generic-alt`, `1.3.1:fake-heading`, `1.3.1:unassociated-table`, `2.4.4:regex`, `2.4.6:regex`,
    `3.3.1:validation-error-silent`, `3.3.2:placeholder-only`, `3.3.2:unnamed-form-field`,
    `4.1.2:state-change-silent`, `4.1.3:form-activation-silent`. Those heads carry 12–21 vetoes each.

    The remedy is multi-defect pages, not a retrain. ADR 0015 has the full measurement.
  - **The "2 of 3 inaccessible pages caught" figure is ONE defect observed three times.** Every form
    control on all three W3C BAD `before` pages is the same unnamed navigation combo box in the shared
    site chrome of one template. Real-page recall must be quoted in distinct defects, never page counts.
  - **Caveats, and they are load-bearing.** 22 calibration pages support an error-rate granularity of about
    1/(n+1) ≈ **4.3%** and nothing finer, so no conformal guarantee is claimed or claimable. The choice of
    0.70 over 0.65 rests on **one page sitting 0.0022 below the threshold** — the principle (prefer
    abstention to a false negative) is sound, its effectiveness on that page is partly luck, and more
    known-inaccessible real pages are what would firm it up. Widening the set means finding more publishers
    who state their own conformance, because labelling pages ourselves would make the measurement our own
    opinion.

  **The generator half of the fix has landed** (`6d5fcae`): the corpus now generates a median of 14 links and
  a maximum of 40, and a capture was measured reaching 25 of 25 links on a rescaled page. What remains is
  mechanical and expensive — recapture 848 pairs and retrain. Until that runs, the SHIPPED model is exactly
  as limited as this paragraph describes, because it is still the model trained on the old corpus.
- **`task` shapes the CAPTURE but never the verdict.** This entry used to say the task did nothing on the
  defaults; that stopped being true when `probe-forms` began defaulting to **true** in the GitHub Action. On
  a default Action run the task now selects which control gets activated, and therefore whether 3.3.1 and
  4.1.3 evidence exists at all. It still does not affect the default `local` scorer's assessment — that
  scorer never sees it — so the report deliberately makes no claim about whether your task was completable.
  The CLI keeps `probe-forms` off, because it can be aimed at a page you do not own. See
  `docs/github-action.md`.
- **`taskCompletable` is a coarse proxy** — derived from "did anything score as a blocker", because this
  layer has no head for task completion.
- **One screen reader, one browser, one operating system.** Every finding is NVDA in Microsoft Edge on
  Windows, and WCAG conformance depends on what a page does with the assistive technology actually in use. So
  this tool demonstrates accessibility support for **that combination and no other** — it is not evidence
  about JAWS, VoiceOver, Narrator, TalkBack, Orca, or NVDA in a different browser. Most desktop screen-reader
  users are on Windows with NVDA or JAWS, which is why this combination came first; JAWS is the gap that
  matters most and is the hardest to automate. Each report names the combination that produced it.
- **Page-scoped, not process-scoped — and WCAG claims conformance for PROCESSES.** WCAG 2.2 §5.2.4 requires
  every page in a multi-step process to conform, so a tool that examines one URL structurally cannot assess
  sign-in, checkout or booking as a whole — ours or anyone's. Findings are about the page given to it, and **a
  clean report on one page is not a conformance claim for the process that page belongs to.** ADR 0011 records
  what changing this would take.
- **A page behind a consent wall is refused, not reported.** The screen reader is held inside the modal, so
  the capture describes the dialog rather than the page; the run exits 2 and says so. Correct, but it means
  many EU-facing commercial sites cannot be measured without dismissing consent first.

## Deferred, with the reason

- **Where a corpus snapshot lives long-term.** `npm run corpus:snapshot` writes a timestamped archive of
  `runs/`, which is gitignored and represents hours of worker time. It deliberately does NOT sync anywhere:
  a snapshot on the same disk protects against `rm -rf runs/` and a bad recapture, not against losing the
  machine, and a repo that silently uploaded a user's captures somewhere would be making that decision for
  them. Syncing it is an operator choice.

Not bugs being hidden — work consciously not done before shipping.

| item | why deferred |
|---|---|
| **Test coverage is 47.4%, not the 85.9% the runner reports** | `npm run coverage` measures every source file; `node --test --experimental-test-coverage` only reports files a test LOADS, so 42 files with no test were invisible rather than zero. Reaching 80% needs ~2,790 more covered lines from a 3,646-line pool. Biggest: `capture-screenreader-dataset.mjs` (464), `cases.ts` (294), `cli.ts` (269), `acceptance-matrix.mjs` (239), `local-vm.ts` (208). **Arithmetic worth knowing first:** the 6 NVDA-bound files are 1,592 lines (15.7%), so 80% of the WHOLE codebase is unreachable by unit tests — the script excludes them by name and prints the exclusion every run. |
| **Four modules still run their whole program on import** (`capture-screenreader-dataset`, `stability-gate`, `evidence-check`, `doctor`) | This is the coverage blocker as much as a smell: a module that captures or deploys on import cannot be imported by a test, which is why several of the largest zero-coverage files are zero. It has bitten twice in one session — importing the deploy tool began enumerating VMs, and importing the run started a capture and leased a page server. `deploy-worker` and `check-worker-code` are already guarded; these four are the rest. |
| `probeElementsListCounts` (40 code lines) and `leaseWorkerPool` (48) reviewed and left | Both read as one thing; splitting either would need a sentinel or a mutable bag. Recorded so the decision is visible rather than an oversight. |
| Another agent's untracked `case-matrix.test.ts` reports TS7031 | Implicit `any` in destructuring against the rescaled generator's shape. Untracked, so a clean tree typechecks clean; theirs to fix. |
| **`gate:stability` FAILS on the rescaled pages — 4/6 canaries** | **This gates the recapture below and must be diagnosed first.** `form-unlabelled/good` varied its `lists` count 0,0,0,0,1 and its transcript CONTENT at identical counts; `table-unassociated-headers/bad` reached 29,29,29,29,**5** headings. The worker logged **1 recovery** during the gate, so a papered-over mute-NVDA fault is the leading suspect for the truncated run — bigger pages mean longer sweeps and more chance of a timing miss. Starting the 848-pair capture in this state would produce evidence that varies for an unchanged page, "the one defect this project cannot tolerate". |
| **DONE 2026-08-08: recaptured and retrained.** | The full corpus is fresh protocol-5 evidence: 1,059 of 1,061 cases discriminating, **0 blind** (was 83), 0 stale, `gate:stability` 6/6 (was 4/6). Five capture defects were fixed to get there, including sweeps truncated by the capture deadline and a removed anchor that had silently zeroed the `lists` field on every page whose links sit in a `<ul>`. The generalisation claim is now testable, and the answer is the abstention limitation above: the corpus does not span real-page structure, so the scorer declines on real pages rather than extrapolating. Note the page sizes were REDUCED (ADR 0009) for affordability, which widened that gap — the realism tier is the outstanding work. |
| 98 cases whose `badSignal` cannot match their own generated page | Pre-existing inconsistency in `case-matrix.mjs`, exposed by regenerating pages; the local corpus in gitignored `runs/` is inconsistent as a result |
| Scoped cache invalidation | Two recaptures were measured as 65% unnecessary — a global `CAPTURE_PROTOCOL_VERSION` invalidates captures a fix could not have touched |
| ONNX export | Would drop torch (~529 MB) from the Action's setup |
| `provisionRevision` reads `"unstamped"` | Needs a deliberate pool-wide re-provision |
| `packages/lab/scripts/check-screenreader-hardening.py` was also untracked | Now committed; backs `npm run training:hardening`, which is in no gate, so it had no effect on any recorded result |

### Why those 418 captures went stale — diagnosed, so nobody re-derives it

`check-signals` reports **554 discriminating, 83 blind, 6 contaminated, 418 stale**. The stale ones were
captured while the page rescale was live in the working tree; `3cce38d` shelved the rescale and restored the
generator, but not those captures. Measured rather than assumed: regenerating every page and comparing to the
hash each capture recorded gives **643 MATCH / 418 DIFFER**, so a regenerate cannot fix it — the committed
generator genuinely no longer produces those pages. The families are form (106), filter (106), image (61) and
the table cases.

`--resume` targets exactly these and nothing else, because `hasUsableCaptureFiles` **is** the resume
predicate — the same function `check-signals` calls:

```bash
npm run training:capture -- --resume      # 418 pairs, ~2.9 h, one worker
```

One consequence to weigh when this is picked up: the v4 scorer was trained across both page populations, so
those 418 contributed transcripts from larger pages than the corpus now generates.

## The red CI job is FIXED

`.github/workflows/lint.yml` used to fail on 6 files under `packages/nvda-worker/src/`, and the cause was one line:

```
Error: No available supported screen readers
```

`@guidepup/guidepup` **throws at import time** where no screen reader exists. CI is Linux, so merely importing
`capture-core.mjs` failed — and every test that imported it to reach a *pure* helper (`sweepStepFromSpeech`,
`dedupeKey`, `phraseAction`, `crossCheckStructure`, `elementsListRowName`, `failIfScreenReaderIsMute`,
`edgeArgs`) died with it. Node reports these per FILE — "test failed" — which reads like broken logic rather
than an unavailable dependency. It had been red since 1 August, growing from 2 files to 6 as more tests reached
for pure logic through `capture-core`.

Those seven functions now live in `capture-pure.mjs`, which imports no guidepup; `capture-core.mjs` imports and
re-exports them, so every existing caller is unchanged.

**The move was computed, not eyeballed.** An earlier attempt by hand broke `capture-core` — 2,370 lines, no
local test, it only runs against real NVDA on the worker — and was reverted. This time the transitive closure
of the seven symbols was derived with the TypeScript parser: exactly 19 top-level declarations, containing no
guidepup symbol, moved with their comments attached.

Verified, in the order that matters:

| check | result |
|---|---|
| the 6 files with `node_modules/@guidepup` physically moved away | **43 assertions pass** — CI's exact condition |
| `pure-graph.test.ts` | walks the import graph and fails on a Mac if any of them reaches guidepup again |
| `node -e "import('./capture-core.mjs')"` | clean — the only real check for a `.mjs` |
| `npm run capture:check --worker=…` on the real VM | **ALL CAPTURE CHECKS PASSED**, probe values and role phrases included |
| `npm run worker:deploy` | `/health.code` matches over HTTP, which shares no failure mode with the push |
| `npm run evidence:check` | **8 compared, 8 SAME** — evidence unchanged, so the cache stays valid and `CAPTURE_PROTOCOL_VERSION` stays at 4 |

### `evidence:check` was ALSO comparing captures asked DIFFERENT QUESTIONS

Found during M5, one field along from the page problem above and invisible to it. The probes are opt-in over
the wire, so a case whose recorded options differ from what the manifest asks for now is not comparable
either: **61 cases recorded `probeTables: true` while the manifest on disk said false**, because the manifest
predated the fix that derives that flag from the signal type. The fresh capture then asked no table question,
`structure.tableCells` went 4 → 0, and the diff called it an evidence change.

Both halves are now fixed and both were proven rather than argued:

- `evidence:check` excludes cases whose recorded probe options differ from the manifest's, and says how many;
- regenerating the manifest (`npm run training:generate`) removed the mismatch — **0 cases now differ**, page
  staleness unchanged at 643 current / 418 stale — and the two cases that had reported CHANGED then compared
  **2 of 2 SAME**.

That manifest staleness mattered beyond this check: a resumed capture run would have asked 61 table cases no
table question, which is precisely the "8 cases went silently blind when a probe changed" failure this repo
already has a rule about.

### `evidence:check` was comparing captures of DIFFERENT PAGES

Its first run on this change reported **40 of 47 CHANGED**, with differences like `structure.links 40->0` — and
recommended its own worst outcome: "bump `CAPTURE_PROTOCOL_VERSION` and recapture", i.e. 2,122 captures, for a
refactor that moved pure functions between files and altered no behaviour.

Every one of those 40 was a case whose PAGE had moved since capture (the 418 above): the recorded capture
describes the shelved rescaled page, the fresh one describes the current small page. Cross-tabulated, the split
is exact — **40 CHANGED / 40 stale pages, and all 8 whose page was current came back SAME or rejected. Zero
cases changed on an unmoved page.**

So the tool now excludes cases whose page has moved, using `hasUsableCaptureFiles` — the same predicate
`--resume` and `check-signals` use, so "comparable" and "current" cannot drift apart. It says how many it
excluded (418 of 1,061 here), and if nothing is comparable it exits 2 rather than reporting SAME over nothing.

This matters beyond one refactor: `evidence:check` exists to make a capture optimisation *affordable to
evaluate*. A version that cries "recapture everything" whenever the corpus is mid-migration is a version that
gets ignored, and then the cache-invalidation decision goes back to guesswork.

One thing came free with it. There were **two copies of the worker's hashed-file list plus a third derived by
regex** — `server.mjs`, `check-worker-code.mjs`, and `deploy-worker.mjs` parsing the second one's source. They
had to agree on contents *and order* or `/health.code` compares a different set than was deployed. Adding
`capture-pure.mjs` would have meant editing two lists by hand, which is precisely the shape that made this
check necessary in the first place, so the list is now one module (`worker-files.mjs`) that all three import —
and it contains itself, so editing it changes the hash.

## Reproducing the verification

```bash
npm run lint && npm run typecheck && npm test   # no worker, no venv, no network
npm run release:gate                            # signals -> rules -> acceptance -> judge quality
./packages/lab/scripts/action-dry-run.sh https://example.com "Complete the checkout"
npm run layers:compare -- '[["https://www.washington.edu/accesscomputing/AU/before.html","Apply now"]]'
```

`check-signals` is **red on this machine** and green on a fresh clone, because it reads the local corpus in
gitignored `runs/`, which is mid-migration (see the deferred table). It has no bearing on the shipped
artifacts: the model was trained and validated against a consistent corpus, and its report records that
dataset's sha256.
