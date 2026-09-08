#!/usr/bin/env node
// A PUSHED BRANCH WITH NO PR IS INVISIBLE, and nothing in this repo could find one (#247).
//
// `agent/ssh-key-defaults` sat pushed for ELEVEN HOURS carrying a finished security fix. No PR was ever
// opened, so no CI ever ran on it and no merge path existed for it -- found by a human reading a branch
// list while looking for something else.
//
// TWO EXISTING CHECKS CANNOT SEE THIS, BY DESIGN, NOT BY GAP:
//   `worktrees:prune` asks whether a branch is MERGED into origin/main -- the wrong question for a branch
//   that was never even proposed. It correctly leaves an unmerged, no-PR branch alone, silently.
//   `merge-guard` takes a PR NUMBER. A branch with no PR has nothing to ask it about.
//
// THE OBVIOUS HAND-ROLLED CHECK IS DEFEATED BY SQUASH MERGES, and this is the part worth recording.
// `git rev-list --count origin/main..origin/<branch>` reads > 0 for EVERY branch this repo squash-merges,
// because the squash commit is a different object from anything on the branch -- the same two-dot/three-dot
// diffing trap `row-reachability.mjs` already documents for held regions. Run over every pushed branch,
// this named 66 of 134 -- nearly all already landed. A check with that false-positive rate is unreadable.
//
// SO THE FILTER IS TWO STAGES, IN THIS ORDER, and the order is what makes the second stage trustworthy:
//   1. Has this branch EVER had a PR, of ANY state (open, closed, merged)? Asked of GitHub, never inferred
//      from git -- "PR state is the record git cannot reconstruct." A squash merge REQUIRES a PR to have
//      existed, so a branch with NO PR at all cannot have been squash-merged: the confound that defeats
//      rev-list-count on the full population cannot occur inside this narrower one.
//   2. ONLY for branches that pass stage 1 (no PR ever): does it still carry commits `origin/main` lacks?
//      Here `git rev-list --count` is a fact, not a false-positive machine, because stage 1 already ruled
//      out the one way it lies.
//
// THIS REPORTS CANDIDATES, NEVER CERTAINTIES. A first attempt at fully automated verification ("is the
// content REALLY absent from main") reported all eleven real candidates as IDENTICAL to main and was
// wrong -- `git diff --stat A B -- $FILES | tail -1` produced empty output on an EMPTY file list, and
// `${VAR:-IDENTICAL}` printed a clean verdict over the empty string. A check that reports clean having
// examined nothing, built inside the investigation of a missing check. A rebase whose content landed under
// a DIFFERENT branch's PR produces the identical shape (no PR of its own, commits ahead) and is not
// stranded -- distinguishing that from genuine stranded work needs a human reading the branch's own diff,
// which is exactly why this NAMES candidates rather than asserting a finding.
//
//   npm run branches:stranded
//
// Exit codes:
//   0  OK           -- pushed branches examined, none are candidates
//   1  CANDIDATE(S) -- named, one line each; this repo's own convention (row-reachability, ready-label-
//                      audit) of reporting rather than blocking anything
//   2  CANNOT ASK   -- a lookup failed. INCONCLUSIVE, never a clean sweep over an unreadable board.
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";
import { refuseUnknownFlags, flagValue } from "@a11ign/worker-fleet/cli-flags";
import { REPO } from "./repo-identity.mjs";
import { sandboxGitEnv } from "./git-env.mjs";

const EXIT = { OK: 0, CANDIDATES: 1, CANNOT_ASK: 2 };

/** @type {(cmd: string, args: string[]) => string} */
const defaultRun = (cmd, args) => execFileSync(cmd, args,
  { encoding: "utf8", env: sandboxGitEnv(), stdio: ["ignore", "pipe", "pipe"] });

/**
 * Every branch pushed under `origin/agent/*` or `origin/lead/*` -- the two prefixes this repo's own
 * worktree/branch convention uses (see `prune-worktrees.mjs`'s `isStandingBranch`) -- with the `origin/`
 * prefix stripped so it matches a PR's `headRefName` verbatim.
 *
 * @param {{ run?: typeof defaultRun }} [deps]
 * @returns {string[]}
 */
