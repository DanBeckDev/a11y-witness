# The daily board report

**One command to bring it up on a new control-plane machine:**

```bash
bash scripts/install-board-report.sh
```

It installs a launchd agent that posts an edition to [issue #20](https://github.com/DanBeckDev/a11y-witness/issues/20)
at **08:00 Europe/London**, logs to `~/Library/Logs/a11y-witness/board-report.log`, and **proves the job is
registered** with `launchctl print` rather than trusting `bootstrap`'s exit code — a verification that shares
a failure mode with the action verifies nothing. Idempotent; re-running is how you pick up a moved checkout.

It **checks the machine's timezone rather than assuming it**, because `StartCalendarInterval` is local time
and issue #20's body promises Europe/London. A report whose stated time and actual time disagree is the kind
of small untruth this whole pipeline exists to refuse.

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
