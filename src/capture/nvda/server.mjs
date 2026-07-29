// server.mjs — NVDA capture worker as an HTTP service.
// MUST run in an interactive desktop session (see run-server.cmd + the README).
//   POST /capture  { url, task?, steps?, probeForms?, probeFocus?, probeTables? }
//                                          -> { url, screenReader, transcript, task }
//   GET  /health                           -> { ok, screenReader, busy, code, environment }
// NVDA is a single shared resource, so captures are serialized.
import { createServer } from "node:http";
import { appendFileSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";
import {
  browserAvailable, CAPTURE_PROTOCOL_VERSION, captureWithNvda, forgetScreenReader,
  screenReaderReady, shutdownScreenReader, warmUpScreenReader,
} from "./capture-core.mjs";

const PORT = Number(process.env.A11Y_PORT || 8765);
const LOG_PATH = process.env.A11Y_SERVER_LOG || "server.log";

// Log to the console AND the file, from here rather than by redirecting the launcher.
//
// The launcher used to send everything to server.log, which left the VM's console window
// blank: a worker mid-capture and a wedged worker look identical if neither prints anything,
// and a capture takes ~12s, which reads as a hang to anyone watching the guest.
//
// Doing it in-process rather than piping through PowerShell's Tee-Object, which on Windows
// PowerShell 5.1 has no -Encoding parameter and writes UTF-16 -- that changed the log's
// encoding mid-file and broke every existing reader of it.
function log(line) {
  const stamped = `${line}\n`;
  process.stdout.write(stamped);
  try {
    appendFileSync(LOG_PATH, stamped, "utf8");
  } catch {
    // Console output is the fallback; a failed append must not take the worker down.
  }
}
let busy = false;

// Keep NVDA running between captures. Starting it costs ~5s, and this process serves many
// captures in a row.
//
// I turned this OFF for a while on the strength of a wrong conclusion, which is worth
// recording. A full run with reuse enabled produced markedly poorer evidence -- role words in
// 47% of phrases against 76% before, and "heading, level N" down from 105 to 15 -- so reuse
// looked like it was costing fidelity. It was not: the readiness gate landed in the same run
// and was overwriting the read-through's first line with the document title (see the
// re-anchor in capture-core). Two changes, one run, and a phrase COUNT that did not move, so
// neither the benchmark nor capture-check noticed.
//
// Measured properly afterwards, same 6 pages, gate fixed, one variable at a time:
//
//   reuse on:  29 phrases, 23 role words (79%), 8 "heading, level", 93s
//   reuse off: 29 phrases, 23 role words (79%), 8 "heading, level", 126s
//
// Identical evidence, 26% faster. capture-core recycles NVDA every 25 captures so a
// long-lived screen reader cannot drift unnoticed -- observed firing 3 times across 90
// captures. Set A11Y_REUSE_NVDA=0 for a fresh NVDA per capture, which remains the first thing
// to try if captures start behaving differently as a run progresses.
const REUSE_NVDA = process.env.A11Y_REUSE_NVDA !== "0";
const ENVIRONMENT_CACHE_MS = 5_000;

// Every probe is opt-in over the wire and defaults to off, so an old client keeps the old
// behaviour and no capture pays for a probe it did not ask for. Extracted from the handler
// because each default is a branch and the handler sat at the complexity ceiling.
// What code is this worker actually running?
//
// Deploying is push-then-restart, and both halves can fail silently. `utmctl exec` returns
// success and no output whether or not it ran anything -- measured: on two cloned guests the
// restart never happened, the workers served the previous process for another hour, and the
// hash check meant to catch that ALSO goes through exec, so it came back empty instead of
// mismatched. A verification that shares a failure mode with the action verifies nothing.
//
// So the worker reports its own code over the channel it serves on. `/health` is reachable
// exactly when the worker is usable, needs no guest agent, and a mismatch against the host's
// hash is unambiguous. Compare with: npm run worker:code
function codeVersion() {
  try {
    const hash = createHash("sha256");
    // Order matters and must match the host side: capture behaviour, then the wire contract.
    for (const file of ["capture-core.mjs", "server.mjs"]) {
      hash.update(readFileSync(new URL(file, import.meta.url)));
    }
    return hash.digest("hex").slice(0, 16);
  } catch (e) {
    // Never fatal: a worker that cannot hash itself can still capture, and saying so beats
    // refusing to start.
    log(`could not compute code version: ${e.message}`);
    return "unknown";
  }
}

const CODE_VERSION = codeVersion();

const EDGE_EXES = [
  `${process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)"}\\Microsoft\\Edge\\Application\\msedge.exe`,
  `${process.env.ProgramFiles || "C:\\Program Files"}\\Microsoft\\Edge\\Application\\msedge.exe`,
];

function powershellValue(script) {
  if (process.platform !== "win32") return "unknown";
  try {
    const value = execFileSync("powershell.exe", [
      "-NoProfile", "-NonInteractive", "-Command", script,
    ], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return value || "unknown";
  } catch {
    return "unknown";
  }
}

function fileProductVersion(path) {
  const escaped = path.replace(/'/g, "''");
  return powershellValue(`(Get-Item -LiteralPath '${escaped}').VersionInfo.ProductVersion`);
}

function findFile(root, wanted, depth = 0) {
  if (!root || depth > 5 || !existsSync(root)) return null;
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === wanted) return path;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const found = findFile(join(root, entry.name), wanted, depth + 1);
    if (found) return found;
  }
  return null;
}

function packageVersion(name) {
  try {
    const require = createRequire(import.meta.url);
    const packagePath = require.resolve(`${name}/package.json`);
    return JSON.parse(readFileSync(packagePath, "utf8")).version || "unknown";
  } catch {
    return "unknown";
  }
}

function runtimeEnvironment() {
  const guidepupRoot = process.env.GUIDEPUP_SCREEN_READERS_PATH ||
    (process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "guidepup") : "");
  const nvdaPath = findFile(join(guidepupRoot, "nvda"), "nvda.exe");
  const edgePath = EDGE_EXES.find((path) => existsSync(path));
  return {
    measuredAt: new Date().toISOString(),
    screenReader: "NVDA",
    screenReaderVersion: nvdaPath ? fileProductVersion(nvdaPath) : "unknown",
    browser: "Microsoft Edge",
    browserVersion: edgePath ? fileProductVersion(edgePath) : "unknown",
    guidepupVersion: packageVersion("@guidepup/guidepup"),
    nodeVersion: process.version,
    windowsVersion: powershellValue("$os = Get-CimInstance Win32_OperatingSystem; \"$($os.Caption) $($os.Version)\""),
    workerCode: CODE_VERSION,
    // What the evidence means, and what the host's capture cache keys on. See capture-core.mjs.
    captureProtocol: CAPTURE_PROTOCOL_VERSION,
    // Which provisioning built this guest. Written by provision-nvda-worker.ps1 rather than
    // hashed on the host, so it describes what the guest ACTUALLY has -- provisioning changes
    // NVDA's config, Edge's policies and ForegroundLockTimeout, all of which change the evidence.
    provisionRevision: provisionRevision(),
  };
}