export function fetchPushedBranches({ run = defaultRun } = {}) {
  /** @type {string} */
  let raw;
  try {
    raw = run("git", ["for-each-ref", "--format=%(refname:short)",
      "refs/remotes/origin/agent", "refs/remotes/origin/lead"]);
  } catch (cause) {
    throw new Error(`stranded-branches: could not list pushed branches -- refusing to guess. `
      + `${/** @type {Error} */ (cause).message}`, { cause });
  }
  return raw.split("\n").map((l) => l.trim()).filter(Boolean).map((r) => r.replace(/^origin\//, ""));
}

/**
 * `gh pr list` returns NEWEST-first, so a truncating `--limit` drops the OLDEST PRs -- and stage 1 of
 * this file's own filter is "has this branch EVER had a PR". A dropped PR's head then reads as "no PR
 * ever pointed at this", which does not make the tool miss a stranded branch, it makes the tool
 * MANUFACTURE one, from exactly the oldest branches a stranded-work check most wants to be right about
 * (#321). 400 is ~3x headroom over the 127 PRs measured when this was filed -- raising the number moves
 * the cliff without removing it, so the real fix is detecting arrival AT it, below.
 */
export const PR_LIST_LIMIT = 400;

/**
 * Every branch name that has EVER had a PR opened against it, in ANY state. THROWS on failure -- never an
 * empty Set standing in for "no PR anywhere", which would read every pushed branch as stranded. The same
 * vacuity guard as `fetchOpenIssues`/`fetchLabels` elsewhere in this repo, aimed at the opposite direction:
 * there the danger is under-reporting a claim, here it is OVER-reporting a stranded branch.
 *
 * ALSO THROWS when the response comes back at exactly `PR_LIST_LIMIT` (#321) -- not a bigger-number fix,
 * a DIFFERENT kind of check: `gh` exits 0 whether that is genuinely every PR or the first `PR_LIST_LIMIT`
 * of more, and nothing about the response tells the two apart. A truncated listing is exactly the
 * CANNOT-ASK state this file already has an exit code for ("a clean sweep over an unreadable board"),
 * not a performance setting to be raised and forgotten. Contrast #286's `--limit 100` on a SCHEDULE
 * workflow: there, 100 consecutive non-schedule runs *is itself the finding* the check exists to report,
 * so hitting that bound is a correct answer, not a truncation -- the two look identical in the code and
 * are opposite in meaning, which is why each has to be reasoned about on its own rather than copied.
 *
 * @param {{ run?: typeof defaultRun }} [deps]
 * @returns {Set<string>}
 */
export function fetchAllPRHeadRefs({ run = defaultRun } = {}) {
  /** @type {string} */
  let raw;
  try {
    raw = run("gh", ["pr", "list", "--repo", REPO, "--state", "all", "--limit", String(PR_LIST_LIMIT),
      "--json", "headRefName"]);
  } catch (cause) {
    throw new Error(`stranded-branches: could not list PRs from ${REPO} -- refusing to guess. `
      + `${/** @type {Error} */ (cause).message}`, { cause });
  }
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw new Error(`stranded-branches: gh's PR list was not JSON -- refusing to guess. `
      + `First 200 chars: ${raw.slice(0, 200)}`, { cause });
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`stranded-branches: gh's PR list was not an array -- refusing to guess. `
      + `Got: ${JSON.stringify(parsed).slice(0, 300)}`);
  }
  // AT THE CAP IS NOT "A LOT OF PRs", IT IS "CANNOT TELL" (#321). `gh` exits 0 and returns exactly
  // `PR_LIST_LIMIT` rows whether that is every PR this repo has ever opened or the newest slice of many
  // more -- and because the response is newest-first, anything past the cap is silently missing from the
  // OLDEST end, which is precisely the population stage 1 of this file's filter depends on being complete.
  if (parsed.length === PR_LIST_LIMIT) {
    throw new Error(`stranded-branches: gh returned exactly ${PR_LIST_LIMIT} PRs, the configured `
      + "--limit -- cannot tell whether that is every PR or a truncated, newest-first slice missing the "
      + "oldest ones. Refusing to guess rather than silently manufacturing stranded-branch candidates "
      + "from PRs that were dropped off the end.");
  }
  return new Set(parsed.map((/** @type {unknown} */ pr, /** @type {number} */ i) => {
    const headRefName = /** @type {{ headRefName?: unknown }} */ (pr)?.headRefName;
    if (typeof headRefName !== "string") {
      throw new Error(`stranded-branches: PR entry ${i} has no headRefName -- refusing to guess. `
        + `Got: ${JSON.stringify(pr).slice(0, 200)}`);
    }
    return headRefName;
  }));
}

