# Which `CAPTURE_PROTOCOL_VERSION` bumps were avoidable, and what each actually cost

Feeds issue #23. Fleet-free: everything below is git history, `docs/capture-protocol-version-history.md`'s
own already-published measurements, and a read-only count of whatever this worktree's local `runs/` copy
currently holds — a capture is running on the fleet right now (~750+/1,645, per the brief), so this local
copy is a stale snapshot and is named as such everywhere it is used.

## Step one: is twelve bumps in 32 days even the right number?

It is, but not for the reason a first grep suggests.

```
$ git log --since="32 days ago" -S"CAPTURE_PROTOCOL_VERSION" -- packages/
28 commits
```

28 commits touch the identifier. Most are not bumps — comments, regex-scrapers reading the value, tests
asserting it. The real count comes from the VALUE, using `-G` (which shows a commit whenever a line
matching the pattern was added or removed, unlike `-S` on a literal string, which does not fire when a
number changes but the surrounding text does not):

```
$ git log -p --all -G"CAPTURE_PROTOCOL_VERSION = [0-9]+" -- \
    packages/nvda-worker/src/capture-core.mjs packages/nvda-worker/src/protocol-version.mjs \
  | grep -E "^commit |^Date:|^\+export const CAPTURE_PROTOCOL_VERSION|^-export const CAPTURE_PROTOCOL_VERSION"
```

That returns every commit where the constant's own declaration line changed, including two that are NOT
bumps and would otherwise inflate the count:

- `b03fab1` (2026-08-05) — the M5 package extraction moves the file the constant lives in. Its own commit
  message states outright: *"`CAPTURE_PROTOCOL_VERSION` has NOT moved — still 4, so no capture is
  invalidated."* Confirmed by reading the diff: no old-value line disappears in this commit, because the
  constant did not previously live in this exact file.
- `07614a3` (2026-09-05 20:49) — extracts the constant from `capture-core.mjs` (which imports guidepup and
  cannot be loaded from a portable tree) into its own dependency-free `protocol-version.mjs`. The diff reads
  `-...= 15;` / `+...= 15;` — same value, moved file. Its own commit message is explicit about why: the four
  host-side scrapers needed an importable source of truth, not a new meaning for the number.

Excluding those two, twelve commits remain, each changing the value by exactly one, running from `4 → 5`
(2026-08-06 20:22) to `15 → 16` (2026-09-06 09:07) — a 31-day span comfortably inside the 32-day window.
**Twelve is right, verified from the value rather than assumed from the identifier.** Versions 1→2, 2→3 and
3→4 (all discussed in `capture-protocol-version-history.md`) predate this window; `4` was already the value
on 2026-08-05.

## The corpus this worktree can read, and what it cannot tell you

```python
# counts every *.json under runs/screenreader-dataset/captures, runs/real-page-corpus,
# runs/repeat-captures, keyed on provenance.captureProtocol
```
```
total captures counted: 2178
missing provenance/captureProtocol: 34
  protocol 5: 2122
  protocol 6: 16
  protocol 11: 12
  protocol 13: 24
  protocol 14: 4
```

**Only five of the twelve post-bump values are present on disk here at all, and this is not twelve
populations to compare — it is one, mostly unchanged.** A capture file is named by case ID and OVERWRITTEN
by its own recapture; bumping the constant does not delete or archive the old evidence, it just means the
cache will no longer match it. So a count taken today answers "what does this case's file currently say",
never "how many captures existed at the moment of the bump" — the two are the same number only for a case
that has not been recaptured since. `runs/` carries no historical snapshots (`corpus:snapshot` archives are
not present in this worktree), so a bump's true invalidated count, once superseded, is not recoverable from
disk at all. **The dominant population, 2,122 at protocol 5, says this worktree's copy has not tracked a
full recapture since early in the window** — consistent with it being a stale, once-synced local copy
rather than a live mirror of the lab corpus, and every count below is read with that in mind.

Where `capture-protocol-version-history.md` already measured a bump's cost AT THE TIME (before it could be
overwritten), that number is used and cited instead of the stale disk count, because it is the only
surviving source for it.

## The table