const PROVISION_STAMP = "C:\\Users\\witness\\a11y-witness\\provision-revision.txt";

function provisionRevision() {
  try {
    return readFileSync(PROVISION_STAMP, "utf8").trim() || "unstamped";
  } catch {
    // A guest provisioned before the stamp existed. Named rather than blank so a cache miss
    // caused by re-provisioning is explainable after the fact.
    return "unstamped";
  }
}

let environmentCache = null;
let environmentMeasuredAt = 0;

function currentEnvironment() {
  if (!environmentCache || Date.now() - environmentMeasuredAt > ENVIRONMENT_CACHE_MS) {
    environmentCache = runtimeEnvironment();
    environmentMeasuredAt = Date.now();
  }
  return environmentCache;
}

function captureOptions(parsed) {
  return {
    steps: parsed.steps,
    nav: parsed.nav,
    task: parsed.task ?? null,
    probeForms: parsed.probeForms ?? false,
    probeFocus: parsed.probeFocus ?? false,
    probeTables: parsed.probeTables ?? false,
    // The worker default is deliberately fast, but callers running a provenance or
    // repeatability pass may require a fresh NVDA lifecycle for every capture. Keep this
    // opt-in at the request boundary so the host's environment cannot be mistaken for the
    // guest's process environment (A11Y_REUSE_NVDA on the host never reaches this process).
    reuseScreenReader: typeof parsed.reuseScreenReader === "boolean"
      ? parsed.reuseScreenReader
      : REUSE_NVDA,
  };
}

