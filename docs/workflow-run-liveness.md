# Did CI actually run before this commit reached `main`? (#118)

Three guards prove CI is correctly **configured**: `board-schedule.test.ts` (the crons exist and are
gated on London's clock), `workflow-path-coverage.test.ts` (#70 — every source directory is reachable by
some filter, and an unfiltered backstop exists), and `npm test` (the code that decides all of this is
right). None of them can ask whether a run any of that machinery expected actually **happened**.

Measured 2026-09-06: that gap was silent and real. Two commits reached `main` outside their PR, `ci.yml`
arrived and `lint.yml` (retired the same day) went, and every one of the three guards above stayed green
throughout. And separately, the same night: PR #148's base was another open PR's branch rather than
`main`, so `ci.yml`'s `pull_request: branches: [main]` trigger never fired at all — `mergeStateStatus`
read `CLEAN/MERGEABLE`, the check-run list was empty, and it was the *greenest PR on the board*. It was
caught by a person noticing the check-run list was empty rather than green.

## The tool

`scripts/merge-guard.mjs` (#161) already answers the run-half of this question correctly, for one PR
given its number — it reads check **runs** for a head sha, never `mergeStateStatus`, because a required
context that never ran is not a failing check, it is *no check*, and `mergeStateStatus` cannot tell the
two apart.

```bash
npm run workflow:liveness -- --sha=<commit>   # was the PR that produced this commit actually tested?
```

`scripts/workflow-run-liveness.mjs` generalises that into an automatic check for **any commit that has
already reached `main`** — the shape that actually failed silently. Given a commit sha, it asks GitHub
which pull request produced it (`commits/<sha>/pulls`) and reuses `merge-guard.mjs`'s own
`lookupRequiredContexts`/`lookupCheckRuns`/`checkReasons` to decide whether that PR's required checks ever
actually ran and concluded.

**Three outcomes, never two** — the same discipline `merge-guard.mjs` established and this reuses rather
than re-derives:

- **TESTED** — a pull request produced this commit, and every required context ran and concluded.
- **NOT TESTED** — no pull request is associated with this commit at all, *or* its required checks are
  missing, never ran, or failed. These are named separately in the output because they need different
  fixes: no PR means someone bypassed the PR flow; a PR with missing checks means the flow ran and the
  gate still let something through.
- **CANNOT TELL** — a lookup failed. Never reported as healthy: a rate limit or a network failure must
  not read as a clean pipeline, in the one place recording what actually shipped.

## Why it runs on push to `main`, never on a schedule

The watchdog is a `continue-on-error` step in `.github/workflows/trunk.yml`'s `watchdogs` job (#901;
until 2026-09-10 it was a workflow of its own), which triggers on `push: branches: [main]`, the same choice
`board-liveness.yml` and `npm-token-liveness.yml` already made and for the identical reason: a watchdog
that is itself scheduled has the disease it is watching for. GitHub disables a scheduled workflow after
60 days without repository activity, silently, with no run and no red mark — and `push` cannot be
disabled by inactivity, because a push **is** the activity.

`continue-on-error: true`, also matching those two siblings: this job's finding is about a commit that
has already merged, not about anything the person who just pushed could have prevented. Failing the push
would put a red mark against an unrelated author's merge for a gap that opened before it.

## What this does not do

It does not decide whether CI is correctly **configured** — that is `board-schedule.test.ts`, #70 and
#109's trigger table, and they already own it. This only asks the question none of them can: given the
configuration, did the run it implies for this specific commit actually happen.