/**
 * Pure: which pushed branches have NEVER had a PR, of any state? Stage 1 of the two-stage filter -- see
 * this file's own header for why order matters here.
 *
 * @param {string[]} pushed
 * @param {Set<string>} prHeadRefs
 * @returns {string[]}
 */
export function branchesWithNoPR(pushed, prHeadRefs) {
  return pushed.filter((branch) => !prHeadRefs.has(branch));
}

/**
 * How many commits `branch` carries that `origin/main` lacks. Trustworthy ONLY for a branch already known
 * to have no PR (see this file's header) -- calling it on a squash-merged branch reproduces the exact
 * false-positive this tool exists to avoid.
 *
 * @param {string} branch
 * @param {{ run?: typeof defaultRun }} [deps]
 * @returns {number}
 */
export function aheadCount(branch, { run = defaultRun } = {}) {
  try {
    return Number(run("git", ["rev-list", "--count", `origin/main..origin/${branch}`]).trim());
  } catch (cause) {
    throw new Error(`stranded-branches: could not compute how far ${branch} is ahead of main -- `
      + `refusing to guess. ${/** @type {Error} */ (cause).message}`, { cause });
  }
}

/**
 * Pure: stage 2 of the filter, given stage 1's population and each one's ahead-count already looked up.
 * A branch with no PR and ZERO commits ahead of main is not a candidate -- it is an empty push, or a
 * branch whose tip happens to already equal main's, neither of which is stranded work.
 *
 * @param {string[]} noPRBranches
 * @param {Map<string, number>} aheadCounts
 * @returns {{ branch: string, aheadCount: number }[]}
 */
export function strandedCandidates(noPRBranches, aheadCounts) {
  return noPRBranches
    .map((branch) => ({ branch, aheadCount: aheadCounts.get(branch) ?? 0 }))
    .filter((c) => c.aheadCount > 0);
}

/**
 * A PULL REQUEST LIVES FOUR HOURS — B1, and this is the REFUSAL path, which matters more than the action.
 *
 * Closing a PR is the most destructive thing in this toolset, so what this declines to close is the part
 * worth reading. p90 to merge is 2.5 h and the median is 12 minutes; the two PRs closed by hand at 02:00Z
 * had been open ~25 hours at 373 and 392 commits behind, and neither was ever going to merge. Four hours
 * sits above p90 and far below anything that has ever failed to merge.
 *
 * ## `update-branch` CHANGED WHAT "OLD" MEANS, and without that the threshold reads as aggressive
 *
 * PRs no longer drift unattended: the sweep brought #477 and #473 current automatically and correctly
 * skipped #472 and #475 while they were red. So an old PR is now one that is genuinely ABANDONED rather
 * than merely stale, which is what makes four hours a sharper line than when the figure was written. A
 * reader who remembers tonight's 55-behind PRs will otherwise think it too short.
 *
 * ## WHAT IT REFUSES, and why each
 *
 * - **Under the threshold.** The ordinary case, and the one a bug here would destroy silently.
 * - **A draft.** Not offered for merge, so its age says nothing about abandonment.
 * - **Labelled `blocked`.** A PERSON refused it, and a clock does not overrule that -- the same reason
 *   the auto-arm sweep skips those.
 * - **Green and merely behind.** It is the merge train's, waiting its turn under B3's serialised sync.
 *   Closing a PR for being queued would punish it for the queue's own latency, and B3 is temporary while
 *   this rule is not. This is the interaction #460 asks to be decided here rather than discovered at
 *   4h01m.
 *
 * @param {{number: number, ageHours: number, isDraft?: boolean, labels?: string[],
 *          checksGreen?: boolean, behind?: number}} pr
 * @param {{maxAgeHours: number}} options
 * @returns {{action: "close", why: string} | {action: "keep", why: string}}
 */
