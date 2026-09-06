// WORKTREE LIFECYCLE, AS A COMMAND -- not a discipline somebody has to remember.
//
// The rule ("prune after every merge") existed as prose from 2026-09-06, `dispatcher` pruned 28 stale
// trees by hand, and 36 remained the next day: 4.4 GB, 38 real `node_modules` directories. A rule
// maintained by hand is a rule that lapses.
//
// FOUR POPULATIONS, and conflating them is the whole risk in this file:
//   - LIST every worktree whose branch is merged into origin/main (a "gone" branch -- deleted outright --
//     is the same population read a different way: nothing to lose either way).
//   - REMOVE the ones that are also CLEAN -- no uncommitted changes, no commits origin/main does not have.
//   - NAME the DIRTY ones, with their branch, and remove NOTHING from that set.
//   - NAME (never remove) the STANDING and CHERRY-PICKED ones -- both added after `dispatcher`'s own
//     manual pass measured them as real, not hypothetical (25 removed, 3.4 GB freed, 4 refused, one
//     genuine near-miss each for the other two):
//       STANDING: a worktree whose branch is not `agent/*` at all -- `a11y-wt-dispatch`
//       (`dispatcher/merge`), `a11y-wt-lead` (`lead/*`). These are ROLE trees, not unit trees; nothing
//       about "merged" or "clean" applies to them, and an unstated exception is exactly the kind of thing
//       that gets applied to the exception the day someone forgets it by hand.
//       CHERRY-PICKED: `merge-base --is-ancestor` says NOT merged forever for a branch whose commits were
//       cherry-picked onto main rather than merged -- same CONTENT, different SHAs, ahead by that reading
//       for as long as the branch exists (measured: `agent/same-document-resolved-url`, 10 "ahead", every
//       commit's content already on main). Reported as its own state and left for a human, never folded
//       into "dirty" (which reads as real, uncaptured work) or auto-removed (which would be right most of
//       the time and catastrophic the one time a cherry-pick left something behind it did not carry).
//
// A dirty worktree holds uncommitted work, which is exactly the case where deletion is unrecoverable --
// this project has one recorded near-miss already (`git checkout main` refused in the primary over
// sixteen uncommitted lines; a forcing flag would have taken them silently). A prune that removes a dirty
// tree is worse than no prune at all, because this runs unattended after every merge. **A branch that
// reads MERGED can still have an unmerged working tree** -- measured directly (`a11y-wt-realpage`: 0
// commits ahead of main, 5 modified files, 2 untracked) -- which is why `isWorkingTreeClean` is asked
// unconditionally and never short-circuited by a clean merge status.
//
// NEVER TOUCHES THE PRIMARY CHECKOUT -- the fleet-driving tree. Identified structurally, not by path or
// list position: the primary's `.git` is a real DIRECTORY; every linked worktree's `.git` is a text file
// (`gitdir: <path>`) pointing into the primary's `.git/worktrees/<name>`. That is git's own mechanism for
// telling the two apart, not a guess about naming conventions or where this checkout happens to live.
//
// `git worktree remove` WITHOUT `--force` IS ITSELF A GUARD, not merely this file's own check restated --
// measured: it refused three trees on its own in the manual pass. Never pass `--force`; a dirty tree this
// file's own classification somehow missed is exactly the case that guard exists to catch anyway.
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, statSync } from "node:fs";
import { join } from "node:path";
import { sandboxGitEnv } from "./git-env.mjs";

/** @type {(cmd: string, args: string[], opts: { cwd: string }) => string} */
const defaultRun = (cmd, args, opts) =>
  execFileSync(cmd, args, { ...opts, env: sandboxGitEnv(), encoding: "utf8" });

/**
 * @typedef {{ path: string, branch: string | null, detached: boolean }} WorktreeEntry
 */

/**
 * Parses `git worktree list --porcelain`'s block format. Pure, given the raw text -- the shape worker-
 * capture's own tests favour, tested directly against a fixture string with no git process involved.
 *
 * @param {string} porcelain
 * @returns {WorktreeEntry[]}
 */
export function parseWorktreeList(porcelain) {
  const entries = [];
  for (const block of porcelain.split(/\n\n+/)) {
    const pathLine = /^worktree (.+)$/m.exec(block);
    if (!pathLine) continue;
    const branchLine = /^branch refs\/heads\/(.+)$/m.exec(block);
    entries.push({
      path: pathLine[1],
      branch: branchLine ? branchLine[1] : null,
      detached: /^detached$/m.test(block),
    });
  }
  return entries;
}

/**
 * git's own mechanism for telling a linked worktree from the repository it belongs to: the primary's
 * `.git` is a real directory, a linked worktree's is a text file. Never a guess from the path.
 *
 * @param {string} worktreePath
 * @returns {boolean}
 */
