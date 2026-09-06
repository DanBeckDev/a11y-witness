# The daily board report

**The report is published by GitHub Actions, not from anyone's machine.**

| workflow | when | what it does |
|---|---|---|
| `board-report.yml` | 07:00 UTC daily | posts the engineering edition to the report issue and the PDF to a draft Release |
| `board-summary-check.yml` | 20:00 UTC daily | comments once if tomorrow's executive summary is not committed. It writes no summary text |

**The stated hour is true year round, and it costs two crons to be so.** GitHub schedules in UTC only, so
one cron is the right London hour for half the year and an hour out for the other half. **Both are
scheduled and every working step is gated on London's actual clock**, so exactly one of the pair acts on
any given day. The off-hour run does nothing, says so in its log, and **exits successfully** — a job that
failed daily for behaving correctly would put a red mark on the repository every morning, and a signal
that is red every day is a signal nobody reads.

A stated time that is wrong for half the year is the same small untruth this pipeline refuses everywhere
else. `board-schedule.test.ts` pins the pair and the gate together, because they are two facts that must
agree: move the publish time and it is the second one you forget, and the failure is silent — the job
simply never runs.

```bash
bash scripts/fetch-board-report.sh            # today's PDF into ~/Documents/a11y-witness-board-reports/
bash scripts/fetch-board-report.sh 2026-09-06 # a given date
```

That fetch is a **convenience, not a dependency**. The Release draft is the delivery; the folder is
somewhere a person can double-click. A day nobody runs it is a day the document still exists.

## THE LAUNCHD JOB IS RETIRED, and the reason it existed is worth keeping

It ran on one Mac, and the argument for that was **not** convenience: the report's merge count and
push-state lines exist to catch work committed locally and never pushed, and a GitHub runner only ever
sees `origin/main`. A scheduled report confidently wrong about the thing it was built to see is worse
than a manual one.

**The chairman's ruling that everything is pushed removes the premise.** GitHub is then the complete
record, and the schedule stops living on a single machine nobody else can see, restart or inherit — which
was a real single point of failure, and one this project had already written down under a different
heading.

**What the ruling costs, stated rather than absorbed:** this workflow *cannot* detect an unpushed local
branch, so it cannot report one. The push-state line now records the rule rather than proving it, and
says so in the edition itself. The dispatcher's own branch count is what would contradict it, and a
branch found unpushed appears in the report as an exception. **An absent check must not read as a clean
one.**

## Where the document goes, and why not beside the log

**`~/Documents/a11y-witness-board-reports/<date>.pdf`, one file per date.** The GitHub Release draft is
the second copy.

It was written beside the scheduled job's log for a while, on the reasoning that a LaunchAgent's output
belongs in `~/Library/Logs` on macOS. **That reasoning was about the log.** A board document is not a log:
it is a deliverable a person opens, and a deliverable filed where its reader does not look has not been
delivered. The log stays there, where the original reasoning does hold.

**The intermediate HTML is written to a temporary directory, not to that folder.** It is Chrome's input
rather than a deliverable, and *one file per date* means one file — a folder holding two files a day, one
of which opens as unstyled markup, is a folder somebody has to learn to read past.

## Why it cannot run on a GitHub runner

A runner only ever sees `origin/main`. Two of the report's lines exist specifically to catch a push hold —
the merge count and the push-state line — and on a runner the first would miss anything merged locally and
unpushed, while the second would read *"level, checked"* every day whether or not it was true.

**A scheduled report that is confidently wrong about the thing it was built to see is worse than a manual
one.** So this runs from a checkout that can see local branches, which for now means the control-plane
machine. That is a contingency to know about: if this machine stops being the control plane, the report stops
with it, and issue #20's body says a missing edition is a defect in this process rather than a quiet period.

## What refuses, and what it refuses to do

`--post` will **not publish** unless the files the report reads out of the working tree match `main`:

```
docs/board/reported.json      the gate result and the fleet-hours total
scripts/board-report.mjs      the generator itself
```

Two states both refuse, and they are different: **uncommitted** changes, and **committed on another branch**
— the scheduled job runs from whatever branch this checkout is sitting on, and a peer's branch is not dirty
while still supplying a `reported.json` nobody reviewed.