export function decideForPR(pr, { maxAgeHours }) {
  // HOURS AND MINUTES, not `toFixed(1)`. At one decimal place 3.98h and 4.02h both render "4.0h", so a
  // kept PR read "4.0h old, under the 4h line" -- a number contradicting its own sentence, on the exact
  // boundary where somebody will be checking whether the sweep was right to spare it.
  const age = `${Math.floor(pr.ageHours)}h${String(Math.round((pr.ageHours % 1) * 60)).padStart(2, "0")}m`;
  if (pr.ageHours < maxAgeHours) {
    return { action: "keep", why: `${age} old, under the ${maxAgeHours}h line` };
  }
  if (pr.isDraft) return { action: "keep", why: "a draft is not offered for merge, so its age says nothing" };
  if ((pr.labels ?? []).includes("blocked")) {
    return { action: "keep", why: "labelled `blocked` -- a person refused this, and a clock does not overrule it" };
  }
  if (pr.checksGreen === true && (pr.behind ?? 0) > 0) {
    return { action: "keep",
      why: "green and behind, so it is the merge train's and is waiting its turn -- closing it would "
        + "punish a PR for the queue's latency rather than for its own staleness" };
  }
  return { action: "close",
    why: `${age} old, past the ${maxAgeHours}h line, and not waiting on anything` };
}

/**
 * The comment a closed PR gets. STALE and REJECTED need different words because the recovery differs:
 * one says "rebuild this from today's main", the other says "do not".
 *
 * THE BRANCH IS KEPT AND THE COMMENT SAYS SO. #172's branch was kept and its content re-derived from it;
 * a sweep that closed AND deleted would have destroyed a day of work that turned out to be sound.
 *
 * @param {{number: number, headRefName: string}} pr @param {string} why
 */
export function staleClosureComment(pr, why) {
  return `Closed as STALE by the lifetime sweep, not rejected — ${why}.\n\n`
    + `**The branch \`${pr.headRefName}\` is kept.** Nothing is lost: rebuild from today's \`main\` and open `
    + "a fresh PR. That is what happened to #172, whose branch was kept and whose content was re-derived "
    + "from it in an hour once the decision was made.\n\n"
    + "This is not a judgement on the work. A PR open this long is behind far enough that resolving it "
    + "costs more than rebuilding it, and every merge in this repository's record has happened well "
    + "inside the window.";
}

/**
 * Every open PR, with the four fields the decision needs. `gh` in JSON, one call.
 *
 * `statusCheckRollup` is DELIBERATELY NOT USED for `checksGreen`: it unions superseded check runs, so a
 * PR whose latest run succeeded reads as failing -- measured tonight on three PRs read as red by two
 * sessions, and filed as #450. The latest run per workflow is the bounded question; this asks `gh` for the
 * PR's own mergeable state instead, which is what the merge train acts on anyway.
 *
 * @param {{run?: (cmd: string, args: string[]) => string}} options
 */
export function fetchOpenPRs({ run = defaultRun } = {}) {
  const raw = run("gh", ["pr", "list", "--state", "open", "--limit", String(PR_LIST_LIMIT), "--json",
    "number,headRefName,createdAt,isDraft,labels,mergeStateStatus"]);
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("gh pr list did not return an array");
  return parsed;
}

/**
 * A PR as the decision wants it. `ageHours` from `createdAt`, and `checksGreen` from the merge state
 * rather than from a rollup that cannot be trusted.
 *
 * @param {any} pr @param {Date} now
 */
export function prForDecision(pr, now) {
  return {
    number: pr.number,
    headRefName: pr.headRefName,
    ageHours: (now.getTime() - new Date(pr.createdAt).getTime()) / 3_600_000,
    isDraft: Boolean(pr.isDraft),
    labels: (pr.labels ?? []).map((/** @type {any} */ l) => String(l.name)),
    // BEHIND is the only state that means "waiting for the train". CLEAN merges on its own; BLOCKED and
    // DIRTY are the PR's own problem and the train will not touch them.
    checksGreen: pr.mergeStateStatus === "BEHIND" || pr.mergeStateStatus === "CLEAN",
    behind: pr.mergeStateStatus === "BEHIND" ? 1 : 0,
  };
}

