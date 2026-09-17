/**
 * #1637: nothing pinned the Action guide's `result-json` field table to the CLI's JSON printer -- a field
 * added to or removed from `printJson`'s output turned no test red, and the guide could go stale silently.
 *
 * This drives the REAL printer with a REAL recorded result (the rehearsal-3 fixture) and compares the
 * top-level keys it actually emits against the guide's table, read by HEADING rather than by line number,
 * as sets in both directions. Reading the printer's SOURCE with a regex was rejected: `printJson`'s body is
 * full of comments that themselves name fields in backticks (`` `verdict.runtime` ``, `` `structure` ``,
 * `` `interaction` ``, ...), which is exactly the comment-contamination `stripComments` was written to stop
 * (see its own doc comment) -- driving the function for real sidesteps that class of bug entirely.
 *
 * NESTED fields (under `verdict`, `outcomes`, ...) are OUT OF SCOPE, stated rather than silently skipped:
 * `verdict.findings` and `verdict.novelty` both collapse to the top-level key `verdict` on both sides of the
 * comparison, and this file makes no claim about what is under it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { printJson, type CaptureResponse } from "../cli.js";

const FIXTURE = new URL("../fixtures/rehearsal3-34774183433-a11ign-result.json", import.meta.url);
const GUIDE = new URL("../../../../docs/github-action.md", import.meta.url);

// The only top-level key `printJson` emits CONDITIONALLY (a spread, present only when the capture is
// unverified). Stated by hand, per the row's own done-when: nothing here infers "conditional" from prose.
const CONDITIONAL_KEYS = new Set(["captureUnverifiedReason"]);

type FixtureResult = {
  url: string; task: string; screenReader: string; transcript: string[];
  structure: unknown; interaction: unknown; environment: unknown;
  verdict: Parameters<typeof printJson>[0]["verdict"];
  ruleBased: Parameters<typeof printJson>[0]["ruleFindings"];
  captureVerified: boolean;
  conformance: Parameters<typeof printJson>[0]["conformance"];
  outcomes: Parameters<typeof printJson>[0]["outcomes"];
  leftSite: Parameters<typeof printJson>[0]["leftSite"];
  artifactPath: string | null;
};

const fixture = (): FixtureResult => JSON.parse(readFileSync(FIXTURE, "utf8"));

/** The capture half of the fixture: exactly the fields `cli.ts` itself reads off a `CaptureResponse`. */
function captureOf(result: FixtureResult): CaptureResponse {
  return {
    url: result.url, screenReader: result.screenReader, transcript: result.transcript,
    structure: result.structure, interaction: result.interaction, environment: result.environment,
  } as CaptureResponse;
}

/** Calls the real printer over the real fixture and returns the top-level keys of what it wrote to stdout. */
function emittedKeys(over: { unverifiedReason?: "wrong-content"; captureVerified?: boolean } = {}): Set<string> {
  const result = fixture();
  const lines: unknown[] = [];
  const realLog = console.log;
  console.log = ((line: unknown) => { lines.push(line); }) as typeof console.log;
  try {
    printJson({
      url: result.url, task: result.task, cap: captureOf(result), verdict: result.verdict,
      ruleFindings: result.ruleBased, captureVerified: over.captureVerified ?? result.captureVerified,
      unverifiedReason: over.unverifiedReason, conformance: result.conformance, outcomes: result.outcomes,
      leftSite: result.leftSite, artifactPath: result.artifactPath,
    });
  } finally {
    console.log = realLog;
  }
  assert.equal(lines.length, 1, "printJson must log exactly one JSON line");
  return new Set(Object.keys(JSON.parse(lines[0] as string)));
}

