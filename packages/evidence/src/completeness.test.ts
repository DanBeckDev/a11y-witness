/**
 * The numbers here are from real captures, and the two that matter are the ones the gate must separate:
 * the W3C survey page (0 of 21 cells examined, publisher declares it conformant, scorer accused it at
 * 0.946) and any corpus table page (122 of 122 complete).
 *
 * A gate that cannot tell those apart is decoration, so both are pinned, along with the direction that
 * would be worse than the bug: an UNKNOWABLE expectation must not read as incomplete, or every page whose
 * census is silent has its findings suppressed and the tool quietly stops reporting anything.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { CRITERION_EVIDENCE, evidenceCompleteness, withheldForIncompleteEvidence } from "./completeness.js";

/** The real page, reduced to the fields the gate reads. */
const W3C_SURVEY = {
  transcript: [
    "table, with 3 rows and 7 columns, caption, What is your favorite and least favorite organ?",
    "out of caption, row 1, column 1",
    "column 2, Lung",
    "row 2, , column 1, hate it",
    "row 3, , column 1, love it",
  ],
  structure: { tableCells: [], links: [], headings: [], graphics: [], landmarks: [] },
  diagnostics: [{ event: "structureCensus", landmark: 2, heading: 5, link: 46, graphic: 4 }],
};

/** A corpus table page: the sweep reached the cells. */
const CORPUS_TABLE = {
  transcript: ["table, with 3 rows and 2 columns, caption, Opening times"],
  structure: {
    tableCells: ["row 2, Monday, column 2, 9 to 5", "row 2, column 1, Monday", "row 3, column 1, Tuesday",
      "row 3, Tuesday, column 2, 9 to 1"],
    links: [], headings: ["Opening times, heading, level 1"], graphics: [], landmarks: [],
  },
  diagnostics: [{ event: "structureCensus", landmark: 1, heading: 1, link: 0, graphic: 0 }],
};

test("a table announced as 21 cells and swept as 0 is INCOMPLETE", () => {
  const completeness = evidenceCompleteness(W3C_SURVEY);
  assert.equal(completeness.tableCells.expected, 21);
  assert.equal(completeness.tableCells.seen, 0);
  assert.equal(completeness.tableCells.complete, false);
});

test("a corpus table whose cells were swept is COMPLETE", () => {
  // 122 of 122 corpus table captures pass this. Any suppression on the corpus is a bug in the gate, never
  // a finding — which is what makes the change testable with zero expected effect there.
  const completeness = evidenceCompleteness(CORPUS_TABLE);
  assert.equal(completeness.tableCells.complete, true);
});

test("1.3.1 is WITHHELD on the page the scorer accused, and says which channel", () => {
  const { supported, inconclusive } = withheldForIncompleteEvidence(["1.3.1"], evidenceCompleteness(W3C_SURVEY));
  assert.deepEqual(supported, []);
  assert.equal(inconclusive[0].criterion, "1.3.1");
  assert.equal(inconclusive[0].channel, "tableCells");
  assert.equal(inconclusive[0].seen, 0);
  assert.equal(inconclusive[0].expected, 21);
});

test("the same criterion is REPORTED when the evidence supports it", () => {
  const { supported, inconclusive } = withheldForIncompleteEvidence(["1.3.1"], evidenceCompleteness(CORPUS_TABLE));
  assert.deepEqual(supported, ["1.3.1"]);
  assert.deepEqual(inconclusive, []);
});

test("an UNKNOWABLE expectation is not incompleteness", () => {
  // The direction that would be worse than the bug. A page with no census and no announced dimensions must
  // still be scored: treating "we cannot tell how much there was" as "we missed some" suppresses findings
  // everywhere and the tool goes quiet without anyone deciding it should.
  const noNumbers = { transcript: ["heading, level 1, Welcome"], structure: { tableCells: [] }, diagnostics: [] };
  const completeness = evidenceCompleteness(noNumbers);
  assert.equal(completeness.tableCells.expected, null);
  assert.equal(completeness.tableCells.complete, true);
  assert.deepEqual(withheldForIncompleteEvidence(["1.3.1"], completeness).supported, ["1.3.1"]);
});

test("a criterion resting on a truncated LINK sweep is withheld too", () => {
  // The generalisation, and the reason this is a gate rather than a table fix. `evidence-units.ts` already
  // records that links, lists and graphics are the channels that truncate FIRST on a large page, so 2.4.4
  // and 1.1.1 carry this identical latent defect — we have simply not hit them yet.
  const truncated = {
    transcript: [],
    structure: { links: ["Home, link"], tableCells: [], headings: [], graphics: [], landmarks: [] },
    diagnostics: [{ event: "structureCensus", link: 46, heading: 5, graphic: 4, landmark: 2 }],
  };
  const { supported, inconclusive } = withheldForIncompleteEvidence(["2.4.4"], evidenceCompleteness(truncated));
  assert.deepEqual(supported, []);
  assert.equal(inconclusive[0].channel, "links");
});

test("a criterion with no declared evidence channel is never withheld", () => {
  // 3.3.1 and 4.1.3 rest on interaction evidence, which is not a sweep and cannot be half-done. Withholding
  // them would be inventing an incompleteness that has no meaning for how they are captured.
  assert.ok(!("3.3.1" in CRITERION_EVIDENCE));
  const { supported } = withheldForIncompleteEvidence(["3.3.1"], evidenceCompleteness(W3C_SURVEY));
  assert.deepEqual(supported, ["3.3.1"]);
});
