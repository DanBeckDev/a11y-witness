// The Action's entry point: read a witness run's JSON, write the summary, decide the exit code.
//
//   tsx src/action/run.ts --result run.json [--fail-on never|any|blocker|serious|moderate|minor]
//                         [--summary-out summary.md] [--marker a11y-witness]
//
// Deliberately separate from `src/cli.ts`. The CLI's job is to capture and judge; this one's job is to
// present that to GitHub and decide whether the check passes. Keeping them apart means the Action's
// policy is testable (`summary.test.ts`) without a Windows runner, and a change to how findings are
// displayed cannot break how they are produced.
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";

import { renderSummary, shouldFail, type FailOn, type RunResult } from "./summary.js";

const arg = (name: string, fallback?: string): string | undefined =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;

const resultPath = arg("result");
if (!resultPath) {
  process.stderr.write("usage: tsx src/action/run.ts --result=<file.json> [--fail-on=...] [--summary-out=...]\n");
  process.exit(2);
}

const failOn = (arg("fail-on", "never") as FailOn);
const marker = arg("marker", "a11y-witness");

let result: RunResult;
try {
  result = JSON.parse(readFileSync(resolve(resultPath), "utf8")) as RunResult;
} catch (error) {
  // A capture that never produced JSON is an infrastructure failure, not a clean page. Failing loudly
  // here is the difference between "your page is fine" and "we did not manage to look at it" — the
  // distinction this whole project is built around.
  process.stderr.write(`a11y-witness: could not read the run result at ${resultPath}: ${(error as Error).message}\n`);
  process.exit(2);
}

if (!result?.verdict || !Array.isArray(result.verdict.findings)) {
  process.stderr.write("a11y-witness: the run result has no verdict — the judge did not complete, so nothing was assessed.\n");
  process.exit(2);
}

const markdown = renderSummary(result, { marker });

// An unverified capture is an infrastructure failure, not a verdict about the page — so it exits 2, the
// same code used for "could not read the result". Green would say "we checked and it is fine"; red (1)
// would say "your page has a problem". Neither is true: we did not manage to look at it.
//
// The summary is written FIRST so the reader still gets the explanation. Found on gov.uk, where the
// capture read Edge's image-magnifier overlay, the retry warned three times, and the run reported a 4.1.2
// finding about the browser's own Zoom In / Rotate buttons.
const unverified = result.captureVerified === false;

// $GITHUB_STEP_SUMMARY is append-only and shared with other steps, so append rather than overwrite.
const stepSummary = process.env.GITHUB_STEP_SUMMARY;
if (stepSummary) appendFileSync(stepSummary, `${markdown}\n`);

const summaryOut = arg("summary-out");
if (summaryOut) writeFileSync(resolve(summaryOut), `${markdown}\n`, "utf8");
if (!stepSummary && !summaryOut) process.stdout.write(`${markdown}\n`);

// The summary has already been written above, so this only decides the exit code. Writing it again here
// appended it TWICE to $GITHUB_STEP_SUMMARY, which is append-only.
if (unverified) {
  process.stderr.write("a11y-witness: the capture could not be confirmed to have read the requested page; "
    + "reporting no findings. This is a failed measurement, not a clean page.\n");
  process.exit(2);
}

const { findings } = result.verdict;
let fail: boolean;
try {
  fail = shouldFail(findings, failOn);
} catch (error) {
  // An unrecognised `fail-on` is a workflow typo, and the dangerous outcome is treating it as "never":
  // the check goes green and nobody looks again. Refuse instead.
  process.stderr.write(`a11y-witness: ${(error as Error).message}. Use never|any|blocker|serious|moderate|minor.\n`);
  process.exit(2);
}

const counts = findings.reduce<Record<string, number>>((acc, f) => {
  acc[f.severity] = (acc[f.severity] ?? 0) + 1;
  return acc;
}, {});
const breakdown = Object.entries(counts).map(([s, n]) => `${n} ${s}`).join(", ") || "none";
process.stderr.write(`a11y-witness: ${findings.length} finding(s) (${breakdown}); fail-on=${failOn}\n`);

if (fail) {
  process.stderr.write(`a11y-witness: failing the check — findings met the ${failOn} threshold.\n`);
  process.exit(1);
}