export function isPrimaryWorktree(worktreePath) {
  const gitPath = join(worktreePath, ".git");
  if (!existsSync(gitPath)) return false;
  return lstatSync(gitPath).isDirectory();
}

/**
 * @typedef {{
 *   path: string, branch: string | null,
 *   mergedIntoMain: boolean, workingTreeClean: boolean, contentMerged: boolean,
 * }} WorktreeAssessment
 */

/**
 * A worktree whose branch is not `agent/*` is a ROLE tree, not a unit tree -- `a11y-wt-dispatch`
 * (`dispatcher/merge`), `a11y-wt-lead` (`lead/*`). Standing, never a prune candidate at all, regardless
 * of merge or clean state. A detached worktree (no branch) is not "standing" -- there is no name to
 * recognise as a role tree -- so it is not this function's business; `classify` handles it separately.
 *
 * @param {string} branch
 * @returns {boolean}
 */
export function isStandingBranch(branch) {
  return !branch.startsWith("agent/");
}

/**
 * Pure: given what is already known about a worktree, which of the FOUR populations is it in?
 *
 * ORDER MATTERS. A detached worktree is refused first (no branch to reason about at all). A standing
 * branch is refused next, UNCONDITIONALLY -- a role tree that happens to look clean and merged is still
 * never a prune candidate, because "merged and clean" is not the question for a tree that is not a unit
 * tree in the first place. Only then does "remove" become reachable, and "cherry-picked" is checked
 * before the general "dirty" fallback so a content-identical branch is never lumped in with real,
 * uncaptured work.
 *
 * @param {Pick<WorktreeAssessment, "branch" | "mergedIntoMain" | "workingTreeClean" | "contentMerged">} assessment
 * @returns {"remove" | "dirty" | "standing" | "cherry-picked"}
 */
export function classify({ branch, mergedIntoMain, workingTreeClean, contentMerged }) {
  if (branch === null) return "dirty";
  if (isStandingBranch(branch)) return "standing";
  if (mergedIntoMain && workingTreeClean) return "remove";
  if (!mergedIntoMain && contentMerged) return "cherry-picked";
  return "dirty";
}

/**
 * Whether `branch` is fully merged into `origin/main` -- so no commit on it is missing from history. A
 * branch that no longer exists at all (deleted since `git worktree list` last ran, or by another agent
 * moments ago) is treated as merged: nothing on it can be lost by removing a worktree pointing nowhere.
 *
 * @param {string} repoRoot
 * @param {string} branch
 * @param {{ run?: typeof defaultRun }} [deps]
 * @returns {boolean}
 */
export function isMergedIntoMain(repoRoot, branch, { run = defaultRun } = {}) {
  try {
    run("git", ["rev-parse", "--verify", `refs/heads/${branch}`], { cwd: repoRoot });
  } catch {
    return true; // the branch itself is gone -- nothing left to merge or lose
  }
  try {
    run("git", ["merge-base", "--is-ancestor", branch, "origin/main"], { cwd: repoRoot });
    return true;
  } catch {
    return false; // exits non-zero when NOT an ancestor -- a real "not merged", not a failure to guess about
  }
}

/**
 * Whether every commit `branch` carries beyond its merge-base with `origin/main` has an EQUIVALENT patch
 * already on `origin/main` -- a cherry-pick, not a merge, so `isMergedIntoMain`'s ancestor check reads
 * NOT merged forever even though nothing on the branch is actually missing from history.
 *
 * `git cherry origin/main <branch>` prefixes each commit `-` (patch-id already upstream) or `+` (genuinely
 * new). Only called when `isMergedIntoMain` has already said false, so an EMPTY result here (no commits
 * ahead at all) would itself be a contradiction -- treated as "not content-merged" rather than guessed at,
 * since that shape means something is wrong with the two checks agreeing, not that the branch is clean.
 *
 * @param {string} repoRoot
 * @param {string} branch
 * @param {{ run?: typeof defaultRun }} [deps]
 * @returns {boolean}
 */
export function isContentMerged(repoRoot, branch, { run = defaultRun } = {}) {
  /** @type {string} */
  let out;
  try {
    out = run("git", ["cherry", "origin/main", branch], { cwd: repoRoot });
  } catch {
    return false; // could not determine -- refuse to call it content-merged
  }
  const lines = out.split("\n").filter((l) => l.trim() !== "");
  if (lines.length === 0) return false; // nothing ahead at all is isMergedIntoMain's case, not this one
  return lines.every((l) => l.startsWith("-"));
}

