#!/usr/bin/env node
// @ts-check
// #361: AN ARMED, GREEN, CONFLICTING PR SITS FOREVER, AND NOTHING SAYS WHY.
//
// Measured 2026-09-07 12:40Z, two of the eight open PRs:
//
//   #232  armed, gate=SUCCESS, standing since 04:45 (8 hours)    -- 6 files CONFLICT against origin/main
//   #281  armed, gate=SUCCESS, standing since 08:00 (4.5 hours)  -- 2 files CONFLICT against origin/main
//
// Twelve and a half PR-hours of two workers' finished work, invisible -- neither author was told, both
// found by hand. This is the gap `auto-arm-sweep.mjs` (#344) closed at the OTHER end: that sweep reports
// every PR it will not arm, with a reason. It says nothing about a PR it DID arm, because from its side
// arming succeeded -- GitHub then declines to complete the merge and tells nobody. Same hole, one step
// further along the queue.
//
// ## `mergeable` is not the instrument -- `git merge-tree` is
//
// GitHub computes `mergeable` LAZILY and it read `UNKNOWN` on both PRs at the moment of measurement, so a
// check keyed on `mergeable == "CONFLICTING"` would have reported neither. `git merge-tree --write-tree
// --name-only <base> <head>` answers directly and locally: exit 0 with a single tree-oid line on stdout
// means a clean merge is possible; exit 1 means real content conflicts, and stdout's first paragraph (up
// to the first blank line, after the tree-oid line) names exactly the conflicting paths. Verified against
// the real queue before writing this: PRs #232/#281/#181/#172 conflicted, #367/#371/#381 (this session's
// own, clean against `origin/main`) did not -- exit 0, stdout one line, no trailer.
//
// ## Three things this must get right, each with a wrong answer that looks correct
//
// 1. REPORT, NEVER ACT. No rebase, no branch update, no close. #258's collision -- `gh pr update-branch`
//    run on a PR its author was mid-rebase inside, reverted real work, and only `--force-with-lease`
//    stopped it -- is exactly the failure mode of "helpfully" resolving a conflict this script only names.
// 2. "WAITING FOR A CHECK" AND "CANNOT EVER MERGE" MUST NEVER PRINT THE SAME THING. A PR armed ten seconds
//    ago with `gate` still running is healthy. The signal is a conflict on an ALREADY-GREEN PR, not the
//    mere absence of a completed merge -- `stalledVerdict` below refuses to call anything stalled until
//    `gate` has actually concluded SUCCESS.
// 3. REACHABLE WITHOUT A SCHEDULE. GitHub disables scheduled workflows after 60 days of inactivity
//    (`board-liveness.test.ts`), and a stall reporter that fails by going quiet has the disease it
//    watches for. Rides the same `pull_request` trigger `auto-arm-sweep.mjs` does.
//
// A THRESHOLD, NOT AN INSTANT REPORT, on the conflict itself too: a PR whose `gate` concluded seconds ago
// may not yet reflect a `main` that just moved underneath it, and a conflict computed against a stale
// local view of `origin/main` is a false alarm waiting to happen. `DEFAULT_STALL_THRESHOLD_MS` (30
// minutes) is the same shape as `auto-arm-sweep.mjs`'s own "REPORT, never silently skip" -- except here
// the risk runs the other way, so the guard is against reporting TOO EARLY rather than not at all.
//
// Exit codes are the contract:
//   0  the queue was examined -- zero or more stalled PRs were named (STALLED alone is not a failure;
//      see the workflow step for what treats it as one)
//   2  a lookup failed. INCONCLUSIVE, never "fine".
import { execFileSync } from "node:child_process";
import { refuseUnknownFlags } from "../packages/worker-fleet/src/cli-flags.mjs";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const EXIT = { EXAMINED: 0, CANNOT_ASK: 2 };
export const DEFAULT_STALL_THRESHOLD_MS = 30 * 60 * 1000;

/**
 * PURE. Does this PR need reporting, and why? Never decides to act -- only to speak.
 *
 * @param {{ armed: boolean, gateConclusion: string | null, conflict: boolean, ageMs: number,
 *   thresholdMs?: number }} input
 * @returns {{ stalled: boolean, code: string, reason: string }}
 */
