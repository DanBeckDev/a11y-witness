import { test } from "node:test";
import assert from "node:assert/strict";
import { ruleFindings } from "./rules.js";

const criteria = (findings: { wcag: string }[]): string[] =>
  findings.map((f) => f.wcag.match(/(\d+\.\d+\.\d+)/)?.[1] ?? f.wcag);

test("flags a control announced with a role but no name (￼ marker)", () => {
  assert.deepEqual(criteria(ruleFindings({ transcript: ["edit, ￼"] })), ["4.1.2"]);
});

test("does not flag a control that has an accessible name", () => {
  assert.equal(ruleFindings({ transcript: ["Subscribe, button"] }).length, 0);
});

test("flags an image announced with no text alternative (￼)", () => {
  assert.deepEqual(criteria(ruleFindings({ transcript: ["graphic, ￼"] })), ["1.1.1"]);
});

test("flags an image NVDA announces as 'Unlabelled graphic'", () => {
  assert.ok(criteria(ruleFindings({ transcript: ["link, Unlabelled graphic, nav home"] })).includes("1.1.1"));
});

test("flags a file name used as alt text", () => {
  assert.deepEqual(criteria(ruleFindings({ transcript: ["graphic, IMG 4821 dot JPG"] })), ["1.1.1"]);
});

test("does not flag a descriptive image", () => {
  assert.equal(ruleFindings({ transcript: ["graphic, A red sunset over the Blue Ridge mountains"] }).length, 0);
});

test("does not flag a bare role with no ￼ marker (line-wrapping guard)", () => {
  // A labelled field's role can land on its own transcript line, its label on the
  // previous one. Without the empty-name marker this is ambiguous and must NOT fire.
  assert.equal(ruleFindings({ transcript: ["edit"] }).length, 0);
});

test("flags a bare role token in the sweep — no ￼ needed (real NVDA capture)", () => {
  // In the structural sweep each entry is one control's full announcement, so a
  // bare role with no name is unambiguously unnamed even without the ￼ marker.
  // NVDA announced an unnamed icon button as just "button" (verified 2026-06-29).
  assert.deepEqual(criteria(ruleFindings({ transcript: [], interaction: { controls: ["button"] } })), ["4.1.2"]);
});

test("does not flag a named control in the sweep", () => {
  assert.equal(
    ruleFindings({ transcript: [], interaction: { controls: ["Save changes, button", "Search, button"] } }).length,
    0,
  );
});

test("reads unlabelled fields from structure.formFields too", () => {
  assert.deepEqual(
    criteria(ruleFindings({ transcript: [], structure: { formFields: ["￼, radio button, not checked"] } })),
    ["4.1.2"],
  );
});

test("a clean page yields no findings", () => {
  const clean = { transcript: ["heading, level 1, Welcome", "link, Read the documentation", "Subscribe, button"] };
  assert.equal(ruleFindings(clean).length, 0);
});

/**
 * NVDA's "unlabeled" prefix is NOT dependable, so 1.1.1 must not hang on it alone.
 *
 * Measured on one unchanged page across three captures: "unlabeled graphic, to get missing image
 * descriptions, open the context menu." twice, and "graphic, to get missing image descriptions, open
 * the context menu." once. The rule keyed on "unlabeled", so it MISSED 1.1.1 on a third of captures of
 * an image with no alt text at all — a silent false negative in a criterion the rule layer owns
 * outright, on the layer that had never been measured against real captures.
 *
 * Edge only emits that hint because there is no description, and unlike the word "unlabeled" it was
 * present in every capture. The stable token is the one to key on.
 */
test("flags a missing text alternative when NVDA omits its 'unlabeled' prefix", () => {
  const withPrefix = "unlabeled graphic, to get missing image descriptions, open the context menu.";
  const withoutPrefix = "graphic, to get missing image descriptions, open the context menu.";
  assert.deepEqual(criteria(ruleFindings({ transcript: [withPrefix] })), ["1.1.1"]);
  assert.deepEqual(
    criteria(ruleFindings({ transcript: [withoutPrefix] })),
    ["1.1.1"],
    "the same image, announced without the unstable prefix, must still fail 1.1.1",
  );
});

test("the missing-description hint does not make described images fail 1.1.1", () => {
  // The guard has to be shown NOT to over-fire, or it trades a false negative for a false positive:
  // a described image mentioning descriptions in its alt text must stay clean.
  for (const line of [
    "graphic, Map showing the east entrance beside the lake",
    "graphic, Chart of image descriptions published per month",
  ]) {
    assert.equal(ruleFindings({ transcript: [line] }).length, 0, line);
  }
});
