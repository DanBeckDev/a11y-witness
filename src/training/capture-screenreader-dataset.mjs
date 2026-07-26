// Run under tsx, not plain node (see package.json), so this host-side script can import the
// TypeScript worker-lease module. The rest of src/training is .mjs under node; this one file
// needs the shared lifecycle logic, and duplicating it in .mjs would let the two copies
// drift.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { leaseWorker, guestReachableUrl, isAfterRun } from "../capture/local-vm.js";
import { captureMentionsTitle, titleOf } from "../capture/verify.js";

const ROOT = resolve(process.cwd(), "runs/screenreader-dataset");
const MANIFEST_PATH = resolve(ROOT, "manifest.json");
const CAPTURE_ROOT = resolve(ROOT, "captures");
const DEFAULT_BASE_URL = "http://localhost:5050";
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

async function checkWorker({ worker, source }) {
  if (source === "default") {
    throw new Error(
      "No NVDA worker available. Dataset capture needs the interactive Windows/NVDA worker: " +
        "set A11Y_WORKER=http://host:8765, or on a Mac create the local VM " +
        "(scripts/local-worker/build-vm.sh) and it will be started on demand."
    );
  }
  let health;
  try {
    health = await fetchJson(worker + "/health");
  } catch (error) {
    throw new Error(
      "The worker at " + worker + " did not answer /health. If you set A11Y_WORKER yourself, " +
        "check that machine is up and the a11ysrv task is running; unset it to have a local VM " +
        "started on demand instead.",
      { cause: error }
    );
  }
  if (health.screenReader !== "NVDA") {
    throw new Error("Worker is not an NVDA worker: " + JSON.stringify(health));
  }
  if (health.busy) console.log("Worker reports busy; the next capture may be rejected.");
  console.log("Connected to NVDA worker at " + worker);
}

// The guest fetches these pages itself, so the base URL has to be reachable from THERE.
// With a local VM, the host's `localhost` is not: it resolves to the guest, which serves
// nothing, and every capture then comes back describing an empty page with no error.
function resolveBaseUrl(lease) {
  const configured = (process.env.DATASET_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
  const reachable = guestReachableUrl(configured, lease);
  if (reachable !== configured) {
    console.log("Dataset pages: rewrote " + configured + " -> " + reachable + " (the guest cannot reach the host's localhost)");
  }
  return reachable;
}

function captureUrl(baseUrl, testCase, variant) {
  return baseUrl + "/" + testCase.id + "/" + variant + ".html";
}

async function captureOne(ctx, testCase, url) {
  const body = {
    url,
    task: testCase.task,
    steps: STEPS,
    probeForms: testCase.probeForms,
  };
  return fetchJson(ctx.worker + "/capture", {
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

// Fetch the page the way the guest will, and hand back its title so the capture can be
// checked against it. Doing this first turns a misconfigured base URL into one clear error
// instead of a whole dataset of captured 404 pages -- which is what happened before this
// existed: a stray server on port 5050 produced "Capture complete: 3/3 cases" while every
// transcript read "Error code: 404".
const SERVE_HINT =
  "Serve them with: npx serve runs/screenreader-dataset/pages -l 5050 " +
  "(and check nothing else already holds that port -- a stray server answers 404 for every page).";

async function pageTitle(url) {
  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  } catch (error) {
    // A refused connection rejects rather than returning a response, so without this the
    // whole run dies with the bare message "fetch failed".
    throw new Error("Cannot reach the dataset pages at " + url + ". " + SERVE_HINT, { cause: error });
  }
  if (!response.ok) {
    throw new Error("HTTP " + response.status + " for " + url + ". " + SERVE_HINT);
  }
  return titleOf(await response.text());
}

const REJECTED_PREVIEW_PHRASES = 3;

// A capture that read the wrong page is worse than a missing one: it is plausible-looking
// training data with the wrong label. Refuse to write it.
function assertReadTheRightPage(capture, { title, url }) {
  if (captureMentionsTitle(capture, title)) return;
  const preview = capture.transcript.slice(0, REJECTED_PREVIEW_PHRASES).map((p) => JSON.stringify(p)).join(", ");
  throw new Error(
    'the screen reader did not read "' + title + '" at ' + url +
      " (announced: " + (preview || "nothing") + "). Not written -- it would be mislabelled training data."
  );
}

async function captureCase(ctx, testCase) {
  const paths = [];
  for (const variant of ["good", "bad"]) {
    const url = captureUrl(ctx.baseUrl, testCase, variant);
    const title = await pageTitle(url);
    console.log("Capturing " + testCase.id + " (" + variant + ")");
    const capture = await captureOne(ctx, testCase, url);
    assertReadTheRightPage(capture, { title, url });
    const path = writeCapture(testCase, variant, capture);
    console.log("  " + capture.transcript.length + " transcript phrases -> " + path);
    paths.push(path);
  }
  return paths;
}

function afterRun() {
  const v = process.env.A11Y_VM_AFTER;
  if (!v) return "restore";
  if (isAfterRun(v)) return v;
  throw new Error('A11Y_VM_AFTER must be restore|stop|pause|leave (got "' + v + '")');
}

async function captureAll(ctx, cases) {
  const failures = [];
  for (const testCase of cases) {
    try {
      await captureCase(ctx, testCase);
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

async function main() {
  const manifest = readManifest();
  const cases = ONLY ? manifest.cases.filter(({ id }) => id.includes(ONLY)) : manifest.cases;
  if (!cases.length) throw new Error("No generated case matches --only=" + ONLY);

  // Same lease as the witness CLI: an explicit A11Y_WORKER is used untouched, otherwise a
  // local VM is started on demand and put back as it was found. Dataset capture is the run
  // that benefits most -- it is long, unattended, and used to leave the guest running after.
  const lease = await leaseWorker({ worker: process.env.A11Y_WORKER ?? null, after: afterRun() });
  try {
    await checkWorker(lease);
    const baseUrl = resolveBaseUrl(lease);
    // Prove the pages are served before capturing anything. captureAll treats a bad page as
    // a per-case failure, so without this a wrong base URL reports the same error 45 times
    // over -- and each one costs a full NVDA capture first.
    await pageTitle(captureUrl(baseUrl, cases[0], "good"));
    await captureAll({ worker: lease.worker, baseUrl }, cases);
  } finally {
    await lease.release();
  }
}

main().catch((error) => {
  console.error("training:capture failed:", error.message);
  process.exitCode = 1;
});
