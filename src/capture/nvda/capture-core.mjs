// capture-core.mjs — drive NVDA through a page and return what it announced.
// Shared by the standalone CLI (capture.mjs) and the HTTP worker (server.mjs).
// MUST run in an interactive desktop session.
//
// Every phase records a structured diagnostic (returned as `diagnostics`)
// instead of swallowing errors. The most important one is `afterStart.lastSpoken`:
// if NVDA announces nothing right after starting, it is not reading the page
// (focus / session / speech-pipe problem) and the whole capture will be empty —
// that single field explains an otherwise-mysterious empty result.
//
// captureWithNvda reads as a top-down narrative; each phase below it is one
// level of abstraction down (the "stepdown rule").
import { nvda, windowsActivate, windowsQuit } from "@guidepup/guidepup";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

// --- Tunables. Named so the timing/limits can be reasoned about and adjusted
// in one place rather than hunting for bare numbers in the control flow. ---
const DEFAULT_STEPS = 150; // read-through line count cap
const DEFAULT_BROWSER_WAIT_MS = 12_000; // Edge cold start + page load
const DEFAULT_BUDGET_MS = 120_000; // overall wall-clock budget for one capture
const WINDOW_SETTLE_MS = 800; // after focusing the Edge window
const NVDA_SETTLE_MS = 3_000; // after nvda.start() before reading
const STATE_SETTLE_MS = 1_200; // after activating a control, for a live region to announce

const ADVANCE_TIMEOUT_MS = 8_000; // moving to the next line/object
const READ_TIMEOUT_MS = 5_000; // reading the phrase after advancing
const NAV_TIMEOUT_MS = 6_000; // a quick-nav jump (next heading/landmark/field)
const QUERY_TIMEOUT_MS = 4_000; // reading lastSpokenPhrase / spokenPhraseLog
const ACT_TIMEOUT_MS = 5_000; // activating a control (Enter)

const MAX_SWEEP_STEPS = 40; // per-direction cap on a quick-nav sweep
const MAX_REPEATED_PHRASES = 3; // identical lines in a row => bottom of page
const MAX_WRAP_REPEATS = 4; // already-seen substantial lines in a row => wrapped around
const SUBSTANTIAL_PHRASE_LEN = 20; // a phrase longer than this is worth deduping on
const MIN_CONTROL_NAME_LEN = 3; // shorter is a stray key echo ("f"), not a control name
const DEDUPE_KEY_LEN = 80; // prefix length used to dedupe announcements

// Submit-like button names. Used only when probing forms, because activating a
// submit button has side effects and must be opt-in.
const SUBMIT_RE = /\b(submit|sign ?up|sign ?in|log ?in|send|search|continue|save|register|join|subscribe)\b/i;

const errMsg = (e) => (e && e.message) || String(e);

// Reject if `promise` has not settled within `ms`, naming the step so a timeout
// is self-describing in the diagnostics.
const withTimeout = (promise, ms, label) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);

// A diagnostics recorder: every phase appends a timestamped entry rather than
// swallowing errors, so an empty capture can be explained after the fact.
function createDiagnostics() {
  const entries = [];
  const startedAt = Date.now();
  const mark = (event, info = {}) => entries.push({ event, atMs: Date.now() - startedAt, ...info });
  return { entries, mark };
}

/**
 * @returns {Promise<{url:string,screenReader:string,capturedAt:string,
 *   transcript:string[], structure:{headings:string[],landmarks:string[],formFields:string[]},
 *   interaction:{controls:string[],stateChanges:{control:string,after:string}[],
 *     formChanges:{control:string,after:string}[]},
 *   diagnostics:object[]}>}
 */
