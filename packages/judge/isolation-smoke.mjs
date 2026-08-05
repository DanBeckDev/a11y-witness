// Run by `scripts/isolation-gate.mjs` from a throwaway directory OUTSIDE this repository, against the
// installed tarball.
//
// It cannot call `judge()`: every backend needs something a fresh install does not have — the `local` default
// needs Python, torch and an 87 MB encoder, and the others need a network and an API key. What it CAN prove is
// that all four `exports` subpaths resolve, and that the DETERMINISTIC layer works with no model at all, which
// is the half of this package that ADR 0002 says must never depend on one.
import assert from "node:assert/strict";

import { judge, validateJudgment } from "@a11y-witness/judge";
import { ruleFindings } from "@a11y-witness/judge/rules";
import { layerOf, orderByLayer, LAYER_LABEL } from "@a11y-witness/judge/layers";
import { applyGate, hasEvidenceFor } from "@a11y-witness/judge/internal";

for (const [name, value] of Object.entries({ judge, validateJudgment, ruleFindings, layerOf, applyGate, hasEvidenceFor })) {
  assert.equal(typeof value, "function", `${name} should be callable`);
}

// The deterministic rules, on a capture with an unnamed graphic. No model, no network, no Python: this is the
// axe-adjacent layer, and it has to hold up alone.
const findings = ruleFindings({
  transcript: ["Gallery, heading, level 1", "unlabeled graphic", "link, About us"],
  structure: { graphics: [""], headings: ["Gallery"], links: ["About us"] },
  census: { graphic: 1, graphicUnnamed: 1, heading: 1, link: 1 },
});
assert.ok(Array.isArray(findings), "ruleFindings must return an array");
// `wcag` carries the criterion's number AND name ("1.1.1 Non-text Content"), which is what the report prints.
assert.ok(findings.some((f) => f.wcag.startsWith("1.1.1")),
  `an unnamed graphic is a 1.1.1 failure; got ${JSON.stringify(findings.map((f) => f.wcag))}`);

// Absence must stay expressible. A capture that announced nothing is not an error here — for a div-based fake
// button that silence IS the 4.1.2 failure — so the rules must return cleanly rather than throw.
assert.doesNotThrow(() => ruleFindings({ transcript: [] }));

// The layer ordering: perceive before navigate before interact, whatever order findings arrive in.
assert.equal(layerOf("1.1.1"), "perceive");
assert.equal(layerOf("2.4.4"), "navigate");
assert.equal(layerOf("4.1.2"), "interact");
const ordered = orderByLayer([
  { wcag: "4.1.2", issue: "i", evidence: "e", severity: "serious", confidence: 1 },
  { wcag: "1.1.1", issue: "i", evidence: "e", severity: "serious", confidence: 1 },
]);
assert.deepEqual(ordered.map((f) => f.wcag), ["1.1.1", "4.1.2"], "perceive findings come first");
assert.ok(LAYER_LABEL.perceive, "every layer needs a human label for the report");

// `validateJudgment` is the boundary check on a backend's output. It THROWS on anything malformed and returns
// the narrowed judgment otherwise — so both directions get exercised here, because a validator that only ever
// accepts is the check-that-examines-nothing again.
const valid = validateJudgment({ taskCompletable: true, summary: "Clean.", findings: [], confidence: 0.9 });
assert.equal(valid.taskCompletable, true);
assert.deepEqual(valid.findings, []);
assert.throws(() => validateJudgment({ nonsense: true }), /invalid taskCompletable/,
  "malformed backend output must be rejected, not passed through");
assert.throws(() => validateJudgment({ taskCompletable: true, summary: "  ", findings: [], confidence: 1 }),
  /invalid summary/, "a blank summary is not a summary");

console.log(`@a11y-witness/judge works when installed: 4 subpaths resolve, rules found ${findings.length} finding(s) with no model`);
