/**
 * The declaration must be capable of REFUSING, or it is a diff with a nicer name.
 *
 * This is the gate `#84` names: a candidate whose head set shrinks must say what it retired, why, and
 * where the reasoning lives — never just that it shrank. `3.3.2:unnamed-form-field` almost shipped absent
 * with nothing accounting for it; two sessions spent an evening resolving the ambiguity by ASSUMPTION,
 * each landing on the opposite wrong answer. See `check-retired-heads.mjs`'s own header for the full story.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { headSet, retiredHeadsVerdict, DECLARATION_FILE }
  from "../../../scripts/check-retired-heads.mjs";

const SHIPPED = { criteria: {
  "1.1.1": { subtypes: { "1.1.1:missing-alt": {}, "1.1.1:generic-alt": {} } },
  "3.3.2": { subtypes: { "3.3.2:unnamed-form-field": {} } },
} };

test("headSet reads every subtype id across every criterion, flattened", () => {
  const ids = headSet(SHIPPED);
  assert.deepEqual([...ids].sort(),
    ["1.1.1:generic-alt", "1.1.1:missing-alt", "3.3.2:unnamed-form-field"]);
});

test("headSet on an empty or malformed report is an empty set, not a throw", () => {
  assert.deepEqual(headSet(null), new Set());
  assert.deepEqual(headSet({}), new Set());
  assert.deepEqual(headSet({ criteria: {} }), new Set());
});

test("an unchanged head set passes with no declaration needed", () => {
  const heads = headSet(SHIPPED);
  const verdict = retiredHeadsVerdict(heads, heads, []);
  assert.equal(verdict.ok, true);
});

test("a GROWN head set (a new one added) passes -- this gate is about disappearance, not change", () => {
  const shipped = headSet(SHIPPED);
  const candidate = new Set([...shipped, "2.4.4:new-subtype"]);
  const verdict = retiredHeadsVerdict(shipped, candidate, []);
  assert.equal(verdict.ok, true);
});

test("A HEAD RETIRED WITH NO DECLARATION IS A REFUSAL, not a warning", () => {
  const shipped = headSet(SHIPPED);
  const candidate = new Set([...shipped].filter((id) => id !== "3.3.2:unnamed-form-field"));
  const verdict = retiredHeadsVerdict(shipped, candidate, []);
  assert.equal(verdict.ok, false, "absent is not a licence");
  assert.match(verdict.message, /3\.3\.2:unnamed-form-field/,
    "the message must name which head disappeared, not just that the count dropped");
});

test("a head retired WITH a complete declaration passes -- refusing every removal makes the override the habit", () => {
  const shipped = headSet(SHIPPED);
  const candidate = new Set([...shipped].filter((id) => id !== "3.3.2:unnamed-form-field"));
  const verdict = retiredHeadsVerdict(shipped, candidate, [{
    subtype: "3.3.2:unnamed-form-field",
    retiredAt: "2026-09-05",
    reason: "W3C does not require a label to be ASSOCIATED for 3.3.2 (that is 1.3.1); a duplicate of 4.1.2.",
    where: "case-matrix.mjs, the comment above the removed cases",
  }]);
  assert.equal(verdict.ok, true, "a complete declaration must let a legitimate removal through");
});

test("a declaration MISSING a required field is caught, not silently accepted", () => {
  const shipped = headSet(SHIPPED);
  const candidate = new Set([...shipped].filter((id) => id !== "3.3.2:unnamed-form-field"));
  const verdict = retiredHeadsVerdict(shipped, candidate, [{
    subtype: "3.3.2:unnamed-form-field",
    retiredAt: "2026-09-05",
    // reason and where both missing.
  }]);
  assert.equal(verdict.ok, false, "a declaration with no reason and no reference is not a declaration");
  assert.match(verdict.message, /reason/);
  assert.match(verdict.message, /where/);
});

test("a declaration for the WRONG subtype does not cover the retired one", () => {
  // The exact mistake the real incident made in reverse: rule-ownership.json's 3.3.2:placeholder-only is
  // a DIFFERENT subtype from 3.3.2:unnamed-form-field, and reading one as covering the other is what sent
  // a session to the wrong answer. A declaration keyed on the wrong id must not silently satisfy this gate.
  const shipped = headSet(SHIPPED);
  const candidate = new Set([...shipped].filter((id) => id !== "3.3.2:unnamed-form-field"));
  const verdict = retiredHeadsVerdict(shipped, candidate, [{
    subtype: "3.3.2:placeholder-only",
    retiredAt: "2026-09-05",
    reason: "a different subtype's retirement",
    where: "case-matrix.mjs",
  }]);
  assert.equal(verdict.ok, false, "a declaration keyed on a different subtype must not cover this one");
  assert.match(verdict.message, /3\.3\.2:unnamed-form-field/);
});

test("MULTIPLE heads retired at once each need their own declaration", () => {
  const shipped = headSet(SHIPPED);
  const candidate = new Set(["3.3.2:unnamed-form-field"]); // both 1.1.1 heads gone too
  const verdict = retiredHeadsVerdict(shipped, candidate, [{
    subtype: "1.1.1:missing-alt", retiredAt: "2026-09-05", reason: "x", where: "y",
  }]);
  assert.equal(verdict.ok, false, "declaring one of two retired heads must not clear the other");
  assert.match(verdict.message, /1\.1\.1:generic-alt/, "the UNDECLARED one must be the one named");
  assert.doesNotMatch(verdict.message, /1\.1\.1:missing-alt is missing|1\.1\.1:missing-alt \(missing/,
    "the DECLARED one must not also be reported as a problem");
});

test("the declaration in this tree, if present, is well-formed", () => {
  // Not "does one exist" -- absence is a normal state (nothing has ever been retired here yet). Whether
  // it parses and every entry carries the required fields, so a malformed declaration fails loudly at the
  // gate rather than throwing and reading as a broken tool.
  const path = fileURLToPath(new URL("../../../" + DECLARATION_FILE, import.meta.url));
  if (!existsSync(path)) return;
  const declarations = JSON.parse(readFileSync(path, "utf8"));
  assert.ok(Array.isArray(declarations), `${DECLARATION_FILE} must be a JSON array`);
  for (const entry of declarations) {
    for (const field of ["subtype", "retiredAt", "reason", "where"]) {
      assert.ok(String(entry[field] ?? "").trim(), `an entry in ${DECLARATION_FILE} is missing \`${field}\``);
    }
  }
});

test("candidate:gate runs the retired-heads check against the candidate", () => {
  const scripts = JSON.parse(readFileSync(
    fileURLToPath(new URL("../../../package.json", import.meta.url)), "utf8")).scripts;
  assert.match(scripts["candidate:gate"], /scorer:retired-heads/,
    "candidate:gate must run the retired-heads check, or a shrinking head set can be promoted undeclared");
});
