// capture-core.mjs — drive NVDA through a page and return what it announced.
// Shared by the standalone CLI (capture.mjs) and the HTTP worker (server.mjs).
// MUST run in an interactive desktop session.
//
// Every phase records a structured diagnostic (returned as `diagnostics`)
// instead of swallowing errors. The most important one is `afterStart.lastSpoken`:
// if NVDA announces nothing right after starting, it is not reading the page
// (focus / session / speech-pipe problem) and the whole capture will be empty —
// that single field explains an otherwise-mysterious empty result.
import { nvda, windowsActivate, windowsQuit } from "@guidepup/guidepup";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const errMsg = (e) => (e && e.message) || String(e);

/**
 * @returns {Promise<{url:string,screenReader:string,capturedAt:string,
 *   transcript:string[], structure:{headings:string[],landmarks:string[],formFields:string[]},
 *   interaction:{controls:string[],stateChanges:{control:string,after:string}[]},
 *   diagnostics:object[]}>}
 */
export async function captureWithNvda(url, opts = {}) {
  const steps = Number(opts.steps || 150);
  const browserWaitMs = Number(opts.browserWaitMs || 12000);
  const navStrategy = opts.nav === "object" ? "object" : "line";
  const maxMs = Number(opts.maxMs || 120000); // overall budget

  const t0 = Date.now();
  const diag = [];
  const mark = (event, info = {}) => diag.push({ event, atMs: Date.now() - t0, ...info });
  const withTimeout = (p, ms, label) =>
    Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms))]);

  spawn(
    "cmd",
    ["/c", "start", "", "msedge",
      "--no-first-run", "--no-default-browser-check", "--start-maximized",
      `--user-data-dir=${process.env.TEMP}\\edge-a11y`, "--new-window", url],
    { detached: true, stdio: "ignore" }
  );
  mark("browserLaunched", { url });
  await sleep(browserWaitMs); // cold start + page load

  // Bring the Edge window to the foreground and focus (relying on the launch to
  // take focus was a source of flaky, empty captures).
  try { await windowsActivate("msedge.exe", "Edge"); await sleep(800); mark("windowsActivate", { ok: true }); }
  catch (e) { mark("windowsActivate", { ok: false, error: errMsg(e) }); }

  try { await nvda.start(); mark("nvdaStart", { ok: true }); }
  catch (e) { mark("nvdaStart", { ok: false, error: errMsg(e) }); throw new Error("nvda.start failed: " + errMsg(e)); }
  await sleep(3000);

  const deadline = Date.now() + maxMs;
  const K = nvda.keyboardCommands;

  // HEALTH CHECK: what does NVDA announce right after start? Empty here => NVDA
  // is not reading the page; the whole capture will be empty.
  try { mark("afterStart", { lastSpoken: (await withTimeout(nvda.lastSpokenPhrase(), 4000, "afterStart")) || "" }); }
  catch (e) { mark("afterStart", { error: errMsg(e) }); }

  // --- Read-through: browse-mode line reading in document order. ---
  const transcript = [];
  try { const first = ((await nvda.itemText()) || "").trim(); if (first) transcript.push(first); }
  catch (e) { mark("itemText", { error: errMsg(e) }); }

  const seen = new Set();
  let last = null, dupes = 0, wrapRun = 0, stopReason = "maxSteps", firstStepError = null;
  for (let i = 0; i < steps; i++) {
    if (Date.now() > deadline) { stopReason = "deadline"; break; }
    let phrase;
    try {
      if (navStrategy === "object") await withTimeout(nvda.perform(K.moveToNextObject), 8000, "advance");
      else await withTimeout(nvda.next(), 8000, "advance");
      phrase = ((await withTimeout(nvda.lastSpokenPhrase(), 5000, "read")) || "").trim();
    } catch (e) { if (i === 0) firstStepError = errMsg(e); stopReason = "stepError"; break; }
    if (!phrase) continue;
    if (phrase === last) { if (++dupes >= 3) { stopReason = "repeatBottom"; break; } continue; }
    dupes = 0; last = phrase;
    const substantial = phrase.length > 20;
    if (substantial && seen.has(phrase)) { if (++wrapRun >= 4) { stopReason = "wrap"; break; } continue; }
    wrapRun = 0;
    if (substantial) seen.add(phrase);
    transcript.push(phrase);
  }
  mark("readThrough", { count: transcript.length, stopReason, firstStepError });

  // --- Structural navigation passes: skim by element type (quick-nav), swept
  // both directions (Guidepup has no "move to top") so every element is reached
  // regardless of cursor position. An empty list => the page exposes none. ---
  async function sweep(cmd, label, out, seenKeys, max = 40) {
    for (let i = 0; i < max; i++) {
      if (Date.now() > deadline) break;
      let p;
      try {
        await withTimeout(nvda.perform(cmd), 6000, label);
        p = ((await withTimeout(nvda.lastSpokenPhrase(), 4000, label)) || "").trim();
      } catch { break; }
      if (!p || /\bno (next|previous|more)\b/i.test(p)) break;
      const key = p.slice(0, 80);
      if (!seenKeys.has(key)) { seenKeys.add(key); out.push(p); }
    }
  }
  async function collect(prevCmd, nextCmd, label) {
    const out = [], seenKeys = new Set();
    await sweep(prevCmd, label, out, seenKeys);
    await sweep(nextCmd, label, out, seenKeys);
    return out;
  }

  let structure = { headings: [], landmarks: [], formFields: [] };
  try {
    structure = {
      headings: await collect(K.moveToPreviousHeading, K.moveToNextHeading, "heading"),
      landmarks: await collect(K.moveToPreviousLandmark, K.moveToNextLandmark, "landmark"),
      formFields: await collect(K.moveToPreviousFormField, K.moveToNextFormField, "formField"),
    };
    mark("structural", { headings: structure.headings.length, landmarks: structure.landmarks.length, formFields: structure.formFields.length });
  } catch (e) { mark("structural", { error: errMsg(e) }); }

  // --- Interaction pass: enumerate interactive controls via quick-nav (buttons),
  // and activate disclosures ("collapsed") to capture the announced state change.
  // A disclosure that does not announce "expanded" afterwards fails 4.1.2. ---
  let interaction = { controls: [], stateChanges: [] };
  const sweepLog = [];
  try {
    const controls = [], stateChanges = [], activated = new Set(), seenKeys = new Set();
    async function sweepButtons(cmd, label) {
      for (let i = 0; i < 40; i++) {
        if (Date.now() > deadline) { sweepLog.push(`${label}: deadline`); break; }
        let p;
        try {
          await withTimeout(nvda.perform(cmd), 6000, "button");
          await sleep(400); // navigating to an element triggers speech that may lag
          p = ((await withTimeout(nvda.lastSpokenPhrase(), 4000, "button")) || "").trim();
          if (!p) { await sleep(600); p = ((await withTimeout(nvda.lastSpokenPhrase(), 4000, "button")) || "").trim(); }
        } catch (e) { sweepLog.push(`${label}: ERROR ${errMsg(e)}`); break; }
        sweepLog.push(`${label}[${i}]: ${JSON.stringify(p)}`);
        if (!p || /\bno (next|previous|more)\b/i.test(p)) break;
        const key = p.slice(0, 80);
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        controls.push(p);
        if (/\bcollapsed\b/i.test(p) && !activated.has(key)) {
          activated.add(key);
          try {
            await withTimeout(nvda.act(), 5000, "activate");
            const after = ((await withTimeout(nvda.lastSpokenPhrase(), 4000, "activate")) || "").trim();
            if (after) stateChanges.push({ control: p, after });
          } catch (e) { sweepLog.push(`activate: ERROR ${errMsg(e)}`); }
        }
      }
    }
    await sweepButtons(K.moveToPreviousButton, "prev");
    await sweepButtons(K.moveToNextButton, "next");
    interaction = { controls, stateChanges };
    mark("interaction", { controls: controls.length, stateChanges: stateChanges.length, sweepLog });
  } catch (e) { mark("interaction", { error: errMsg(e), sweepLog }); }

  try { await nvda.stop(); } catch (e) { mark("nvdaStop", { error: errMsg(e) }); }
  // Quit the browser cleanly so the next capture starts fresh (taskkill fallback).
  try { await windowsQuit("msedge.exe"); }
  catch { spawn("cmd", ["/c", "taskkill", "/im", "msedge.exe", "/f"], { stdio: "ignore" }); }

  mark("done", { transcript: transcript.length });
  return { url, screenReader: "NVDA", capturedAt: new Date().toISOString(), transcript, structure, interaction, diagnostics: diag };
}
