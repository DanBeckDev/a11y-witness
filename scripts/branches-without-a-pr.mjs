// BRANCHES THAT NEVER HAD A PULL REQUEST, and which of them still carry work `main` does not have.
//
//   node scripts/branches-without-a-pr.mjs            # report
//   node scripts/branches-without-a-pr.mjs --json
//
// ## Why this exists
//
// `agent/ssh-key-defaults` sat pushed for ELEVEN HOURS with no PR of any state, carrying
// `requireControlPlaneKey()` and the removal of a hardcoded SSH key filename from two scripts. Verified
// absent from `main`. No CI had ever run on it, because `ci.yml` triggers on `pull_request` — and there
// was no pull request. It was found by somebody reading a branch list while looking for something else.
//
// Nothing could see it. `worktrees:prune` asks "is this branch merged", correctly answers no, and says
// nothing. `merge-guard` takes a PR number. `merge-queue.mjs`'s orphaned-commit check (#152) hangs off a
// PR's head ref and fires at merge time — it is the complementary half of this and structurally cannot
// see a branch that never entered the queue.
//
// ## The obvious check is defeated by squash-merging, measured
//
// `git rev-list --count origin/main..<branch> > 0` looks like the answer and is not: a squash merge lands
// the CONTENT under a new commit, so every squash-merged branch still reports commits `main` "does not
// have". Measured on this repo: 133 pushed branches, and that test names 66 — nearly all of them already
// landed.
//
// **PR state is the record git cannot reconstruct.** So the population comes from GitHub (`gh pr list
// --state all`, every head ref it has ever seen) and the residue is the branches no PR ever pointed at.
// That is the same conclusion `merge-guard.mjs` reached from the other direction about `mergeStateStatus`:
// some facts about a PR are not in the object graph git holds.
//
// ## Commits are the SCREEN; content is the VERDICT
//
// A branch with commits ahead of `main` has not necessarily got work `main` lacks — it may have been
// rebased, or its content landed under another branch's PR. So a commit count is reported as a candidate
// and never as a finding. What decides it is whether the FILES the branch changed differ from `main`.
//
// **And that comparison is where the first attempt at this went wrong**, in the investigation that filed
// the row: a loop doing `git diff --stat A B -- $FILES | tail -1` with `${VAR:-IDENTICAL}` printed a clean
// `IDENTICAL` for all eleven candidates — including the one already shown by hand to differ — because
// empty output and "no difference" are the same string. **A check that reported clean having examined
// nothing, produced inside the investigation of a missing check.**
//
// So `contentVerdict` below distinguishes THREE states and never collapses them: files differ, files are
// byte-identical, and *nothing was compared*. The third is a refusal, not a pass.
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { refuseUnknownFlags } from "@a11y-witness/worker-fleet/cli-flags";
import { sandboxGitEnv } from "./git-env.mjs";

/** @param {string[]} args */
function git(args) {
  return execFileSync("git", args, { encoding: "utf8", env: sandboxGitEnv() }).trim();
}

/** Every branch pushed to origin, `main` excluded — it is the thing being compared against. */
export function pushedBranches() {
  return git(["ls-remote", "--heads", "origin"])
    .split("\n").filter(Boolean)
    .map((line) => line.split("refs/heads/")[1])
    .filter((name) => name && name !== "main")
    .sort();
}

/**
 * Whether a branch's changed files still differ from `main` — the VERDICT, and it has three states.
 *
 * `compared: 0` is a REFUSAL rather than a pass. A branch whose diff against the merge base names no files
 * has nothing to compare, and reporting that as "identical" is exactly the failure that produced eleven
 * false clean verdicts in the investigation that filed this row.
 *
 * @param {string} branch
 * @returns {{ verdict: "DIFFERS"|"SAME"|"NOTHING COMPARED", compared: number, differing: string[] }}
 */
export function contentVerdict(branch) {
  const base = git(["merge-base", "origin/main", `origin/${branch}`]);
  const files = git(["diff", "--name-only", base, `origin/${branch}`])
    .split("\n").map((f) => f.trim()).filter(Boolean);
  if (files.length === 0) return { verdict: "NOTHING COMPARED", compared: 0, differing: [] };
  const differing = files.filter((file) => {
    // `git diff --quiet` exits 1 when they differ and 0 when they match, so the STATUS is the answer and
    // there is no output to misread as agreement. A file absent on one side is a difference, which
    // `--quiet` reports the same way.
    try {
      execFileSync("git", ["diff", "--quiet", "origin/main", `origin/${branch}`, "--", file],
        { env: sandboxGitEnv() });
      return false;
    } catch {
      return true;
    }
  });
  return { verdict: differing.length ? "DIFFERS" : "SAME", compared: files.length, differing };
}

/** Branches no pull request has ever pointed at, in any state. */
export function branchesWithoutAPr() {
  const heads = new Set(JSON.parse(
    execFileSync("gh", ["pr", "list", "--state", "all", "--limit", "500", "--json", "headRefName"],
      { encoding: "utf8" })).map((/** @type {{headRefName: string}} */ p) => p.headRefName));
  return pushedBranches().filter((b) => !heads.has(b));
}

function main() {
  refuseUnknownFlags(["--json"], { entry: import.meta.url, command: "branches-without-a-pr" });
  const asJson = process.argv.includes("--json");
  const pushed = pushedBranches();
  const noPr = branchesWithoutAPr();
  // ANTI-VACUITY. `gh` returning nothing, or a listing cap swallowing every head, would make EVERY branch
  // look PR-less and this report a wall of false findings. A population that implausible is a broken
  // question rather than an answer.
  if (pushed.length && noPr.length === pushed.length) {
    process.stderr.write("REFUSING: every pushed branch appears to have no PR, which means the PR listing "
      + "returned nothing rather than that 133 branches were never opened. Check `gh auth status`.\n");
    process.exit(2);
  }
  const rows = noPr.map((branch) => ({ branch, ...contentVerdict(branch) }));
  const stranded = rows.filter((r) => r.verdict === "DIFFERS");
  const unknown = rows.filter((r) => r.verdict === "NOTHING COMPARED");

  if (asJson) {
    process.stdout.write(`${JSON.stringify({ pushed: pushed.length, withoutAPr: noPr.length, rows }, null, 2)}\n`);
    return;
  }
  process.stdout.write(`\n# branches no pull request has ever pointed at\n`);
  process.stdout.write(`  ${pushed.length} pushed; ${noPr.length} never had a PR; `
    + `${stranded.length} of those still differ from main.\n\n`);
  for (const row of stranded) {
    process.stdout.write(`  STRANDED  ${row.branch}\n`);
    for (const file of row.differing.slice(0, 6)) process.stdout.write(`      ${file}\n`);
    if (row.differing.length > 6) process.stdout.write(`      ... and ${row.differing.length - 6} more\n`);
  }
  if (unknown.length) {
    // NOT counted as clean. "We compared nothing" and "they match" are different answers and this report
    // exists because they were once printed the same.
    process.stdout.write(`\n  ${unknown.length} branch(es) had NOTHING TO COMPARE against their merge `
      + "base — reported rather than called identical.\n");
    for (const row of unknown) process.stdout.write(`      ${row.branch}\n`);
  }
  if (!stranded.length && !unknown.length) {
    process.stdout.write("  No branch without a PR carries content main lacks.\n");
  }
  // REPORTS, never refuses on a finding. A stranded branch is a question for a person -- rebase it, open a
  // PR, or delete it -- and a non-zero exit here would put this in a gate's way rather than in a reader's.
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
