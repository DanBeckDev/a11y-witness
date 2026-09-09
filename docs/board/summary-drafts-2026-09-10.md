# Draft material for the 10 September summary

**THIS IS NOT THE SUMMARY.** `docs/board/summaries/2026-09-10.md` is written at **07:25 London on
10 September**, from the state at that moment, and carries its own dateline. This file is the material
gathered the day before so that the writing at 07:25 is *cutting to 120 words*, not *deciding what
happened* — which is the half that cannot be done at 07:25 with a clear head.

Written 2026-09-09 by `product-manager` on `ceo`'s 12:30Z instruction, and revised the same day to
`ceo`'s rulings on order and content.

**It sits beside `reported/` rather than inside it, and that is a correction.** The instruction said to
draft it into `docs/board/reported/`, and `board-data.mjs` does read that directory for `.json` only — so
a `.md` there looked invisible. It is not: `board-style.test.ts` asserts that **every subdirectory of
`reported/` is named in `REPORTED_KINDS`**, because that directory holds records the report READS, and a
directory nothing reads is a record nobody will notice has stopped being read. The guard was right and the
reasoning that put the file there was wrong. A flat file here introduces no directory for any enumeration
to adopt.

---

## The rule this file must not break

**Every number below is 9 September's and is stale by construction.** The summary answers *"what changed
since yesterday"* about a night that has not happened yet — on 8 September the queue went from twelve open
pull requests to zero between the summary being written and the edition rendering.

> **Re-measure every figure at 07:25 before it goes in.** The command is given beside each one. A number
> copied from this file unchecked is a forecast wearing a measurement's clothes.

What does not need re-measuring is the material: what was corrected, and why. Each correction below is
**read from the artefact it corrected**, per `ceo`'s ruling, not reconstructed from anyone's messages.

---

## 1. The three corrections — LEADS THE SUMMARY, IN THIS ORDER

`ceo`'s rule for what qualifies: **a correction leads only if it corrected something the board was already
told.** A wrong number caught before publication is a process line, not a board correction.

### First — the capability figure the board saw move twice, and which reading stands

**Source: the 11:05:37Z comment on issue #20, which corrects the 11:00:00Z comment on the same issue.**

The morning edition (07:11:53Z) recorded the capability figure as affirmed, including its floor: hubspot
at 296 s and calendly at 300 s, four seconds apart, across the two most dissimilar page shapes in the set.
At 11:00:00Z that floor was **withdrawn** — a measurement said calendly had served a near-empty page, and
two pages agreeing closely is much less surprising if one of them is nearly empty. At 11:05:37Z it was
**restored**.

**The reading that stands is the original one, affirmed at 07:32:17Z.** Calendly served the real page
throughout. What went wrong was ours: the tool's own form probe activated a *Continue with Google* button
and navigated to Google's sign-in page, and the element census — which runs **after** the probes — counted
that page instead. The field is `structureCensus`, the browser's own element count, which is why it read
11 tabbable elements and one heading. The sweep read the full calendly on all three runs, 44 headings,
identical every time, and the timings measured calendly.

**Board sentence:** a figure we published was withdrawn and then restored within the hour; the original
reading stands, and the cause of the confusion was our own tool measuring where it had navigated to rather
than where it started.

**Do not soften "withdrawn".** The board watched the number move twice and the summary's job is to say
which reading stands and why, not to make the movement smaller.

### Second — work believed unrecoverable was recorded all along

**Source: PR #730, and `docs/backlog.md`'s branch clean-up row (#623).**

The tracker was believed to destroy the record of who worked a row when the row closes. It does not.
**State this as one thing only, per `ceo`: what it changes for the branch clean-up on the 15th — how many
rows now have a named owner — and nothing else.** No mechanism, no counts of anything else.

On 9 September: **77 of the 83** closed rows sitting behind a branch with no open pull request have a
named owner. **Re-measure at 07:25:**

```bash
node scripts/ready-label-audit.mjs 2>&1 | grep 'closed row(s) read'
```

**Board sentence:** the branch clean-up scheduled for the 15th would have discarded work whose owner
nobody could name; that owner turns out to have been recorded all along, and is now readable for all but
a handful.

### Third — what the board was told about why real pages are slow was right in its share and wrong in its cause

**Source: PR #674, merged 10:38:47Z, correcting a claim on the capability record and in the runbook.**

The board was told that the structural sweep is the largest phase on every page **and the only one that
scales with the page**. The share is right; the cause is not. Replaying the same captures shows every
sweep type costs 108–210 ms per round trip except one: the form-field sweep, at 1,233 ms on calendly and
1,478 ms on IKEA. What scales is the **per-field probe** — the tool activates each form control, presses
Escape and waits for speech to settle — not the cost of walking a bigger page.

