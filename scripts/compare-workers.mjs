// Why is one worker slower than another? Run the same page on each and diff every phase.
//
//   node scripts/compare-workers.mjs <page-url> <worker-url> <worker-url> [...] [--runs=5]
//
// This exists because I spent hours attributing a 2x difference between two guests to the wrong phase.
// `bench-capture.mjs` gives a phase table for ONE worker, so comparing two meant eyeballing two
// printouts, and I compared wall times instead — which said "worker 1 is faster" without saying where.
// The moment the phases were put side by side the answer was immediate: `windowsActivate` was identical
// (7.4s vs 7.3s, so Edge launch was never the difference) and the entire gap was in `sweep`.
//
// It also surfaces the per-sweep detail that capture-core already records and nothing displayed.
// `collectByType` marks every sweep with its type, elapsed ms and round-trip count in each direction,
// and the aggregate hid all of it. Six sweeps collapsed into one number cannot tell you whether a worker
// is doing MORE round trips or SLOWER ones — and those have different causes.
//
// Runs workers strictly one at a time. Two guests capturing at once compete for host memory, and that
// contention is large enough to swamp what is being measured.
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const CAPTURE_TIMEOUT_MS = 300_000;
const OUT = resolve(process.cwd(), "runs/worker-compare");
const MS_PER_S = 1000;

const args = process.argv.slice(2);
const runs = Number(args.find((a) => a.startsWith("--runs="))?.slice("--runs=".length) ?? 5);
const [page, ...workers] = args.filter((a) => !a.startsWith("--"));
if (!page || workers.length < 2) {
  process.stderr.write("usage: node scripts/compare-workers.mjs <page-url> <worker> <worker> [--runs=5]\n");
  process.exit(2);
}

const short = (worker) => new URL(worker).hostname.split(".").pop();

