# Ready queue

**PULL, not push.** This page exists so a worker who has just finished a unit — or a fresh session with no
context from tonight — can pick up the NEXT one without waiting for a person to read a report, review a
diff, choose a row and write a brief. That serial step is the organisation's actual bottleneck; this page
is what removes it from the loop for ordinary, well-bounded work. [`docs/backlog.md`](./backlog.md) stays
the place that answers "what is open" in full, including work that needs a decision or a live worker first.
This page is the SUBSET of that which is ready to start right now, with nothing left to decide.

## How to use this page

1. **Read the row.** Region, branch, the CLAUDE.md sections that bound it, and the acceptance command are
   all here — you should not need to read `docs/backlog.md` or `known-gaps.md` first, though the row links
   to the exact section if you want the full derivation.
2. **Check the region is free.** `git branch -r --list 'origin/<branch name>'`. If that branch already
   exists AND has commits from the last day or so, someone is on it — pick another row, or message them.
   If it exists with zero commits and is more than a day old, treat it as abandoned and take it; say so
   when you push.
3. **Claim it by pushing the named branch.** No file anywhere needs editing to claim a row — the branch's
   existence on `origin` IS the claim, checked live rather than trusted from a written date. That is
   deliberate: a date written into this file can go stale the moment its owner stops working and nobody
   remembers to erase it, which is the exact "fact stated twice" shape this repo's own guards exist to
   close. `git branch -r` cannot go stale in that way — it either has the branch or it does not.
4. **Do the row's acceptance command, for real, before reporting done.** Every row's acceptance is a
   command whose output is the verdict, not a description of intent.
