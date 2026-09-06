/**
 * THE PUBLISHED WIRE TYPES MUST DESCRIBE WHAT A CAPTURE ACTUALLY CARRIES.
 *
 * `@a11y-witness/evidence`'s `.` subpath is types only — it IS the published description of a capture, and
 * `public-api.test.ts` pins that the subpath resolves. Until 2026-08-29 `CaptureStructure` declared three
 * fields (`headings`, `landmarks`, `formFields`) while every real capture carries SEVEN, and
 * `CaptureInteraction` omitted `focusOrder` entirely. A consumer typing against them would have concluded
 * a capture exposes no links, graphics, lists or table cells.
 *
 * Nothing in this repo used those types, which is why it went unnoticed — they are the API for somebody
 * else. That makes it worse rather than better: the one audience who cannot check the claim is the one it
 * is written for.
 *
 * TWO CHECKS, AND THEY LIVE IN DIFFERENT PLACES. The type conformance below is `tsc`'s — `npx tsx --test`
 * strips types without checking them, so an undeclared field makes the object literal a compile error and
 * the test runner reports nothing at all. Verified by mutation: deleting `links?` from `CaptureStructure`
 * leaves this file green under tsx and fails `tsc --noEmit` with TS2353, which the pre-push hook and CI
 * both run. The first version of this file claimed the runtime lines "stop it being vacuous"; they did not,
 * and that is the defect these tests exist to catch, committed while quoting the rule against it.
 *
 * So the runtime half does the job tsc cannot: it grounds the hand-written list against a REAL capture on
 * disk, because a list I typed out is a claim about the wire and not the wire itself.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { CaptureStructure, CaptureInteraction, CaptureResult } from "./index.js";

/** The sweep names `capture-core` writes into `structure`, and the probes it writes into `interaction`. */
// `frames` added with capture-protocol 11 — the iframe sweep. This list and the type must move
// together, which is the whole point of the test below.
const EMITTED_STRUCTURE = ["headings", "landmarks", "formFields", "links", "graphics", "lists",
  "tableCells", "frames"];
// `routeChange`, `navigatedOnSubmit` and `postSubmitNames` added architecture-audit.md §5, item 2: all
// three were on the wire (capture-core.mjs's own `CapturedInteraction` typedef already named them) while
// this published type described a capture as though they did not exist.
const EMITTED_INTERACTION = ["controls", "stateChanges", "formChanges", "postSubmitFields", "focusOrder",
  "routeChange", "navigatedOnSubmit", "postSubmitNames"];
// The RESULT envelope, same reason: `media`, `observed` and `environment` were all on the wire (the first
// two in capture-core.mjs's own `Capture` typedef, the third appended by every `server.mjs` response)
// while this type omitted them, which is what made `cli.ts` cast around `environment` instead of the
// published type describing it.
const EMITTED_RESULT = ["screenReader", "url", "task", "transcript", "structure", "interaction",
  "capturedAt", "diagnostics", "meta", "media", "observed", "environment"];

test("CaptureStructure declares every sweep a capture emits", () => {
  // Compile-time: naming each key proves it is declared. An undeclared key makes this a type error, which
  // IS the assertion — `tsc` is the check, and the runtime lines below only stop it being vacuous.
  const declared: Required<CaptureStructure> = {
    headings: [], landmarks: [], formFields: [], links: [], graphics: [], lists: [], tableCells: [],
    frames: [],
  };
  assert.deepEqual(Object.keys(declared).sort(), [...EMITTED_STRUCTURE].sort(),
    "the published type and the emitted sweeps must be the same set");
});

test("CaptureInteraction declares every probe a capture emits, focusOrder included", () => {
  const declared: Required<CaptureInteraction> = {
    controls: [], stateChanges: [], formChanges: [], postSubmitFields: [], focusOrder: [],
    routeChange: {}, navigatedOnSubmit: { checked: false }, postSubmitNames: [],
  };
  assert.deepEqual(Object.keys(declared).sort(), [...EMITTED_INTERACTION].sort());
});

