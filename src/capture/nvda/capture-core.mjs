// capture-core.mjs — drive NVDA through a page and return what it announced.
// Shared by the standalone CLI (capture.mjs) and the HTTP worker (server.mjs).
// MUST run in an interactive desktop session.
import { nvda } from "@guidepup/guidepup";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

/**
 * Launch Edge at `url`, drive NVDA through a browse-mode read-through, and
 * return the announcement transcript.
 * @returns {Promise<{url:string,screenReader:string,capturedAt:string,transcript:string[]}>}
 */
export async function captureWithNvda(url, opts = {}) {
  const steps = Number(opts.steps || 150);
  const browserWaitMs = Number(opts.browserWaitMs || 12000);
  // "line" reads visual-line-by-line via NVDA browse mode (readNext) — this is
  // the faithful full-page traversal in reading order, the way a user arrows
  // down a page. It can fragment a wrapped heading/link across lines; the judge
  // is instructed to treat that as one element rather than split structure.
  // "object" navigation (moveToNextObject) does NOT do a full reading-order
  // traversal (it walks siblings at one level and stops early), so it is not a
  // usable read-through. Line is the default.
  const nav = opts.nav === "object" ? "object" : "line";

  spawn(
    "cmd",
    ["/c", "start", "", "msedge",
      "--no-first-run", "--no-default-browser-check", "--start-maximized",
      `--user-data-dir=${process.env.TEMP}\\edge-a11y`, "--new-window", url],
    { detached: true, stdio: "ignore" }
  );
  await sleep(browserWaitMs); // cold start + page load + take foreground

  await nvda.start();
  await sleep(3000);

  const transcript = [];
  try {
    const first = ((await nvda.itemText()) || "").trim();
    if (first) transcript.push(first);
  } catch { /* itemText not critical */ }

  // Bound the read so a stuck screen reader can never hang the worker: an
  // overall time budget plus a per-step timeout. On timeout we stop and return
  // whatever was captured so far.
  const maxMs = Number(opts.maxMs || 90000);
  const deadline = Date.now() + maxMs;
  const withTimeout = (p, ms, label) =>
    Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms))]);

  const seen = new Set();
  let last = null, dupes = 0, wrapRun = 0;
  for (let i = 0; i < steps; i++) {
    if (Date.now() > deadline) break;
    let phrase;
    try {
      if (nav === "object") await withTimeout(nvda.perform(nvda.keyboardCommands.moveToNextObject), 8000, "advance");
      else await withTimeout(nvda.next(), 8000, "advance");
      phrase = ((await withTimeout(nvda.lastSpokenPhrase(), 5000, "read")) || "").trim();
    } catch {
      break; // a step hung; stop reading and return what we have
    }
    if (!phrase) continue;
    if (phrase === last) { if (++dupes >= 3) break; continue; } // stuck at the bottom of a short page
    dupes = 0; last = phrase;
    // Wrap detection: NVDA "read next" can loop back to the top of a long page.
    // A run of substantial phrases we have already captured means we have
    // wrapped around, so stop and do not record the repeats. Short tokens
    // ("blank", "link") legitimately recur, so they do not count.
    const substantial = phrase.length > 20;
    if (substantial && seen.has(phrase)) {
      if (++wrapRun >= 4) break;
      continue;
    }
    wrapRun = 0;
    if (substantial) seen.add(phrase);
    transcript.push(phrase);
  }

  await nvda.stop();
  // Best-effort: close the browser so the next capture starts clean.
  spawn("cmd", ["/c", "taskkill", "/im", "msedge.exe", "/f"], { stdio: "ignore" });

  return { url, screenReader: "NVDA", capturedAt: new Date().toISOString(), transcript };
}
