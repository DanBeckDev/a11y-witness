// Should this case be captured again, or is the evidence on disk still valid?
//
// A full dataset run is 1,061 pairs and ~1.5 h across three workers, and almost all of it is
// usually unchanged. `--resume` already skipped work, but on the weakest possible test: "both
// files exist and have a non-empty transcript". That reuses evidence after the PAGE changed, after
// the capture options changed, and after NVDA or Edge was updated underneath it — which is exactly
// how a dataset quietly stops describing the thing it claims to describe.
//
// So the decision is keyed on everything that can change what NVDA says:
//
//   the page files        a byte of markup changes what is announced
//   capture options       the same page read with different probes yields different evidence
//   protocol version      our own meaning-of-the-output version (see CAPTURE_PROTOCOL_VERSION)
//   NVDA + Edge versions  NVDA's wording varies by release; capture-core says so in comments
//   provisioning revision NVDA config, Edge policy and ForegroundLockTimeout all shape the output
//
// Deliberately NOT keyed on the worker's code hash. That hash changes when a comment changes, and
// invalidating 1,061 pairs over a reworded comment is how a cache becomes something people turn
// off. The hash is still recorded, and a hit whose hash differs is reported rather than hidden.
//
// The key lives inside each capture JSON, not in a side index: an index can drift from the files
// it describes, and this cache exists to stop us trusting stale things.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const KEY_LENGTH = 16; // enough to be unique across ~2k cases, short enough to read in a log

/** Stable JSON: object key order must not change the key. */
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, canonical(value[k])]));
  }
  return value;
}

const sha256 = (input) => createHash("sha256").update(input).digest("hex");

/**
 * Hash every file in a case's page directory.
 *
 * The whole directory rather than just good.html/bad.html: there are no asset files today (all
 * 2,122 page files are HTML) but a fixture that gains an image must invalidate its evidence, and
 * a cache that silently ignores new files is worse than no cache.
 */
export function hashPageDir(pageDir) {
  const hash = createHash("sha256");
  for (const name of readdirSync(pageDir).sort()) {
    hash.update(name);
    hash.update(readFileSync(resolve(pageDir, name)));
  }
  return hash.digest("hex").slice(0, KEY_LENGTH);
}

/**
 * The environment fields that change captured evidence, taken from the worker's own /health.
 * Missing values become "unknown", which still keys consistently -- two captures from an
 * unreportable worker match each other and nothing else.
 */
export function environmentKey(environment = {}) {
  return {
    screenReader: `${environment.screenReader ?? "NVDA"}/${environment.screenReaderVersion ?? "unknown"}`,
    browser: `${environment.browser ?? "unknown"}/${environment.browserVersion ?? "unknown"}`,
    captureProtocol: environment.captureProtocol ?? "unknown",
    provisionRevision: environment.provisionRevision ?? "unstamped",
  };
}

/** The identity of a capture: same key means the same evidence should result. */
export function cacheKey({ caseId, pageHash, options, environment }) {
  return sha256(JSON.stringify(canonical({
    caseId,
    pages: pageHash,
    options,
    environment: environmentKey(environment),
  }))).slice(0, KEY_LENGTH);
}

/** Attach the key and the environment that produced this capture, so the next run can compare. */
export function stampProvenance(capture, { key, options, environment, worker = null }) {
  return {
    ...capture,
    provenance: {
      cacheKey: key,
      capturedAt: capture.capturedAt,
      // Which guest produced this. Not part of the key -- workers are meant to be
      // interchangeable, and keying on it would stop the pool sharing evidence -- but without it
      // a slow phase cannot be attributed to a machine after the fact.
      worker,
      options,
      // The code hash is recorded but NOT part of the key -- see the header.
      workerCode: environment?.workerCode ?? "unknown",
      captureProtocol: environment?.captureProtocol ?? "unknown",
      provisionRevision: environment?.provisionRevision ?? "unstamped",
    },
  };
}

function readCapture(captureRoot, caseId, variant) {
  try {
    return JSON.parse(readFileSync(resolve(captureRoot, `${caseId}.${variant}.json`), "utf8"));
  } catch {
    // Absent or unreadable both mean "no usable evidence", and the caller only needs that.
    return null;
  }
}

const isUsable = (capture) =>
  capture?.screenReader === "NVDA" && Array.isArray(capture.transcript) && capture.transcript.length > 0;

/**
 * Reuse the pair on disk, or recapture it?
 *
 * All-or-nothing across both variants, never one of them. A pair is only comparable if both halves
 * came from the same screen reader on the same machine (see captureAcrossPool), so reusing a cached
 * `good` beside a freshly captured `bad` would compare two NVDA instances and call the difference
 * evidence.
 *
 * @returns {{reuse: boolean, reason: string, staleCode: string|null}}
 */
export function cacheDecision({ captureRoot, caseId, key }) {
  const captures = ["good", "bad"].map((v) => readCapture(captureRoot, caseId, v));
  if (!captures.every(isUsable)) return { reuse: false, reason: "no usable pair on disk", staleCode: null };

  const keys = captures.map((c) => c.provenance?.cacheKey);
  if (keys.some((k) => !k)) return { reuse: false, reason: "captured before the cache existed", staleCode: null };
  if (!keys.every((k) => k === key)) return { reuse: false, reason: "page, options or environment changed", staleCode: null };

  // Reused evidence produced by different capture code is legitimate -- the protocol version says
  // the meaning is unchanged -- but it is worth saying out loud rather than discovering later.
  const codes = new Set(captures.map((c) => c.provenance?.workerCode));
  const staleCode = codes.size === 1 ? [...codes][0] : [...codes].join(",");
  return { reuse: true, reason: "unchanged", staleCode };
}
