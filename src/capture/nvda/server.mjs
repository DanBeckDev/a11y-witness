// server.mjs — NVDA capture worker as an HTTP service.
// MUST run in an interactive desktop session (see run-server.cmd + the README).
//   POST /capture  { url, task?, steps? }  -> { url, screenReader, transcript, task }
//   GET  /health                           -> { ok, screenReader, busy }
// NVDA is a single shared resource, so captures are serialized.
import { createServer } from "node:http";
import { captureWithNvda } from "./capture-core.mjs";

const PORT = Number(process.env.A11Y_PORT || 8765);
let busy = false;

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
      const { url, task = null, steps } = parsed;
      if (!url) return send(res, 400, { error: "url is required" });
      busy = true;
      const startedAt = new Date().toISOString();
      console.log(`[${startedAt}] capture ${url}`);
      try {
        const result = await captureWithNvda(url, { steps });
        console.log(`  -> ${result.transcript.length} phrases`);
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

server.listen(PORT, () => console.log(`a11y-witness NVDA worker listening on :${PORT}`));