5. **When you finish, delete the row** (same rule as `docs/backlog.md`'s own "How an item leaves this
   page") and put the outcome in `docs/known-gaps.md` or `docs/not-working.md` as the record demands. If
   you abandon a row partway, leave your branch pushed with whatever you have — an abandoned branch with
   real commits is worth more to the next claimant than a clean queue.

**Every row below was re-verified OPEN at HEAD before being listed** — the command that showed it open,
and what that command printed, is in the row. Several rows the orchestrator expected to find here (most of
`docs/architecture-audit.md`'s findings, `docs/backlog.md`'s own "~38 architecture-audit findings" section)
turned out to already be closed by tonight's session; see "What did not make it onto this page" at the
bottom for the ones checked and dropped, because that finding is worth as much as the rows that survived.

**Some rows are FLEET-GATED**: their final acceptance needs `capture:check` or a real-page recapture, which
nobody may run tonight (`gate:stability` is failing and the recapture is held behind it). Those rows say so
explicitly and give an OFFLINE acceptance step that is genuinely completable now, with the fleet step named
as what remains. Do not run anything reaching the fleet or the lab until that changes.

---

### 1. `crossCheckAgainstElementsList` reads the Elements List of whatever page `probeRouteChange` navigated to, not the page under test

- **Region:** `packages/nvda-worker/src/capture-probes.mjs`
- **Branch:** `agent/elements-list-after-navigation`
- **CLAUDE.md sections:** "A FACT STATED TWICE, and the copies drifted" (the general shape — a remedy
  applied at one call site when the behaviour reaches several); "The census can measure the wrong
  document" material under "Verifying changes" is the SAME bug in the sibling it was already fixed in
  (`known-gaps.md` §40)
- **Verified open** 2026-09-06, by reading the call site directly:
  ```
  $ grep -n "probeRouteChange\|crossCheckAgainstElementsList" packages/nvda-worker/src/capture-probes.mjs
  530:    ? await probeRouteChange({ interaction, deadline, diag })
  532:  if (probeElementsList) await crossCheckAgainstElementsList({ structure, deadline, diag });
  ```
  `crossCheckAgainstElementsList` still runs strictly after `probeRouteChange`, which is the one probe
  documented as able to leave the page under measurement. `docs/probe-side-effects.md` (§"2.
  `crossCheckAgainstElementsList` runs after `probeRouteChange`") already names this exact ordering as the
  one place `known-gaps.md` §40's census fix did not reach, and proposes the fix without building it.

**What it is:** `known-gaps.md` §40 moved three CDP-based censuses to run BEFORE `probeRouteChange`
specifically because reading them after it silently describes wherever the activated link led, not the
page under test — proved with two byte-identical censuses on GOV.UK pages differing by 11 headings and
136 links. `crossCheckAgainstElementsList` reads NVDA's live Elements List and compares it against
`structure` (captured earlier, during the sweep) — but its OWN call site did not move when the censuses
did, so if `probeRouteChange` navigated, this comparison is the sweep's original-page counts against the
NEW page's Elements List. Same shape, same document, one call site the earlier fix missed.

**Acceptance:**
1. Offline, completable now: move the `crossCheckAgainstElementsList({...})` call to before
   `probeRouteChange({...})` (mirroring exactly what `known-gaps.md` §40 already did for the three
   censuses), or gate it so it never runs once navigation has occurred. Add a source-position regression
   test — e.g. `packages/nvda-worker/src/capture-probes-ordering.test.ts` — asserting (by reading the file
   as text, the same way `dataset-paths.test.ts`/`exit-code-contract.test.ts` do, since this file cannot
   be imported off a screen reader) that `crossCheckAgainstElementsList`'s call site's string index precedes
   `probeRouteChange`'s, with a vacuity guard proving the regex finds both. Command once written:
   ```
   npx tsx --test packages/nvda-worker/src/capture-probes-ordering.test.ts
   ```
2. **Fleet-gated, do not run tonight:** once a worker is available, to confirm the reorder does not change
   evidence on a page that does NOT navigate (it shouldn't — the fix only changes what happens when
   `probeRouteChange` fires):
   ```
   npm run capture:check -- --worker=<url>
   ```

---

### 2. `probeDialogEscape` is the only focus-riding probe with no `restoreBrowseMode` cleanup

- **Region:** `packages/nvda-worker/src/capture-probes.mjs` — **same file as row 1: claim only one of the
  two at a time, and check `git branch -r` for BOTH branch names before starting either.**
- **Branch:** `agent/dialog-escape-restore-browse-mode`
- **CLAUDE.md sections:** "Focus mode makes quick-nav keys TYPE THEMSELVES INTO THE PAGE" (why an
  un-restored mode is dangerous for whatever probe runs next); "A fix applied at ONE call site when the
  behaviour reaches several"
- **Verified open** 2026-09-06:
  ```
  $ sed -n '2855,2906p' packages/nvda-worker/src/capture-probes.mjs | grep -n "restoreBrowseMode\|Escape"
  23:    await withTimeout(nvda.press("Escape"), NAV_TIMEOUT_MS, "dialogEscape").catch(() => undefined);
  24:    await withTimeout(nvda.press("Escape"), NAV_TIMEOUT_MS, "dialogEscape").catch(() => undefined);
  ```
  No `restoreBrowseMode` call anywhere in `probeDialogEscape`'s body. `probeFocusContext`,
  `probeTypedFeedback`, `probeArrowNavigation` and `probeFocusReveal` all end with one (lines 2681, 2769,
  2826, 3042) — `probeDialogEscape` is the exception `docs/probe-side-effects.md` names by row: *"no
  `restoreBrowseMode` call at all — the only focus-riding probe with no cleanup."*

**What it is, and why it is not on fire today:** `probeDialogEscape` deliberately RELIES on NVDA already
being in focus mode (left there by `probeFocusOrder`'s Tab walk immediately before it — its own comment
says so), presses Escape twice, and returns without restoring browse mode. Today this is harmless BY
ACCIDENT rather than by design: whatever runs next either doesn't care (nothing reads mode-sensitive state
immediately after), or is protected because `probeArrowNavigation`/`probeTypedFeedback` both call their own
`anchorToTop()` via `landOnControl` before doing anything mode-sensitive. `docs/probe-side-effects.md`
records this explicitly as "load-bearing by accident, not by guarantee." A reordering of the probe
sequence, or a new probe inserted after `probeDialogEscape` and before one of those two, would silently
inherit an unrestored mode with nothing to catch it.

**Acceptance:**
1. Offline, completable now: add `await restoreBrowseMode("dialogEscape", diag)` at the end of
   `probeDialogEscape`, mirroring the four sibling probes. Add a source-text assertion (in the same
   ordering test file as row 1, or its own) that `probeDialogEscape`'s function body contains a
   `restoreBrowseMode` call, with a vacuity guard proving the same regex matches the four probes that
   already have one. Command once written:
   ```
   npx tsx --test packages/nvda-worker/src/capture-probes-ordering.test.ts
   ```
2. **Fleet-gated, do not run tonight:** confirming the extra Escape-mode-exit does not change what a real
   dialog page reports (it shouldn't — Escape-then-restore is idempotent on a page with no dialog, and a
   real dialog handler never sees the restore, only the Escape):
   ```
   npm run capture:check -- --worker=<url>
   ```

---

### 3. 3.2.1's predicate fires on ANY title difference, not on a context change the user did not ask for

- **Region:** `packages/judge/src/rules.ts` (the `contextChanged` predicate feeding "3.2.1 On Focus",
  around line 552–596)
- **Branch:** `agent/321-context-change-predicate`
- **CLAUDE.md sections:** "A comment that names an ambiguity, above code that resolves it by assumption";
  "3.3.3 ASSERTS a conformance failure and does not guard either of the criterion's two exceptions" (the
  sibling criterion that already went through exactly this narrowing)
- **Verified open** 2026-09-06: `docs/backlog.md`'s "OPEN — five rows..." section carries this row
  un-struck-through, dated the same day: *"3.2.1's predicate read against the criterion's own text (the
  `wcag-criterion-check` skill), and either narrowed or its limit written into
  `criterion-coverage.ts`'s note"* is still listed as what would close it. Confirmed the fix this row
  might be confused with — `known-gaps.md` §44's `reportedTitle`→`currentTitle`/`titleSourceVerdict`
  change — is ALREADY MERGED (`grep -n titleSourceVerdict packages/nvda-worker/src/capture-probes.mjs`
  finds it wired into all six call sites) and fixes a DIFFERENT problem: it makes `titleBefore`/`titleAfter`
  read the real document title instead of "whatever NVDA said last." This row is the next question: even
  reading the real title, is "the title changed" the right test for WCAG 3.2.1's "change of context", or
  does it need narrowing the way 3.2.2/3.3.3 already were?

