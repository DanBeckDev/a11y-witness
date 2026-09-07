/**
 * The coverage list is a CLAIM, so it is pinned to the things it claims about.
 *
 * "We assessed N of 55 criteria" is printed on every report and is the whole basis of the Conformance
 * Requirement 1 statement. A hand-maintained list behind that number goes stale the first time somebody
 * retrains with a new head — and it goes stale silently, because nothing else in the pipeline reads it.
 *
 * These tests make that impossible: the list must equal the shipped model's own criteria, and the rules
 * must not be able to emit anything outside it.
 *
 * A bare `deepEqual` between the two (this test's own shape until #84) cannot tell a REMOVAL from an
 * ADDITION, and they are not the same event. A criterion arriving is ordinary: something was built. A
 * criterion disappearing means a capability the last release had is gone — and the failure's own obvious
 * remedy, editing `SCORED_CRITERIA` until it matches, closes the test, ships the removal, and records
 * NOTHING, identically whether the removal was correct or an accident. `3.3.2:unnamed-form-field` almost
 * shipped exactly that way: a legitimate retirement, fully reasoned in `case-matrix.mjs`, that still cost
 * an evening because nothing connected a head vanishing from a training report to the comment explaining
 * why. See `check-retired-heads.mjs`'s own header for the full incident.
 *
 * So growth and shrink now ask different questions, reusing that file's `headSet`/`retiredHeadsVerdict`
 * rather than a third copy of the comparison: a criterion the report gained still requires updating
 * `SCORED_CRITERIA` (accuracy — the printed count must not read LOW), but a criterion the report LOST is a
 * REFUSAL unless `retired-heads.json` names it, when, why, and where the reasoning lives (safety — a
 * shrink recreates the evening if it is only a diff).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { scorerPaths } from "@a11y-witness/scorer";
import { WCAG_22_AA } from "@a11y-witness/evidence/wcag";

import { assessedCriteria, criterionNumber, RULE_CRITERIA, SCORED_CRITERIA } from "./coverage.js";
import { ruleFindings } from "./rules.js";
import { retiredHeadsVerdict, DECLARATION_FILE } from "../../../scripts/check-retired-heads.mjs";

test("a criterion the report GAINED still needs SCORED_CRITERIA updated -- the coverage count must not read LOW", () => {
  const report = JSON.parse(readFileSync(scorerPaths().trainingReport, "utf8"));
  const gained = Object.keys(report.criteria).filter((num) => !(SCORED_CRITERIA as readonly string[]).includes(num));
  assert.deepEqual(gained, [],
    `training-report.json covers ${gained.join(", ")}, missing from SCORED_CRITERIA — the printed `
    + "coverage count is now understating what actually ships. Update the constant.");
});

test("a criterion the report LOST is a REFUSAL unless retired-heads.json declares it", () => {
  // `retiredHeadsVerdict` is generic over "any set of string ids" -- CRITERION numbers here (what
  // SCORED_CRITERIA and the printed coverage count operate on), SUBTYPE ids in `check-retired-heads.mjs`'s
  // own `candidate:gate` use (a finer grain, for the pre-promotion question). Same function, two
  // granularities, because the comparison -- "did anything disappear, and was it declared" -- is
  // identical at both; `headSet()` itself is not needed here, since these sets are already flat.
  const report = JSON.parse(readFileSync(scorerPaths().trainingReport, "utf8"));
  const declarationPath = fileURLToPath(new URL("../../../" + DECLARATION_FILE, import.meta.url));
  const declarations = existsSync(declarationPath) ? JSON.parse(readFileSync(declarationPath, "utf8")) : [];

  const previouslyDeclared = new Set(SCORED_CRITERIA as readonly string[]);
  const nowShipped = new Set(Object.keys(report.criteria));
  const verdict = retiredHeadsVerdict(previouslyDeclared, nowShipped, declarations);
  assert.ok(verdict.ok, verdict.message);
});

test("the rule layer cannot emit a criterion outside the DECLARED coverage", () => {
  // Was: every rule criterion must also be a scorer criterion. That stopped being true when 1.4.2 Audio
  // Control arrived — read from the DOM, with no scorer head — so the invariant is now against the UNION.
  // The property that matters is unchanged: a report must never carry a finding for a criterion it
  // simultaneously describes as unassessed.
  const covered = new Set(assessedCriteria());
  for (const num of RULE_CRITERIA) {
    assert.ok(covered.has(num), `${num} is emitted by a rule but missing from assessedCriteria()`);
  }
  // And at least one rule-only criterion exists, or the union above is being tested vacuously.
  assert.ok(RULE_CRITERIA.some((num) => !(SCORED_CRITERIA as readonly string[]).includes(num)),
    "expected at least one rule-only criterion; if that changed, simplify this back to a subset check");
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
  const covered = new Set(assessedCriteria());
  for (const finding of findings) {
    const num = criterionNumber(finding.wcag);
    // AGAINST THE UNION, exactly as this test's own comment above says the invariant became when 1.4.2
    // arrived. THE FIRST HALF WAS UPDATED AND THIS HALF WAS NOT — it kept checking `SCORED_CRITERIA`, and
    // passed for two weeks only because no rule in the fixture emitted a rule-only criterion. It fired
    // the moment 3.3.2 became rule-only in v19, which is a correct state and read as a failure. A remedy
    // applied to one of two call sites, in the file whose subject is a claim going stale silently.
    assert.ok(covered.has(num),
      `a rule emitted ${num}, which is outside assessedCriteria() -- the report would carry a finding `
      + "for a criterion it simultaneously describes as unassessed");
  }
});