**And the instrument could not have told us**, which is the part worth the board's attention: the counter
measures sweep navigation and not the activation, so the ratio excluded most of its own numerator. On the
IKEA page the budget ran out and **five of eight structural types were never examined at all** — a
471-second capture that looked complete, with only a cross-check nobody reads by default saying otherwise.

**Board sentence:** our explanation for why a real page takes minutes was right about where the time goes
and wrong about why, and one page in the set was measured having examined a quarter of it.

---

## 2. The class statement

`ceo` accepted this as written and asked for one word shorter. Two forms; use the second unless the
summary has room:

> Every one of today's corrections was a bounded reading presented as a complete one — a source answering
> a narrower question than the one asked, and saying nothing about the narrowing. In each case a second
> measurement, by a different route, was the only thing that could tell.

**Shorter (use this one):**

> Each correction was a bounded reading presented as complete — a source answering a narrower question
> than the one asked, silent about the narrowing. Only a second measurement, by another route, could tell.

---

## 3. The fleet line — SETTLED, TEN OF TEN

**Write this, and check it once before you do:**

> Ten boxes serving (`fleet:status` 2026-09-09T13:21:19Z, run by `orchestrator`, fleet consistent); the
> tenth rejoined on 9 September after two days recorded as unreachable, which was a path to it and not
> the box.

`ceo`'s second form, with the time filled in from the run that settled it: `npm run fleet:status` at
**2026-09-09T13:21:19Z** — `10/10 serving /health`, `fleet CONSISTENT`, all ten `ready` on the same
provision revision, `worker:code` 10/10 matching. `fleet:*` is inside this session's resource ban, so the
figure is `orchestrator`'s and is attributed to them. **Re-ask at 07:25 for a fresh run; if it does not
come, say the time this one was taken rather than implying it is current.**

### NEVER PRINT THE CONSOLE VISIT, IN ANY FORM

The earlier ruling was to say the tenth was *withdrawn pending the chairman's console visit, in the
inventory's words*. **The inventory's words were false** — they say it *"answers neither `/health`, nor
SSH, nor ICMP"*, and it answered two of the three. `ceo` withdrew the request to the chairman at 13:15Z,
and the box rejoined at 13:21Z **without any visit**.

**A board summary sending the chairman to a data centre for a machine that answers HTTP and SSH is the
specific harm here.** It was caught only because the same ruling required the capacity figure to come
fresh from a run *today*, which sent the request to the one session that had just probed the box.

### If the board asks what actually happened

**It was a monitoring gap, not an outage, and that is the honest version.** The box had **4.6 days of
uptime** on 7 September — it never went down. It was serving `/health` throughout, held out of `ready`
only by a Windows notification holding the foreground. Two days were recorded as unreachable because the
path to it was, not because it was. **Do not describe this as a recovery.**

The 6th-versus-7th date question is moot for the summary: it only mattered while there was a withdrawal to
describe. The tree fix rides `orchestrator`'s **#750**, not this document. **#743** carries the stale
inventory sentence.

## 4. The process section — THIS CORRECTION LEADS IT

### The check that says a change was tested reported success on 55 of today's 145 merges without running anything

**`ceo`'s ruling, 2026-09-09.** The number goes in **with its 38%**, because a smaller-sounding phrasing
is the thing this correction is about.

**What happened.** Every pull request declares the command that proves it. A check runs that command and
reports. **On 55 of the 145 changes merged today — 38% — it reported success having executed no
command**: the declared test needed a credential the check deliberately does not carry, the check said so,
and **saying "I could not run this" was counted as a pass.**

**Where it came from, and the honest bound on the number.** Found by `product-manager` against three of
their own merges, by reading what the check actually printed rather than the tick beside it. Measured
across the day by `dispatcher`, **by classifying each merge's declared command rather than opening every
log: 55 classified, of which 5 were confirmed from the logs themselves.** So 55 is a classified count with
five verified, not 55 read one by one — **and the board is told that rather than the round number alone.**

### And that code WAS tested — the reading came back, so this sentence is settled

**Resolved by `dispatcher`'s trunk-guard reading, 2026-09-09.** A separate check runs the whole suite
after every merge, with a working credential:

```
trunk-guard on 5d1ca43b   4,559 tests   0 failures   31 skips, none of them a credential skip
```

**It executed every file the 55 acceptances named**, including the two live tracker tests the pull-request
job refuses.

