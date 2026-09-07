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
import { refuseUnknownFlags } from "@a11ign/worker-fleet/cli-flags";
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

function main() {
  refuseUnknownFlags([], { entry: import.meta.url, command: "node scripts/stranded-branches.mjs" });
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
