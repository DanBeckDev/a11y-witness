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

test("a form that NAVIGATED cannot evidence a silent validation error", () => {
  // Measured on Wikipedia: submitting the search navigated to French Wikipedia, the post-submit re-read
  // described that page, and 3.3.1 was reported as "a form was submitted and no error was announced" — on
  // a form that worked perfectly. A successful submit has no error to announce; only a form that STAYS and
  // says nothing has failed. The corpus never showed this because every synthetic page preventDefaults.
  const navigated = {
    interaction: {
      formChanges: [{ control: "Search, button", after: "..." }],
      postSubmitFields: ["Rechercher sur Wikipédia, edit"],
      navigatedOnSubmit: { from: "https://www.wikipedia.org/", to: "https://fr.wikipedia.org/" },
    },
  };
  assert.equal(hasEvidenceFor("3.3.1", navigated), false);
  assert.deepEqual(findingsFromScores({ "3.3.1": true }, { "3.3.1": 0.9 }, navigated).findings, []);

  // ...and a form that stayed put is still judged normally, or the guard would blind the criterion.
  const stayed = {
    interaction: {
      formChanges: [{ control: "Submit, button", after: "" }],
      postSubmitFields: ["Email address, edit"],
    },
  };
  assert.equal(hasEvidenceFor("3.3.1", stayed), true);
  assert.equal(findingsFromScores({ "3.3.1": true }, { "3.3.1": 0.9 }, stayed).findings.length, 1);
});

// --- 3.3.1 and 4.1.3 after the keystroke-leak investigation ---
//
// These are the shapes measured on apache.org and on this project's own dataset. The apache.org one is
// the reason the guard changed: the run reported "a form was submitted with invalid input and no error
// was announced" about a site search that worked, returned a result, and owed no error at all.

test("3.3.1 does not fire when a DISCLOSURE was opened rather than a form submitted", () => {
  // apache.org: the probe activated `SEARCH, button`, which opened a search panel. `formChanges` was
  // non-empty, and that alone used to count as "a form was submitted".
  const openedSearch = {
    transcript: ["main landmark, heading, level 1, Software For The Public Good"],
    structure: { formFields: ["SEARCH, button"] },
    interaction: {
      controls: ["banner landmark, list, with 8 items, SEARCH, button"],
      formChanges: [{ control: "SEARCH, button", kind: "disclosure", after: "search landmark" }],
      postSubmitFields: ["SEARCH, button", "Clear, button"],
    },
  };
  assert.equal(hasEvidenceFor("3.3.1", openedSearch), false);
});

test("3.3.1 fires when a submit showed an error the screen reader never spoke", () => {
  // The dataset's `form-error-silent` bad page: the error is on screen and in the accessibility tree, and
  // nothing announces it. This is the criterion, stated directly rather than inferred from silence.
  const silentError = {
    transcript: ["form, Plot preference, edit"],
    structure: { formFields: ["Plot preference, edit", "Request plot, button"] },
    interaction: {
      controls: ["Request plot, button"],
      formChanges: [{ control: "Request plot, button", kind: "submit", after: "" }],
      postSubmitFields: ["form, Plot preference, edit", "Request plot, button"],
      postSubmitNames: ["Plot preference", "Enter a plot preference before requesting.", "Request plot"],
    },
  };
  assert.equal(hasEvidenceFor("3.3.1", silentError), true);
});

test("3.3.1 does NOT fire when the error WAS announced", () => {
  // The accessible variant. The error text reaches the tree and the announcements, so there is nothing
  // to report — and this is the assertion that stops the new oracle inventing findings on good pages.
  const announcedError = {
    transcript: ["form, Plot preference, edit"],
    structure: { formFields: ["Plot preference, edit"] },
    interaction: {
      controls: ["Request plot, button"],
      formChanges: [{ control: "Request plot, button", kind: "submit", after: "Enter a plot preference before requesting." }],
      postSubmitFields: ["form, Plot preference, edit, invalid entry, Enter a plot preference before requesting."],
      postSubmitNames: ["Plot preference", "Enter a plot preference before requesting.", "Request plot"],
    },
  };
  assert.equal(hasEvidenceFor("3.3.1", announcedError), false);
});

test("3.3.1 still works on captures made before the oracle existed", () => {
  // All 2,122 captures on disk and every eval fixture predate `postSubmitNames` and carry no `kind`.
  // Requiring either outright would switch this criterion off for all of them with every test green —
  // the exact shape of the regression that emptied `postSubmitFields` across the whole corpus.
  const legacy = {
    transcript: ["form, Plot preference, edit"],
    structure: { formFields: ["Plot preference, edit"] },
    interaction: {
      controls: ["Request plot, button"],
      formChanges: [{ control: "Request plot, button", after: "" }],
      postSubmitFields: ["form, Plot preference, edit", "Request plot, button"],
    },
  };
  assert.equal(hasEvidenceFor("3.3.1", legacy), true);
});

test("3.3.1 stays silent when submitting NAVIGATED, whatever else is present", () => {
  // Wikipedia: the search submitted successfully and moved to another page, so the post-submit re-read
  // described that page. No error is owed by a form that worked.
  const navigated = {
    transcript: ["x"],
    interaction: {
      controls: ["Search, button"],
      formChanges: [{ control: "Search, button", kind: "submit", after: "" }],
      postSubmitFields: ["a", "b"],
      postSubmitNames: ["Error: something"],
      navigatedOnSubmit: { from: "https://en.wikipedia.org/", to: "https://fr.wikipedia.org/" },
    },
  };
  assert.equal(hasEvidenceFor("3.3.1", navigated), false);
});

test("4.1.3 can be evidenced by a result count the page showed and never announced", () => {
  // WCAG's own worked example for Status Messages is a search result count. This channel is additive: it
  // only ever makes the criterion reportable where it previously was not.
  const silentCount = {
    transcript: ["main landmark, heading, level 1, Search"],
    interaction: { controls: [], postSubmitNames: ["1 result for widgets", "Clear"] },
  };
  assert.equal(hasEvidenceFor("4.1.3", silentCount), true);
  const announcedCount = {
    transcript: ["main landmark, heading, level 1, Search", "1 result for widgets"],
    interaction: { controls: [], postSubmitNames: ["1 result for widgets", "Clear"] },
  };
  assert.equal(hasEvidenceFor("4.1.3", announcedCount), false);
});
