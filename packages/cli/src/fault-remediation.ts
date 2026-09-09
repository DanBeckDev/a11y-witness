/**
 * A stranger meeting `nvda.start failed: NVDA is not supported` learns nothing from the bare message —
 * that knowledge lives in `docs/nvda-worker-runbook.md` and in the heads of whoever has debugged this
 * before. An error a user cannot act on is a support request, and there is nobody to answer it.
 *
 * Every fault code the worker can report over the wire (`packages/nvda-worker/src/capture-faults.mjs`'s
 * `FAULT`) gets an entry here naming three things: WHAT happened, WHAT TO TRY, and WHERE TO LOOK for
 * more. #81 extended this table to a JUDGE-layer fault too — `packages/scorer/python/score.py`'s
 * `ArtifactSchemaMismatch.FAULT`, which reaches this table via `local-judge.ts`'s `scoreCapture` reading
 * a parseable line the Python process prints on stdout, not over HTTP — the shape differs but the reason
 * for having a table at all does not: a caller must not have to parse a message to act on a failure.
 *
 * DUPLICATED, deliberately: `@a11ign/nvda-worker` is not a dependency of this package.
 * `isolation-smoke.mjs` asserts it must not be — the CLI speaks HTTP to a worker, and importing that
 * package once already broke the published bundle (it reaches guidepup, which throws at import wherever
 * there is no screen reader; see `cli.ts`'s own comment on `no-win32-imports.test.ts`'s finding). So the
 * four fault-code STRINGS below are copied rather than imported, and pinned equal to
 * `capture-faults.mjs`'s `FAULT` values by `fault-remediation.test.ts` — which reads that file by its
 * relative SOURCE path, in a TEST only, never as a production import, so the pin cannot be fooled by a
 * stale published `dist` the way a production cross-package import could be.
 *
 * #398 EXTENDED THIS TABLE TO CLIENT-SIDE DOUBTS, NOT ONLY WORKER FAULTS: `wrong-content` and
 * `contained` are `CaptureDoubt`'s two values (`@a11ign/evidence/verify`) — a capture the worker
 * returned as a 200, that this tool nonetheless doubts describes the page. They share this table
 * because a caller meeting either one needs the identical WHAT/TRY/WHERE shape a worker fault gets, not
 * a bare hand-written sentence — `formatDoubtMessage` gives them their own preamble so "This capture may
 * not describe the page" is never confused with "The worker's capture failed", which would misdescribe a
 * successful HTTP response this tool merely doubts the CONTENT of.
 */
export interface FaultRemediation {
  /** What the fault code means, in plain language. */
  readonly what: string;
  /** What a caller of this CLI can actually try — not "read the source". */
  readonly tryThis: string;
  /** Where the deeper reference lives, for whoever operates the worker. */
  readonly whereToLook: string;
}