/** The Action guide's `result-json` field table, read by its heading text rather than by line number. */
function documentedTopLevelFields(): Set<string> {
  const lines = readFileSync(GUIDE, "utf8").split("\n");
  const headingAt = lines.findIndex((line) => line.trim() === "## What `result-json` contains");
  assert.ok(headingAt >= 0, "the guide's result-json heading was reworded or moved; update this test's anchor");
  const afterHeading = lines.slice(headingAt + 1);
  const tableAt = afterHeading.findIndex((line) => line.startsWith("|"));
  assert.ok(tableAt >= 0, "no table found under the result-json heading");

  const fields = new Set<string>();
  for (const line of afterHeading.slice(tableAt)) {
    if (!line.startsWith("|")) break; // the table ends where the next non-table line starts
    if (/^\|\s*-+\s*\|/.test(line)) continue; // the header's own separator row
    const fieldCell = line.split("|")[1] ?? "";
    if (fieldCell.trim() === "Field") continue; // the header row itself
    for (const [, field] of fieldCell.matchAll(/`([^`]+)`/g)) {
      fields.add(field.split(".")[0]); // nested fields collapse to their top-level parent; see file doc comment
    }
  }
  return fields;
}

/** Set comparison in both directions, named for which side a stray key is on -- shared by the real test and its drift checks below. */
function compareFieldSets(documented: Set<string>, emitted: Set<string>) {
  return {
    documentedNotEmitted: [...documented].filter((f) => !emitted.has(f)),
    emittedNotDocumented: [...emitted].filter((f) => !documented.has(f)),
  };
}

test("#1637: every top-level key the guide documents is one the printer actually emits, and no other", () => {
  const documented = documentedTopLevelFields();
  const baseline = emittedKeys();
  const withUnverified = emittedKeys({ unverifiedReason: "wrong-content", captureVerified: false });

  for (const key of CONDITIONAL_KEYS) {
    assert.ok(!baseline.has(key), `${key} is documented as conditional but the baseline run emitted it anyway`);
    assert.ok(withUnverified.has(key), `${key} is documented as conditional but never actually appears`);
  }
  const emitted = new Set([...baseline, ...withUnverified]);

  const { documentedNotEmitted, emittedNotDocumented } = compareFieldSets(documented, emitted);
  assert.deepEqual(documentedNotEmitted, [],
    `the guide documents fields the printer never emits: ${documentedNotEmitted.join(", ")}`);
  assert.deepEqual(emittedNotDocumented, [],
    `the printer emits fields the guide never documents: ${emittedNotDocumented.join(", ")}`);
});

test("#1637 POSITIVE CONTROL: rehearsal 3's own recorded keys are a subset of what the printer emits", () => {
  const recorded = Object.keys(fixture());
  assert.ok(recorded.length > 0, "the rehearsal-3 fixture itself must have top-level keys, or this control is vacuous");
  const emitted = emittedKeys();
  const missing = recorded.filter((key) => !emitted.has(key));
  assert.deepEqual(missing, [],
    `the committed rehearsal-3 fixture has keys this run of the real printer did not emit: ${missing.join(", ")}`);
});

/** The full emitted set the real test compares against: baseline plus the conditional key's own run. */
function fullEmittedKeys(): Set<string> {
  return new Set([...emittedKeys(), ...emittedKeys({ unverifiedReason: "wrong-content", captureVerified: false })]);
}

test("#1637 PLANTED DRIFT: a field added to a copy of the table is reported on the documented side", () => {
  const documented = new Set([...documentedTopLevelFields(), "notARealField"]);
  const { documentedNotEmitted, emittedNotDocumented } = compareFieldSets(documented, fullEmittedKeys());
  assert.deepEqual(documentedNotEmitted, ["notARealField"]);
  assert.deepEqual(emittedNotDocumented, []);
});

test("#1637 PLANTED DRIFT: a field removed from the emitted set is reported on the documented side", () => {
  const emitted = fullEmittedKeys();
  emitted.delete("outcomes");
  const { documentedNotEmitted, emittedNotDocumented } = compareFieldSets(documentedTopLevelFields(), emitted);
  assert.deepEqual(documentedNotEmitted, ["outcomes"]);
  assert.deepEqual(emittedNotDocumented, []);
});
