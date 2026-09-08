#!/usr/bin/env node
// @ts-check
// command: push every armed, green-or-running PR up to main's new tip after a merge lands
// AFTER A MERGE, PUSH EVERY ARMED, GREEN-OR-RUNNING PR UP TO main's NEW TIP -- C2, #416's sibling.
//
// `main`'s branch protection runs with `strict=false` (#277), so GitHub completes an armed merge the
// instant `gate` is green for the head it has RECORDED, with no requirement that the head still contains
// `main`'s current tip. That is what makes arming safe at all (`mergeSafety` refuses the shape where a
// STALE head would otherwise slip through) -- but it also means every OTHER open, armed PR is now behind
// by one more merge, and nothing pushed to it. Left alone, each of those PRs merges on an increasingly
// stale head until its own `gate` run happens to catch a real conflict, which is `queue-stalled.mjs`'s
// entire subject -- reported, never fixed. This job is the fix half: it runs `gh pr update-branch` itself
// so the queue narrows towards `main`'s tip after every merge instead of drifting away from it.
//
// ## `git merge-base --is-ancestor`, never `mergeStateStatus` -- the same instrument choice as #361
//
// `queue-stalled.mjs`'s own header already measured this: GitHub computes `mergeable`/`mergeStateStatus`
// LAZILY and it can read `UNKNOWN` at the exact moment a check needs a real answer. Whether a PR's head
// already contains `main`'s current tip is answerable locally and synchronously with
// `git merge-base --is-ancestor <main> <head>` -- exit 0 means it does (nothing to update), non-zero means
// it does not (behind, or diverged; either way a push helps).
//
// ## Why a PR whose `gate` is FAILING is left alone
//
// "Green-or-running" is deliberate, not "armed" alone. A PR failing for a reason that has nothing to do
// with being behind does not need a stale-main push -- it needs a fix -- and updating it anyway would
// restart a CI run for no reason and bury the real failure under a fresh one. `gateConclusion === null`
// (still running, or not yet checked) is treated the same as `SUCCESS`: a push under it is harmless,
// GitHub will simply evaluate the new head when it runs.
//
// ## NO `GITHUB_TOKEN` FALLBACK HERE, UNLIKE `arm`/`sweep` -- read the workflow step before changing this
//
// Both existing jobs fall back to `GITHUB_TOKEN` with a warning when `A11IGN_BOT_TOKEN` is absent, because
// arming still ACHIEVES ITS IMMEDIATE GOAL either way (GitHub completes the merge either way) and only the
// downstream attribution/event-firing degrades. This job cannot make that trade: GitHub does not fire
// `pull_request: synchronize` for a push made with `GITHUB_TOKEN`, so updating a branch under it would
// give the PR a NEW head with NO check run ever triggered for it -- required status checks then wait
// forever, which is worse than leaving the PR alone at its old, still-checked head. So the workflow step
// SKIPS this script entirely when the secret is absent, rather than calling it with a fallback token.
//
// Exit codes are the contract:
//   0  the queue was examined -- zero or more PRs were updated, and every skip was reported with its reason
//   1  at least one PR could not be updated. NAMED, never counted.
//   2  a lookup failed. INCONCLUSIVE, never "fine".
import { execFileSync } from "node:child_process";
import { refuseUnknownFlags } from "../packages/worker-fleet/src/cli-flags.mjs";
import { sandboxGitEnv } from "./git-env.mjs";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const EXIT = { EXAMINED: 0, COULD_NOT_UPDATE: 1, CANNOT_ASK: 2 };

/**
 * What GitHub sends instead of a null timestamp on a check run that has not finished.
 *
 * ONE CONST, because this file spent a morning on one fact written in two places. It was defined twice --
 * once in `headQuietSeconds`, once in `newestConclusion` -- and the two readers answer the same question:
 * *has this run finished?* The next person to learn that GitHub emits some other sentinel would fix one
 * and not the other, and the two would then disagree about whether a run is running, which is the exact
 * shape (#498, #500) that made a green PR invisible for hours.
 */
export const ZERO_DATE = "0001-01-01T00:00:00Z";

