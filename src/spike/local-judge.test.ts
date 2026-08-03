/**
 * The LLM-free judge: our trained scorer, guarded by what the capture can actually evidence.
 *
 * The guard is not defensive padding. Measured on a real capture whose only fault was an unnamed icon
 * button, the model predicted:
 *
 *     4.1.2  0.993  correct
 *     3.3.2  0.495  fired — the page has no editable field
 *     2.4.4  0.190  fired — the page contains NO LINKS AT ALL
 *
 * On conformant pages it is silent (0 findings over 150 conformant records), so this is drift on pages
 * that genuinely fail something, against thresholds calibrated for a paired dataset rather than for
 * reporting on one page. A link-purpose finding on a page with no links is indefensible at any score.
 */
import { strict as assert } from "node:assert";
import test from "node:test";

import { evidenceFor, findingsFromScores, hasEvidenceFor } from "./local-judge.js";

/** The real capture that exposed the drift: heading + an unnamed button, nothing else. */
const unnamedButton = {
  transcript: ["heading, level 1, Account search", "button"],
  structure: { headings: ["Account search, heading, level 1"], formFields: ["button"], links: [], graphics: [], landmarks: [], lists: [], tableCells: [] },
  interaction: { controls: ["button"], stateChanges: [], formChanges: [], postSubmitFields: [] },
};

test("link purpose is unreportable on a page with no links", () => {
  assert.equal(hasEvidenceFor("2.4.4", unnamedButton), false);
  const { findings, suppressed } = findingsFromScores(
    { "2.4.4": true, "4.1.2": true }, { "2.4.4": 0.19, "4.1.2": 0.993 }, unnamedButton,
  );
  assert.deepEqual(findings.map((f) => f.wcag), ["4.1.2 Name, Role, Value (A)"]);
  assert.equal(suppressed.length, 1);
  assert.equal(suppressed[0].criterion, "2.4.4");
});

test("labels-or-instructions needs an editable FIELD, not merely a control", () => {
  // 3.3.2 fired at 0.495 on this page. Its only control is a button, and a button is not a field that
  // needs a label — so the criterion has nothing to be right or wrong about here.
  assert.equal(hasEvidenceFor("3.3.2", unnamedButton), false);
  assert.equal(hasEvidenceFor("3.3.2", { structure: { formFields: ["Email address, edit"] } }), true);
  assert.equal(hasEvidenceFor("3.3.2", { structure: { formFields: ["Search, combo box"] } }), true);
});

test("error identification needs a form to have been submitted", () => {
  assert.equal(hasEvidenceFor("3.3.1", unnamedButton), false);
  assert.equal(hasEvidenceFor("3.3.1", { interaction: { postSubmitFields: ["Email, edit, invalid entry"] } }), true);
});

test("suppression is RECORDED, never silent", () => {
  // A suppressed prediction is information about the model's calibration. Hiding it would make the guard
  // impossible to audit, which is how a workaround quietly becomes a permanent blind spot.
  const { suppressed } = findingsFromScores({ "2.4.4": true }, { "2.4.4": 0.9 }, unnamedButton);
  assert.equal(suppressed.length, 1);
  assert.match(suppressed[0].reason, /no evidence of the kind/);
  assert.equal(suppressed[0].score, 0.9);
});

test("a criterion that is NOT predicted produces nothing, however much evidence exists", () => {
  const rich = { structure: { links: ["link, Read more"], formFields: ["Email, edit"] } };
  assert.deepEqual(findingsFromScores({ "2.4.4": false }, { "2.4.4": 0.14 }, rich).findings, []);
});

test("the evidence is QUOTED from the capture, not composed", () => {
  // The entire value of this tool is that a finding points at what a user would really have heard.
  const { findings } = findingsFromScores({ "4.1.2": true }, { "4.1.2": 0.99 }, unnamedButton);
  assert.equal(findings[0].evidence, "button");
  assert.equal(evidenceFor("2.4.4", { structure: { links: ["link, click here", "link, more"] } }), "link, click here · link, more");
});