export async function captureWithNvda(url, opts = {}) {
  const steps = Number(opts.steps || DEFAULT_STEPS);
  const browserWaitMs = Number(opts.browserWaitMs || DEFAULT_BROWSER_WAIT_MS);
  const navStrategy = opts.nav === "object" ? "object" : "line";
  const maxMs = Number(opts.maxMs || DEFAULT_BUDGET_MS);
  const diag = createDiagnostics();

  launchBrowser(url);
  diag.mark("browserLaunched", { url });
  await sleep(browserWaitMs);

  await focusBrowserWindow(diag);
  await startScreenReader(diag); // throws if NVDA cannot start
  await sleep(NVDA_SETTLE_MS);

  const deadline = Date.now() + maxMs;
  await recordStartupHealth(diag);

  const transcript = await readPageInOrder({ steps, navStrategy, deadline, diag });
  const { structure, interaction } = await navigateByStructure({ deadline, diag, probeForms: !!opts.probeForms });

  await stopAndCleanup(diag);
  diag.mark("done", { transcript: transcript.length });
  return {
    url,
    screenReader: "NVDA",
    capturedAt: new Date().toISOString(),
    transcript,
    structure,
    interaction,
    diagnostics: diag.entries,
  };
}

// --- Setup phases ---------------------------------------------------------

// Open the page in a fresh, maximized Edge window (own profile, no first-run UI).
function launchBrowser(url) {
  spawn(
    "cmd",
    ["/c", "start", "", "msedge",
      "--no-first-run", "--no-default-browser-check", "--start-maximized",
      `--user-data-dir=${process.env.TEMP}\\edge-a11y`, "--new-window", url],
    { detached: true, stdio: "ignore" }
  );
}

// Bring Edge to the foreground. Relying on the launch to take focus was a source
// of flaky, empty captures, so we focus it explicitly.
async function focusBrowserWindow(diag) {
  try {
    await windowsActivate("msedge.exe", "Edge");
    await sleep(WINDOW_SETTLE_MS);
    diag.mark("windowsActivate", { ok: true });
  } catch (e) {
    diag.mark("windowsActivate", { ok: false, error: errMsg(e) });
  }
}

// Start NVDA. This is the one unrecoverable failure: with no screen reader there
// is nothing to capture, so propagate it instead of recording and continuing.
async function startScreenReader(diag) {
  try {
    await nvda.start();
    diag.mark("nvdaStart", { ok: true });
  } catch (e) {
    diag.mark("nvdaStart", { ok: false, error: errMsg(e) });
    throw new Error("nvda.start failed: " + errMsg(e), { cause: e });
  }
}

// What does NVDA announce right after starting? Empty here means it is not
// reading the page, and the whole capture will be empty — this field is the
// first thing to check when a result comes back blank.
async function recordStartupHealth(diag) {
  try {
    const spoken = await withTimeout(nvda.lastSpokenPhrase(), QUERY_TIMEOUT_MS, "afterStart");
    diag.mark("afterStart", { lastSpoken: spoken || "" });
  } catch (e) {
    diag.mark("afterStart", { error: errMsg(e) });
  }
}

// --- Read-through phase ---------------------------------------------------

// Read the page line by line in document order (browse mode), returning the
// ordered transcript. Stops at the page bottom (repeated lines), on a wrap-around
// (a run of already-seen lines), at the step cap, or at the deadline.
async function readPageInOrder({ steps, navStrategy, deadline, diag }) {
  const transcript = [];
  const firstItem = await readFirstItem(diag);
  if (firstItem) transcript.push(firstItem);

  const seen = new Set();
  let previous = null, repeated = 0, wrapRun = 0, stopReason = "maxSteps", firstStepError = null;
  for (let i = 0; i < steps; i++) {
    if (Date.now() > deadline) { stopReason = "deadline"; break; }
    let phrase;
    try {
      phrase = await advanceAndRead(navStrategy);
    } catch (e) {
      if (i === 0) firstStepError = errMsg(e);
      stopReason = "stepError";
      break;
    }
    if (!phrase) continue;
    if (phrase === previous) { if (++repeated >= MAX_REPEATED_PHRASES) { stopReason = "repeatBottom"; break; } continue; }
    repeated = 0; previous = phrase;
    const substantial = phrase.length > SUBSTANTIAL_PHRASE_LEN;
    if (substantial && seen.has(phrase)) { if (++wrapRun >= MAX_WRAP_REPEATS) { stopReason = "wrap"; break; } continue; }
    wrapRun = 0;
    if (substantial) seen.add(phrase);
    transcript.push(phrase);
  }
  diag.mark("readThrough", { count: transcript.length, stopReason, firstStepError });
  return transcript;
}