test("CaptureResult declares every field a capture response carries, environment included", () => {
  const declared: Required<CaptureResult> = {
    screenReader: "", url: "", task: "", transcript: [], structure: { headings: [], landmarks: [], formFields: [] },
    interaction: { controls: [], stateChanges: [], formChanges: [], postSubmitFields: [] },
    capturedAt: "", diagnostics: [], meta: {}, media: null, observed: {},
    environment: {
      measuredAt: "", screenReader: "", screenReaderVersion: "", browser: "", browserVersion: "",
      guidepupVersion: "", screenReaderSettings: "", nodeVersion: "", windowsVersion: "", architecture: "",
      workerCode: "", captureProtocol: 0, provisionRevision: "",
    },
  };
  assert.deepEqual(Object.keys(declared).sort(), [...EMITTED_RESULT].sort());
});

test("the emitted lists are not empty, so this cannot pass having declared nothing", () => {
  // The count assertion this repo puts on every discovery walk: an empty expectation would satisfy both
  // tests above in perfect silence.
  assert.ok(EMITTED_STRUCTURE.length >= 7 && EMITTED_INTERACTION.length >= 5 && EMITTED_RESULT.length >= 10);
});

test("THE EMITTED LISTS MATCH A REAL CAPTURE, not just each other", () => {
  // The runtime half. `EMITTED_STRUCTURE` is a list I typed; a capture on disk is the wire. Without this
  // the two tests above only prove the type agrees with my typing.
  //
  // Skips honestly when `runs/` is absent — CI cannot see the corpus, and a check that reports success
  // having examined nothing is how "verified" comes to mean "unexamined". Same limitation, and same
  // handling, as `verify.corpus.test.ts`.
  const root = resolve(import.meta.dirname, "../../..");
  const dir = resolve(root, "runs/real-page-corpus");
  if (!existsSync(dir)) {
    console.log("    SKIPPED — no runs/ on this machine, so the wire could not be read");
    return;
  }
  const file = readdirSync(dir).find((f) => f.endsWith(".json") && !f.includes("abstention"));
  if (!file) { console.log("    SKIPPED — runs/ present but holds no capture"); return; }
  const raw = JSON.parse(readFileSync(resolve(dir, file), "utf8")) as { capture?: unknown };
  const capture = (raw.capture ?? raw) as { structure?: object; interaction?: object };
  const onTheWire = Object.keys(capture.structure ?? {});
  const undeclared = onTheWire.filter((key) => !EMITTED_STRUCTURE.includes(key));
  assert.deepEqual(undeclared, [],
    `a real capture carries a structure key the published type does not name: ${undeclared.join(", ")}`);

  // Same check, `interaction` and the result envelope itself — a field this specific capture happens not
  // to carry (e.g. `routeChange`, opt-in on `probeNavigation`) is silently fine here, since the assertion
  // is one-directional: nothing on the wire may be UNDECLARED, not that every declared field must appear.
  const undeclaredInteraction = Object.keys(capture.interaction ?? {})
    .filter((key) => !EMITTED_INTERACTION.includes(key));
  assert.deepEqual(undeclaredInteraction, [],
    `a real capture carries an interaction key the published type does not name: ${undeclaredInteraction.join(", ")}`);
  const undeclaredResult = Object.keys(raw.capture ? (raw as { capture: object }).capture : raw)
    .filter((key) => !EMITTED_RESULT.includes(key));
  assert.deepEqual(undeclaredResult, [],
    `a real capture carries a top-level key the published type does not name: ${undeclaredResult.join(", ")}`);
});

/**
 * CAPTURE-CORE.MJS'S OWN JSDoc COPY, PINNED — architecture-audit.md §5, items 1/2, the second of the two
 * permanent exceptions to "one owner". `capture-core.mjs` cannot import `@a11y-witness/evidence`: it is
 * reachable from every PORTABLE_TREE, and its own `CapturedStructure`/`CapturedInteraction`/`Capture`
 * JSDoc typedefs are what `structure-declarations.test.ts` explicitly does not check — that file's own
 * `sources()` scans `.ts` only (`if (!entry.name.endsWith(".ts")) continue`), so a `.mjs` copy drifting
 * from this package's published types was pinned by nothing.
 *
 * So this reads capture-core.mjs as TEXT — the same pattern `probe-consent.test.ts`, `probe-chain.test.ts`
 * and `probe-forwarding.test.ts` already use for files a portable tree cannot import — and extracts each
 * typedef's field names by regex rather than importing the module.
 *
 * TWO DIFFERENT COMPARISONS, because the two typedefs are related to the published types differently:
 *   - `CapturedStructure`/`CapturedInteraction` pass through `server.mjs` UNCHANGED, so they must match
 *     `EMITTED_STRUCTURE`/`EMITTED_INTERACTION` EXACTLY.
 *   - `Capture` is what capture-core.mjs itself RETURNS; `server.mjs` adds `task` and `environment` on
 *     top of it before it reaches a client, so `Capture`'s fields need only be a SUBSET of `EMITTED_RESULT`.
 *     (`meta` is in `EMITTED_RESULT` and not in `Capture` for the same reason — nothing populates it, this
 *     package's own audit found no writer for it, and a subset check does not require it to appear.)
 */
