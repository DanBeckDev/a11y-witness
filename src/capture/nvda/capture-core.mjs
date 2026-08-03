// capture-core.mjs — drive NVDA through a page and return what it announced.
// Shared by the standalone CLI (capture.mjs) and the HTTP worker (server.mjs).
// MUST run in an interactive desktop session.
//
// Every phase records a structured diagnostic (returned as `diagnostics`)
// instead of swallowing errors. When a capture comes back empty, read them in this
// order: `documentReady` (did NVDA ever name the document? ok:false means it was
// reading a blank or not-yet-rendered window), then `windowsActivate` (did Edge reach
// the foreground, and how long did it take), then `afterStart.lastSpoken`.
//
// Do NOT treat an empty `afterStart.lastSpoken` as the smoking gun on its own. It used
// to be sampled before anchoring, when NVDA legitimately had not spoken yet: across 13
// healthy captures it was empty 13 times, so it diagnosed nothing. It is now sampled
// after the document is anchored and named, which makes it meaningful.
//
// captureWithNvda reads as a top-down narrative; each phase below it is one
// level of abstraction down (the "stepdown rule").
import { nvda, windowsActivate, windowsQuit } from "@guidepup/guidepup";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { captureFault, FAULT } from "./capture-faults.mjs";
import { installSpeechChannelShim } from "./speech-channel.mjs";
import { parkPointer } from "./pointer.mjs";
import { browserAlive, currentPageUrl, launchReusable, navigateExisting, reusableArgs,
  structuralCensus, truncatedAnnouncements } from "./browser-session.mjs";
import { connect } from "node:net";
import { existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

// --- Tunables. Named so the timing/limits can be reasoned about and adjusted
// in one place rather than hunting for bare numbers in the control flow. ---
// What the captured evidence MEANS. Bump this by hand when a change alters the shape or
// semantics of the output -- a new field that a signal reads, a probe that announces differently,
// a navigation change that reorders what is heard.
//
// Deliberately separate from the worker's code hash (`/health.code`), which changes on every edit
// including comments. The hash is right for "is this worker running my code"; it is wrong for the
// capture cache, where it would invalidate all 1,061 pairs because someone reworded a comment.
// This constant is what the cache keys on, so it must move only when the evidence really changes.
//
// Bumping it forces a full recapture. That is the point.
export const CAPTURE_PROTOCOL_VERSION = 2;

export { edgeArgs as edgeArgsForTest };

/**
 * Installed at module load, before anything calls `nvda.start()`, so the very first connection to NVDA
 * Remote is tracked. Idempotent, so importing this module twice is harmless.
 */
const speechChannel = installSpeechChannelShim();

const DEFAULT_STEPS = 150; // read-through line count cap
const DEFAULT_BROWSER_WAIT_MS = 12_000; // UPPER BOUND on waiting for Edge, not a fixed sleep
const DEFAULT_BUDGET_MS = 120_000; // overall wall-clock budget for one capture
// Deadlines for POLLS, not durations to sleep. Named as budgets so the distinction survives: every
// remaining wait in this file either checks a condition or is the interval between two such checks.
const NVDA_READY_BUDGET_MS = 3_000;   // how long a cold NVDA gets to answer at all
const NVDA_SPEECH_BUDGET_MS = 10_000; // how long a fresh NVDA gets to SPEAK before silence is a fault
// After destroying the speech socket, how long guidepup needs to reconnect and re-join the channel.
// Its handler runs synchronously on the socket 'error' event and the connection is to localhost, so
// this is a settle rather than a wait -- against ~23s for the NVDA restart it replaces.
// How long to keep asking whether the rebuilt channel speaks before giving up and restarting NVDA.
// Generous on purpose: restarting NVDA is the harmful remedy, so the bar for reaching it must be high.
const SPEECH_RECONNECT_BUDGET_MS = 6_000;
const WINDOW_POLL_MS = 400; // between attempts to activate the Edge window
const READY_ATTEMPTS = 3; // re-activate + re-anchor tries before reading anyway
const EDGE_EXIT_TIMEOUT_MS = 8_000; // wait for Edge to actually exit during cleanup
// Recycle NVDA after this many captures even when reuse is on. Reuse saves ~10s per
// capture, but a screen reader held open indefinitely is exactly the long-running-state
// risk the correctness audit warns about, so bound it rather than trusting it forever.
const MAX_CAPTURES_PER_NVDA = 25;
// NVDA's Remote Access channel, which is how guidepup talks to it. Hardcoded in guidepup too
// (lib/windows/NVDA/constants.js), so there is nothing to configure on either side.
const NVDA_REMOTE_PORT = 6837;
const REUSE_PROBE_MS = 2_000;
const NVDA_EXIT_TIMEOUT_MS = 15_000; // for an old NVDA to release port 6837

// After activating a control, how long to KEEP WAITING for an announcement that has not arrived yet.
//
// This was a flat `sleep(1200)` and it silently dropped evidence. Measured on
// disclosure-state-silent/good over 20 captures: 19 recorded the state change, 1 recorded nothing --
// so 1 in 20 captures of a CORRECTLY implemented disclosure looked exactly like the broken variant.
// That is worse than noise; it deletes the finding, and it would teach a judge that a good page is bad.
//
// Generous on purpose. An empty delta is a legitimate result -- it is precisely what the bad variant
// must produce -- so this deadline has to exceed the slowest honest announcement, or "silent" and
// "we stopped listening" become the same observation.
const STATE_WAIT_MS = 5_000;
// Once something HAS been announced, how long to wait for the rest of it. Announcements arrive in
// parts, and cutting after the first would truncate multi-phrase live regions.
const STATE_QUIET_MS = 600;
const STATE_POLL_MS = 100;

const ADVANCE_TIMEOUT_MS = 8_000; // moving to the next line/object
const READ_TIMEOUT_MS = 5_000; // reading the phrase after advancing
const NAV_TIMEOUT_MS = 6_000; // a quick-nav jump (next heading/landmark/field)
const QUERY_TIMEOUT_MS = 4_000; // reading lastSpokenPhrase / spokenPhraseLog
const ACT_TIMEOUT_MS = 5_000; // activating a control (Enter)

const MAX_SWEEP_STEPS = 40; // per-direction cap on a quick-nav sweep
const MAX_REPEATED_PHRASES = 3; // identical lines in a row => bottom of page
const MAX_WRAP_REPEATS = 4; // already-seen substantial lines in a row => wrapped around
const SUBSTANTIAL_PHRASE_LEN = 20; // a phrase longer than this is worth deduping on
// Consecutive silent advances that end a read-through NVDA was never going to speak into.
// Only ever consulted when NVDA was ALSO silent at startup -- see readPageInOrder.
const MAX_SILENT_STEPS = 8;
const MIN_CONTROL_NAME_LEN = 3; // shorter is a stray key echo ("f"), not a control name
const DEDUPE_KEY_LEN = 80; // prefix length used to dedupe announcements

// Edge's capture profile must NOT live under %TEMP%. Windows temp cleanup deletes
// it (it silently wiped the NVDA install the same way), and a purged profile
// reverts Edge to its first-run state, whose welcome/sign-in surface NVDA records
// as phantom elements on pages with no headings — the first-run gotcha in the
// README. LOCALAPPDATA survives cleanup.
export const EDGE_PROFILE_DIR =
  process.env.A11Y_EDGE_PROFILE ||
  `${process.env.LOCALAPPDATA || process.env.TEMP}\\a11y-witness\\edge-profile`;

// Submit-like button names. Used only when probing forms, because activating a
// submit button has side effects and must be opt-in.
const SUBMIT_RE = /\b(submit|sign ?up|sign ?in|log ?in|send|search|continue|save|register|join|subscribe|book|reserve|request|hire)\b/i;

// Role/state words to ignore when matching a control's NAME against the task, so
// a button is only activated when its actual label appears in the user's task.
const CONTROL_WORDS = new Set([
  "button", "link", "graphic", "image", "edit", "text", "checkbox", "radio", "combo",
  "box", "list", "clickable", "menu", "item", "heading", "level", "not", "checked",
  "pressed", "collapsed", "expanded", "selected", "of", "out",
]);


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
 *   transcript:string[], structure:{headings:string[],landmarks:string[],formFields:string[],
 *     graphics:string[],links:string[],lists:string[],tableCells:string[]},
 *   interaction:{controls:string[],stateChanges:{control:string,after:string}[],
 *     formChanges:{control:string,after:string}[], postSubmitFields:string[],focusOrder:string[]},
 *   diagnostics:object[]}>}
 */
export async function captureWithNvda(url, opts = {}) {
  const diag = createDiagnostics();
  const browser = await openPage(url, diag);
  let succeeded = false;
  try {
    const result = await runCapturePhases(url, opts, diag);
    // A request can complete without throwing while NVDA is silent or still attached to a
    // blank document. Never preserve that state for the next capture: reusing it turns one
    // transient readiness failure into a whole run of confident empty captures. The host-side
    // title verifier will reject the result, but cleanup must make the worker recoverable
    // before that verifier gets a chance to retry.
    const documentReady = (result.diagnostics || []).some(
      (event) => event.event === "documentReady" && event.ok === true,
    );
    succeeded = documentReady && Array.isArray(result.transcript) && result.transcript.length > 0;
    return result;
  } finally {
    // Cleanup MUST be unconditional, and it was not.
    //
    // Edge is launched before NVDA is started, and every phase in between can throw. When
    // `nvda.start` timed out, the throw skipped the cleanup call entirely and left the browser
    // running -- so each failed capture leaked one Edge. Measured on a stuck worker: EIGHT
    // orphaned msedge processes in the logged-on session, on a 4 GB guest, which is exactly
    // the load that makes the NEXT nvda.start time out. Failures compounded until the worker
    // could not capture at all, and all three workers reached that state.
    //
    // On failure the screen reader is NOT kept, whatever the reuse setting says: a capture that
    // died mid-flight can leave NVDA running but unresponsive, and reusing that is how one bad
    // capture poisons every capture after it.
    await stopAndCleanup(diag, browser, { keepScreenReader: !!opts.reuseScreenReader && succeeded })
      .catch((e) => diag.mark("cleanupFailed", { error: errMsg(e) }));
  }
}

