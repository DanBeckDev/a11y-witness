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
2. **Check the region is free — LOCALLY, never on `origin`.** Agent branches in this repo are never
   pushed, so `git branch -r --list 'origin/agent/*'` always returns empty and would report every row
   unclaimed forever if trusted. Use the local forms instead:
   ```
   git branch --list 'agent/<branch name>'
   git worktree list
   ```
   If the branch exists AND has a worktree with commits from the last day or so, someone is on it — pick
   another row, or message them. A branch with no worktree, or a worktree stuck at its base commit for
   more than a day, is abandoned; treat it as free and say so when you take it. **Also check whether a
   DIFFERENTLY-NAMED branch already covers the row** — this page's own suggested branch names are a
   starting point, not a guarantee of what a worker actually used; a row that says so explicitly (because
   this was already found once) names the real branch to check first.
3. **Claim it by pushing the named branch to `origin` if this repo's workflow does that for you, or by
   creating the local branch and worktree if it does not — whichever this session's convention already
   is.** No file anywhere needs editing to claim a row — the branch's existence IS the claim, checked live
   rather than trusted from a written date. That is deliberate: a date written into this file can go stale
   the moment its owner stops working and nobody remembers to erase it, which is the exact "fact stated
   twice" shape this repo's own guards exist to close. A branch cannot go stale that way — it either
   exists or it does not — but it must be checked in the place branches in THIS repo actually live, which
   tonight is local worktrees, not `origin`.
4. **Do the row's acceptance command, for real, before reporting done.** Every row's acceptance is a
   command whose output is the verdict, not a description of intent.
5. **When you finish, delete the row** (same rule as `docs/backlog.md`'s own "How an item leaves this
   page") and put the outcome in `docs/known-gaps.md` or `docs/not-working.md` as the record demands. If
   you abandon a row partway, leave your branch pushed with whatever you have — an abandoned branch with
   real commits is worth more to the next claimant than a clean queue.

**Every row below was re-verified OPEN against `origin/main` PLUS every unmerged local `agent/*` branch —
never against `origin/main` (or "HEAD") alone.** The first version of this page verified at HEAD only, and
on a night with five workers and six-plus unmerged branches, HEAD is never the current state of the work:
three of the six originally-seeded rows turned out to already be addressed by unmerged local branches that
looked open from `origin/main`'s point of view. That defect, and the correction, is recorded in "What did
not make it onto this page" below alongside the architecture-audit staleness this page's first pass also
found — a check that answers correctly and cannot see the case it exists for is worth naming exactly like
a stale row is.

**Some rows are FLEET-GATED**: their final acceptance needs `capture:check` or a real-page recapture, which
nobody may run tonight (`gate:stability` is failing and the recapture is held behind it). Those rows say so
explicitly and give an OFFLINE acceptance step that is genuinely completable now, with the fleet step named
as what remains. Do not run anything reaching the fleet or the lab until that changes.

---

### 1. `crossCheckAgainstElementsList` reads the Elements List of whatever page `probeRouteChange` navigated to, not the page under test

- **Region:** `packages/nvda-worker/src/capture-probes.mjs`
- **Branch:** `agent/elements-list-after-navigation`
- **Currently claimed** under a DIFFERENT branch — `agent/route-change-order-and-dialog-restore` — which
  bundles this row with row 2 below (same region, same underlying investigation). Confirmed via
  `git branch --list 'agent/route-change-order-and-dialog-restore'` and `git worktree list` before
  starting either row. If that branch is stale (no worktree, or a worktree stuck at its base commit for
  more than a day), treat both rows as free again under their own suggested names.
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
  two at a time, and check `git branch --list` locally for BOTH branch names before starting either.**
- **Branch:** `agent/dialog-escape-restore-browse-mode`
- **Currently claimed** under `agent/route-change-order-and-dialog-restore` — see row 1's note; this is the
  same bundled branch, not a separate claim.
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

---

## What did not make it onto this page, and why

**"Verified open at HEAD" cannot see work that is finished but unmerged, and this page's first draft
proved it by walking straight into the hole — reported by `dispatcher`, checked independently rather than
taken on trust, 2026-09-06.** `origin/main` was the wrong scope: on a night with five workers and several
unmerged local branches, a row can be genuinely closed by real, tested work sitting in a peer's worktree
while looking wide open from `origin/main`'s side. Three of the six originally-seeded rows were affected.
Re-checked each against the actual branch diff, not against the claim about it:

| row (original number) | branch cited | independently verified |
|---|---|---|
| 5 — Python lab-job partial-corpus exit codes | `agent/python-gate-exit-codes`, 1 commit | **Confirmed closed.** `git diff origin/main...agent/python-gate-exit-codes` shows real fixes to `audit-scorer-shortcuts.py` (a subtype losing all its positives silently omitted its row rather than reporting `positives: 0`, so `compare_to_baseline()` could never see "lost coverage" — now a named, gate-blocking check) and `audit_container_exits.py` (`examined` printed with no denominator, so 3 of 3,000 read identically to 3 of 3), plus two new test files, all eight scripts individually assessed with a verdict in `docs/backlog.md`'s diff on that branch. This is more thorough than what row 5 asked for, not less. |
| 4 — `criteriaAssessableFrom` decision | `agent/criteria-assessable-from-decision`, 2 commits | **Confirmed closed** as the row's own option 2 ("document the deadness rather than wire it up"): the diff adds a doc comment on `criteriaAssessableFrom` stating plainly it has zero production callers and why it is kept anyway, plus a discovery test (`criteria-assessable-from-has-no-production-caller`, with its own anti-vacuity guard) enforcing that claim against the real tree. It does **not** separately test the `structureCensus`/`censusTargetIsSuspect` latent inconsistency row 4 also named — accepted as sufficient anyway, because the function is now enforced dead: anyone who wires up a real caller has to touch this code and confront the gap directly at that point, which the comment's own last line says outright ("if that test ever fails... this function has shipped"). |
| 6 — train rotation on crash | none — claimed closed "at HEAD" by the same 12-line comment this row's own "Verified open" entry had already quoted | **Not confirmed. Disputed, and removed from this page either way pending `dispatcher`'s reply.** `git diff origin/main...<every local agent/* branch> -- packages/lab/scripts/train-screenreader-model.py` finds NOTHING — no branch touches this file. The comment cited as the closure is the identical text this row's own verification already read as evidence the row was OPEN ("the stronger form... is a backlog row and deliberately not built here"). A comment stating why a fix was deferred is not the fix; it is the reason the row existed. What may be true instead is that the comment's own reasoning ("a hazard that measurement says does not currently bite") is a complete enough argument to reclassify this as "Decided — not defects" rather than ready work — which would justify removing it from this page for the SAME reason row 6 is gone, by a different route. Either way the practical outcome here is identical (not listed), so it is removed now rather than left blocking the rest of this page, with the disagreement stated plainly rather than silently accepted. |

Rows 1 and 2 were independently re-verified against every local branch too and are still genuinely open;
row 3 is unaffected (no branch touches it). See the "Currently claimed" notes on rows 1 and 2 above — they
are already briefed under `agent/route-change-order-and-dialog-restore`, found the same way.

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
