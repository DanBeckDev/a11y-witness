/**
 * The coverage map must not drift from what ships, in EITHER direction.
 *
 * A map that says a criterion is unreachable after someone made it work is a roadmap that sends people
 * to build what exists. A map that says a criterion is assessed when it is not is the over-claim that
 * `coverage.ts` was written to prevent, one level of detail down. Both are caught here.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { WCAG_22_AA } from "@a11y-witness/evidence/wcag";

import { assessedCriteria } from "./coverage.js";
import { CRITERION_COVERAGE } from "./criterion-coverage.js";

test("every WCAG 2.2 AA criterion has an entry, and nothing else does", () => {
  const real = WCAG_22_AA.map((c) => c.num).sort();
  assert.deepEqual(Object.keys(CRITERION_COVERAGE).sort(), real,
    "the map must cover all 55 and invent none — a criterion with no entry is one nobody has decided about");
});

test("the assessed entries are exactly what the judge can return a finding for", () => {
  const claimed = Object.entries(CRITERION_COVERAGE)
    .filter(([, c]) => c.status === "assessed" || c.status === "partial")
    .map(([num]) => num).sort();
  assert.deepEqual(claimed, assessedCriteria(),
    "coverage.ts and this map disagree about what ships — one of them is lying to a consumer");
});

test("anything not assessed says what evidence it would need", () => {
  // Without this the map degrades into the same undifferentiated `untested` bucket it exists to replace.
  for (const [num, entry] of Object.entries(CRITERION_COVERAGE)) {
    if (entry.status === "assessed") continue;
    assert.ok(entry.needs?.length, `${num} is ${entry.status} and names no evidence source`);
  }
});

test("every entry carries a reason, not just a status", () => {
  for (const [num, entry] of Object.entries(CRITERION_COVERAGE)) {
    assert.ok(entry.note.length > 30, `${num}: a status with no argument is not a decision`);
  }
});

test("4.1.2 is recorded as PARTIAL, because one of its failure modes is unassessable", () => {
  // The case this map exists for. Reported at criterion granularity a fake-button page reads as fine;
  // it is not, and `rule-ownership.json` declares that subtype `unavailable` for the same reason.
  assert.equal(CRITERION_COVERAGE["4.1.2"].status, "partial");
  assert.match(CRITERION_COVERAGE["4.1.2"].note, /role-less|div onclick/i);
});
