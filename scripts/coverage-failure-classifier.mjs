#!/usr/bin/env node
// A NIGHTLY FAILURE COMMENT THAT SAYS "coverage failed" IS NOT A FINDING -- #169, coverage.yml's own
// reader.
//
// #166 moved `npm run coverage` off the PR path and onto a nightly `coverage.yml`, which comments on #169
// when it goes red -- the same pattern `board-liveness.yml` uses against #20, "a schedule nobody reads is
// a gate that fails quietly." But `if: failure()` on the whole job fires identically whichever of THREE
// unrelated things happened, and the comment it posted named none of them:
//
//   - `npm ci` or `npm run build` failed -- an INFRASTRUCTURE problem. Coverage was never measured at
//     all, and there is nothing here about the repository's test coverage to act on.
//   - a TEST failed -- node's test runner exits non-zero on a real assertion failure, which c8 propagates
//     as ITS OWN exit code. That is a test regression, not a coverage regression, and reads #169's own
//     purpose backwards if reported as one.
//   - c8 itself found a metric below `.c8rc.json`'s threshold -- THE ACTUAL FINDING this issue exists for.
//
// Collapsing three causes into one message is this repository's own most-recorded shape --
// `merge-guard.mjs` (#161) drew the identical distinction between "no check ran" and "a check failed",
// and `workflow-run-liveness.mjs` (#118) generalised it. This is the same discipline pointed at a
// different silence: a comment that says "failed" without saying which of three things happened is a
// comment nobody can act on without first re-deriving what the workflow already knew and threw away.
//
// PURE, so every shape is testable without a real CI run -- including the one that matters most and
// cannot be produced on demand: c8's real threshold-miss message, `ERROR: Coverage for lines (76.2%) does
// not meet global threshold (78%)` (verbatim from `node_modules/c8/lib/commands/check-coverage.js`).
import { readFileSync } from "node:fs";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
// RELATIVE, NOT `@a11y-witness/worker-fleet/cli-flags` -- same reason `ci-changed.mjs` gives for its own
// identical choice: this runs from `coverage.yml`'s OWN failure step, which must report an `npm ci`
// failure cleanly -- and if `npm ci` never succeeded, the workspace symlink the package specifier resolves
// through was never created. A relative import to plain `.mjs` source costs nothing and cannot fail this
// way.
import { refuseUnknownFlags, flagValue } from "../packages/worker-fleet/src/cli-flags.mjs";

export const KIND = {
  INFRA: "INFRA",             // setup failed; coverage was never measured
  TEST_FAILURE: "TEST_FAILURE", // a test failed; not a coverage question at all
  REGRESSION: "REGRESSION",   // c8 found a real metric below threshold -- the actual finding
  UNKNOWN: "UNKNOWN",         // the job failed and neither pattern above matched -- never silently "fine"
};

/** c8's own error line, verbatim, from `checkCoverage()` in `node_modules/c8/lib/commands/check-coverage.js`. */
const THRESHOLD_MISS = /ERROR: Coverage for (\w+) \(([\d.]+)%\) does not meet (?:global )?threshold \((\d+)%\)/g;

/** node's built-in test runner's own summary line, printed once per invocation. */
const TEST_SUMMARY_FAIL = /ℹ fail (\d+)/;

/**
 * @param {{ciOutcome: string, buildOutcome: string, coverageLog: string | null}} facts
 *   `ciOutcome`/`buildOutcome` are GitHub Actions step `outcome` values (`success`/`failure`/`skipped`/
 *   `cancelled`) for the `npm ci` and `npm run build` steps; `coverageLog` is the coverage step's own
 *   captured stdout+stderr, or `null` if it could not be read.
 * @returns {{kind: string, detail: string, thresholdMisses?: {metric: string, actual: number, threshold: number}[],
 *            testsFailed?: number}}
 */
