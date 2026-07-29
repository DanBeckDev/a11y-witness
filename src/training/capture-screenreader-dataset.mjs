// Run under tsx, not plain node (see package.json), so this host-side script can import the
// TypeScript worker-lease module. The rest of src/training is .mjs under node; this one file
// needs the shared lifecycle logic, and duplicating it in .mjs would let the two copies
// drift.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { leaseWorker, leaseWorkerPool, guestReachableUrl, isAfterRun } from "../capture/local-vm.js";
import { captureMentionsTitle, titleOf } from "../capture/verify.js";
import { beginRun, readProgress } from "./capture-progress.mjs";
import { cacheDecision, cacheKey, hashPageDir, stampProvenance } from "./capture-cache.mjs";

const ROOT = resolve(process.cwd(), process.env.DATASET_ROOT || "runs/screenreader-dataset");
const MANIFEST_PATH = resolve(ROOT, "manifest.json");
const CAPTURE_ROOT = resolve(ROOT, process.env.DATASET_CAPTURE_ROOT || "captures");
const PAGE_ROOT = resolve(ROOT, "pages");
const REJECTED_ROOT = resolve(CAPTURE_ROOT, "rejected");
const DEFAULT_BASE_URL = "http://localhost:5050";
const STEPS = Number(process.env.DATASET_CAPTURE_STEPS || 150);
const ONLY = process.argv.find((arg) => arg.startsWith("--only="))?.slice("--only=".length);
const RESUME = process.argv.includes("--resume");
// Caching is refused for acceptance runs, whatever the flags say: those runs exist to test whether
// NVDA's output is still stable, and reusing evidence would make them pass by construction.
// `--no-cache` forces a recapture anywhere.
const KIND = process.env.DATASET_KIND || "training";
const CACHE = !process.argv.includes("--no-cache") && KIND !== "acceptance";
// A comma-separated list of worker URLs runs cases across them concurrently. Get one from
// `scripts/local-worker/worker-ctl.sh pool`. Unset keeps the single-worker behaviour.
const WORKERS_ENV = process.env.A11Y_WORKERS ?? null;
const CAPTURE_TIMEOUT_MS = Number(process.env.DATASET_CAPTURE_TIMEOUT_MS || 300000);
// This is sent over the wire because NVDA lives in the Windows worker process. Setting
// A11Y_REUSE_NVDA on the host only changes a host process and cannot affect that worker.
// Keep reuse on for the normal pooled run; acceptance/repeat runs can set this to 0.
const REUSE_NVDA = process.env.DATASET_REUSE_NVDA !== "0";

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

// Exactly what shapes the evidence, defined once. The cache keys on this and the worker receives
// it, so the two cannot drift -- a key that ignored an option we actually send would reuse evidence
// captured a different way.
function captureOptions(testCase) {
  return {
    task: testCase.task,
    steps: STEPS,
    probeForms: testCase.probeForms,
    reuseScreenReader: REUSE_NVDA,
  };
}

async function captureOne(ctx, testCase, url) {
  const body = { url, ...captureOptions(testCase) };
  return fetchJson(ctx.worker + "/capture", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }, CAPTURE_TIMEOUT_MS);
}