// The capture proper. Split out so captureWithNvda is nothing but "launch, run, always clean
// up" -- the guarantee is the point, and it should be readable at a glance.
async function runCapturePhases(url, opts, diag) {
  const steps = Number(opts.steps || DEFAULT_STEPS);
  const browserWaitMs = Number(opts.browserWaitMs || DEFAULT_BROWSER_WAIT_MS);
  const navStrategy = opts.nav === "object" ? "object" : "line";
  const maxMs = Number(opts.maxMs || DEFAULT_BUDGET_MS);

  await focusBrowserWindow(browserWaitMs, diag);
  // Own the pointer before anything sends a keystroke. It is a capture INPUT, not a bystander: it holds
  // hover state over whatever it rests on, and guidepup prefixes every captured action with Ctrl, which
  // Edge turns into a magnifier overlay when an image is underneath. See pointer.mjs.
  await parkPointer(diag);
  const coldStart = await startScreenReader(diag, { reuse: !!opts.reuseScreenReader });
  // Wait for NVDA to answer, rather than for a fixed three seconds.
  //
  // This was `sleep(NVDA_SETTLE_MS)` and its own comment conceded the point: "dead time when NVDA was
  // already running... waitForDocument below is what actually establishes readiness either way." A
  // fixed sleep is the wrong shape in both directions -- it burns the full 3s when NVDA answers in 200ms,
  // and it still expires too early when NVDA is genuinely slow.
  //
  // It cannot simply be deleted, which is the trap: `ensureSpeechChannel` runs next and treats an
  // unresponsive NVDA as a dead channel, so removing the wait would turn a slow start into a spurious
  // ~23s screen-reader restart. Polling keeps the protection and stops paying for it when it is not
  // needed. The constant is the deadline, which is why it is named as a budget.
  if (coldStart) await waitForScreenReader(NVDA_READY_BUDGET_MS, diag);
  // Before anything expensive: prove speech actually comes back. A dead channel discovered here costs one
  // round trip; discovered after the read-through it costs the whole capture and a retry.
  await ensureSpeechChannel(diag);
  await resetSpeechLogs(diag);

  const deadline = Date.now() + maxMs;

  // Start from a known state (browse mode + document top). Safe now that --app
  // gives a chromeless single-page window — earlier this surfaced the browser
  // start page because the window was not controlled. Also cancels NVDA's
  // auto-say-all so it can't race the read.
  // Anchor ONCE, after the gate rather than either side of it.
  //
  // There used to be an anchor here too, from when the read-through followed immediately.
  // The gate does not care where the cursor is -- reporting the document title is
  // position-independent -- and the anchor below re-establishes browse mode and the top
  // regardless, so the earlier one was pure cost: measured at ~3s of a 15.8s capture, since
  // each anchorToTop is two keystroke round trips plus a settle.
  const documentTitle = await waitForDocument(diag);
  // Anchor AFTER the gate. waitForDocument asks NVDA to report the document title, which
  // leaves that title as `lastSpokenPhrase` -- and the read-through deliberately reads the
  // current line in place before its first move, so it captured the TITLE instead of the
  // page's first line. Measured: the h1's "heading, level 1, ..." announcement disappeared
  // from every page ("heading, level N" phrases fell from 105 to 15 across 90 captures) and
  // was replaced by the <title>. Ctrl+Home moves the caret back to the top, which makes the
  // first line the last thing spoken again.
  //
  // I first blamed this on reusing NVDA between captures. It was not: the same loss happens
  // with reuse off. Both changes landed in one run, and the phrase COUNT was unchanged, so
  // neither the benchmark nor capture-check saw it.
  await anchorToTop();
  await recordStartupHealth(diag);
  const transcript = await readWithRetry({
    steps, navStrategy, deadline, diag,
    title: documentTitle,
    silentAtStart: screenReaderWasSilentAtStart(diag),
  });
  failIfScreenReaderIsMute(transcript, diag);
  const { structure, interaction } = await navigateByStructureThenAudit({
    deadline, diag,
    probeForms: !!opts.probeForms, probeFocus: !!opts.probeFocus, probeTables: !!opts.probeTables,
    probeElementsList: !!opts.probeElementsList,
    task: opts.task,
  });

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

// Where Edge lives. Resolved so we can spawn it directly and OWN the process: launching
// via `cmd /c start` returns no handle, which means teardown can only be guessed at. See
// closeBrowser.
const EDGE_EXES = [
  `${process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)"}\\Microsoft\\Edge\\Application\\msedge.exe`,
  `${process.env.ProgramFiles || "C:\\Program Files"}\\Microsoft\\Edge\\Application\\msedge.exe`,
];

// --app opens a single chromeless window (no tab strip, address bar, toolbar or banners)
// showing ONLY this URL, so NVDA's browse-mode quick-nav cannot wander out of our document
// into browser UI (the Root-1 cause: captures that read Edge's image-viewer/"Close banner"
// chrome or the MSN start page).
/**
 * Chromium features that must be off for a capture to describe the PAGE rather than the profile.
 *
 * Autofill is the one that cost real evidence. `probeForms` submits forms, Edge offers to remember
 * what was typed, and the durable profile accumulates it -- so later pages get a suggestion icon
 * drawn inside recognised inputs, which NVDA announces as an embedded object appended to the field:
 *
 *     "Recipient name, edit, \ufffc"
 *
 * The rate therefore RISES through a run as the profile learns. Measured across the corpus at 3%, then
 * 8%, then 31% of affected captures, with 26 good/bad pairs disagreeing about it -- the same page
 * announcing differently depending on what Edge had memorised from earlier pages.
 *
 * These are command-line flags rather than Edge policies ON PURPOSE. The equivalent registry policies
 * were set by provisioning and had already drifted: StartupBoostEnabled read 1 on two guests and 0 on a
 * third, and nothing noticed for weeks. A flag lives in git, is applied at every launch, and cannot
 * differ between guests.
 */
/**
 * Edge's "Magnify image" opens a full-window overlay on **Ctrl pressed twice while the pointer is over
 * an image** — and guidepup sends Ctrl before EVERY captured action. On gov.uk the overlay took the
 * foreground and the capture read `"Image Magnify, document"` rather than the page, so the run refused to
 * report at all.
 *
 * **`pointer.mjs` is the fix. This flag is an UNVERIFIED belt beside that brace.** With the pointer parked
 * at (0,0) no image is ever under it, so the shortcut cannot fire at all — measured: gov.uk went from
 * three failed attempts and a refusal to a clean 108-announcement capture on the first try. The flag only
 * matters if the park itself fails, which the capture records as `pointerParkFailed`.
 *
 * The name is a GUESS, from Microsoft's documented *enable* flag `--enable-features=msEdgeImageMagnifyUI`;
 * there is no policy for this feature, only a per-profile settings toggle. An unrecognised
 * `--disable-features` name is ignored in complete silence, so it is kept for its non-zero chance of
 * being right at zero runtime cost — not because it is known to work.
 *
 * **Do not try to verify it through CDP `SystemInfo.getFeatureState`.** That was built here and removed:
 * it answers `"Unknown feature"` for `msEdgeImageMagnifyUI`, for `msEdgeWelcomePage` AND for
 * `AutofillServerCommunication` — the last of which demonstrably works, since suppressing it took the
 * U+FFFC artefact from 3-31% of affected captures to 0 of 15. The method cannot see the features we set,
 * so it cannot distinguish "wrong name" from "not queryable", and a diagnostic reporting a working flag
 * as unknown is worse than none. The only real test is behavioural: park the pointer ON an image with
 * `A11Y_POINTER_AT` and see whether the overlay appears.
 */
const MAGNIFY_FEATURE = "msEdgeImageMagnifyUI";


const SUPPRESSED_FEATURES = [
  "msEdgeWelcomePage",
  "AutofillServerCommunication",       // no server-side suggestions
  "AutofillAddressProfileSavePrompt",  // never offer to remember a submitted form
  "AutofillEnableAccountWalletStorage",
  MAGNIFY_FEATURE,
];

function edgeArgs(url) {
  return [
    "--no-first-run", "--no-default-browser-check", "--start-maximized",
    "--disable-session-crashed-bubble",
    `--disable-features=${SUPPRESSED_FEATURES.join(",")}`,
    // Belt and braces alongside the feature flags: these are long-standing switches rather than
    // feature names, so they do not depend on a feature surviving a Chromium rename.
    "--disable-sync", "--disable-background-networking", "--disable-save-password-bubble",
    `--user-data-dir=${EDGE_PROFILE_DIR}`, `--app=${url}`,
  ];
}

/**
 * Keep Edge alive between captures and re-point it, rather than cold-starting Chromium every time.
 *
 * **On by default**, disable with `A11Y_REUSE_BROWSER=0`. It was gated behind an opt-in until
 * `evidence:check` had answered, and the answer came back better than expected.
 *
 * Throughput, three workers, same page, 7 interleaved rounds each:
 *
 *   cold start per capture   41.5 s median, 0.072 captures/s across the pool
 *   reused browser           11.6 s median, 0.259 captures/s   (windowsActivate 8.9 s -> 1.3 s)
 *
 * The pool went from scaling NEGATIVELY -- one worker beat three -- to scaling linearly, because the
 * shared resource being contended was the SSD and three guests cold-starting Chromium was what
 * saturated it.
 *
 * On evidence, the honest version: `evidence:check` reports CHANGED on a handful of form cases, and it
 * reports the SAME cases with reuse turned OFF. The difference is a pre-existing render race on
 * browser-drawn widgets (`<input type="date">` picker buttons announce as U+FFFC when NVDA reads the
 * field before Edge has painted them), present in 3-31% of affected captures across the corpus
 * depending on environment. Reuse did not introduce it; measured 0 of 14 with reuse against 1 of 6
 * without, which is consistent with a warm renderer painting before the read rather than after it.
 * Small samples, so that is a direction rather than a proof -- watch it.
 */
const REUSE_BROWSER = process.env.A11Y_REUSE_BROWSER !== "0";

/**
 * Recycle the reused browser this often.
 *
 * Reuse trades a cold start for accumulated state, and accumulated state is an evidence risk, not just
 * a memory one. Across 1,061 different pages one Edge builds up cookies, history and — the one that
 * would actually corrupt a capture — **autofill**: a form page read after two hundred other form pages
 * can be offered suggestions the first one never saw, and NVDA announces those. That is cross-page
 * contamination, it only appears deep into a run, and it looks like a real difference between cases.
 *
 * The same reasoning and the same number as MAX_CAPTURES_PER_NVDA. Bounded reuse keeps nearly all of
 * the saving — one cold start per 25 captures instead of per capture — while capping how far state can
 * drift from a fresh profile.
 */
const MAX_CAPTURES_PER_BROWSER = 25;

/** The live reusable browser, if we started one. Null when reuse is off or it has gone. */
let reusableBrowser = null;
let browserCaptures = 0;

/**
 * Get a window showing `url`, by the cheapest route available.
 *
 * Three cases, in cost order: navigate a browser that is already up (~0 s), start a reusable one
 * (a cold start, paid once per worker rather than once per capture), or the original one-shot launch.
 */
async function openPage(url, diag) {
  if (!REUSE_BROWSER) return launchBrowser(url, diag);
  if (reusableBrowser && browserCaptures >= MAX_CAPTURES_PER_BROWSER) {
    diag.mark("browserRecycle", { after: browserCaptures });
    await closeBrowser(diag, reusableBrowser);
    reusableBrowser = null;
    browserCaptures = 0;
  }
  if (reusableBrowser && await browserAlive()) {
    try {
      await navigateExisting(url);
      browserCaptures += 1;
      diag.mark("browserReused", { url, captures: browserCaptures });
      return reusableBrowser;
    } catch (error) {
      // A reusable browser that will not navigate is worse than none: fall back to a clean one-shot
      // rather than capturing whatever page happened to be showing. Reading the PREVIOUS page while
      // every check passes is the evidence-rot failure this project has already paid for once.
      diag.mark("browserReuseFailed", { error: errMsg(error) });
      await closeBrowser(diag, reusableBrowser);
      reusableBrowser = null;
    }
  }
  const exe = EDGE_EXES.find((p) => existsSync(p));
  if (!exe) return launchBrowser(url, diag);
  try {
    reusableBrowser = await launchReusable({
      exe, args: reusableArgs(url, edgeArgs(url)), onEvent: (e) => diag.mark(e.type, e),
    });
    browserCaptures = 1;
    return reusableBrowser;
  } catch (error) {
    diag.mark("browserReuseLaunchFailed", { error: errMsg(error) });
    return launchBrowser(url, diag);
  }
}

// Open the page in a fresh, maximized Edge window, returning the process when we own it.
//
// Owning it matters: with a dedicated --user-data-dir there is no existing instance to hand
// off to, so this process IS the browser and its "exit" is a real event we can await
// instead of polling the task list. That is what lets the next capture know the previous
// Edge has genuinely gone -- captures run back to back, and starting one while the last is
// still tearing down produced exactly the "blank, blank" transcripts we kept retrying past.
function launchBrowser(url, diag) {
  const exe = EDGE_EXES.find((p) => existsSync(p));
  if (!exe) {
    // Fall back to the old indirect launch rather than failing the capture: an unusual Edge
    // install should cost us the exit event, not the whole run.
    diag.mark("browserLaunched", { url, owned: false, reason: "msedge.exe not found in the standard locations" });
    spawn("cmd", ["/c", "start", "", "msedge", ...edgeArgs(url)], { detached: true, stdio: "ignore" });
    return null;
  }
  const child = spawn(exe, edgeArgs(url), { stdio: "ignore" });
  child.on("error", (e) => diag.mark("browserError", { error: errMsg(e) }));
  diag.mark("browserLaunched", { url, owned: true, pid: child.pid });
  return child;
}

// Bring Edge to the foreground. Relying on the launch to take focus was a source
// of flaky, empty captures, so we focus it explicitly.
//
// POLLS rather than sleeping a fixed 12s first. The old fixed wait was both too slow
// (Edge is usually up in well under a second, and 12s x 90 captures is 18 minutes of
// doing nothing) and too optimistic: under load Edge took longer than the guess, the
// window was activated before it existed, and the capture came back as two "blank"
// phrases with no error anywhere. Waiting for the condition is faster AND correct;
// browserWaitMs is now the upper bound rather than the wait itself.
async function focusBrowserWindow(maxWaitMs, diag) {
  const deadline = Date.now() + maxWaitMs;
  const startedAt = Date.now();
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      await windowsActivate("msedge.exe", "Edge");
      // Activating a window makes NVDA announce the new foreground, so "speech has gone quiet" IS the
      // condition that the transition finished -- and it is the screen reader's own view of it, which is
      // the only view that matters for a screen-reader capture. This was a fixed 800ms; the enclosing
      // loop was already converted to a condition and this sleep was left behind inside it.
      await waitForSpeechQuiet("windowSettle");
      diag.mark("windowsActivate", { ok: true, waitedMs: Date.now() - startedAt });
      return;
    } catch (e) {
      lastError = errMsg(e);
      await sleep(WINDOW_POLL_MS);
    }
  }
  diag.mark("windowsActivate", { ok: false, error: lastError, waitedMs: Date.now() - startedAt });
}

// Ask NVDA what document it is in, and re-focus until it names one.
//
// This is the gate that makes a capture self-verifying. `windowsActivate` succeeding only
// means an Edge process owns a window; it does not mean the page is rendered, and reading
// too early yields "blank" lines that look exactly like a page with no content. Rather
// than lengthen a guess, ask the screen reader what it can actually see.
//
// Deliberately does NOT throw when the title never arrives: not every page has a title,
// and the caller (and the dataset capture step) verify content independently. Recording
// documentReady:false makes the cause visible instead of leaving a mystery blank capture.
async function waitForDocument(diag) {
  for (let attempt = 1; attempt <= READY_ATTEMPTS; attempt++) {
    const title = await reportedTitle(diag);
    if (title && title.toLowerCase() !== "blank") {
      diag.mark("documentReady", { ok: true, title, attempt });
      return title;
    }
    diag.mark("documentReady", { ok: false, title, attempt });
    try {
      await windowsActivate("msedge.exe", "Edge");
    } catch (e) {
      diag.mark("reactivate", { ok: false, error: errMsg(e), attempt });
    }
    // Same condition as the other windowsActivate site: wait for NVDA to finish announcing the
    // foreground change rather than sleeping a guess before trying again.
    await waitForSpeechQuiet("reactivateSettle");
    await anchorToTop();
  }
}

// Polling here is not a shortcut, it is the only option: guidepup's NVDA client is purely
// request/response (start, next, act, lastSpokenPhrase, spokenPhraseLog -- no emitter, no
// async iterator), so there is no "NVDA is ready" event to await. Asking costs one round
// trip and normally answers on the first attempt.
async function reportedTitle(diag) {
  try {
    await withTimeout(nvda.perform(nvda.keyboardCommands.reportTitle), NAV_TIMEOUT_MS, "reportTitle");
    await waitForSpeechQuiet("anchorSettle");
    return ((await withTimeout(nvda.lastSpokenPhrase(), QUERY_TIMEOUT_MS, "reportTitle")) || "").trim();
  } catch (e) {
    diag.mark("reportTitle", { error: errMsg(e) });
    return "";
  }
}

// Is NVDA already running from a previous capture, and how many has it served? Only
// meaningful when the caller asks to reuse it (the HTTP worker does; the one-shot CLI does
// not). Module-level because the screen reader is a single machine-wide resource -- there
// is exactly one of it, so exactly one place tracks it.
let screenReader = { running: false, captures: 0 };

