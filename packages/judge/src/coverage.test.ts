/**
 * The coverage list is a CLAIM, so it is pinned to the things it claims about.
 *
 * "We assessed 8 of 55 criteria" is printed on every report and is the whole basis of the Conformance
 * Requirement 1 statement. A hand-maintained list behind that number goes stale the first time somebody
 * retrains with a new head — and it goes stale silently, because nothing else in the pipeline reads it.
 *
 * These tests make that impossible: the list must equal the shipped model's own criteria, and the rules
 * must not be able to emit anything outside it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { scorerPaths } from "@a11y-witness/scorer";
import { WCAG_22_AA } from "@a11y-witness/evidence/wcag";

import { assessedCriteria, RULE_CRITERIA, SCORED_CRITERIA } from "./coverage.js";
import { ruleFindings } from "./rules.js";

test("SCORED_CRITERIA equals the shipped model's own criteria", () => {
  // The pin that matters. Train a ninth head and this fails until the list is updated, which is the only
  // thing standing between "assessed 8 of 55" and a number that quietly stops being true.
  const report = JSON.parse(readFileSync(scorerPaths().trainingReport, "utf8"));
  assert.deepEqual([...SCORED_CRITERIA].sort(), Object.keys(report.criteria).sort(),
    "SCORED_CRITERIA must match training-report.json — retraining changed what ships");
});

test("the rule layer cannot emit a criterion the coverage list omits", () => {
  // Otherwise a report could carry a 2.4.6 finding while stating that 2.4.6 was not assessed.
  for (const num of RULE_CRITERIA) {
    assert.ok((SCORED_CRITERIA as readonly string[]).includes(num),
      `${num} is emitted by a rule but missing from SCORED_CRITERIA`);
  }
});

test("every criterion we claim to assess is a real WCAG 2.2 A/AA criterion", () => {
  // A typo here would inflate the coverage count and cite a criterion that does not exist.
  const real = new Set(WCAG_22_AA.map((c) => c.num));
  for (const num of assessedCriteria()) {
    assert.ok(real.has(num), `${num} is not in the WCAG 2.2 A/AA list`);
  }
});

test("we assess a MINORITY of the criteria, and the report must keep saying so", () => {
  // Guards against the list being widened without the coverage story being revisited. If this ever
  // fails because coverage genuinely grew, that is a good day — and the conformance statements, the
  // README and RELEASE.md all need rewriting on the same day.
  assert.ok(assessedCriteria().length < WCAG_22_AA.length / 2,
    "coverage grew past half of WCAG A/AA — revisit every claim that says most criteria are unchecked");
});

test("the criteria a rule ACTUALLY emitted on real evidence stay inside the list", () => {
  // The static list above is what we declare; this drives the rules and checks what they do. A rule
  // added later with a new criterion is caught here even if nobody updates RULE_CRITERIA.
  const findings = ruleFindings({
    transcript: ["heading, level 1, Newsletter", "click here, link"],
    structure: {
      headings: ["Newsletter, heading, level 1"],
      links: ["click here, link"],
      formFields: ["edit", "combo box, collapsed"],
      graphics: ["Unlabeled graphic"],
    },
    census: { heading: 1, link: 1, graphic: 2, graphicUnnamed: 1 },
  } as never);
  assert.ok(findings.length > 0, "the fixture must actually produce findings, or this asserts nothing");
  for (const finding of findings) {
    const num = String(finding.wcag).split(" ")[0];
    assert.ok((SCORED_CRITERIA as readonly string[]).includes(num),
      `a rule emitted ${num}, which is outside the declared coverage`);
  }
});
