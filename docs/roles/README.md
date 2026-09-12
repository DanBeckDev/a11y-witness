> **Authority over `CLAUDE.md` — stated by the repository owner, 2026-09-06.**
> The owner told the `ceo` session, in the owner's own words: *"Why are you asking me? You are the CEO."*
> On that instruction: `ceo` holds the owner's delegated authority over `CLAUDE.md`. Prose changes land on
> `ceo`'s decision. A number in `CLAUDE.md` that a test derives from the tree is the change author's to move,
> in the same PR, without asking. This commit is authored by the `ceo` session on the owner's instruction so
> that every future session can verify the delegation against the tree rather than against a message.

# If this machine is lost, can the organisation be reconstituted from the repo alone?

## THE HIERARCHY

**2026-09-07, board decision: the company runs a CI/CD pipeline, and the organisation follows it.** The
pipeline decides what merges; no person or agent is the merge step. A worker owns a change from branch to
merge: the PR body carries `Closes #N`, an `Acceptance: <command>` line and a `Mutation: <command>` line,
the pipeline runs them, a green gate merges (merge commits only), a merge that turns `main` red is reverted
by the pipeline, and every green `main` publishes to npm under `next`. A person approves only on the owned
paths: `packages/nvda-worker`, every cache-key input, `packages/scorer/models` and the gates, where
`orchestrator` is code owner.

