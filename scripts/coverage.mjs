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

/** Only reachable with a real screen reader on a real desktop; see CLAUDE.md. */
const NVDA_BOUND = new Set([
  "capture-core.mjs", "server.mjs", "capture.mjs", "index.mjs", "capture-check.mjs", "capture-books.mjs",
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
const untested = [];
for (const file of sourceFiles()) {
  const lines = codeLines(file);
  if (NVDA_BOUND.has(basename(file))) { excluded += lines; continue; }
  counted += lines;
  const pct = percentages.get(basename(file));
  if (pct === undefined) untested.push([lines, file]);
  else covered += (lines * pct) / 100;
}

const actual = (100 * covered) / counted;
process.stdout.write(`\ncoverage ${actual.toFixed(1)}% of ${counted} testable code lines (target ${TARGET}%)\n`);
process.stdout.write(`excluded ${excluded} lines in ${NVDA_BOUND.size} NVDA-bound files — `
  + `covered by capture:check against a live worker, not by unit tests\n`);
if (untested.length) {
  process.stdout.write(`\n${untested.length} file(s) no test loads at all (counted as 0%), largest first:\n`);
  for (const [lines, file] of untested.sort((a, b) => b[0] - a[0]).slice(0, 15)) {
    process.stdout.write(`  ${String(lines).padStart(4)}  ${file}\n`);
  }
}
process.exit(actual >= TARGET ? 0 : 1);
