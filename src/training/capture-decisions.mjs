// The decisions a capture run makes: is this capture evidence, is this error worth retrying, and is
// this worker worth keeping.
//
// They live here because they are the riskiest logic in the pipeline and they were the least
// testable. Every one of them has been wrong at least once in production:
//
//   - a rejection reason gated on the wrong thing and failed 44 cases in a live run
//   - a recoverable error was classified fatal and lost a case the next capture would have got
//   - eviction blamed the cases a broken worker touched instead of the worker
//
// They are pure functions of their inputs, so they can be tested without a worker, a VM or a
// network — which is the whole point of moving them out of a 650-line orchestrator.
import { captureHasSubstance, captureIsSelfConsistent, captureMentionsTitle } from "../capture/verify.js";

/** How much of a rejected transcript to quote back. Enough to recognise the wrong page, not a dump. */
const REJECTED_PREVIEW_PHRASES = 2;

/** A worker that fails this many in a row is not having bad luck. */
export const MAX_CONSECUTIVE_WORKER_FAILURES = 3;

/**
 * Recoverable, or the end of this case?
 *
 * Everything here heals on its own, which is why waiting beats failing. The connection errors are
 * here because the first full dataset run lost its last four cases to one guest bugchecking — it came
 * back by itself, but the run had already recorded four permanent failures.
 *
 * `running but not speaking` and `hard timeout` are the subtle ones: both make the worker STOP its
 * screen reader, so the next capture cold-starts a fresh one. They are self-healing by construction,
 * and classifying them fatal cost a case in the run that proved it.
 */
const TRANSIENT = new RegExp([
  "fetch failed", "ECONNREFUSED", "ECONNRESET", "socket hang up", "timed out", "aborted",
  "HTTP 429.*capture is already in progress",
  "running but not speaking",
  "hard timeout",
].join("|"), "i");

/**
 * Faults the WORKER named for us, which never need matching against prose.
 *
 * Both self-heal: the worker stops NVDA on any failed capture, so the next attempt cold-starts a clean
 * one. The worker now retries these itself before answering, so seeing one here means even its retry
 * did not clear it — still worth reissuing the case rather than recording a permanent failure.
 */
const TRANSIENT_FAULTS = new Set(["screen-reader-mute", "screen-reader-start-failed"]);

export function isTransient(error) {
  // Prefer the code. The regex below is the fallback for older workers and for host-side failures
  // (a dropped socket has no fault code), but a message is prose and prose gets reworded — see
  // src/capture/nvda/capture-faults.mjs for what that cost.
  if (TRANSIENT_FAULTS.has(error?.code)) return true;
  return TRANSIENT.test(String(error?.message ?? error ?? ""));
}

/** Is this capture usable as evidence? */
export function isEvidence(capture, title) {
  return captureMentionsTitle(capture, title) &&
    captureHasSubstance(capture, title) &&
    captureIsSelfConsistent(capture);
}

/**
 * Why this capture is not evidence.
 *
 * Three faults with three different fixes, so they must not collapse into one message: the wrong page
 * was read, the page was not read at all, or the capture contradicts itself. The reason is what a
 * human acts on, so it is the thing worth testing.
 *
 * Returns null when the capture IS evidence — asking why a good capture failed is a caller bug.
 */
export function rejectionReason(capture, { title, url }) {
  if (isEvidence(capture, title)) return null;
  if (!captureIsSelfConsistent(capture)) {
    return `the capture contradicts itself at ${url}: the read-through announced a heading but the ` +
      `heading sweep found none (${capture.transcript.length} phrase(s)) — the page was not traversed`;
  }
  if (!captureHasSubstance(capture, title)) {
    return `the screen reader announced nothing beyond the page title at ${url} ` +
      `(${capture.transcript.length} phrase(s), no structure) — the page was not read`;
  }
  const preview = capture.transcript.slice(0, REJECTED_PREVIEW_PHRASES)
    .map((phrase) => JSON.stringify(phrase)).join(", ");
  return `the screen reader did not read "${title}" at ${url} (announced: ${preview || "nothing"})`;
}

/**
 * Drop this worker from the pool?
 *
 * Never the last one standing: with nothing left to hand the work to, recording the failures is more
 * useful than abandoning the run silently.
 *
 * @param {{ consecutiveFailures: number, poolSize: number, evictedCount: number }} state
 */
export function shouldEvictWorker({ consecutiveFailures, poolSize, evictedCount }) {
  const remaining = poolSize - evictedCount;
  return consecutiveFailures >= MAX_CONSECUTIVE_WORKER_FAILURES && remaining > 1;
}

/**
 * What the run actually did.
 *
 * Cached cases are SKIPPED, not captured — counting them as captured reports worker time that was
 * never spent, which is the one number the cache exists to change.
 *
 * @param {{ total: number, failures: number, skipped: number, cached: number,
 *           poolSize: number, evicted?: string[] }} counts
 * @returns {string}
 */
export function runOutcome({ total, failures, skipped, cached, poolSize, evicted = [] }) {
  const captured = total - failures - skipped;
  // "across N workers" hangs off the case count without a comma, because that is how it reads aloud:
  // "of 25 cases across 3 workers". The evicted clause is a separate thought and keeps its comma.
  const scope = poolSize > 1 ? `of ${total} cases across ${poolSize} workers` : `of ${total} cases`;
  const parts = [
    `${captured} captured`,
    `${failures} failed`,
    `${skipped} skipped${cached ? ` (${cached} cached)` : ""}`,
    scope,
  ];
  if (evicted.length) parts.push(`${evicted.length} evicted (${evicted.join(", ")})`);
  return parts.join(", ");
}
