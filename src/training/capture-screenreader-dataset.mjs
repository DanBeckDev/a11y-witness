import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(process.cwd(), "runs/screenreader-dataset");
const MANIFEST_PATH = resolve(ROOT, "manifest.json");
const CAPTURE_ROOT = resolve(ROOT, "captures");
const WORKER = process.env.A11Y_WORKER;
const BASE_URL = (process.env.DATASET_BASE_URL || "http://localhost:5050").replace(/\/$/, "");
const STEPS = Number(process.env.DATASET_CAPTURE_STEPS || 150);
const ONLY = process.argv.find((arg) => arg.startsWith("--only="))?.slice("--only=".length);
const CAPTURE_TIMEOUT_MS = Number(process.env.DATASET_CAPTURE_TIMEOUT_MS || 300000);

async function fetchJson(url, options = {}, timeoutMs = 30000) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  if (!response.ok) {
    throw new Error("HTTP " + response.status + " from " + url + ": " + JSON.stringify(body));
  }
  return body;
}

function readManifest() {
  if (!existsSync(MANIFEST_PATH)) {
    throw new Error("Missing " + MANIFEST_PATH + ". Run npm run training:generate first.");
  }
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
}

async function checkWorker() {
  if (!WORKER) {
    throw new Error("A11Y_WORKER is not set. The capture step needs the interactive Windows/NVDA worker.");
  }
  const health = await fetchJson(WORKER.replace(/\/$/, "") + "/health");
  if (health.screenReader !== "NVDA") {
    throw new Error("Worker is not an NVDA worker: " + JSON.stringify(health));
  }
  if (health.busy) console.log("Worker reports busy; the next capture may be rejected.");
  console.log("Connected to NVDA worker at " + WORKER);
}

function captureUrl(testCase, variant) {
  return BASE_URL + "/" + testCase.id + "/" + variant + ".html";
}

async function captureOne(testCase, variant) {
  const url = captureUrl(testCase, variant);
  const body = {
    url,
    task: testCase.task,
    steps: STEPS,
    probeForms: testCase.probeForms,
  };
  return fetchJson(WORKER.replace(/\/$/, "") + "/capture", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }, CAPTURE_TIMEOUT_MS);
}

function writeCapture(testCase, variant, capture) {
  mkdirSync(CAPTURE_ROOT, { recursive: true });
  const path = resolve(CAPTURE_ROOT, testCase.id + "." + variant + ".json");
  writeFileSync(path, JSON.stringify(capture, null, 2) + "\n", "utf8");
  return path;
}

async function captureCase(testCase) {
  const paths = [];
  for (const variant of ["good", "bad"]) {
    console.log("Capturing " + testCase.id + " (" + variant + ")");
    const capture = await captureOne(testCase, variant);
    const path = writeCapture(testCase, variant, capture);
    console.log("  " + capture.transcript.length + " transcript phrases -> " + path);
    paths.push(path);
  }
  return paths;
}

async function main() {
  const manifest = readManifest();
  const cases = ONLY ? manifest.cases.filter(({ id }) => id.includes(ONLY)) : manifest.cases;
  if (!cases.length) throw new Error("No generated case matches --only=" + ONLY);
  await checkWorker();
  const failures = [];
  for (const testCase of cases) {
    try {
      await captureCase(testCase);
    } catch (error) {
      failures.push(testCase.id + ": " + error.message);
      console.error("  CAPTURE_FAILED " + failures.at(-1));
    }
  }
  console.log("Capture complete: " + (cases.length - failures.length) + "/" + cases.length + " cases.");
  if (failures.length) {
    throw new Error(failures.length + " case(s) failed. The completed captures were kept.");
  }
}

main().catch((error) => {
  console.error("training:capture failed:", error.message);
  process.exitCode = 1;
});