The chairman speaks to `ceo` and to nobody else. `ceo` decides and reports to the chairman; routine
decisions, including destructive ones on `runs/`, are `ceo`'s, and the board hears budget, hires, dates,
product claims and structural questions only. `orchestrator` (platform: fleet, lab, gates, code owner),
`dispatcher` (pipeline owner: workflows, trunk health, the Ready queue, briefing) and `product-manager`
(product owner: Ready's contents, the release date, the board document) report to `ceo`. Workers pull from
Ready and report to nobody; the merge is the report. `tracker-auditor` reports to `product-manager`.
The `reviewer` role existed for one morning on 2026-09-07, was retired when review became a job, and was revived on 2026-09-12 when review became the throughput ceiling; see its file for why it cannot be messaged.
Nobody messages the chairman; a question only the chairman can answer goes up the chain to `ceo`, who asks.

---

## A SUMMARY IS NOT A CITATION

Every session compacts, and a compaction summary is written in the same voice as a quotation: it says
"CLAUDE.md records…" because that is what the session believed. Measured 2026-09-07: a row instructed a
worker to reproduce repository settings "recorded in CLAUDE.md"; the sentence existed on no ref, and came
from the author's own summary. Anything you resume with is a BELIEF until re-read from the file at a ref.
Cite `file:line` and the ref you read it from, the same as a number carries its command. This binds `ceo`
first.

**The second example, same day, harder to see:** a source comment cited `schema-migration.json` as "the
whole record" of a decision, and that file is deleted whenever a migration closes, by design. A citation to
a record that no longer exists reads identically to one that never existed, and it sent three sessions to
a wrong conclusion about a schema change. When a citation resolves to nothing, say "the record is gone"
rather than "there was no record"; they need opposite work (#340).

**The third example, 2026-09-08, in the author's own sentence: "the claim was true in wording but not
in fact at the moment I made it."** `worker-audit` wrote that a line had been "re-verified against the
real, now-merged release.yml on current main". Their worktree had merged only the dormant file, so the
run they cited had nothing to catch; they re-ran from a fresh clone at `a0e573f0` and confirmed the
line. The line is `.github/workflows/release.yml:88-89` at `a0e573f0` (`consumer-gate:` /
`uses: ./.github/workflows/consumer-gate.yml`), and on later main the same two lines sit at 92-93
because #558 grew the comment block above them, which is why a citation carries its ref and not only
its number. The rule: a verification names the ref it ran against, and a green with nothing to catch is
not a green (#543).

**A fourth example, 2026-09-09: read the artefact, not the census of it.** Three sessions, this one
included, told the board that calendly had served a near-empty page, from one field of one capture
(`structureCensus: heading 1, link 5, tabbable 11`). One worker read all three capture files before
writing a sentence: the structural sweep had read the full page identically every time (44 headings),
and the census had been taken after the tool's own form probe navigated to Google's sign-in page,
which `routeChange` recorded. The correction posted to the board at 11:00Z was itself corrected at
11:05Z. A claim about a page cites the capture file and the field, and a claim that withdraws a
published figure gets at least the scrutiny a claim that confirms one gets, because withdrawing is
the direction where being wrong costs more.

## The roster

| role | agent name | file | reports to |
|---|---|---|---|
| Chief | `ceo` | [`ceo.md`](./ceo.md) | — |
| Platform owner and code owner | `orchestrator` | [`orchestrator.md`](./orchestrator.md) | `ceo` |
| Pipeline owner | `dispatcher` | [`worker-loop-orchestrator.md`](./worker-loop-orchestrator.md) | `ceo` |
| Product loop | `product-manager` | [`product-manager.md`](./product-manager.md) | `ceo` |
| Tracker audit | `tracker-auditor` | [`tracker-auditor.md`](./tracker-auditor.md) | `product-manager` |
| Reviewer (revived 2026-09-12; external tool, GitHub is its inbox) | `reviewer` | [`reviewer.md`](./reviewer.md) | `ceo` |
| Worker | `worker-audit` | [`worker-audit.md`](./worker-audit.md) | `dispatcher` |
| Worker | `worker-capture` | [`worker-capture.md`](./worker-capture.md) | `dispatcher` |
| Worker | `worker-config` | [`worker-config.md`](./worker-config.md) | `dispatcher` |
| Worker | `worker-contracts` | [`worker-contracts.md`](./worker-contracts.md) | `dispatcher` |
| Worker | `worker-judge` | [`worker-judge.md`](./worker-judge.md) | `dispatcher` |

**`dispatcher`'s own file is named `worker-loop-orchestrator.md`, not `dispatcher.md`** — it predates this
page and describes the ROLE (worker-loop orchestration) rather than the agent filling it, and it is kept
at that path deliberately: renaming it would rewrite history for a file whose content already correctly
names the agent (*"the agent filling this role is named `dispatcher`"*) in its own first line. Every other
role's file is expected to follow the `<agent-name>.md` convention this table uses; the discovery test
below reads each file's OWN content for its name, role and reporter, never the filename, for exactly this
reason — a naming convention is a fact this repo has learned not to trust something else to enforce.

**A row with no working link is a gap this page is honest about, not one it hides.** As of this commit,
`orchestrator`, `worker-contracts` and `worker-judge` have not yet landed their file — each is writing it
directly, per `ceo`'s instruction, and the enforcing test below names exactly which are still missing
until they do, as a **reported gap rather than a failure**: see that test's own comment for why a missing
file (owned by an agent other than the one pushing) is not the same defect as a malformed row or an
existing file missing one of its four required parts, and must not block everyone else's `npm test` for it.

## The bring-up order, and why it is not alphabetical

**1. `orchestrator` first.** It is the one driver for the fleet, the lab and `runs/` — `lab:job` refuses a
second job of a name rather than queueing it, `fleet:deploy` reboots every worker, and
`assertFleetRunsThisCheckout` means the fleet runs ONE commit. Nothing else can be briefed against real
capture or corpus state until this exists, because there is no fleet/lab state to brief against otherwise.

**2. `dispatcher` second.** Its whole job is briefing and merging on `orchestrator`'s behalf — reading
`docs/backlog-ready.md`, keeping it stocked, running local gates, merging what is clean and self-contained,
and handing up the three trigger conditions in its own file. It needs `orchestrator` to exist first because
its own escalation path (cache-key changes, fleet-touching acceptance, cross-cutting collisions) terminates
there.

**3. The workers, in any order, once `dispatcher` can brief them.** A worker with no dispatcher to report
to and no ready queue to pull from has nothing to do that would not risk a collision.

`ceo` sits outside this sequence — it is the standing authority `orchestrator` escalates disputed rulings
to (see `orchestrator`'s own file for what counts as one), not a step in bringing the loop up.

**`product-manager` also sits outside it, and can be brought up at any point after `dispatcher`** — it owns the tracker, the release milestone and the daily board report, and touches no fleet, lab or merge. Its one bring-up step that is not a git clone is `bash scripts/install-board-report.sh`, which schedules the report on whichever machine is the control plane; without it the tracker still works and the daily edition simply does not arrive.

## The first message for each agent, ready to paste

Every one of these assumes a fresh Claude Code session with this repository checked out (or a fresh clone
— see "The contingency drill" below) and nothing else. Each message is deliberately short: the role file
it points at carries the real detail, because restating that detail here would be the fact-stated-twice
shape this repo's own guards exist to close.

**`orchestrator`:**
> You are `orchestrator`. Read `docs/roles/orchestrator.md` in full — your lane, what you drive alone
> (fleet, lab, `runs/`), and what you escalate to `ceo`. Read `docs/roles/README.md` for the roster and the
> bring-up order. Confirm you can reach the fleet and the lab, then tell `dispatcher` you are up — bring it
> up next if it is not already.

**`dispatcher`:**
> You are `dispatcher`. Read `docs/roles/worker-loop-orchestrator.md` in full — what you own, what you hand
> up, and the three trigger conditions. Read `docs/roles/README.md` for the roster. Confirm `orchestrator`
> is reachable, then read `docs/backlog-ready.md`; if it is empty, read `docs/backlog.md`'s ready-shaped
> rows and seed it. Start briefing workers as they come up.

**Each worker** (`worker-audit`, `worker-capture`, `worker-config`, `worker-contracts`, `worker-judge`):
> You are `<name>`. Read `docs/roles/<name>.md` in full — your lane, your acceptance standard, and the
> resource ban. Read `docs/roles/README.md` for the roster and where state lives. Message `dispatcher` to
> confirm it is up and get your first unit; do not pull from `docs/backlog-ready.md` yourself unless your
> own role file says otherwise.

**`ceo`:**
> You are `ceo`. Read `docs/roles/ceo.md` in full — what rulings you make and what you deliberately do not
> touch day to day. Read `docs/roles/README.md` for the roster. `orchestrator` reports utilisation and
> escalations to you; there is nothing to bring up on your side beyond being reachable.

## What state lives where

A reconstitution attempt fails at exactly the step where it assumes something is in the repo that is not.
Named here once, so nobody has to rediscover it under time pressure:

| state | lives | notes |
|---|---|---|
| Source, tests, docs, this role system | **GitHub** (`origin`) | The repo. Everything in this table that is NOT here is a reason the repo alone cannot reconstitute the org. |
| The authoritative training/real-page corpus, trained model candidates | **The lab** (`a11y-lab`, reached over its own SSH key — see below) | `runs/` in any local checkout, including the primary one, is a COPY. `npm run lab:inventory` says how stale; `orchestrator`'s file says who may treat a `runs/`-reading gate as a verdict. |
| The capture fleet | **Bare-metal workers** (`inventory.yml` in the repo names them; they are not reachable without the fleet SSH key) | `npm run fleet:status` from a machine holding the key is the only way to ask them anything. |
| **Credentials: the fleet SSH key and the lab's `a11y-pve` key** | **This Mac only** | See "Credentials" below — this is the single point of failure the board finding is actually about. |
| Agent memory — cross-session facts an agent has learned and chosen to keep (e.g. the lab's host address, which key does what) | **`~/.claude`** on this Mac, per agent/session | Not the repo, not backed up by a `git clone`. An agent rebuilding context after a loss starts with none of this and has to re-derive or re-be-told it. |
| **The git hooks** (`core.hooksPath`), which run the full test suite on `git push` | **The repo's own git config**, installed by `scripts/install-git-hooks.mjs` via `npm run prepare` | Bring-up state, not a detail: it is what created a real exposure the same day this page was written — the audit row *"nothing installs the git hooks"* was CLOSED, so hooks began running `npm test` on push with `GIT_DIR` set in the environment, and a test that shells `git` with only `cwd` set follows `GIT_DIR` instead, onto the real repo. `ceo`'s own framing: a closed row created the exposure. See the contingency drill below for what this means for anything that shells git during bring-up. |

| **What is open** — every work item, its acceptance command, its region, and which are release blockers | **GitHub Issues, the Project board and the `v0.1.0` milestone** on `a11ign/a11ign` | Survives the loss of this machine, which is why it moved there on 2026-09-06. `docs/backlog.md` and `docs/known-gaps.md` stay as the RECORD of lessons and are NOT the tracker — the backlog contradicted itself (it says a closed row is deleted, and keeps them struck through) and five rows checked that day were already closed. Filed as issue #19 rather than fixed silently. |
| **The daily board report's schedule** | **Moving to GitHub Actions, per `ceo`'s ruling** — reversing this row's own earlier position | This row used to argue the report **cannot** be moved to a GitHub runner: a runner only ever sees `origin/main`, so the merge count would miss anything merged locally and unpushed and the push-state line would read *"level, checked"* every day whether or not it was true. That argument's premise was "work can sit unpushed" — and the push-per-commit rule (see the resource ban below) removes exactly that premise. `ceo`'s ruling: **"push-everything means nothing is unpushed, so the runner sees everything."** Until the Action lands, the report still runs from **a launchd agent on this Mac** (`bash scripts/install-board-report.sh`, one command, idempotent) — issue #20's body already says a missing edition is a defect in this process, not a quiet period, which stays true either way. Full notes: [`docs/board/README.md`](../board/README.md); the migration runbook's systemd recipe is now a general reference, not this job's answer. |
| The last gate result and the fleet-hours total the report quotes | **`docs/board/reported/`** in the repo | Recorded by the agent that RAN the command, with its verbatim output. The report reads no gate itself — a checkout's `runs/` is only as fresh as its last sync. It REFUSES a fleet-hours total that does not name a finished run, because a total whose run is unstated cannot be checked or compared with the next edition. |

## Credentials are the single point of failure — described, never printed

**Two credentials exist, both live only on this Mac's filesystem, and ADR 0012's whole design assumes
exactly one machine holds both** (`docs/control-plane-plan.md`, `docs/control-plane-proxmox.md`): an SSH
key that can reconfigure every fleet worker, and a separate key (referred to in this repo's own docs by
the name `a11y-pve`, never by its contents or its exact path) that reaches the lab's host. Neither is
committed to the repo, neither should ever be pasted into a message, a commit, or this file, and this
section names that they exist and where WITHOUT doing either.

**This is the actual single point of failure the board finding is about.** The repo, GitHub, the fleet's
own configuration and the lab's own disk all survive this Mac being lost. These two credentials do not,
unless they are independently backed up somewhere this document deliberately does not name — that
decision belongs to whoever holds them today, not to this page.

## The resource ban, verbatim — every role file below `ceo` and `orchestrator` carries it

> Do not run anything that reaches the fleet or the lab: no `fleet:*`, no `lab:*`, no `training:capture*`,
> no `worker:*`, no `evidence:check`, no `gate:stability`, no `capture:check`. Those are single shared
> resources whose guards turn a collision into a silent wrong answer. `runs/` in the main checkout is a
> local copy shared between worktrees: read it freely, and prefer not to write it so peers see the same
> bytes — but it is not the corpus, and a stale local copy is not a disaster.

`orchestrator` is the one exception by design — see its own file for what it alone may run and why one
driver, rather than a rule everyone else follows, is what keeps `lab:job`'s refusal-not-queueing and
`assertFleetRunsThisCheckout`'s one-commit invariant meaningful at all.

## THE BRANCH AND PR RULES — ruled 2026-09-07, because the conflicts had a cause

**The chairman saw too many merge conflicts. They were not carelessness, and part of the cause was
mechanical: squash merging meeting stacked branches.** A child branch cut from a parent branch has the
parent's commits in its history; squashing the parent onto `main` produces a NEW commit with a new sha, so
git no longer recognises the child's copies as applied and offers every one of them back as a conflict.
Nobody did anything wrong and the merge was still a mess.

Four rules, and each one names the failure it removes rather than the tidiness it buys.

- **A PR is against `main` only. A dependent one WAITS.** No stacked PRs.
- **Where a stack is genuinely unavoidable, it merges by REBASE, never squash**, so the child's commits are
  recognised as already applied.
- **Branches are short-lived: cut from current `main`, merged the same day.** A branch that lives a week
  accumulates conflicts against work it never saw.
- **Generated files are regenerated and CHECKED in CI, never committed in a PR.** `docs/coverage.md` is the
  first of them. Two branches that each change a criterion both regenerate it, both commit it, and the
  second to merge conflicts in a file neither author wrote a line of — so resolving it is not review, it is
  guesswork with a merge marker in it.

### A stacked PR runs NO CI, and reads `CLEAN`

**Measured tonight on #148, and this is the half that makes stacking dangerous rather than merely
awkward.** Its base was `lead/real-page-outcome-is-stated` — another open PR's branch — not `main`:

```
#148  lead/gate-ages-what-it-scored -> lead/real-page-outcome-is-stated
```

Three consequences follow, and all three are silent:

- `ci.yml` is `on: pull_request: branches: [main]`, so **a PR into a non-`main` base triggers nothing.**
  `gh run list --branch lead/gate-ages-what-it-scored` returned no runs at all, ever.
- Branch protection covers `main`, so the PR is **protected by nothing**.
- It therefore reads **`CLEAN/MERGEABLE`** — and that is CORRECT, which is exactly what makes it dangerous.
  182 unexercised insertions presented as the greenest PR on the board.

**`mergeStateStatus` cannot tell you the difference between "every required check passed" and "no check
ran".** A required context that never ran is not a failing check; it is no check. **Read the check-run
list, not the merge state** — an empty list is the tell, and it looks like success.

### A conflicting PR runs no CURRENT CI, and that is a different fault wearing the same face

**#137, the same night.** A PR that conflicts with its base has no merge ref for GitHub to check out, so
nothing can run against current `main`. **Resolve the conflict and the first run happens by itself**; do
not go looking for a broken workflow.

**But the branch was NOT runless, and the distinction matters more than the rule.** This section first
said #137 had zero runs ever, on the strength of a `gh run list --limit 25 | grep` that simply did not
reach far enough back. `gh run list --branch lead/real-page-outcome-is-stated` returns three: one failed,
one cancelled, both from before the rebase. Corrected by `orchestrator` within the hour.

So the two PRs were never the same fault:

| | what the check-run list said | what it meant |
|---|---|---|
| #148, stacked | **empty** — no run has ever existed | nothing has tested this, and it reads `CLEAN` |
| #137, conflicting | **runs, with conclusions** | real results, against a base that has since moved |

**"No runs at all" and "runs against a base that has since moved" send a reader to different places**, and
a bounded listing will turn the second into the first if you let it. Ask the authoritative source and let
it tell you what it is bounded to — `--branch`, not a grep over the last twenty-five.

**Nothing `lead/*` or `agent/*` merges without a run against current `main`.** That is the rule the facts
above exist to make enforceable, and the words "against current `main`" are the load-bearing half.

## A ROW'S OWNER IS WHOEVER CAN REACH ITS ACCEPTANCE — ruled 2026-09-09

Not whoever noticed the gap, and not whoever filed the row. `worker-capture` filed #630, a row whose whole
content is a fleet measurement the resource ban forbids them to take, and declined it in one sentence:
*authorship is not a reason to hold a row you cannot finish.* A row parked with someone who cannot finish
it reads as in-progress while being stalled, which is worse than unclaimed, because unclaimed is visible
to whoever could pick it up.

So: a row whose acceptance needs the fleet or the lab is labelled `fleet-gated` and left unassigned for
whoever is nearest the fleet; a row whose acceptance needs a workflow change is the dispatcher's; a row
whose acceptance is a board record is the product manager's; and the filer's name stays on the row as
the person who noticed, which is a different credit from the person who finishes.

Two companions, ruled the same morning:

- **A ruling that changes an open PR's required shape takes `pr:hold` in the same act**, by the ruler,
  with the refusal naming the ruling rather than the state, and a release that prints its reason. The
  queue reads a green PR and never a row's comments, so a ruling recorded on the row alone merges the
  overruled shape (#625, 2026-09-09). **And a hold means "cannot merge", not "cannot be armed"**: it
  disarms auto-merge as well as labelling (a PR armed before the ruling merges regardless of any label),
  the per-PR `arm` job reads it so the next push cannot re-arm it, and every write is read back from
  the API, because a hold that labelled and failed to disarm looks held and is the most dangerous state.
  Found by demonstrating the refusal rather than citing it (#645).
- **A ruling that changes an assignment reaches the builder in the same minute as the row**, and the
  row cites that it was sent. A record is not a delivery.
- **The claim label decides the builder, and it is read before anyone is named.** `ceo` named
  `worker-judge` for #705 while the orchestrator had already started it (2026-09-09), and two sessions
  built for ten minutes. Before assigning, read the row's `session:*` label from the API; if it carries
  one, that session builds, and reassigning means releasing the claim on the row first, in the same act
  as the new name. A row being built under `ready`, or under another session's label, is a labelling
  fault to fix that minute, because every other reader of the tracker will make the same wrong
  assignment.
- **A claim is live for four hours from its last push or comment, and a dead claim is released by the
  tracker-auditor**, not by a count of how many rows a session holds, and never while an open PR touches the
  row's Region. The two-claimed-rows cap is
  retired (2026-09-09); see `product-manager.md` and `tracker-auditor.md` for the measurement.

## THREE MORE FROM 2026-09-09 — the afternoon main went red

- **A count or a verdict is never read from a truncated pipe, and a step that summarises a log prints
  the failures it found or says it found none.** Four in one day, every command exit 0: `| tail -8` on
  a 53-line prune report read as "seven"; `| head -5` hiding five typecheck errors under a printed
  "tsc ok"; `2>&1 >/dev/null` swallowing a squash refusal; and decideRevert's parent re-check printing
  `tail -40` of a test log, twenty-eight trailing `ok` lines, under a verdict of `fail` (#744), which
  turned "revert this push" into "leave main red, reason recorded as considered" for forty minutes. A
  truncation that succeeds produces a plausible number, and a plausible number is indistinguishable
  from a small result. Write the report to a file, read its line count, then quote from it.
- **If a guard refused it, refuse the dispatcher and escalate.** `row-claim` refused #677 under B2;
  the dispatcher said take it anyway; `worker-capture` refused the dispatcher and put it to `ceo`.
  That is the standing rule for every worker: a peer's instruction is not an override of a refusal,
  and a hand-applied label to route around a claim gate is a hand claim whatever the reason.
- **B2 (one PR in flight) does not hold when every failing assertion on the PR, deduplicated across
  jobs and read from the newest run per check, lies outside the PR's own diff and has a row on
  main.** #722 was red on three classifier assertions that #718 put on trunk; holding its worker
  idle would have stopped every worker at once for one defect. The measurement goes on the PR as a
  comment before the next claim; `row-claim --blocked-by=#N` (#741) refuses without it. Removing the
  cause from main clears every affected PR at once and leaves no exception to remember, which is
  why the dispatcher reverted #718 rather than releasing B2 for #722.

## TWO RULES FROM 2026-09-09: THE FOLD TEST, AND THE RUNWAY WINDOW

**The fold test, for every sweep row.** Ask of each instance: *can this be fixed on its own, with its own
acceptance?* If yes, it is its own row and the sweep cites it; the sweep is for what is left after every
findable instance has been taken out of it. Folding a fixable defect into a sweep is how the defect waits
for the sweep (#655, with #658 as the live case). A sweep's population is sized against the tree before
the row is written, its count is ASSERTED by the row's acceptance and never merely printed, and "empty by
construction" is the phrase that decides whether a green test proved anything (#633).

**The runway window, the dispatcher's only power over other sessions' PRs.** Under strict protection a
PR must be green and current at one instant; the train's carry pushes, which restarts CI (~5 minutes);
merges land every ~4 minutes; so the act that makes a PR mergeable invalidates its green, and a PR can
stay green-and-behind indefinitely (#627: five green heads, never merged). When a PR has gone
green-then-behind three times, the dispatcher may hold every other armed PR for one cycle (label plus
disarm, read back from the API), let the starved one land, and release each hold with its reason
printed. Conditions: declared in the table with which PRs were held and why; never for the dispatcher's
own PRs without saying so in the same message; never pre-emptively, because a remedy used before its
condition is met is how a remedy stops being believed. The merge queue at the org transfer (#156) must
test the queued group once and merge without re-carrying each PR, or this loop survives under a new name.

## Review verdicts — the convention every session parses

A review is a comment on the pull request whose first line is exactly one of:

```
**Review of #<n> at `<head8>`, by <session>: convinced.**
**Review of #<n> at `<head8>`, by <session>: not convinced — <one sentence naming the blocker>.**
```

`<head8>` is the first eight characters of the head the reviewer actually read. **The sha is there because
a verdict is on a head, never on a PR:** a commit pushed after the verdict returns the PR to unreviewed,
and the author's timer, the org clock and `ceo`'s heartbeat all decide "reviewed or not" by matching the
current head's sha and the verdict word, never the opening phrase. The author marks the PR ready on
`convinced`; a reviewer never arms or merges. Recorded here on 2026-09-12 (#1096) because until then the
convention lived only in session cron prompts and #912 comments, which a new session cannot read.

## The contingency drill

**The acceptance test for this whole page, and it is a command, not a judgement:** a fresh clone in a
temp directory, using ONLY this page and the role files it links, produces the first message for every
agent — with no reference to anything outside the repo. If a step needs something only this machine has,
the drill has found a real gap, and that is the result, not a failure of the drill.

```
mkdir -p /tmp/a11y-reconstitution-drill && cd /tmp/a11y-reconstitution-drill
git clone <this repo's GitHub URL> checkout && cd checkout
cat docs/roles/README.md          # this page, from the fresh clone
```

**If any step of the drill shells out to `git` itself, it must scrub `GIT_DIR`, `GIT_WORK_TREE` and
`GIT_INDEX_FILE` from the child's environment first, or run with a hand-built `env` that omits them.**
Found the hard way the same day this page was written: git exports `GIT_DIR` into every hook's
environment, and a git call made with only `cwd` set (no scrubbed `env`) follows `GIT_DIR` instead —
operating on whatever repository the CALLER happened to be inside, not the fresh clone the drill just
made. A bring-up script that silently targets the operator's own checkout instead of the clone it was
meant to test is the worst possible version of this bug, because it would look like it worked.

Then, for each row in the roster table above: open its linked file, confirm it exists and states its own
lane/reporter/ban, and copy its "first message" from the section above. **Run
`npx tsx --test packages/lab/src/packaging/roles-readme.test.ts`** to have the same check done
mechanically — it asserts every agent named in this table has a working link, and that every linked file
declares its own name, its lane, its reporter, and the ban.

**Run this drill for real, not as a thought experiment**, per `ceo`'s own condition that this IS the
acceptance test. Findings from the run performed while writing this page:

- **"Get `npm test` green" is the wrong instruction for this drill, and it must never appear as one.** A
  fresh clone has no `runs/` at all, so every corpus-reading check skips HONESTLY there — `worker-capture`'s
  own guard makes that skip explicit and reason-bearing rather than silent, and is what to point at rather
  than re-describing. But a fresh clone can also surface a REAL, pre-existing gap unrelated to being fresh
  (found the same night: a coverage guard reading captures at the wrong nesting level for 29 of ~5,400 real
  ones, invisible to it structurally, not because they are stale). The tempting fix for a red suite is
  always to make the failing check pass — here that would mean re-exempting the field the guard exists to
  watch, which goes green by making the guard blind. The drill's own checklist must say WHICH failures are
  expected in a fresh clone and why, never "make it green" — the identical distinction this repo's own
  ready-queue vacuity fix drew between a check that is broken and one that is correctly reporting an empty
  or partial state.
- The clone alone is sufficient to read this page and every role file that already exists — no
  machine-specific state was needed for that half.
- **Running the JS suite alone creates no `runs/`.** `runs/unclosable-vetoes.json` is written by the
  PYTHON leg specifically (`PYTHONDONTWRITEBYTECODE=1 .venv/bin/pytest ... packages/*/tests`) — reproduced
  directly in this drill's own clone: no `runs/` existed beforehand, `npm test`'s JS portion left none
  behind, and linking in a `.venv` and running the Python tests alone produced
  `runs/unclosable-vetoes.json`, 2823 bytes, from a clean tree with no corpus at all. So a fresh clone with
  no `.venv` cannot reproduce this (the Python leg honestly skips, as it should), but ANY environment that
  already has one — every operator's laptop, this Mac included — grows a `runs/` the moment its test suite
  runs, which would defeat a naive `existsSync` check expecting either "no `runs/`" or "a real corpus" and
  nothing in between. It is `worker-capture`'s unit to fix (the export/build-realism path this touches is
  in that lane), not this page's — named here because the drill is exactly where it would be rediscovered
  next, and rediscovering it costs more than naming it once.
- The two credentials are, as designed, NOT satisfiable from the clone — confirming the "described, never
  printed" section above is not just caution, it is the actual boundary of what a clone can reconstitute.
  `orchestrator` and the fleet/lab-touching half of this org cannot be brought up from a fresh clone alone;
  only the repo-visible half (`dispatcher`, the five workers, `ceo`) can.

## A GATE THAT READS `runs/` IS NOT YOURS TO REPORT

**Ruled 2026-09-06.** `rules:gate`, `rules:coverage`, `check-signals`, `corpus:starvation`,
`scorer:shortcuts` and anything else reading `runs/` give a VERDICT only when the agent driving the fleet
and the lab runs them — against a corpus just fetched, or on the lab, which owns the authoritative one.

**Anyone else may run one as a PRE-CHECK**, to decide whether a change is worth handing on. **Never as a
reported result**, and never in an acceptance section as though it settled anything.

The reason is measured rather than procedural. `runs/` in any checkout is a copy only as fresh as its last
sync — one measured here was 89 hours old and carried neither `focusEvents` nor `baselineWaitedMs`, so a
sweep across it found zero of the two keys it was written to find. **A gate run there reports cleanly
having examined a corpus that no longer exists.** The pre-push hook already SKIPS the corpus-dependent
checks loudly for exactly this reason, and calls that honest rather than passing quietly.

**So an issue's acceptance may name a `runs/`-reading gate, and must say who runs it.**

> **Moved here from `CLAUDE.md` on 2026-09-06 (issue #52), where it had been a deliberately temporary
> home.** It belongs here because it governs **who may report a gate result**, which is role territory —
> `CLAUDE.md` is operational instruction for working ON the repository. The move was blocked for a day
> because it needs a `CLAUDE.md` deletion, and two sessions correctly declined to make one on a peer's
> request; it landed once the owner delegated that authority explicitly.