/**
 * HOW LONG SINCE GITHUB SAW THIS HEAD, in seconds — or `null` when nothing on the head can say.
 *
 * ## The source is the OLDEST check run's start, and it is named rather than assumed
 *
 * `ceo`'s row offered two candidates and they are not the same thing. A commit's `author` and `committer`
 * dates are supplied by the pusher's machine and can precede the push by days, so a stale-dated commit
 * would read as quiet the instant it arrived -- the opposite of what this protects. The `synchronize`
 * event is authoritative but needs a second API call per PR, on a timeline the sweep does not fetch.
 *
 * The check runs are already in hand and carry GITHUB'S OWN CLOCK: a push creates a workflow run, and its
 * `startedAt` is when GitHub saw the head. The OLDEST such start is the closest thing on the head to
 * "when this head appeared", because later runs are re-runs and reruns of superseded pushes.
 *
 * DRIVEN AGAINST THE REAL API before being relied on (2026-09-08, PR #505):
 *
 *     {"name":"arm","status":"IN_PROGRESS","startedAt":"2026-09-08T08:50:31Z",
 *      "completedAt":"0001-01-01T00:00:00Z","conclusion":""}
 *
 * -- which is also where the zero-date and empty-conclusion traps above were found. A poll against a
 * shape nobody verified is this repository's most expensive habit, and the shape here is not the obvious
 * one twice over.
 *
 * NULL WHEN NOTHING CAN SAY, never a number. A head with no runs at all -- brand new, or a workflow that
 * never dispatched -- cannot be shown to be quiet, and the caller must not read "no evidence" as "quiet
 * enough".
 *
 * @param {{startedAt?: string | null}[] | null | undefined} runs
 * @param {Date} now
 * @returns {number | null}
 */
export function headQuietSeconds(runs, now) {
  const starts = (runs ?? [])
    .map((run) => run?.startedAt)
    .filter((at) => Boolean(at) && at !== ZERO_DATE)
    .map((at) => new Date(/** @type {string} */ (at)).getTime())
    .filter((ms) => Number.isFinite(ms));
  if (starts.length === 0) return null;
  return (now.getTime() - Math.min(...starts)) / 1000;
}

/**
 * How long a head must have been still before the train may push to it.
 *
 * NOT A TUNING KNOB, and both halves of the trade belong here. Long enough that an author mid-push is not
 * interrupted: the sync lands, their next push is rejected non-fast-forward, and they must merge a commit
 * the pipeline made under them -- which happened twice on #485 tonight. Short enough that a slow CI on an
 * ABANDONED head still gets synced: if this were an hour, a PR whose author has gone would sit behind main
 * until somebody noticed, which is the stall #498 caused by a different route.
 *
 * Five minutes is above the time between a push and its first workflow run (seconds) and far below any
 * plausible gap in an active push sequence.
 */
export const HEAD_QUIET_SECONDS = 300;

/**
 * PURE. Should this PR be pushed up to main's current tip?
 *
 * @param {{ armed: boolean, gateConclusion: string | null, behind: boolean,
 *           quietSeconds?: number | null }} input
 * @returns {{ update: boolean, reason: string }}
 */
export function updateBranchDecision({ armed, gateConclusion, behind, quietSeconds }) {
  if (!armed) {
    return { update: false, reason: "not armed for auto-merge -- not this job's concern" };
  }
  if (gateConclusion !== null && gateConclusion !== "SUCCESS") {
    return {
      update: false,
      // #498: NAME THE READING, NOT JUST THE VERDICT. This line used to say only "a failing PR needs a
      // fix", which addresses the AUTHOR -- so when the sweep skipped two green PRs on a stale
      // conclusion, the log read as work correctly handed back rather than as the sweep being wrong.
      // Saying which run this conclusion came from means the next wrong skip is falsifiable from the log
      // alone: open that run and see whether it is the newest.
      reason: `this sweep read gate = ${gateConclusion} as the NEWEST gate run on the head`
        + " -- a failing PR needs a fix, not a stale-main push."
        + " If that PR looks green, check whether a newer gate run exists and report it (#498's shape)",
    };
  }
  if (!behind) {
    return { update: false, reason: "already contains main's current tip -- nothing to update" };
  }
  // #488: A RUNNING GATE MAY MEAN "THE AUTHOR IS PUSHING RIGHT NOW". Syncing under them lands a merge
  // they did not make, their next push is rejected non-fast-forward, and they must merge the pipeline's
  // commit to continue -- twice on #485 tonight. The hand rule is "the author holds the branch while its
  // check is red"; this is that rule in the predicate.
  //
  // ONLY when the gate is still running. A GREEN gate means CI has finished, so nobody is mid-push, and
  // narrowing that case would reintroduce #498's stall by a different route: a sweep that syncs too
  // little is indistinguishable from a quiet queue.
  if (gateConclusion === null) {
    if (quietSeconds === null || quietSeconds === undefined) {
      return { update: false,
        reason: "gate is still running and NOTHING ON THE HEAD SAYS WHEN IT APPEARED -- no check run "
          + "carries a start time, so this cannot be shown to be quiet. Refusing rather than guessing: "
          + "the cost of waiting a cycle is a cycle; the cost of pushing under an author is their next "
          + "push rejected and a merge they did not make" };
    }
    if (quietSeconds < HEAD_QUIET_SECONDS) {
      return { update: false,
        reason: `SKIPPED -- head moved ${Math.round(quietSeconds)}s ago and the gate is still running, `
          + `under the ${HEAD_QUIET_SECONDS}s quiet window. An author mid-push holds their own branch` };
    }
  }
  // THE SUCCESS PATH NAMES THE QUIET WINDOW WHEN THAT IS WHY IT IS ELIGIBLE. The window is this change's
  // whole subject, so a sync that happens BECAUSE of it must say so -- otherwise a future wrong sync
  // cannot be diagnosed from the log, which is precisely #498's failure read from the other side: there
  // the skip line named the author instead of the reading. This is the line somebody will be looking at
  // when they ask "why did it push under me?".
  const quietNote = gateConclusion === null && typeof quietSeconds === "number"
    ? `; the head has been quiet ${Math.round(quietSeconds)}s, over the ${HEAD_QUIET_SECONDS}s window`
    : "";
  return { update: true,
    reason: `armed, gate green or still running, and behind main's current tip${quietNote}` };
}

