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
import { readFileSync } from "node:fs";
import { judge } from "../spike/judge.js";
import { EVAL_CASES, type EvalCase } from "./cases.js";

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
  };
  const verdict = await judge({
    url: data.url,
    task: c.task,
    screenReader: data.screenReader ?? "NVDA",
    transcript: data.transcript,
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

async function main(): Promise<void> {
  const filter = process.argv[2];
  const cases = filter ? EVAL_CASES.filter((c) => c.id === filter) : EVAL_CASES;
  if (!cases.length) {
    console.error(`No eval case matches "${filter}". Known: ${EVAL_CASES.map((c) => c.id).join(", ")}`);
    process.exit(1);
  }

  console.log(`a11y-witness judge eval  (${RUNS} run(s) per case)\n`);
  const allRecall: number[] = [];
  const allPrecision: number[] = [];

  for (const c of cases) {
    process.stderr.write(`Scoring ${c.id} ...\n`);
    const scores: RunScore[] = [];
    for (let i = 0; i < RUNS; i++) scores.push(await scoreOnce(c));
    const recalls = scores.map((s) => s.recall);
    const precisions = scores.map((s) => s.precision);
    allRecall.push(...recalls);
    allPrecision.push(...precisions);
    const last = scores[scores.length - 1];

    console.log(`# ${c.id}`);
    console.log(`  expect:    [${c.expect.join(", ") || "(none)"}]`);
    console.log(`  found:     [${last.found.join(", ") || "(none)"}]${RUNS > 1 ? " (last run)" : ""}`);
    const range = RUNS > 1 ? ` (min ${pct(Math.min(...recalls))}, max ${pct(Math.max(...recalls))})` : "";
    console.log(`  recall:    ${pct(mean(recalls))}${range}  caught [${last.caught.join(", ") || "-"}]  missed [${last.missed.join(", ") || "-"}]`);
    console.log(`  precision: ${pct(mean(precisions))}  false positives [${last.falsePositives.join(", ") || "none"}]`);
    if (c.notes) console.log(`  note: ${c.notes}`);
    console.log("");
  }

  console.log(`AGGREGATE  recall ${pct(mean(allRecall))}  precision ${pct(mean(allPrecision))}  over ${allRecall.length} run(s)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
