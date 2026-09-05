import assert from "node:assert/strict";
import test from "node:test";
import { validateJudgment, extractJson } from "./judge.js";

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

test("judge validation rejects a non-object entirely, not just a malformed one", () => {
  for (const bad of [null, undefined, "a string", 42]) {
    assert.throws(() => validateJudgment(bad), /judge output is not an object/, `expected a rejection for ${JSON.stringify(bad)}`);
  }
  // typeof [] === "object" in JS, so an array clears that first guard -- it is still rejected, just by
  // the next check down (no `taskCompletable` field), which is a fine outcome: the point is that nothing
  // here can produce a Judgment, not which specific message says so.
  assert.throws(() => validateJudgment([]), /invalid taskCompletable/);
});

// extractJson is shared by every backend -- Codex, Anthropic and the openai-compatible one all pass their
// raw text through it before JSON.parse ever sees it, so its correctness is not backend-specific.
test("extractJson passes clean JSON through unchanged", () => {
  assert.equal(extractJson('{"a":1}'), '{"a":1}');
  assert.equal(extractJson("[1,2,3]"), "[1,2,3]");
});

test("extractJson strips a markdown code fence, with or without a json tag", () => {
  assert.equal(extractJson('```json\n{"a":1}\n```'), '{"a":1}');
  assert.equal(extractJson('```\n{"a":1}\n```'), '{"a":1}');
});

test("extractJson strips leading and trailing prose a model added despite being asked for raw JSON", () => {
  assert.equal(extractJson('Sure, here is the JSON:\n{"a":1}\nLet me know if you need anything else!'), '{"a":1}');
});

test("extractJson anchors on whichever of { or [ appears FIRST, and closes on the matching bracket kind", () => {
  // Object wins when it appears first, closing at the LAST `}` -- which, note, is only correct because
  // there is exactly one object in the text; a second object later would be swallowed too. That is a
  // real, narrow limitation of anchoring on position rather than parsing, not exercised further here.
  assert.equal(extractJson('noise {"a":1} noise [2,3]'), '{"a":1}');
  // Array wins when IT appears first, closing at the last `]`.
  assert.equal(extractJson('noise [1,2] noise {"a":1}'), "[1,2]");
});

test("extractJson on genuinely non-JSON text returns the trimmed text, so JSON.parse fails LOUD rather than on an empty string", () => {
  // No braces or brackets at all: there is nothing to extract, and returning the original text (trimmed)
  // means the eventual JSON.parse error still quotes something a reader can recognise as what the model
  // actually said, rather than an empty string that explains nothing.
  assert.equal(extractJson("  I cannot complete this request.  "), "I cannot complete this request.");
});