/**
 * PURE. The conclusion of the NEWEST check run named `name` on a head, or `null` if there is none.
 *
 * #498: A SUPERSEDED CHECK RUN STAYS ATTACHED TO THE HEAD FOREVER, AND THIS READ TOOK THE FIRST ONE.
 * The previous line was `runs.find((c) => c.name === "gate")?.conclusion ?? null`, and GitHub's
 * `statusCheckRollup` UNIONS every check run recorded against the head -- superseded ones included. A
 * `ci.yml` run is cancelled whenever a second push supersedes it, which is the ordinary shape of an
 * active branch, and a cancelled run leaves a FAILED `gate` on that head permanently. So `.find()`
 * returned that stale failure at every later sweep and the PR was skipped as failing for ever.
 *
 * Measured 2026-09-08 08:01:14Z, on the only two open PRs at the time -- both green, both skipped:
 *
 *   #490 head 10e010ed   07:52:28 failure (ci CANCELLED) | 07:55:07 failure (ci CANCELLED) | 07:58:10 SUCCESS
 *   #485 head b9b9a0ee   07:32:35 failure (ci CANCELLED) | 07:35:34 SUCCESS
 *
 * #485 was 16 commits behind `main` and #490 was 6, with nothing for either author to fix, while the
 * skip line named the AUTHOR as the person who must act. That is the failure this repository calls a
 * silent wrong answer: not a stall anyone can see, but work reassigned to somebody with nothing to do.
 * And it degrades with load -- the busier the queue, the more runs are cancelled, the more PRs go
 * invisible to the one mechanism that keeps them current.
 *
 * ORDER IS NOT ASSUMED. A rollup's array order is not documented to be chronological; it merely happened
 * to put the oldest first here, which is the only reason this was visible at all. So the newest is
 * chosen by TIMESTAMP -- `completedAt` when present, else `startedAt` -- and a run carrying neither
 * loses to any run that has one, because an untimed entry cannot be shown to be newer than a timed one.
 * With no timestamps anywhere the last entry wins, which is at least the opposite of the old behaviour
 * and is pinned by a test rather than left to chance.
 *
 * A STILL-RUNNING newest run reports `null`, exactly as an absent one does, and `updateBranchDecision`
 * already treats `null` as "green or not yet answered" -- a push under it is harmless. That branch is
 * deliberately unchanged by this fix; it is #488's subject, not this one's.
 *
 * @param {{name?: string, conclusion?: string | null, completedAt?: string | null,
 *          startedAt?: string | null}[] | null | undefined} runs
 * @param {string} name
 * @returns {string | null}
 */
export function newestConclusion(runs, name) {
  const matching = (runs ?? []).filter((run) => run?.name === name);
  if (matching.length === 0) return null;
  // THE ZERO DATE IS ABSENCE WEARING A TIMESTAMP -- #488, measured against the real API.
  // GitHub reports an IN_PROGRESS check run with `completedAt: "0001-01-01T00:00:00Z"`, NOT null. `??`
  // does not treat that as missing, so a still-running run sorted as the OLDEST thing on the head and
  // lost to any completed one -- including the stale failure #498 was written to stop winning. Measured:
  // a head with a 07:32 completed FAILURE and an 08:50 IN_PROGRESS gate read FAILURE.
  //
  // That is #498's own defect surviving its own fix, and it lands exactly where this row lives: an author
  // who has just pushed HAS a running gate, which is the case #488 is about.
  const real = (/** @type {string | null | undefined} */ value) =>
    (value && value !== ZERO_DATE ? value : null);
  const stamp = (/** @type {{completedAt?: string | null, startedAt?: string | null}} */ run) =>
    real(run.completedAt) ?? real(run.startedAt) ?? "";
  const newest = matching.reduce((best, run) => (stamp(run) >= stamp(best) ? run : best));
  // AND AN EMPTY CONCLUSION IS "NOT YET ANSWERED", NOT A VERDICT. GitHub reports an IN_PROGRESS run as
  // `conclusion: ""`, and `?? null` keeps the empty string -- which `updateBranchDecision` would then read
  // as "not SUCCESS" and skip the PR as failing. `|| null` collapses both spellings of absence to the one
  // the caller already handles. Measured on the real API alongside the zero date above; the two arrive
  // together on every running check, so fixing one without the other just moves the wrong answer.
  return newest.conclusion || null;
}