It exits **3**, says which files and which state, and **publishes nothing** — never a partial edition. The
wrapper writes that verdict into the log with its reason, so a missing edition can be explained rather than
guessed at.

`--allow-dirty-read-set` overrides it and **stamps the published edition** with the fact, rather than
overriding quietly.

**This is deliberately not "refuse if `git status` is non-empty".** Several agents work in this checkout at
once, and a guard that fires on somebody else's unrelated edit is one people disable within a day — the same
reasoning `promote:model` uses when it checks its target paths rather than the whole tree. Everything else
the report reads is a ref or the GitHub API, and neither is affected by an uncommitted file.

## Knowing a failure mode does not protect you from it; only a check that runs does

Two things happened within an hour of `npm run mutate` being built **by the person who then did them**,
and they are the two halves of this repository's oldest defect. They are here rather than in a commit
message because the next person building a generator will open this file, not that commit.

**An edit that matched nothing and reported success.** A scripted replacement whose anchor was indented
four spaces inside a function while the pattern used two. Python replaced nothing, exited zero, and the
change was announced as done. It was caught only because the render afterwards went to the old path —
that is, by the *behaviour* disagreeing, not by anything checking. **Assert the anchor before writing**,
so a pattern that matches nothing fails loudly:

```python
assert old in s, "ANCHOR NOT FOUND -- refusing a no-op edit"
```

**A check whose answer was ignored.** Two files were compared before deleting one; the comparison printed
`DIFFER — leaving both`, and the delete ran anyway, because the check and the action had been written as
two separate commands rather than one gating the other. Nothing was lost that time. **Gate the action on
the check** — `cmp -s a b && rm a` — because a check whose result nothing consumes is decoration.

**Use `npm run mutate` even where it feels like overhead.** It refuses a mutation that changed nothing,
which is the first of these exactly; and it runs the test again after restoring, which is the discipline
of the second. Both of the above were done by hand, going round the outside of a tool built that hour to
catch them.

## Recording a result the report cannot compute

`reported.json` is the only place it takes a number it cannot read from GitHub or git, and **both entry
shapes are documented inside that file** so they are read at the moment a result is recorded, not recalled
from a message.

- A **gate** entry carries the gate's own text verbatim. The newest by `at` is printed; one older than
  `staleAfterHours` still prints, marked `STALE` — an absent line and an old line are different facts.
- A **fleet-hours** entry must name the `run` it was computed from. Without one the report prints
  **REFUSED** and says what is missing, rather than printing the total with a footnote. A footnote is
  something a reader skips; a refusal is not, and unlike a convention it cannot be satisfied by remembering.

## By hand

```bash
npm run board:report                          # generate to stdout and read it
npm run board:report -- --post --issue=20     # publish it
launchctl kickstart gui/$(id -u)/com.a11y-witness.board-report   # force one edition now
```

Generating and posting are separate acts on purpose, so a bad report can be seen before it is posted.

## Is the schedule actually installed, or just claimed?

Every job this repo schedules is only ever ASKED to run by something a human read and typed
(`bash scripts/install-board-report.sh`) — nothing checks afterwards that it actually took, or that a
later `launchctl bootout` (or a reinstalled OS, or a machine that quietly stopped being the control plane)
did not silently remove it. A job that does not exist produces no output, no log and no alarm, which is
the same silence as a job that ran and found nothing to report.

```bash
npm run jobs:check                                # report every claimed job's real installed state
A11Y_ASSERT_CONTROL_PLANE=1 npm run jobs:check     # THIS machine is meant to run every one — fail by
                                                    # name if any is missing, rather than only report
```

**The env var is the judgement call, not an assumption.** Most machines that clone this repo are not the
control plane, so a bare `npm run jobs:check` never fails — it would otherwise be the exact "red gate
everyone learns to ignore" shape this repo has already been burned by (see the missing-role-file split in
`docs/roles/README.md`'s own enforcing test). `A11Y_ASSERT_CONTROL_PLANE=1` is the explicit, per-run
opt-in that turns "not installed" from a report into a defect, on the one machine the claim is actually
about. It also reports any `com.a11y-witness.*` job launchd knows about that no `.plist` here claims —
the opposite direction, lower stakes, but nothing else looked for that either.