export const FAULT_REMEDIATION: Record<string, FaultRemediation> = {
  "screen-reader-mute": {
    what: "NVDA on the worker is running and answering keystrokes, but has stopped speaking.",
    tryThis: "The worker already retries this once on a fresh NVDA before reporting it, so a second "
      + "attempt from here is unlikely to help by itself — retry the capture anyway (a cold NVDA start "
      + "clears most cases), and if it keeps happening on a worker you operate, see the runbook.",
    whereToLook: "docs/nvda-worker-runbook.md, \"What degrades is NVDA's speech channel\" — or ask "
      + "whoever operates that worker to read it.",
  },
  "screen-reader-start-failed": {
    what: "NVDA would not start on the worker at all.",
    tryThis: "Retry the capture — this is usually a guest still settling after auto-logon and clears on "
      + "its own. If it persists on a worker you operate, the exact wording matters: \"NVDA is not "
      + "supported\" and \"NVDA not installed\" read almost identically and are different problems.",
    whereToLook: "docs/nvda-worker-runbook.md, \"nvda.start failed: NVDA is not supported\" — or ask "
      + "whoever operates that worker to read it.",
  },
  "page-unreachable": {
    what: "The browser on the worker could not reach the requested page at all.",
    tryThis: "Check the URL loads in an ordinary browser from wherever the WORKER sits, not just from "
      + "this machine — a `localhost` URL only works if the worker itself is local, and a page server "
      + "that stopped running produces exactly this fault.",
    whereToLook: "the URL you passed, and whether the worker can reach it — this is rarely a worker-side "
      + "problem to escalate.",
  },
  "wrong-page": {
    what: "The browser on the worker reached A page, but it was not the one requested.",
    tryThis: "Check for a redirect, a consent/cookie interstitial the site added, or a cached response "
      + "from a page server serving stale content.",
    whereToLook: "the target site's own behaviour for the URL you passed — compare what it does in an "
      + "ordinary browser.",
  },
  "hard-timeout": {
    what: "The capture ran too long and the worker abandoned it before your page was fully read. This "
      + "is the documented failure mode of a heavy page (many images and headings, a form, a consent "
      + "banner) — the same shape docs/try-it.md tells a first reader to point this at.",
    tryThis: "Retrying will not help by itself — the worker already spent its whole budget. If the page "
      + "has a lot of content, try narrowing the task to a smaller flow first (a single form, not a "
      + "whole checkout) to see whether the tool completes at all on that site; if it does, the full "
      + "page may simply need a longer budget than this worker is configured for.",
    whereToLook: "the `reachedPhase` this message names, if one is given — that is how far the capture "
      + "got before it ran out of time, not a guess. docs/nvda-worker-runbook.md if you operate this "
      + "worker and want to raise the timeout.",
  },
  "artifact-schema-mismatch": {
    what: "The shipped scorer weights and the code running them disagree about the evidence format "
      + "(schema version, encoder hash, feature order, feature scale, or feature multipliers). This is a "
      + "known state of the current release, not a problem with your machine or your install.",
    tryThis: "There is nothing to try locally — retrying will not help, because the mismatch is between "
      + "two things this tool ships together and did not this time. Wait for a new release; if none has "
      + "been announced, file an issue naming this fault code.",
    whereToLook: "this is expected while a model migration is in progress — check the project's release "
      + "notes or open issues for a note about it before assuming it is new.",
  },
  // #398: the two `CaptureDoubt` values (`@a11ign/evidence/verify`) -- CLIENT-SIDE judgements about a
  // capture the worker returned successfully, never a worker-reported `fault`. They share this table
  // because a caller meeting either one needs the identical WHAT/TRY/WHERE shape, not a bare sentence --
  // and `formatDoubtMessage` below gives them their own preamble rather than borrowing
  // `formatFaultMessage`'s "The worker's capture failed", which would misdescribe a 200 OK response this
  // tool merely doubts the CONTENT of.
  "wrong-content": {
    what: "After retrying, the capture still does not appear to be about the page you asked for -- most "
      + "likely a stale browser window showing chrome or a previous page rather than the one requested.",
    tryThis: "Check the URL loads correctly in an ordinary browser, and that nothing (a redirect, a "
      + "geofence, a login wall) sends it somewhere else before the page you expect appears.",
    whereToLook: "the target URL's own behaviour -- this is rarely something to fix in this tool.",
  },
  "contained": {
    what: "The screen reader reached the right page (the title matches) but read almost none of it -- "
      + "the documented shape of opening on a cookie or consent overlay that Escape did not dismiss. "
      + "Reporting no findings rather than describing the dialog is deliberate: an overlay's own text is "
      + "not a finding about your page.",
    tryThis: "Run again against a URL that skips the banner -- a staging build, or a page reached with "
      + "the cookie already set -- or tell us: an overlay Escape could not dismiss is a defect in this "
      + "tool, not in your page.",
    whereToLook: "docs/try-it.md, \"The consent banner is the real risk\" -- the same guidance a first "
      + "reader is sent before they run this at all.",
  },
};

