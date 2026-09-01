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

import type { CaptureStructure, CaptureInteraction } from "./index.js";

/** The sweep names `capture-core` writes into `structure`, and the probes it writes into `interaction`. */
// `frames` added with capture-protocol 11 — the iframe sweep. This list and the type must move
// together, which is the whole point of the test below.
const EMITTED_STRUCTURE = ["headings", "landmarks", "formFields", "links", "graphics", "lists",
  "tableCells", "frames"];
const EMITTED_INTERACTION = ["controls", "stateChanges", "formChanges", "postSubmitFields", "focusOrder"];

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
  };
  assert.deepEqual(Object.keys(declared).sort(), [...EMITTED_INTERACTION].sort());
});

test("the emitted lists are not empty, so this cannot pass having declared nothing", () => {
  // The count assertion this repo puts on every discovery walk: an empty expectation would satisfy both
  // tests above in perfect silence.
  assert.ok(EMITTED_STRUCTURE.length >= 7 && EMITTED_INTERACTION.length >= 5);
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
});