> **The board sentence:** the code was tested — by the check that runs everything after a change lands.
> What failed is the one that was supposed to say so **before**, and no untested change reached us.

**Say it in that order.** *"55 reported success without running anything"* followed by *"and it was tested
anyway"* is the truth; the reverse order reads as an excuse with a fact attached.

### The exception, checked and closed — say it rather than deleting it

**Of the 55, five merged while the full suite was failing** — #718, #730, #740, #739 and #767. **Each run
was read against its own failure line**, not against the assumption that a red main means one thing:

- **the first episode:** three assertions from #718's own closure walk, already attributed to it;
- **the second:** #739's own test, already attributed to it and since reverted and re-landed;
- **everything else in those runs green** — between 4,157 and 4,315 passing.

**Nothing re-verifies.** Every failure was the known inherited cause and none was a fault in the change
that merged.

> **The board sentence:** five of them merged while the suite was failing for a reason already known and
> attributed elsewhere; each was checked individually and none needed re-running.

**This clause stays in even though the answer is "none".** Deleting it would leave the correction reading
as though nobody had asked — and *"we checked five and found nothing"* is a different statement from
silence, which is the whole of what this section is about.

### The rest of the process line

`ceo`'s earlier ruling stands and follows this: a wrong number caught before publication is not a board
correction, and belongs in the body as one sentence.

> A fourth wrong figure was caught before it reached anyone, by the same habit of measuring a second way.

**The fix**, if the board asks: the check stops treating *"could not run"* as *"passed"* — **#827 first**,
then #826's successor. **The order matters and is worth one clause:** until a check that ran nothing stops
reporting success, making it refuse fewer things only means fewer honest refusals behind the same green
tick.

---

## 4a. The afternoon, which happened after this file was first drafted

Added on `ceo`'s instruction, from the artefacts. **Every time below is a run, a comment or a merge —
none is from a session clock.** This session's own `date -u` read 15:10Z and then 14:27Z within the same
hour, so it is not a source.

### Main went red twice, and recovered both times without a person waiting on it

From `trunk-guard`'s own run list on `main`:

| | last green | first red | last red | first green after |
|---|---|---|---|---|
| first | `857f5485` 12:42:57Z | `7ad67c2c` 12:45:24Z | `2904b680` 13:11:57Z | `5e7c1184` 13:17:54Z |
| second | `deb3103f` 13:48:51Z | `5e97a3ef` 13:49:49Z | `9f77d953` 13:58:43Z | `25b7b0fd` 14:03:29Z |

**Derived spans: about 32 minutes and about 14 minutes**, measured green-to-green.

> **THE FIGURES IN `ceo`'S INSTRUCTION WERE 34 AND 19 MINUTES, AND I HAVE NOT ADOPTED EITHER SET
> SILENTLY.** The difference is a boundary choice, not a disagreement about facts: green-to-green is not
> the same as red-until-the-revert-merged, and both are defensible. **Ask `ceo` which boundary the board
> should be told, and say which one the number is.** A duration with no stated boundary is the same defect
> as a count with no stated window, which the board has already been taught to look for.

### The automatic repair declined both, and the reason is one defect

