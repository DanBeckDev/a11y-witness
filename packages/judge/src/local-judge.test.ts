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

import { evidenceFor, findingsFromScores, hasEvidenceFor, judgeLocally, layerSummary } from "./local-judge.js";

/** The real capture that exposed the drift: heading + an unnamed button, nothing else. */
const unnamedButton = {
  transcript: ["heading, level 1, Account search", "button"],
  structure: { headings: ["Account search, heading, level 1"], formFields: ["button"], links: [], graphics: [], landmarks: [], lists: [], tableCells: [] },
  interaction: { controls: ["button"], stateChanges: [], formChanges: [], postSubmitFields: [] },
};

test("link purpose is unreportable on a page with no links", () => {
  assert.equal(hasEvidenceFor("2.4.4", unnamedButton), false);
  const { findings, suppressed } = findingsFromScores({ predictions: { "2.4.4": true, "4.1.2": true }, scores: { "2.4.4": 0.19, "4.1.2": 0.993 } }, unnamedButton);
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
  const { suppressed } = findingsFromScores({ predictions: { "2.4.4": true }, scores: { "2.4.4": 0.9 } }, unnamedButton);
  assert.equal(suppressed.length, 1);
  assert.match(suppressed[0].reason, /no evidence of the kind/);
  assert.equal(suppressed[0].score, 0.9);
});

test("a criterion that is NOT predicted produces nothing, however much evidence exists", () => {
  const rich = { structure: { links: ["link, Read more"], formFields: ["Email, edit"] } };
  assert.deepEqual(findingsFromScores({ predictions: { "2.4.4": false }, scores: { "2.4.4": 0.14 } }, rich).findings, []);
});

test("the evidence is QUOTED from the capture, not composed", () => {
  // The entire value of this tool is that a finding points at what a user would really have heard.
  const { findings } = findingsFromScores({ predictions: { "4.1.2": true }, scores: { "4.1.2": 0.99 } }, unnamedButton);
  assert.equal(findings[0].evidence, "button");
  assert.equal(evidenceFor("2.4.4", { structure: { links: ["link, click here", "link, more"] } }), "link, click here · link, more");
});

test("severity follows the conformance level, and the score sharpens it", () => {
  // 4.1.2 is level A, 4.1.3 is AA. An A failure blocks more people, so it outranks an AA one at the same
  // confidence rather than both being "serious".
  const a = findingsFromScores({ predictions: { "4.1.2": true }, scores: { "4.1.2": 0.99 } }, unnamedButton).findings[0];
  const aa = findingsFromScores({ predictions: { "4.1.3": true }, scores: { "4.1.3": 0.99 } }, { interaction: { formChanges: [{ control: "Submit, button", after: "" }] } }).findings[0];
  assert.equal(a.severity, "blocker");
  assert.equal(aa.severity, "serious");
  const lowA = findingsFromScores({ predictions: { "4.1.2": true }, scores: { "4.1.2": 0.8 } }, unnamedButton).findings[0];
  assert.equal(lowA.severity, "serious", "a less confident level-A prediction should not claim blocker");
});

test("an unknown criterion is never reportable", () => {
  // The scorer has heads for eight criteria. If a ninth key ever appears, inventing a finding for it
  // would be claiming coverage this layer does not have.
  assert.equal(hasEvidenceFor("2.5.8", unnamedButton), false);
  assert.deepEqual(findingsFromScores({ predictions: { "2.5.8": true }, scores: { "2.5.8": 0.99 } }, unnamedButton).findings, []);
});

test("1.1.1 can be evidenced from the transcript when the graphics sweep is empty", () => {
  // Graphics are swept, but an image announced during the read-through is evidence too, and refusing it
  // would suppress a real finding on the strength of one channel being empty.
  assert.equal(hasEvidenceFor("1.1.1", { structure: { graphics: [] }, transcript: ["graphic, ￼"] }), true);
  assert.equal(hasEvidenceFor("1.1.1", { structure: { graphics: [] }, transcript: ["heading, level 1, Hi"] }), false);
});

