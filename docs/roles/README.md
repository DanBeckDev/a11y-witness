# If this machine is lost, can the organisation be reconstituted from the repo alone?

**Board finding, 2026-09-06: no.** Every role tonight except `dispatcher` existed only in this machine's
session history — nowhere written down, nowhere a fresh agent could read to become `ceo`, `orchestrator`,
or any of the five workers. Lose this Mac and the git history, the tests, and the corpus survive; the
ORGANISATION does not, because nothing states who does what, who reports to whom, or what each role must
never touch.

**This page and the eight role files it indexes are the fix.** Each agent wrote its own file — the worker
filling a lane knows that lane better than anyone briefing it — and this page is the piece that makes the
set a SYSTEM rather than eight unrelated documents: the bring-up order, the first message for each agent,
where state actually lives, and the enforcement that keeps the set complete.

## The roster

| role | agent name | file | reports to |
|---|---|---|---|
| Chief | `ceo` | [`ceo.md`](./ceo.md) | — |
| Fleet/lab driver ("the lead") | `orchestrator` | [`orchestrator.md`](./orchestrator.md) | `ceo` |
| Worker-loop dispatcher | `dispatcher` | [`worker-loop-orchestrator.md`](./worker-loop-orchestrator.md) | `orchestrator` (utilisation line to `ceo`) |
| Product loop | `product-manager` | [`product-manager.md`](./product-manager.md) | `ceo` |
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

| **What is open** — every work item, its acceptance command, its region, and which are release blockers | **GitHub Issues, the Project board and the `v0.1.0` milestone** on `DanBeckDev/a11y-witness` | Survives the loss of this machine, which is why it moved there on 2026-09-06. `docs/backlog.md` and `docs/known-gaps.md` stay as the RECORD of lessons and are NOT the tracker — the backlog contradicted itself (it says a closed row is deleted, and keeps them struck through) and five rows checked that day were already closed. Filed as issue #19 rather than fixed silently. |
| **The daily board report's schedule** | **A launchd agent on this Mac only** — `bash scripts/install-board-report.sh`, one command, idempotent | A REAL contingency, not a detail. It posts to issue #20 at 08:00 Europe/London and **cannot be moved to a GitHub runner**: a runner only ever sees `origin/main`, so the merge count would miss anything merged locally and unpushed and the push-state line would read *"level, checked"* every day whether or not it was true — the two lines that exist to catch a push hold. A scheduled report confidently wrong about the thing it was built to see is worse than a manual one. **If this machine stops being the control plane, the report stops with it**; issue #20's body says a missing edition is a defect in this process, not a quiet period. Full notes: [`docs/board/README.md`](../board/README.md). |
| The last gate result and the fleet-hours total the report quotes | **`docs/board/reported.json`** in the repo | Recorded by the agent that RAN the command, with its verbatim output. The report reads no gate itself — a checkout's `runs/` is only as fresh as its last sync. It REFUSES a fleet-hours total that does not name a finished run, because a total whose run is unstated cannot be checked or compared with the next edition. |

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