function send(res, code, obj) {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(obj));
}

// ForegroundLockTimeout, read ONCE.
//
// Two reasons for the cache: PowerShell startup is ~0.5 s and /health is polled, and the value
// cannot change under us -- run-server.cmd applies it to this session before node starts and
// nothing else touches it for the worker's lifetime.
//
// It has to be read with SystemParametersInfo, not from the registry: the registry value is not
// what the session uses (that is the whole reason apply-foreground-lock-timeout.ps1 exists). Left
// non-zero, Edge is refused the foreground and every capture returns 0 phrases with no error.
const FLT_GET = 0x2000; // SPI_GETFOREGROUNDLOCKTIMEOUT
let fltCache;

function foregroundLockTimeout() {
  if (fltCache !== undefined) return fltCache;
  const raw = powershellValue(`
    Add-Type -Namespace W -Name Spi -MemberDefinition '
      [DllImport("user32.dll", SetLastError=true)]
      public static extern bool SystemParametersInfo(uint a, uint b, ref uint c, uint d);' | Out-Null
    $v = 0
    if ([W.Spi]::SystemParametersInfo(${FLT_GET}, 0, [ref]$v, 0)) { $v } else { "unknown" }`);
  const parsed = Number.parseInt(raw, 10);
  // null means "could not read", which must NOT block the worker: a broken diagnostic taking the
  // whole pool offline is worse than the fault it looks for. A value we DID read and dislike does
  // block.
  fltCache = Number.isFinite(parsed) ? parsed : null;
  return fltCache;
}

// Warm-up state. `error` is kept so a not-ready worker says WHY, which is the difference between
// "give it a moment" and "this guest is broken".
let warm = { ok: false, error: "not warmed up yet", at: null };
let warming = false;

async function warmUp(reason) {
  // One at a time. Readiness polling drives re-warms, and two concurrent NVDA starts would fight
  // over a single machine-wide screen reader.
  if (warming) return;
  warming = true;
  try {
    log(`warming up NVDA (${reason})`);
    const result = await warmUpScreenReader();
    warm = { ok: result.ok, error: result.error, at: new Date().toISOString() };
    // A success re-arms the budget: the next fault deserves its own three attempts.
    if (result.ok) warmAttempts = 0;
    log(result.ok
      ? "warm: NVDA is up and answering; the worker is ready"
      : `warm FAILED: ${result.error} — reporting not ready`);
  } finally {
    warming = false;
  }
}

// Retry warm-up when asked whether we are ready -- but NOT on every poll.
//
// Without any retry, a worker that failed to warm at boot reports not-ready forever and `up` calls
// a recoverable guest broken. With a retry on every poll, the opposite: /health is polled every few
// seconds by `up`, the dispatcher and doctor, and each attempt starts NVDA. This codebase's own
// warning is that cycling NVDA destabilises the speech-capture channel, so an unbounded retry is a
// way to turn a slow boot into a broken worker.
//
// So: at most one attempt per cooldown, and stop after a few. A guest that cannot warm up in three
// tries over a minute and a half needs looking at, not another restart -- and it now says so
// instead of thrashing.
const WARM_RETRY_COOLDOWN_MS = 30_000;
const MAX_WARM_ATTEMPTS = 3;
let warmAttempts = 0;
let lastWarmAttempt = 0;

