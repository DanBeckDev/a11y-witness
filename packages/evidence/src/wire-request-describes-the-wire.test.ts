/**
 * THE PUBLISHED CaptureRequest MUST NAME EVERY FIELD THE WORKER ACCEPTS.
 *
 * architecture-audit.md §5, item 1: until 2026-09-05 `CaptureRequest` declared `url, task, strategy?` while
 * `server.mjs`'s `POST /capture` accepted 20 fields — every probe flag, `formState`, `probeOrder`,
 * `reuseBrowser`, `browser`, `reuseScreenReader`, `captureId` and `async`. A consumer typing against
 * `@a11y-witness/evidence` could not have known a single one of them existed. This is the sibling of
 * `wire-types-describe-the-wire.test.ts`, same defect, the opposite side of the wire.
 *
 * `strategy` is deliberately EXCLUDED from the comparison below, the same way `meta` was excluded from
 * `Capture`'s subset check on the response side: it is a forward-looking abstraction for a backend that
 * does not exist yet (VoiceOver, Orca), nothing on today's wire reads `opts.strategy`, and the check here
 * runs in one direction only — every field the WIRE accepts must be DECLARED, not the reverse. A type
 * naming more than the one real backend implements is fine; a type naming less than it does is the bug.
 *
 * The fields below are read from `server.mjs` and `capture-pure.mjs` as TEXT, not imported: both are
 * reachable from `capture-core.mjs`, which constructs a `ScreenReader` at module scope and throws on any
 * host without a supported screen reader (`no-win32-imports.test.ts`'s reason for existing at all), so an
 * `evidence` test cannot import them without either poisoning a portable install or inverting the
 * dependency graph (`nvda-worker` already depends on `evidence` for types, never the other way).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { stripComments } from "./source-text.js";
import type { CaptureRequest, CaptureFormState } from "./index.js";

const SERVER_PATH = resolve(process.cwd(), "packages/nvda-worker/src/server.mjs");
const CAPTURE_PURE_PATH = resolve(process.cwd(), "packages/nvda-worker/src/capture-pure.mjs");

/** `PROBE_FLAGS`, straight out of `capture-pure.mjs`'s own `Object.freeze([...])` array literal —
 *  the worker's own copy of the ten opt-in probe names. */
function probeFlagsFromSource(): string[] {
  assert.ok(existsSync(CAPTURE_PURE_PATH), "capture-pure.mjs has moved; update CAPTURE_PURE_PATH");
  const source = stripComments(readFileSync(CAPTURE_PURE_PATH, "utf8"));
  const start = source.indexOf("export const PROBE_FLAGS = Object.freeze([");
  assert.notEqual(start, -1, "PROBE_FLAGS declaration not found — capture-pure.mjs has moved");
  const end = source.indexOf("]);", start);
  assert.notEqual(end, -1, "PROBE_FLAGS's closing ]); not found");
  const body = source.slice(start, end);
  return [...body.matchAll(/"(\w+)"/g)].map((m) => m[1]);
}

/**
 * The literal keys `captureOptions()` assigns directly in its `return { ... }` object — `steps`, `nav`,
 * `task`, `formState`, `probeOrder`, `reuseBrowser`, `browser`, `reuseScreenReader`. Colon-anchored, same
 * technique as `capture-core.mjs`'s typedef extraction: `...probeFlags(parsed)` is a spread, not a
 * `name: value` pair, so it is invisible to this regex and covered separately by `probeFlagsFromSource()`.
 */
function captureOptionsLiteralFields(): string[] {
  assert.ok(existsSync(SERVER_PATH), "server.mjs has moved; update SERVER_PATH");
  const source = stripComments(readFileSync(SERVER_PATH, "utf8"));
  const start = source.indexOf("function captureOptions(");
  assert.notEqual(start, -1, "captureOptions() not found — server.mjs has moved");
  const end = source.indexOf("\nfunction send(", start);
  assert.notEqual(end, -1, "end of captureOptions() not found — server.mjs has moved");
  const body = source.slice(start, end);
  return [...new Set([...body.matchAll(/\b([A-Za-z_$][\w$]*)\??:\s*/g)].map((m) => m[1]))];
}

/** `captureId` and `async` are read at the ROUTE, not inside `captureOptions()` — same for `url`, read as
 *  `parsed.url` a few lines below. Hand-named because they are genuinely outside the function this file
 *  extracts from, not because deriving them is impractical; each is cited by line in the audit table. */
const ROUTE_LEVEL_FIELDS = ["url", "captureId", "async"];

test("the extraction finds every hop, or this test checks nothing", () => {
  const probeFlags = probeFlagsFromSource();
  const literalFields = captureOptionsLiteralFields();
  assert.ok(probeFlags.length >= 8, `found only ${probeFlags.length} PROBE_FLAGS — the scan is broken`);
  assert.ok(literalFields.length >= 6,
    `found only ${literalFields.length} captureOptions() literal fields — the scan is broken`);
});

test("CaptureRequest declares every field server.mjs's POST /capture actually accepts", () => {
  // Compile-time half: naming each field here is what makes an omission a `tsc` error rather than a
  // silent pass, exactly as `Required<CaptureResult>` does on the response side.
  const formState: CaptureFormState = { submit: "", fields: [] };
  const declared: Required<CaptureRequest> = {
    url: "", task: "", strategy: "read-through", steps: 0, nav: "line",
    probeForms: false, probeFocus: false, probeTables: false, probeNavigation: false,
    probeElementsList: false, probeArrows: false, probeTyping: false, probeFocusContext: false,
    probeDialog: false, probeFocusReveal: false,
    formState, probeOrder: "focus-first", reuseBrowser: false, browser: "", reuseScreenReader: false,
    captureId: "", async: false,
  };
  const declaredFields = new Set(Object.keys(declared));

  // Runtime half: every field the real wire accepts must appear above. `strategy` is deliberately not
  // required to appear on the wire side — see the file header — so this checks one direction only.
  const wireFields = [...ROUTE_LEVEL_FIELDS, ...probeFlagsFromSource(), ...captureOptionsLiteralFields()];
  const undeclared = wireFields.filter((field) => !declaredFields.has(field));
  assert.deepEqual(undeclared, [],
    `server.mjs accepts a request field CaptureRequest does not name: ${undeclared.join(", ")}`);
});
