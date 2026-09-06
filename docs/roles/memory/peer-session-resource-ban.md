---
name: peer-session-resource-ban
description: The verbatim resource ban and worktree setup every peer-session brief on this repo must carry.
metadata:
  type: feedback
---

Every brief I send a peer session working on a11y-witness carries this, verbatim. It is not boilerplate:
each banned command reaches a single shared resource whose guards turn a collision into a silent wrong
answer rather than an error.

> Do not run anything that reaches the fleet or the lab: no `fleet:*`, no `lab:*`, no `training:capture*`,
> no `worker:*`, no `evidence:check`, no `gate:stability`, no `capture:check`. Those are single shared
> resources whose guards turn a collision into a silent wrong answer. `runs/` here is my local copy shared
> between the worktrees: read it freely, and prefer not to write it so peers see the same bytes — but it is
> not the corpus, and a stale local copy is not a disaster. If a task seems to need one of these, stop and
> message me; do not find a way round it.

**THE `runs/` CLAUSE WAS WRONG UNTIL 2026-09-06 and said "it is a symlink onto the real corpus and it is
shared".** The main checkout's `runs/` is a plain LOCAL directory — a laptop copy — and the authoritative
corpus lives on `a11y-lab` at `/opt/a11y/runs`, reachable only through `lab:*`, which peers cannot run. Only
the peer WORKTREES symlink, and they symlink to my copy. A peer wrote a derived file into it while checking
their own change rendered, disclosed it immediately, and could not have reasoned their way out because the
reason I gave them was false. **A rule with a wrong reason attached is one people correctly stop trusting** —
the ban is still right, the justification was not.

**Setup, done by me and not by them**, so the fleet-affecting git state stays with one driver:

```
git worktree add ../a11y-wt-<name> -b agent/<branch>
cd ../a11y-wt-<name> && npm install && ln -s <main>/runs runs && ln -s <main>/.venv .venv
```

`.gitignore` carries `/runs` without the trailing slash precisely because a symlink is not a directory —
the lab already relies on this. `core.hooksPath` is relative, so both git hooks follow into the worktree.

**COMMIT INCREMENTALLY — ask for this in every brief.** A peer working for hours with nothing committed
is invisible: `git rev-list --count main..<branch>` reads 0 and the only state I can see is `main`. On
2026-09-06 that cost a wrong escalation — I told the CEO "2.4.7 has no positives", which was true of
`main` and stale about the peer's working tree, where the fix already existed.

**CHECK THE BRANCH NAME IS UNCLAIMED — added 2026-09-06 after two peers did one unit.** Two sessions
reported the same two commits on `agent/audit-doc-truth`. Ask every peer to run
`git fetch && git branch -r --list 'origin/agent/*'` before starting and to message me if the name already
has commits. That check does not depend on my dispatch being right, which is where the fault actually was.

**Three things to state in every brief besides the ban:** the acceptance test named in advance as a
COMMAND, the two or three CLAUDE.md sections that bound the work, and whether the branch may merge
immediately — a worker-file change makes all ten machines stale, so it must be held until any running
capture finishes.

**They commit to their own branch and never merge or push.** I review, run the corpus-dependent gates in
the main checkout where `runs/` is real, then merge.

See [[orchestrating-peer-sessions]] for why the partition is by resource and why a hierarchy would cost
more than it adds, and [[verify-a-peers-load-bearing-claim]] for which of their claims I re-check myself.
