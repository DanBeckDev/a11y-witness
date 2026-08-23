/**
 * EARL export.
 *
 * The property worth testing is that every outcome survives the trip, including the three that a
 * failures-only tool has no way to express. If `cantTell` or `untested` were dropped or coerced, the
 * export would say a page passed checks nobody ran — the same misreading the outcomes model exists to
 * prevent, re-created at the interop boundary.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { earlReport, type EarlOutcome } from "./earl.js";

const INPUT = {
  url: "https://example.com/page",
  date: "2026-08-09T00:00:00.000Z",
  environment: "NVDA 2026.1.1 driving Microsoft Edge 151",
  toolVersion: "0.1.0",
  outcomes: [
    { criterion: "1.1.1", outcome: "failed" as EarlOutcome, reason: "An image was announced unlabelled." },
    { criterion: "2.4.4", outcome: "cantTell" as EarlOutcome, reason: "The link sweep stopped early." },
    { criterion: "1.4.3", outcome: "untested" as EarlOutcome, reason: "No assessor covers this criterion." },
    { criterion: "3.3.2", outcome: "inapplicable" as EarlOutcome, reason: "The page has no fields." },
    { criterion: "4.1.2", outcome: "passed" as EarlOutcome, reason: "Every control was named." },
  ],
};

const graph = (report: object): Record<string, unknown>[] =>
  (report as { "@graph": Record<string, unknown>[] })["@graph"];

/**
 * The exported assertions, and there must be one per input outcome.
 *
 * The count is asserted HERE rather than in one test, because three tests below assert only from inside a
 * `for` over this list — so an `earlReport` that emitted nothing would satisfy all three in silence, and
 * their protection would consist of a different test happening to still exist. Deriving both from one
 * accessor is this repo's standing fix for a fact stated twice.
 */
function assertions(): Record<string, unknown>[] {
  const found = graph(earlReport(INPUT)).filter((n) => n["@type"] === "earl:Assertion");
  assert.equal(found.length, INPUT.outcomes.length,
    `EARL exported ${found.length} assertions for ${INPUT.outcomes.length} outcomes — an outcome was `
    + "dropped at the interop boundary, which is the one failure this file exists to catch");
  return found;
}

test("all five outcomes survive the export, not just failures", () => {
  // The reason this file could not be written before the outcomes model: EARL's vocabulary IS ACT's, so a
  // tool reporting only failures has nothing to say for four of the five.
  const assertions_ = assertions();
  const outcomes = assertions_.map((a) =>
    ((a["earl:result"] as Record<string, { "@id": string }>)["earl:outcome"])["@id"]);
  assert.deepEqual(outcomes, [
    "earl:failed", "earl:cantTell", "earl:untested", "earl:inapplicable", "earl:passed",
  ]);
});

test("every assertion cites a resolvable WCAG criterion URI", () => {
  // An assertion whose `earl:test` is a bare string is not interoperable — the point of the format is that
  // another tool can resolve what was tested.
  for (const node of assertions()) {
    const test = node["earl:test"] as { "@id": string };
    assert.match(test["@id"], /^https:\/\/www\.w3\.org\/TR\/WCAG22\/#\d+\.\d+\.\d+$/);
  }
});

test("the reason travels WITH the outcome", () => {
  // A bare `cantTell` is a token. Separating it from what could not be determined recreates exactly the
  // ambiguity this project spent the day removing.
  for (const node of assertions()) {
    const result = node["earl:result"] as Record<string, string>;
    assert.ok(String(result["dct:description"]).length > 10);
  }
});

test("the assertion declares itself AUTOMATIC", () => {
  // True, and worth stating: a consumer should weigh a machine `failed` differently from a human
  // evaluator's, and EARL has the vocabulary to say which this is.
  for (const node of assertions()) {
    assert.deepEqual(node["earl:mode"], { "@id": "earl:automatic" });
  }
});

test("the assertor names the tool AND the screen reader that produced the evidence", () => {
  const assertor = graph(earlReport(INPUT)).find((n) => n["@id"] === "_:assertor")!;
  assert.equal(assertor["dct:hasVersion"], "0.1.0");
  assert.match(String(assertor["dct:description"]), /NVDA 2026\.1\.1/);
});

test("an empty outcome list still produces a valid, honest document", () => {
  // No assertions, but the subject and assertor remain, so a consumer sees a run that concluded nothing
  // rather than a malformed file.
  const nodes = graph(earlReport({ ...INPUT, outcomes: [] }));
  assert.equal(nodes.filter((n) => n["@type"] === "earl:Assertion").length, 0);
  assert.ok(nodes.some((n) => n["@id"] === "_:subject"));
});
