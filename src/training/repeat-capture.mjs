// Capture ONE page N times and report which fields are stable.
//
//   npm run training:repeat -- --url=http://192.168.64.1:5050/<case>/good --times=5
//   npm run training:repeat -- --url=... --worker=http://192.168.64.6:8765 --probe-tables
//
// Why this exists: a probe that returns different evidence for the same unchanged page is
// indistinguishable from a page that genuinely differs, and that is the one defect this project
// cannot tolerate. It was found by hand -- 18 captures of one table page returned 4, 2, 4, 4, 1,
// 4, 4 cells -- and finding it by hand is how it survived several "fixes" that each helped and
// none cured.
//
// Deliberately compares CONTENT, not counts. A readiness gate once replaced the first line of
// every capture with the document title, and every count-based check stayed green.
//
// Fresh NVDA per capture by default (`reuseScreenReader: false`): a repeatability test that
// reuses one screen reader is measuring a single NVDA session, not the pipeline. `--reuse` opts
// back in when you specifically want to know whether reuse is what drifts.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { isTransient } from "./capture-decisions.mjs";

const arg = (name, fallback = null) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const URL_ARG = arg("url");
const WORKER = arg("worker", process.env.A11Y_WORKER);
const TIMES = Number(arg("times", "5"));
const STEPS = Number(arg("steps", "10"));
const PROBE_TABLES = process.argv.includes("--probe-tables");
const REUSE = process.argv.includes("--reuse");
const CAPTURE_TIMEOUT_MS = 300_000;
// Every capture is kept, not just summarised. The first real run of this harness found two degenerate
// captures and I could not say WHY, because the diagnostics -- stopReason, documentReady,
// readThroughRetry -- had been thrown away with the response. A harness that reports instability
// without keeping the evidence makes you run it twice.
const OUT_DIR = resolve(arg("out", "runs/repeat-captures"));
const BETWEEN_MS = 2_000; // let the guest settle, as a real run would between cases

if (!URL_ARG || !WORKER) {
  console.error("usage: npm run training:repeat -- --url=<page> [--worker=<url>] [--times=5] " +
    "[--probe-tables] [--reuse]\n" +
    "  --worker may come from A11Y_WORKER; get one from scripts/local-worker/worker-ctl.sh pool");
  process.exit(2);
}

/** The fields worth comparing: everything a dataset signal can read. */
function comparable(capture) {
  const s = capture.structure ?? {};
  const i = capture.interaction ?? {};
  return {
    transcript: capture.transcript ?? [],
    headings: s.headings ?? [],
    landmarks: s.landmarks ?? [],
    formFields: s.formFields ?? [],
    graphics: s.graphics ?? [],
    links: s.links ?? [],
    lists: s.lists ?? [],
    tableCells: s.tableCells ?? [],
    stateChanges: i.stateChanges ?? [],
    focusOrder: i.focusOrder ?? [],
  };
}

async function captureOnce() {
  const response = await fetch(`${WORKER.replace(/\/$/, "")}/capture`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url: URL_ARG, steps: STEPS, probeTables: PROBE_TABLES, reuseScreenReader: REUSE,
    }),
    signal: AbortSignal.timeout(CAPTURE_TIMEOUT_MS),
  });
  const body = await response.json();
  if (!response.ok || body.error) {
    // Carry the worker's fault CODE, not just its prose. `isTransient` matches on codes; matching on
    // message text is the check that silently stops working when somebody rewords a throw site.
    throw Object.assign(new Error(body.error ?? `HTTP ${response.status}`),
      { code: body.fault, status: response.status });
  }
  return body;
}

/**
 * Wait until the worker will actually take work.
 *
 * This tool had neither a readiness wait nor a retry, while the dataset runner has both -- so the
 * STABILITY GATE, which is the precondition for a corpus run, was going through the least robust
 * client in the codebase. One capture errored during a gate run purely because it started moments
 * after `worker:deploy` rebooted the guests, and the gate reported a perfectly stable page as failed.
 *
 * `ready` and not `ok`: `ok` only ever meant "the HTTP server is answering", and a worker answered it
 * while NVDA could not start.
 */
async function waitForReady(deadlineMs = 300_000) {
  const deadline = Date.now() + deadlineMs;
  let announced = false;
  while (Date.now() < deadline) {
    try {
      const health = await (await fetch(`${WORKER.replace(/\/$/, "")}/health`,
        { signal: AbortSignal.timeout(15_000) })).json();
      if (health.ready) return;
      if (!announced) { console.log("  waiting for the worker to report ready ..."); announced = true; }
    } catch {
      if (!announced) { console.log("  waiting for the worker to answer ..."); announced = true; }
    }
    await sleep(5_000);
  }
  throw new Error(`worker never reported ready within ${deadlineMs / 1000}s`);
}