// Start NVDA, or reuse the running instance. This is the one unrecoverable failure: with no
// screen reader there is nothing to capture, so propagate it instead of recording and
// continuing.
//
// Starting NVDA costs ~10s, and doing it per capture was 16 minutes of a 98-minute dataset
// run. Reuse skips it -- but recycles after MAX_CAPTURES_PER_NVDA so drift in a
// long-running screen reader cannot accumulate silently across a whole run.
// Returns true when NVDA was actually started, so the caller can skip the settle it only
// needs on a cold start.
// Is the NVDA we think we own actually there? `screenReader.running` is a belief, and
// anything else on the machine can invalidate it: NVDA is a single machine-wide resource, so
// another process running a capture (capture-check, a stray CLI run) stops the same NVDA this
// one is reusing. Trusting the flag cost a worker outage -- the reuse path connected to a
// dead NVDA and guidepup's socket error arrived asynchronously, outside any request handler.
//
// Probe the SOCKET, not the API. `lastSpokenPhrase()` reads guidepup's own local log of
// phrases it has already received, so it answers happily while NVDA is dead -- measured: after
// killing NVDA it still returned, the capture was reused, and the transcript came back empty.
// A liveness check that cannot detect death is worse than none, because it launders a broken
// state into a confident one.
//
// Connecting to NVDA's Remote Access port is the real question, and it is what guidepup's own
// isRunning() does (lib/windows/NVDA/isRunning.js). Done with node:net rather than importing
// that, since it is not part of the public surface.
function screenReaderResponds() {
  return new Promise((resolve) => {
    const socket = connect(NVDA_REMOTE_PORT, "127.0.0.1");
    const settle = (alive) => { socket.destroy(); resolve(alive); };
    socket.setTimeout(REUSE_PROBE_MS, () => settle(false));
    socket.on("connect", () => settle(true));
    socket.on("error", () => settle(false));
  });
}

/**
 * Poll until NVDA's Remote port answers, up to a deadline.
 *
 * Same probe `startScreenReader` uses to decide whether a reused NVDA is still alive, so this adds no
 * new failure mode -- it just stops guessing how long a cold start takes.
 */
async function waitForScreenReader(deadlineMs, diag) {
  const deadline = Date.now() + deadlineMs;
  const startedAt = Date.now();
  while (Date.now() < deadline) {
    if (await screenReaderResponds()) {
      diag.mark("nvdaReady", { waitedMs: Date.now() - startedAt });
      return true;
    }
    await sleep(STATE_POLL_MS);
  }
  // Not fatal: ensureSpeechChannel is the real gate and runs next. Recorded so a guest that is
  // consistently slow to start is visible rather than merely slow.
  diag.mark("nvdaReady", { waitedMs: Date.now() - startedAt, timedOut: true });
  return false;
}

async function startScreenReader(diag, { reuse }) {
  if (reuse && screenReader.running && screenReader.captures < MAX_CAPTURES_PER_NVDA) {
    if (await screenReaderResponds()) {
      screenReader.captures += 1;
      diag.mark("nvdaStart", { ok: true, reused: true, captures: screenReader.captures });
      return false;
    }
    // Something outside this process stopped it. Fall through to a cold start rather than
    // failing the capture.
    diag.mark("nvdaGone", { after: screenReader.captures });
    screenReader = { running: false, captures: 0 };
  }
  if (screenReader.running) {
    diag.mark("nvdaRecycle", { after: screenReader.captures });
    await stopScreenReader(diag);
  }
  try {
    await startFreshWithRetry(diag);
    screenReader = { running: true, captures: 1 };
    return true;
  } catch (e) {
    // **"Already running" is success, not failure.**
    //
    // guidepup 0.31 throws when `start()` is called on a live NVDA; 0.29 tolerated it silently. That
    // tolerance was hiding a real drift: this module's `screenReader` state can legitimately disagree
    // with reality -- the worker warms NVDA at boot, `screenReaderResponds()` can miss the Remote port
    // for an instant and conclude it died, and anything outside this process can start or stop it. On
    // 0.29 the redundant start was absorbed; on 0.31 it failed the capture outright.
    //
    // Adopting the running instance is the correct resolution because NVDA being up IS the desired end
    // state, and because `ensureSpeechChannel` runs immediately afterwards and is the real gate -- an
    // adopted-but-broken screen reader is caught there, one probe later.
    //
    // Matched on message text, reluctantly: guidepup attaches no code to this error, and there is no
    // public API to ask whether NVDA is running (its own isRunning() is not exported). If a future
    // release reworded it, the symptom is the pre-0.31 behaviour returning -- a failed capture rather
    // than silent bad evidence -- which is the safe direction for this to break in.
    if (/already running/i.test(errMsg(e))) {
      screenReader = { running: true, captures: 1 };
      diag.mark("nvdaStart", { ok: true, adopted: true, reason: "already running" });
      return false;
    }
    screenReader = { running: false, captures: 0 };
    diag.mark("nvdaStart", { ok: false, error: errMsg(e) });
    throw captureFault(FAULT.SCREEN_READER_START_FAILED, "nvda.start failed: " + errMsg(e), { cause: e });
  }
}

// The FIRST capture after a guest boots very often fails with "Timed out waiting for NVDA to be
// running", and every capture after it succeeds. This was the dominant failure mode on this pool
// and it kept being misread as a broken worker: whichever VM had been up longest worked, freshly
// booted ones did not, so the fault appeared to move between guests. Windows is still settling
// after auto-logon -- the same reason `utmctl exec` does nothing for the first minute or two.
//
// One capture that takes eight seconds longer beats a run that loses its first case per worker,
// so a failed start is retried once before it becomes an error.
const NVDA_START_ATTEMPTS = 2;
const NVDA_RETRY_DELAY_MS = 8_000;

async function startFreshWithRetry(diag) {
  let lastError;
  for (let attempt = 1; attempt <= NVDA_START_ATTEMPTS; attempt += 1) {
    try {
      await startFreshScreenReader(diag);
      return;
    } catch (e) {
      lastError = e;
      diag.mark("nvdaStartAttempt", { attempt, error: errMsg(e) });
      if (attempt < NVDA_START_ATTEMPTS) await sleep(NVDA_RETRY_DELAY_MS);
    }
  }
  throw lastError;
}

// Start NVDA, clearing a leftover instance out of the way if one is blocking us.
//
// "NVDA is already running" is a dead end otherwise: something outside this process left an
// NVDA behind — a crashed capture, a stray CLI run, a kill that did not fully take — and every
// subsequent capture fails with it while the worker keeps answering /health. Measured: the
// socket probe correctly spotted the dead screen reader, the cold start then refused, and the
// worker was stuck until a human intervened.
//
// This is still Guidepup owning the lifecycle (nvda.stop(), never taskkill), just recovering
// from a state it did not create.
// EXPERIMENT: does `{capture: true}` produce complete announcements?
// Deliberately the guidepup default, `"initial"`, after measuring the alternative.
//
// `{capture: true}` makes every keystroke wait guidepup's full 1s speech debounce, which guarantees a
// COMPLETE announcement -- with `"initial"` a log entry holds only the phrases that arrived before the
// first one resolved the promise, so a fragment can be recorded as the whole thing. That is the
// mechanism behind a button announced as `"o, button"` instead of `"Open account search, button"`,
// seen once in 48 captures.
//
// But it costs 3x: measured 19-20s per capture on `"initial"` against 58-60s on `true`, which is ~12
// hours for a corpus run instead of ~2. Preventing a 2% risk by tripling every capture is the wrong
// trade when the same defect can be DETECTED for nothing: Chromium's accessibility tree already gives
// the real accessible names on a socket this capture holds open, so `structureCrossCheck` flags a
// truncated announcement instead. Detect cheaply, do not prevent expensively.
const CAPTURE_OPTIONS = undefined;

async function startFreshScreenReader(diag) {
  try {
    await nvda.start(CAPTURE_OPTIONS);
    diag.mark("nvdaStart", { ok: true, reused: false });
    return;
  } catch (e) {
    if (!/already running/i.test(errMsg(e))) throw e;
    diag.mark("nvdaLeftover", { error: errMsg(e) });
  }
  await nvda.stop().catch((e) => diag.mark("nvdaStopLeftover", { error: errMsg(e) }));
  await waitForScreenReaderGone(diag);
  await nvda.start(CAPTURE_OPTIONS);
  diag.mark("nvdaStart", { ok: true, reused: false, afterClearingLeftover: true });
}

// Clear NVDA's speech logs so every capture starts from the same state, reused or not.
//
// Two things go wrong without this once NVDA persists across captures, and both look like
// flakiness rather than a bug:
//
//   1. `spokenPhraseLog` is cumulative. Over 90 captures it grows without bound, and every
//      probe that reads it marshals a bigger array across the wire until the 4s query
//      timeout starts firing late in a run.
//   2. `lastSpokenPhrase` still holds the PREVIOUS capture's final phrase. The read-through
//      seeds its no-movement guard from it, so a stale phrase can be mistaken for "the
//      cursor did not move" -- the same class of bug as the phantom elements the NVDA
//      correctness audit already fixed once.
//
// Run unconditionally, not only when reusing: a reused capture should begin in exactly the
// state a cold one does, or the dataset quietly depends on which it got.
/**
 * Is the SPEECH CHANNEL alive, as opposed to NVDA merely being alive?
 *
 * These are different questions and the difference is this pipeline's most expensive fault. Guidepup
 * reaches NVDA over a TLS socket to NVDA Remote on 127.0.0.1:6837, and speech is **pushed** back over
 * that socket. Keystrokes are writes; speech is a read. So when the socket goes half-open, every
 * `nvda.next()` still succeeds — the write is accepted — while nothing is ever spoken back. NVDA looks
 * perfectly healthy and says nothing.
 *
 * Guidepup cannot notice: it only reconnects on a socket `error` event, and a half-open TCP connection
 * raises none. There is no keepalive, no read timeout and no heartbeat in its client (checked in
 * 0.29.2), and no `reconnect()` on its public API — so the only way to rebuild the channel is to restart
 * NVDA entirely.
 *
 * Hence probing, cheaply, BEFORE committing a capture to it. One round trip against ~86 s for a capture
 * that was never going to produce evidence.
 */
async function screenReaderIsSpeaking(diag) {
  try {
    await withTimeout(nvda.clearSpokenPhraseLog(), QUERY_TIMEOUT_MS, "livenessClear");
    // Reading the current line is the cheapest command that MUST produce speech: no navigation, no
    // side effects on the page, and it works wherever the cursor happens to be.
    await withTimeout(nvda.perform(nvda.keyboardCommands.readLine), NAV_TIMEOUT_MS, "livenessRead");
    await waitForSpeechQuiet("anchorSettle");
    const heard = ((await withTimeout(nvda.lastSpokenPhrase(), QUERY_TIMEOUT_MS, "livenessHeard")) || "").trim();
    diag.mark("speechChannel", { alive: !!heard, heard: heard.slice(0, 60) });
    return !!heard;
  } catch (e) {
    // A throwing probe means the channel is not usable either, which is the same answer.
    diag.mark("speechChannel", { alive: false, error: errMsg(e) });
    return false;
  }
}

/**
 * Make sure we are about to capture through a channel that can actually carry speech.
 *
 * A restart here is bounded (one) and evidence-triggered, which is what separates it from the idle
 * warm-up loop that put modal dialogs on guest desktops: that one restarted NVDA on a timer with nothing
 * wrong. This restarts it only when the channel has been *measured* dead, during a capture, which
 * capture-core already treats as its own business.
 */
async function ensureSpeechChannel(diag) {
  if (await screenReaderIsSpeaking(diag)) return;

  // Cheapest remedy first: rebuild the SOCKET, not the screen reader.
  //
  // A dead channel is a dead TLS connection to NVDA Remote far more often than it is a dead NVDA --
  // NVDA's own log records nothing at all when this happens, 7 lines and zero errors, identical to a
  // healthy session. Restarting NVDA costs ~23 s and, done repeatedly, is itself what produces the
  // `nvdaHelperRemote (injection_terminate)` modal that wedges a guest. So the expensive remedy was
  // feeding the fault. See speech-channel.mjs for why guidepup cannot do this itself.
  if (speechChannel.reset("probe heard nothing before a capture")) {
    // POLL the condition; do not sleep a guess and probe once.
    //
    // The failure mode of guessing short here is not a slow capture, it is an unnecessary NVDA restart --
    // and repeated restarts are what produce the `nvdaHelperRemote (injection_terminate)` modal that
    // wedges a guest, i.e. the expensive remedy feeding the fault it treats. Guidepup's reconnect takes
    // as long as it takes; a fixed 750ms wait declared it failed whenever it took 751.
    const deadline = Date.now() + SPEECH_RECONNECT_BUDGET_MS;
    while (Date.now() < deadline) {
      if (await screenReaderIsSpeaking(diag)) {
        diag.mark("speechChannelReconnected", {
          resets: speechChannel.state.resets,
          waitedMs: Date.now() - (deadline - SPEECH_RECONNECT_BUDGET_MS),
        });
        return;
      }
    }
  }

  diag.mark("speechChannelRestart", { reason: "no speech, and a socket rebuild did not fix it" });
  await stopScreenReader(diag);
  await startFreshWithRetry(diag);
  screenReader = { running: true, captures: 1 };
  // POLL, because what follows is a thrown fault. A fixed 3s wait then ONE probe means a screen reader
  // that needed 3.1s is reported as "running but not speaking" -- a false capture failure that the run
  // classifies transient and pays for with a whole retry. Keep asking until the budget is spent; only
  // then is silence a finding.
  const freshDeadline = Date.now() + NVDA_SPEECH_BUDGET_MS;
  while (Date.now() < freshDeadline) {
    if (await screenReaderIsSpeaking(diag)) return;
  }
  throw captureFault(FAULT.SCREEN_READER_MUTE,
    "NVDA is running but not speaking: the speech channel produced nothing before this capture, and " +
    "neither a socket rebuild nor a fresh screen reader fixed it. Failing now rather than capturing " +
    "an empty page.");
}