// `nvda.next()` moves then reads, so the very first item must be read in place
// or the top line (often the first heading) is skipped.
async function readFirstItem(diag) {
  try {
    return ((await nvda.itemText()) || "").trim();
  } catch (e) {
    diag.mark("itemText", { error: errMsg(e) });
    return "";
  }
}

// Advance one step (line or object) and return what was announced.
async function advanceAndRead(navStrategy) {
  if (navStrategy === "object") await withTimeout(nvda.perform(nvda.keyboardCommands.moveToNextObject), ADVANCE_TIMEOUT_MS, "advance");
  else await withTimeout(nvda.next(), ADVANCE_TIMEOUT_MS, "advance");
  return ((await withTimeout(nvda.lastSpokenPhrase(), READ_TIMEOUT_MS, "read")) || "").trim();
}

// --- Structural navigation + interaction phase ----------------------------

// Skim the page by element type (headings, landmarks, form fields) via NVDA
// quick-nav, and — while a control is under the cursor — operate it to capture
// the announcements only interaction reveals. Returns the structure model and
// the interaction model.
async function navigateByStructure({ deadline, diag, probeForms }) {
  const K = nvda.keyboardCommands;
  const interaction = { stateChanges: [], formChanges: [], sweepLog: [] };
  const onFormField = (phrase) => operateControl(phrase, { probeForms, deadline, interaction });

  const structure = { headings: [], landmarks: [], formFields: [] };
  try {
    structure.headings = await collectByType(
      { prev: K.moveToPreviousHeading, next: K.moveToNextHeading }, { label: "heading", onItem: null, deadline });
    structure.landmarks = await collectByType(
      { prev: K.moveToPreviousLandmark, next: K.moveToNextLandmark }, { label: "landmark", onItem: null, deadline });
    // Form fields (which NVDA's "F" nav reaches, incl. buttons that "B" misses)
    // also drive the disclosure and (opt-in) form-submit probes in place.
    structure.formFields = await collectByType(
      { prev: K.moveToPreviousFormField, next: K.moveToNextFormField }, { label: "formField", onItem: onFormField, deadline });
    diag.mark("structural", { headings: structure.headings.length, landmarks: structure.landmarks.length, formFields: structure.formFields.length });
  } catch (e) {
    diag.mark("structural", { error: errMsg(e) });
  }
  if (probeForms) diag.mark("formProbe", { activated: interaction.formChanges.length });

  // Interactive controls = the form-field controls found above; the state and
  // form changes were captured inline during that sweep.
  const result = { controls: structure.formFields, stateChanges: interaction.stateChanges, formChanges: interaction.formChanges };
  diag.mark("interaction", {
    controls: result.controls.length,
    stateChanges: result.stateChanges.length,
    formChanges: result.formChanges.length,
    sweepLog: interaction.sweepLog,
  });
  return { structure, interaction: result };
}

// Collect every element of one type, sweeping both directions (Guidepup has no
// "move to top") so every element is reached regardless of cursor position. An
// empty list means the page exposes none of that type, even if it looks like it
// does. `onItem` fires when the cursor lands on a new element.
async function collectByType(commands, ctx) {
  const out = [], seenKeys = new Set();
  const sweepCtx = { ...ctx, out, seenKeys };
  await sweepInDirection(commands.prev, sweepCtx);
  await sweepInDirection(commands.next, sweepCtx);
  return out;
}

