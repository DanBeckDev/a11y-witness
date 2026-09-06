# Ready queue — **RETIRED. DO NOT READ THIS PAGE FOR WHAT IS OPEN.**

> **THE QUEUE MOVED TO GITHUB ISSUES AND THIS FILE DID NOT GO WITH IT.** The board's Ready column carried
> **eleven rows** on 2026-09-06 while this page listed one, then none — so a reader who trusts this file
> concludes the queue is empty when it is not. I am that reader: I closed this page's last row, wrote
> "the queue is empty" here, and reported it. `dispatcher` caught it.
>
> **This is the fact-stated-twice shape in its most expensive form — not two copies that disagree, but a
> DEAD copy that still answers.** A stale row costs a wrong dispatch; a stale PAGE costs the belief that
> there is nothing to dispatch. The retirement was agreed when `region-diff-claims` landed and only half
> happened: the mechanism moved, the page stayed.
>
> **What is open lives on the GitHub project board.** `gh issue list --state open`, or the Ready column.
>
> **Deliberately not deleted by me.** `product-manager` owns the tracker and worker-config owns this file;
> one of them should remove it so the deletion carries a reason rather than appearing as a stray. Until
> then this banner is the honest state, and everything below it is a RECORD of how the page worked — the
> region-diff claim check and the delete-don't-strike rule are both still worth reading.


**PULL, not push.** This page exists so a worker who has just finished a unit — or a fresh session with no
context from tonight — can pick up the NEXT one without waiting for a person to read a report, review a
diff, choose a row and write a brief. That serial step is the organisation's actual bottleneck; this page
is what removes it from the loop for ordinary, well-bounded work. [`docs/backlog.md`](./backlog.md) stays
the place that answers "what is open" in full, including work that needs a decision or a live worker first.
This page is the SUBSET of that which is ready to start right now, with nothing left to decide.

## A GATE THAT READS `runs/` IS NOT YOURS TO REPORT

**Ruled 2026-09-06.** `rules:gate`, `rules:coverage`, `check-signals`, `corpus:starvation`,
`scorer:shortcuts` and anything else reading `runs/` give a VERDICT only when the lead orchestrator runs
them — against a corpus just fetched, or on the lab, which owns the authoritative one.

**A worker or the dispatcher may run one as a PRE-CHECK**, to decide whether a change is worth handing on.
**Never as a reported result**, and never in an acceptance section as though it settled anything.

The reason is measured, not procedural. `runs/` in any checkout is a copy only as fresh as its last sync —
this laptop's was 89 hours old and carried neither `focusEvents` nor `baselineWaitedMs`, so a sweep across
it found zero of the two keys it was written to find. A gate run there reports cleanly having examined a
corpus that no longer exists. The pre-push hook already SKIPS the corpus-dependent checks loudly for
exactly this reason, and calls that honest rather than passing quietly.

**So a row's acceptance may name a `runs/`-reading gate, and must say who runs it.** Request it through the
dispatcher; the lead runs it and returns the number.

## How to use this page

1. **Read the row.** Region, branch, the CLAUDE.md sections that bound it, and the acceptance command are
   all here — you should not need to read `docs/backlog.md` or `known-gaps.md` first, though the row links
   to the exact section if you want the full derivation.
2. **Check the region is free — by REGION, never by matching a branch NAME.** A row's `Branch:` field is
   only a SUGGESTION for whoever claims it, not an identifier anything checks against: measured
   2026-09-06, of the five rows this page has had actually addressed, only one landed under its own
   suggested name — the rest landed under names nobody could have guessed (two rows bundled onto one
   branch neither of them named; a third under a name close to but not identical to its suggestion). A
   check keyed on a name would have reported all of those as unclaimed while real, sometimes-merged work
   existed. Run this instead, once per path in the row's `Region:` field:
   ```
   git log --branches='agent/*' --not origin/main --oneline --source -- <region path>
   ```
   Empty output means nobody local has touched it. Any output names the real branch(es) that have,
   directly from the commit, never from a name you have to already know — `--source` prints which branch
   each commit was reached through. Also check `git worktree list` for whether that branch still has an
   active worktree with recent commits; a branch with no worktree, or one stuck at its base commit for
   more than a day, is abandoned and the region is free to take.
   Agent branches in this repo are never pushed, so `git branch -r --list 'origin/agent/*'` always returns
   empty and would report every row unclaimed forever if trusted — do not reach for it.