export function stalledVerdict({ armed, gateConclusion, conflict, ageMs, thresholdMs = DEFAULT_STALL_THRESHOLD_MS }) {
  if (!armed) {
    return { stalled: false, code: "NOT_ARMED", reason: "not armed for auto-merge -- not this check's concern" };
  }
  if (gateConclusion !== "SUCCESS") {
    return {
      stalled: false, code: "WAITING",
      reason: `gate has not concluded SUCCESS (${gateConclusion ?? "no conclusion yet"}) -- healthy, still `
        + "running or not yet checked",
    };
  }
  if (!conflict) {
    return { stalled: false, code: "HEALTHY", reason: "armed, green, no conflict -- waiting its turn" };
  }
  if (ageMs < thresholdMs) {
    return {
      stalled: false, code: "TOO_RECENT",
      reason: `conflict detected but only armed ${Math.round(ageMs / 60000)}m ago -- below the `
        + `${Math.round(thresholdMs / 60000)}m floor against a stale local view of origin/main`,
    };
  }
  return {
    stalled: true, code: "CONFLICTING",
    reason: "armed and green, but cannot ever merge as-is -- content conflicts against origin/main",
  };
}

/**
 * Runs the real `git merge-tree`, never re-implements its logic. `runGit` is injectable so the parsing
 * below is tested against captured, real output rather than a guessed shape.
 *
 * @param {string} base
 * @param {string} headSha
 * @param {(args: string[]) => { status: number, stdout: string }} runGit
 * @returns {{ conflict: boolean, files: string[] }}
 */
export function mergeTreeConflict(base, headSha, runGit) {
  const { status, stdout } = runGit(["merge-tree", "--write-tree", "--name-only", base, headSha]);
  if (status === 0) return { conflict: false, files: [] };
  // stdout's first paragraph is the tree-oid line followed by one conflicting path per line; the second
  // paragraph (Auto-merging.../CONFLICT (content): ... trailer) is not parsed -- the file list already
  // names what matters, and the trailer's wording is not a contract git makes.
  const [fileSection = ""] = stdout.split("\n\n");
  const files = fileSection.split("\n").slice(1).filter(Boolean);
  return { conflict: true, files };
}

/** @param {string[]} args */
function runGitForReal(args) {
  try {
    const stdout = execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { status: 0, stdout };
  } catch (cause) {
    const err = /** @type {{ status?: number, stdout?: string }} */ (cause);
    return { status: err.status ?? 1, stdout: err.stdout ?? "" };
  }
}

/** @param {string[]} args */
const gh = (args) => execFileSync("gh", args, { encoding: "utf8" }).trim();

function main() {
  refuseUnknownFlags([], { entry: import.meta.url, command: "node scripts/queue-stalled.mjs" });

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

  // Fetch every branch tip once, up front -- `actions/checkout@v4` only brings the triggering PR's own
  // head, and `git merge-tree` needs every OTHER open PR's head object present locally too.
  try {
    execFileSync("git", ["fetch", "origin", "--quiet", "+refs/heads/*:refs/remotes/origin/*"], { stdio: "pipe" });
  } catch (cause) {
    console.error(`CANNOT ASK: fetching branch tips failed -- ${cause instanceof Error ? cause.message : cause}`);
    process.exit(EXIT.CANNOT_ASK);
  }

  const now = Date.now();
  const stalled = [];
  for (const pr of prs) {
    const armed = pr.autoMergeRequest != null;
    const gateConclusion = (pr.statusCheckRollup ?? []).find((/** @type {{name?:string}} */ c) => c.name === "gate")
      ?.conclusion ?? null;
    const ageMs = armed ? now - Date.parse(pr.autoMergeRequest.enabledAt) : 0;

    let conflict = false, files = /** @type {string[]} */ ([]);
    if (armed && gateConclusion === "SUCCESS") {
      ({ conflict, files } = mergeTreeConflict("origin/main", pr.headRefOid, runGitForReal));
    }

    const verdict = stalledVerdict({ armed, gateConclusion, conflict, ageMs });
    if (verdict.stalled) {
      console.log(`#${pr.number} STALLED -- ${verdict.reason}`);
      console.log(`  conflicting: ${files.join(", ")}`);
      stalled.push(pr.number);
    }
  }

  if (stalled.length === 0) {
    console.log("QUEUE: nothing stalled -- every armed, green PR merges cleanly against origin/main.");
  } else {
    console.log(`QUEUE: ${stalled.length} stalled: ${stalled.join(" ")}`);
  }
  process.exit(EXIT.EXAMINED);
}

// The same entry guard `merge-guard.mjs`/`auto-arm-sweep.mjs` use: a bare `file://` + argv[1] comparison
// misreads a path with a space in it and a symlinked checkout, and reports the module as "imported, not
// run".
if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) main();