// Walk one direction with a single quick-nav command until it runs out, the cap
// is hit, or the deadline passes, appending each new element to `out`.
async function sweepInDirection(cmd, { label, out, seenKeys, onItem, deadline }) {
  // Seed with what is currently spoken. If a quick-nav jump leaves the spoken
  // phrase UNCHANGED, NVDA did not move (no element of this type in that
  // direction) and lastSpokenPhrase is just echoing a stale phrase — stop
  // rather than record it as a phantom element. More robust than matching
  // NVDA's "no next/previous heading" wording, which varies by version.
  let prev = (await withTimeout(nvda.lastSpokenPhrase(), QUERY_TIMEOUT_MS, label).catch(() => "") || "").trim();
  for (let i = 0; i < MAX_SWEEP_STEPS; i++) {
    if (Date.now() > deadline) break;
    let phrase;
    try {
      await withTimeout(nvda.perform(cmd), NAV_TIMEOUT_MS, label);
      phrase = ((await withTimeout(nvda.lastSpokenPhrase(), QUERY_TIMEOUT_MS, label)) || "").trim();
    } catch { break; }
    if (!phrase || /\bno (next|previous|more)\b/i.test(phrase) || phrase === prev) break;
    prev = phrase;
    if (phrase.length < MIN_CONTROL_NAME_LEN) continue; // stray key echo, not a control
    const key = phrase.slice(0, DEDUPE_KEY_LEN);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    out.push(phrase);
    if (onItem) await onItem(phrase);
  }
}

// Operate the control under the cursor and record what the screen reader says —
// the lived-experience signal a static read cannot see. Activating in place is
// required: a separate next/previous sweep finds nothing, because after the
// structural sweep the cursor sits at the end and the only control is the
// current position, not a next one.
async function operateControl(phrase, ctx) {
  if (/\bcollapsed\b/i.test(phrase)) return probeDisclosure(phrase, ctx);
  if (ctx.probeForms && /\bbutton\b/i.test(phrase) && SUBMIT_RE.test(phrase)) return probeFormSubmit(phrase, ctx);
}

// Activate a disclosure (safe — it just toggles visibility) and record the
// announced state, even when empty: a disclosure that says nothing after
// activation does not convey its state and fails 4.1.2 Name, Role, Value.
async function probeDisclosure(phrase, { interaction }) {
  try {
    await withTimeout(nvda.act(), ACT_TIMEOUT_MS, "activate"); // Enter on the control under the cursor
    const after = ((await withTimeout(nvda.lastSpokenPhrase(), QUERY_TIMEOUT_MS, "activate")) || "").trim();
    interaction.sweepLog.push(`disclosure ${JSON.stringify(phrase.slice(0, 40))} -> ${JSON.stringify(after)}`);
    interaction.stateChanges.push({ control: phrase, after });
  } catch (e) {
    interaction.sweepLog.push(`disclosure ERROR ${errMsg(e)}`);
  }
}

// Submit the form with no valid input to test error handling. An accessible form
// announces the error (3.3.1) via a status message (4.1.3); an inaccessible one
// shows it visually and the screen reader hears nothing. Capture EVERY phrase
// announced after the submit, not just the last one: a live-region alert can be
// followed by a focus move or document re-announce that overwrites
// lastSpokenPhrase, so the spokenPhraseLog delta keeps the alert text.
async function probeFormSubmit(phrase, { interaction }) {
  try {
    const before = ((await withTimeout(nvda.spokenPhraseLog(), QUERY_TIMEOUT_MS, "submit")) || []).length;
    await withTimeout(nvda.act(), ACT_TIMEOUT_MS, "submit"); // Enter on the submit button
    await sleep(STATE_SETTLE_MS);
    const log = (await withTimeout(nvda.spokenPhraseLog(), QUERY_TIMEOUT_MS, "submit")) || [];
    const after = log.slice(before).map((s) => String(s).trim()).filter(Boolean).join(" | ");
    interaction.sweepLog.push(`submit ${JSON.stringify(phrase.slice(0, 40))} -> ${JSON.stringify(after)}`);
    interaction.formChanges.push({ control: phrase, after });
  } catch (e) {
    interaction.sweepLog.push(`submit ERROR ${errMsg(e)}`);
  }
}

// --- Teardown phase -------------------------------------------------------

// Stop NVDA and close the browser so the next capture starts fresh.
async function stopAndCleanup(diag) {
  try { await nvda.stop(); } catch (e) { diag.mark("nvdaStop", { error: errMsg(e) }); }
  try { await windowsQuit("msedge.exe"); }
  catch { spawn("cmd", ["/c", "taskkill", "/im", "msedge.exe", "/f"], { stdio: "ignore" }); }
}