function reWarmIfNeeded() {
  if (warm.ok || warming) return;
  if (warmAttempts >= MAX_WARM_ATTEMPTS) return;
  if (Date.now() - lastWarmAttempt < WARM_RETRY_COOLDOWN_MS) return;
  lastWarmAttempt = Date.now();
  warmAttempts += 1;
  warmUp(`retry ${warmAttempts}/${MAX_WARM_ATTEMPTS} while not ready`)
    .catch((e) => log("re-warm threw: " + e.message));
}

/**
 * Can this worker actually take a capture right now?
 *
 * Every check here is one that has silently failed in production. A worker answering `ok: true`
 * while NVDA could not start is what made the pool look like it had a moving fault: whichever VM
 * had been up longest worked, freshly booted ones did not.
 */
async function readiness() {
  const screenReader = await screenReaderReady();
  // The LIVE probe is the truth; `warm.ok` is only a memory of a past success. Observed on a real
  // worker: `warmedUp: true` beside `screenReader: false` -- NVDA had started and then died, and
  // because the recovery path only triggered when warm.ok was false, nothing retried. The worker sat
  // reporting not-ready with no way back. So a screen reader that has stopped answering invalidates
  // the memory, which re-arms the (still bounded) retry.
  if (!screenReader && warm.ok) {
    warm = { ok: false, error: "NVDA stopped answering after a successful warm-up", at: new Date().toISOString() };
    warmAttempts = 0;
    lastWarmAttempt = 0;
  }
  reWarmIfNeeded();
  const checks = {
    screenReader,
    browser: browserAvailable(),
    // Applied per session by run-server.cmd. Left non-zero, Edge is refused the foreground and
    // every capture returns 0 phrases with NO error at all -- the worst failure mode we have.
    foregroundLockTimeout: foregroundLockTimeout(),
    warmedUp: warm.ok,
  };
  const failed = Object.entries(checks)
    // foregroundLockTimeout is a number: 0 is good, non-zero is bad, null is unreadable and is
    // deliberately not a failure (see foregroundLockTimeout()).
    .filter(([name, value]) => (name === "foregroundLockTimeout"
      ? typeof value === "number" && value !== 0
      : !value))
    .map(([name]) => name);
  return {
    ready: failed.length === 0 && !busy,
    checks,
    // Not an error when it is merely busy: a worker mid-capture is healthy, just not free.
    reason: failed.length ? `not ready: ${failed.join(", ")}${warm.error ? ` (${warm.error})` : ""}`
      : busy ? "busy with a capture" : null,
  };
}