3. **Claim it by creating a local branch and worktree** (or pushing, if this repo's workflow does that for
   you — whichever this session's convention already is). No file anywhere needs editing to claim a row —
   the branch's existence and its diff against the row's Region ARE the claim, checked live rather than
   trusted from a written date or a name. That is deliberate: a date written into this file can go stale
   the moment its owner stops working and nobody remembers to erase it, which is the exact "fact stated
   twice" shape this repo's own guards exist to close, and a NAME can be typed differently by every worker
   who tries — this page's own first draft hand-wrote "Currently claimed" notes into two rows, which is
   the identical rot risk one layer up: a note in the file that nothing keeps honest once the branch it
   names merges, gets renamed, or gets abandoned. A region-diff check has neither problem: it asks the
   region itself, live, every time.
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
- **Branch:** `agent/elements-list-after-navigation` (a suggestion only — check by region, see step 2 above)
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

- **Region:** `packages/nvda-worker/src/capture-probes.mjs` — **same file as row 1: check the region
  (step 2 above) before starting either, since one branch may already cover both.**
- **Branch:** `agent/dialog-escape-restore-browse-mode` (a suggestion only — check by region)
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

The last row this page carried — 3.2.1's predicate firing on any title difference — was closed on
2026-09-06 by `089cd15`, verified by reading `packages/judge/src/criterion-coverage.ts` on `origin/main`.
It is DELETED rather than struck through, which is this page's rule and not `docs/backlog.md`'s: a guard
treats every `###` as a startable row, so a closed row left here fails the suite.

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
| 6 — train rotation on crash | none — claimed closed "at HEAD" by the same 12-line comment this row's own "Verified open" entry had already quoted | **Objection sustained by `dispatcher` on review, 2026-09-06: not closed.** `git diff origin/main...<every local agent/* branch> -- packages/lab/scripts/train-screenreader-model.py` finds NOTHING — no branch touches this file. The comment cited as the closure is the identical text this row's own verification already read as evidence the row was OPEN ("the stronger form... is a backlog row and deliberately not built here"). A comment stating why a fix was deferred is not the fix; it is the reason the row existed. Passed to `orchestrator`, who owns backlog curation, to decide whether the comment's own reasoning ("a hazard that measurement says does not currently bite") is a complete enough argument to reclassify this as "Decided — not defects" on `docs/backlog.md` — a judgement about what the project has decided, not about what is open, so not decided here. Either reading keeps it off this page. |

Rows 1 and 2 were independently re-verified against every local branch too and are still genuinely open;
row 3 is unaffected (no branch touches it). All three are checked by REGION now, not by matching a branch
name — see "How to use this page" step 2 and the section immediately below.

## The claim mechanism was keyed on a branch NAME, and real work does not reliably use one

**Found by `dispatcher`, independently re-verified before accepting, 2026-09-06.** Of the five rows this
page has had actually addressed, only ONE (row 3) landed under its own suggested `Branch:` name. Checked
directly, one suggested name at a time:

```
git branch --list agent/elements-list-after-navigation        -> (nothing)
git branch --list agent/dialog-escape-restore-browse-mode      -> (nothing)
git branch --list agent/321-context-change-predicate           -> agent/321-context-change-predicate  (matched)
git branch --list agent/criteria-assessable-decision           -> (nothing)
git branch --list agent/python-partial-corpus-exit-codes       -> (nothing)
```

Real branches used instead, confirmed by diff CONTENT rather than name similarity: rows 1 and 2 both
landed on one branch neither of them named (`agent/route-change-order-and-dialog-restore`); row 4 landed
on `agent/criteria-assessable-from-decision`, close to but not identical to its suggestion; row 5 on
`agent/python-gate-exit-codes`, unrelated to its suggestion. A claim check keyed on the suggested name
would have reported all three as unclaimed while real, sometimes-merged work existed.

**The fix is region-diff, not a naming convention**, per `dispatcher`'s argument to the CEO over the CEO's
own initial ruling (which had been `agent/<row-id>`, enforced by the test): a `Region:` path is already a
required field on every row, so checking whether any local `agent/*` branch's diff touches it derives the
claim from something the row already states, rather than depending on a worker typing a name correctly —
this repo's own rule that a check relying on a human to remember something is a check that gets broken.
`packages/lab/src/packaging/backlog-ready.test.ts` now proves the mechanism correctly attributes rows 1
and 2 to their real branch by region alone, with the branch name appearing only as the test's EXPECTED
result, never inside the matching logic. This also retired the "Currently claimed" notes this page's first
draft hand-wrote onto rows 1 and 2 — the same hand-written-state-can-rot shape the claim design already
argued against for a written date, just one layer up, in prose rather than in a field.

**One honest limitation, found while building this and not papered over:** region-diff finds a branch only
when the real fix touches the FILE the row named. Row 3's own real fix (once it lands) may take either of
its own two stated options — narrowing the predicate in `rules.ts`, or writing the limit into
`criterion-coverage.ts`'s note — and only one of those is the row's declared Region. A fix landing under
the second option would be invisible to a region-diff check scoped to the first. Broader than a name match
(which only rows 1/2/5 could ever pass), not a complete guarantee.

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
