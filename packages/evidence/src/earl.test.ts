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
  //
  // THIS TEST USED TO REQUIRE THE UNRESOLVABLE FORM. It asserted
  // `/^https:\/\/www\.w3\.org\/TR\/WCAG22\/#\d+\.\d+\.\d+$/` — a NUMERIC fragment — and WCAG 2.2 has no such
  // anchor: it identifies a criterion by a slug of its name, `id="non-text-content"`. So a test named for
  // resolvability pinned the one shape that does not resolve, and would have blocked the fix.
  //
  // It was testing the shape the code produced rather than the property its name claims, which is the
  // failure mode this whole file is written against. The assertion is now the property.
  for (const node of assertions()) {
    const test = node["earl:test"] as { "@id": string };
    assert.match(test["@id"], /^https:\/\/www\.w3\.org\/TR\/WCAG22\/#[a-z0-9-]+$/,
      "a WCAG 2.2 anchor is a slug of the criterion's NAME, never its number");
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

test("EVERY criterion URI resolves to a real WCAG 2.2 anchor, not a fabricated one", () => {
  // This emitted `https://www.w3.org/TR/WCAG22/#1.1.1`, which does not exist — WCAG 2.2 identifies a
  // criterion by a SLUG of its name (`id="non-text-content"`). So every `earl:test` in every report
  // resolved to the top of the document, in the one output format whose whole purpose is that another
  // tool can follow the reference.
  //
  // The slug rule was verified against the published spec: lowercasing each criterion NAME and hyphenating
  // its non-alphanumerics matches a real id for all 55, with no special cases. These three are pinned as
  // literals, checked against the spec on 2026-08-29, so a change to the rule has to face them.
  const uriFor = (criterion: string) => {
    const report = earlReport({ ...INPUT, outcomes: [{ criterion, outcome: "failed", reason: "r" }] });
    const found = graph(report).find((n) => n["@type"] === "earl:Assertion") as
      { "earl:test": { "@id": string } } | undefined;
    return found!["earl:test"]["@id"];
  };
  assert.equal(uriFor("1.1.1"), "https://www.w3.org/TR/WCAG22/#non-text-content");
  assert.equal(uriFor("1.3.1"), "https://www.w3.org/TR/WCAG22/#info-and-relationships");
  assert.equal(uriFor("2.4.4"), "https://www.w3.org/TR/WCAG22/#link-purpose-in-context");
  assert.doesNotMatch(uriFor("4.1.2"), /#\d/, "a numeric fragment is never a real WCAG anchor");
});

test("an UNKNOWN criterion cites the document, rather than inventing an anchor", () => {
  // A bare document URI is honest — "here is the standard". A fabricated fragment claims a precision it
  // does not have, which is the failure this whole fix is about.
  const report = earlReport({ ...INPUT, outcomes: [{ criterion: "9.9.9", outcome: "untested", reason: "r" }] });
  const assertion = graph(report).find((n) => n["@type"] === "earl:Assertion") as
    { "earl:test": { "@id": string } } | undefined;
  assert.equal(assertion!["earl:test"]["@id"], "https://www.w3.org/TR/WCAG22/");
});