export function classifyCoverageFailure({ ciOutcome, buildOutcome, coverageLog }) {
  if (ciOutcome === "failure") {
    return { kind: KIND.INFRA,
      detail: "`npm ci` failed before coverage could run. This is an infrastructure problem, not a "
        + "coverage regression -- there is no coverage measurement to read." };
  }
  if (buildOutcome === "failure") {
    return { kind: KIND.INFRA,
      detail: "`npm run build` failed before coverage could run. This is an infrastructure problem, not "
        + "a coverage regression -- there is no coverage measurement to read." };
  }
  if (typeof coverageLog !== "string" || coverageLog.length === 0) {
    return { kind: KIND.UNKNOWN,
      detail: "the job failed, but the coverage step's own output could not be read -- this is "
        + "INCONCLUSIVE, not a confirmed regression. Check the run directly." };
  }

  const thresholdMisses = [...coverageLog.matchAll(THRESHOLD_MISS)]
    .map(([, metric, actual, threshold]) => ({ metric, actual: Number(actual), threshold: Number(threshold) }));
  const failMatch = coverageLog.match(TEST_SUMMARY_FAIL);
  const testsFailed = failMatch ? Number(failMatch[1]) : 0;

  if (thresholdMisses.length > 0) {
    return { kind: KIND.REGRESSION, thresholdMisses, testsFailed,
      detail: thresholdMisses.map((m) => `**${m.metric}**: ${m.actual}% (threshold ${m.threshold}%)`).join(", ")
        + (testsFailed > 0 ? ` — and ${testsFailed} test(s) also failed` : "") };
  }
  if (testsFailed > 0) {
    return { kind: KIND.TEST_FAILURE, testsFailed,
      detail: `${testsFailed} test(s) failed. This is a TEST regression, not a coverage regression -- `
        + "c8 propagates the test runner's own exit code, and no threshold was actually breached." };
  }
  return { kind: KIND.UNKNOWN,
    detail: "the coverage step failed, but neither a threshold miss nor a test failure was found in its "
      + "output. INCONCLUSIVE -- check the run directly rather than assuming either cause." };
}

/** The comment body coverage.yml posts to #169 -- one function, so the workflow and its own tests agree
 *  on exactly what a reader sees. */
export function commentBody({ verdict, runUrl }) {
  const headline = {
    [KIND.INFRA]: "Nightly coverage did not run — INFRASTRUCTURE FAILURE, not a coverage finding",
    [KIND.TEST_FAILURE]: "Nightly coverage run failed a TEST, not a coverage threshold",
    [KIND.REGRESSION]: "Nightly coverage REGRESSION",
    [KIND.UNKNOWN]: "Nightly coverage failed — CANNOT TELL why",
  }[verdict.kind];
  return `**${headline}**\n\n${verdict.detail}\n\n${runUrl}`;
}

function main() {
  const KNOWN_FLAGS = ["--ci-outcome", "--build-outcome", "--log", "--run-url"];
  refuseUnknownFlags(KNOWN_FLAGS, { entry: import.meta.url, command: "node scripts/coverage-failure-classifier.mjs" });

  const ciOutcome = flagValue(process.argv, "ci-outcome");
  const buildOutcome = flagValue(process.argv, "build-outcome");
  const logPath = flagValue(process.argv, "log");
  const runUrl = flagValue(process.argv, "run-url") ?? "";
  if (!ciOutcome || !buildOutcome || !logPath) {
    console.error("Usage: node scripts/coverage-failure-classifier.mjs "
      + "--ci-outcome=<success|failure|skipped> --build-outcome=<...> --log=<path> [--run-url=<url>]\n"
      + "Classifies why the nightly coverage job failed and prints the #169 comment body to stdout.");
    process.exit(2);
  }

  // The log genuinely could not be read (an infra failure before the coverage step ever ran, or a
  // permissions problem) -- `classifyCoverageFailure` treats `null` here as UNKNOWN rather than guessing.
  let coverageLog;
  try {
    coverageLog = readFileSync(logPath, "utf8");
  } catch {
    coverageLog = null;
  }

  const verdict = classifyCoverageFailure({ ciOutcome, buildOutcome, coverageLog });
  process.stdout.write(commentBody({ verdict, runUrl }));
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) main();
