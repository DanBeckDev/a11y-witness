// server.mjs — NVDA capture worker as an HTTP service.
// MUST run in an interactive desktop session (see run-server.cmd + the README).
//   POST /capture  { url, task?, steps?, probeForms?, probeFocus? }
//                                          -> { url, screenReader, transcript, task }
//   GET  /health                           -> { ok, screenReader, busy, code }
// NVDA is a single shared resource, so captures are serialized.
import { createServer } from "node:http";
import { appendFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { captureWithNvda, shutdownScreenReader } from "./capture-core.mjs";

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

function captureOptions(parsed) {
  return {
    steps: parsed.steps,
    nav: parsed.nav,
    task: parsed.task ?? null,
    probeForms: parsed.probeForms ?? false,
    probeFocus: parsed.probeFocus ?? false,
    reuseScreenReader: REUSE_NVDA,
  };
}

function send(res, code, obj) {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(obj));
}

const server = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    return send(res, 200, { ok: true, screenReader: "NVDA", busy, code: CODE_VERSION });
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
        const after = (result.diagnostics || []).find((e) => e.event === "afterStart");
        log(`  -> ${result.transcript.length} phrases; afterStart.lastSpoken=${JSON.stringify(after && after.lastSpoken)}`);
        if (result.transcript.length === 0) {
          log("  WARNING: 0 phrases. If afterStart.lastSpoken is empty, NVDA is running but not speaking — restart/reboot the worker.");
        }
        send(res, 200, { ...result, task: opts.task });
      } catch (e) {
        log("  capture failed: " + ((e && e.stack) || e));
        send(res, 500, { error: String((e && e.message) || e) });
      } finally {
        busy = false;
      }
    });
    return;
  }
  send(res, 404, { error: "not found" });
});

server.listen(PORT, () => log(`a11y-witness NVDA worker listening on :${PORT} (reuse NVDA: ${REUSE_NVDA})`));

// An NVDA socket error arrives asynchronously, outside the request handler that caused it,
// so it lands here as an uncaught exception. Without this the worker dies with a bare stack
// trace -- which is exactly what happened when another process stopped the NVDA this one was
// reusing: `Cannot connect to NVDA / ECONNREFUSED 127.0.0.1:6837`, task result 1, no worker.
//
// Exit deliberately non-zero rather than trying to soldier on: the screen reader's state is
// unknown at this point, and a worker that keeps answering /health while unable to capture is
// worse than one that is honestly gone. The scheduled task is configured to restart it.
for (const fatal of ["uncaughtException", "unhandledRejection"]) {
  process.on(fatal, (error) => {
    log(`${fatal}: ${(error && error.stack) || error}`);
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