async function resetSpeechLogs(diag) {
  try {
    await withTimeout(nvda.clearSpokenPhraseLog(), QUERY_TIMEOUT_MS, "clearSpeechLog");
    await withTimeout(nvda.clearItemTextLog(), QUERY_TIMEOUT_MS, "clearItemLog");
  } catch (e) {
    // Not fatal, but it means the probes' deltas start from a dirty baseline, so say so.
    diag.mark("resetSpeechLogs", { ok: false, error: errMsg(e) });
  }
}

// Wait for the old NVDA to actually let go of the port before starting a new one.
//
// A fixed settle was not enough. Restarting the worker leaves an orphaned NVDA (killing the
// node process skips the clean shutdown), and the next cold start would race its teardown:
// `nvda.start()` proceeded while the port was still in flux and the client hit
// `Cannot connect to NVDA / ECONNREFUSED 127.0.0.1:6837` -- asynchronously, so it arrived as
// an unhandled rejection and took the worker down. Recoverable, since the scheduled task
// restarts it, but it cost a capture and a restart every time.
//
// Same probe as the reuse check, inverted: ask the socket rather than guess a duration.
async function waitForScreenReaderGone(diag) {
  const deadline = Date.now() + NVDA_EXIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (!(await screenReaderResponds())) return;
    await sleep(REUSE_PROBE_MS);
  }
  diag.mark("nvdaStillListening", { afterMs: NVDA_EXIT_TIMEOUT_MS });
}

async function stopScreenReader(diag) {
  if (!screenReader.running) return;
  try { await nvda.stop(); } catch (e) { diag.mark("nvdaStop", { error: errMsg(e) }); }
  screenReader = { running: false, captures: 0 };
}

/** Stop the shared screen reader. The HTTP worker calls this on shutdown; without it a
 * reused NVDA would outlive the process that started it. */
// Forget the reused NVDA without touching the process.
//
// Guidepup's NVDA client reports a dropped speech channel by emitting on its TLS socket, which
// surfaces as an UNHANDLED rejection ("Cannot connect to NVDA / ECONNREFUSED 127.0.0.1:6837")
// outside any await we control. The worker used to exit on that and rely on the scheduled task
// for a clean restart -- but the task demonstrably does NOT always restart it: one worker sat
// dead for over three minutes with its VM up and RestartCount 5 configured, and stayed dead.
//
// A worker that stays up and cold-starts NVDA on the next capture beats one that exits hoping
// for a babysitter. This just clears the belief that NVDA is reusable; startFreshScreenReader
// already knows how to clear a leftover instance out of the way.
// --- Readiness ------------------------------------------------------------
//
// `/health` used to answer `ok: true` unconditionally, which is exactly how the worst failure of
// this pool hid: a worker answered health while NVDA could not start, so the dispatcher handed it
// the first case and the capture died on `nvda.start`.
//
// Readiness is deliberately NOT a bag of proxies for "Windows looks settled". NVDA is normally
// started BY a capture, so probing port 6837 on a fresh worker would report not-ready forever.
// Instead the worker starts NVDA once at boot and readiness means the real thing: NVDA is up and
// answering. That makes the signal truthful, moves the cold start off the first capture's critical
// path, and turns "Windows is still settling" from a failed case into a worker that has simply not
// said ready yet.

/** Is the screen reader up and answering on its speech channel? */
export function screenReaderReady() {
  return screenReaderResponds();
}

/** Is there a browser to drive at all? Cheap, and a missing Edge is otherwise a mid-capture error. */
export function browserAvailable() {
  return EDGE_EXES.some((exe) => existsSync(exe));
}

/**
 * Start NVDA before any capture asks for it, so the first capture reuses a warm one.
 * Never throws: a worker that cannot warm up must report why, not crash on boot.
 */
export async function warmUpScreenReader() {
  const diag = createDiagnostics();
  try {
    await startScreenReader(diag, { reuse: true });
    return { ok: true, error: null, diagnostics: diag.entries };
  } catch (e) {
    return { ok: false, error: errMsg(e), diagnostics: diag.entries };
  }
}

/**
 * NVDA's effective configuration, as guidepup reports it.
 *
 * Recorded, deliberately NOT changed. `virtualBuffers.useScreenLayout` is the obvious candidate to
 * tweak -- it is what places a field, an embedded object and a button on one line, and turning it off
 * would tidy the transcript. But it is NVDA's DEFAULT, and this project exists to capture the lived
 * assistive-technology experience: configuring NVDA away from its defaults makes the evidence less
 * representative of what a user actually hears, not more. Tidier transcripts are not the goal.
 *
 * What the configuration IS worth doing is documenting. Two guests with different NVDA settings produce
 * different evidence for the same page, exactly as two different guidepup versions did, and until now
 * nothing recorded or compared it.
 *
 * Available from guidepup 0.30.0 (`getSettings`); returns null on anything older, which is a real
 * answer rather than an error.
 */
export function screenReaderSettings() {
  try {
    return typeof nvda.getSettings === "function" ? nvda.getSettings() : null;
  } catch (error) {
    // Reading configuration must never be able to fail a capture or the diagnostics endpoint.
    return { error: String(error?.message ?? error).split("\n")[0].slice(0, 200) };
  }
}

export function forgetScreenReader() {
  screenReader = { running: false, captures: 0 };
}

export async function shutdownScreenReader() {
  const diag = createDiagnostics();
  await stopScreenReader(diag);
  return diag.entries;
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
/**
 * What to do with the phrase just heard: `"keep"` it, `"skip"` it, or a stop reason to end the read.
 *
 * Split out of the read loop because that loop was doing two jobs — walking the page, and deciding when
 * the walk is over — and all the subtlety is in the second. Bottom-of-page, wrap-around and silence
 * each look like an ordinary line until you count how many times in a row they happen, so the counters
 * and the rules that read them belong together.
 *
 * `tracker` is mutated: it is the running state of one read-through.
 *
 * **Silence.** An empty read is unremarkable on its own, so this needs TWO signals before concluding
 * NVDA is mute: it said nothing at startup (`silentAtStart`) AND nothing substantive has been heard
 * since. That is the same conjunction `failIfScreenReaderIsMute` uses; this only reaches the conclusion
 * sooner, which is worth ~2 minutes because a mute NVDA otherwise answers all 150 advances with
 * silence and then the read is retried in full.
 *
 * The care is because the cost of being wrong is asymmetric: stopping early on a page that WAS being
 * read would silently shorten a transcript, and short transcripts are exactly the evidence rot this
 * project has been bitten by. When NVDA spoke at startup, the silence branch is unreachable and a
 * read-through behaves precisely as it did before.
 */
export function phraseAction(phrase, heard, tracker) {
  if (!phrase) {
    tracker.silentRun += 1;
    const mute = tracker.silentAtStart && heard <= 1 && tracker.silentRun >= MAX_SILENT_STEPS;
    return mute ? "silent" : "skip";
  }
  tracker.silentRun = 0;
  if (phrase === tracker.previous) {
    return ++tracker.repeated >= MAX_REPEATED_PHRASES ? "repeatBottom" : "skip";
  }
  tracker.repeated = 0;
  tracker.previous = phrase;
  const substantial = phrase.length > SUBSTANTIAL_PHRASE_LEN;
  if (substantial && tracker.seen.has(phrase)) {
    return ++tracker.wrapRun >= MAX_WRAP_REPEATS ? "wrap" : "skip";
  }
  tracker.wrapRun = 0;
  if (substantial) tracker.seen.add(phrase);
  return "keep";
}

async function readPageInOrder({ steps, navStrategy, deadline, diag, silentAtStart = false }) {
  const transcript = [];
  const firstItem = await readFirstItem(diag);
  if (firstItem) transcript.push(firstItem);

  const tracker = { seen: new Set(), previous: null, repeated: 0, wrapRun: 0, silentRun: 0, silentAtStart };
  let stopReason = "maxSteps", firstStepError = null;
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
    const action = phraseAction(phrase, transcript.length, tracker);
    if (action === "keep") transcript.push(phrase);
    else if (action !== "skip") { stopReason = action; break; }
  }
  diag.mark("readThrough", { count: transcript.length, stopReason, firstStepError });
  return transcript;
}

