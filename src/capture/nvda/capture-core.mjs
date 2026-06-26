// capture-core.mjs — drive NVDA through a page and return what it announced.
// Shared by the standalone CLI (capture.mjs) and the HTTP worker (server.mjs).
// MUST run in an interactive desktop session.
import { nvda } from "@guidepup/guidepup";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

/**
 * Launch Edge at `url` and drive NVDA the way a real user does:
 *  - a browse-mode read-through (document order), and
 *  - structural navigation passes: skim by heading, by landmark, by form field
 *    (NVDA's H / D / F quick-nav), each reset to the top of the page first.
 *
 * The structural passes reveal things a linear read cannot assert, e.g. a page
 * with NO real headings (visual titles that are not marked up).
 *
 * @returns {Promise<{url:string,screenReader:string,capturedAt:string,
 *   transcript:string[], structure:{headings:string[],landmarks:string[],formFields:string[]}}>}
 */
export async function captureWithNvda(url, opts = {}) {
  const steps = Number(opts.steps || 150);
  const browserWaitMs = Number(opts.browserWaitMs || 12000);
  const navStrategy = opts.nav === "object" ? "object" : "line";
  const maxMs = Number(opts.maxMs || 120000); // overall budget (read + structural passes)

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

  const deadline = Date.now() + maxMs;
  const withTimeout = (p, ms, label) =>
    Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms))]);
  const K = nvda.keyboardCommands;

  // --- Read-through: browse-mode line reading in document order, the way a
  // user arrows down the page. Bounded by a per-step timeout and overall budget. ---
  const transcript = [];
  try {
    const first = ((await nvda.itemText()) || "").trim();
    if (first) transcript.push(first);
  } catch { /* itemText not critical */ }

  const seen = new Set();
  let last = null, dupes = 0, wrapRun = 0;
  for (let i = 0; i < steps; i++) {
    if (Date.now() > deadline) break;
    let phrase;
    try {
      if (navStrategy === "object") await withTimeout(nvda.perform(K.moveToNextObject), 8000, "advance");
      else await withTimeout(nvda.next(), 8000, "advance");
      phrase = ((await withTimeout(nvda.lastSpokenPhrase(), 5000, "read")) || "").trim();
    } catch {
      break; // a step hung; stop reading and return what we have
    }
    if (!phrase) continue;
    if (phrase === last) { if (++dupes >= 3) break; continue; } // stuck at the bottom of a short page
    dupes = 0; last = phrase;
    // Wrap detection: NVDA "read next" can loop back to the top of a long page.
    const substantial = phrase.length > 20;
    if (substantial && seen.has(phrase)) { if (++wrapRun >= 4) break; continue; }
    wrapRun = 0;
    if (substantial) seen.add(phrase);
    transcript.push(phrase);
  }

  // --- Structural navigation passes (how a user skims): jump by element type
  // with NVDA quick-nav. Guidepup has no "move to top", so each type is swept
  // in BOTH directions (up via moveToPrevious*, then down via moveToNext*) and
  // the union taken, which collects every element regardless of where the
  // cursor is. An empty list means the page exposes none of that type (for
  // example a page whose visual titles are not real headings). ---
  async function sweep(cmd, label, out, seenKeys, max = 40) {
    for (let i = 0; i < max; i++) {
      if (Date.now() > deadline) break;
      let p;
      try {
        await withTimeout(nvda.perform(cmd), 6000, label);
        p = ((await withTimeout(nvda.lastSpokenPhrase(), 4000, label)) || "").trim();
      } catch { break; }
      if (!p || /\bno (next|previous|more)\b/i.test(p)) break; // e.g. "no next heading"
      const key = p.slice(0, 80);
      if (!seenKeys.has(key)) { seenKeys.add(key); out.push(p); }
    }
  }
  async function collect(prevCmd, nextCmd, label) {
    const out = [], seenKeys = new Set();
    await sweep(prevCmd, label, out, seenKeys); // sweep up from the bottom
    await sweep(nextCmd, label, out, seenKeys); // then down from the top
    return out;
  }

  let structure = { headings: [], landmarks: [], formFields: [] };
  try {
    structure = {
      headings: await collect(K.moveToPreviousHeading, K.moveToNextHeading, "heading"),
      landmarks: await collect(K.moveToPreviousLandmark, K.moveToNextLandmark, "landmark"),
      formFields: await collect(K.moveToPreviousFormField, K.moveToNextFormField, "formField"),
    };
  } catch { /* structural passes are best-effort */ }

  await nvda.stop();
  // Best-effort: close the browser so the next capture starts clean.
  spawn("cmd", ["/c", "taskkill", "/im", "msedge.exe", "/f"], { stdio: "ignore" });

  return { url, screenReader: "NVDA", capturedAt: new Date().toISOString(), transcript, structure };
}
