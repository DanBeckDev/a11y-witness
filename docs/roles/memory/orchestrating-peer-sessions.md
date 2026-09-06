---
name: orchestrating-peer-sessions
description: "How to run several peer Claude sessions on this repo — partition by resource, the lateral split with `dispatcher`, one merge tree, and why review does not compose."
metadata:
  type: feedback
---

Dan runs several Claude Code sessions on this repo at once and asks me to orchestrate rather than implement.

**The organisation as of 2026-09-06: a `ceo` sets direction, a `dispatcher` owns the worker loop, I own
fleet, lab, `runs/`, gate diagnosis, cross-cutting review, and the CEO relationship. Five workers.**
`docs/roles/worker-loop-orchestrator.md` is the role's own file.

## Why the split, measured rather than felt

With five workers, ~30% of my day was deep work only I could do — diagnosing gate and capture output — and
~30% was briefing and merge queue anyone competent could do. **Every worker that finished waited on the
second while the first was in progress.** Five sat idle through a single gate read more than once. Work was
never the constraint: ~23 rows against 5 workers, and four of five units that day came from the workers'
own findings rather than my list.

**So more workers would have made it worse.** Add the second orchestrator first; scale workers against two
mouths, not one.

## The sentence the boundary is written on

> **First-pass review composes. Cross-cutting review does not.**

A per-branch reviewer checks a change does what it says. They cannot see that two independently correct
changes combine into a defect. Measured: one branch blurred `document.activeElement`, another made the
focus log live from document load and deleted the exception absorbing an opening orphan — together they
manufactured a false WCAG 2.4.7 finding. Both correct, both mutation-checked, either approvable alone.

So `dispatcher` merges what is self-contained and hands up three triggers: **a shared file another in-flight
unit owns, a cache key, or a probe another unit touches. When in doubt, hand up** — a held branch costs
minutes, a merged interaction costs a corpus.

## ONE AGENT COMMITS MERGES IN A GIVEN TREE, and the reason is the fleet guard

I landed a merge in the primary checkout while `dispatcher` held an uncommitted conflict resolution there.
**It vanished — clean `git status`, no error, looking exactly like no merge was ever attempted.** A
resolution is the one artefact with no branch of its own; it lives only between `git merge` and
`git commit`.

**`expectedWorkerCode()` hashes the WORKING TREE** (`worker-code-check.mjs`). So a half-resolved merge in
the primary checkout makes `assertFleetRunsThisCheckout` hash a state nobody intended — best case a refused
capture, worst case a whole run stamped against code that never existed, **and that one passes.** Losing a
resolution costs ten minutes.

**So: the primary checkout is the fleet-and-lab tree and stays clean. All merges happen in a worktree.**
I proposed keeping merges in the primary tree because `dispatcher` would "commit promptly"; they correctly
refused it as **a timing argument, not a guarantee**. Anything of mine that moves `main` goes through
`../a11y-wt-lead` and reaches them as a branch — which also closes the gap where my curation was invisible
to them until it landed.

## What a peer is better at than me, evidenced

- **Verifying a row is open**, because they are not mid-diagnosis when they do it. I dispatched three units
  at closed rows in one night; `dispatcher` caught two more before briefing them.
- **Reading my briefs rather than obeying them.** The collision check I put in every brief was
  `git branch -r --list 'origin/agent/*'` — agent branches here are never pushed, so it always answered
  "clear" and could never catch the collision it was added for. Found in `dispatcher`'s first hour.
- **Refusing my framing when it is wrong.** "Re-verified at HEAD" cannot see a finished-but-unmerged unit,
  and on a busy night three of six queue rows were in exactly that state. Verify against `origin/main`
  **plus every unmerged `agent/*` branch.**

## Still true, and still the foundation

- **Every unit's acceptance test is named BEFORE the work starts, and it is a COMMAND, not a judgement.**
- **Partition by RESOURCE, never topic or file.** A worktree isolates the checkout and nothing else.
- **A refutation is a good result.** Six units in one night ended that way and every one saved work.
- **Ask HOW a number was obtained, not whether it is right.**
- **Ask for the disagreement explicitly.** Most spec corrections came from the peers.
- **Nobody idle while a fleet-free row exists** — and "idle with reason: queue empty" is legitimate, since
  the honest queue is single-figure, not the twenty-three a self-contradicting page implied.

See [[peer-session-resource-ban]] for the standing text every brief carries, and
[[verify-a-peers-load-bearing-claim]] for which of their claims I re-derive myself.
