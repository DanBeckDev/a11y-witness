#!/usr/bin/env node
// @ts-check
/**
 * THE MERGE QUEUE IS THE OPEN PRs, AND THIS REFUSES ANY OTHER ROUTE TO `main`.
 *
 * Written 2026-09-06, hours after the dispatcher merged two commits of a FROZEN branch onto `main` by
 * name -- `git merge origin/agent/ci-rebuild` inside a loop over branch names -- while its PR was still
 * open and its author was still fixing the six bugs its own first CI run had surfaced. `main` went red:
 * the same commit added an unfinished `ci.yml` and removed the `lint.yml` it replaced, so there was no
 * fallback.
 *
 * TWO RULES WERE BROKEN IN ONE ACT AND NEITHER WAS FORGOTTEN. The dispatcher had relayed both within the
 * hour -- the PR is the unit of review, and `.github/workflows` was that worker's alone until its PR
 * landed. **The loop took BRANCH NAMES, so it could not see a PR, a review state or a check.** A routine
 * that cannot express a rule will break it, however well the rule is known: this is the repo's own "a
 * check that cannot express the fault" pointed at a procedure instead of a test.
 *
 * The local gate could not have caught it either. `npm test` does not run the workflows, so a CI-only
 * change is invisible to every check run before a push -- the first CI-only blind spot named here.
 *
 * So the queue is asked for, never assembled:
 *
 *   node scripts/merge-queue.mjs            # what is mergeable RIGHT NOW, and why each other PR is not
 *   node scripts/merge-queue.mjs --merge N  # merge PR N through `gh pr merge`, or refuse with the reason
 *
 * It never runs `git merge` and never pushes. Landing a PR is `gh pr merge`, which cannot merge a branch
 * that has no PR, and refuses one whose checks are not green.
 *
 * Exit codes:
 *   0  the queue was read (or the named PR merged)
 *   1  the named PR is NOT mergeable -- the reason is printed
 *   2  could not tell: `gh` missing, unauthenticated, or no PRs at all
 *
 * 2 is distinct from 0 for this repo's most-recorded reason: "could not ask" and "asked and found
 * nothing" must never be the same answer. An empty queue reported as a clean read is a check that passes
 * having examined nothing.
 */
import { appendFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import { sandboxGitEnv } from "./git-env.mjs";
import { gitCommonDir } from "./merge-guard.mjs";
import { REPO } from "./repo-identity.mjs";
import { refuseUnknownFlags } from "@a11y-witness/worker-fleet/cli-flags";

/** @param {string[]} args */
function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8", env: sandboxGitEnv() });
}

/**
 * Each lookup returns null on failure rather than an empty answer -- "could not ask" is not "found nothing".
 * @template T
 * @param {() => T} fn
 * @returns {T | null}
 */
function lookup(fn) {
  try {
    return fn();
  } catch (error) {
    void error;
    return null;
  }
}

/**
 * Why a PR may not be merged, or null when it may.
 *
 * MERGEABLE and the check rollup are separate questions and both must be asked: a PR can be free of
 * conflicts and still failing, and it can be green and still conflicting. Reporting one as the other is
 * how "it looked ready" happens.
 *
 * @param {{number: number, mergeable: string, mergeStateStatus: string, isDraft: boolean,
 *          statusCheckRollup?: {conclusion?: string, name?: string}[] | null}} pr
 * @returns {string | null}
 */
export function refusalFor(pr) {
  if (pr.isDraft) return "draft";
  if (pr.mergeable === "CONFLICTING") return "conflicts with main — its OWNER rebases it, not the dispatcher";
  if (pr.mergeable === "UNKNOWN") return "GitHub has not computed mergeability yet — ask again in a moment";
  const checks = pr.statusCheckRollup ?? [];
  // No checks at all is NOT green. Before branch protection exists, a PR with no run is indistinguishable
  // from one whose workflow never triggered, and that is the state that let a frozen branch through.
  if (checks.length === 0) return "no checks have run — a PR with no run is not a green PR";
  const bad = checks.filter((c) => c.conclusion && !["SUCCESS", "NEUTRAL", "SKIPPED"].includes(c.conclusion));
  if (bad.length > 0) return `checks failing: ${bad.map((c) => c.name ?? "?").join(", ")}`;
  const pending = checks.filter((c) => !c.conclusion);
  if (pending.length > 0) return `${pending.length} check(s) still running`;
  return null;
}

