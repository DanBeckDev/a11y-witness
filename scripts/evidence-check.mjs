// Re-capture a sample of the dataset and ask whether a pipeline change altered the EVIDENCE.
//
//   node scripts/evidence-check.mjs <worker-url> [--sample=24] [--only=family]
//
// Prints a per-case verdict and one recommendation: ship without invalidating the cache, or bump
// CAPTURE_PROTOCOL_VERSION and recapture. See src/capture/evidence-diff.mjs for why this exists --
// briefly, the cache key asks "could this have changed the evidence", never "did it", so before this
// existed every capture optimisation cost a 2,122-capture recapture to evaluate.
//
// The sample is STRATIFIED by family, not random. The lesson that cost the most in this project is
// that a guard validated on six hand-picked cases failed 44 in a live run, because the family it broke
// was not in the sample. One case per family, both variants, is the cheapest sample that cannot repeat
// that: absence-is-the-finding families (custom-control) and probe-dependent ones (table-*) are
// present by construction.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { compareCapture, readCapture, summarise } from "../src/capture/evidence-diff.mjs";
import { isEvidence } from "../src/training/capture-decisions.mjs";
import { titleOf } from "../src/capture/verify.js";

const DATASET = resolve(process.cwd(), "runs/screenreader-dataset");
const BASELINE = resolve(DATASET, "captures");
const OUT = resolve(DATASET, "evidence-check");
const CAPTURE_TIMEOUT_MS = 300_000;
const DEFAULT_SAMPLE = 24;

const [worker] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const flag = (name, fallback) => {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
};
if (!worker) {
  process.stderr.write("usage: node scripts/evidence-check.mjs <worker-url> [--sample=24] [--only=family]\n");
  process.exit(2);
}
const sampleSize = Number(flag("sample", DEFAULT_SAMPLE));
const only = flag("only", null);

function manifestCases() {
  const manifest = JSON.parse(readFileSync(resolve(DATASET, "manifest.json"), "utf8"));
  return manifest.cases.filter((c) => !only || (c.family ?? c.id).includes(only));
}

/** One case per family until the sample is full, so no family can be silently absent. */
function stratify(cases, limit) {
  const byFamily = new Map();
  for (const testCase of cases) {
    const family = testCase.family ?? testCase.id;
    if (!byFamily.has(family)) byFamily.set(family, testCase);
  }
  return [...byFamily.values()].slice(0, limit);
}

async function capture(testCase, variant) {
  const pageUrl = `${hostPages}/${testCase.id}/${variant}.html`;
  const response = await fetch(`${worker.replace(/\/$/, "")}/capture`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url: pageUrl,
      task: testCase.task ?? null,
      probeForms: !!testCase.probeForms,
      probeTables: !!testCase.probeTables,
    }),
    signal: AbortSignal.timeout(CAPTURE_TIMEOUT_MS),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${JSON.stringify(body).slice(0, 200)}`);
  return body;
}

// The guest cannot reach the host's localhost, so the pages must be addressed by the host's LAN IP --
// the same reason leaseWorkerPool hands back a hostAddress.
const hostPages = process.env.DATASET_BASE_URL
  ?? `http://${new URL(worker).hostname.replace(/\.\d+$/, ".1")}:${process.env.DATASET_PAGES_PORT || 5050}`;

/** The page's own title, so the verification gates can check the capture against it. */
async function pageTitle(testCase, variant) {
  try {
    const response = await fetch(`${hostPages}/${testCase.id}/${variant}.html`,
      { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) return null;
    return titleOf(await response.text());
  } catch {
    return null; // cannot read the page: skip the gate rather than reject on a network blip
  }
}

const selected = stratify(manifestCases(), sampleSize);
process.stdout.write(`Evidence check: ${selected.length} case(s), both variants, against ${worker}\n`);
process.stdout.write(`Pages: ${hostPages}\nBaseline: ${BASELINE}\n\n`);

const results = [];
for (const testCase of selected) {
  for (const variant of ["good", "bad"]) {
    const baseline = readCapture(BASELINE, testCase.id, variant);
    if (!baseline) {
      process.stdout.write(`  SKIP        ${testCase.id}.${variant} (no baseline capture)\n`);
      continue;
    }
    let candidate;
    try {
      candidate = await capture(testCase, variant);
    } catch (error) {
      process.stdout.write(`  FAILED      ${testCase.id}.${variant}: ${error.message}\n`);
      continue;
    }
    // Apply the pipeline's OWN gates before comparing. A capture a real run would reject and retry is
    // not evidence, so diffing it produces a false CHANGED and blames the change for a bad capture.
    const title = await pageTitle(testCase, variant);
    if (title !== null && !isEvidence(candidate, title)) {
      results.push({ id: testCase.id, variant, comparison: { verdict: "REJECTED", changes: [], phrases: null } });
      process.stdout.write(`  REJECTED    ${testCase.id}.${variant}  the pipeline would reject this capture; excluded\n`);
      continue;
    }
    const comparison = compareCapture(baseline, candidate);
    results.push({ id: testCase.id, variant, comparison });
    const detail = comparison.verdict === "CHANGED"
      ? comparison.changes.map((c) => `${c.field} ${c.before}->${c.after}`).join(", ")
      : comparison.verdict === "DRIFT"
        ? `phrases ${comparison.phrases.before}->${comparison.phrases.after}` +
          (comparison.phrases.lost.length ? ` lost: ${JSON.stringify(comparison.phrases.lost.slice(0, 2))}` : "")
        : "";
    process.stdout.write(`  ${comparison.verdict.padEnd(11)} ${testCase.id}.${variant}  ${detail}\n`);
  }
}

const summary = summarise(results);
mkdirSync(OUT, { recursive: true });
writeFileSync(resolve(OUT, "report.json"), JSON.stringify({ worker, results, summary }, null, 2) + "\n", "utf8");

process.stdout.write(`\n${summary.compared} compared: ` +
  `${summary.counts.SAME} same, ${summary.counts.DRIFT} drift, ${summary.counts.CHANGED} changed` +
  (summary.counts.REJECTED ? `, ${summary.counts.REJECTED} rejected (excluded)` : "") + "\n");
process.stdout.write(`${summary.recommendation}\n`);
process.stdout.write(`Report: ${resolve(OUT, "report.json")}\n`);
// Exit code is the contract, same as the other gates: 0 safe to ship, 1 evidence changed.
process.exit(summary.evidenceChanged ? 1 : 0);
