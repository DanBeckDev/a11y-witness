#!/usr/bin/env node
// command: produce the #623 four-fact inventory of every branch on origin with no open PR and commits
//          main lacks -- read-only, modifies nothing -- `npm run branches:inventory`
//
// THE FETCHING HALF. The classification lives in `branch-inventory.mjs`, which spawns nothing, so the
// row's acceptance runs in a job with no token (#1009). This file reads git and `gh` and therefore does
// carry that requirement.
//
// READ-ONLY BY CONSTRUCTION: every git command here is a read (`for-each-ref`, `rev-list`, `log`) and
// every `gh` call is a `list`/`view`. #623 is explicit that deleting is NOT in scope -- a branch is
// deleted by its owner having said so on the row, or it is kept -- so this tool has no closing path at
// all rather than a guarded one.
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";
import { refuseUnknownFlags } from "@a11ign/worker-fleet/cli-flags";
import { REPO } from "./repo-identity.mjs";
import { sandboxGitEnv } from "./git-env.mjs";
import { branchFacts, renderInventory, rowNumberFromBranch, sessionFromLabels } from "./branch-inventory.mjs";

/** @type {(cmd: string, args: string[]) => string} */
const defaultRun = (cmd, args) =>
  execFileSync(cmd, args, { encoding: "utf8", env: sandboxGitEnv(), stdio: ["ignore", "pipe", "pipe"] });

/**
 * Every branch on `origin` except `main`, with the tip sha and its commit date in ONE read.
 *
 * `%(refname:lstrip=3)` rather than `%(refname:short)`, and `--exclude` rather than a grep: #623's own
 * open-check recorded that `refs/remotes/origin/HEAD` has a short name of `origin`, so a grep for
 * `^HEAD$` never matches it, `origin/origin` is not a revision, and the error goes to stderr while the
 * line is counted anyway. A phantom in the population and a visible error that changed no number.
 */
export function branchesWithTips({ run = defaultRun } = {}) {
  const out = run("git", ["for-each-ref", "--format=%(refname:lstrip=3)\t%(objectname:short)\t%(committerdate:iso-strict)",
    "refs/remotes/origin", "--exclude=refs/remotes/origin/HEAD"]);
  return out.split("\n").filter((l) => l.trim() !== "").map((line) => {
    const [branch, sha, at] = line.split("\t");
    return { branch, lastCommit: { sha, at } };
  }).filter((b) => b.branch !== "main");
}

/** Head refs of every OPEN PR -- the branches that are already visible to review. */
export function openPrHeads({ run = defaultRun } = {}) {
  return new Set(JSON.parse(run("gh", ["pr", "list", "--repo", REPO, "--state", "open",
    "--limit", "500", "--json", "headRefName"])).map((/** @type {{headRefName: string}} */ p) => p.headRefName));
}

/** How many commits this branch carries that `origin/main` does not. */
export function aheadOf(branch, { run = defaultRun } = {}) {
  return Number(run("git", ["rev-list", "--count", `origin/main..origin/${branch}`]).trim());
}

/**
 * The rows the branches name, fetched ONE BY ONE and only for numbers that appear in a branch name.
 *
 * A listing would be cheaper and cannot answer this: a row may be closed, and a closed row is exactly the
 * interesting case -- `gh issue list` defaults to open, and asking for `--state all` returns a page rather
 * than the specific numbers. #1248's own lesson one door along: a label-keyed listing cannot report a row
 * with no labels either. So each number is asked for by name, and a 404 is RETURNED as null rather than
 * throwing: "#N does not exist" is a fact about the branch, not a failure of the sweep.
 */
export function rowsFor(numbers, { run = defaultRun } = {}) {
  const rows = new Map();
  for (const n of numbers) {
    try {
      // `gh api .../issues/<n>` rather than `gh issue view`: REST answers for PULL REQUESTS at the same
      // path, and only this route carries the `pull_request` key that tells them apart. `gh issue view`
      // silently returned a PR for `archive/gate-ages-rebased-137` and the tool called it a row.
      const issue = JSON.parse(run("gh", ["api", `repos/${REPO}/issues/${n}`]));
      rows.set(n, { number: issue.number, state: String(issue.state).toUpperCase(),
        isPullRequest: Object.hasOwn(issue, "pull_request"),
        labels: (issue.labels ?? []).map((/** @type {{name: string}} */ l) => l.name) });
    } catch {
      rows.set(n, null); // a number in a branch name that names no row -- reported, never guessed at
    }
  }
  return rows;
}

/**
 * The claim HISTORY for a row, fetched only when its live labels carry no session.
 *
 * Closing a row strips its `session:` label, so for a finished row the live labels cannot say who worked
 * it -- 64 of 93 branches read UNKNOWN before this was added. The `labeled` event survives every close.
 * One call per row that needs it, never for a row that already answers.
 */
export function timelineFor(number, { run = defaultRun } = {}) {
  try {
    return JSON.parse(run("gh", ["api", `repos/${REPO}/issues/${number}/timeline`, "--paginate"]));
  } catch {
    return []; // a row whose timeline cannot be read is UNKNOWN, which is a weaker claim than a wrong owner
  }
}

/** The whole inventory: the four facts for every branch with no open PR and commits main lacks. */
export function inventory({ run = defaultRun } = {}) {
  const open = openPrHeads({ run });
  const noOpenPr = branchesWithTips({ run }).filter((b) => !open.has(b.branch));
  const withAhead = noOpenPr.map((b) => ({ ...b, ahead: aheadOf(b.branch, { run }) }));
  const unmerged = withAhead.filter((b) => b.ahead > 0);
  const rows = rowsFor([...new Set(unmerged.map((b) => rowNumberFromBranch(b.branch)).filter((n) => n !== null))],
    { run });
  const timelines = new Map();
  for (const [number, row] of rows) {
    if (row !== null && sessionFromLabels(row.labels) === null) timelines.set(number, timelineFor(number, { run }));
  }
  return {
    counts: { candidates: branchesWithTips({ run }).length, noOpenPR: noOpenPr.length,
      merged: withAhead.length - unmerged.length, unmerged: unmerged.length,
      commits: unmerged.reduce((n, b) => n + b.ahead, 0) },
    facts: unmerged.map((b) => branchFacts({ ...b,
      row: rows.get(rowNumberFromBranch(b.branch)) ?? null,
      timeline: timelines.get(rowNumberFromBranch(b.branch)) ?? [] })),
  };
}

function main() {
  refuseUnknownFlags([], { entry: import.meta.url, command: "npm run branches:inventory" });
  const { counts, facts } = inventory();
  process.stdout.write(`Read ${new Date().toISOString()} from origin after a fetch.\n\n`
    + `branches on origin (excluding main): ${counts.candidates}\n`
    + `  with no OPEN PR:                   ${counts.noOpenPR}\n`
    + `    merged (0 commits main lacks):   ${counts.merged}\n`
    + `    UNMERGED:                        ${counts.unmerged} carrying ${counts.commits} commits\n`
    + `    reconcile: ${counts.merged} + ${counts.unmerged} = ${counts.merged + counts.unmerged}\n\n`
    + `${renderInventory(facts)}\n`);
}
if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) main();
