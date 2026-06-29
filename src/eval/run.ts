/**
 * Judge eval runner.
 *
 * Runs the judge over the labeled fixtures and scores its findings against
 * ground truth, at the WCAG-criterion level. Reports recall (did it catch the
 * observable failures?) and precision (did it flag anything it shouldn't?).
 *
 * Usage:
 *   npm run eval                 # all cases, 1 run each
 *   npm run eval -- w3c-bad-before
 *   EVAL_RUNS=3 npm run eval     # repeat each case to measure consistency
 *
 * Fixtures are frozen transcripts, so this evaluates the JUDGE, not capture.
 */
import { existsSync, readFileSync } from "node:fs";
import { judge } from "../spike/judge.js";
import { EVAL_CASES, type EvalCase } from "./cases.js";
import { evaluateFitness, thresholdsFromEnv } from "./fitness.js";

const RUNS = Number(process.env.EVAL_RUNS || 1);

/** "1.1.1 Non-text Content (A)" -> "1.1.1" */
function criterion(wcag: string): string {
  const m = wcag.match(/(\d+\.\d+\.\d+)/);
  return m ? m[1] : wcag.trim();
}

interface RunScore {
  found: string[];
  recall: number;
  precision: number;
  caught: string[];
  missed: string[];
  falsePositives: string[];
}

async function scoreOnce(c: EvalCase): Promise<RunScore> {
  const data = JSON.parse(readFileSync(c.fixture, "utf8")) as {
    url: string;
    screenReader?: string;
    transcript: string[];
    structure?: { headings: string[]; landmarks: string[]; formFields: string[] };
    interaction?: { controls: string[]; stateChanges: { control: string; after: string }[] };
  };
  const verdict = await judge({
    url: data.url,
    task: c.task,
    screenReader: data.screenReader ?? "NVDA",
    transcript: data.transcript,
    structure: data.structure,
    interaction: data.interaction,
  });
  const found = Array.from(new Set(verdict.findings.map((f) => criterion(f.wcag))));
  const allow = new Set(c.allow);
  const caught = c.expect.filter((x) => found.includes(x));
  const missed = c.expect.filter((x) => !found.includes(x));
  const falsePositives = found.filter((x) => !allow.has(x));
  const recall = c.expect.length ? caught.length / c.expect.length : 1;
  const precision = found.length ? found.filter((x) => allow.has(x)).length / found.length : 1;
  return { found, recall, precision, caught, missed, falsePositives };
}

const pct = (n: number) => `${(n * 100).toFixed(0)}%`;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

// One scored case: its per-run recalls, whether it expects failures, and how
// many false positives the last run produced (the unit the aggregate sums).
interface CaseReport {
  recalls: number[];
  isFailureCase: boolean;
  falsePositives: number;
}

// Score a case (RUNS times), print its block, and return what the aggregate needs.
async function reportCase(c: EvalCase): Promise<CaseReport> {
  process.stderr.write(`Scoring ${c.id} ...\n`);
  const scores: RunScore[] = [];
  for (let i = 0; i < RUNS; i++) scores.push(await scoreOnce(c));
  const recalls = scores.map((s) => s.recall);
  const last = scores[scores.length - 1];
  const isFailureCase = c.expect.length > 0;
  printCaseScore(c, last, recalls, isFailureCase);
  return { recalls, isFailureCase, falsePositives: last.falsePositives.length };
}

function printCaseScore(c: EvalCase, last: RunScore, recalls: number[], isFailureCase: boolean): void {
  console.log(`# ${c.id}${isFailureCase ? "" : "  (conformant: expect no findings)"}`);
  console.log(`  expect:    [${c.expect.join(", ") || "(none)"}]`);
  console.log(`  found:     [${last.found.join(", ") || "(none)"}]${RUNS > 1 ? " (last run)" : ""}`);
  if (isFailureCase) {
    const range = RUNS > 1 ? ` (min ${pct(Math.min(...recalls))}, max ${pct(Math.max(...recalls))})` : "";
    console.log(`  recall:    ${pct(mean(recalls))}${range}  caught [${last.caught.join(", ") || "-"}]  missed [${last.missed.join(", ") || "-"}]`);
  }
  console.log(`  false positives: ${last.falsePositives.length} [${last.falsePositives.join(", ") || "none"}]`);
  if (c.notes) console.log(`  note: ${c.notes}`);
  console.log("");
}

async function main(): Promise<void> {
  const filter = process.argv[2];
  // Substring match so e.g. `npm run eval -- tut-` runs all tutorial cases.
  const matched = filter ? EVAL_CASES.filter((c) => c.id.includes(filter)) : EVAL_CASES;
  if (!matched.length) {
    console.error(`No eval case matches "${filter}". Known: ${EVAL_CASES.map((c) => c.id).join(", ")}`);
    process.exit(1);
  }

  // A case whose fixture has not been captured yet (authored page awaiting the
  // NVDA worker) is skipped, not an error: it does not exist to score.
  const cases = matched.filter((c) => existsSync(c.fixture));
  const pending = matched.filter((c) => !existsSync(c.fixture));
  if (pending.length) {
    console.log(`Pending capture (skipped — author'd, awaiting NVDA worker): ${pending.map((c) => c.id).join(", ")}\n`);
  }
  if (!cases.length) {
    console.log("No captured fixtures to score yet.");
    return;
  }

  console.log(`a11y-witness judge eval  (${RUNS} run(s) per case)\n`);
  const failureRecall: number[] = []; // recall, only on cases with expected failures
  let totalFalsePositives = 0; // summed across the last run of every case
  let conformantFalsePositives = 0; // false positives on conformant (expect-none) cases

  for (const c of cases) {
    const report = await reportCase(c);
    if (report.isFailureCase) failureRecall.push(...report.recalls);
    totalFalsePositives += report.falsePositives;
    if (!report.isFailureCase) conformantFalsePositives += report.falsePositives;
  }

  const recall = failureRecall.length ? mean(failureRecall) : 1;
  console.log(
    `AGGREGATE  recall ${pct(recall)} (over ${failureRecall.length} failure-case run(s))  |  ` +
      `false positives ${totalFalsePositives} total, ${conformantFalsePositives} on conformant pages`
  );

  // Fitness-function gate (opt-in via EVAL_GATE): fail the run if judge quality
  // regresses below the thresholds, so it can be used as a regression gate.
  if (process.env.EVAL_GATE) {
    const thresholds = thresholdsFromEnv();
    const fitness = evaluateFitness({ recall, conformantFP: conformantFalsePositives }, thresholds);
    console.log(fitness.pass ? "\nFITNESS: PASS" : `\nFITNESS: FAIL — ${fitness.reasons.join("; ")}`);
    if (!fitness.pass) process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
