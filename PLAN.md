# a11y-witness — the road to a general release

## North star

Automate the half of accessibility testing that rule scanners structurally cannot reach: whether what a
screen reader announces, as someone reads and operates a page, adds up to something a person can use.

## What this file is

**The backlog for one thing: making this generally releasable.** Nothing else belongs here.

It was rewritten on 2026-08-09, when it had reached 1,299 lines of finished work and fixed defects. The
history is in [`docs/history-2026-08.md`](./docs/history-2026-08.md) — read that before re-attempting
anything that looks obviously worth trying, because a lot of it already failed once and the measurements
are recorded.

## Where we actually are

Verified at `2a85ad8`: 571 tests, lint and typecheck clean, `release:gate` passing end to end, CI green,
the GitHub Action exercised as a consumer would use it. The infrastructure is in good shape.

The honest shape of the product today:

| | |
|---|---|
| criteria assessed **on a real page** | **6** of WCAG 2.2's 55 A/AA — 1.1.1, 1.3.1, 1.4.2, 2.1.2, 2.4.4, 4.1.2 |
| criteria the trained scorer covers | 8, but it **abstains on most real pages** (0 of 7 calibration pages in support) |
| false positives on conformant pages | **0**, measured |
| people other than the author who have run it | **0** |

That last row is the one that matters most, and no amount of green CI substitutes for it.

---

## Blockers — a general release should not happen until these are closed

**Status, 2026-08-09: B2, B3 and B4 are closed by measurement. B1 and B5 are yours — neither can be done
from inside the project.** B1 is a stranger running it on an app they own; B5 is the name and the first
publish. Everything technical that a release was waiting on has a number against it now.

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

### B4. ~~The error rate to defend, decided~~ — ANSWERED BY MEASUREMENT, 2026-08-09

**This was going to be your judgement call. It is not one any more: the data answers it, and the answer is
do not lower the floor.**

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

## Risks we are choosing to accept, and must therefore state

These are not blockers. They ARE things a reader must be told, and every one is already written into
`RELEASE.md` — this list exists so nobody quietly stops mentioning them.

- **Six criteria on a real page.** The trained scorer abstains on pages unlike its training data, so on
  real sites the deterministic rules are what find things. Widening this needs a realism tier trained on
  real-page structure, and **19 pages has now been measured rather than assumed: it is not enough.**

  `build-realism-tier.mjs` adds the 19 training-role real pages as `clean` records (W3C's own published
  claim, never our label) and `A11Y_SCORER_MODEL=/tmp/realism-model calibrate-abstention.mjs` measures the
  retrain against the 7 held-out calibration pages. Result:

  | | shipped | + realism tier |
  |---|---|---|
  | false positives on conformant real pages (floor 0) | 3 of 4 | **2 of 4** |
  | inaccessible real pages caught | 0 of 3 | **0 of 3** |
  | nearest-neighbour cosines | — | **identical, to 4 dp** |
  | 4.1.2 on the generated corpus | 10 FP / 2 FN | **11 FP** / 2 FN |

  So it removes one accusation, catches nothing new, does not move the novelty distribution at all, and is
  slightly worse on the corpus. At the shipped floor of 0.847 neither model scores any real page, so it would
  change nothing a user sees while costing a weights commit and an artifact-contract bump. **Not shipped, on
  purpose** — the measurement is the deliverable, and it says a tier needs materially more than 19 pages
  before it can pay for itself.
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
2. **Task journeys** (ADR 0011). WCAG claims conformance for complete PROCESSES, so a page-at-a-time tool
   structurally cannot assess sign-in or checkout — ours or anyone's. The largest single gap in what this
   category of tool can honestly claim.
3. **The remaining non-interference criteria**, 2.2.2 and 2.3.1, to complete WCAG §5.2.5 coverage.
4. **A second screen reader** behind the existing `CaptureBackend` interface (ADR 0001). VoiceOver is the
   obvious next one and the automation is known-fragile; JAWS is the most representative and the hardest.
5. **An expert-agreement baseline.** The one number that would turn "0 false positives against our own
   labels" into "0 false positives against an auditor".

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
