// Which capture faults can the worker clear by itself, rather than failing the caller's case?
//
// Both faults below are the same underlying condition: a guest that has not finished settling, or an
// NVDA whose speech channel has died. capture-core already retries one of them for this reason --
// `startFreshWithRetry` retries `nvda.start`, reasoning that "one capture that takes eight seconds
// longer beats a run that loses its first case per worker".
//
// The MUTE case was left out of that bargain, so the first capture after a boot failed, and so did
// roughly every fifth capture after it: measured over 30 back-to-back captures, NVDA went mute five
// times (lifespans 6, 5, 5, 9, 1). Confirmed causal -- with `reuseScreenReader:false`, 8 of 8 captures
// ran clean. Before this retry existed, an identical 30-capture run died at capture 19.
//
// Why retrying here is not the loop that broke the pool: that loop restarted NVDA on a TIMER, while
// idle, with nothing wrong, at an unbounded rate, and NVDA answered by putting a modal dialog on the
// guest desktop. This restarts it at most ONCE, during a capture, only after that capture has already
// failed -- work the worker was going to do on the next request anyway. The only thing that changes is
// who pays for it.
//
// The hard timeout is deliberately absent. It has already spent its full budget, so retrying locally
// would double a request the caller has likely abandoned; the run classifies it transient and reissues
// it, which is the right place for a fault that expensive.
import { FAULT, faultCode } from "./capture-faults.mjs";

/** Faults a fresh screen reader fixes. Keyed on FAULT codes, never on message text — see capture-faults.mjs. */
const RECOVERABLE = new Set([FAULT.SCREEN_READER_MUTE, FAULT.SCREEN_READER_START_FAILED]);

/**
 * @param {unknown} error
 * @returns {boolean}
 */
export function isLocallyRecoverable(error) {
  return RECOVERABLE.has(faultCode(error));
}