test("a capture with no structure is UNREPORTABLE, not deferred to the model", () => {
  // This test asserted the opposite until the deferral was measured, and both halves are worth keeping.
  //
  // The original bug: the guard checked only whether each channel was empty, and the CLI's `--json` output
  // omitted `structure` and `interaction` entirely — so every channel read empty and the guard suppressed
  // `4.1.2 @ 0.993`, the one true finding on that page. Zero false positives while destroying the result,
  // which is what a working guard looks like from outside. The response was to defer to the model rather
  // than veto on absent information.
  //
  // Why that reversed: the CLI bug was fixed at source, so a real capture always carries the sweeps — and
  // the deferral was granting maximum trust to the model exactly where the model had minimum information,
  // since those same fields are 29 of its features and read zero. Measured on the eval fixtures, which are
  // transcript-only, it produced false positives on SEVEN conformant pages.
  //
  // So absent structure now means "cannot say". The rules still speak from the transcript, so nothing that
  // can be PROVED from what was announced is lost.
  const transcriptOnly = { transcript: ["heading, level 1, Account search", "button"] };
  assert.equal(hasEvidenceFor("4.1.2", transcriptOnly), false);
  assert.equal(hasEvidenceFor("2.4.4", transcriptOnly), false);

  const { findings } = findingsFromScores({ predictions: { "4.1.2": true }, scores: { "4.1.2": 0.993 } }, transcriptOnly);
  assert.equal(findings.length, 0,
    "a starved model must not report, however confident its score looks — the confidence is an artefact " +
    "of the features it could not read");
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
  const { findings } = findingsFromScores({ predictions: { "4.1.2": true }, scores: { "4.1.2": 0.99 } }, unnamedButton);
  assert.equal(findings.length, 1);

  // THE REAL FUNCTION, not strings written here. This test asserted against two hardcoded sentences it had
  // invented, so it passed for weeks while the shipped summary said "No failures were confirmed for the N
  // criteria this layer covers" — a claim about counts, computed from the SCORER's findings, printed above
  // findings the RULES had added. Precisely the staleness this test was written to prevent, invisible to it
  // because it never read the code it was guarding.
  const summary = layerSummary();
  assert.doesNotMatch(summary, /\d+\s+(confirmed|finding|failure)/i, `summary must not embed a count: ${summary}`);
  assert.doesNotMatch(summary, /no failures were confirmed/i,
    "the summary must not claim an outcome either — rules are appended after it returns");
  assert.match(summary, /covers \d+ criteria/, "it states SCOPE, which is the one thing it owns");
  assert.match(summary, /unchecked, not clean/, "and silence must never read as a pass");
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
  assert.deepEqual(findingsFromScores({ predictions: { "3.3.1": true }, scores: { "3.3.1": 0.9 } }, navigated).findings, []);

  // ...and a form that stayed put is still judged normally, or the guard would blind the criterion.
  const stayed = {
    interaction: {
      formChanges: [{ control: "Submit, button", after: "" }],
      postSubmitFields: ["Email address, edit"],
    },
  };
  assert.equal(hasEvidenceFor("3.3.1", stayed), true);
  assert.equal(findingsFromScores({ predictions: { "3.3.1": true }, scores: { "3.3.1": 0.9 } }, stayed).findings.length, 1);
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

// --- A starved capture must not assert ---

test("a capture with NO structural evidence yields no model findings", () => {
  // Almost every eval fixture is a transcript only: it predates the structural sweeps, so `structure` and
  // `interaction` are absent. Those same fields are 29 of the scorer's features and they all read zero,
  // which this module's own header measures as making its scores noisy (2.4.4 0.000 -> 0.190). Deferring
  // to the model there produced false positives on SEVEN conformant fixtures.
  const starved = { transcript: ["heading, level 1, Contact us", "link, Home", "edit"] };
  for (const criterion of ["1.1.1", "1.3.1", "2.4.4", "2.4.6", "3.3.1", "3.3.2", "4.1.2", "4.1.3"]) {
    assert.equal(hasEvidenceFor(criterion, starved), false, `${criterion} must not be reportable`);
  }
});

test("a capture WITH structural evidence is judged exactly as before", () => {
  // The inversion above must not quietly switch this layer off for real captures, which always carry the
  // sweeps. This is the shape the worker actually returns.
  const real = {
    transcript: ["edit"],
    structure: { formFields: ["edit"], headings: [], links: [] },
    interaction: { controls: ["edit"] },
  };
  assert.equal(hasEvidenceFor("4.1.2", real), true);
  assert.equal(hasEvidenceFor("3.3.2", real), true);
  // ...and a criterion whose channel is genuinely empty stays unreportable, which is the original point.
  assert.equal(hasEvidenceFor("2.4.4", real), false, "no links means link purpose is not reportable");
});

test("a non-NVDA capture is out of SCOPE, which is neither a failure nor a pass", () => {
  // The scorer refuses a VoiceOver capture, correctly — it was trained on NVDA speech. That refusal used
  // to propagate as a crash that aborted the whole eval run part-way, so no aggregate was printed and the
  // exit code read as "the gate failed" when one input was simply out of scope.
  const voiceOver = {
    screenReader: "VoiceOver",
    transcript: ["heading level 1 Contact us"],
    structure: { formFields: ["edit"], headings: [], links: [] },
  };
  return judgeLocally(voiceOver).then((verdict) => {
    assert.deepEqual(verdict.findings, []);
    assert.match(verdict.summary, /NVDA captures only/i);
    assert.match(verdict.summary, /unchecked, not clean/i, "silence must never read as a clean bill of health");
    assert.equal(verdict.confidence, 0, "nothing was assessed, so there is no confidence to report");
  });
});

/**
 * Suppression is per SUBTYPE, and it has to be exercised or it is not a guard.
 *
 * `ruleOwned` was parsed from the scorer output, `findingsFromScores` accepted and used it, and the sole
 * production call site passed `[]` — so the guard had never once run. Nothing failed, because nothing
 * asked it to. These tests ask.
 *
 * The granularity is the substance. `rules:score` measures, over the 2,002-record corpus, that the rules
 * decide `4.1.2:regex` exactly (32/32, zero false positives over 1,001 conformant records) and never look
 * at `4.1.2:missing-role` or `4.1.2:state-change-silent` — 143 records for that criterion alone.
 * Suppressing the whole criterion hands those to nobody; suppressing none of it leaves the model
 * duplicating the rules where they are already exact.
 *
 * The subtype names here are the corpus's own `target.subtypes` vocabulary, checked against
 * `packages/lab/rule-ownership.json`. They used to include `4.1.2:unnamed-form-field`, which no record
 * has — a fixture asserting on a key invented by the test rather than by the data, which is how a
 * hardcoded list stays green while being wrong.
 */
test("a prediction whose every fired subtype is rule-owned is suppressed", () => {
  const { findings, suppressed } = findingsFromScores({ predictions: { "4.1.2": true }, scores: { "4.1.2": 0.99 }, ruleOwned: ["4.1.2:regex"], subtypePredictions: { "4.1.2:regex": true, "4.1.2:missing-role": false } }, unnamedButton);
  assert.deepEqual(findings, []);
  assert.equal(suppressed.length, 1);
  assert.match(suppressed[0].reason, /4\.1\.2:regex/);
});

test("a prediction driven by a subtype the rules never look at survives", () => {
  const { findings, suppressed } = findingsFromScores({ predictions: { "4.1.2": true }, scores: { "4.1.2": 0.99 }, ruleOwned: ["4.1.2:regex"], subtypePredictions: { "4.1.2:missing-role": true, "4.1.2:regex": false } }, unnamedButton);
  assert.deepEqual(findings.map((f) => f.wcag), ["4.1.2 Name, Role, Value (A)"]);
  assert.deepEqual(suppressed, []);
});

test("a mixed prediction survives, because one half is nobody else's to call", () => {
  const { findings } = findingsFromScores({ predictions: { "4.1.2": true }, scores: { "4.1.2": 0.99 }, ruleOwned: ["4.1.2:regex"], subtypePredictions: { "4.1.2:missing-role": true, "4.1.2:regex": true } }, unnamedButton);
  assert.equal(findings.length, 1);
});

/**
 * The rules decide `3.3.2:unnamed-form-field` outright and report it as a **4.1.2** failure, so it is
 * deliberately absent from `ruleOwned` — see `score.py`, which filters on `ruleReportsAs == criterion`.
 *
 * Without that filter, adopting the corpus vocabulary would have recreated the very bug the per-subtype
 * work removed, one level down: the model's 3.3.2 suppressed because a rule answers a different
 * criterion, and 3.3.2 then decided by neither layer. This test is what stops `ruleOwned` being widened
 * back to "every subtype a rule decides", which reads like a correction and is a regression.
 */
test("a rule that answers a DIFFERENT criterion does not silence the model's own", () => {
  // An editable field, because 3.3.2 is about fields: `unnamedButton` would be suppressed by the
  // evidence guard instead, and the test would pass for a reason unrelated to what it is checking.
  const unnamedField = {
    transcript: ["edit"],
    structure: { headings: [], formFields: ["edit"], links: [], graphics: [], landmarks: [], lists: [], tableCells: [] },
    interaction: { controls: ["edit"], stateChanges: [], formChanges: [], postSubmitFields: [] },
  };
  const { findings, suppressed } = findingsFromScores({ predictions: { "3.3.2": true }, scores: { "3.3.2": 0.97 }, ruleOwned: ["4.1.2:regex"], subtypePredictions: { "3.3.2:unnamed-form-field": true } }, unnamedField);
  assert.equal(findings.length, 1, "the rules supply a 4.1.2 finding, not a 3.3.2 one");
  assert.deepEqual(suppressed, []);
});

test("with no subtype detail it falls back to the criterion, so older artifacts still suppress", () => {
  const { findings, suppressed } = findingsFromScores({ predictions: { "4.1.2": true }, scores: { "4.1.2": 0.99 }, ruleOwned: ["4.1.2"] }, unnamedButton);
  assert.deepEqual(findings, []);
  assert.equal(suppressed[0].reason, "a deterministic rule decides this criterion");
});