async function capture(worker) {
  const response = await fetch(`${worker.replace(/\/$/, "")}/capture`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: page, probeForms: true }),
    signal: AbortSignal.timeout(CAPTURE_TIMEOUT_MS),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${JSON.stringify(body).slice(0, 160)}`);
  return body;
}

async function diagnostics(worker) {
  try {
    const response = await fetch(`${worker.replace(/\/$/, "")}/diagnostics`, { signal: AbortSignal.timeout(180_000) });
    return response.ok ? await response.json() : null;
  } catch {
    return null; // an older worker has no /diagnostics; the phase comparison still works
  }
}

/**
 * Phase costs from one capture's diagnostics.
 *
 * Diagnostics carry a cumulative `atMs`, so a phase's own cost is the gap from the previous mark — the
 * same arithmetic bench-capture does. Repeated events (there are six `sweep` marks) accumulate, which is
 * what makes `sweep` look like one large phase.
 */
function phaseCosts(entries) {
  const costs = {};
  let previous = 0;
  for (const entry of entries ?? []) {
    if (typeof entry.atMs !== "number") continue;
    costs[entry.event] = (costs[entry.event] ?? 0) + (entry.atMs - previous);
    previous = entry.atMs;
  }
  return costs;
}

/** Per-sweep detail, keyed by sweep type, which the aggregate throws away. */
function sweepDetail(entries) {
  const byType = {};
  for (const entry of entries ?? []) {
    if (entry.event !== "sweep" || !entry.type) continue;
    const to = byType[entry.type] ??= { found: 0, ms: 0, trips: 0, n: 0 };
    to.found += entry.found ?? 0;
    to.ms += (entry.prevMs ?? 0) + (entry.nextMs ?? 0);
    to.trips += (entry.prevTrips ?? 0) + (entry.nextTrips ?? 0);
    to.n += 1;
  }
  return byType;
}

const mean = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);

const results = {};
for (const worker of workers) {
  process.stdout.write(`\n=== ${worker} (${runs} run(s)) ===\n`);
  const phases = [], sweeps = [], walls = [];
  for (let i = 0; i < runs; i++) {
    try {
      const started = Date.now();
      const result = await capture(worker);
      walls.push(Date.now() - started);
      phases.push(phaseCosts(result.diagnostics));
      sweeps.push(sweepDetail(result.diagnostics));
      process.stdout.write(`  run ${i + 1}: ${((Date.now() - started) / MS_PER_S).toFixed(1)}s, ` +
        `${result.transcript?.length ?? 0} phrases\n`);
    } catch (error) {
      process.stdout.write(`  run ${i + 1}: FAILED ${error.message}\n`);
    }
  }
  results[worker] = { phases, sweeps, walls, diagnostics: await diagnostics(worker) };
}

// --- the comparison ---------------------------------------------------------

const allPhases = [...new Set(Object.values(results).flatMap((r) => r.phases.flatMap(Object.keys)))];
const phaseMean = (worker, phase) => mean(results[worker].phases.map((p) => p[phase] ?? 0)) / MS_PER_S;

process.stdout.write(`\n\nPHASE MEANS (seconds), ${runs} run(s) each\n`);
process.stdout.write(`  ${"phase".padEnd(20)}${workers.map((w) => short(w).padStart(9)).join("")}    spread\n`);

const rows = allPhases
  .map((phase) => {
    const values = workers.map((w) => phaseMean(w, phase));
    return { phase, values, spread: Math.max(...values) - Math.min(...values) };
  })
  .filter((row) => row.values.some((v) => v >= 0.05))
  .sort((a, b) => b.spread - a.spread);

for (const { phase, values, spread } of rows) {
  const flag = spread >= 1 ? "  <-- diverges" : "";
  process.stdout.write(`  ${phase.padEnd(20)}${values.map((v) => v.toFixed(1).padStart(9)).join("")}` +
    `${spread.toFixed(1).padStart(10)}${flag}\n`);
}
for (const w of workers) {
  process.stdout.write(`  ${"WALL".padEnd(20)}${short(w)}: ${(mean(results[w].walls) / MS_PER_S).toFixed(1)}s\n`);
}

// The per-sweep view. `found` and `trips` separate "doing more work" from "doing work more slowly",
// which is the distinction the aggregate destroys and the one that identifies a cause.
const sweepTypes = [...new Set(Object.values(results).flatMap((r) => r.sweeps.flatMap(Object.keys)))];
if (sweepTypes.length) {
  process.stdout.write("\nSWEEP DETAIL (mean ms / round trips / elements found)\n");
  for (const type of sweepTypes) {
    process.stdout.write(`  ${type.padEnd(14)}`);
    for (const w of workers) {
      const runsWith = results[w].sweeps.map((s) => s[type]).filter(Boolean);
      const ms = mean(runsWith.map((s) => s.ms)).toFixed(0);
      const trips = mean(runsWith.map((s) => s.trips)).toFixed(1);
      const found = mean(runsWith.map((s) => s.found)).toFixed(1);
      process.stdout.write(`${short(w)}: ${ms}ms/${trips}t/${found}f   `);
    }
    process.stdout.write("\n");
  }
  process.stdout.write("\n  ms up but trips flat => each round trip is slower (the guest or NVDA is the cause).\n");
  process.stdout.write("  trips up            => the sweep is genuinely walking more (the page or dedupe differs).\n");
}

for (const w of workers) {
  const d = results[w].diagnostics;
  if (!d) continue;
  process.stdout.write(`\n  ${short(w)} guest: profile=${d.edgeProfile?.megabytes}MB ` +
    `policy=${JSON.stringify(d.edgePolicy)} procs=${JSON.stringify(d.processes)}\n`);
}

mkdirSync(OUT, { recursive: true });
writeFileSync(resolve(OUT, "compare.json"), JSON.stringify({ page, runs, results }, null, 2) + "\n", "utf8");
process.stdout.write(`\nReport: ${resolve(OUT, "compare.json")}\n`);
