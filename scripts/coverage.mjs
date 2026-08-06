// True line coverage across EVERY source file — not just the ones a test happens to load.
//
// `node --test --experimental-test-coverage` only reports files that were imported, so a file with no test at
// all is invisible to it rather than counted as zero. Measured on this repo the difference is not small:
// **85.9% reported, 39.9% actual**, because 43 of 86 source files had no test loading them. A number that
// describes half the codebase is the same failure as a check that examines nothing.
//
// Files that can only run against real NVDA on Windows are excluded from the denominator and NAMED here, with
// their line count printed every run, so the exclusion is a stated decision rather than a silent one. They are
// covered by `npm run capture:check` and `evidence:check` against a live worker instead.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename } from "node:path";

/**
 * Files a unit test cannot reach, each with what it actually requires.
 *
 * Excluded from the denominator BY NAME, because a coverage number that quietly includes code no test could
 * ever execute is not a measurement of anything. The count is printed on every run so the exclusion stays a
 * stated decision, and each entry says what it needs — if that requirement ever goes away, so does the excuse.
 *
 * The line to hold: excluded because the file IS an integration with something a test cannot have, NOT because
 * testing it looks like work. Anything with a pure core stays in scope, and where a file is unimportable only
 * because it runs its program on import, the fix is a main guard, not an exclusion.
 *
 * These surfaces are covered instead by `capture:check` and `evidence:check` against a live worker,
 * `gate:isolation` against real tarballs, and `npm run eval` against the real scorer.
 */
const UNTESTABLE = new Map([
  // Needs a real screen reader driving a real desktop.
  ["packages/nvda-worker/src/capture-core.mjs", "drives NVDA through guidepup"],
  ["packages/nvda-worker/src/server.mjs", "binds a port and drives NVDA"],
  ["packages/nvda-worker/src/capture.mjs", "one-shot capture CLI on the guest"],
  ["packages/nvda-worker/src/index.mjs", "re-exports capture-core, so importing it needs guidepup"],
  ["packages/lab/src/harnesses/capture-check.mjs", "drives a live worker over HTTP"],
  ["packages/lab/src/harnesses/capture-books.mjs", "drives a live worker over HTTP"],
  ["packages/lab/src/harnesses/run-spike.ts", "the original spike harness; imports guidepup"],
  // Needs UTM and real virtual machines.
  ["packages/worker-fleet/src/doctor.mjs", "shells out to utmctl and probes real guests"],
  ["packages/worker-fleet/src/deploy-worker.mjs", "pushes files to guests and reboots them"],
  ["packages/worker-fleet/src/check-worker-code.mjs", "probes every guest over HTTP"],
  ["packages/worker-fleet/src/compare-workers.mjs", "benchmarks real guests against each other"],
  ["packages/worker-fleet/src/normalise-fleet.mjs", "reconfigures real guests"],
  ["packages/worker-fleet/src/guest-run.mjs", "runs commands inside a guest via utmctl"],
  // Needs a live worker, a served corpus, or both.
  ["packages/cli/src/cli.ts", "orchestrates a real capture end to end"],
  ["packages/lab/src/training/capture-screenreader-dataset.mjs", "runs the corpus against live workers"],
  ["packages/lab/src/training/repeat-capture.mjs", "repeats real captures against a worker"],
  ["packages/lab/scripts/evidence-check.mjs", "recaptures a sample against a live worker"],
  ["packages/lab/scripts/stability-gate.mjs", "captures canaries repeatedly against a worker"],
  ["packages/lab/scripts/bench-capture.mjs", "times real captures"],
  ["packages/lab/scripts/compare-layers.mjs", "runs the CLI against live sites"],
  // Needs Python, torch and an 87 MB encoder.
  ["packages/lab/src/eval/run.ts", "spawns the scorer and needs the venv"],
  ["packages/lab/src/harnesses/judge-file.ts", "spawns a judge backend"],
  ["packages/lab/src/harnesses/judge-sample.ts", "spawns a judge backend"],
  ["packages/scorer/bin/fetch-encoder.mjs", "downloads 87 MB through Python"],
  // Needs a browser engine.
  ["packages/cli/src/scan/axe.ts", "launches Chromium through Playwright"],
  ["packages/cli/src/scan/run-axe.ts", "CLI wrapper around the Playwright scan"],
  // Build/measurement tooling that spawns the toolchain, including this file.
  ["scripts/build-packages.mjs", "spawns tsc"],
  ["scripts/coverage.mjs", "spawns the test runner; measuring the measurer is circular"],
]);

