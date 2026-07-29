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
import { setTimeout as sleep } from "node:timers/promises";

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
  if (!response.ok || body.error) throw new Error(body.error ?? `HTTP ${response.status}`);
  return body;
}

const runs = [];
const errors = [];
for (let n = 1; n <= TIMES; n += 1) {
  process.stdout.write(`capture ${n}/${TIMES} ... `);
  try {
    const capture = await captureOnce();
    runs.push(comparable(capture));
    console.log(`${capture.transcript.length} phrases`);
  } catch (e) {
    errors.push(`${n}: ${e.message}`);
    console.log(`FAILED ${e.message}`);
  }
  if (n < TIMES) await sleep(BETWEEN_MS);
}

if (runs.length < 2) {
  console.error(`\nOnly ${runs.length} capture(s) succeeded; nothing to compare.`);
  for (const e of errors) console.error("  " + e);
  process.exit(1);
}

console.log(`\n${runs.length}/${TIMES} captured` + (errors.length ? `, ${errors.length} failed` : "") +
  ` (${REUSE ? "reused" : "fresh"} NVDA each time)\n`);

let unstable = 0;
for (const field of Object.keys(runs[0])) {
  const shapes = runs.map((r) => JSON.stringify(r[field]));
  const distinct = new Set(shapes);
  const counts = runs.map((r) => r[field].length).join(",");
  if (distinct.size === 1) {
    console.log(`  STABLE    ${field.padEnd(13)} ${runs[0][field].length} item(s), identical every time`);
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
console.log(`\n${unstable === 0 ? "All compared fields are stable." : `${unstable} field(s) vary on an unchanged page.`}`);
// A varying field is a failure: it means evidence depends on timing, not on the page.
process.exit(unstable === 0 && errors.length === 0 ? 0 : 1);
