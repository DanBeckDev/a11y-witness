// Measure what a capture actually costs, phase by phase.
//
//   node scripts/bench-capture.mjs <worker-url> <page-url> [count]
//
// Why this exists: per-capture cost is the constraint on the training dataset. A run of 45
// page pairs took 98 minutes, and the phase timings showed only 13 of every 50 seconds was
// real work -- the rest was fixed sleeps and restarting NVDA 90 times. Optimising that by
// eye is how you end up "faster" and wrong, so measure it.
//
// It reports phrase counts alongside the timings on purpose. A capture that got quicker by
// reading less is not an improvement, and a suite that only asserts "it ran" stays green
// while the evidence turns to garbage (see CLAUDE.md).
import { setTimeout as sleep } from "node:timers/promises";

const [worker, page, countArg] = process.argv.slice(2);
if (!worker || !page) {
  console.error("usage: node scripts/bench-capture.mjs <worker-url> <page-url> [count]");
  process.exit(1);
}
const COUNT = Number(countArg || 3);
const CAPTURE_TIMEOUT_MS = 300_000;
const BETWEEN_MS = 1_000;

async function capture(url) {
  const startedAt = Date.now();
  const response = await fetch(worker.replace(/\/$/, "") + "/capture", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url, task: "Benchmark the capture cost" }),
    signal: AbortSignal.timeout(CAPTURE_TIMEOUT_MS),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${JSON.stringify(body)}`);
  return { wallMs: Date.now() - startedAt, body };
}

// Diagnostics carry cumulative atMs, so each phase's own cost is the gap from the last one.
function phaseCosts(diagnostics) {
  const costs = {};
  let previous = 0;
  for (const entry of diagnostics ?? []) {
    if (typeof entry.atMs !== "number") continue;
    costs[entry.event] = (costs[entry.event] ?? 0) + (entry.atMs - previous);
    previous = entry.atMs;
  }
  return costs;
}

function mean(values) {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function report(runs) {
  const phases = {};
  for (const run of runs) {
    for (const [phase, ms] of Object.entries(run.costs)) (phases[phase] ??= []).push(ms);
  }
  const rows = Object.entries(phases)
    .map(([phase, values]) => ({ phase, seconds: +(mean(values) / 1000).toFixed(1) }))
    .sort((a, b) => b.seconds - a.seconds);

  console.log(`\nphase cost, mean of ${runs.length} captures:`);
  for (const { phase, seconds } of rows) {
    console.log(`  ${phase.padEnd(18)}${String(seconds).padStart(6)}s  ${"#".repeat(Math.round(seconds))}`);
  }
  const wall = mean(runs.map((r) => r.wallMs)) / 1000;
  console.log(`  ${"WALL".padEnd(18)}${wall.toFixed(1).padStart(6)}s`);

  // Faster is only better if the capture still heard the page.
  const phrases = runs.map((r) => r.phrases);
  console.log(`\nphrases per capture: ${phrases.join(", ")} (mean ${mean(phrases).toFixed(1)})`);
  const empty = phrases.filter((p) => p === 0).length;
  if (empty) console.log(`  WARNING: ${empty} capture(s) returned NOTHING — faster but broken`);
  const reused = runs.filter((r) => r.reused).length;
  console.log(`NVDA reused on ${reused}/${runs.length} captures`);
}

const runs = [];
for (let i = 1; i <= COUNT; i++) {
  const { wallMs, body } = await capture(page);
  const start = (body.diagnostics ?? []).find((e) => e.event === "nvdaStart");
  runs.push({
    wallMs,
    costs: phaseCosts(body.diagnostics),
    phrases: (body.transcript ?? []).length,
    reused: !!start?.reused,
  });
  console.log(`capture ${i}/${COUNT}: ${(wallMs / 1000).toFixed(1)}s, ${runs.at(-1).phrases} phrases${runs.at(-1).reused ? " (NVDA reused)" : ""}`);
  if (i < COUNT) await sleep(BETWEEN_MS);
}
report(runs);
