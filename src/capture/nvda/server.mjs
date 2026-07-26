// server.mjs — NVDA capture worker as an HTTP service.
// MUST run in an interactive desktop session (see run-server.cmd + the README).
//   POST /capture  { url, task?, steps? }  -> { url, screenReader, transcript, task }
//   GET  /health                           -> { ok, screenReader, busy }
// NVDA is a single shared resource, so captures are serialized.
import { createServer } from "node:http";
import { captureWithNvda, shutdownScreenReader } from "./capture-core.mjs";

const PORT = Number(process.env.A11Y_PORT || 8765);
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

function send(res, code, obj) {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(obj));
}

const server = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    return send(res, 200, { ok: true, screenReader: "NVDA", busy });
  }
  if (req.method === "POST" && req.url === "/capture") {
    if (busy) return send(res, 429, { error: "a capture is already in progress" });
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      let parsed;
      try { parsed = JSON.parse(body || "{}"); }
      catch { return send(res, 400, { error: "invalid JSON body" }); }
      const { url, task = null, steps, nav, probeForms = false } = parsed;
      if (!url) return send(res, 400, { error: "url is required" });
      busy = true;
      const startedAt = new Date().toISOString();
      console.log(`[${startedAt}] capture ${url} (nav=${nav || "object"}, probeForms=${probeForms})`);
      try {
        const result = await captureWithNvda(url, { steps, nav, probeForms, task, reuseScreenReader: REUSE_NVDA });
        const after = (result.diagnostics || []).find((e) => e.event === "afterStart");
        console.log(`  -> ${result.transcript.length} phrases; afterStart.lastSpoken=${JSON.stringify(after && after.lastSpoken)}`);
        if (result.transcript.length === 0) {
          console.log("  WARNING: 0 phrases. If afterStart.lastSpoken is empty, NVDA is running but not speaking — restart/reboot the worker.");
        }
        send(res, 200, { ...result, task });
      } catch (e) {
        console.error("  capture failed:", (e && e.stack) || e);
        send(res, 500, { error: String((e && e.message) || e) });
      } finally {
        busy = false;
      }
    });
    return;
  }
  send(res, 404, { error: "not found" });
});

server.listen(PORT, () =>
  console.log(`a11y-witness NVDA worker listening on :${PORT} (reuse NVDA: ${REUSE_NVDA})`)
);

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
    console.error(`${fatal}: ${(error && error.stack) || error}`);
    console.error("exiting so the scheduled task can restart a clean worker");
    process.exit(1);
  });
}

// A reused NVDA outlives the capture that started it, so it has to be stopped when this
// process goes away -- otherwise the scheduled task restarts the worker into a machine that
// already has a screen reader running, which is how the speech channel destabilises.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    console.log(`${signal}: stopping NVDA before exit`);
    await shutdownScreenReader();
    process.exit(0);
  });
}