// ENTRY-POINT GUARD, and this file learned why the hard way. Without it, importing this module to test
// `refusalFor` RAN the queue listing and then `process.exit(0)` -- so the test file reported PASS having
// executed none of its eight assertions. A test that imports a script with top-level side effects tests
// nothing and says it passed, which is the vacuity defect this repo names most.
//
// `pathToFileURL(...).href` and not string concatenation: a path containing a space is not
// percent-encoded by `+`, so the guard silently never matches and `main()` never runs. That is
// `entry-points.test.ts`'s own rule, which this file also failed on its first draft.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}

/**
 * `--merge=<n>` AND `--merge <n>` MUST DO THE SAME THING (#178).
 *
 * `--event=`, `--base=`, `--only=`, `--worker=`, `--ref=` are all equals-joined -- that is this repo's
 * dominant CLI convention -- but this file's own hand-rolled parser matched only the space-separated
 * form. The equals form was silently accepted (it is a known flag) and then ignored, so
 * `--merge=156` fell through to the LIST branch and exited 0 having merged nothing. This is on the
 * highest-consequence CLI in the repo: a caller who types the convention every other command here uses
 * gets a listing, reads it as "nothing to merge", and nothing anywhere says a merge did not happen.
 *
 * Note the class: `refuseUnknownFlags` (a different file) closed *an unknown flag is discarded and the
 * default runs*. This is *a KNOWN flag in a valid shape is discarded and the default runs* -- the same
 * failure, one step past the guard built for it. A flag-name guard cannot see this; only reading the
 * value in both shapes can.
 *
 * @param {string[]} argv
 * @returns {string | null}
 */
export function wantedPrNumber(argv) {
  const equalsForm = argv.find((arg) => arg.startsWith("--merge="));
  if (equalsForm) return equalsForm.slice("--merge=".length);
  const spaceIndex = argv.indexOf("--merge");
  return spaceIndex === -1 ? null : (argv[spaceIndex + 1] ?? null);
}

/**
 * A BRANCH'S POST-MERGE COMMITS ARE INVISIBLE, AND THE EVIDENCE THAT WOULD CATCH IT CAN ITSELF VANISH (#152).
 *
 * Found recovering #123: commit `23a2a3e2` on `agent/ci-rebuild` added real test coverage, but it landed
 * on that branch AFTER PR #109 had already merged an earlier point of it. Nobody decided against the
 * commit; it fell down the gap between "this branch's PR merged" and "this branch stopped moving". The
 * obvious after-the-fact check -- `git log origin/<branch> --not origin/main` -- caught nothing on a
 * second run, because the branch ref had ALREADY moved (a force-push, a reset, or `--delete-branch`
 * itself), erasing the exact evidence it needs. **The check is only useful run SOON after a merge, not as
 * a standing audit of history.**
 *
 * So this checks at THE ONE POINT the evidence is guaranteed reachable: right after `gh pr merge`, before
 * the branch is deleted. `main` now contains everything the PR's head had; if the LIVE branch ref still
 * has commits `main` does not, something landed on it that this merge never absorbed. `ahead_by` from
 * `compare/main...<branch>` is that fact, asked of GitHub directly -- no local fetch of an arbitrary
 * contributor's branch required.
 *
 * @param {{ahead_by?: number, commits?: {sha: string, commit?: {message?: string}}[]} | null} compareResult
 * @returns {{count: number, commits: {sha: string, message: string}[]} | null} null means INCONCLUSIVE
 */
export function orphanedCommitsFrom(compareResult) {
  if (!compareResult || typeof compareResult.ahead_by !== "number") return null;
  return {
    count: compareResult.ahead_by,
    commits: (compareResult.commits ?? []).map((c) => (
      { sha: c.sha, message: String(c.commit?.message ?? "").split("\n")[0] }
    )),
  };
}

