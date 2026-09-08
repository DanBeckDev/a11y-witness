// #493: "Could not post the PR comment. The job summary still has the report" used to print unconditionally
// on ANY `gh pr comment` failure -- including the one the V1 rehearsal hit on all three of its runs, where
// the build died before `run.ts` ever produced a summary at all. `run.ts` writes $GITHUB_STEP_SUMMARY and
// its `--summary-out` file in the SAME call, after the SAME early-exit checks (a missing/unreadable result,
// or a result with no verdict) -- so an absent summary FILE means the step summary is absent too, never
// just a different place the reader missed. This repo's own most-recorded fault class -- "a diagnostic that
// cannot report itself" -- pointed at a user instead of at us.
//
// Deliberately separate from `run.ts`, mirroring that file's own split from `action.yml`: the POLICY (which
// message, and whether the file genuinely exists) is testable here without a real `gh` call; the mechanics
// of actually posting stay in `main()`, which nothing but `action.yml` invokes.
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { flagValue } from "@a11ign/worker-fleet/cli-flags";

/**
 * Does a real summary file exist at `path`? The ONE fact this module exists to check before choosing a
 * message, rather than assuming the earlier step succeeded because this step was reached at all --
 * `if: always()` on the caller means this runs whether or not anything upstream produced output.
 * @param {string} path
 * @returns {boolean}
 */
export function reportSummaryExists(path: string): boolean {
  return existsSync(path);
}

/**
 * The message to print when the PR comment could not be posted, as a pure function of whether a real
 * report exists -- #493's own acceptance: the two states must never print the same sentence. `reportExists:
 * true` means `gh pr comment` itself failed (network, permissions, rate limit) while a real report sits in
 * the job summary, so the ORIGINAL sentence is honest there and stays. `reportExists: false` means there
 * was never anything to post -- and pointing the reader at a job summary that was never written is worse
 * than saying nothing, per #493's own framing: "they now doubt their own reading rather than the tool."
 * @param {boolean} reportExists
 * @returns {string}
 */
export function commentFailureMessage(reportExists: boolean): string {
  return reportExists
    ? "::warning::Could not post the PR comment. The job summary still has the report."
    : "::warning::No report was produced -- the run failed before a result existed to summarize. "
      + "See the earlier step's own error above for what actually went wrong.";
}

function main(): void {
  const arg = (name: string): string | undefined => flagValue(process.argv, name);
  const summaryPath = arg("summary");
  const prNumber = arg("pr");
  const repo = arg("repo");
  if (!summaryPath || !prNumber || !repo) {
    process.stderr.write(
      "usage: tsx packages/cli/src/action/post-comment.ts --summary=<file> --pr=<n> --repo=<owner/name>\n");
    process.exit(2);
  }

  // CHECKED, NOT ASSUMED -- the whole point of this file. A missing summary is not something `gh pr
  // comment` needs to be asked about; there is nothing honest it could report by being run against a file
  // that was never written.
  if (!reportSummaryExists(summaryPath)) {
    process.stderr.write(`${commentFailureMessage(false)}\n`);
    return;
  }

  try {
    execFileSync("gh",
      ["pr", "comment", prNumber, "--body-file", summaryPath, "--edit-last", "--create-if-none", "--repo", repo],
      { stdio: "inherit" });
  } catch {
    process.stderr.write(`${commentFailureMessage(true)}\n`);
  }
}

// RUN ONLY WHEN INVOKED -- `pathToFileURL`, never a template literal, for the identical reason `run.ts`
// carries beside its own copy of this guard: concatenation does not percent-encode a space in the path.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
