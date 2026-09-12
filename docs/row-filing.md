# Filing a backlog row: `npm run row-file`

`.github/ISSUE_TEMPLATE/backlog-row.yml` marks Region, Acceptance and Open-check `required` — but that is a
GitHub issue **form**, and forms apply only in the web UI. Every row this fleet files goes through
`gh issue create --body`, which bypasses the form entirely: there is no field to leave blank, because there
are no fields.

Measured 2026-09-09 (#735, worker-capture): of 76 open rows, 36 were missing at least one required section
(25 missing Region, 5 missing Acceptance, 28 missing Open-check) — and the rate was **worse** on the
newest rows (82% of `#700+`) than the oldest (22% of `#0–399`), because the more the org files its own
work with `gh issue create`, the more of the backlog becomes un-claimable. `row-claim.mjs` (#707) already
refuses to claim such a row, naming the missing field — but that refusal lands on whoever picks the row up
later, with less context than whoever filed it had.

## Use this instead of `gh issue create` directly

```sh
npm run row-file -- --title "..." --body "## Region\n\n...\n\n## Acceptance\n\n...\n\n## Open-check\n\n..." --session=<your-session-name> [any other gh issue create flag]
# or
npm run row-file -- --title "..." --body-file /path/to/body.md --session=<your-session-name> [any other gh issue create flag]
```

`--session=<name>` is **required** — the same flag `row-claim.mjs` already uses for dispatch/claim/decline,
reused rather than a second, independently-typed one. `scripts/row-file.mjs` reads exactly the body this
invocation would file — from `--body`/`--body=` or `--body-file`/`--body-file=` — and checks it against the
**same rule** `row-claim` already enforces at claim time (`missingTemplateFields`, imported unchanged from
`scripts/row-claim/template-fields-rule.mjs`, #707). If a required section is missing, it refuses and names
which one, before `gh` ever runs.

If the body is complete, it is filed with a `Filed-by: <session>` line appended (#771) — a body line, never
a label, since a `filed-by:*` label would collide with `session:*`'s existing meaning of *claimed* (the
2026-09-09 ruling; see #683 for the identical collision that removing `session:` on close would otherwise
have caused). `row-claim check`/`--row=` prints it: `Filed-by: unrecorded` on any row filed without this
tool, never inferred from prose that happens to say who filed it — GitHub's `author` is one fleet account
for every row, so nothing else can answer this question at all.

Every other flag `gh issue create` accepts (`--label`, `--assignee`, `--milestone`, `--project`, …) passes
straight through unchanged; this tool does not enumerate or restrict them.

## Why this and not a stricter check

The population is not static — every row a session files adds to it, so a one-time sweep's number is stale
before it can be read. The fix is a check that runs at the moment a row is created, not a count pinned into
a row body. `tracker-auditor`'s hourly report separately counts open rows still missing a section, so the
population's current size stays visible without depending on every filer having used this tool.

**This does not relax the claim-time gate**, and should not: an `Open-check` is what stopped three of six
rows seeded on 2026-09-06 being worked after they were already fixed. It also does not weaken to counting
headings rather than content — a `## Open-check` with nothing under it still refuses, because it asserts
exactly what `row-claim` asserts (`hasTemplateField`'s "real content under it", not a bare heading match).

## Writing a section that has no content: say so, never leave it blank

Two rules from the 2026-09-09 backfill, in the guidance rather than in the heads of whoever did it.

**A section that is genuinely empty gets a sentence, not a blank.** A row that changes no file writes
`Region: none — this row changes no file, because …`, and a row with nothing to invert says so under
Mutation. *"This row touches nothing"* and *"nobody wrote the section down"* are different states and no
audit can tell them apart, so a blank leaves the row in the missing-section count forever and reads as an
oversight. #149 (a parent that deletes nothing), #72 (a change only an npm org owner can make) and #668
(a count each session accounts for) are the worked examples.

**A PROBE IS A READ. A WRITE IS NEVER A PROBE.** To find out whether the API will accept a write, ask with
`gh api -i` on a **read** and look at `X-Ratelimit-Remaining` — the headers are on every real call, not
only on mutating ones. `gh api rate_limit` is not an instrument here: measured 2026-09-09 in the same
second, it reported `core 5000/5000` while a real call's headers reported **2,216 already used**, and a
secondary limit does not appear in it at all. Sending a `POST` to find out whether `POST` works created
row #798, titled `probe`, in the live tracker — the same defect as the fixture rule above, committed by
the person who had closed #762 for it two hours earlier.

**AND `git show <ref>:<path>` IS THE READ. `git checkout <ref> -- <path>` IS A WRITE TO THE INDEX.** It
copies the ref's whole tree into the working tree and stages it, so running it to *look at* a file on
`main` staged fifteen files across a `pm/` branch — including `.github/workflows/trunk.yml`, which
that branch may not touch, and other sessions' in-flight work. Nothing was committed; a later
`git checkout` to another branch aborted, which is the only reason it was noticed. CLAUDE.md already
carries `git checkout --` as the command that destroyed release-eligible weights; **this is the same
command reached for as a read.**

**And tracker mutations go out at no more than ten a minute per session, with a pause between batches**;
a batch over twenty is announced in the hourly line before it runs. Twenty-six board additions in four
minutes bought a secondary rate limit that refused every session's writes for the next fifteen — cheap per
item, costed to whoever needed the resource next.

**And an invented section is worse than an absent one.** A plausible-looking Acceptance gets built
against; a blank one is visible. Where the sections are written by somebody other than the filer — the
backfill marked each *"sections written by the PM from the filing, filer to confirm"* — the mark is an
invitation to **replace**, never to append: a second `## Acceptance` beside the first is what #746
measured going red as `DUPLICATE -- 2 sections found`.

## The sections a machine reads: Region and Acceptance

Two rulings from 2026-09-09, both earned the same evening, and both about the same thing: **a section
that is parsed is not prose, whatever it reads like.** A person reads these correctly. The only reader
that matters does not.

**A REGION LISTS ONLY PATHS THE CHANGE TOUCHES. AN EXCLUSION IS PROSE UNDER ITS OWN HEADING, NEVER IN
THE REGION — THERE IS NO NEGATION GRAMMAR.** `declaredRegionFiles` parses that section for paths and
cannot see the word `not`, so this sentence, written inside #848's Region, **declared exactly what it
denied**:

> **`.github/workflows/ready-label-audit.yml` is NOT in this region**

`fileOverlapReason` then refused another session's claim on #849 over a file #848 had no intention of
touching: **the row's own disclaimer was the thing that blocked them.** Put the exclusion under
`## Not in scope`, and say why it is not a preference — *"a `pm/` branch may not touch that
directory"* — which is where a reader looks for it anyway. Measured across all 63 open rows carrying a
Region: **one harmful instance and three latent**, each escaping only by accident of the grammar — a
directory with no filename, a file that was in scope regardless. **The accident is not a defence; the
grammar will change.** The check is one command, and it is the check to run before quoting any row's
region:

```bash
node --input-type=module -e "import {declaredRegionFiles} from './scripts/region-paths.mjs';
  import {readFileSync} from 'node:fs';
  console.log(declaredRegionFiles(readFileSync(process.argv[1],'utf8')))" <a file holding the row body>
```

If a path you meant to exclude comes back in that list, the row is claiming it.

**AND AN ACCEPTANCE NAMES FILES, NEVER `npm test`.** #854's acceptance said `npm test`, passed
`row-file`, and was then refused by `pr:open`: *"needs `corpus`, which this job does not have —
`abstention-regression.test.ts` requires corpus via `compareAtFloor`"*. The acceptance job has no token
and no corpus and runs commands taken from a PR body, so *"the whole suite"* is not something it can run.
`worker-capture`'s statement of why is the half that makes the rule follow from something rather than
merely assert it: **a row's acceptance is written before anybody knows which job will run it**, which is
exactly why it has to name the files the change is verified by rather than the command a developer would
type. `pr:open`'s own refusal says it best, and a filer who follows it exactly will pass:

> a PR whose author cannot name a file that verifies it has no acceptance

**AND THE FILES IT NAMES COME FROM THE RIGHT POPULATION. A transcript names the files a defect is IN. An
acceptance names the files that must RUN. A population derived for one purpose does not transfer to the
other.** #1160 (2026-09-12) had already been refused once for saying `npm test`; the replacement was
built from the sweep output that found the defect — a list of the files it appeared in — and `pr:open`
refused that too:

> needs `corpus`, which this job does not have — `exit-code-contract.test.ts` requires corpus, at :119

**The second refusal was the same refusal**, and the wrong population was chosen in the very edit that
answered the first. The two lists overlap enough to look interchangeable and they answer different
questions: *where did I find it* has no opinion about what the acceptance job can run, and *what must run*
has no opinion about where the defect was. Derive the second from the first by asking, of each file, **will
this command open it and can this job run it** — and check the answer the way the section is read:

```bash
comm -3 <(git diff --name-only origin/main...HEAD | sort) <(<the acceptance command, one path per line> | sort)
```

Anything in either column is a file the change touches and the acceptance never opens, or a file the
acceptance names and the change never touched. **Both are wrong and they cancel in a count**, which is how
#1160 read as 24-for-24 while naming one file it did not touch and omitting one it did.

**Neither rule is a request to teach the parser more grammar.** Teaching `declaredRegionFiles` to read
negation would make it guess at intent, and the exclusion belongs under its own heading for the human
reader anyway.

## `out-of-release` answers one question, and importance is not it

**`out-of-release` answers ONE question: does this block the 20 September publish. It does not mean
unimportant. A row that is out of release and worth fixing soon is spelled "out of release, ready" —
importance is said by the ready order, not by which milestone a row sits on.**

Earned 2026-09-12 on #1161, a defect in `scripts/row-claim.mjs`'s refusal message. It was moved **into**
the release on an argument from severity, and `worker-capture`'s objection was that the label had been
answering its own question correctly all along: `row-claim.mjs` ships in no package, so it cannot block a
publish however badly it behaves. **`ceo` reversed their own ruling** — no severity axis, because the
tracker already has one and it is the ready order. The row is now *out of release, `ready`*, which says
both things without either contradicting the other.

**The `Out of release` milestone's own description carries this sentence too, and the two are compared by
a guard rather than left to agree.** `ready-label-audit.mjs`'s `guidanceDrift` fails when either copy stops
carrying what the other says — because two copies of one rule with nothing comparing them is the defect
that produced five incidents in one day (`docs/operational-lessons.md`), and writing a rule about drift
twice, unpinned, would be this page refuting itself.

**It detects a rule going MISSING, not a rule changing meaning**, and the distinction is worth knowing
before you edit either copy. It matches phrases, so a faithful rewording of either one reads as *deleted*
and reddens the nightly audit until the two are re-synced — **and the remedy is to re-sync them, never to
loosen the check.** The two saying it the same way is the property. A copy that keeps every phrase and
reverses every meaning passes clean, which no phrase-matching guard can prevent; if you are inverting a
rule rather than editing it, this guard is not the thing that will catch you.
