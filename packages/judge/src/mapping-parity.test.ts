/**
 * THE MAPPING IS DECLARED IN `act-rules.ts` AND EMITTED IN `rules.ts`, AND NOTHING COMPARED THEM.
 *
 * On 2026-09-04 three criteria were downgraded from asserting a conformance failure to reporting
 * `cantTell`: 3.3.3, 3.2.1 and 3.2.2. The ACT declarations were edited, the audit was written, the backlog
 * was marked DONE — and the three `add(..., "conformance")` literals in `rules.ts` were never touched. The
 * shipped judge went on asserting for a day, so a login page correctly saying "Incorrect password" (which
 * 3.3.3's security exception REQUIRES) was reported as a hard conformance failure.
 *
 * THREE TESTS ALREADY BELIEVED THEY COVERED THIS AND ALL THREE WERE GREEN.
 *   - `act-rules.test.ts`'s "only the announcement-reading rules claim conformance" reads the static
 *     ACT_RULES array. That array was correct. It never invokes `ruleFindings`.
 *   - `rules.test.ts`'s parallel check DOES invoke `ruleFindings`, but its fixture is a bare graphic and a
 *     combo box, which reaches neither `addErrorWithoutRemedy` nor `addContextChanges`.
 *   - `criterion-coverage.test.ts` asserts against prose that also described them as non-asserting.
 *
 * Each was testing a real thing. None could reach the two functions that regressed, and a fixture-driven
 * test only ever covers the paths its fixture happens to walk — which is why this one is derived from the
 * SOURCE rather than from a fixture. It cannot miss a call site by failing to construct the input for it.
 *
 * Source text, with the anti-vacuity guards that requires.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { stripComments } from "@a11y-witness/evidence/source-text";

import { ACT_RULES } from "./act-rules.js";

const SOURCE = readFileSync(resolve(import.meta.dirname, "./rules.ts"), "utf8");

/** Every criterion `rules.ts` emits with an explicit `"conformance"` mapping. */
function criteriaAssertedInCode(): Set<string> {
  // Comments are stripped first. Every one of these call sites now sits under a paragraph explaining why
  // it is `secondary`, and those paragraphs contain the word "conformance" — so matching the raw source
  // matches the prose and reports call sites that do not exist. That is not hypothetical: it is the exact
  // way a guard written earlier today passed with the code it guarded deleted. `stripComments` is shared
  // across every guard with this shape rather than a fourth hand-rolled regex — see its own comment for
  // what it does and does not handle.
  const code = stripComments(SOURCE);
  const calls = [...code.matchAll(/\badd\(\s*"(\d+\.\d+\.\d+)[^"]*"[\s\S]*?\)\s*;/g)];
  assert.ok(calls.length >= 8,
    `only ${calls.length} add("<criterion> ...") call(s) found in rules.ts -- the call shape changed and `
    + "this test is not examining what it claims to");
  return new Set(calls.filter((m) => /"conformance"/.test(m[0])).map((m) => m[1]));
}

/** Every criterion the ACT declarations say may assert. */
function criteriaDeclaredAsserting(): Set<string> {
  const declared = new Set<string>();
  for (const rule of ACT_RULES) {
    for (const m of rule.accessibilityRequirements ?? []) {
      if (m.mapping === "conformance") declared.add(m.criterion);
    }
  }
  assert.ok(declared.size > 0, "no ACT rule declares a conformance mapping -- the shape changed");
  return declared;
}

test("every criterion rules.ts ASSERTS is one act-rules.ts declares as asserting", () => {
  const inCode = [...criteriaAssertedInCode()].sort();
  const declared = criteriaDeclaredAsserting();

  const undeclared = inCode.filter((c) => !declared.has(c));
  assert.deepEqual(undeclared, [],
    `rules.ts emits mapping "conformance" for ${JSON.stringify(undeclared)} and act-rules.ts declares it `
    + "`secondary`. The code ASSERTS a conformance failure the declarations say we only refer. This is the "
    + "shape that shipped on 2026-09-04: the declaration was downgraded and the literal was not.");
});

test("every criterion act-rules.ts declares as asserting is one rules.ts can actually assert", () => {
  // The other direction. A declaration nothing emits is a claim about behaviour the code does not have —
  // harmless-looking, and it makes the ledger above unable to fail, because both sides drift together.
  const inCode = criteriaAssertedInCode();
  const orphaned = [...criteriaDeclaredAsserting()].filter((c) => !inCode.has(c)).sort();
  assert.deepEqual(orphaned, [],
    `act-rules.ts declares ${JSON.stringify(orphaned)} as asserting and no add(..., "conformance") call in `
    + "rules.ts emits it -- either the rule was downgraded and its declaration was not, or the declaration "
    + "describes a rule that no longer exists");
});