/**
 * One capture, retrying only INFRASTRUCTURE failures.
 *
 * The distinction is the whole point of this tool: a transient fault (a worker still booting, a mute
 * screen reader it recovered from, a wedged capture that timed out) says nothing about the page, so
 * retrying it is correct. Differing CONTENT is never retried -- that is the signal being measured, and
 * retrying it away would turn the gate into a rubber stamp.
 */
async function captureWithRetry(attempts = 3) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await captureOnce();
    } catch (error) {
      if (attempt >= attempts || !isTransient(error)) throw error;
      console.log(`    transient (${error.code ?? error.message.slice(0, 40)}), retrying ${attempt}/${attempts - 1}`);
      await waitForReady();
    }
  }
}

mkdirSync(OUT_DIR, { recursive: true });
// Before the FIRST capture, not just between retries. The gate runs straight after `worker:deploy`
// reboots the guests, and a capture issued into a still-booting worker is what made a stable page
// report as failed.
await waitForReady();
const runs = [];
const errors = [];
for (let n = 1; n <= TIMES; n += 1) {
  process.stdout.write(`capture ${n}/${TIMES} ... `);
  try {
    const capture = await captureWithRetry();
    runs.push(comparable(capture));
    writeFileSync(resolve(OUT_DIR, `capture-${n}.json`), JSON.stringify(capture, null, 2) + "\n", "utf8");
    const retried = (capture.diagnostics ?? []).some((e) => e.event === "readThroughRetry");
    console.log(`${capture.transcript.length} phrases${retried ? " (read-through retried)" : ""}`);
  } catch (e) {
    errors.push(`${n}: ${e.message}`);
    console.log(`FAILED ${e.message}`);
  }
  if (n < TIMES) await sleep(BETWEEN_MS);
}

// A capture with no phrases heard nothing at all -- the known ForegroundLockTimeout/foreground
// flake. It is a failure, and it is a DIFFERENT failure from a probe that varies. Comparing it
// against real captures would report every field as unstable and bury the question being asked.
// So it is excluded from the comparison and named loudly, never quietly dropped.
const empty = runs.filter((r) => r.transcript.length === 0);
const usable = runs.filter((r) => r.transcript.length > 0);

if (usable.length < 2) {
  console.error(`\nOnly ${usable.length} usable capture(s); nothing to compare.`);
  if (empty.length) console.error(`  ${empty.length} returned 0 phrases (the foreground flake)`);
  for (const e of errors) console.error("  " + e);
  process.exit(1);
}

console.log(`\n${usable.length}/${TIMES} usable` +
  (empty.length ? `, ${empty.length} empty` : "") +
  (errors.length ? `, ${errors.length} failed` : "") +
  ` (${REUSE ? "reused" : "fresh"} NVDA each time)\n`);

let unstable = 0;
for (const field of Object.keys(usable[0])) {
  const shapes = usable.map((r) => JSON.stringify(r[field]));
  const distinct = new Set(shapes);
  const counts = usable.map((r) => r[field].length).join(",");
  if (distinct.size === 1) {
    console.log(`  STABLE    ${field.padEnd(13)} ${usable[0][field].length} item(s), identical every time`);
    continue;
  }
  unstable += 1;
  console.log(`  VARIES    ${field.padEnd(13)} counts ${counts} across runs`);
  // Show the variants, because "it varies" is not actionable and the difference usually names the
  // cause -- a missing header, a truncated walk, a lagging announcement.
  for (const shape of distinct) {
    const parsed = JSON.parse(shape);
    console.log(`      ${parsed.length}: ${JSON.stringify(parsed).slice(0, 110)}`);
  }
}

for (const e of errors) console.log(`  FAILED    ${e}`);
if (empty.length) {
  console.log(`  EMPTY     ${empty.length} capture(s) heard nothing at all — the foreground flake, ` +
    "excluded from the comparison above because it would mark every field unstable");
}
console.log(`\nraw captures kept in ${OUT_DIR} (diagnostics included)`);
console.log(`${unstable === 0 ? "All compared fields are stable." : `${unstable} field(s) vary on an unchanged page.`}`);
// A varying field is a failure: evidence that depends on timing rather than on the page. An empty
// capture or an error is a failure too, just a different one -- so all three fail the run.
process.exit(unstable === 0 && errors.length === 0 && empty.length === 0 ? 0 : 1);