// `nvda.next()` moves then reads, so the very first item must be read in place
// or the top line (often the first heading) is skipped.
async function readFirstItem(diag) {
  try {
    const item = ((await nvda.itemText()) || "").trim();
    if (item) return item;

    // On a loaded Edge document NVDA can know the title while the virtual cursor has not
    // exposed an item to Guidepup's itemText() yet. Treating that as an empty page loses the
    // whole transcript, and waiting longer is not a state check. Ask NVDA to read the current
    // line explicitly; this is the user-visible operation we need and gives the virtual cursor
    // one more chance to materialise the first item after the anchor.
    await withTimeout(nvda.perform(nvda.keyboardCommands.readLine), NAV_TIMEOUT_MS, "readLine");
    await waitForSpeechQuiet("anchorSettle");
    const line = ((await withTimeout(nvda.lastSpokenPhrase(), QUERY_TIMEOUT_MS, "readLine")) || "").trim();
    diag.mark("readFirstItemFallback", { phrase: line });
    return line;
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

// A mute NVDA cannot be fixed by reading harder -- stop and say so.
//
// The diagnostics of a degenerate capture name this exactly: `documentReady ok=true` (NVDA answered
// with the title), `afterStart lastSpoken=""` (it has said NOTHING), a read-through of one phrase, and
// then every sweep reporting `found: 0` after three round trips each. NVDA responded to every
// keystroke and never spoke. The runbook already names this state: "NVDA is running but not speaking".
//
// Re-anchoring cannot help, so the retry above wastes a second read, and the sweeps then spend ~45 s
// producing nothing -- 96 s in total for a capture that was never going to yield evidence.
//
// Failing here is also the SAFE way to recover. A failed capture is cleaned up with
// keepScreenReader:false, which stops NVDA, so the next capture cold-starts a fresh one. That reuses
// the existing path rather than adding another place that restarts NVDA -- which is precisely the loop
// that put modal dialogs on the guest desktop and made workers look dead.
// Exported so the gate itself can be tested. It is a pure function of (transcript, diagnostics), and
// the fault code it throws is what the worker's retry keys on — a coupling worth a test rather than a
// comment, because when it breaks nothing fails loudly: the worker just quietly stops recovering.
export function failIfScreenReaderIsMute(transcript, diag) {
  if (transcript.length > 1) return;
  if (!screenReaderWasSilentAtStart(diag)) return; // absent or non-empty: something else is wrong
  diag.mark("screenReaderMute", { transcript: transcript.length });
  throw captureFault(FAULT.SCREEN_READER_MUTE,
    "NVDA is running but not speaking (afterStart.lastSpoken was empty and the read-through " +
    "produced " + transcript.length + " phrase(s)). Failing now so the worker cold-starts a fresh " +
    "screen reader for the next capture, rather than sweeping a silent one.");
}

/** The most recent diagnostic for an event, or undefined. */
function lastMark(diag, event) {
  return diag.entries.filter((entry) => entry.event === event).at(-1);
}

/**
 * Did NVDA say nothing at all when it started?
 *
 * On its own this is NOT proof of a mute screen reader -- see the warning at the top of this file --
 * which is why both callers pair it with "and the read-through heard nothing either".
 */
function screenReaderWasSilentAtStart(diag) {
  return lastMark(diag, "afterStart")?.lastSpoken === "";
}

// Read the page, and if all we heard was its title, anchor again and read once more.
//
// A degenerate capture -- transcript exactly `["<document title>"]`, no headings, no cells -- means
// the browse-mode caret was never in the document: `waitForDocument` leaves the title as the last
// spoken phrase, and a read-through that begins before the anchor takes effect reads that instead of
// the page's first line, then has nowhere to advance to. Measured on a live worker: 2 of 5 captures
// of one page.
//
// The verification layer now rejects these (captureHasSubstance), but rejecting costs the whole
// capture. A second anchor is ~3 s and usually recovers it, so it is worth trying before giving up.
// Only ONE retry: if re-anchoring did not put the caret in the document, something else is wrong and
// the capture should fail honestly rather than loop.
async function readWithRetry({ steps, navStrategy, deadline, diag, title, silentAtStart = false }) {
  const transcript = await readPageInOrder({ steps, navStrategy, deadline, diag, silentAtStart });
  // ONE phrase means the read never advanced, whatever that phrase was.
  //
  // The first version of this required the phrase to EQUAL the document title, and so it never fired
  // -- the kept captures proved it. The real degenerate shape was
  // `["heading, level 1, Aquarium 001 schedule"]`: the h1 announcement, not the bare title, with
  // stopReason `maxSteps`, meaning every advance produced nothing and the loop simply ran out. The
  // content of the one phrase was never the point; the failure to move was.
  if (transcript.length > 1) return transcript;

  // Do not re-read a screen reader that has already been established as silent.
  //
  // The retry below exists for a caret that never entered the document, which re-anchoring fixes. It
  // cannot fix a mute NVDA -- and measured, the wasted second read-through was most of the ~150 s a
  // mute capture cost, because every one of its 150 advances answers with silence. failIfScreenReaderIsMute
  // is about to throw on exactly this state, so returning now loses nothing and saves the whole pass.
  if (lastMark(diag, "readThrough")?.stopReason === "silent") {
    diag.mark("readThroughRetry", { skipped: "screen reader is silent; re-anchoring cannot help" });
    return transcript;
  }

  diag.mark("readThroughRetry", { reason: "read-through produced one phrase", got: transcript[0] ?? null, title });
  await anchorToTop();
  const second = await readPageInOrder({ steps, navStrategy, deadline, diag });
  diag.mark("readThroughRetry", { recovered: second.length > transcript.length, count: second.length });
  return second.length > transcript.length ? second : transcript;
}

// --- Structural navigation + interaction phase ----------------------------

// Skim the page by element type (headings, landmarks, form fields) via NVDA
// quick-nav, and — while a control is under the cursor — operate it to capture
// the announcements only interaction reveals. Returns the structure model and
// the interaction model.
/**
 * Run the sweeps, then ask Chromium how much there WAS to find.
 *
 * A sweep that under-reports reads exactly like a page with nothing on it, and until now nothing could
 * tell them apart: `structure.landmarks` misses a `<main>` wrapping the page on 2,063 of 2,064 corpus
 * captures, because quick navigation cannot reach a landmark containing the caret.
 *
 * The census is a completeness ORACLE and never evidence -- the announcements stay the evidence, and the
 * accessibility tree is barred from being a model feature. It runs on EVERY capture because it costs one
 * call on an already-open DevTools socket; asking NVDA's own Elements List for the same answer costs
 * ~11s, which is why that stays opt-in. It only ever adds a diagnostic, so no cached capture is
 * invalidated and no evidence field moves.
 */
async function navigateByStructureThenAudit(options) {
  const result = await navigateByStructure(options);
  const census = await structuralCensus();
  options.diag.mark("structureCensus", census);
  if (census && !census.error) {
    // A truncated announcement is not a count problem, so the count cross-check cannot see it: the sweep
    // finds the right NUMBER of controls and one of them is named "o". Only the page's real accessible
    // names can distinguish that from a control genuinely named "o".
    const truncated = truncatedAnnouncements(
      [...result.structure.formFields, ...result.structure.headings, ...result.structure.links],
      census.names,
    );
    if (truncated.length) options.diag.mark("truncatedAnnouncements", { truncated });
    options.diag.mark("structureCrossCheck", crossCheckStructure({
      sweep: {
        heading: result.structure.headings.length,
        landmark: result.structure.landmarks.length,
        link: result.structure.links.length,
        graphic: result.structure.graphics.length,
      },
      elementsList: census,
    }));
  }
  return result;
}

async function navigateByStructure({ deadline, diag, probeForms, probeFocus, probeTables, probeElementsList, task }) {
  const K = nvda.keyboardCommands;
  const interaction = { stateChanges: [], formChanges: [], sweepLog: [] };
  const onFormField = (phrase) => operateControl(phrase, { probeForms, deadline, interaction, task });

  const trips = { count: 0 };
  const structure = {
    headings: [], landmarks: [], formFields: [], graphics: [], links: [], lists: [], tableCells: [],
  };
  // No anchor here, deliberately. Measured: anchorToTop costs ~3s -- two nvda.press calls at
  // roughly 1.3s each plus the settle -- making it the single largest item in a 13.4s capture,
  // where all six structural sweeps together cost 1.7s.
  //
  // It is redundant by construction: collectByType sweeps BOTH directions precisely so it
  // reaches every element regardless of where the cursor starts, which is the job this anchor
  // was doing. The read-through leaves the cursor at the bottom, and the backward sweep starts
  // from there and walks up.
  //
  // If this regresses, the symptom is missing headings or landmarks on pages where the
  // read-through ended somewhere awkward -- capture-check asserts those counts on all 7 pages.
  try {
    structure.headings = await collectByType(
      { prev: K.moveToPreviousHeading, next: K.moveToNextHeading }, { label: "heading", onItem: null, deadline, diag, trips });
    // INCOMPLETE BY CONSTRUCTION, and that is not fixable here. Quick navigation cannot reach a
    // landmark containing the caret -- NVDA searches by start position and needs a separate "up"
    // direction for enclosing items -- so a `<main>` wrapping the page is invisible to this sweep.
    // 2,063 of 2,064 corpus captures whose page has a `<main>` never name it. Anchoring makes it worse
    // (Ctrl+Home is still inside such a main; it turned ["form, Hire duration"] into []), and NVDA's
    // Elements List, which does list it, costs ~11s per capture. See docs/screenreader-coverage.md.
    //
    // An empty result therefore means "nothing reachable by quick-nav", NOT "the page exposes none".
    structure.landmarks = await collectByType(
      { prev: K.moveToPreviousLandmark, next: K.moveToNextLandmark }, { label: "landmark", onItem: null, deadline, diag, trips });
    // Enumerate interactive controls with the form-field command ("F"), which
    // covers buttons, edits, checkboxes, combos and radios in one pass. (The NVDA
    // guide lists "F" and "B" as distinct co-equal commands; in our testing the
    // "B" button command under Guidepup missed some plain <button>s that "F"
    // reached, but that's a build-specific observation, not documented behaviour.)
    // This sweep also drives the disclosure and (opt-in) form-submit probes in place.
    structure.formFields = await collectByType(
      { prev: K.moveToPreviousFormField, next: K.moveToNextFormField }, { label: "formField", onItem: onFormField, deadline, diag, trips });
    diag.mark("structural", { headings: structure.headings.length, landmarks: structure.landmarks.length, formFields: structure.formFields.length, roundTrips: trips.count });
    // Additive: graphics, links and lists by quick-nav, then a table walked cell by cell.
    // These fields are new, so no existing signal reads them and none can be broken by them.
    Object.assign(structure, await sweepExtraTypes({ deadline, diag, trips }));
    // Table cells are OPT-IN, unlike the sweeps above, because they are not yet deterministic.
    //
    // Measured over 18 captures of one unchanged page across three workers: 4, 2, 4, 4, 1, 4, 4
    // cells and worse before the settle. The quick-nav sweeps in the same captures were rock
    // steady (graphics, links, lists, landmarks and formFields identical every time), so this is
    // specific to Ctrl+Alt+Arrow grid navigation and NVDA's speech log, not to the capture.
    // Priming into the grid, tolerating silence, and a 500 ms settle each helped and none of
    // them fixed it.
    //
    // A field that varies with timing is indistinguishable from a page that differs, which is
    // precisely the contamination this project exists to avoid -- so it stays off unless asked
    // for, and `docs/screenreader-coverage.md` says not to use it as dataset evidence yet.
    if (probeTables) structure.tableCells = await probeTableCells({ deadline, diag });
  } catch (e) {
    diag.mark("structural", { error: errMsg(e) });
  }
  if (probeForms) diag.mark("formProbe", { activated: interaction.formChanges.length });

  // After a form was submitted in place during the sweep above, re-scan the
  // form fields to capture their now-persistent state. An accessible form marks
  // the invalid field (aria-invalid + an associated error) so it announces
  // "invalid entry"/the error whenever the cursor lands on it; an inaccessible
  // one leaves the field unchanged. This is version-robust, unlike the transient
  // live-region text in formChanges.after (which some NVDA builds don't emit).
  let postSubmitFields = [];
  if (probeForms && interaction.formChanges.length > 0) {
    try {
      // Re-read the form fields' state after the submit. anchorToTop() handles
      // two NVDA facts that defeat a naive re-scan: an accessible form moves focus
      // to the invalid field (focus mode -> single-letter quick-nav is inert, so
      // Escape back to browse mode), and quick-nav skips the element the cursor
      // sits on (so Ctrl+Home anchors at the top and the sweep LANDS on each
      // field). An accessible form marks the invalid field (aria-invalid + an
      // associated error), announcing "invalid entry"/the error; an inaccessible
      // one does not. Version- and mode-robust, unlike the transient live-region
      // text in formChanges.after.
      await anchorToTop();
      // `diag` and `trips` are NOT optional, even though nothing here reads them: collectByType
      // reads `ctx.trips.count` on its first line. Omitting them threw
      // "Cannot read properties of undefined (reading 'count')" on 604 captures of one corpus --
      // before a single sweep ran, so postSubmitFields came back [] on all 2,122. The throw was
      // caught and recorded in sweepLog, which nothing reads, so `validationErrorIsSilent` spent
      // that whole corpus on the fallback its own comment calls useless and 6 cases could not
      // discriminate. Guarded now by verify.corpus.test.ts, which fails on any sweepLog ERROR.
      postSubmitFields = await collectByType(
        { prev: K.moveToPreviousFormField, next: K.moveToNextFormField },
        { label: "postSubmit", onItem: null, deadline, diag, trips });
    } catch (e) {
      // Also marked, not only logged. A probe that crashes must be visible in the evidence a
      // check can see -- sweepLog is a local record and was, on its own, indistinguishable from
      // a page that simply had nothing to announce.
      interaction.sweepLog.push(`postSubmit ERROR ${errMsg(e)}`);
      diag.mark("postSubmitFailed", { error: errMsg(e) });
    }
  }

  // Interactive controls = the form-field controls found above; the state and
  // form changes were captured inline during that sweep.
  // Last, because it re-anchors and leaves the cursor in focus mode -- anything position
  // dependent has to have run already.
  const focusOrder = probeFocus ? await probeFocusOrder({ deadline, diag }) : [];
  // Last of all, and opt-in: it opens a modal dialog and leaves the caret somewhere arbitrary, so
  // nothing position-dependent may run after it.
  if (probeElementsList) {
    const authoritative = await probeElementsListCounts({ deadline, diag });
    if (authoritative) {
      diag.mark("structureCrossCheck", crossCheckStructure({
        sweep: {
          heading: structure.headings.length,
          landmark: structure.landmarks.length,
          formField: structure.formFields.length,
        },
        elementsList: {
          heading: authoritative.heading,
          landmark: authoritative.landmark,
          // NVDA's "Form fields" list ALREADY includes buttons -- measured: a page with one input and
          // one button reports formField=2 and button=1, the same button in both. Adding them
          // double-counted it and reported a truncation that was not there.
          formField: authoritative.formField,
        },
      }));
    }
  }

  const result = {
    controls: structure.formFields,
    stateChanges: interaction.stateChanges,
    formChanges: interaction.formChanges,
    postSubmitFields,
    focusOrder,
    // Named explicitly, because this object is rebuilt from named fields and anything set on `interaction`
    // but not listed here is SILENTLY DROPPED -- which is how a field a signal reads can go missing with
    // every check still green. `postSubmitFields` itself was empty on all 2,122 captures for a related
    // reason. Absent (rather than false) when the submit did not navigate, so "we did not check" and
    // "it did not navigate" stay distinguishable.
    ...(interaction.navigatedOnSubmit ? { navigatedOnSubmit: interaction.navigatedOnSubmit } : {}),
  };
  diag.mark("interaction", {
    controls: result.controls.length,
    stateChanges: result.stateChanges.length,
    formChanges: result.formChanges.length,
    postSubmit: postSubmitFields.length,
    sweepLog: interaction.sweepLog,
  });
  return { structure, interaction: result };
}

// Return NVDA to a known starting point. Per the NVDA user guide: Escape
// "switches back to browse mode if focus mode was previously switched to
// automatically" (single-letter quick-nav and caret reading are browse-mode
// features, inert in focus mode); Ctrl+Home is a standard Windows caret key that
// browse mode passes through (not an NVDA command) to move to the document top.
// Moving the caret also cancels NVDA's "Automatic say all on page load" (on by
// default), so its auto-read can't race our line-stepping.
// How long the speech log must stay UNCHANGED before NVDA counts as finished speaking, and how long we
// are willing to wait for that.
const SPEECH_QUIET_WINDOW_MS = 300;
const SPEECH_QUIET_BUDGET_MS = 5_000;

/**
 * Wait until NVDA stops talking, rather than sleeping a guessed duration.
 *
 * The five call sites this replaces each slept a fixed 400-500ms after a keystroke, and the repo's own
 * rule says a fixed sleep is wrong in both directions -- too long in the common case, and too short in
 * the tail, where being wrong DESTROYS evidence rather than merely costing time.
 *
 * They were not redundant, and CLAUDE.md said they were. guidepup resolves `press`/`perform` on the
 * FIRST spoken phrase, not after speech settles, because `DEFAULT_CAPTURE` is `"initial"`:
 *
 *     if ((options?.capture ?? this.#capture) === "initial") {
 *         clearTimeout(timeoutId); speakPromiseResolver();   // resolves on the first phrase
 *     } else { timeoutId = setTimeout(timeoutHandler, SPEAK_DEBOUNCE_TIMEOUT); }
 *
 * So later utterances of the same announcement can still be in flight when the call returns. The claim
 * that "nvda.perform() returning already means speech has settled" holds only for `{capture: true}`,
 * which this project does not use -- switching to it would change every log entry from the first phrase
 * to all phrases joined, which is an evidence change and a full recapture.
 *
 * Polling is the only option: the client is request/response with no emitter to await.
 *
 * @returns {Promise<{quiet: boolean, waitedMs: number, reads: number}>} `quiet: false` means the budget
 *   ran out with NVDA still talking -- recorded, never silently treated as settled.
 */
async function waitForSpeechQuiet(label) {
  const startedAt = Date.now();
  const deadline = startedAt + SPEECH_QUIET_BUDGET_MS;
  let length = -1;
  let lastChange = startedAt;
  let reads = 0;
  while (Date.now() < deadline) {
    const now = ((await withTimeout(nvda.spokenPhraseLog(), QUERY_TIMEOUT_MS, label).catch(() => [])) || []).length;
    reads += 1;
    if (now !== length) {
      length = now;
      lastChange = Date.now();
    } else if (Date.now() - lastChange >= SPEECH_QUIET_WINDOW_MS) {
      return { quiet: true, waitedMs: Date.now() - startedAt, reads };
    }
  }
  return { quiet: false, waitedMs: Date.now() - startedAt, reads };
}

async function anchorToTop() {
  await withTimeout(nvda.press("Escape"), NAV_TIMEOUT_MS, "esc").catch(() => undefined);
  await withTimeout(nvda.press("Control+Home"), NAV_TIMEOUT_MS, "ctrlHome").catch(() => undefined);
  await waitForSpeechQuiet("anchorSettle");
}

// Collect every element of one type, sweeping both directions (Guidepup has no
// "move to top") so every element is reached regardless of cursor position. An
// empty list means the page exposes none of that type, even if it looks like it
// does. `onItem` fires when the cursor lands on a new element.
async function collectByType(commands, ctx) {
  const out = [], seenKeys = new Set();
  const sweepCtx = { ...ctx, out, seenKeys };
  // Per-sweep timing and round-trip counts. `structural` is the largest remaining phase and
  // the aggregate hides which of the six sweeps costs what -- a page with one heading and no
  // landmarks still spends ~4.7s here, which points at fixed per-sweep cost rather than
  // per-element cost. Optimising without this is guesswork.
  const startedAt = Date.now();
  const before = ctx.trips.count;
  const prevOutcome = await sweepInDirection(commands.prev, sweepCtx);
  const afterPrev = Date.now(), tripsPrev = ctx.trips.count - before;
  const nextOutcome = await sweepInDirection(commands.next, sweepCtx);
  ctx.diag.mark("sweep", {
    type: ctx.label,
    found: out.length,
    prevMs: afterPrev - startedAt,
    nextMs: Date.now() - afterPrev,
    prevTrips: tripsPrev,
    nextTrips: ctx.trips.count - before - tripsPrev,
    // WHY each direction stopped. Without this, an empty sweep and a truncated one are the same
    // observation -- and telling a phantom from a real element needs to know whether the sweep ran
    // out of elements, went silent, or hit the step cap.
    prevStop: prevOutcome?.stop, nextStop: nextOutcome?.stop,
    phrases: out.slice(),
  });
  return out;
}

// Walk one direction with a single quick-nav command until it runs out, the cap
// is hit, or the deadline passes, appending each new element to `out`.
// NVDA prefixes an announcement with the container it just entered, so the SAME element is
// announced two different ways depending on which direction you reach it from:
//
//   "Children's story time, heading, level 3"
//   "main landmark, Children's story time, heading, level 3"
//
// A raw prefix key treats those as two elements. It shows up as a phantom extra heading --
// harmless to the assertions, but it is noise in the evidence, and it got worse once the
// sweep stopped starting from a fixed position. Strip a leading container announcement before
// keying.
// The separator before the role may be a COMMA, not just a space. NVDA announces both shapes:
//
//   "main landmark, Children's story time, heading, level 3"      <- space
//   "Main support article, region, Resetting a password, ..."     <- comma
//
// Only the first was matched, so the second survived deduping and the same h2 was recorded twice --
// three headings on a page with two. Found by the CDP census (sweep 3, page 2), which is exactly the
// kind of miscount that is invisible without an independent count to compare against.
const CONTAINER_PREFIX = /^(?:\w[\w\s'-]*[,\s]\s*)?(?:landmark|region|banner|navigation|main|complementary|content info|form|article),\s*/i;

export const dedupeKey = (phrase) => phrase.replace(CONTAINER_PREFIX, "").slice(0, DEDUPE_KEY_LEN);

/**
 * Given the speech log and how much of it we had already read, did the last quick-nav jump MOVE, and
 * if so what was announced?
 *
 * Extracted so the rule can be tested without NVDA. The bug it replaces was a reasoning error rather
 * than a coding one -- "the spoken phrase changed" was treated as proof of movement -- and a reasoning
 * error is only pinned down by a test that states the intended rule. `sweep-step.test.ts` asserts the
 * case that used to produce a phantom: NVDA silent, `lastSpokenPhrase` still holding older text.
 *
 * @param {{log: string[], seen: number, prev: string}} state
 * @returns {{phrase?: string, stop?: string, seen: number}} `stop` names WHY, so a diagnostic can
 *   distinguish "ran out of elements" from "the channel was rebuilt" -- previously both were `break`.
 */
export function sweepStepFromSpeech({ log, seen, prev }) {
  const entries = log ?? [];
  // Shorter than what we already consumed means the log was cleared under us: a speech-channel
  // rebuild. Slicing into it would silently invent a delta out of unrelated phrases.
  if (entries.length < seen) return { stop: "channelReset", seen: entries.length };
  const spoken = entries.slice(seen).map((phrase) => String(phrase).trim()).filter(Boolean);
  const advanced = entries.length;
  // The whole point: no new speech means no movement. This is the branch where the old test lied.
  if (!spoken.length) return { stop: "silent", seen: advanced };
  // The LAST entry, which is exactly what lastSpokenPhrase returned -- so a capture in which NVDA
  // speaks yields byte-identical evidence to before the fix, and 2,122 cached captures stay valid.
  const phrase = spoken[spoken.length - 1];
  if (/\bno (next|previous|more)\b/i.test(phrase)) return { stop: "exhausted", seen: advanced };
  if (phrase === prev) return { stop: "repeat", seen: advanced };
  return { phrase, seen: advanced };
}

async function sweepInDirection(cmd, { label, out, seenKeys, onItem, deadline, trips }) {
  // Movement is decided by "did NVDA say anything NEW?", never by "did lastSpokenPhrase change?".
  //
  // The old test was unsound in the one case that matters. When a quick-nav jump does not move and
  // NVDA says nothing at all, `lastSpokenPhrase` keeps returning an OLDER phrase -- and because that
  // phrase was compared against a seed carried over from the previous sweep, it differed, passed
  // every guard, and was recorded as an element that does not exist. That produced a phantom
  // landmark on a page where NVDA's own Elements List reports "1 of 1", and the phantom changed the
  // evidence text enough to flip a conformant page's score across a threshold.
  //
  // A log delta cannot be fooled by history: a stale phrase is, by definition, not in it. Note the
  // asymmetry that makes this the right test -- silence is unambiguous evidence of not moving, while
  // an unchanged phrase is ambiguous between "did not move" and "moved to something announced the
  // same way".
  //
  // `prev` still guards genuine repetition, but starts EMPTY: seeding it across sweeps is what made
  // a stale phrase look like news.
  let prev = "";
  // Read once, then advance as we go, so this costs the same two round trips per step as the
  // lastSpokenPhrase version it replaces. `trips` therefore stays comparable across the change.
  trips.count += 1;
  let seen = ((await withTimeout(nvda.spokenPhraseLog(), QUERY_TIMEOUT_MS, label).catch(() => [])) || []).length;
  for (let i = 0; i < MAX_SWEEP_STEPS; i++) {
    if (Date.now() > deadline) break;
    let step;
    try {
      trips.count += 2;
      await withTimeout(nvda.perform(cmd), NAV_TIMEOUT_MS, label);
      const log = (await withTimeout(nvda.spokenPhraseLog(), QUERY_TIMEOUT_MS, label)) || [];
      step = sweepStepFromSpeech({ log, seen, prev });
    } catch { break; }
    seen = step.seen;
    if (step.stop) return { stop: step.stop, steps: i };
    const phrase = step.phrase;
    prev = phrase;
    if (phrase.length < MIN_CONTROL_NAME_LEN) continue; // stray key echo, not a control
    const key = dedupeKey(phrase);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    out.push(phrase);
    if (onItem) await onItem(phrase);
  }
  return { stop: "cap", steps: MAX_SWEEP_STEPS };
}

// Element types a screen-reader user quick-navigates by, beyond the three we already sweep.
// Each one was previously evidence we got only by ACCIDENT -- if the line-by-line read-through
// happened to pass over the element -- which is not the same as having looked:
//
//   graphic  "graphic, Ada Lovelace portrait" vs a bare "graphic". This is 1.1.1, and it is
//            what the image-missing-alt / generic-alt / filename-alt cases are about; they were
//            being judged on whatever the read-through picked up.
//   link     link text OUT OF CONTEXT, which is precisely what 2.4.4/2.4.9 asks about and what
//            a real user sees in NVDA's elements list. "read more" is only a failure when
//            isolated from its paragraph -- so isolating it is the test.
//   list     "list with 4 items" and nesting depth: 1.3.1.
//
// Cheap enough to be on by default: the three existing sweeps cost 1.7s for six directions,
// so each direction is ~0.28s.
const EXTRA_SWEEPS = [
  { key: "graphics", label: "graphic", prev: "moveToPreviousGraphic", next: "moveToNextGraphic" },
  { key: "links", label: "link", prev: "moveToPreviousLink", next: "moveToNextLink" },
  { key: "lists", label: "list", prev: "moveToPreviousList", next: "moveToNextList" },
];

async function sweepExtraTypes(ctx) {
  const K = nvda.keyboardCommands;
  const found = {};
  for (const { key, label, prev, next } of EXTRA_SWEEPS) {
    found[key] = await collectByType({ prev: K[prev], next: K[next] }, { ...ctx, label, onItem: null });
  }
  return found;
}

// How far to walk a table. Enough to cross a header row and enter the data below it, which is
// where header association shows up; not so far that a wide table dominates the capture.
const MAX_TABLE_STEPS = 6;

// Table navigation must not read the speech log until NVDA has finished talking. Without that wait,
// nine captures of the SAME page returned 4, 4, 1, 4, 2, 3, 0 and one error's worth of cells --
// evidence that varied purely with timing, which is indistinguishable from a page that differs.
// Quick-nav sweeps tolerate less waiting because each jump is slower; a Ctrl+Alt+Arrow inside an
// already-rendered grid returns faster than NVDA updates its log. This used to be a fixed 500ms;
// `waitForSpeechQuiet` waits for the actual condition, which matters most in the tail where a fixed
// wait expires early and a truncated walk is recorded as a page with fewer cells.

// NVDA's own words for "there is no cell here". Shared, because only walkTable checked for them and
// enterFirstCell did not -- so a table walked from its caption recorded "Edge of table" AS A CELL and
// the evidence contained a boundary message dressed up as content. Measured: tableCells[1] was
// "Edge of table" on a 2x3 table.
const TABLE_BOUNDARY = /\bedge of table\b|\bnot in a table\b/i;

// One dud step is tolerated before giving up. Guidepup's own description is "WHEN WITHIN A
// TABLE, moves the system caret to the next column" -- and jumping to a table with T lands on
// its caption, which is not within the grid. So the first Ctrl+Alt+Arrow announces nothing and
// a walk that stopped at the first unchanged phrase collected only the table's entry line.
// Measured: tableCells was 1 on a 2x3 table before this.
// Three, not two, because silence now counts as a miss and a slow speech log can swallow one
// step without the walk being over.
const MAX_TABLE_MISSES = 3;

// What NVDA said in response to one keystroke, as a DELTA of the spoken-phrase log.
//
// This replaces reading lastSpokenPhrase, and it is the fix for the defect that made tableCells
// unusable: 18 captures of one unchanged page returned 4, 2, 4, 4, 1, 4, 4 cells. "What was last
// said" is a single sample of a moving target -- if the announcement had not landed yet the read
// returned the PREVIOUS phrase (indistinguishable from "did not move") or nothing (which the walk
// took for the end of the table). Priming, silence tolerance and a 500 ms settle each helped and
// none of them fixed it, because all three were compensating for the wrong read.
//
// A delta cannot miss a late announcement: whatever arrived during the settle is in the log, and
// an empty delta means NVDA genuinely said nothing. Same idiom as activateAndCaptureDelta, which
// exists because a live-region status can be followed by a focus move that overwrites
// lastSpokenPhrase.
async function speechDelta(step, label) {
  const before = ((await withTimeout(nvda.spokenPhraseLog(), QUERY_TIMEOUT_MS, label).catch(() => [])) || []).length;
  await withTimeout(step(), NAV_TIMEOUT_MS, label);
  // `waitForAnnouncement`, NOT `waitForSpeechQuiet`, and the difference cost a table cell.
  //
  // `waitForSpeechQuiet` waits for the log to stop CHANGING. Here speech has usually not started yet --
  // a Ctrl+Alt+Arrow inside an already-rendered grid returns faster than NVDA updates its log -- so an
  // unchanged log satisfied "quiet" immediately, the delta came back empty, and the walk read that as a
  // missing cell. `evidence:check` caught it as `tableCells: 5 -> 4` on both variants of
  // `table-unassociated-headers`; a condition has to be SUFFICIENT, not merely true.
  //
  // `waitForAnnouncement` waits for the log to GROW first, treats never growing as a genuine silence
  // (which is a finding here, not a failure), and only then waits for it to settle.
  const log = await waitForAnnouncement(before, label);
  // Joined rather than reduced to one entry: a cell whose announcement arrives as two utterances
  // is still one cell, and dropping either half would be losing evidence.
  return log.slice(before).map((phrase) => String(phrase).trim()).filter(Boolean).join(", ");
}

// Walk one direction inside a table, appending each newly announced cell.
async function walkTable(step, { out, deadline, label, trace }) {
  let misses = 0;
  for (let i = 0; i < MAX_TABLE_STEPS; i += 1) {
    if (Date.now() > deadline) break;
    let phrase;
    try {
      phrase = await speechDelta(step, label);
    } catch (e) { trace.push(`${label} threw ${errMsg(e)}`); break; }
    trace.push(`${label}[${i}] ${phrase.slice(0, 60) || "(silence)"}`);
    // Only NVDA's own boundary wording ends the walk.
    if (TABLE_BOUNDARY.test(phrase)) break;
    // Silence is still retried rather than treated as the end -- but with a delta it now means
    // NVDA really said nothing, not that the read was early. There is no "unchanged phrase" case
    // any more: a delta is new speech by construction.
    if (!phrase) {
      misses += 1;
      if (misses >= MAX_TABLE_MISSES) break;
      continue;
    }
    misses = 0;
    if (!out.includes(phrase)) out.push(phrase);
  }
}

// Navigate a table CELL BY CELL, which is the only way to see whether headers are associated.
//
// A properly marked-up table announces the header as you enter each cell -- "Price, £4.99" --
// while a layout table or one with unassociated <td> headers gives you coordinates only:
// "row 3, column 2, £4.99". The dataset already has a POSITION_ONLY_CELL signal looking for
// exactly that, but nothing was ever driving the cell navigation that produces it: the
// row/column text in existing captures is incidental, from the read-through crossing a table.
//
// Both directions are tried before giving up, because the cursor sits at the END of the
// document after the structural sweeps -- "next table" from there finds nothing on a page
// whose only table is above. Cheaper than a ~3s anchorToTop.
async function probeTableCells({ deadline, diag }) {
  const K = nvda.keyboardCommands;
  const cells = [];
  const trace = [];
  let note = null;
  try {
    const entry = await enterFirstTable(K);
    if (!entry) note = "no table on the page";
    else {
      cells.push(entry);
      const first = await enterFirstCell(K, { trace });
      if (!first) note = "table found but no navigable cell";
      else {
        cells.push(first);
        await walkTable(() => nvda.perform(K.moveToNextColumn), { out: cells, deadline, label: "col", trace });
        await walkTable(() => nvda.perform(K.moveToNextRow), { out: cells, deadline, label: "row", trace });
      }
    }
  } catch (e) {
    note = errMsg(e);
  }
  diag.mark("tableCells", { found: cells.length, note, trace });
  return cells;
}

// Get the caret INTO the grid.
//
// Jumping to a table with T lands on its <caption>, which is inside the table element but
// outside the grid, and NVDA answers every Ctrl+Alt+Arrow from there with "Not in a table
// cell". Measured before this existed: tableCells held only the table's summary line and read
// IDENTICALLY on the good and bad pages -- a probe that could not discriminate, which is worse
// than no probe because it looks like evidence.
//
// So: attempt a cell move, and if NVDA says we are not in a cell, step the browse-mode caret
// down one line and try again. Both keystroke routes were checked first -- perform(command) and
// press("Control+Alt+ArrowDown") returned the same message, so delivery was never the problem.
const MAX_CELL_PRIMES = 3;

async function enterFirstCell(K, { trace }) {
  for (let i = 0; i < MAX_CELL_PRIMES; i += 1) {
    const phrase = await speechDelta(() => nvda.perform(K.moveToNextRow), "prime").catch(() => "");
    trace.push(`prime[${i}] ${phrase.slice(0, 60) || "(silence)"}`);
    // A boundary message is not a cell. Returning one made the first "cell" in the evidence a
    // message about there being no cell.
    if (phrase && !TABLE_BOUNDARY.test(phrase)) return phrase;
    await withTimeout(nvda.press("ArrowDown"), NAV_TIMEOUT_MS, "prime").catch(() => undefined);
  }
  return "";
}

// Land on a table in either direction; "" when the page has none.
async function enterFirstTable(K) {
  for (const cmd of [K.moveToNextTable, K.moveToPreviousTable]) {
    await withTimeout(nvda.perform(cmd), NAV_TIMEOUT_MS, "table").catch(() => undefined);
    const phrase = ((await withTimeout(nvda.lastSpokenPhrase(), QUERY_TIMEOUT_MS, "table").catch(() => "")) || "").trim();
    if (phrase && !/\bno (next|previous) table\b/i.test(phrase)) return phrase;
  }
  return "";
}

// What a KEYBOARD user meets, in order, by pressing Tab.
//
// Everything else here runs in browse mode, where NVDA's quick-nav reaches elements by reading
// the accessibility tree. Tab is a different question: it follows the real focus order. An
// element can be perfectly announced in browse mode and be unreachable by keyboard, and a
// focus trap is invisible to every other probe we have. That covers 2.1.2 (No Keyboard Trap),
// 2.4.3 (Focus Order) and skip links (2.4.1).
//
// OPT-IN, because it is the expensive probe: a press plus a focus report is ~2s per stop, so
// twelve stops roughly doubles a 13s capture. The cheap sweeps above are on by default; this
// one is requested per case.
const MAX_TAB_STOPS = 12;
const TRAP_REPEATS = 2;

async function probeFocusOrder({ deadline, diag }) {
  await anchorToTop();
  const stops = [];
  let repeats = 0;
  for (let i = 0; i < MAX_TAB_STOPS; i += 1) {
    if (Date.now() > deadline) break;
    await withTimeout(nvda.press("Tab"), NAV_TIMEOUT_MS, "tab").catch(() => undefined);
    const phrase = await reportFocusedControl();
    if (!phrase) break;
    // The same control twice running means Tab stopped moving: either the end of the document
    // or a focus trap. Which one it is, is the judge's call -- record it, do not decide it.
    if (stops.length && phrase === stops[stops.length - 1]) repeats += 1;
    else repeats = 0;
    stops.push(phrase);
    if (repeats >= TRAP_REPEATS) break;
  }
  // Never a silent cap: a truncated focus order looks identical to a short one.
  diag.mark("focusOrder", {
    stops: stops.length,
    truncated: stops.length >= MAX_TAB_STOPS,
    stalled: repeats >= TRAP_REPEATS,
  });
  return stops;
}

/**
 * NVDA's own answer to "how many elements of each type does this document have?"
 *
 * The structural sweeps walk the document with quick-nav, which is RELATIVE: it depends on where the
 * caret is, and what it reports is whatever NVDA happened to speak. That makes two failure modes
 * indistinguishable from a correct result -- a truncated sweep, and a phantom entry recorded from a
 * phrase that was not an element of the requested type at all. A phantom landmark is what moved a
 * conformant page's score across its threshold and flipped the verdict.
 *
 * The Elements List (NVDA+F7) is ABSOLUTE: it enumerates the document irrespective of caret position,
 * and every row in the Landmarks list is by construction a landmark. Its rows are announced as
 * "level 1, form, 1 of 1", so ONE arrow press yields the authoritative total for a type -- which is
 * all a cross-check needs, and keeps the time spent inside a modal dialog to a minimum.
 *
 * `ELEMENT_TYPES` in NVDA's browseMode.py is exactly (link, heading, formField, button, landmark), and
 * the accelerators below come from the labels in that same tuple ("Lan&dmarks" -> Alt+D). The other
 * types we sweep -- graphics, lists, table cells -- are NOT in that dialog, so this can cross-check
 * five of them and no more. That limit is why this supplements the sweep rather than replacing it.
 *
 * Opt-in, and never on by default: it opens a MODAL dialog on the guest desktop, and a modal blocks
 * input, which is exactly how a worker wedges.
 */
// A generous ceiling, not an expectation: it must exceed the longest real list so the count is a
// count rather than a cap, and any truncation is reported rather than silently returned as a total.
const MAX_ELEMENTS_LIST_ROWS = 60;

// The capture path reads LANDMARKS only. That is where the defect is -- quick navigation cannot reach a
// landmark that spans the whole document, so 2,063 of 2,064 corpus captures never named their `<main>`
// -- and reading one type costs a fifth of reading five. The full set stays available for the
// cross-check, which is a verification tool and can afford to be slow.
const LANDMARKS_ONLY_TYPE = "landmark";

const ELEMENTS_LIST_TYPES = [
  { type: "link", accelerator: "Alt+k" },
  { type: "heading", accelerator: "Alt+h" },
  { type: "formField", accelerator: "Alt+f" },
  { type: "button", accelerator: "Alt+b" },
  { type: "landmark", accelerator: "Alt+d" },
];

// A tree ROW as NVDA announces it while focused:
//   "main, tree view item, focused, selected, expanded, 1 of 1, level 0"
// An EMPTY tree announces only the container -- "tree view, focused" -- with no item name, which is the
// signal that a type has no elements. Distinguishing those two is the whole reason this reads the
// focused item rather than counting: a silent read means "could not tell", not "none".
const TREE_ROW_RE = /\btree view item\b/i;
const EMPTY_TREE_RE = /^tree view(?:,\s*focused)?\.?$/i;

/**
 * The item name, stripped of the tree-view chrome NVDA appends.
 *
 * Position and level are deliberately discarded. The obvious-looking shortcut is to parse the "1 of 1"
 * suffix as a total, and it is WRONG: the list is HIERARCHICAL (a `<main>` containing a `<form>` reads
 * "level 0 ... 1 of 1" with the form as a child), so that number counts siblings at one level, not
 * elements in the document. Reading it as a total silently undercounts every nested structure.
 */
export function elementsListRowName(phrase) {
  const text = String(phrase ?? "").trim();
  if (!TREE_ROW_RE.test(text)) return null;
  return text
    .replace(/,?\s*tree view item\b/i, "")
    .replace(/,?\s*\b(?:focused|selected|expanded|collapsed)\b/gi, "")
    .replace(/,?\s*\b\d+ of \d+\b/i, "")
    .replace(/,?\s*\blevel \d+\b/i, "")
    .replace(/[\s,]+/g, " ")
    .trim() || null;
}

/**
 * Compare what the sweeps found against what NVDA's Elements List reports.
 *
 * Reports; decides nothing. A disagreement is evidence about the CAPTURE, not about the page, and the
 * layers that gate on evidence must be able to see the difference.
 *
 * A count may legitimately be absent on either side — a type the dialog could not be read for, or one
 * the sweep did not run — so the value type admits `undefined` deliberately. Declaring these as plain
 * numbers would be a lie about the one input the function exists to handle carefully.
 *
 * @param {{sweep: Record<string, number | undefined>, elementsList: Record<string, number | undefined>}} counts
 */
export function crossCheckStructure({ sweep, elementsList }) {
  const disagreements = [];
  let compared = 0;
  // Whatever BOTH sides name. Previously this iterated NVDA's five Elements List types, which silently
  // ignored any type the oracle could speak about but that list cannot -- and the CDP census covers
  // graphics and links too. Comparing the intersection keeps it honest in both directions.
  for (const type of Object.keys(sweep ?? {})) {
    const found = sweep?.[type];
    const authoritative = elementsList?.[type];
    // Absent is not a disagreement: a type the dialog could not be read for must not be reported as
    // a mismatch against a sweep that did run. Only two KNOWN numbers that differ are evidence.
    if (typeof found !== "number" || typeof authoritative !== "number") continue;
    compared += 1;
    if (found !== authoritative) {
      disagreements.push({
        type,
        sweep: found,
        elementsList: authoritative,
        // Naming the direction matters: too many is a phantom, too few is a truncation, and they have
        // different causes and different fixes.
        kind: found > authoritative ? "phantom" : "truncated",
      });
    }
  }
  // `compared` is not bookkeeping, it is the difference between "checked and agreed" and "checked
  // nothing". The first version returned agrees:true when every count was unreadable, so a probe that
  // read the wrong control and parsed nothing reported AGREES -- a verification that cannot fail,
  // which is the exact defect this cross-check was built to catch elsewhere.
  return { agrees: compared > 0 && disagreements.length === 0, compared, disagreements };
}

const LANDMARKS_ONLY = ELEMENTS_LIST_TYPES.filter(({ type }) => type === LANDMARKS_ONLY_TYPE);

/**
 * Walk one Elements List tree, returning every row's name in order.
 *
 * Extracted because the loop sat four blocks deep inside the type iteration, but it earns its own name
 * anyway: "read the rows of one tree" is a single job, and it is the part with the subtle stopping
 * rules. Each stop is distinguishable on purpose -- an empty tree, an unparsed row and a hit cap are
 * three different facts, and collapsing them into "0 rows" is what makes an unread probe look like a
 * confident zero.
 */
async function readTreeRows({ type, readAfter, deadline, notes }) {
  const rows = [];
  let previous = null;
  for (let i = 0; i < MAX_ELEMENTS_LIST_ROWS; i += 1) {
    if (Date.now() > deadline) { notes.push(`${type}: deadline after ${rows.length} row(s)`); break; }
    const spoken = await readAfter(`row-${type}-${i}`, () => nvda.perform(nvda.keyboardCommands.reportCurrentFocus));
    const phrase = spoken[spoken.length - 1] ?? "";
    // An empty tree names no item, so this type genuinely has none. It is the only safe way to read
    // zero: silence would mean "could not tell", and recording that as zero manufactures a finding.
    if (EMPTY_TREE_RE.test(phrase)) break;
    const name = elementsListRowName(phrase);
    if (!name) { notes.push(`${type}: unparsed ${JSON.stringify(phrase).slice(0, 60)}`); break; }
    if (name === previous) break; // ArrowDown stopped moving: this was the last row
    rows.push(name);
    previous = name;
    await readAfter(`down-${type}-${i}`, () => nvda.press("ArrowDown"));
  }
  if (rows.length >= MAX_ELEMENTS_LIST_ROWS) notes.push(`${type}: hit the row cap, so the count is a floor`);
  return rows;
}

/**
 * Read the Elements List's authoritative per-type totals.
 *
 * Kept deliberately small: select a type by its accelerator, land on one row, parse the "N of M" NVDA
 * appends, move on. One row is enough for the total, and every extra keystroke is time spent with a
 * modal dialog open on the guest desktop.
 *
 * A type with no elements speaks NOTHING when arrowed -- measured on a page NVDA reports no landmarks
 * for -- so an empty delta is a genuine zero rather than a failed read. That distinction is only safe
 * because the dialog itself was confirmed to speak ("Elements List, dialog" -> "tree view") before
 * this was written; if the dialog were silent, zero and unread would be the same observation.
 */
async function probeElementsListCounts({ deadline, diag, types = LANDMARKS_ONLY }) {
  const K = nvda.keyboardCommands;
  const counts = {};
  const items = {};
  const notes = [];
  const trace = [];
  // The offset advances instead of being re-read before every keystroke. Reading it twice per keystroke
  // doubled the round trips, and round trips are the entire cost here: all five types measured 39s on
  // top of a 20s capture, which is unaffordable for a 2,122-capture corpus.
  let seen = ((await withTimeout(nvda.spokenPhraseLog(), QUERY_TIMEOUT_MS, "elementsListSeed").catch(() => [])) || []).length;
  const readAfter = async (label, action) => {
    await withTimeout(action(), NAV_TIMEOUT_MS, label).catch(() => undefined);
    const log = (await withTimeout(nvda.spokenPhraseLog(), QUERY_TIMEOUT_MS, label).catch(() => [])) || [];
    // A shrunken log means the speech channel was rebuilt; resynchronise rather than mis-slice.
    if (log.length < seen) { seen = log.length; trace.push({ step: label, spoken: [], channelReset: true }); return []; }
    const spoken = log.slice(seen).map((phrase) => String(phrase).trim()).filter(Boolean);
    seen = log.length;
    // Every keystroke's speech, because this dialog's focus behaviour has now been guessed wrong twice:
    // arrowing without tabbing cycled the radio GROUP, and tabbing on every type walked focus OUT of
    // the tree. A trace makes the next question answerable from one run instead of another deploy.
    trace.push({ step: label, spoken });
    return spoken;
  };

  try {
    const opened = await readAfter("elementsListOpen", () => nvda.perform(K.browseModeElementsList));
    // If the dialog did not announce itself it may not have opened, and arrowing blind inside the
    // DOCUMENT instead would move the caret and corrupt everything measured after this.
    if (!opened.some((phrase) => /elements list/i.test(phrase))) {
      diag.mark("elementsList", { opened: false, spoken: opened });
      return null;
    }
    for (const { type, accelerator } of types) {
      if (Date.now() > deadline) { notes.push(`${type}: deadline`); break; }
      await readAfter(`select-${type}`, () => nvda.press(accelerator));
      // Tab to the tree, then Home for its FIRST row. The accelerator leaves focus on the radio group
      // (arrowing there cycles TYPES, which shifted every reading by one), and ArrowDown from the tree
      // container announced nothing at all -- both measured on the guest.
      await readAfter(`tab-${type}`, () => nvda.press("Tab"));
      await readAfter(`home-${type}`, () => nvda.press("Home"));
      const rows = await readTreeRows({ type, readAfter, deadline, notes });
      if (rows.length >= MAX_ELEMENTS_LIST_ROWS) notes.push(`${type}: hit the row cap, count is a floor`);
      counts[type] = rows.length;
      items[type] = rows;
    }
  } finally {
    // UNCONDITIONAL, and twice. This is a MODAL dialog: leaving it open blocks input on the guest and
    // wedges the next capture, which is a fault that once took two days to attribute correctly. Never
    // let closing it depend on anything above succeeding.
    for (let i = 0; i < 2; i += 1) {
      await withTimeout(nvda.press("Escape"), NAV_TIMEOUT_MS, "escDialog").catch(() => undefined);
    }
  }
  diag.mark("elementsList", { opened: true, counts, items, notes, trace });
  return counts;
}

// Operate the control under the cursor and record what the screen reader says —
// the lived-experience signal a static read cannot see. Activating in place is
// required: a separate next/previous sweep finds nothing, because after the
// structural sweep the cursor sits at the end and the only control is the
// current position, not a next one.
async function operateControl(phrase, ctx) {
  if (/\bcollapsed\b/i.test(phrase)) return probeDisclosure(phrase, ctx);
  if (!ctx.probeForms || !/\bbutton\b/i.test(phrase)) return undefined;
  if (SUBMIT_RE.test(phrase)) return probeFormSubmit(phrase, ctx);
  if (taskNamesControl(phrase, ctx.task)) return probeTaskButton(phrase, ctx);
  return undefined;
}

// True when the control's announced NAME shares a meaningful word with the task,
// so activating it matches the user's stated intent (e.g. task "show only bags"
// -> button "Bags"). This guards the task-button probe so it never clicks an
// unrelated or destructive control: only a button the task actually names.
function taskNamesControl(phrase, task) {
  if (!task) return false;
  const taskWords = new Set(task.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  return phrase
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .some((w) => w.length >= MIN_CONTROL_NAME_LEN && !CONTROL_WORDS.has(w) && taskWords.has(w));
}

// Activate a disclosure (safe — it just toggles visibility) and record the state it
// exposes afterwards, so a control that never updates its state is caught (4.1.2
// Name, Role, Value).
//
// We RE-READ the control rather than listening for a spontaneous announcement,
// because the spontaneous route cannot separate a conformant disclosure from a
// broken one. Measured on NVDA 2026.1.1: activating either fixture announces only a
// document re-announce (~625ms) — "expanded" is never spoken, and neither
// `lastSpokenPhrase` nor the `spokenPhraseLog` delta contains it. Judging on that
// meant a broken disclosure could look identical to a working one.
//
// Re-reading asks the accessibility tree instead: has the control's state actually
// changed? That is precisely what 4.1.2 requires, and it is deterministic. The
// spontaneous announcement is still recorded in the sweep log as evidence.
async function probeDisclosure(phrase, { interaction }) {
  try {
    const before = ((await withTimeout(nvda.spokenPhraseLog(), QUERY_TIMEOUT_MS, "disclosure")) || []).length;
    await withTimeout(nvda.act(), ACT_TIMEOUT_MS, "disclosure"); // Enter on the control under the cursor
    // Wait for what was announced, rather than 1.2s regardless. Same reasoning as the other activation
    // probes: a fixed sleep is too long when the page answers immediately and too short in the tail,
    // and here the tail is what matters -- this is the probe whose timeout got recorded as silence.
    const log = await waitForAnnouncement(before, "disclosure");
    const announced = log.slice(before).map((s) => String(s).trim()).filter(Boolean).join(" | ");
    const after = await reportFocusedControlWithRetry(interaction);
    interaction.sweepLog.push(
      `disclosure ${JSON.stringify(phrase.slice(0, 40))} announced=${JSON.stringify(announced)} state=${JSON.stringify(after)}`
    );
    interaction.stateChanges.push({ control: phrase, after });
  } catch (e) {
    // **A failed measurement is not silence, and must never be recorded as one.**
    //
    // Measured on disclosure-state-silent/good over 20 captures: 19 recorded the state change and 1
    // recorded nothing, because `reportFocus timed out after 6000ms` threw and this catch dropped the
    // entry. An empty `stateChanges` is precisely the signature of the BAD variant -- a disclosure that
    // never announces its state -- so 1 in 20 captures of a CORRECTLY implemented page was
    // indistinguishable from a broken one. That does not add noise, it inverts the finding, and it
    // would teach a judge that a conformant page fails 4.1.2.
    //
    // The entry is still recorded, carrying the error instead of a state. Downstream can then tell
    // "we did not measure" from "there was nothing to hear" -- and `check-signals` sees a probe that
    // errored rather than a page that was silent.
    interaction.sweepLog.push(`disclosure ERROR ${errMsg(e)}`);
    interaction.stateChanges.push({ control: phrase, after: null, error: errMsg(e) });
  }
}

/**
 * Re-read the focused control, retrying a timeout.
 *
 * This is a pure read of the accessibility tree -- no side effects on the page -- so retrying is safe,
 * and a timeout here is the difference between recording a state change and recording nothing at all.
 * Measured failure rate before this: 1 in 20.
 */
async function reportFocusedControlWithRetry(interaction, attempts = 3) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await reportFocusedControl();
    } catch (e) {
      if (attempt >= attempts) throw e;
      interaction.sweepLog.push(`disclosure reportFocus retry ${attempt}: ${errMsg(e)}`);
      await sleep(STATE_POLL_MS);
    }
  }
}

// Ask NVDA to re-announce the focused control, and return that announcement — which
// carries the control's CURRENT state ("... button, focused, expanded").
async function reportFocusedControl() {
  await withTimeout(
    nvda.perform(nvda.keyboardCommands.reportCurrentFocus), NAV_TIMEOUT_MS, "reportFocus"
  );
  // Read as soon as there is something to read, rather than 1.2s later regardless.
  //
  // `nvda.perform` already resolves event-driven: guidepup's enqueueAndTap waits for a quiet period on
  // the speech channel before returning (SPEAK_DEBOUNCE_TIMEOUT, 1000ms in NVDAClient.js). Sleeping a
  // further 1.2s on top of that was waiting twice for the same thing, on the hottest path in the
  // disclosure probe.
  //
  // An empty phrase is still possible for a beat, so this polls rather than assuming -- with a
  // deadline, because a control that announces nothing must remain an observable outcome rather than
  // becoming a hang.
  const deadline = Date.now() + STATE_WAIT_MS;
  for (;;) {
    const phrase = ((await withTimeout(nvda.lastSpokenPhrase(), QUERY_TIMEOUT_MS, "reportFocus")) || "").trim();
    if (phrase || Date.now() >= deadline) return phrase;
    await sleep(STATE_POLL_MS);
  }
}

// Activate the control under the cursor and capture EVERY phrase announced
// afterwards, not just the last one: a live-region status (4.1.3) can be followed
// by a focus move or document re-announce that overwrites lastSpokenPhrase, so we
// keep the spokenPhraseLog delta. An empty delta means the action conveyed
// nothing to the screen reader.
/**
 * Wait for the announcement an activation produced, rather than guessing how long it takes.
 *
 * Poll until the spoken log grows, then keep polling until it goes quiet, then stop. Fast when the
 * page announces promptly -- which is almost always -- and patient when it does not.
 *
 * The asymmetry is deliberate and is the whole point: a page that announces nothing must still be
 * allowed to announce nothing. So this returns an empty delta only after STATE_WAIT_MS of genuine
 * silence, never because a fixed sleep expired first.
 *
 * @returns {Promise<string[]>} the full spoken log, for the caller to slice from `before`
 */
async function waitForAnnouncement(before, kind) {
  const deadline = Date.now() + STATE_WAIT_MS;
  let log = [];
  while (Date.now() < deadline) {
    log = (await withTimeout(nvda.spokenPhraseLog(), QUERY_TIMEOUT_MS, kind)) || [];
    if (log.length > before) break;
    await sleep(STATE_POLL_MS);
  }
  if (log.length <= before) return log; // genuinely silent -- the finding, not a failure
  // Something was said; let the rest of it arrive before reading the delta.
  let settled = log.length;
  const quietBy = () => Date.now() + STATE_QUIET_MS;
  for (let quiet = quietBy(); Date.now() < quiet && Date.now() < deadline;) {
    await sleep(STATE_POLL_MS);
    log = (await withTimeout(nvda.spokenPhraseLog(), QUERY_TIMEOUT_MS, kind)) || [];
    if (log.length > settled) { settled = log.length; quiet = quietBy(); }
  }
  return log;
}

async function activateAndCaptureDelta(phrase, interaction, kind) {
  try {
    const before = ((await withTimeout(nvda.spokenPhraseLog(), QUERY_TIMEOUT_MS, kind)) || []).length;
    await withTimeout(nvda.act(), ACT_TIMEOUT_MS, kind); // Enter on the control under the cursor
    const log = await waitForAnnouncement(before, kind);
    const after = log.slice(before).map((s) => String(s).trim()).filter(Boolean).join(" | ");
    interaction.sweepLog.push(`${kind} ${JSON.stringify(phrase.slice(0, 40))} -> ${JSON.stringify(after)}`);
    interaction.formChanges.push({ control: phrase, after });
  } catch (e) {
    interaction.sweepLog.push(`${kind} ERROR ${errMsg(e)}`);
  }
}

// Submit the form with no valid input to test error handling. An accessible form
// announces the error (3.3.1) via a status message (4.1.3); an inaccessible one
// shows it visually and the screen reader hears nothing.
async function probeFormSubmit(phrase, { interaction }) {
  // Record whether submitting NAVIGATED, because that changes what the absence of an error means.
  //
  // A form that stays put and says nothing has failed 3.3.1. A form that submits successfully and moves
  // to another page has not — there is no error to announce. Both look identical to a probe that only
  // asks "was anything announced afterwards?", and on a real site the second is the common case:
  // submitting Wikipedia's search navigated away, the post-submit re-read described French Wikipedia, and
  // that was reported as a silent validation error on a form that worked.
  //
  // Every page in this corpus calls `preventDefault()`, which is why this never surfaced until the probe
  // met the open web.
  const before = await currentPageUrl();
  const result = await activateAndCaptureDelta(phrase, interaction, "submit");
  const after = await currentPageUrl();
  if (before && after && before !== after) {
    interaction.navigatedOnSubmit = { from: before, to: after };
  }
  return result;
}

// Activate a non-submit button the task explicitly names (e.g. a filter "Bags"
// for the task "show only bags") and capture what is announced. A page that
// updates results in a live region announces the new state (4.1.3); one that
// updates silently announces nothing.
async function probeTaskButton(phrase, { interaction }) {
  return activateAndCaptureDelta(phrase, interaction, "taskButton");
}

// --- Teardown phase -------------------------------------------------------

// Stop NVDA and close the browser so the next capture starts fresh.
async function stopAndCleanup(diag, browser, { keepScreenReader }) {
  if (!keepScreenReader) await stopScreenReader(diag);
  // Leaving Edge up is the entire point of reuse: closing it here would put the cold start back on
  // every capture. It is still closed on a failed capture (see captureWithNvda's finally) and when the
  // worker shuts down, so a wedged browser is never inherited indefinitely.
  if (REUSE_BROWSER && browser && browser === reusableBrowser) {
    diag.mark("browserKeptAlive", {});
    return;
  }
  await closeBrowser(diag, browser);
}

// Close Edge and do not return until it has actually gone.
//
// The old version asked it to quit and moved on. Because captures run back to back, the
// next one could launch into a browser that was still terminating -- and NVDA then read an
// empty document, producing "blank, blank" with no error. That is the race the host-side
// retry was papering over.
//
// When we own the process this is an event, not a poll: await its "exit". The taskkill is
// the escalation for a browser that ignores the request, and the unowned fallback path.
async function closeBrowser(diag, browser) {
  const exited = browser ? once(browser, "exit") : null;
  try {
    await windowsQuit("msedge.exe");
  } catch (e) {
    diag.mark("browserQuit", { ok: false, error: errMsg(e) });
  }
  if (!exited) {
    spawn("cmd", ["/c", "taskkill", "/im", "msedge.exe", "/f"], { stdio: "ignore" });
    diag.mark("browserClosed", { owned: false });
    return;
  }
  const timedOut = Symbol("timeout");
  const outcome = await Promise.race([exited, sleep(EDGE_EXIT_TIMEOUT_MS, timedOut)]);
  if (outcome === timedOut) {
    browser.kill();
    diag.mark("browserClosed", { owned: true, forced: true });
    return;
  }
  diag.mark("browserClosed", { owned: true, forced: false });
}