test("severity follows the conformance level, and the score sharpens it", () => {
  // 4.1.2 is level A, 4.1.3 is AA. An A failure blocks more people, so it outranks an AA one at the same
  // confidence rather than both being "serious".
  const a = findingsFromScores({ "4.1.2": true }, { "4.1.2": 0.99 }, unnamedButton).findings[0];
  const aa = findingsFromScores({ "4.1.3": true }, { "4.1.3": 0.99 },
    { interaction: { formChanges: [{ control: "Submit, button", after: "" }] } }).findings[0];
  assert.equal(a.severity, "blocker");
  assert.equal(aa.severity, "serious");
  const lowA = findingsFromScores({ "4.1.2": true }, { "4.1.2": 0.8 }, unnamedButton).findings[0];
  assert.equal(lowA.severity, "serious", "a less confident level-A prediction should not claim blocker");
});

test("an unknown criterion is never reportable", () => {
  // The scorer has heads for eight criteria. If a ninth key ever appears, inventing a finding for it
  // would be claiming coverage this layer does not have.
  assert.equal(hasEvidenceFor("2.5.8", unnamedButton), false);
  assert.deepEqual(findingsFromScores({ "2.5.8": true }, { "2.5.8": 0.99 }, unnamedButton).findings, []);
});

test("1.1.1 can be evidenced from the transcript when the graphics sweep is empty", () => {
  // Graphics are swept, but an image announced during the read-through is evidence too, and refusing it
  // would suppress a real finding on the strength of one channel being empty.
  assert.equal(hasEvidenceFor("1.1.1", { structure: { graphics: [] }, transcript: ["graphic, ￼"] }), true);
  assert.equal(hasEvidenceFor("1.1.1", { structure: { graphics: [] }, transcript: ["heading, level 1, Hi"] }), false);
});

test("a BLIND guard defers to the model instead of vetoing it", () => {
  // The bug this replaces: the guard checked only whether each channel was empty, and the CLI's `--json`
  // output omitted `structure` and `interaction` entirely — so every channel read empty and the guard
  // suppressed `4.1.2 @ 0.993`, the one true finding on the page. It reported zero false positives and
  // had destroyed the result, which is exactly what a working guard looks like from the outside.
  //
  // No structural data at all means the guard cannot tell "no links" from "links not recorded".
  const transcriptOnly = { transcript: ["heading, level 1, Account search", "button"] };
  assert.equal(hasEvidenceFor("4.1.2", transcriptOnly), true, "must not veto on absent information");
  assert.equal(hasEvidenceFor("2.4.4", transcriptOnly), true);

  const { findings, suppressed } = findingsFromScores(
    { "4.1.2": true }, { "4.1.2": 0.993 }, transcriptOnly,
  );
  assert.equal(findings.length, 1, "the true finding must survive a capture with no structure");
  assert.deepEqual(suppressed, []);
});

test("but a capture that DOES carry structure is still guarded", () => {
  // Deferring when blind must not become deferring always, or the guard stops removing the drift it
  // exists for.
  const withStructure = { structure: { links: [], formFields: ["button"] }, interaction: { controls: ["button"] } };
  assert.equal(hasEvidenceFor("2.4.4", withStructure), false, "links recorded and empty IS informative");
  assert.equal(hasEvidenceFor("4.1.2", withStructure), true);
});

test("the summary states no COUNT, because rules are appended after it", () => {
  // `judge()` calls `withRuleFindings` after this layer returns, so a number written into the summary is
  // stale before anyone reads it. Caught on a real site: the prose said "1 confirmed failure(s)" above a
  // table listing three. The renderer counts the findings; the prose must not compete with it.
  const { findings } = findingsFromScores({ "4.1.2": true }, { "4.1.2": 0.99 }, unnamedButton);
  assert.equal(findings.length, 1);
  for (const summary of [
    "No failures were confirmed for the eight criteria this layer scores. Other criteria are unchecked, not clean.",
    "Confirmed failures below, scored against the eight criteria this layer covers. Other criteria are unchecked, not clean.",
  ]) {
    assert.doesNotMatch(summary, /\d+\s+(confirmed|finding|failure)/i, `summary must not embed a count: ${summary}`);
  }
});
