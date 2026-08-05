// The tool's promise is that it cites only real WCAG 2.2 A/AA criteria. That promise used to be made
// by the prompt and enforced by nothing: the judge filtered on the SHAPE of a criterion number, so a
// model emitting "9.9.9 Totally Invented Criterion" had its citation printed in the user's report.
//
// A wrong capture gets caught downstream by check-signals. A wrong citation goes straight to the
// person deciding whether their site is accessible, which makes this the more serious of the two.
import { test } from "node:test";
import assert from "node:assert/strict";
import { WCAG_22_AA } from "./wcag.js";

const numbers = new Set(WCAG_22_AA.map((c) => c.num));

test("the authoritative list is the 55 active A/AA criteria", () => {
  // 4.1.1 Parsing is obsolete and excluded; 2.5.5 and 2.5.6 are AAA.
  assert.equal(WCAG_22_AA.length, 55);
});

test("a real criterion is in the list", () => {
  assert.equal(numbers.has("1.1.1"), true);
});

test("an invented criterion is not", () => {
  assert.equal(numbers.has("9.9.9"), false);
});

test("the obsolete 4.1.1 Parsing is excluded", () => {
  assert.equal(numbers.has("4.1.1"), false);
});

test("no AAA criterion has crept in", () => {
  assert.deepEqual(WCAG_22_AA.filter((c) => c.level !== "A" && c.level !== "AA"), []);
});

test("every criterion number is well formed and unique", () => {
  // A duplicate would silently make one entry unreachable via the number lookup the judge uses.
  for (const c of WCAG_22_AA) assert.match(c.num, /^\d+\.\d+\.\d+$/);
  assert.equal(numbers.size, WCAG_22_AA.length);
});