/** The remediation for a fault code, or `undefined` for one this file does not yet know about. */
export function remediationFor(fault: string): FaultRemediation | undefined {
  return FAULT_REMEDIATION[fault];
}

/**
 * The WHAT/TRY/WHERE tail shared by every message this file formats, regardless of the sentence in front
 * of it — split out so `formatFaultMessage` (a worker-reported failure) and `formatDoubtMessage` (a
 * client-side doubt about an otherwise-successful capture, #398) can each supply their own framing
 * without duplicating the "no remediation recorded yet" fallback or the field-by-field formatting.
 */
function remediationTail(code: string): string {
  const remediation = remediationFor(code);
  if (!remediation) {
    return `\n  No remediation is recorded for this code yet — please file an issue naming it.`;
  }
  return `\n  What happened: ${remediation.what}\n  Try: ${remediation.tryThis}\n`
    + `  See: ${remediation.whereToLook}`;
}

/**
 * The full message a person sees for a worker-reported fault — never the bare `(fault: <code>)`
 * `describeWorkerError` used to stop at. A fault this file has not been taught yet still says so
 * explicitly, rather than silently falling back to nothing: "no remediation recorded" is itself
 * information, and a NEW fault shipping with no entry here is exactly the gap this file exists to close.
 */
export function formatFaultMessage(fault: string, message: string | undefined,
  /**
   * How far a PARTIAL capture got before the fault, when the worker reported one — issue #336. "We ran
   * out of time after N marks" and "we could not read your page at all" are different findings, and
   * only one of them invites a retry; bundled into one object rather than two more parameters, per this
   * repo's own rule against growing positional argument lists.
   */
  progress?: { reachedPhase?: string; markCount?: number }): string {
  const base = `The worker's capture failed: ${message ?? "no message given"} (fault: ${fault}).`;
  const progressLine = progress?.reachedPhase
    ? `\n  Got as far as: "${progress.reachedPhase}"`
      + (typeof progress.markCount === "number"
        ? ` (${progress.markCount} progress mark(s) recorded before stopping)` : "")
    : "";
  return `${base}${progressLine}${remediationTail(fault)}`;
}

/**
 * The full message for a `CaptureDoubt` (`@a11ign/evidence/verify`) — a capture the worker returned as a
 * SUCCESS, that this tool nonetheless doubts describes the page. #398: printed only after the whole
 * capture finished, which is why the reporting path matters as much as the wording does — see this row's
 * own issue for the timing half. Deliberately its own function rather than a `formatFaultMessage` call:
 * "The worker's capture failed" would misdescribe a 200 OK response whose CONTENT is merely suspect.
 */
export function formatDoubtMessage(doubt: string, detail: string): string {
  return `This capture may not describe the page: ${detail} (${doubt}).${remediationTail(doubt)}`;
}

/**
 * The early, IN-FLIGHT half of #398's "contained" doubt — #426. `formatDoubtMessage` above is a VERDICT
 * printed once the whole capture has finished; this is an observation from partway through it, and the
 * wording says so rather than reading like the final answer. "A capture is not an instant" (this
 * project's own rule, `verify.ts`'s consent-overlay incident): the overlay was present for some probes
 * and gone for others on a real page, so a notice that does not say WHEN it looked inherits that
 * ambiguity instead of resolving it.
 *
 * Never a rejection, and cannot become one from here — `capture-client.mjs`'s `onProgress` return value
 * is unused, so nothing this prints can touch whether the capture continues. It fires once per capture
 * (`cli.ts`'s `captureViaWorker` tracks that) precisely so five minutes of silence does not read as five
 * minutes of the SAME warning repeating.
 */
export function formatEarlyContainmentNotice(observedAtMs: number): string {
  const seconds = (observedAtMs / 1000).toFixed(1);
  return `NOTICE (as of ${seconds}s into this capture — not the final result): the screen reader had `
    + `reached almost none of this page's headings at that point, the shape a consent overlay Escape `
    + `could not dismiss leaves. The capture is still running; this may still clear.`
    + `${remediationTail("contained")}`;
}
