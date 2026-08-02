/**
 * Keep one Edge alive across captures and re-point it, instead of cold-starting Chromium every time.
 *
 * ## Why
 *
 * `windowsActivate` — which is really "wait for Edge to exist and take focus" — is the largest single
 * phase of a capture, and it is Chromium's cold start. Measured on this fleet:
 *
 *   one guest running     windowsActivate  8.9 s of a 12.6 s capture
 *   three guests running  windowsActivate ~15.2 s on ALL THREE, uniformly
 *
 * That uniform inflation is the signature of a SHARED resource, and it is not RAM: guest residency is
 * 0.9-1.6 GB and cold pages compress fine. Three guests cold-starting Chromium contend on one SSD. The
 * consequence measured end to end is that the pool does not scale at all — 1 worker gives 0.079
 * captures/s, 2 give 0.076, 3 give 0.072. **Adding workers made throughput worse.** Removing the cold
 * start attacks the per-capture cost and the contention that caps the pool, in one change.
 *
 * ## Why the DevTools Protocol rather than reusing the window
 *
 * Captures run `--app`, which is a chromeless window with no address bar, so there is no UI route to
 * navigate an existing window — and abandoning `--app` resurfaces the browser chrome that NVDA used to
 * wander into (the "Welcome to Microsoft Edge" phantoms). Opening a second `--app` window per capture
 * and closing it again would work, but closing the LAST window exits the process, so it needs a keeper
 * window and Alt+F4 aimed at the right target. That is window-focus juggling, which this project's own
 * notes call the #1 flakiness fix — not somewhere to be clever.
 *
 * `Page.navigate` re-points the window that already exists. No new window, no focus transition, no
 * process start.
 *
 * ## Off by default
 *
 * A reused browser is a different evidence-production environment from a fresh one: a persistent
 * renderer keeps session state, and a page loaded by navigation may announce differently from one
 * loaded into a new window. That is exactly what `npm run evidence:check` exists to answer, so this is
 * opt-in via `A11Y_REUSE_BROWSER=1` until it has answered SAME on a real sample.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

/** Chromium's DevTools endpoint. Loopback only — it is never reachable off the guest. */
export const CDP_PORT = 9222;
const CDP_HOST = "127.0.0.1";

const CDP_READY_TIMEOUT_MS = 20_000;
const CDP_POLL_MS = 200;
const NAVIGATE_TIMEOUT_MS = 30_000;

const endpoint = (path) => `http://${CDP_HOST}:${CDP_PORT}${path}`;

/**
 * Arguments for a reusable Edge.
 *
 * Identical to the one-shot launch except for the debugging port, deliberately: every other flag is
 * load-bearing for what NVDA hears, and changing any of them would confound an evidence comparison.
 *
 * @param {string} url
 * @param {string[]} baseArgs the flags the one-shot launch already uses
 */
export function reusableArgs(url, baseArgs) {
  return [...baseArgs, `--remote-debugging-port=${CDP_PORT}`];
}

/** Is a reusable browser answering on the DevTools port? */
export async function browserAlive() {
  try {
    const response = await fetch(endpoint("/json/version"), { signal: AbortSignal.timeout(2_000) });
    return response.ok;
  } catch {
    return false; // not running, or not listening yet — both mean "launch one"
  }
}

/**
 * The page target to drive.
 *
 * Pure so the selection rule is testable. Chromium lists more than pages — service workers, extension
 * backgrounds, the DevTools UI itself — and picking the wrong one produces a navigate that silently
 * does nothing to the visible window.
 *
 * @param {Array<{type?: string, url?: string, webSocketDebuggerUrl?: string}>} targets
 */
export function choosePageTarget(targets) {
  return (targets ?? []).find((t) =>
    t.type === "page" && typeof t.webSocketDebuggerUrl === "string" && !t.url?.startsWith("devtools://")
  ) ?? null;
}

async function pageTarget() {
  const response = await fetch(endpoint("/json/list"), { signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error(`CDP /json/list returned HTTP ${response.status}`);
  const target = choosePageTarget(await response.json());
  if (!target) throw new Error("CDP listed no page target to navigate");
  return target;
}

/**
 * Point the existing window at a new URL and wait for the load event.
 *
 * Waiting for `Page.loadEventFired` rather than returning on the navigate acknowledgement matters: the
 * caller's next move is to ask NVDA to read the document, and reading a page that has not finished
 * loading is precisely the "blank, blank" transcript this pipeline already learned to avoid.
 */
export async function navigateExisting(url) {
  const target = await pageTarget();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  try {
    await once(socket, "open", CDP_READY_TIMEOUT_MS);
    const loaded = waitForMethod(socket, "Page.loadEventFired", NAVIGATE_TIMEOUT_MS);
    socket.send(JSON.stringify({ id: 1, method: "Page.enable" }));
    socket.send(JSON.stringify({ id: 2, method: "Page.navigate", params: { url } }));
    await loaded;
  } finally {
    try {
      socket.close();
    } catch (error) {
      // A socket that will not close is not a failed capture; the navigate already happened.
      void error;
    }
  }
}

function once(socket, event, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`CDP: no '${event}' within ${timeoutMs}ms`)), timeoutMs);
    socket.addEventListener(event, () => { clearTimeout(timer); resolve(); }, { once: true });
    socket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("CDP socket error")); }, { once: true });
  });
}

function waitForMethod(socket, method, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`CDP: no ${method} within ${timeoutMs}ms`)), timeoutMs);
    socket.addEventListener("message", (event) => {
      let parsed;
      try {
        parsed = JSON.parse(String(event.data));
      } catch {
        return; // not our frame
      }
      if (parsed.method === method) { clearTimeout(timer); resolve(); }
    });
  });
}

/**
 * Launch a reusable Edge and wait until its DevTools port answers.
 *
 * @param {{ exe: string, args: string[], onEvent?: (e: object) => void }} options
 */
export async function launchReusable({ exe, args, onEvent = () => {} }) {
  if (!existsSync(exe)) throw new Error(`Edge not found at ${exe}`);
  const child = spawn(exe, args, { stdio: "ignore" });
  child.on("error", (error) => onEvent({ type: "browserError", error: error.message }));
  const deadline = Date.now() + CDP_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await browserAlive()) {
      onEvent({ type: "browserReady", pid: child.pid });
      return child;
    }
    await new Promise((r) => setTimeout(r, CDP_POLL_MS));
  }
  throw new Error(`Edge did not open its DevTools port within ${CDP_READY_TIMEOUT_MS}ms`);
}
