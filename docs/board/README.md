# The daily board report

**One command to bring it up on a new control-plane machine:**

```bash
bash scripts/install-board-report.sh
```

It installs a launchd agent that posts an edition to [issue #20](https://github.com/DanBeckDev/a11y-witness/issues/20)
at **08:00 Europe/London**, writes the PDF to **`~/Documents/a11y-witness-board-reports/`** — one file
per date, where the chairman looks — logs to `~/Library/Logs/a11y-witness/board-report.log`, and
**proves the job is registered** with `launchctl print` rather than trusting `bootstrap`'s exit code — a verification that shares
a failure mode with the action verifies nothing. Idempotent; re-running is how you pick up a moved checkout.

It **checks the machine's timezone rather than assuming it**, because `StartCalendarInterval` is local time
and issue #20's body promises Europe/London. A report whose stated time and actual time disagree is the kind
of small untruth this whole pipeline exists to refuse.

## Working on this: a worktree, and what its `node_modules` symlink actually means

**Nothing is edited or checked out in the primary checkout.** That is a fleet rule rather than tidiness:
the primary is what the fleet's code hash is computed from and what every other worktree resolves its
dependencies through, so a feature branch sitting there silently changes what every capture worker builds
against.

```bash
git worktree add ../a11y-wt-board <branch>
cd ../a11y-wt-board && ln -s ../a11y-witness/runs runs && ln -s ../a11y-witness/node_modules node_modules
```

**Sharing `node_modules` is normal here and it has a consequence worth knowing before it costs you an
hour.** Every `@a11y-witness/*` import then resolves through the PRIMARY's packages, so you read the
primary's `dist`, not yours. Building in your worktree changes nothing a cross-package tool sees. That
cost the fleet driver most of an hour on 2026-09-06, convinced a generator was broken when it was
faithfully emitting two-hour-old code.

**Ask where it resolves, not whether the symlink exists** — checking that a symlink is a symlink is the
mistake that hid it:

```bash
node -e "console.log(require.resolve('@a11y-witness/judge'))"
```

For the board tooling this is currently harmless: the scripts here import only `cli-flags` from
`worker-fleet`, which this work never changes, and the tests reach the scripts by relative path. **It
stops being harmless the moment this work touches a package's source**, and then the worktree needs its
own install rather than the symlink.

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
