/**
 * The rule descriptions have to describe the rules that actually run.
 *
 * A metadata file that drifts from the code is worse than none: it publishes assumptions nobody is holding
 * to and mappings the implementation does not honour. So this drives the real `ruleFindings` and checks the
 * descriptions against what it produces, rather than reading the descriptions to themselves.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { ACT_RULES } from "./act-rules.js";
import { assessedCriteria, criterionNumber, RULE_CRITERIA } from "./coverage.js";
import { ruleFindings } from "./rules.js";

test("every required ACT field is present and says something", () => {
  // ACT names these as required. `assumptions` and `accessibilitySupport` are the two that earn the file,
  // so they are held to a length that a placeholder would not reach.
  for (const rule of ACT_RULES) {
    assert.match(rule.id, /^a11y-witness:[a-z-]+$/, "identifiers must be namespaced and stable");
    assert.match(rule.version, /^\d{4}-\d{2}-\d{2}$/, `${rule.id} needs a version`);
    assert.ok(rule.applicability.length > 30, `${rule.id} must say what it applies to`);
    assert.ok(rule.expectation.length > 20, `${rule.id} must say what passing means`);
    assert.ok(rule.assumptions.length > 0, `${rule.id} must state its assumptions`);
    for (const assumption of rule.assumptions) {
      assert.ok(assumption.length > 40, `${rule.id} has a placeholder assumption: ${assumption}`);
    }
    assert.ok(rule.accessibilitySupport.length > 40, `${rule.id} must state its support limits`);
    assert.ok(rule.accessibilityRequirements.length > 0, `${rule.id} must map to a criterion`);
  }
});

test("identifiers are unique, since ACT requires uniqueness within a rule set", () => {
  assert.equal(new Set(ACT_RULES.map((r) => r.id)).size, ACT_RULES.length);
});

test("every criterion described is one we actually assess", () => {
  const covered = new Set(assessedCriteria());
  for (const rule of ACT_RULES) {
    for (const requirement of rule.accessibilityRequirements) {
      assert.ok(covered.has(requirement.criterion),
        `${rule.id} claims ${requirement.criterion}, which is outside our declared coverage`);
    }
  }
});

test("every criterion the rules can EMIT has a description", () => {
  // The direction that catches an undocumented rule: add one, and this fails until it is described.
  const described = new Set(ACT_RULES.flatMap((r) => r.accessibilityRequirements.map((a) => a.criterion)));
  for (const criterion of RULE_CRITERIA) {
    assert.ok(described.has(criterion), `${criterion} is emitted by a rule with no ACT description`);
  }
});

test("the declared mappings match what the rules actually produce", () => {
  // The check that makes this file trustworthy. A description claiming `conformance` while the code emits
  // `secondary` would publish an assertion we do not make — or worse, the reverse.
  const declared = new Map<string, Set<string>>();
  for (const rule of ACT_RULES) {
    for (const { criterion, mapping } of rule.accessibilityRequirements) {
      if (!declared.has(criterion)) declared.set(criterion, new Set());
      declared.get(criterion)!.add(mapping);
    }
  }
  const produced = ruleFindings({
    transcript: [
      "Unlabeled graphic",
      ...Array.from({ length: 20 }, (_, i) => `line ${i} of ordinary page content`),
    ],
    structure: {
      headings: [], links: ["click here, link"], formFields: ["combo box, collapsed"], graphics: [],
    },
    census: { heading: 0, graphic: 3, graphicUnnamed: 1 },
  } as never);
  assert.ok(produced.length >= 4, "the fixture must exercise several rules, or this asserts nothing");
  for (const finding of produced) {
    const criterion = criterionNumber(finding.wcag);
    const mappings = declared.get(criterion);
    assert.ok(mappings, `a rule emitted ${criterion} with no ACT description`);
    assert.ok(mappings.has(finding.mapping ?? "secondary"),
      `${criterion} was produced as ${finding.mapping} but no description declares that mapping`);
  }
});

test("only the announcement-reading rules claim conformance", () => {
  // Pinned as a list, so promoting an inference rule to an assertion is a visible edit here as well as in
  // the code. These read the failure DIRECTLY; everything else infers it.
  //
  // `error-announced-without-remedy` joined them on 2026-09-02 and the test title lost its "two", which is
  // the edit this guard exists to force. It qualifies on the same test as the others: whether the
  // announced error text carries an instruction is READ from the announcement, not inferred from
  // something adjacent to it. Both variants of its pair announce the error, so it is not an argument
  // about silence — the good page says "Enter the visit date as DD slash MM slash YYYY" and the bad one
  // says "Invalid entry", and the rule reads exactly that difference.
  //
  // It is rules-owned for a measured reason rather than a stylistic one: a trained head for the subtype
  // had recall 0.0 on its own training data under both poolings (known-gaps.md §22).
  const asserting = ACT_RULES
    .filter((r) => r.accessibilityRequirements.some((a) => a.mapping === "conformance"))
    .map((r) => r.id)
    .sort();
  assert.deepEqual(asserting, [
    "a11y-witness:context-change-without-action",
    "a11y-witness:error-announced-without-remedy",
    "a11y-witness:unlabelled-image",
    "a11y-witness:unnamed-control",
  ]);
});

test("the rule that has been wrong before says so in its assumptions", () => {
  // The census rule reported CSS list bullets as images missing text alternatives, on a page W3C publishes
  // as conformant. A metadata file that quietly omitted that would be marketing, not documentation.
  const census = ACT_RULES.find((r) => r.id === "a11y-witness:unnamed-graphic-count")!;
  assert.match(census.assumptions.join(" "), /list-style-image|bullet/i);
  assert.match(census.assumptions.join(" "), /WRONG once|already been wrong/i);
});