const TARGET = Number(process.env.COVERAGE_TARGET || 80);

const codeLines = (file) =>
  readFileSync(file, "utf8").split("\n")
    .filter((l) => l.trim() && !l.trim().startsWith("//") && !l.trim().startsWith("*") && !l.trim().startsWith("/*"))
    .length;

function sourceFiles() {
  return execFileSync("git", ["ls-files", "packages", "scripts"], { encoding: "utf8" }).split("\n")
    .filter((f) => /\.(mjs|ts)$/.test(f))
    .filter((f) => !f.includes(".test.") && !f.includes("/dist/") && !f.includes("isolation-fixtures")
      && !f.includes("tsconfig-fixtures") && !f.includes("isolation-smoke"));
}

function reportedPercentages() {
  // The runner exits non-zero whenever any test fails, and `execFileSync` throws away its own stdout when it
  // does — so the report has to be read off the error. Without this the whole measurement disappears the first
  // time a test is red, which is exactly when you want the number.
  let out;
  try {
    out = execFileSync("npx", ["tsx", "--test", "--experimental-test-coverage", "packages/*/src/**/*.test.ts"],
      { encoding: "utf8", maxBuffer: 1 << 26, stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    out = String(error.stdout ?? "");
    if (!out) throw error;
    process.stdout.write("note: some tests failed; coverage is still reported below\n");
  }
  const percentages = new Map();
  for (const line of out.split("\n")) {
    const match = /^ℹ\s+(\S+\.(?:mjs|ts|js))\s+\|\s+([\d.]+)/.exec(line);
    if (match) percentages.set(match[1], Number(match[2]));
  }
  return percentages;
}

const percentages = reportedPercentages();
let covered = 0, counted = 0, excluded = 0;
const excludedFiles = [];
const untested = [];
for (const file of sourceFiles()) {
  const lines = codeLines(file);
  if (UNTESTABLE.has(file)) { excluded += lines; excludedFiles.push(file); continue; }
  counted += lines;
  const pct = percentages.get(basename(file));
  if (pct === undefined) untested.push([lines, file]);
  else covered += (lines * pct) / 100;
}

const actual = (100 * covered) / counted;
process.stdout.write(`\ncoverage ${actual.toFixed(1)}% of ${counted} testable code lines (target ${TARGET}%)\n`);
process.stdout.write(`excluded ${excluded} lines in ${excludedFiles.length} file(s) a unit test cannot reach `
  + `(NVDA, utmctl, a live worker, torch, or a browser) — see UNTESTABLE in this script for each reason\n`);
const unlisted = [...UNTESTABLE.keys()].filter((f) => !excludedFiles.includes(f));
if (unlisted.length) {
  // An exclusion for a file that no longer exists is an exclusion nobody notices going stale.
  process.stdout.write(`\nWARNING: ${unlisted.length} excluded path(s) are not tracked source files any more, `
    + `so the exclusion list is drifting:\n  ${unlisted.join("\n  ")}\n`);
}
if (untested.length) {
  process.stdout.write(`\n${untested.length} file(s) no test loads at all (counted as 0%), largest first:\n`);
  for (const [lines, file] of untested.sort((a, b) => b[0] - a[0]).slice(0, 15)) {
    process.stdout.write(`  ${String(lines).padStart(4)}  ${file}\n`);
  }
}
process.exit(actual >= TARGET ? 0 : 1);
