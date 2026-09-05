/**
 * WHICH SUBTYPES MAY ASSERT A CONFORMANCE FAILURE — pinned against the artefacts, not retyped.
 *
 * `CLAUDE.md`'s opening table is the first thing an agent reads about this project, and it makes a
 * numeric claim: how many rules-owned subtypes actually assert, versus report `cantTell`. That claim is a
 * prose copy of two machine-readable facts — `decidedBy` in `rule-ownership.json` and `mapping` in
 * `act-rules.ts` — and it had drifted: it read "4 of the 11 ... the other seven" while the real answer was
 * 4 of 14 and the other ten.
 *
 * The numerator was right by coincidence. On 2026-09-05 the 3.3.2 mapping was downgraded to `secondary`
 * after the criterion audit found it asserting against a page our own corpus proves conformant — which
 * took the asserting count from five back to four, the number the doc happened to state. **A stale figure
 * that becomes true again by accident is the worst kind**, because the next person to check it finds it
 * correct and concludes the sentence is maintained.
 *
 * `cli-flags.test.ts` set the precedent and its comment says why: "a number a human retypes is a number
 * that drifts — this repo's own rule, which I broke while applying it elsewhere."
 *
 * MEMBERSHIP is asserted as well as the counts, because two numbers can stay right while the wrong
 * subtype moves into the set. Asserting is the strongest thing this tool does: it is the difference
 * between telling somebody their page fails WCAG and telling them to go and look.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ACT_RULES } from "./act-rules.js";

const REPO = join(import.meta.dirname, "..", "..", "..");
const ownership = JSON.parse(readFileSync(join(REPO, "packages/lab/rule-ownership.json"), "utf8"));
const subtypes: Record<string, { decidedBy?: string }> = ownership.subtypes ?? ownership;

const rulesOwned = Object.entries(subtypes)
  .filter(([, v]) => v.decidedBy === "rules")
  .map(([k]) => k);

const assertingCriteria = new Set(
  ACT_RULES.flatMap((r) => r.accessibilityRequirements)
    .filter((req) => req.mapping === "conformance")
    .map((req) => req.criterion),
);

const assertingSubtypes = rulesOwned.filter((k) => assertingCriteria.has(k.split(":")[0])).sort();

test("the four subtypes that may ASSERT are exactly these, and no others have joined", () => {
  assert.deepEqual(assertingSubtypes, [
    "1.1.1:filename-alt",
    "1.1.1:missing-alt",
    "4.1.2:state-change-silent",
    "4.1.2:unnamed-control",
  ], "the set of subtypes that assert a conformance failure changed. That is the strongest claim this "
    + "tool makes — say so in CLAUDE.md's table and in the audit before changing it.");
});

test("CLAUDE.md's counts match the artefacts", () => {
  const doc = readFileSync(join(REPO, "CLAUDE.md"), "utf8");
  const stated = doc.match(/only (\d+) of the (\d+) rules-owned subtypes actually assert/);
  assert.ok(stated, "CLAUDE.md must state the counts as `only N of the M rules-owned subtypes actually assert`");
  assert.equal(Number(stated[1]), assertingSubtypes.length, "CLAUDE.md's ASSERTING count is stale");
  assert.equal(Number(stated[2]), rulesOwned.length, "CLAUDE.md's rules-owned count is stale");

  // The remainder is spelled as a word, so it drifts independently of both numbers -- which is exactly
  // how "the other seven" survived the count going to fourteen.
  const REMAINDER = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
    "ten", "eleven", "twelve", "thirteen", "fourteen"];
  const expected = REMAINDER[rulesOwned.length - assertingSubtypes.length];
  assert.match(doc, new RegExp(`the other ${expected} map as \\\`secondary\\\``),
    `CLAUDE.md should say "the other ${expected} map as \`secondary\`"`);
});