/**
 * Never a silent no-op -- the record is the point, exactly like #201's disagreement log.
 * @param {string} path
 * @param {object} entry
 */
function appendJsonl(path, entry) {
  try {
    appendFileSync(path, `${JSON.stringify(entry)}\n`);
  } catch (error) {
    throw new Error(`could not write the orphaned-branch log at ${path}: `
      + `${/** @type {Error} */ (error).message}`, { cause: error });
  }
}

export function orphanedBranchLogPath() {
  return `${gitCommonDir()}/orphaned-branch-log.jsonl`;
}

/**
 * Merges, then checks the branch was fully absorbed BEFORE deciding whether to delete it -- never
 * `gh pr merge --delete-branch` in one call, which deletes the one piece of evidence that could show a
 * later commit was left behind. Every check is recorded, clean or not, for the same reason #201 records
 * agreement as well as disagreement: an absent line here would be indistinguishable from "never checked".
 *
 * @param {{number: number, headRefName: string}} pr
 */
function mergeAndCheckOrphans(pr) {
  process.stdout.write(gh(["pr", "merge", String(pr.number), "--merge"]));

  const compareResult = lookup(() => JSON.parse(
    gh(["api", `repos/${REPO}/compare/main...${pr.headRefName}`])));
  const orphaned = orphanedCommitsFrom(compareResult);
  appendJsonl(orphanedBranchLogPath(), {
    prNumber: pr.number, branch: pr.headRefName, at: new Date().toISOString(),
    orphanedCommitCount: orphaned?.count ?? null,
  });

  if (orphaned === null) {
    process.stderr.write(`could not verify \`${pr.headRefName}\` was fully absorbed by #${pr.number} -- `
      + "leaving the branch undeleted rather than guessing.\n");
    return;
  }
  if (orphaned.count > 0) {
    process.stderr.write(`WARNING: \`${pr.headRefName}\` has ${orphaned.count} commit(s) beyond what `
      + `#${pr.number} just merged. NOT deleting it -- someone pushed to this branch after its own PR, `
      + "and that work needs its own PR before the branch goes away:\n"
      + orphaned.commits.map((c) => `  ${c.sha.slice(0, 10)} ${c.message}`).join("\n") + "\n");
    return;
  }

  try {
    gh(["api", "-X", "DELETE", `repos/${REPO}/git/refs/heads/${pr.headRefName}`]);
  } catch (error) {
    process.stderr.write(`merged #${pr.number} cleanly, but could not delete \`${pr.headRefName}\`: `
      + `${/** @type {Error} */ (error).message}\n`);
  }
}

function main() {
  // Guarded per #164: reads --merge; --json/--state go to gh.
  refuseUnknownFlags(["--merge"], { entry: import.meta.url, command: "node scripts/merge-queue.mjs" });
  const wanted = wantedPrNumber(process.argv);

  let raw = "";
  try {
    raw = gh(["pr", "list", "--state", "open", "--json",
      "number,title,headRefName,mergeable,mergeStateStatus,isDraft,statusCheckRollup"]);
  } catch (error) {
    process.stderr.write(`could not ask GitHub for the queue: ${/** @type {Error} */ (error).message}\n`);
    process.exit(2);
  }

  const prs = JSON.parse(raw);
  if (prs.length === 0) {
    process.stderr.write("INCONCLUSIVE: no open PRs. An empty queue and an unread one are different.\n");
    process.exit(2);
  }

  if (!wanted) {
    for (const pr of prs) {
      const why = refusalFor(pr);
      process.stdout.write(`${why ? "HELD " : "READY"}  #${pr.number}  ${pr.headRefName}\n`
        + (why ? `        ${why}\n` : ""));
    }
    process.exit(0);
  }

  const pr = prs.find((/** @type {{number: number}} */ p) => String(p.number) === wanted);
  if (!pr) {
    process.stderr.write(`#${wanted} is not an open PR. The queue is the open PRs; nothing else merges.\n`);
    process.exit(1);
  }
  const why = refusalFor(pr);
  if (why) {
    process.stderr.write(`REFUSING to merge #${pr.number}: ${why}\n`);
    process.exit(1);
  }
  mergeAndCheckOrphans(pr);
}