/**
 * THE LIFETIME SWEEP — B1. REPORTS BY DEFAULT; closing is opt-in.
 *
 * `corpus-prune-orphans.mjs` (#195) established the shape and it matters more here: closing a PR is the
 * most destructive action in this toolset, so `--close` is a thing somebody types, never a default that
 * runs because a scheduled job forgot a flag. Without it this names what it WOULD close and changes
 * nothing.
 *
 * @param {{now?: Date, maxAgeHours?: number, close?: boolean,
 *          run?: (cmd: string, args: string[]) => string}} options
 */
export function sweepPullRequests({ now = new Date(), maxAgeHours = 4, close = false, run = defaultRun } = {}) {
  const prs = fetchOpenPRs({ run }).map((pr) => prForDecision(pr, now));
  const decided = prs.map((pr) => ({ pr, decision: decideForPR(pr, { maxAgeHours }) }));
  const closing = decided.filter((d) => d.decision.action === "close");

  // THE COUNT IS PRINTED WHETHER OR NOT ANYTHING IS FOUND. A sweep that exits quietly on zero is
  // indistinguishable from one that examined nothing, and this one has `--close` behind it.
  process.stdout.write(`lifetime sweep: ${prs.length} open PR(s) examined against a ${maxAgeHours}h line; `
    + `${closing.length} past it.\n`);
  for (const { pr, decision } of decided) {
    const verb = decision.action === "close" ? (close ? "CLOSING" : "WOULD CLOSE") : "keeping";
    process.stdout.write(`  ${verb.padEnd(11)} #${pr.number}  ${decision.why}\n`);
  }
  if (!close || closing.length === 0) return closing;

  for (const { pr, decision } of closing) {
    // THE BRANCH IS KEPT: `gh pr close` without `--delete-branch`, said out loud because the flag's
    // absence is the whole safety property and an absent flag is invisible in review.
    run("gh", ["pr", "comment", String(pr.number), "--body", staleClosureComment(pr, decision.why)]);
    run("gh", ["pr", "close", String(pr.number)]);
    process.stdout.write(`  closed #${pr.number}, branch ${pr.headRefName} KEPT\n`);
  }
  return closing;
}

function main() {
  refuseUnknownFlags(["--dry-run", "--close", "--max-age-hours="],
    { entry: import.meta.url, command: "node scripts/stranded-branches.mjs" });
  if (process.argv.includes("--dry-run") || process.argv.includes("--close")) {
    const hours = flagValue(process.argv, "max-age-hours");
    sweepPullRequests({
      close: process.argv.includes("--close"),
      maxAgeHours: hours ? Number(hours) : 4,
    });
    return;
  }
  /** @type {string[]} */
  let pushed;
  /** @type {Set<string>} */
  let prHeadRefs;
  try {
    pushed = fetchPushedBranches();
    prHeadRefs = fetchAllPRHeadRefs();
  } catch (error) {
    process.stderr.write(`COULD NOT AUDIT: ${/** @type {Error} */ (error).message}\n`);
    process.exitCode = EXIT.CANNOT_ASK;
    return;
  }

  const noPR = branchesWithNoPR(pushed, prHeadRefs);
  const aheadCounts = new Map();
  for (const branch of noPR) {
    try {
      aheadCounts.set(branch, aheadCount(branch));
    } catch (error) {
      process.stderr.write(`COULD NOT AUDIT: ${/** @type {Error} */ (error).message}\n`);
      process.exitCode = EXIT.CANNOT_ASK;
      return;
    }
  }
  const candidates = strandedCandidates(noPR, aheadCounts);

  if (candidates.length === 0) {
    process.stdout.write(`OK  ${pushed.length} pushed branch(es) examined, none are stranded-branch `
      + `candidates (no PR of any state, and commits main does not have)\n`);
    return;
  }
  for (const { branch, aheadCount: count } of candidates) {
    process.stdout.write(`CANDIDATE  ${branch}  +${count} commit(s) ahead of main, no PR ever opened\n`);
  }
  process.stderr.write(`\n${candidates.length} branch(es) are CANDIDATES for stranded work, out of `
    + `${pushed.length} pushed. NOT a finding: a rebase whose content landed under a DIFFERENT branch's PR `
    + `produces the identical shape. Read each branch's own diff against main before opening a PR for it.\n`);
  process.exitCode = EXIT.CANDIDATES;
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) {
  main();
}