function writeCapture(testCase, variant, capture, provenance) {
  mkdirSync(CAPTURE_ROOT, { recursive: true });
  if (provenance) capture = stampProvenance(capture, provenance);
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
const CAPTURE_ATTEMPTS = 3;
const WORKER_WAIT_MS = Number(process.env.DATASET_WORKER_WAIT_MS || 600000);
const WORKER_POLL_MS = 10000;

// A worker that vanishes mid-run is recoverable; treating it as a failed case is not.
//
// The first full run lost its last 4 cases this way. The guest bugchecked at 10:10, and
// because a connection error failed each case outright, one recoverable outage cascaded into
// four permanent failures -- while the worker itself came back on its own via auto-logon and
// the at-logon task. The run just was not patient.
const TRANSIENT = /fetch failed|ECONNREFUSED|ECONNRESET|socket hang up|timed out|aborted|HTTP 429.*capture is already in progress/i;

async function waitForWorker(worker) {
  const deadline = Date.now() + WORKER_WAIT_MS;
  while (Date.now() < deadline) {
    try {
      const health = await fetchJson(worker + "/health", {}, WORKER_POLL_MS);
      // Answering is not the same as able to capture. A worker reports `ready: false` while NVDA
      // is still warming up after a boot -- which is when the first capture used to fail on
      // `nvda.start` and be recorded as a broken case. Waiting here turns that into patience.
      //
      // `ready !== false` rather than `=== true` on purpose: a worker predating this field is
      // treated as ready, so an un-redeployed guest keeps working instead of stalling the run.
      // Staleness has its own detector (npm run worker:code).
      if (health.busy || health.ready === false) {
        await sleep(WORKER_POLL_MS);
        continue;
      }
      const waited = Math.round((WORKER_WAIT_MS - (deadline - Date.now())) / 1000);
      console.log("    worker is back after " + waited + "s");
      return;
    } catch {
      // Expected while it is down -- the whole point is to keep asking. The loop's own
      // timeout is the error path, so there is nothing to record here.
      await sleep(WORKER_POLL_MS);
    }
  }
  throw new Error("the worker did not come back within " + Math.round(WORKER_WAIT_MS / 60000) + " minutes");
}

// One capture, tolerant of the worker disappearing underneath it.
async function captureTolerantly(ctx, testCase, url) {
  try {
    return await captureOne(ctx, testCase, url);
  } catch (error) {
    if (!TRANSIENT.test(error.message)) throw error;
    console.log("    worker unreachable (" + error.message + "); waiting for it to come back");
    await waitForWorker(ctx.worker);
    return captureOne(ctx, testCase, url);
  }
}

function describeWrongPage(capture, { title, url }) {
  const preview = capture.transcript.slice(0, REJECTED_PREVIEW_PHRASES).map((p) => JSON.stringify(p)).join(", ");
  return 'the screen reader did not read "' + title + '" at ' + url +
    " (announced: " + (preview || "nothing") + ")";
}

// NVDA capture is racy: a page that reads correctly one minute comes back as two "blank"
// phrases the next, when Edge has not taken the foreground in time. The witness CLI already
// retries for exactly this reason. Without the same here, an hour-long unattended run
// silently loses cases to flake -- observed immediately: image-missing-alt-building failed
// this way on its first full run, and captured fine on a retry.
//
// A capture that read the wrong page is still never written: mislabelled training data is
// worse than a gap, because nothing downstream can tell it apart from real evidence.
// Keep a rejected capture instead of dropping it. Learned the hard way: a dataset run hit a
// 25% rejection rate, and because every rejected capture was discarded, the worker's own
// diagnostics recorded nothing but success and the only trace was one line in a host log.
// The evidence for diagnosing this class of failure has to survive it.
function writeRejected(testCase, variant, capture, attempt) {
  mkdirSync(REJECTED_ROOT, { recursive: true });
  const path = resolve(REJECTED_ROOT, testCase.id + "." + variant + ".attempt" + attempt + ".json");
  writeFileSync(path, JSON.stringify(capture, null, 2) + "\n", "utf8");
  return path;
}

async function captureVerified(ctx, testCase, { url, title, variant }) {
  let wrong = "";
  for (let attempt = 1; attempt <= CAPTURE_ATTEMPTS; attempt++) {
    const capture = await captureTolerantly(ctx, testCase, url);
    if (captureMentionsTitle(capture, title)) return capture;
    wrong = describeWrongPage(capture, { title, url });
    const kept = writeRejected(testCase, variant, capture, attempt);
    console.log("  attempt " + attempt + "/" + CAPTURE_ATTEMPTS + ": " + wrong);
    console.log("    diagnostics kept: " + kept);
  }
  throw new Error(wrong + " after " + CAPTURE_ATTEMPTS + " attempts. Not written as evidence; " +
    "the rejected captures are in " + REJECTED_ROOT + " for diagnosis.");
}

/** The worker's own account of what it is, which the cache key depends on. */
async function workerEnvironment(worker) {
  try {
    return (await fetchJson(worker + "/health", {}, 15000)).environment ?? {};
  } catch {
    // An unreachable worker is handled by waitForWorker; keying on {} here just means its captures
    // will not match cached ones, which is the safe direction.
    return {};
  }
}

function provenanceFor(ctx, testCase) {
  const pageDir = resolve(PAGE_ROOT, testCase.id);
  const options = captureOptions(testCase);
  const environment = ctx.environment ?? {};
  return {
    key: cacheKey({ caseId: testCase.id, pageHash: hashPageDir(pageDir), options, environment }),
    options,
    environment,
  };
}

/**
 * Reuse the pair on disk when nothing that shapes it has changed, otherwise capture it.
 *
 * @returns {Promise<{cached: boolean, phrases?: object, reason?: string}>}
 */
async function cachedOrCapture(ctx, testCase) {
  if (!CACHE) return { cached: false, phrases: await captureCase(ctx, testCase) };
  const { key } = provenanceFor(ctx, testCase);
  const decision = cacheDecision({ captureRoot: CAPTURE_ROOT, caseId: testCase.id, key });
  if (!decision.reuse) return { cached: false, phrases: await captureCase(ctx, testCase) };
  // Worth saying out loud: the evidence is valid by protocol version, but it was produced by
  // different capture code. Silently reusing it is how you lose track of what made your dataset.
  if (decision.staleCode && decision.staleCode !== ctx.environment?.workerCode) {
    console.log("  " + testCase.id + ": reusing evidence produced by different capture code (" +
      decision.staleCode + " vs " + (ctx.environment?.workerCode ?? "unknown") + ")");
  }
  return { cached: true, reason: decision.reason };
}

async function captureCase(ctx, testCase) {
  const phrases = {};
  ctx = { ...ctx, provenance: provenanceFor(ctx, testCase) };
  for (const variant of ["good", "bad"]) {
    const url = captureUrl(ctx.baseUrl, testCase, variant);
    const title = await pageTitle(url);
    ctx.progress.startCase(testCase.id, variant, ctx.worker);
    console.log("Capturing " + testCase.id + " (" + variant + ")" +
      (ctx.poolSize > 1 ? " on " + ctx.worker : ""));
    const capture = await captureVerified(ctx, testCase, { url, title, variant });
    const path = writeCapture(testCase, variant, capture, ctx.provenance);
    console.log("  " + capture.transcript.length + " transcript phrases -> " + path);
    phrases[variant] = capture.transcript.length;
  }
  return phrases;
}

// A run interrupted an hour in should not start over. Must be read BEFORE beginRun, which
// replaces the progress file with a fresh all-pending one. Targeted repair runs also replace
// that file, so a complete, non-empty NVDA pair on disk is a safe fallback when its progress
// entry belongs to an earlier full run.
//
// A case counts as done only if the previous run recorded it captured AND both files are
// still on disk: the progress file and the captures can be deleted independently, and
// trusting either alone silently skips work that no longer exists.
function hasUsableCaptureFiles(id) {
  return ["good", "bad"].every((variant) => {
    try {
      const capture = JSON.parse(readFileSync(resolve(CAPTURE_ROOT, id + "." + variant + ".json"), "utf8"));
      return capture.screenReader === "NVDA" && Array.isArray(capture.transcript) && capture.transcript.length > 0;
    } catch {
      return false;
    }
  });
}

function previouslyCaptured(cases) {
  if (!RESUME) return new Set();
  const previous = readProgress(ROOT)?.cases ?? {};
  const done = new Set(Object.entries(previous)
    .filter(([id, entry]) =>
      (entry.status === "captured" || entry.status === "skipped" ||
        (entry.status === "failed" && /HTTP 429.*capture is already in progress/i.test(entry.reason || ""))) &&
      hasUsableCaptureFiles(id))
    .map(([id]) => id));
  for (const { id } of cases) {
    if (hasUsableCaptureFiles(id)) done.add(id);
  }
  return done;
}

function afterRun() {
  const v = process.env.A11Y_VM_AFTER;
  if (!v) return "restore";
  if (isAfterRun(v)) return v;
  throw new Error('A11Y_VM_AFTER must be restore|stop|pause|leave (got "' + v + '")');
}

// One case per worker at a time, pulled from a shared queue.
//
// The unit of work is a CASE, not a capture: its good and bad variants must be captured by the
// same worker, because the pair is only comparable if both came from the same screen reader on
// the same machine. Splitting a pair across workers would compare two NVDA instances and call
// the difference evidence.
//
// A queue rather than a static split, so a slow case does not leave a worker idle while
// another still has a backlog.
async function captureAcrossPool(ctxBase, cases, done, workers) {
  const queue = [...cases];
  const failures = [];
  const skipped = [];
  const cachedIds = [];
  await Promise.all(workers.map(async (worker) => {
    // Once per worker: the cache key depends on this guest's NVDA, Edge, protocol and provisioning,
    // and a pool member that differs must not reuse another's evidence.
    const ctx = { ...ctxBase, worker, environment: await workerEnvironment(worker) };
    while (queue.length) {
      const testCase = queue.shift();
      if (done.has(testCase.id)) {
        ctx.progress.skipped(testCase.id, "already captured (--resume)");
        skipped.push(testCase.id);
        continue;
      }
      try {
        const result = await cachedOrCapture(ctx, testCase);
        if (result.cached) {
          ctx.progress.skipped(testCase.id, "cached: " + result.reason);
          cachedIds.push(testCase.id);
          continue;
        }
        ctx.progress.captured(testCase.id, result.phrases);
      } catch (error) {
        failures.push(testCase.id + ": " + error.message);
        ctx.progress.failed(testCase.id, error.message);
        console.error("  CAPTURE_FAILED " + failures.at(-1));
      }
    }
  }));
  if (cachedIds.length) {
    console.log("Reused cached evidence for " + cachedIds.length + " case(s); " +
      (queue.length === 0 ? "" : "") + "no worker time spent on them.");
  }
  return { failures, skippedCount: skipped.length + cachedIds.length, cachedCount: cachedIds.length };
}

async function captureAll(ctxBase, cases, done) {
  const failures = [];
  const ctx = { ...ctxBase, environment: await workerEnvironment(ctxBase.worker) };
  let cached = 0;
  for (const testCase of cases) {
    if (done.has(testCase.id)) {
      ctx.progress.skipped(testCase.id, "already captured (--resume)");
      console.log("Skipping " + testCase.id + " (already captured)");
      continue;
    }
    try {
      const result = await cachedOrCapture(ctx, testCase);
      if (result.cached) {
        ctx.progress.skipped(testCase.id, "cached: " + result.reason);
        console.log("Reusing " + testCase.id + " (cached: " + result.reason + ")");
        cached += 1;
        continue;
      }
      ctx.progress.captured(testCase.id, result.phrases);
    } catch (error) {
      failures.push(testCase.id + ": " + error.message);
      ctx.progress.failed(testCase.id, error.message);
      console.error("  CAPTURE_FAILED " + failures.at(-1));
    }
  }
  // Cached cases are skipped, not captured -- counting them as captured would report worker time
  // that was never spent, which is the one number this whole feature exists to change.
  const outcome = (cases.length - failures.length - done.size - cached) + " captured, " +
    failures.length + " failed, " + (done.size + cached) + " skipped" +
    (cached ? " (" + cached + " cached)" : "") + ", of " + cases.length + " cases";
  ctx.progress.finish(outcome);
  console.log("Capture complete: " + outcome + ".");
  if (failures.length) {
    throw new Error(failures.length + " case(s) failed. The completed captures were kept; " +
      "see npm run training:status, and re-run with --resume to retry only what is missing.");
  }
}

async function acquireDatasetWorkers() {
  // Same lease as the witness CLI: an explicit A11Y_WORKER is used untouched, otherwise a
  // local VM is started on demand and put back as it was found. Dataset capture is the run
  // that benefits most -- it is long, unattended, and used to leave the guest running after.
  // Three ways to get workers, in priority order:
  //   A11Y_WORKERS  an explicit pool -- someone else's to manage, so no lifecycle handling
  //   two or more local VMs  leased as a pool AND put back afterwards
  //   otherwise     the single-worker lease, as before
  //
  // The middle case is the point: pooling used to hand back a no-op release, so a pooled run
  // left every VM running indefinitely. That is the exact cost the single-worker lease exists
  // to avoid, and it came back the moment pooling became the normal way to run.
  const explicitPool = WORKERS_ENV
    ? WORKERS_ENV.split(",").map((w) => w.trim().replace(/\/$/, "")).filter(Boolean)
    : null;
  if (explicitPool) {
    return {
      pool: explicitPool,
      lease: { worker: explicitPool[0], source: "explicit", hostAddress: undefined, release: async () => {} },
    };
  }
  if (!process.env.A11Y_WORKER) {
    const localPool = await leaseWorkerPool(afterRun());
    return {
      pool: localPool.workers,
      lease: { worker: localPool.workers[0], source: "local-vm", hostAddress: localPool.hostAddress, release: localPool.release },
    };
  }
  return { pool: null, lease: await leaseWorker({ worker: process.env.A11Y_WORKER, after: afterRun() }) };
}

async function checkDatasetWorkers(pool, lease) {
  if (pool) {
    // Check every one of them before starting: discovering a dead worker an hour in wastes
    // the hour, and the pool driver would keep handing it cases.
    for (const worker of pool) await checkWorker({ worker, source: "explicit" });
    console.log(`Pool of ${pool.length}: ${pool.join(", ")}`);
    return;
  }
  await checkWorker(lease);
}

function captureProgress(cases, lease, pool, baseUrl) {
  const progress = beginRun({
    root: ROOT,
    worker: lease.worker,
    baseUrl,
    cases,
    captureTimeoutMs: CAPTURE_TIMEOUT_MS,
  });
  progress.setWorkers(pool ?? [lease.worker]);
  console.log("Progress: " + progress.path + " (watch it: npm run training:status, or block: npm run training:wait)");
  return progress;
}

async function captureWithPool({ baseUrl, progress, pool }, cases, done) {
  const { failures, skippedCount, cachedCount } = await captureAcrossPool(
    { baseUrl, progress, poolSize: pool.length }, cases, done, pool);
  const captured = cases.length - failures.length - skippedCount;
  const outcome = `${captured} captured, ${failures.length} failed, ${skippedCount} skipped` +
    (cachedCount ? ` (${cachedCount} cached)` : "") +
    `, of ${cases.length} cases across ${pool.length} workers`;
  progress.finish(outcome);
  console.log("Capture complete: " + outcome + ".");
  if (failures.length) {
    throw new Error(failures.length + " case(s) failed. The completed captures were kept; " +
      "see npm run training:status, and re-run with --resume to retry only what is missing.");
  }
}

async function captureDataset(cases, done, pool, lease) {
  const baseUrl = resolveBaseUrl(lease);
  // Prove the pages are served before capturing anything. captureAll treats a bad page as
  // a per-case failure, so without this a wrong base URL reports the same error 45 times
  // over -- and each one costs a full NVDA capture first.
  await pageTitle(captureUrl(baseUrl, cases[0], "good"));
  const progress = captureProgress(cases, lease, pool, baseUrl);
  if (pool && pool.length > 1) {
    await captureWithPool({ baseUrl, progress, pool }, cases, done);
    return;
  }
  await captureAll({ worker: lease.worker, baseUrl, progress, poolSize: 1 }, cases, done);
}

async function main() {
  const manifest = readManifest();
  const cases = ONLY ? manifest.cases.filter(({ id }) => id.includes(ONLY)) : manifest.cases;
  if (!cases.length) throw new Error("No generated case matches --only=" + ONLY);

  const done = previouslyCaptured(cases);
  if (done.size) console.log("Resuming: " + done.size + " case(s) already captured.");

  const { pool, lease } = await acquireDatasetWorkers();
  try {
    await checkDatasetWorkers(pool, lease);
    await captureDataset(cases, done, pool, lease);
  } finally {
    await lease.release();
  }
}

main().catch((error) => {
  console.error("training:capture failed:", error.message);
  process.exitCode = 1;
});