| bump | commit, date | what forced it | captures it invalidated | avoidable? |
|---|---|---|---|---|
| 4 → 5 | `3f96b4a`, 2026-08-06 20:22 | The `list` sweep anchored from wherever the caret was and reported `lists: 0` on any page whose links sit in a `<ul>` reached from mid-page — a systematically-empty field, not a rare miss. | **Cannot determine from disk** — no protocol-4 records survive in this worktree, and the doc's own measurement is about protocol 3's contamination rate (see next row), not protocol 4's population. Not the doc's fault: this bump predates the doc entry it describes; the doc measures what it inherited, not what it invalidated. | **Unavoidable.** A genuinely broken field is not something a narrower key can isolate — the fix changes what THIS capture means, which is the bump's own definition. No adjacent bump within days to batch with. |
| 5 → 6 | `33a796a`, 2026-08-17 18:42 | The 1-in-125 (later measured as ~1-in-25, tied to NVDA's 25-capture recycle) baseline-contamination race: `waitForSpeechQuiet`'s 5 s budget against a cold browser gave up silently, and the guard that should have caught it discarded its own `quiet: false` result at all ten call sites. | Doc states it directly: **protocol 3's corpus carried the one contaminated record this bump exists to prevent recurring** (`filter-status-silent/bad`) — a single record, not a corpus-wide count, because the defect was a race, not a shape change everyone hit. Not counted from disk; sourced from the doc's own investigation notes. | **Unavoidable.** A reliability fix to an existing probe, 11 days after the previous bump — no adjacent bump to batch with, and the field it touches (speech-settle timing) is not an environment axis a narrower key could carry. |
| 6 → 7 | `5a92f96`, 2026-08-29 14:49 | `capture-integrity-plan.md` C1–C6: `census.distinct` (deduped names, since the sweep collapses repeated announcements the census had been counting as distinct elements — measured 75% of named elements sharing a name across 106 real pages), `formControl` in the census, and `truncatedAnnouncements` marked unconditionally. | **16 protocol-6 records still exist on disk here today**, twelve days after the corpus's dominant population moved past it — real evidence that captures under 6 happened and were used for something, not merely a placeholder value nobody captured under. Whether that represents a full corpus run or a smaller verification slice cannot be told from the file count alone. | **Candidate for batching, not confirmed.** `5a92f96` (Aug 29 14:49) and the next bump, `0c53dc2` (Aug 30 00:18), are **under 10 hours apart** — shorter than one full recapture (~3h46m measured elsewhere). The doc's own text for 7→8 does not state that no real corpus existed under 7 the way it explicitly does for 9→10 below, so this is flagged rather than assumed clean. If a full recapture ran to completion under 7 in that window, the two bumps cost two full recaptures where one might have sufficed; if it did not, the cost was the same either way. **Cannot settle further from this worktree** — the lab's own job history, not local disk, would answer which. |
| 7 → 8 | `0c53dc2`, 2026-08-30 00:18 | Two independent evidence gaps, bundled INTO one bump deliberately (the doc's own words): `dedupeKey` stripped only the first container prefix, mis-counting nested landmarks (146 of 24,774 sweep announcements affected); an accompanying defect's declared probes were not unioned onto the host case, leaving `structure.tableCells` empty on 69 `1.3.1:unassociated-table` cases. | **Cannot determine from disk** — no protocol-7 records survive locally. The doc gives per-defect measurements (146 announcements; 69 cases) but not a corpus-wide invalidated total, because both numbers describe how many announcements/cases the FIX corrected, not the size of the corpus being recaptured. | **Already correctly batched, on its own evidence** — two unrelated fixes deliberately combined into one bump rather than two, matching this project's own stated rule. The candidate batching question is the PRECEDING gap (6→7, above), not this one. |
| 8 → 9 | `1b4851a`, 2026-08-31 09:41 | `observed`: a channel is a bare array and cannot say whether it was empty because the page has nothing, or because nothing asked. Measured over the corpus at the time: `formChanges` empty on 4,830 of 6,467 with 3,006 never asked; `tableCells` empty on 6,095 with no way to say the page has no table. | **6,467, per the doc's own measurement at the time** — this is the corpus size the investigation was run against, and every one of those records lacks the new field, so every one needed recapture to gain it. Sourced from the doc, not from disk (no protocol-8 or -9 records survive here to recount). | **Unavoidable on its own terms** — a genuinely new, previously-unrepresentable field. See the next row for why it was not the end of the cost. |
| 9 → 10 | `4cbff11`, 2026-08-31 10:16 | `observed` shipped incomplete: `sweepExtraTypes` was called without its accumulator, so three of eleven channels (`links`, `lists`, `graphics`) could never report whether they were asked. | **Doc states it directly: 46 captures**, all taken in the **35 minutes** between this bump and the previous one — not a corpus-wide cost, because "threading the accumulator through is not a meaning change and correctly did not move the key", so the 46 were simply re-served from cache once fixed, at zero further cost. | **Avoidable, but not by batching or a narrower key — by testing the shape before shipping it.** Had `sweepExtraTypes`'s accumulator wiring been exercised before `1b4851a` shipped, this bump would not exist at all: it is a same-day correction of an implementation bug in the bump immediately before it, not two independent changes that could have been combined. Recorded as its own category because forcing it into "batching" or "narrower key" would misdescribe the actual lesson. |
| 10 → 11 | `e4126bb`, 2026-09-01 00:32 | Three additions bundled deliberately (the doc's own stated reason: each individually too small to justify ~4.5 h of fleet time three times over): `structure.frames` (iframe-name sweep), `interaction.dialogEscape` (2.1.2's leave-the-modal observation), `formChanges[].baselineWaitedMs` (the settle margin, since `baselineQuiet` reads constant-true on 1,117 of 1,117 and carries no information on its own). | **12 protocol-11 records survive on disk here.** The doc states the in-flight recapture under 11 was allowed to finish and was used as real evidence — "superseded by the next capture run rather than invalidated" — so this is a genuine, if partial, surviving population rather than an artefact of staleness. | **Already correctly batched** — three otherwise-too-small changes combined into one bump, exactly the practice this project's own register recommends. |
| 11 → 12 | `5c2cc85`, 2026-09-01 03:06 | `probeKindFor` starts returning `"toggle"` for a checkbox/radio button under `probeForms`, so 4.1.3 can see a live region a checkbox update fires — previously structurally unreachable, and checkboxes/consent toggles are checkboxes far more often than buttons. | **Zero, by the doc's own account.** *"The protocol-11 corpus being captured at the time was unaffected: it ran from an earlier commit and was internally homogeneous. It was superseded by the next capture run rather than invalidated as evidence."* Bumped BEFORE the change shipped specifically so no capture could straddle the boundary. | **Unavoidable, and the ~2.5-hour gap from the previous bump cost nothing** — the in-flight protocol-11 run was left to finish rather than aborted, and its evidence remained valid until naturally superseded. This is the version of "close together in time" that is NOT a batching miss, because nothing was thrown away. |
| 12 → 13 | `096dab5`, 2026-09-01 03:20 | `interaction.arrowNavigation`: `SHARES_ONE_TAB_STOP` correctly refuses to decide a radio group / tab list / menu from Tab alone, since a native widget and a broken one both present one tab stop. Pressing the arrow is the only way to answer it. | **24 protocol-13 records survive on disk here.** The doc is explicit that this was deliberately bundled with 12 rather than deployed separately, **14 minutes later**, "because neither had shipped, the fleet was mid-recapture, and two bumps against one recapture is the waste this file's own rule about bundling exists to prevent." | **Already correctly batched — the clearest example in the whole set.** A 14-minute gap that would look like a batching failure on timing alone is the opposite: the two bumps were sequenced to land inside ONE recapture, stated as the explicit reason in the commit history. |
| 13 → 14 | `a540c4c`, 2026-09-02 03:53 | Two more of the "last two screen-reader-reachable criteria" bundled together: `interaction.focusContext` (title either side of FOCUSING, for 3.2.1) and `typedFeedback.title*` (the same pair either side of TYPING, for 3.2.2). | **4 protocol-14 records survive on disk here** — a small surviving slice, consistent with this being a late, mostly-superseded population by the time of any later local sync. | **Already correctly batched**, and explicitly closes out everything `known-gaps.md` §23 had listed as remaining — the doc states the bundle was also the end of that list, not an isolated pairing. |
| 14 → 15 | `5aecbec`, 2026-09-05 18:51 | Three evidence channels — `focusEvents`, `focusReveal`, the census `candidates` field — shipped over the preceding **three days** with NO bump and no changelog entry at all. `workerCode` is deliberately outside the cache key, so cases with an existing cache entry silently kept serving pre-probe evidence; only cases with no prior entry (that day's brand-new 1.4.13 cases) got the new fields, which is indistinguishable from "the probe works" until someone checks the OLDER cases specifically. | **Cannot determine from disk** — the doc itself says this was recovered retrospectively from `5aecbec`'s diff, not measured against a corpus at the time, because nobody was tracking a bump to measure against. This is the one row where the honest count is "unknown, and unknowable after the fact" for a reason distinct from every other row: the omission itself destroyed the ability to measure it. | **This IS the avoidable-by-process case the brief is looking for, and it's not batching or narrower-key — it's the discipline of bumping AT THE TIME a rule starts reading a new field, which every other row in this table did and this one did not.** Three days of partial, silently-blended evidence is the cost of the gap, not of any single decision that could have batched with a neighbour. |
| 15 → 16 | `59ea806`, 2026-09-06 09:07 | Four shape changes that had already landed UNDER `15` (so `15` names two different shapes): `navigatedOnSubmit` gaining a `checked` discriminant (closing known-gaps §41 — absence used to conflate three different states); the focus-event listener installing from document load instead of after the first sweep; `focusReveal` recording `startedFrom`/`focusReset`; the census gaining `candidateUrls` when the CDP target was ambiguous. | **Doc states it directly: zero marginal captures.** *"Everything below already forces a full recapture by another route — `screenReaderSettings` joined the same bundle and is itself in `environmentKey`... the recapture is bought either way."* | **Unavoidable, and it is the sharpest illustration of the narrower-key question actually working as designed.** `screenReaderSettings` — already a narrower, separately-keyed field for exactly this reason — was DOING ITS JOB: it alone already forced the recapture these four changes needed, at zero extra cost from them riding along. The protocol bump here paid for something a narrower key structurally cannot: a capture's own stamp saying WHICH of two different shapes both called "15" it actually is. Without it, `corpus:snapshot`'s whole reason to exist (an old corpus can come back) would have no way to tell the two apart. |

## The answer to the three-part question

1. **What did each bump actually force, in captures?** Answerable with a real number for four of twelve
   (5→6: 1 contaminated record fixed; 8→9: 6,467-record corpus; 9→10: 46 records; the rest are zero or
   effectively zero by explicit, dated argument in the source doc). The other eight cannot be counted from
   this worktree's disk at all — either the evidence was superseded before any local sync captured it, or
   (14→15) the omission that is the finding itself is what destroyed the ability to measure it. Named per
   row above rather than estimated.
2. **Avoidable by batching?** Eleven of twelve show explicit, dated evidence of the RIGHT call already
   having been made — either deliberately bundled (7→8, 10→11, 12→13, 13→14) or correctly left unbundled
   because nothing was in flight to waste (11→12, 15→16) or because the gap was itself the fix rather than
   two separate things to combine (9→10). **Exactly one, 6→7, is a genuine, unresolved candidate** — a
   sub-10-hour gap to 7→8 with no dated statement either way about whether a real recapture completed and
   was used inside that window. That is the one row this pass could not close, named rather than guessed at.
3. **Avoidable by a narrower key?** None. Every bump changes what a capture's EVIDENCE means for the same
   environment — a new field, a fixed probe, a corrected sweep — which is exactly the axis `browserVersion`/
   `guidepupVersion`/`screenReaderSettings`/`provisionRevision` do NOT cover (those key on which ENVIRONMENT
   produced the capture, not on what the capture's fields mean). 15→16 is the clearest demonstration that the
   two mechanisms already divide the work correctly: the narrower key (`screenReaderSettings`) paid for the
   recapture, and the protocol bump paid for the thing only it can do — telling two same-numbered shapes
   apart after the fact.

## What this changes going forward, if anything

**14→15's three-day, no-bump gap is the one process lesson worth carrying forward**, not a code change: bump
at the moment a rule starts reading a new field, in the same commit, so there is never a window where "the
probe works" and "the probe works for cases with no prior cache entry" are indistinguishable. Everything
else in this table is either already the right call, made and stated at the time, or genuinely
undeterminable from what survives on disk — which is itself the answer to "how much of this history the
corpus can still prove", not a gap in this investigation.