/**
 * Whether a worktree's working directory has no uncommitted changes -- exactly `git status --porcelain`,
 * nothing more. Deliberately NOT also checking for commits `origin/main` lacks: that is
 * `isMergedIntoMain`'s question, asked once, so a worktree with a real unmerged commit but a clean
 * `git status` (committed, just not yet integrated) is not read as "clean" here and "unmerged" there --
 * `classify` requires BOTH facts true to remove, so either check alone catches that case, and folding
 * "ahead of origin/main" into this function too would just be the same fact asked twice.
 *
 * @param {string} worktreePath
 * @param {string | null} branch
 * @param {{ run?: typeof defaultRun }} [deps]
 * @returns {boolean}
 */
export function isWorkingTreeClean(worktreePath, branch, { run = defaultRun } = {}) {
  if (branch === null) return false; // detached: no branch to reason about safely either way
  const status = run("git", ["status", "--porcelain"], { cwd: worktreePath });
  return status.trim() === "";
}

/**
 * @typedef {{ path: string, branch: string | null }} ReportedWorktree
 * @typedef {{
 *   removed: ReportedWorktree[],
 *   dirty: ReportedWorktree[],
 *   standing: ReportedWorktree[],
 *   cherryPicked: ReportedWorktree[],
 *   skippedPrimary: string | null,
 * }} PruneReport
 */

/**
 * The whole flow: list, classify, remove the clean+merged, name the rest, never touch the primary.
 *
 * `contentMerged` is only computed when `mergedIntoMain` is false and `branch` is a real, non-standing
 * name -- `git cherry` is meaningless for a detached or already-merged worktree, and skipping it there is
 * not an optimisation, it is avoiding a question that does not apply.
 *
 * @param {string} repoRoot the repository whose `git worktree list` is authoritative
 * @param {{ run?: typeof defaultRun, remove?: (path: string, deps: { run: typeof defaultRun }) => void }} [deps]
 * @returns {PruneReport}
 */
export function pruneWorktrees(repoRoot, { run = defaultRun, remove } = {}) {
  const porcelain = run("git", ["worktree", "list", "--porcelain"], { cwd: repoRoot });
  const entries = parseWorktreeList(porcelain);
  /** @type {PruneReport} */
  const report = { removed: [], dirty: [], standing: [], cherryPicked: [], skippedPrimary: null };
  const doRemove = remove ?? ((path, { run: r }) => {
    r("git", ["worktree", "remove", path], { cwd: repoRoot });
  });

  for (const entry of entries) {
    if (isPrimaryWorktree(entry.path)) {
      report.skippedPrimary = entry.path;
      continue;
    }
    const reported = { path: entry.path, branch: entry.branch };
    if (entry.branch !== null && isStandingBranch(entry.branch)) {
      report.standing.push(reported);
      continue;
    }
    const mergedIntoMain = entry.branch !== null && isMergedIntoMain(repoRoot, entry.branch, { run });
    const workingTreeClean = isWorkingTreeClean(entry.path, entry.branch, { run });
    const contentMerged = entry.branch !== null && !mergedIntoMain
      && isContentMerged(repoRoot, entry.branch, { run });
    const verdict = classify({ branch: entry.branch, mergedIntoMain, workingTreeClean, contentMerged });
    if (verdict === "remove") {
      doRemove(entry.path, { run });
      report.removed.push(reported);
    } else if (verdict === "cherry-picked") {
      report.cherryPicked.push(reported);
    } else {
      report.dirty.push(reported);
    }
  }
  return report;
}

function formatReport(report) {
  const lines = [];
  lines.push(`removed ${report.removed.length} worktree(s):`);
  for (const r of report.removed) lines.push(`  ${r.path}  (${r.branch ?? "detached"})`);
  if (report.dirty.length > 0) {
    lines.push(`refused ${report.dirty.length} DIRTY worktree(s) -- uncommitted or unmerged work, named, nothing removed:`);
    for (const d of report.dirty) lines.push(`  ${d.path}  (${d.branch ?? "detached"})`);
  }
  if (report.cherryPicked.length > 0) {
    lines.push(`${report.cherryPicked.length} CHERRY-PICKED worktree(s) -- content already on main under `
      + `different commits, not a literal ancestor; a human decides, nothing removed:`);
    for (const c of report.cherryPicked) lines.push(`  ${c.path}  (${c.branch})`);
  }
  if (report.standing.length > 0) {
    lines.push(`${report.standing.length} STANDING worktree(s) -- not agent/*, a role tree, never a prune candidate:`);
    for (const s of report.standing) lines.push(`  ${s.path}  (${s.branch ?? "detached"})`);
  }
  if (report.skippedPrimary) lines.push(`primary checkout, never touched: ${report.skippedPrimary}`);
  return lines.join("\n");
}

async function main() {
  const repoRoot = process.argv[2] ?? process.cwd();
  const report = pruneWorktrees(statSync(repoRoot).isDirectory() ? repoRoot : process.cwd());
  process.stdout.write(formatReport(report) + "\n");
}

import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";
if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) {
  main();
}
