import assert from "node:assert/strict";
import test from "node:test";
import { validateJudgment } from "./judge.js";

const valid = {
  taskCompletable: true,
  summary: "The announced experience supports the task.",
  findings: [{
    issue: "The image has no useful alternative.",
    wcag: "1.1.1 Non-text Content",
    severity: "serious",
    evidence: "graphic, ￼",
    confidence: 0.92,
  }],
  confidence: 0.9,
};

test("judge validation accepts a complete bounded judgment", () => {
  assert.deepEqual(validateJudgment(valid), valid);
});

test("judge validation rejects malformed top-level output", () => {
  assert.throws(
    () => validateJudgment({ ...valid, findings: "not an array" }),
    /invalid findings/,
  );
});

test("judge validation rejects out-of-range confidence and severity", () => {
  assert.throws(
    () => validateJudgment({ ...valid, confidence: 1.1 }),
    /invalid overall confidence/,
  );
  assert.throws(
    () => validateJudgment({
      ...valid,
      findings: [{ ...valid.findings[0], severity: "unknown" }],
    }),
    /invalid severity/,
  );
});