The auto-revert **built the right answer twice and declined to act twice.** Its parent re-check asks
whether the commit before the suspect push was healthy — and it asks that question of a worktree pinned
at that commit, which **shares its refs with the checkout that created it**. So `origin/main` inside the
pinned worktree is not the old `origin/main`; it is whatever `origin/main` is right now (#775, from
#744's PR #774 with a three-commit reproduction). The check therefore reported the parent as failing on a
tree the push never touched, and the revert was declined as unattributable.

**Both were reverted by hand, with the attribution measured rather than assumed**, and the second one's
cause is now understood: #777 re-lands it.

**For the board this is one sentence, not three:** *our automatic repair for a broken main built the right
fix twice today and would not apply it, because the check that decides whether the fault is ours was
reading the current state of the code rather than the state it meant to ask about. It was done by hand
both times, and the defect is identified.* **Do not offer a date for the fix** — it is another session's
row and this document does not promise other people's work.

### The outside-user rehearsal ran, and the reading is what it produced

**A session that built none of the release followed only the public documentation, from a fresh clone,
against a site we do not own, with a real task — and got a report back in under nine minutes.** That is
the thing the 20 September publish rests on, and it had never been done end to end before today.

**It found five faults in what a stranger receives**, none of which any internal run had surfaced: broken
links and missing permissions in the quickstarts; a first line reading *"no blocking findings"* directly
above six serious ones; a finding list that **under-reported**, detecting seven focus losses and printing
five; and a finding whose quoted evidence compares two different controls.

**The under-reporting is the one to lead with if the board gets only one.** A correction that only ever
shrinks a claim teaches a reader that findings are inflated. **This one grew** — the tool had found more
than it said. Four of the five are fixed or being fixed; the fifth is being traced.

**Board sentence:** *the first outside run of our own published instructions worked, and it found five
faults in what a stranger sees — including one where the tool reported less than it had found.*

**Do not name the site.** It is a real company's page and we did not ask them.

### Everything else

- **The fleet is at ten of ten** — the settled figure in section 3, `fleet:status` 13:21:19Z.
- **Merges: 495** in the window **2026-09-09T00:00:00Z to the last merge at 16:59:27+01:00**
  (`git log origin/main --since=… --merges`). **State the window in the same breath as the number** — a
  peer's 17 and this script's 42 were both right on edition 1, over different windows. It read 437 at
  14:2xZ, which is the same day and not a contradiction.
- **The tracker's milestone figures were undercounting, and the board read the smaller ones yesterday.**
  Thirty-seven open rows carried neither a milestone nor an out-of-release marker — no third state is
  allowed, so they were invisible to every milestone count. Classified at 16:1xZ:

  | | before | after |
  |---|---|---|
  | first publish | 5 | 8 |
  | road to version one | 25 | 33 |
  | capture throughput | 1 | 1 |
  | the September move | 3 | 3 |
  | deliberately outside the release | 2 | 29 |

  **So the release and the road were under-reported by two and eight**, and the other twenty-seven were
  never release work. **Say the correction, not just the new number** — the board saw the smaller figures
  yesterday and the difference is theirs to see. Capture throughput stayed at one deliberately: its own
  definition excludes correctness of what a capture records, and every candidate was correctness.

### A closed row is not always a settled one — #800 is a CORRECTED close, and the distinction is the board's

**Two rows closed today on reasons that turned out to be wrong, and both were caught by the session that
built them rather than by any check.** A board query shows each as a clean close. **They are not, and the
difference is exactly what a reader skimming a board flattens.**

**#800, in `worker-capture`'s own words, which the summary should use rather than paraphrase:**

> **#800 asked whether IKEA serves 265 form controls or the sweep walks more than is there, and the answer
> is that no capture on disk can decide it: #699 merged at 12:40:39Z into the middle of the five-capture
> dataset, moving the census read from after the probes to before them, so two captures measured the
> denominator after the sweeps had walked the page and three measured it before — the five were never one
> population.**

And what it cost, which is the half that makes it a lesson rather than an anecdote: **the field that would
have dated the instrument, `structureCensus.atMs`, is stamped when the mark is pushed rather than when the
census is read, so it put the census last on all 25 captures in the checkout and made the wrong answer
look confirmed.**

**The conclusion never moved — no verdict, either way. Only the reason did, twice.** That is why it is a
corrected close rather than a retraction, and the summary should say *corrected*, not *closed*.

**#79 is the harder version of the same shape and it is not corrected, it is wrong.** The row reads
`COMPLETED`; the pull request that closed it, #89, **never merged**; and the rule it claims to have added
is nowhere on `main`. Two open rows were resting on it before anyone checked. **A row can read COMPLETED
for two days with nothing behind it**, and the check that would notice is filed rather than built (#870).

**What the board should take from this is one sentence, not three:** the tracker's closed rows are
evidence of work stopping, not of work landing, and the two are being told apart by hand until #870 lands.

### Tonight's capture batch, and the one number that must NOT be written as a fact yet

**The road milestone's floor could not be met by relabelling, so `ceo` put the capturable rows on the fleet
tonight. Every figure below is read from the row it is recorded on, not relayed.**

- **#143 closed on the authoritative `rules-real-pages` run** — 14 orphan captures, filed 2026-09-06. Three
  of its four acceptance clauses had already shipped and nobody had closed the row.
- **#881 was filed from that same run**, and it is the more interesting half: **ten synthetic dataset
  captures are sitting in the real-page corpus** — five cases, `bad` and `good` each, recorded against the
  lab's own page-server address (`http://192.168.1.79:5050/...`). Sixteen captures no declared page claims;
  ten of them are not real pages at all.
- **#311 is measured, and the promise made to an outside reader does not survive it.**

**The #311 correction is a good example of a measurement being worth more than its number**, and the summary
should use it that way rather than as a timing statistic. `docs/try-it.md` says **"Expect five to eight
minutes for a real page."** Six measurements now exist:

```
3 m 45 s   4 m 38 s   4 m 50 s   5 m 48 s   7 m 52 s   7 m 54 s
```

**Three of the six are under the promised floor, including two the sentence itself cites.** And the reason
matters more than the range: **the fastest capture is fast because it failed.** The 3 m 45 s run opened on a
consent overlay Escape did not dismiss and read almost none of the page — the tool said so in its own
report. **A run that finishes well under four minutes is evidence of the consent-banner failure**, which is
the risk the next section of that document already warns about. A floor of five minutes hides that signal.

`try-it.md` has deliberately **not** been edited yet: it is a promise to an outside reader and should change
as a decision, not as a side effect of a measurement run.

### `everything`'s ten conformant records — UNDER RE-MEASUREMENT, and the correction is NOT to be written yet

**This one is written twice on purpose. `ceo`'s instruction, and it is the right one: do not write the
correction as a fact before the run lands.**

**What is on the record.** A lab `everything` run, last executed **2026-09-06 00:46**, stopped at `promote`
with `RULES: FAIL — 10 conformant record(s) were failed by a deterministic rule` — `keyboard-trap-modal-cycle.good`,
`keyboard-trap-modal-escape.good`, `image-missing-alt-behind-consent.good` and seven more, against 2,796
records. **CLAUDE.md states the rules layer has "0 false positives across 1,183 conformant records", and
that is the claim this project leads with.**

**What is NOT known.** Whether it still happens. **The run predates several days of merges**, the two
populations are different sizes (2,796 against 1,183), and nothing has ever compared them — which is this
repository's most-recorded shape rather than a new discovery. It is being re-run tonight at current `main`.

**So the sentence for the edition, if the result has not landed:**

> The rules layer's published "0 false positives across 1,183 conformant records" is **under re-measurement**.
> A lab run from 6 September reported ten conformant records failed by a deterministic rule over a larger
> population; it predates several days of merges and is being re-run. **We are not yet saying the claim is
> wrong — we are saying nothing has been comparing the two numbers.**

**And the sentence to use ONLY if it reproduces at current `main`:**

> The rules layer's published "0 false positives across 1,183 conformant records" **does not hold at current
> `main`**: re-measured on 9 September, ten conformant records are failed by a deterministic rule. The
> published figure is withdrawn pending the count being restated against the population it was measured on.

**Neither sentence goes in until the run reports.** If the result has not landed by press time, the first one
runs and the edition says so plainly — *"under re-measurement, result expected today"* is a legitimate thing
for a board to be told, and far better than either a stale reassurance or a withdrawal we cannot support.

### What this section must NOT become

**A list of incidents.** Two red windows on a day with 437 merges is a number the board can hold; a
narrative of each is the engineering edition's job, not this one. If the summary is tight, **the whole of
4a is one sentence: main was briefly red twice and green by mid-afternoon, and the automatic repair for it
has a known defect being fixed.** The corrections in section 1 outrank it.

## 5. Are we on the date?

The date held at **20 September** through 9 September. **Re-read at 07:25 from the milestone**, not from
this file:

```bash
gh api repos/DanBeckDev/a11y-witness/milestones --jq '.[] | "\(.title): due \(.due_on) — \(.open_issues) open, \(.closed_issues) closed"'
```

## 6. What must the board decide

Unchanged from the 9 September edition and still outstanding, so the summary says **"again"** rather than
restating them as new: approve version one's meaning, name an outside tester, confirm September
publication. **Check first** whether any was answered overnight — three editions asking the same question
without acknowledging it has been asked before is how a decision request stops being read.

## 7. Numbers as they stood on 9 September — ALL REQUIRE RE-MEASURING

| | 9 Sep | re-measure with |
|---|---|---|
| merges, window stated | 495 to 16:59:27+01:00 | `git log origin/main --since=<today>T00:00:00Z --merges --oneline \| wc -l` |
| open pull requests | 6 | `gh pr list --state open --json number --jq 'length'` |
| pickable rows | 15 at 17:0xZ | `gh issue list --state open --label ready --json number --jq 'length'` |
| the September move | 3 open, 1 pickable | `gh api repos/.../milestones/5` |

## 8. One thing the summary must NOT claim

The scheduled tracker audit still cannot read the board's own membership in CI — **#546 is open**, with
the chairman — and until it lands that audit answers seven of its eight checks. Any sentence about the
tracker being fully audited is false while that holds. **Check #546 before writing**, not this file's word
for it:

```bash
gh issue view 546 --repo DanBeckDev/a11y-witness --json state --jq .state
```