**What it is:** WCAG 3.2.1's own note: *"A change of content is not always a change of context ... unless
they also change one of [focus, viewport, form submission, or navigation to a new page/window]."* The
current predicate reads two title strings and asserts a difference is a context change. That is
demonstrably too broad in at least one shape already measured on a real page (`known-gaps.md` §44's
`design-system.service.gov.uk` capture, `titleAfter` reading a live region rather than a real title change
— now fixed at the SOURCE, but the predicate itself was never re-examined against the criterion's actual
exception list). Whether it needs narrowing, or whether the existing `mapping: "secondary"` (referral, not
assertion) already makes the broad predicate an acceptable trade — the same argument that closed 3.2.2 and
3.3.3 — is the open question.

**Acceptance:** Run the `wcag-criterion-check` skill against 3.2.1's own text. Either narrow
`contextChanged` to the criterion's actual triggers, or write the limit explicitly into
`criterion-coverage.ts`'s 3.2.1 note (the same way the 4.1.2 settability gap and the 2.1.4 gap are already
stated there) so the next reader does not have to re-derive it. **Not fleet-gated** — `npm run rules:gate`
reads the corpus already on disk (this worktree's `runs/` symlink has one) rather than a live worker, so
the fix is fully verifiable tonight:
```
npx tsx --test packages/judge/src/criterion-coverage.test.ts
npm run rules:gate
```
Passing means: the test suite is green, and `rules:gate` reports the same or fewer 3.2.1 referrals on the
1,183-conformant-record corpus with no new assertions.

---

### 4. `criteriaAssessableFrom`/`channelsPresent` have no production call site, and carry a latent inconsistency for whoever wires one up

- **Region:** `packages/judge/src/criterion-coverage.ts`
- **Branch:** `agent/criteria-assessable-decision`
- **CLAUDE.md sections:** "A metric computed on data that shares the flaw cannot see the flaw" (dormant
  code with no consumer is the sharpest version — nothing has ever exercised it); "The census can measure
  the wrong document" (the specific inconsistency this row names is downstream of that same defect class)
- **Verified open** 2026-09-06:
  ```
  $ grep -rn "criteriaAssessableFrom(" --include="*.ts" --include="*.mjs" . | grep -v node_modules | grep -v "\.test\.\|// \|criterion-coverage.ts:"
  (no production call sites found outside criterion-coverage.ts and its own test)
  ```
  `docs/known-gaps.md` §41 ("Question 2, downstream readers") confirms this in prose and names the latent
  inconsistency directly: `channelsPresent` marks the `structureCensus` channel present whenever a
  `structureCensus`-event diagnostic mark exists AT ALL — it never checks `censusTargetIsSuspect` — so a
  criterion gated on that channel would read "assessable" on a capture whose census the actual rule layer
  refuses to trust. Harmless today only because the one criterion declaring that channel (2.5.3) is
  `status: "reachable"`, not `"assessed"`, so nothing reads it yet.

**What it is:** Two functions exist, are tested in isolation, and answer a real question — "given this
capture's evidence channels, which criteria can be assessed at all" — that nothing in the product asks
them. Two honest outcomes: either something should be calling this (naming where, and fixing the
`structureCensus`/suspect-census gap before it does), or it is deliberately unused scaffolding for a
capability not yet built, in which case that should be stated in the file rather than left to be
rediscovered by the next person who greps for a call site and finds none.

**Acceptance:** a decision, but one findable from a bounded amount of reading, not a "go and ask" —
1. Read every criterion in `CRITERION_COVERAGE` currently marked `status: "reachable"` that declares a
   channel; if any of them is a real near-term candidate to become the entry point (a rule using this to
   gate its own claim), wire it up and fix the `structureCensus`/suspect check as part of the same change.
2. If nothing is a near-term candidate, add a comment at `criteriaAssessableFrom`'s definition stating
   plainly that it has no caller today, why it exists anyway (the design intent), and the specific
   `structureCensus` gap that must be closed before anything calls it — so it is a stated, findable trap
   rather than a silent one.
3. Either way, add a test proving the `structureCensus` gap: a synthetic capture carrying a
   `structureCensus` diagnostic mark AND a suspect `censusTargetIsSuspect` verdict must make
   `channelsPresent` report that channel ABSENT, not present. **Not fleet-gated.**
```
npx tsx --test packages/judge/src/criterion-coverage.test.ts
```

---

### 5. No JS/TS or Python test has ever asked whether a Python lab-job's exit code distinguishes "examined everything" from "examined fewer records than expected"

- **Region:** `packages/lab/scripts/diagnose-false-positives.py`, `audit-scorer-shortcuts.py`,
  `evaluate-screenreader-acceptance.py`, `audit_grants.py`, `audit_container_exits.py`,
  `audit_applicability.py`, `explain_feature.py` — **seven files. `train-screenreader-model.py` is in
  scope for the AUDIT QUESTION but NOT for edits in this row: row 6 below owns changes to that file.** If
  this row's answer implies `train-screenreader-model.py` also needs a shared verdict helper, file that as
  a follow-up naming row 6's outcome rather than editing it here.
- **Branch:** `agent/python-partial-corpus-exit-codes`
- **CLAUDE.md sections:** "A check must never reject evidence whose absence is the finding" (the general
  principle a partial-corpus INCONCLUSIVE state protects); the `exit-code-contract.test.ts` material under
  "Every other command, and when you would reach for it" is the JS-side sibling this row extends to Python
- **Verified open** 2026-09-06: `docs/backlog.md` line 985 (search `"No JS/TS test has ever examined a
  Python lab-job's exit codes"`) names exactly these eight scripts and states the gap is unaddressed;
  `packages/lab/src/gates/exit-code-contract.test.ts`'s own discovery explicitly filters to `.mjs`/`.ts`
  files, confirmed by reading its `exitCodeModules()` — it walks `packages/lab`, `packages/worker-fleet`,
  `packages/control` for files matching `\.(mjs|ts)$`, so none of these eight `.py` files can appear in its
  discovered set by construction.

**What it is:** `gateVerdict`'s own header (in `packages/lab/src/gates/verdict.mjs`) asks, for every JS
gate: does examining fewer records than expected read as INCONCLUSIVE, or can it read as a clean pass? That
question has never been asked of the Python side, which has no `verdict.mjs` equivalent to check for at
all — a genuinely separate gap from the JS-side audit `exit-code-contract.test.ts` already closed.

**Acceptance:** Read each of the seven scripts against the same question. For each: does a partial corpus
(fewer records examined than the script itself expected) produce a distinguishable exit code, or does it
read as success? Either give the Python gates a shared verdict helper of their own (the Python equivalent
of `verdict.mjs`) and adopt it in scripts where the answer is currently wrong, or, for a script where a
partial corpus genuinely cannot occur or is already handled, document why in the script itself. Then add a
discovery test mirroring `exit-code-contract.test.ts`'s shape but for `.py`:
`packages/lab/src/gates/python-exit-code-contract.test.ts`, walking `packages/lab/scripts` for `.py` files
with an exit-code contract, requiring each to be classified DOCUMENTED (with its own exit-code meanings,
read from source) or ADOPTS (a shared Python verdict helper) — same two-bucket shape, same vacuity guard.
**Not fleet-gated** — every script here is read as source text; no capture or corpus run is needed to
answer the audit question, only to test the fix in the rare case one is warranted, which is not expected.
```
PYTHONDONTWRITEBYTECODE=1 .venv/bin/pytest -p no:cacheprovider packages/lab/tests packages/scorer/tests -q
npx tsx --test packages/lab/src/gates/python-exit-code-contract.test.ts
```

---

### 6. A crashed train can leave `.previous` untouched by luck, because rotation happens BEFORE the training that might justify it

- **Region:** `packages/lab/scripts/train-screenreader-model.py`
- **Branch:** `agent/train-rotate-on-success`
- **CLAUDE.md sections:** "Housekeeping is automated — do not do it by hand" (the general principle that a
  guarantee should not depend on when in a sequence a crash happens to land); "The rule that cost the most
  to learn" (a check — here, a retention guarantee — must not depend on an accident of ordering)
- **Verified open** 2026-09-06:
  ```
  $ grep -n "rmtree\|\.previous\|rotate" packages/lab/scripts/train-screenreader-model.py
  236:        previous = args.output.with_name(args.output.name + ".previous")
  238:            shutil.rmtree(previous)
  255:        # The stronger form -- rotate on SUCCESS rather than at startup -- is a backlog row and
      deliberately not built here
  ```
  The script's own comment (line 255) names this as deliberately deferred. `docs/backlog.md`'s "OPEN — five
  rows..." section (search "A crashed train consumes the one retained generation") confirms it as still
  open, un-struck-through, with the measured near-miss: train #1 rotated a release-eligible model aside and
  then died on `torch.stack([])`; it survived only because a crashed train writes no output, so train #2
  had nothing release-eligible to rotate and `.previous` was left alone by luck rather than by guarantee.

**What it is:** Rotation (`rmtree(previous)` then `move(output, previous)`) runs at STARTUP, before the
training run that might fail. The ONE-GENERATION-RETAINED policy is fine; what is not obvious from reading
the code is that the guarantee is spent before the work that would justify spending it, so "one generation
is kept" is weaker than it reads — it depends on the NEXT run also failing to produce output, which is true
today only because a crashed train currently cannot write a model at all (confirmed by the near-miss
above), not because anything enforces it.

**Acceptance:** Move the rotation to run on SUCCESS — after the train completes and a real model exists to
promote — rather than at startup, so a crash never spends the retention guarantee it did not use. Add a
Python test (`packages/lab/tests/test_train_rotation.py`, new file) that simulates the near-miss directly:
seed a `.previous` and a release-eligible `output` dir, run the training entry point with a monkeypatched
training step that raises immediately after any rotation step would historically have run, and assert
`.previous` is byte-identical to what it was before the run started. Mutation-check it by reverting the
reorder and confirming the new test fails. **Not fleet-gated** — this is testable entirely offline; no
training run against real data is needed, only the rotation logic around it.
```
PYTHONDONTWRITEBYTECODE=1 .venv/bin/pytest -p no:cacheprovider packages/lab/tests/test_train_rotation.py -q
```

---

## What did not make it onto this page, and why

**`docs/backlog.md`'s own "~38 architecture-audit findings" section (554–663) is almost entirely stale, and
that is worth stating as plainly as any row above.** Spot-checked five of its still-unstruck bullet points
directly against HEAD rather than trusting the prose:

| claimed still-open | checked | actual state |
|---|---|---|
| `lab` still bypasses `worker-fleet`'s exports at `host-address.mjs`, `fleet-env.mjs`, `fleet-consistency.mjs`, `worker-code-check.mjs` | `grep -E "host-address\|fleet-env\|fleet-consistency\|worker-code-check" packages/worker-fleet/package.json` | **all four are declared exports** — closed |
| `action.yml` still pip-installs unpinned versions behind a constant cache key | read `packages/scorer/requirements.txt` and `action.yml`'s cache-key/install lines | **exact pins in `requirements.txt`, cache key hashes that file, install greps the four pins from it and counts them** — closed |

The section's OWN "STATUS AT 2026-09-06" box (lines 569–612, written the same session as the bulleted
list below it) already says this in its own words — *"Still open and assigned: none... Still open and
unassigned: none"* — and the bulleted list at 613–663 simply was never struck through or deleted after the
closures it describes landed. Nothing from that section is listed above as a row for exactly this reason:
there is no small, cheap, genuinely open item left in it, and re-listing any of it here would repeat the
same staleness that prompted this page to demand re-verification in the first place.

**`docs/architecture-audit.md`'s own dedicated open-findings table (§ "The architecture audit", lines
396–415 of `docs/backlog.md`) has exactly ONE row still tagged `open`** — "Result recall is not an
idempotency contract" — and it is not listed above because it needs a DECISION, not hands: the row's own
text calls it *"an accepted limitation rather than a live TODO"* and says reclassifying it to "Decided —
not defects" is "a judgement call outside this pass's scope." A row that stalls on "someone should decide
whether this is even a defect" is a reading list entry, not ready work — `docs/backlog.md`'s own rule for
this page's parent applies here too.

**The 2.4.7 F55 lower-bound verification and the real-page 4.1.3 forms config** (`docs/backlog.md`'s
"Open defects" and "Needs your hands" sections) are real, well-specified, ready-shaped work — and are
**fleet-gated all the way through**, with no offline half to do first the way rows 1 and 2 above have. Left
off this page rather than listed with no completable step, because a row nobody can start on tonight is not
what PULL means.