const server = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    const environment = currentEnvironment();
    // `ok` is kept for older callers and still means "the HTTP server is answering". `ready` is
    // the one to dispatch on -- see readiness().
    return readiness().then((state) => send(res, 200, {
      ok: true,
      ready: state.ready,
      readiness: state,
      screenReader: environment.screenReader,
      busy,
      code: CODE_VERSION,
      environment,
    })).catch((e) => send(res, 500, { error: String((e && e.message) || e) }));
  }
  if (req.method === "POST" && req.url === "/capture") {
    if (busy) return send(res, 429, { error: "a capture is already in progress" });
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      let parsed;
      try { parsed = JSON.parse(body || "{}"); }
      catch { return send(res, 400, { error: "invalid JSON body" }); }
      const { url } = parsed;
      if (!url) return send(res, 400, { error: "url is required" });
      const opts = captureOptions(parsed);
      busy = true;
      const startedAt = new Date().toISOString();
      log(`[${startedAt}] capture ${url} (nav=${opts.nav || "object"}, probeForms=${opts.probeForms}, probeFocus=${opts.probeFocus})`);
      try {
        const result = await captureWithNvda(url, opts);
        const environment = currentEnvironment();
        const after = (result.diagnostics || []).find((e) => e.event === "afterStart");
        log(`  -> ${result.transcript.length} phrases; afterStart.lastSpoken=${JSON.stringify(after && after.lastSpoken)}`);
        if (result.transcript.length === 0) {
          log("  WARNING: 0 phrases. If afterStart.lastSpoken is empty, NVDA is running but not speaking — restart/reboot the worker.");
        }
        send(res, 200, {
          ...result,
          screenReader: environment.screenReader,
          task: opts.task,
          environment,
        });
      } catch (e) {
        log("  capture failed: " + ((e && e.stack) || e));
        send(res, 500, { error: String((e && e.message) || e) });
        // A capture that died may have left NVDA unusable. Stop claiming readiness and try to get
        // back to it, rather than accepting the next case and failing that one too.
        warm = { ok: false, error: "last capture failed: " + String((e && e.message) || e), at: new Date().toISOString() };
        warmAttempts = 0;
        lastWarmAttempt = Date.now();
        warmUp("after a failed capture").catch((err) => log("re-warm failed: " + err.message));
      } finally {
        busy = false;
      }
    });
    return;
  }
  send(res, 404, { error: "not found" });
});

server.listen(PORT, () => {
  log(`a11y-witness NVDA worker listening on :${PORT} (reuse NVDA: ${REUSE_NVDA})`);
  // Deliberately not awaited: the port must answer immediately so callers can see "not ready yet"
  // instead of a connection refusal, which reads as a dead worker.
  warmUp("worker start").catch((e) => log("warm-up threw: " + e.message));
});

// An NVDA socket error arrives asynchronously, outside the request handler that caused it,
// so it lands here as an uncaught exception. Without this the worker dies with a bare stack
// trace -- which is exactly what happened when another process stopped the NVDA this one was
// reusing: `Cannot connect to NVDA / ECONNREFUSED 127.0.0.1:6837`, task result 1, no worker.
//
// Exit deliberately non-zero rather than trying to soldier on: the screen reader's state is
// unknown at this point, and a worker that keeps answering /health while unable to capture is
// worse than one that is honestly gone. The scheduled task is configured to restart it.
// A dropped NVDA speech channel is RECOVERABLE and must not kill the worker.
//
// Guidepup reports it asynchronously on its own socket, so it arrives as an unhandled
// rejection: "Cannot connect to NVDA", "connect ECONNREFUSED 127.0.0.1:6837". This used to
// exit(1) on the theory that the scheduled task would restart a clean worker. It does not
// reliably do that -- observed: a worker exited on exactly this error and was still dead three
// minutes later with its VM up and RestartCount 5 configured, and only came back when restarted
// by hand. Exiting therefore traded a recoverable fault for a dead worker.
//
// Now the worker forgets the reused NVDA and keeps serving; the next capture cold-starts one.
const RECOVERABLE = /Cannot connect to NVDA|ECONNREFUSED[\s\S]*6837/i;

for (const fatal of ["uncaughtException", "unhandledRejection"]) {
  process.on(fatal, (error) => {
    const detail = (error && error.stack) || String(error);
    log(`${fatal}: ${detail}`);
    if (RECOVERABLE.test(detail)) {
      forgetScreenReader();
      log("NVDA speech channel lost — forgetting it and staying up; the next capture cold-starts NVDA");
      return;
    }
    log("exiting so the scheduled task can restart a clean worker");
    process.exit(1);
  });
}

// A reused NVDA outlives the capture that started it, so it has to be stopped when this
// process goes away -- otherwise the scheduled task restarts the worker into a machine that
// already has a screen reader running, which is how the speech channel destabilises.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    log(`${signal}: stopping NVDA before exit`);
    await shutdownScreenReader();
    process.exit(0);
  });
}
