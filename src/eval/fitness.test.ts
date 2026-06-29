import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateFitness, thresholdsFromEnv } from "./fitness.js";

const T = { minRecall: 0.8, maxConformantFP: 0 };

test("passes when recall clears the floor and no conformant false positives", () => {
  assert.deepEqual(evaluateFitness({ recall: 1, conformantFP: 0 }, T), { pass: true, reasons: [] });
});

test("fails when recall is below the floor", () => {
  const r = evaluateFitness({ recall: 0.7, conformantFP: 0 }, T);
  assert.equal(r.pass, false);
  assert.match(r.reasons[0], /recall/);
});

test("fails on any false positive on a conformant page", () => {
  const r = evaluateFitness({ recall: 1, conformantFP: 1 }, T);
  assert.equal(r.pass, false);
  assert.match(r.reasons[0], /false positive/);
});

test("recall exactly at the floor passes (>= boundary)", () => {
  assert.equal(evaluateFitness({ recall: 0.8, conformantFP: 0 }, T).pass, true);
});

test("reports both failures at once", () => {
  const r = evaluateFitness({ recall: 0.5, conformantFP: 3 }, T);
  assert.equal(r.pass, false);
  assert.equal(r.reasons.length, 2);
});

test("thresholdsFromEnv reads overrides and applies defaults", () => {
  assert.deepEqual(thresholdsFromEnv({ EVAL_MIN_RECALL: "0.9", EVAL_MAX_CONFORMANT_FP: "2" }), {
    minRecall: 0.9,
    maxConformantFP: 2,
  });
  assert.deepEqual(thresholdsFromEnv({}), { minRecall: 0.8, maxConformantFP: 0 });
});
