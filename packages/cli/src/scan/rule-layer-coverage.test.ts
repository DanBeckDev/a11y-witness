// THE REPORT TOLD A PROVABLE UNTRUTH, AND THESE ARE THE ASSERTIONS THAT WOULD HAVE CAUGHT IT.
//
// `criterionOutcomes` built its covered-set from `assessedCriteria()` -- the trained model plus our own
// deterministic rules, which is the SCREEN-READER layer only -- so every criterion outside it printed
// "No assessor in this tool covers this criterion. It is unchecked, not clean." The CLI runs axe BY
// DEFAULT and opens by printing "rule-based axe-core + real screen reader", so the tool contradicted
// itself inside a single run: 3.1.1, 1.3.5 and 2.5.3 were checked by axe and reported as unchecked.
//
// The join key existed the whole time -- `criteriaFromTags` has parsed criterion numbers out of axe's
// tags since the layer was written -- and nothing consumed them for coverage.
import { test } from "node:test";
import assert from "node:assert/strict";

import { coverageFrom } from "./axe.js";
import { criterionOutcomes } from "@a11y-witness/judge/outcomes";
const rule = (id: string, criterion: string) => ({ id, tags: ["wcag2a", `wcag${criterion.replace(/\./g, "")}`] });

/**
 * A capture carrying nothing, so every outcome here is decided by the rule layer or by its absence.
 *
 * Cast at the call rather than typed against `CaptureEvidence`: that type is the judge's own and is not
 * on its public entry point, and reaching past a package's exports to borrow a type is how a private
 * shape becomes an accidental API.
 */
const emptyCapture = { transcript: [], structure: {}, interaction: {} };

const outcomeOf = (criterion: string, ruleLayer: Record<string, "violated" | "needsReview" | "clean">) =>
  criterionOutcomes({
    capture: emptyCapture as unknown as Parameters<typeof criterionOutcomes>[0]["capture"],
    findings: [], ruleLayer,
  }).find((o) => o.criterion === criterion);

test("a criterion axe examined and found clean is cantTell, NEVER passed", () => {
  const outcome = outcomeOf("3.1.1", coverageFrom({ passes: [rule("html-has-lang", "3.1.1")] }));

  // THE judgement in this change, and the one most worth pinning. Reporting `passed` because a rule
  // engine found no violation is the "false assurance" the literature names directly: Deque measures
  // automated coverage at 57% of issues across 13,000+ pages, and only 16 of the 50 WCAG 2.1 AA criteria
  // are machine-evaluable at all. "axe found nothing" supports "not shown to fail", never "satisfied".
  assert.equal(outcome?.outcome, "cantTell");
  assert.equal(outcome?.assessor, "axe-core");
  assert.match(outcome?.reason ?? "", /not the same as satisfied/);
});

test("a criterion axe never examined is still untested, with the sentence unchanged", () => {
  // The other half, and the reason this is not simply "report more". A criterion no layer looked at must
  // keep saying so -- softening THAT into cantTell would trade one false statement for another.
  const outcome = outcomeOf("2.1.4", coverageFrom({ passes: [rule("html-has-lang", "3.1.1")] }));
  assert.equal(outcome?.outcome, "untested");
  assert.equal(outcome?.assessor, undefined, "an untested criterion has no assessor to name");
  assert.match(outcome?.reason ?? "", /unchecked, not clean/);
});

test("a violation is failed and says which layer decided it", () => {
  const outcome = outcomeOf("3.1.1", coverageFrom({ violations: [rule("html-has-lang", "3.1.1")] }));
  assert.equal(outcome?.outcome, "failed");
  // ADR 0021: the layer that decides must be the layer allowed to claim. A DOM rule result and a
  // screen-reader observation are different claims and the report has to say which it is holding.
  assert.equal(outcome?.assessor, "axe-core");
});

test("axe's own incomplete bucket becomes cantTell", () => {
  // Using axe's confidence rather than one we invented: it already separates what it is sure of from what
  // it wants a human to see, so the assert/refer line is the engine's judgement and not ours.
  const outcome = outcomeOf("1.4.3", coverageFrom({ incomplete: [rule("color-contrast", "1.4.3")] }));
  assert.equal(outcome?.outcome, "cantTell");
  assert.match(outcome?.reason ?? "", /could not decide/);
});

test("one criterion with several rules takes the STRICTEST verdict", () => {
  // A criterion usually has several axe rules, so the buckets need a precedence. Letting a passing
  // fragment vouch for a fragment nobody checked is how a partial examination reads as a whole one.
  const coverage = coverageFrom({
    passes: [rule("html-has-lang", "3.1.1")],
    incomplete: [rule("html-lang-valid", "3.1.1")],
  });
  assert.equal(coverage["3.1.1"], "needsReview");

  const withViolation = coverageFrom({
    passes: [rule("html-has-lang", "3.1.1")],
    incomplete: [rule("html-lang-valid", "3.1.1")],
    violations: [rule("html-xml-lang-mismatch", "3.1.1")],
  });
  assert.equal(withViolation["3.1.1"], "violated");
});

test("an inapplicable RULE does not make the CRITERION inapplicable", () => {
  // axe means "this rule found no elements to test". The criterion may have aspects no axe rule covers,
  // so a page with no labelled controls says nothing about the rest of 2.5.3. Reporting the criterion
  // inapplicable from a rule's inapplicability would be a claim about the criterion drawn from a claim
  // about one rule.
  //
  // 2.5.3 and not 1.1.1, which is the mistake the first draft of this test made: 1.1.1 IS covered by the
  // screen-reader layer, so it never reaches the rule-layer branch and the test asserted nothing about
  // the code it named. Picking a criterion outside `assessedCriteria()` is what makes this a test of the
  // rule layer rather than of the capture.
  const outcome = outcomeOf("2.5.3", coverageFrom({ inapplicable: [rule("label-content-name-mismatch", "2.5.3")] }));
  assert.notEqual(outcome?.outcome, "inapplicable");
  assert.equal(outcome?.assessor, "axe-core");
});

test("the screen-reader layer decides the criteria it covers, whatever axe said", () => {
  // The precedence ADR 0021 requires, and the property the failed first draft accidentally discovered.
  // 1.1.1 is the screen-reader layer's, so a rule-layer verdict must not reach it -- otherwise a DOM
  // check could overrule an observation of what a real screen reader actually announced.
  const outcome = outcomeOf("1.1.1", coverageFrom({ violations: [rule("image-alt", "1.1.1")] }));
  assert.notEqual(outcome?.assessor, "axe-core",
    "a criterion the screen-reader layer covers must not be decided by the rule layer");
});

test("a scan that examined nothing reports nothing as examined", () => {
  // The `coverage: {}` that a THROWN scan returns. `findings: null` already refused to say "0 violations";
  // this is the same statement per criterion.
  assert.deepEqual(coverageFrom({}), {});
  assert.equal(outcomeOf("3.1.1", {})?.outcome, "untested");
});