/**
 * Runs the real `git merge-base --is-ancestor`, never re-implements it. `runGit` is injectable so this is
 * tested against a real exit status rather than a guessed shape.
 *
 * @param {string} base
 * @param {string} headSha
 * @param {(args: string[]) => { status: number }} runGit
 * @returns {boolean} true when `head` does NOT already contain `base`'s tip
 */
export function isBehind(base, headSha, runGit) {
  return runGit(["merge-base", "--is-ancestor", base, headSha]).status !== 0;
}

/** @param {string[]} args */
function runGitForReal(args) {
  try {
    execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: sandboxGitEnv() });
    return { status: 0 };
  } catch (cause) {
    const err = /** @type {{ status?: number }} */ (cause);
    return { status: err.status ?? 1 };
  }
}

/** @param {string[]} args */
const gh = (args) => execFileSync("gh", args, { encoding: "utf8" }).trim();

function main() {
  refuseUnknownFlags([], { entry: import.meta.url, command: "node scripts/update-branch-sweep.mjs" });

  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) {
    console.error("CANNOT ASK: GITHUB_REPOSITORY is unset, so there is no repo to examine.");
    process.exit(EXIT.CANNOT_ASK);
  }

  let prs;
  try {
    prs = JSON.parse(gh(["pr", "list", "--repo", repo, "--state", "open", "--base", "main", "--limit", "100",
      "--json", "number,headRefOid,autoMergeRequest,statusCheckRollup"]));
  } catch (cause) {
    console.error(`CANNOT ASK: listing open PRs failed -- ${cause instanceof Error ? cause.message : cause}`);
    process.exit(EXIT.CANNOT_ASK);
  }

  if (prs.length === 0) {
    console.log("UPDATE-BRANCH: no open PRs against main.");
    process.exit(EXIT.EXAMINED);
  }

  // `actions/checkout@v4` only brings the pushed ref (main) -- every OTHER open PR's head must be fetched
  // before `git merge-base` can compare against it, same as `queue-stalled.mjs`.
  try {
    execFileSync("git", ["fetch", "origin", "--quiet", "+refs/heads/*:refs/remotes/origin/*"],
      { stdio: "pipe", env: sandboxGitEnv() });
  } catch (cause) {
    console.error(`CANNOT ASK: fetching branch tips failed -- ${cause instanceof Error ? cause.message : cause}`);
    process.exit(EXIT.CANNOT_ASK);
  }

  const failed = [];
  let updated = 0;
  for (const pr of prs) {
    const armed = pr.autoMergeRequest != null;
    const gateConclusion = newestConclusion(pr.statusCheckRollup, "gate");
    const behind = isBehind("origin/main", pr.headRefOid, runGitForReal);

    const quietSeconds = headQuietSeconds(pr.statusCheckRollup, new Date());
    const { update, reason } = updateBranchDecision({ armed, gateConclusion, behind, quietSeconds });
    if (!update) {
      console.log(`UPDATE-BRANCH: #${pr.number} SKIPPED -- ${reason}`);
      continue;
    }

    try {
      gh(["pr", "update-branch", String(pr.number), "--repo", repo]);
      console.log(`UPDATE-BRANCH: #${pr.number} UPDATED -- ${reason}`);
      updated += 1;
    } catch (cause) {
      console.log(`UPDATE-BRANCH: #${pr.number} FAILED -- ${cause instanceof Error ? cause.message : cause}`);
      failed.push(pr.number);
    }
  }

  console.log(`UPDATE-BRANCH: ${updated} updated, ${failed.length} failed, ${prs.length - updated - failed.length} skipped.`);

  if (failed.length > 0) {
    console.error(`UPDATE-BRANCH: could not update ${failed.length}: ${failed.join(" ")}`);
    process.exit(EXIT.COULD_NOT_UPDATE);
  }
  process.exit(EXIT.EXAMINED);
}

// The same entry guard `merge-guard.mjs`/`auto-arm-sweep.mjs`/`queue-stalled.mjs` use: a bare `file://` +
// argv[1] comparison misreads a path with a space in it and a symlinked checkout, and reports the module
// as "imported, not run".
if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) main();
