/**
 * Report the state of a dataset capture run: npm run training:status
 *
 * The supported way to ask "how is that hour-long capture going, and is it still alive".
 * Reads the progress file the run publishes (capture-progress.mjs) and, if a worker is
 * recorded, asks it directly whether it is still capturing.
 *
 * Exit codes are for scripts and CI, not decoration:
 *   0  finished cleanly, or in progress and healthy
 *   1  finished with failures
 *   2  no run recorded
 *   3  in progress but wedged (no update within one capture timeout plus slack)
 */
import { resolve } from "node:path";
import { isStale, readProgress, stalenessMs, tally } from "./capture-progress.mjs";

const ROOT = resolve(process.cwd(), "runs/screenreader-dataset");
const HEALTH_TIMEOUT_MS = 5_000;
const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;

const EXIT = { ok: 0, failures: 1, noRun: 2, stale: 3 };

function minutes(ms) {
  return (ms / MS_PER_SECOND / SECONDS_PER_MINUTE).toFixed(1) + " min";
}

// Reported as unreachable rather than thrown: the worker being gone is a finding to print,
// not a reason for the status command itself to fail.
async function workerState(worker) {
  if (!worker) return "not recorded";
  try {
    const response = await fetch(worker + "/health", { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    if (!response.ok) return "HTTP " + response.status;
    const health = await response.json();
    return health.busy ? "capturing now" : "idle";
  } catch (error) {
    return "unreachable (" + error.message + ")";
  }
}

function printFailures(progress) {
  const failed = Object.entries(progress.cases ?? {}).filter(([, c]) => c.status === "failed");
  if (!failed.length) return;
  console.log("\nfailed cases:");
  for (const [id, entry] of failed) console.log("  " + id + ": " + entry.reason);
}

function printProgressLines(progress, counts, now) {
  const done = counts.captured + counts.failed + counts.skipped;
  console.log("run:      started " + progress.startedAt + (progress.finishedAt ? ", finished " + progress.finishedAt : ""));
  console.log("progress: " + done + "/" + progress.total + " cases  (" +
    counts.captured + " captured, " + counts.failed + " failed, " + counts.skipped + " skipped)");
  console.log("worker:   " + progress.worker);
  console.log("pages:    " + progress.baseUrl);
  if (progress.current) {
    console.log("current:  " + progress.current.id + " (" + progress.current.variant + "), " +
      minutes(now - Date.parse(progress.current.startedAt)) + " so far");
  }
  const quiet = stalenessMs(progress, now);
  if (quiet !== null) console.log("last update: " + minutes(quiet) + " ago");
}

function outcomeExit(progress, counts, now) {
  if (progress.finishedAt) return counts.failed ? EXIT.failures : EXIT.ok;
  if (isStale(progress, now)) {
    console.log("\nWEDGED: no update within one capture timeout plus slack. Check the worker, then");
    console.log("re-run with --resume to pick up from the captures already on disk.");
    return EXIT.stale;
  }
  return EXIT.ok;
}

async function main() {
  const progress = readProgress(ROOT);
  if (!progress) {
    console.log("No capture run recorded (" + ROOT + "/capture-progress.json is absent).");
    console.log("Start one with: npm run training:capture");
    process.exitCode = EXIT.noRun;
    return;
  }
  const now = Date.now();
  const counts = tally(progress);
  printProgressLines(progress, counts, now);
  console.log("worker now: " + (await workerState(progress.worker)));
  printFailures(progress);
  if (progress.outcome) console.log("\noutcome:  " + progress.outcome);
  process.exitCode = outcomeExit(progress, counts, now);
}

main().catch((error) => {
  console.error("training:status failed:", error.message);
  process.exitCode = 1;
});
