#!/usr/bin/env node
// command: turn a nightly coverage.yml failure comment into an actual finding, not just 'it failed'
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
// RELATIVE, NOT `@a11ign/worker-fleet/cli-flags` -- same reason `ci-changed.mjs` gives for its own
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

/**
 * NODE'S TEST RUNNER HAS TWO REPORTERS AND THIS READ ONLY ONE OF THEM -- #1089.
 *
 * `/ℹ fail (\d+)/` is the **spec** reporter's glyph, which is the default on a TTY and on node 24. CI is
 * neither: it runs node 22 with no TTY, where the default is **TAP**. Measured on both, same command shape:
 *
 *     node 22, TAP     not ok 2 - fails on purpose      # fail 1
 *     node 24, spec    ✖ fails on purpose (0.36ms)      ℹ fail 1
 *
 * So `testsFailed` was **0 for every CI run there has ever been**, and run 34677157881's single, named
 * failure classified as CANNOT TELL. The unit tests passed because the fixture was typed from what the
 * author's terminal showed -- a fixture in a format the producer does not emit here.
 *
 * `not ok` is NOT the answer on its own, and I measured that rather than taking it: the spec reporter
 * prints `✖`, never `not ok`. **Both are read, and so are both summary lines.**
 */
const TEST_FAILURE_PATTERNS = Object.freeze({
  tapSummary: /^# fail (\d+)$/m,
  specSummary: /^ℹ fail (\d+)$/m,
  tapCase: /^not ok \d+ - (.+)$/gm,
  specCase: /^✖ (.+?)(?: \([\d.]+m?s\))?$/gm,
});

/**
 * How many tests failed, and which -- `null` when the log carries NEITHER reporter's summary.
 *
 * **`null` is the point.** The old code read `failMatch ? Number(failMatch[1]) : 0`, so a log it could not
 * parse and a log with nothing wrong produced the same `0`. That is the conflation this repository records
 * most, and here it turned a named test failure into CANNOT TELL for every CI run.
 *
 * @param {string} log
 * @returns {{ count: number, names: string[] } | null}
 */
export function testFailuresIn(log) {
  const summary = TEST_FAILURE_PATTERNS.tapSummary.exec(log) ?? TEST_FAILURE_PATTERNS.specSummary.exec(log);
  if (summary === null) return null;
  const names = [
    ...[...log.matchAll(TEST_FAILURE_PATTERNS.tapCase)].map((m) => m[1].trim()),
    ...[...log.matchAll(TEST_FAILURE_PATTERNS.specCase)].map((m) => m[1].trim()),
  ].filter((n) => n !== "failing tests:");
  return { count: Number(summary[1]), names: [...new Set(names)] };
}

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
  const failures = testFailuresIn(coverageLog);
  const testsFailed = failures?.count ?? 0;
  const named = failures?.names ?? [];

  if (thresholdMisses.length > 0) {
    return { kind: KIND.REGRESSION, thresholdMisses, testsFailed,
      detail: thresholdMisses.map((m) => `**${m.metric}**: ${m.actual}% (threshold ${m.threshold}%)`).join(", ")
        + (testsFailed > 0 ? ` — and ${testsFailed} test(s) also failed` : "") };
  }
  if (testsFailed > 0) {
    return { kind: KIND.TEST_FAILURE, testsFailed,
      detail: `${testsFailed} test(s) failed${named.length > 0 ? `: ${named.join(", ")}` : ""}. This is a `
        + "TEST regression, not a coverage regression -- c8 propagates the test runner's own exit code, "
        + "and no threshold was actually breached." };
  }
  // #1089: "no summary line at all" is NOT "no failures". Said separately, because the two need different
  // actions -- one is a clean run that failed for a third reason, the other is a log this cannot read.
  if (failures === null) {
    return { kind: KIND.UNKNOWN,
      detail: "the coverage step failed and its output carries NEITHER reporter's test summary (`# fail` "
        + "for TAP, `ℹ fail` for spec), so the number of failing tests could not be read at all. "
        + "INCONCLUSIVE -- this is a log this classifier cannot parse, not a run with nothing wrong." };
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