const CAPTURE_CORE_PATH = resolve(process.cwd(), "packages/nvda-worker/src/capture-core.mjs");

/** One `@typedef {{ ... }} Name` LINE's field names, by regex — every one of these three typedefs is
 *  written on a single line (confirmed by reading the file), so this works line-by-line rather than over
 *  the whole file. That matters: a whole-file, non-greedy `{{...}}...Name` match does not anchor to which
 *  `{{` starts the group, so a lazy `[^]*?` searching from the FIRST `@typedef {{` in the file for the
 *  LATER line naming `Capture` swallows every typedef in between as one field list — caught by mutation
 *  (this exact version, first written), not by reasoning about the regex. Field names are matched by a
 *  colon anchor, so a type reference (`Record<string, unknown>`, `AnnouncedChange[]`) is never mistaken
 *  for one: none of those tokens are themselves followed by a colon. */
function typedefFields(source: string, typedefName: string): string[] {
  const nameBoundary = new RegExp(`\\}\\}\\s*${typedefName}\\b`);
  const line = source.split("\n").find((l) => l.includes("@typedef {{") && nameBoundary.test(l));
  assert.ok(line, `@typedef {{ ... }} ${typedefName} not found on one line — capture-core.mjs has moved`);
  const body = (line as string).match(/\{\{([^]*)\}\}/);
  assert.ok(body, `no {{ ... }} body found on the ${typedefName} typedef line`);
  return [...new Set([...(body as RegExpMatchArray)[1].matchAll(/\b([A-Za-z_$][\w$]*)\??:\s*/g)]
    .map((m) => m[1]))].sort();
}

test("capture-core.mjs's own JSDoc typedefs cannot find every hop, or this test checks nothing", () => {
  assert.ok(existsSync(CAPTURE_CORE_PATH), "capture-core.mjs has moved; update CAPTURE_CORE_PATH");
  const source = readFileSync(CAPTURE_CORE_PATH, "utf8");
  const structureFields = typedefFields(source, "CapturedStructure");
  const interactionFields = typedefFields(source, "CapturedInteraction");
  const captureFields = typedefFields(source, "Capture");
  assert.ok(structureFields.length >= 7 && interactionFields.length >= 5 && captureFields.length >= 5,
    "the regex extraction found suspiciously few fields — it is broken, not capture-core.mjs");
});

test("CapturedStructure and CapturedInteraction match the published type EXACTLY", () => {
  const source = readFileSync(CAPTURE_CORE_PATH, "utf8");
  assert.deepEqual(typedefFields(source, "CapturedStructure"), [...EMITTED_STRUCTURE].sort(),
    "capture-core.mjs's CapturedStructure typedef and @a11y-witness/evidence's CaptureStructure have "
    + "drifted — they pass through server.mjs unchanged and must name the same fields");
  assert.deepEqual(typedefFields(source, "CapturedInteraction"), [...EMITTED_INTERACTION].sort(),
    "capture-core.mjs's CapturedInteraction typedef and @a11y-witness/evidence's CaptureInteraction have "
    + "drifted — they pass through server.mjs unchanged and must name the same fields");
});

test("Capture is a SUBSET of the published CaptureResult — server.mjs adds task and environment on top", () => {
  const source = readFileSync(CAPTURE_CORE_PATH, "utf8");
  const captureFields = typedefFields(source, "Capture");
  const undeclared = captureFields.filter((field) => !EMITTED_RESULT.includes(field));
  assert.deepEqual(undeclared, [],
    "capture-core.mjs's Capture typedef carries a field @a11y-witness/evidence's CaptureResult does not "
    + `name: ${undeclared.join(", ")}`);
});
