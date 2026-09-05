/**
 * A PROBE FLAG DECLARED ON `Args` MUST REACH THE WIRE, THROUGH EVERY HAND-NAMED HOP IN BETWEEN.
 *
 * `probeFocusReveal` was declared on `Args`, defaulted to `true` (with an extensive comment explaining
 * why 1.4.13 needs it ON), and forwarded by NOTHING: `captureAndScan`'s destructure and type,
 * `recaptureUntilItReadsThePage`'s type, `runWitness`'s destructure, `CaptureRequest`, and
 * `captureViaWorker`'s own destructure and wire-body construction all named the other four probe flags by
 * hand and omitted this one. The result: the worker's own `probeFlags()` defaults an unsent flag to
 * `false`, so every CLI-driven capture ran with `probeFocusReveal` OFF despite the CLI's own stated intent
 * — silently, because an un-asked probe returns an empty channel, which is what a conformant page's
 * evidence looks like too.
 *
 * `probe-consent.test.ts` could not catch this: it compares `defaultArgs()`'s DECLARED VALUE against the
 * lab's real-page request body, so it correctly confirmed `probeFocusReveal: true` was declared — while
 * missing entirely that the declared value never reached `captureViaWorker`'s own wire body six lines away
 * in the same file. That is exactly the shape `probe-chain.test.ts`'s header names for a different pair of
 * hops: a test written against one boundary cannot see a drop at a boundary it does not cross.
 *
 * So this walks every hand-named hop BETWEEN `Args` and the wire, source-level (this file has no real
 * worker to capture against in CI, and the hops that matter here are internal parameter lists, not
 * behaviour a mock could exercise more honestly than reading the lists themselves).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { stripComments } from "@a11y-witness/evidence/source-text";

const SOURCE = stripComments(readFileSync(resolve(process.cwd(), "packages/cli/src/cli.ts"), "utf8"));

/** The span of source between two markers, so each hop is checked in isolation rather than file-wide —
 *  file-wide would pass the moment ANY line anywhere mentions the flag, which proves nothing about whether
 *  THIS hop forwards it. */
function span(startMarker: string, endMarker: string): string {
  const start = SOURCE.indexOf(startMarker);
  assert.notEqual(start, -1, `marker not found, cli.ts has moved: ${JSON.stringify(startMarker)}`);
  const end = SOURCE.indexOf(endMarker, start);
  assert.notEqual(end, -1, `end marker not found, cli.ts has moved: ${JSON.stringify(endMarker)}`);
  assert.ok(end > start, "end marker precedes start marker — the hops have been reordered");
  return SOURCE.slice(start, end);
}

/** Every `probe*` flag `Args` declares, derived rather than listed — a hand-kept list here would be the
 *  exact defect this file exists to stop duplicating. */
function declaredProbeFlags(): string[] {
  const argsBlock = span("interface Args {", "\nfunction parsedAfterRun");
  return [...new Set([...argsBlock.matchAll(/\b(probe[A-Z]\w*)\s*:\s*boolean/g)].map((m) => m[1]))].sort();
}

const HOPS: Record<string, [string, string]> = {
  "recaptureUntilItReadsThePage's options type":
    ["async function recaptureUntilItReadsThePage(", "async function captureAndScan("],
  "captureAndScan's param type and its two forwarding calls":
    ["async function captureAndScan(", "function reportOnTheCapture("],
  "runWitness's destructure and its captureAndScan call":
    ["async function runWitness(", "function printJson("],
  "the CaptureRequest interface": ["export interface CaptureRequest {", "interface FormStateRequest {"],
  "captureViaWorker's own destructure":
    ["export async function captureViaWorker(", "): Promise<CaptureResponse> {"],
  // NARROWED to the `body: {...}` object literal specifically, not the whole function — the destructure
  // three lines above it also mentions every flag, so checking the whole function would pass even with a
  // flag missing from the one place that actually reaches the wire. This exact gap is how the first
  // version of this test passed against the bug it exists to catch.
  "captureViaWorker's wire body": ["body: {", "timeoutMs: CAPTURE_CLIENT_TIMEOUT_MS"],
};

test("this file can still find every hop, or it is checking nothing", () => {
  const flags = declaredProbeFlags();
  assert.ok(flags.length >= 4, `found only ${flags.length} declared probe flags — the scan is broken, not `
    + "the code clean");
  assert.ok(Object.keys(HOPS).length >= 5, "a hop marker pair is missing — this test examines fewer hops "
    + "than it claims to");
});

test("every declared probe flag reaches every hop between Args and the wire", () => {
  const flags = declaredProbeFlags();
  const missing: string[] = [];
  for (const [hopName, [startMarker, endMarker]] of Object.entries(HOPS)) {
    const text = span(startMarker, endMarker);
    for (const flag of flags) {
      if (!new RegExp(`\\b${flag}\\b`).test(text)) missing.push(`${hopName}: missing ${flag}`);
    }
  }
  assert.deepEqual(missing, [],
    "a probe flag Args declares does not reach one of the hand-named hops below it, so it is silently "
    + "dropped between the CLI's own defaults and the request the worker sees:\n  " + missing.join("\n  "));
});
