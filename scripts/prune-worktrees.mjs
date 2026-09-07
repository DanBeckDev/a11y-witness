// WORKTREE LIFECYCLE, AS A COMMAND -- not a discipline somebody has to remember.
//
// The rule ("prune after every merge") existed as prose from 2026-09-06, `dispatcher` pruned 28 stale
// trees by hand, and 36 remained the next day: 4.4 GB, 38 real `node_modules` directories. A rule
// maintained by hand is a rule that lapses.
//
// FIVE POPULATIONS, and conflating them is the whole risk in this file:
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
//       INCONCLUSIVE: merge or clean status could not be DETERMINED at all -- `origin/main` missing, a
//       corrupt ref, an unreadable working tree. A dispatcher's own manual pass had exactly this bug:
//       `[ "$(git rev-list --count origin/main..branch 2>/dev/null)" != 0 ]` reads an EMPTY (errored)
//       result the same as a real nonzero count, silently treating "could not tell" as "not merged".
//       Reported and left for a human -- never folded into "not merged" or "dirty" by a default that only
//       looks safe.
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
//
// #220: "CLEAN" IS NOT "FINISHED". `worker-capture` ran `git stash -u` to switch branches, which makes a
// working tree momentarily clean -- a real prune ran inside that window and deleted the directory out from
// under them mid-command. Nothing was lost only because a stash lives in the repository's COMMON git dir,
// not the worktree; an uncommitted (never-stashed) edit would have gone with it.
//
// So "remove" now also requires the worktree to show NO RECENT GIT ACTIVITY -- the mtime of its own
// PRIVATE gitdir (`.git/worktrees/<name>/{index,HEAD,logs/HEAD}`, resolved via `git rev-parse
// --absolute-git-dir`, never guessed from the path) must be older than `ACTIVITY_WINDOW_MS`. Measured
// directly (see the test file): `git stash -u` and `git add` both touch `index`'s mtime; a plain `git
// status` on an already-modified-but-unstaged file does not. That is this signal's NAMED failure mode --
// a session editing files through a non-git tool, with no `git add`/`stash`/`commit`/`checkout` in the
// window, is invisible to it and could still be pruned. Chosen anyway as the cheapest of the three
// candidates the row named (mtime / a lock file / an open PR): it directly covers the incident that
// happened (mid-stash), needs no new file for every session to write and clean up (a lock file's own
// failure mode -- a crashed session's lock never clears), and does not require a PR to exist yet (the
// incident happened before one did). A genuinely abandoned tree still gets removed once the window
// passes, which is `ACCEPTANCE step 3`'s own requirement -- this narrows the remove window, it does not
// disable it.
export const ACTIVITY_WINDOW_MS = 10 * 60 * 1000; // 10 minutes: survives a stash-then-checkout gap; still sweeps
                                            // a truly abandoned tree well within an hour of prune runs
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
 * Whether `worktreePath` shows GIT ACTIVITY within `windowMs` of `now` -- the mtime of its own PRIVATE
 * gitdir's `index`, `HEAD` and `logs/HEAD` (whichever exist), newest wins. TRISTATE for the same reason
 * as `mergeStatus`/`isWorkingTreeClean`: `git rev-parse --absolute-git-dir` failing (a corrupted worktree,
 * a `.git` file pointing nowhere) must read `"unknown"`, never `false` -- collapsing "could not check"
 * into "no recent activity" is exactly the shape this row exists to close, one layer further in.
 *
 * NAMED FAILURE MODE (see this file's own header for why this signal over the other two candidates): a
 * session editing files through a non-git tool, with no `git add`/`stash`/`commit`/`checkout` inside the
 * window, is invisible to this check and could still be pruned. Narrower than the incident this closes,
 * not a claim of completeness.
 *
 * @param {string} worktreePath
 * @param {{ run?: typeof defaultRun, now?: number, windowMs?: number }} [deps]
 * @returns {boolean | "unknown"}
 */
export function recentGitActivity(worktreePath, { run = defaultRun, now = Date.now(), windowMs = ACTIVITY_WINDOW_MS } = {}) {
  /** @type {string} */
  let gitDir;
  try {
    gitDir = run("git", ["rev-parse", "--absolute-git-dir"], { cwd: worktreePath }).trim();
  } catch {
    return "unknown";
  }
  const candidates = ["index", "HEAD", join("logs", "HEAD")].map((f) => join(gitDir, f));
  let newestMtimeMs = -Infinity;
  let sawAny = false;
  for (const path of candidates) {
    try {
      const mtimeMs = statSync(path).mtimeMs;
      sawAny = true;
      if (mtimeMs > newestMtimeMs) newestMtimeMs = mtimeMs;
    } catch {
      // this particular file may legitimately not exist (e.g. no reflog yet) -- only ALL missing is unknown
    }
  }
  if (!sawAny) return "unknown";
  return now - newestMtimeMs < windowMs;
}

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
 *   merge: "merged" | "not-merged" | "unknown", workingTreeClean: boolean | "unknown", contentMerged: boolean,
 *   recentlyActive: boolean | "unknown",
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
 * Pure: given what is already known about a worktree, which of the SIX populations is it in?
 *
 * ORDER MATTERS. A detached worktree is refused first (no branch to reason about at all). A standing
 * branch is refused next, UNCONDITIONALLY -- a role tree that happens to look clean and merged is still
 * never a prune candidate, because "merged and clean" is not the question for a tree that is not a unit
 * tree in the first place. `"unknown"` on ANY of `merge`, `workingTreeClean` or `recentlyActive` is
 * checked before "remove" becomes reachable at all -- INCONCLUSIVE, never silently folded into "not
 * merged" or "dirty". That collapse is a real, measured incident, not a hypothetical: a manual prune
 * script's own `[ "$(git rev-list --count origin/main..branch 2>/dev/null)" != 0 ]` compares an EMPTY
 * result (the count errored) against `0` as unequal, treating "could not tell" as "definitely not merged"
 * -- the same shape this project has paid for repeatedly elsewhere, here inside the very tool meant to
 * enforce hygiene. Only past all three does "cherry-picked" get checked, before the general "dirty"
 * fallback, so a content-identical branch is never lumped in with real, uncaptured work.
 *
 * `recentlyActive` is checked LAST, after merge+clean would otherwise say "remove" -- #220: a tree that is
 * merged and clean but shows GIT ACTIVITY inside the window (see `recentGitActivity`'s own header) is
 * ACTIVE, not removed, because "clean" can mean "finished" or "mid-stash", and only recency tells them
 * apart.
 *
 * @param {Pick<WorktreeAssessment, "branch" | "merge" | "workingTreeClean" | "contentMerged" | "recentlyActive">} assessment
 * @returns {"remove" | "dirty" | "standing" | "cherry-picked" | "inconclusive" | "active"}
 */
export function classify({ branch, merge, workingTreeClean, contentMerged, recentlyActive }) {
  if (branch === null) return "dirty";
  if (isStandingBranch(branch)) return "standing";
  if (merge === "unknown" || workingTreeClean === "unknown" || recentlyActive === "unknown") return "inconclusive";
  if (merge === "merged" && workingTreeClean) return recentlyActive ? "active" : "remove";
  if (merge === "not-merged" && contentMerged) return "cherry-picked";
  return "dirty";
}

/**
 * Whether `branch` is fully merged into `origin/main` -- so no commit on it is missing from history. A
 * branch that no longer exists at all (deleted since `git worktree list` last ran, or by another agent
 * moments ago) is treated as merged: nothing on it can be lost by removing a worktree pointing nowhere.
 *
 * TRISTATE, deliberately, not a boolean: `git merge-base --is-ancestor` exits 1 for its own documented
 * "not an ancestor" answer, and exits with anything ELSE (128, most commonly) when it could not even ask
 * the question -- `origin/main` missing, a corrupt ref, a repo mid-operation. Reading "anything non-zero"
 * as "not merged" is exactly the collapse measured in the incident this function's caller documents;
 * `"unknown"` keeps that third state visible instead of guessing which of the other two it must be.
 *
 * @param {string} repoRoot
 * @param {string} branch
 * @param {{ run?: typeof defaultRun }} [deps]
 * @returns {"merged" | "not-merged" | "unknown"}
 */
export function mergeStatus(repoRoot, branch, { run = defaultRun } = {}) {
  try {
    run("git", ["rev-parse", "--verify", `refs/heads/${branch}`], { cwd: repoRoot });
  } catch {
    return "merged"; // the branch itself is gone -- nothing left to merge or lose
  }
  try {
    run("git", ["merge-base", "--is-ancestor", branch, "origin/main"], { cwd: repoRoot });
    return "merged";
  } catch (error) {
    const status = /** @type {{ status?: number }} */ (error).status;
    return status === 1 ? "not-merged" : "unknown";
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
 * nothing more. Deliberately NOT also checking for commits `origin/main` lacks: that is `mergeStatus`'s
 * question, asked once, so a worktree with a real unmerged commit but a clean `git status` (committed,
 * just not yet integrated) is not read as "clean" here and "unmerged" there -- `classify` requires BOTH
 * facts true to remove, so either check alone catches that case, and folding "ahead of origin/main" into
 * this function too would just be the same fact asked twice.
 *
 * TRISTATE for the same reason as `mergeStatus`: an unreadable working tree (permissions, a corrupted
 * index, the directory vanishing mid-run) must read as `"unknown"`, never as `false` -- collapsing "could
 * not check" into "dirty" is a safer-LOOKING default that still hides the same failure this file exists
 * to stop hiding.
 *
 * @param {string} worktreePath
 * @param {string | null} branch
 * @param {{ run?: typeof defaultRun }} [deps]
 * @returns {boolean | "unknown"}
 */
export function isWorkingTreeClean(worktreePath, branch, { run = defaultRun } = {}) {
  if (branch === null) return false; // detached: no branch to reason about safely either way
  try {
    const status = run("git", ["status", "--porcelain"], { cwd: worktreePath });
    return status.trim() === "";
  } catch {
    return "unknown";
  }
}

/**
 * @typedef {{ path: string, branch: string | null }} ReportedWorktree
 * @typedef {{
 *   removed: ReportedWorktree[],
 *   dirty: ReportedWorktree[],
 *   standing: ReportedWorktree[],
 *   cherryPicked: ReportedWorktree[],
 *   inconclusive: ReportedWorktree[],
 *   active: ReportedWorktree[],
 *   skippedPrimary: string | null,
 * }} PruneReport
 */

/**
 * The four facts `classify` needs about one non-primary, non-standing worktree entry.
 *
 * `contentMerged` is only computed when `merge` is `"not-merged"` (a real, resolved "no") -- `git cherry`
 * is meaningless for a detached, already-merged, or UNKNOWN-status worktree, and skipping it there is not
 * an optimisation, it is avoiding a question that does not apply, or that the first question already
 * failed to answer.
 *
 * `recentlyActive` (#220) is only computed when `merge === "merged"` and `workingTreeClean` -- the ONLY
 * case where its answer changes the verdict (`classify` never reads it otherwise). Defaults to `false`
 * (never "unknown") when skipped, so a dirty or cherry-picked entry is never misread as inconclusive over
 * a question that does not apply to it.
 *
 * @param {string} repoRoot
 * @param {WorktreeEntry} entry
 * @param {{ run: typeof defaultRun, now: number }} deps
 * @returns {Pick<WorktreeAssessment, "merge" | "workingTreeClean" | "contentMerged" | "recentlyActive">}
 */
function assessWorktree(repoRoot, entry, { run, now }) {
  const merge = entry.branch !== null ? mergeStatus(repoRoot, entry.branch, { run }) : "not-merged";
  const workingTreeClean = isWorkingTreeClean(entry.path, entry.branch, { run });
  const contentMerged = entry.branch !== null && merge === "not-merged"
    && isContentMerged(repoRoot, entry.branch, { run });
  const recentlyActive = merge === "merged" && workingTreeClean === true
    ? recentGitActivity(entry.path, { run, now })
    : false;
  return { merge, workingTreeClean, contentMerged, recentlyActive };
}

/** Which `PruneReport` bucket a `classify` verdict other than `"remove"` lands in. */
const VERDICT_BUCKET = {
  active: "active", "cherry-picked": "cherryPicked", inconclusive: "inconclusive", dirty: "dirty",
};

/**
 * The whole flow: list, classify, remove the clean+merged, name the rest, never touch the primary.
 *
 * @param {string} repoRoot the repository whose `git worktree list` is authoritative
 * @param {{ run?: typeof defaultRun, remove?: (path: string, deps: { run: typeof defaultRun }) => void, now?: number }} [deps]
 * @returns {PruneReport}
 */
export function pruneWorktrees(repoRoot, { run = defaultRun, remove, now = Date.now() } = {}) {
  const porcelain = run("git", ["worktree", "list", "--porcelain"], { cwd: repoRoot });
  const entries = parseWorktreeList(porcelain);
  /** @type {PruneReport} */
  const report = {
    removed: [], dirty: [], standing: [], cherryPicked: [], inconclusive: [], active: [], skippedPrimary: null,
  };
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
    const assessment = assessWorktree(repoRoot, entry, { run, now });
    const verdict = classify({ branch: entry.branch, ...assessment });
    if (verdict === "remove") {
      doRemove(entry.path, { run });
      report.removed.push(reported);
    } else {
      report[VERDICT_BUCKET[verdict]].push(reported);
    }
  }
  return report;
}

/** Appends a header plus one indented line per entry -- and nothing at all when `entries` is empty. */
function pushSection(lines, entries, header) {
  if (entries.length === 0) return;
  lines.push(header);
  for (const e of entries) lines.push(`  ${e.path}  (${e.branch ?? "detached"})`);
}

function formatReport(report) {
  const lines = [`removed ${report.removed.length} worktree(s):`];
  for (const r of report.removed) lines.push(`  ${r.path}  (${r.branch ?? "detached"})`);
  pushSection(lines, report.dirty,
    `refused ${report.dirty.length} DIRTY worktree(s) -- uncommitted or unmerged work, named, nothing removed:`);
  pushSection(lines, report.active,
    `${report.active.length} ACTIVE worktree(s) -- merged and clean, but git activity inside the last `
    + `${Math.round(ACTIVITY_WINDOW_MS / 60000)} minute(s); a session may be mid-command, nothing removed:`);
  pushSection(lines, report.inconclusive,
    `${report.inconclusive.length} INCONCLUSIVE worktree(s) -- merge, clean or activity status could not `
    + `be determined; never guessed at, nothing removed:`);
  pushSection(lines, report.cherryPicked,
    `${report.cherryPicked.length} CHERRY-PICKED worktree(s) -- content already on main under different `
    + `commits, not a literal ancestor; a human decides, nothing removed:`);
  pushSection(lines, report.standing,
    `${report.standing.length} STANDING worktree(s) -- not agent/*, a role tree, never a prune candidate:`);
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
