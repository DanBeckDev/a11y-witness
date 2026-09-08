#!/usr/bin/env node
// @ts-check
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
 * PURE. Should this PR be pushed up to main's current tip?
 *
 * @param {{ armed: boolean, gateConclusion: string | null, behind: boolean }} input
 * @returns {{ update: boolean, reason: string }}
 */
export function updateBranchDecision({ armed, gateConclusion, behind }) {
  if (!armed) {
    return { update: false, reason: "not armed for auto-merge -- not this job's concern" };
  }
  if (gateConclusion !== null && gateConclusion !== "SUCCESS") {
    return {
      update: false,
      reason: `gate concluded ${gateConclusion} -- a failing PR needs a fix, not a stale-main push`,
    };
  }
  if (!behind) {
    return { update: false, reason: "already contains main's current tip -- nothing to update" };
  }
  return { update: true, reason: "armed, gate green or still running, and behind main's current tip" };
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
    const gateConclusion = (pr.statusCheckRollup ?? []).find((/** @type {{name?:string}} */ c) => c.name === "gate")
      ?.conclusion ?? null;
    const behind = isBehind("origin/main", pr.headRefOid, runGitForReal);

    const { update, reason } = updateBranchDecision({ armed, gateConclusion, behind });
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
