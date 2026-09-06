import { test } from "node:test";
import assert from "node:assert/strict";
import { ruleFindings, repeatedStructureContainers, focusLossVerdict } from "./rules.js";

const criteria = (findings: { wcag: string }[]): string[] =>
  findings.map((f) => f.wcag.match(/(\d+\.\d+\.\d+)/)?.[1] ?? f.wcag);

test("flags a control announced with a role but no name (￼ marker)", () => {
  // An unnamed INPUT is both: 4.1.2 has no accessible name, and 3.3.2 has no label — the user is asked
  // to enter something and not told what. An unnamed BUTTON stays 4.1.2 alone, because there is no label
  // to be missing, only a name.
  assert.deepEqual(criteria(ruleFindings({ transcript: ["edit, ￼"] })), ["4.1.2", "3.3.2"]);
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
    ["4.1.2", "3.3.2"],
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

// --- 2.4.4 and 1.3.1: two findings axe structurally cannot make ---
//
// Both come from the University of Washington "Accessible University" before/after demo, which is a real
// good/bad pair in the wild. On the inaccessible version NVDA announced `"click here, link"` and found ZERO
// headings, and axe reported neither 2.4.4 nor 1.3.1 — its link rule asks whether a link has a name, and
// "click here" has one.

test("a link announced as 'click here' fails 2.4.4", () => {
  assert.deepEqual(criteria(ruleFindings({ transcript: ["click here, link"] })), ["2.4.4"]);
});

test("a descriptive link does not", () => {
  assert.equal(ruleFindings({ transcript: ["Apply to the university, link"] }).length, 0);
});

test("'read more' is deliberately NOT reported", () => {
  // 2.4.4 is Link Purpose *In Context*, so a link may take its meaning from the paragraph around it, and
  // "read more" almost always sits beside the text that supplies it. Reporting it would flag a large share
  // of the web on a criterion that explicitly permits context.
  for (const name of ["read more, link", "Learn more, link", "more, link"]) {
    assert.equal(ruleFindings({ transcript: [name] }).length, 0, `${name} must not be reported`);
  }
});

test("1.3.1 fires on a content page the TREE confirms has no headings", () => {
  const noHeadings = {
    transcript: Array.from({ length: 20 }, (_, i) => `line ${i} of body copy on this page`),
    structure: { headings: [], formFields: [], links: [] },
    census: { heading: 0 },
  };
  assert.deepEqual(criteria(ruleFindings(noHeadings)), ["1.3.1"]);
});

test("1.3.1 does NOT fire when the sweep found nothing but the tree says there ARE headings", () => {
  // This is the whole reason the rule needs an oracle. A sweep returns nothing both when a page has no
  // headings and when this pipeline left NVDA in focus mode typing its own keys into the page — which it
  // did, on 353 captures. Without the tree these two are the same input, and the rule would invent a
  // finding out of our own bug.
  const stuckSweep = {
    transcript: Array.from({ length: 20 }, (_, i) => `line ${i} of body copy on this page`),
    structure: { headings: [], formFields: [], links: [] },
    census: { heading: 38 },
  };
  assert.equal(ruleFindings(stuckSweep).length, 0);
});

test("1.3.1 makes no claim without an oracle at all", () => {
  const noCensus = {
    transcript: Array.from({ length: 20 }, (_, i) => `line ${i}`),
    structure: { headings: [], formFields: [], links: [] },
  };
  assert.equal(ruleFindings(noCensus).length, 0);
});

test("1.3.1 does not fire on a fragment or error page", () => {
  // A page with three lines and no headings is unremarkable; the rule is about content pages.
  assert.equal(ruleFindings({ transcript: ["Not found", "blank"], structure: { headings: [] }, census: { heading: 0 } }).length, 0);
});

test("the UW inaccessible page produces the findings a rule scanner cannot", () => {
  // Exactly what NVDA announced, from a real capture of projects.accesscomputing.uw.edu/au/before.html.
  const uwBefore = {
    transcript: [
      "graphic, au123456789.gif", "click here, link",
      ...Array.from({ length: 18 }, (_, i) => `line ${i} of the enrollment page`),
    ],
    structure: { headings: [], formFields: ["edit", "check box, not checked"], links: ["click here, link"] },
    census: { heading: 0 },
  };
  const found = criteria(ruleFindings(uwBefore)).sort();
  // 1.1.1 the logo's alt text is its own filename; 2.4.4 "click here"; 1.3.1 no headings; 4.1.2 bare roles.
  assert.deepEqual(found, ["1.1.1", "1.3.1", "2.4.4", "3.3.2", "4.1.2"]);
});

/**
 * Which rules may ASSERT non-conformance, pinned.
 *
 * ACT distinguishes a rule mapped to a criterion as a conformance requirement — failed means the criterion
 * is not satisfied — from one mapped as secondary, which correlates but is stricter or looser. Getting this
 * wrong in the permissive direction turns a heuristic into an accusation, which for an accessibility tool
 * is the expensive kind of wrong. So the classification is asserted, not left to whoever edits next.
 */
test("only the rules whose evidence IS the failure assert non-conformance", () => {
  // NVDA saying "Unlabeled graphic" and a control announced as a bare role are the two cases where the
  // announcement is not a proxy for the criterion — it states it.
  //
  // THE SET IS NAMED RATHER THAN "EVERY FINDING FROM THIS FIXTURE", and that is the correction of
  // 2026-09-05. This asserted `conformance` for every finding the fixture produced, so 3.3.2 rode along as
  // a third asserting rule while the comment above named only two — and nothing said so until 3.3.2 was
  // downgraded and the failure read as a regression rather than as the fix it was. A test that says "all
  // of these" cannot notice one joining.
  //
  // 3.3.2 is NOT here on purpose: the criterion is satisfied by a label OR an instruction, W3C is explicit
  // that neither need be associated with the control, and a bare role proves only that the accessible NAME
  // is absent. 4.1.2 keeps the assertion because that clause IS about the name.
  const ASSERTING = new Set(["1.1.1", "4.1.2"]);
  const asserted = ruleFindings({
    transcript: ["Unlabeled graphic"],
    structure: { formFields: ["combo box, collapsed"] },
  } as never);
  assert.ok(asserted.length >= 2, "the fixture must produce both asserting rules");
  const seen = new Set<string>();
  for (const finding of asserted) {
    const criterion = String(finding.wcag).split(" ")[0];
    seen.add(criterion);
    const expected = ASSERTING.has(criterion) ? "conformance" : "secondary";
    assert.equal(finding.mapping ?? "secondary", expected,
      `${finding.wcag} — ${finding.issue}: expected ${expected}`);
  }
  for (const criterion of ASSERTING) {
    assert.ok(seen.has(criterion),
      `${criterion} asserts and this fixture no longer produces it, so the check examines less than it claims`);
  }
});

test("the heuristic rules report as INDICATORS, never as assertions", () => {
  // 2.4.4 permits the link's context to supply its purpose, so "click here" can conform; 1.3.1 is about
  // visual structure this layer cannot see. Both are worth reporting and neither is proof.
  const vague = ruleFindings({ transcript: [], structure: { links: ["click here, link"] } } as never);
  assert.equal(vague.length, 1);
  assert.equal(vague[0].mapping, "secondary", "2.4.4 is stricter here than the criterion itself");

  const headless = ruleFindings({
    transcript: Array.from({ length: 20 }, (_, i) => `line ${i} of ordinary page content`),
    structure: { headings: [] },
    census: { heading: 0 },
  } as never);
  assert.equal(headless.length, 1);
  assert.equal(headless[0].mapping, "secondary", "1.3.1 needs the visual layer to be proof");
});

test("the census count is an INDICATOR, because it already produced one false positive", () => {
  // CSS list bullets were counted as unnamed images and accused a page W3C publishes as AA conformant.
  // Fixed at the census, but the rule reads a COUNT rather than an announcement, so it stays an indicator.
  const census = ruleFindings({
    transcript: [], structure: { graphics: [] }, census: { graphic: 4, graphicUnnamed: 2 },
  } as never);
  assert.equal(census.length, 1);
  assert.equal(census[0].mapping, "secondary");
});

test("every finding declares a mapping, so none defaults by accident at the type level", () => {
  const findings = ruleFindings({
    transcript: ["Unlabeled graphic"],
    structure: { links: ["click here, link"], formFields: ["combo box, collapsed"] },
    census: { graphic: 2, graphicUnnamed: 1 },
  } as never);
  assert.ok(findings.length >= 3);
  for (const finding of findings) {
    assert.ok(finding.mapping === "conformance" || finding.mapping === "secondary",
      `${finding.issue} has no requirement mapping`);
  }
});

/**
 * 1.4.2 Audio Control — one of WCAG's four NON-INTERFERENCE criteria, which apply to ALL content on a page
 * whether or not it is relied upon for anything else. Autoplaying audio is worse for this tool's users than
 * the criterion's wording suggests: it competes directly with the synthetic speech they are listening to.
 */
test("audio that starts on its own with no controls is reported", () => {
  const findings = ruleFindings({
    transcript: [],
    media: [{ tag: "audio", autoplay: true, muted: false, controls: false, loop: true }],
  } as never);
  assert.equal(findings.length, 1);
  assert.match(findings[0].wcag, /^1\.4\.2/);
  assert.match(findings[0].evidence, /<audio autoplay loop>/);
  assert.equal(findings[0].mapping, "secondary",
    "we cannot see the 3-second threshold or a custom pause control elsewhere on the page");
});

test("muted or controllable media is not a 1.4.2 finding", () => {
  // Muted media makes no sound, so there is nothing to control; `controls` IS the pause/stop mechanism the
  // criterion asks for. Flagging either would be a false accusation on ordinary, correct markup.
  const findings = ruleFindings({
    transcript: [],
    media: [
      { tag: "audio", autoplay: true, muted: true, controls: false, loop: false },
      { tag: "video", autoplay: true, muted: false, controls: true, loop: false },
      { tag: "audio", autoplay: false, muted: false, controls: false, loop: false },
    ],
  } as never);
  assert.equal(findings.length, 0);
});

test("a capture with NO media field makes no 1.4.2 claim at all", () => {
  // The field arrived with a probe, so every capture taken before it has none. Treating absence as "no
  // autoplaying audio" would turn all of them into silent passes — the unchecked-is-not-clean rule, in the
  // one place where the evidence is a DOM query rather than something the screen reader said.
  const findings = ruleFindings({ transcript: ["heading, level 1, News"] } as never);
  assert.equal(findings.filter((f) => f.wcag.startsWith("1.4.2")).length, 0);
  const probed = ruleFindings({ transcript: [], media: [] } as never);
  assert.equal(probed.filter((f) => f.wcag.startsWith("1.4.2")).length, 0,
    "an empty probe result is also not a finding — it is a page with no media");
});

/**
 * 1.3.5 Identify Input Purpose — issue #79, the F107 failure mode ("incorrect autocomplete attribute
 * values"). DOM-only, like 1.4.2: `autocomplete` has no accessibility-tree equivalent.
 */
test("a field whose autocomplete value is not a real input purpose token is reported", () => {
  const findings = ruleFindings({
    transcript: [],
    formInputs: [{ tag: "input", type: "text", autocomplete: "fname" }],
  } as never);
  assert.equal(findings.length, 1);
  assert.match(findings[0].wcag, /^1\.3\.5/);
  assert.match(findings[0].evidence, /autocomplete="fname"/);
  assert.equal(findings[0].mapping, "secondary",
    "ACT rule 73f2c2: a custom taxonomy value may still satisfy 1.3.5 even though it fails this rule");
});

test("a valid token, with or without a shipping/billing or contact-type qualifier, is not a finding", () => {
  const findings = ruleFindings({
    transcript: [],
    formInputs: [
      { tag: "input", type: "text", autocomplete: "given-name" },
      { tag: "input", type: "text", autocomplete: "shipping street-address" },
      { tag: "input", type: "tel", autocomplete: "mobile tel" },
      { tag: "input", type: "text", autocomplete: "cc-number webauthn" },
    ],
  } as never);
  assert.equal(findings.length, 0);
});

test("no autocomplete, or the bare state values on/off, is not this rule's claim", () => {
  // A field with NO autocomplete attribute at all may still fail 1.3.5 -- H98 is the criterion's only
  // sufficient technique -- but deciding that needs to know the field COLLECTS PERSONAL DATA independent
  // of any attribute it carries, which this rule deliberately does not attempt (criterion-coverage.ts's
  // 1.3.5 note explains why). `on`/`off` assert no purpose at all, so there is nothing to validate.
  const findings = ruleFindings({
    transcript: [],
    formInputs: [
      { tag: "input", type: "text", autocomplete: null },
      { tag: "input", type: "text", autocomplete: "on" },
      { tag: "textarea", type: null, autocomplete: "off" },
    ],
  } as never);
  assert.equal(findings.filter((f) => f.wcag.startsWith("1.3.5")).length, 0);
});

test("a capture with NO formInputs field makes no 1.3.5 claim at all", () => {
  const findings = ruleFindings({ transcript: ["heading, level 1, News"] } as never);
  assert.equal(findings.filter((f) => f.wcag.startsWith("1.3.5")).length, 0);
  const probed = ruleFindings({ transcript: [], formInputs: [] } as never);
  assert.equal(probed.filter((f) => f.wcag.startsWith("1.3.5")).length, 0,
    "an empty probe result is also not a finding — it is a page with no form inputs");
});

/**
 * 2.1.2 No Keyboard Trap — a non-interference criterion, and the only failure here that is TOTAL: a
 * keyboard user who cannot leave a control cannot use the rest of the page at all.
 *
 * The capture probe has always recorded the evidence and deliberately refused to judge it ("which one it
 * is, is the judge's call"). These are that call, and they are mostly about NOT making it too eagerly.
 */
test("focus repeating while most controls were never reached is a trap", () => {
  const findings = ruleFindings({
    transcript: [],
    structure: { formFields: ["a, edit", "b, edit", "c, edit", "d, button", "e, button"] },
    interaction: { focusOrder: ["a, edit", "b, edit", "b, edit", "b, edit"] },
  } as never);
  const trap = findings.filter((f) => f.wcag.startsWith("2.1.2"));
  assert.equal(trap.length, 1);
  // WAS `/reaching 2 of 5 controls/`, and that was correct HERE and wrong elsewhere. `reached` counts
  // distinct raw stops and `total` counts swept controls, while the DECISION is a name-based set
  // difference — so on a disjoint modal (sweep sees the page behind the dialog, Tab sees inside it) both
  // were 4 and the message read "never reached the other 0 of 4 controls" beside a trap finding. The
  // evidence now reports the number the decision was actually made on.
  assert.match(trap[0].evidence, /3 of 5 controls the page announced were never reached/);
  assert.equal(trap[0].mapping, "secondary",
    "WCAG permits an escape by other standard means if the page says so, which we cannot see");
});

test("reaching the END of a short tab order is NOT a trap", () => {
  // The ambiguity the probe's own comment names. Focus repeating at the last control of a page whose
  // controls it all visited is the end of the document, not a trap — and reporting it would fire on
  // ordinary pages, which is how a rule like this gets switched off.
  const findings = ruleFindings({
    transcript: [],
    structure: { formFields: ["a, edit", "b, button"] },
    interaction: { focusOrder: ["a, edit", "b, button", "b, button"] },
  } as never);
  assert.equal(findings.filter((f) => f.wcag.startsWith("2.1.2")).length, 0);
});

test("focus that keeps moving is never a trap, however short", () => {
  const findings = ruleFindings({
    transcript: [],
    structure: { formFields: ["a", "b", "c", "d"] },
    interaction: { focusOrder: ["a", "b", "c"] },
  } as never);
  assert.equal(findings.filter((f) => f.wcag.startsWith("2.1.2")).length, 0);
});

test("no focus probe means no 2.1.2 claim, which was every capture until now", () => {
  // `probeFocus` was reachable from no CLI flag and no Action input, so `focusOrder` is absent from the
  // entire corpus. Treating that as "no trap" would have made 2.1.2 a silent pass everywhere.
  const findings = ruleFindings({
    transcript: [], structure: { formFields: ["a", "b", "c"] }, interaction: {},
  } as never);
  assert.equal(findings.filter((f) => f.wcag.startsWith("2.1.2")).length, 0);
});

test("a trap claim needs corroboration from the sweep, not just a repeat", () => {
  // Without the second signal this fires on a single stale announcement — and stale announcements are
  // frequent enough in this pipeline to have their own section in CLAUDE.md.
  const findings = ruleFindings({
    transcript: [], structure: { formFields: [] },
    interaction: { focusOrder: ["a", "a", "a"] },
  } as never);
  assert.equal(findings.filter((f) => f.wcag.startsWith("2.1.2")).length, 0);
});

/**
 * Container context, found on a real website — the THIRD instance of NVDA's prefix trap.
 *
 * `beginsWithRole`'s comment already records this twice: a leading landmark is context, not the control's own
 * role, and matching it "reported three conformant W3C pages as 4.1.2 failures, which is the worst error this
 * tool can make". It stripped landmarks. It did not strip CONTAINERS, and every navigation bar on every real
 * site is a list inside a landmark — so a named button reported as unnamed, ASSERTED, on the first real page
 * this tool was ever aimed at. Zero captures in the 2,122-record corpus can express it, because generated
 * announcements have no container nesting.
 */
test("does NOT flag a named control behind landmark AND container context (real site)", () => {
  const line = "banner landmark, navigation landmark, list, with 6 items, Community, button";
  assert.deepEqual(ruleFindings({ transcript: [], interaction: { controls: [line] } } as never), [],
    "the button is named 'Community'; asserting 4.1.2 here is a false accessibility accusation");
});

test("does NOT flag a named control behind a table container", () => {
  // The item count sits on the other side of the comma for tables ("table with 3 rows") than for lists
  // ("list, with 6 items"), and handling only one form is what silenced the guard below for the wrong reason.
  assert.deepEqual(ruleFindings({ transcript: [], interaction: { controls: ["table with 3 rows, Read the docs, link"] } } as never),
    []);
});

test("STILL flags a genuinely unnamed control behind that same context", () => {
  // The pair that matters. Stripping context must not become "never fire": the first fix to this consumed
  // "list," and left "with 6 items," behind, which silenced the false positive AND this true positive at once.
  for (const line of [
    "banner landmark, navigation landmark, list, with 6 items, button",
    "table with 3 rows, link",
  ]) {
    assert.deepEqual(criteria(ruleFindings({ transcript: [], interaction: { controls: [line] } } as never)), ["4.1.2"], line);
  }
});

/**
 * A landmark's NAME is not the control's role — the FOURTH instance of NVDA's prefix trap.
 *
 * The first three were: a leading landmark read as a role (three conformant W3C pages reported as 4.1.2
 * failures), a leading container read as one (a named button on the first real site this tool was aimed at),
 * and the item count sitting on either side of the comma. This one is the landmark's own accessible NAME,
 * which the prefix pattern did not consume — so when that name begins with a role word, the leftover reads as
 * a control announced by role alone.
 *
 * Measured on 3,082 real announcements: three distinct cases (six occurrences) were reported as unnamed while
 * every one was named. Zero of the 2,122 generated captures can express it, because generated announcements
 * carry no landmark nesting — which is why every member of this family has been found on a real page and
 * never by the corpus.
 *
 * Naming a landmark is best practice as soon as a page has more than one of a type, so `<name>, <role>
 * landmark,` is the COMMON shape out there and the bare `<role> landmark,` the exception.
 */
test("does NOT flag a named control when the LANDMARK's name begins with a role word", () => {
  // "edit consent" is the landmark; `edit` is a role token. The button is named "accept all".
  assert.deepEqual(ruleFindings({
    transcript: [], interaction: { controls: ["edit consent, complementary landmark, form, accept all, button"] },
  } as never), [], "the button is named 'accept all'; asserting 4.1.2 here is a false accusation");

  // "Navigation menu" is the landmark; `navigation` is a role token. The button is named "Show search menu".
  assert.deepEqual(ruleFindings({
    transcript: [],
    interaction: { controls: ["banner landmark, Navigation menu, navigation landmark, Show search menu, button, collapsed"] },
  } as never), [], "the button is named 'Show search menu'");
});

test("DOES flag a genuinely unnamed control behind a NAMED landmark", () => {
  // The other half, and the half that makes the fix more than a suppression: stripping the landmark's name is
  // what makes this case reachable at all. Before, the name stood in for the control's and the failure was
  // missed — a rule that stops firing for the wrong reason looks fixed and is not.
  const findings = ruleFindings({
    transcript: [], interaction: { controls: ["Main, navigation landmark, list, with 3 items, button"] },
  } as never);
  assert.equal(findings.length, 1, "an unnamed button is an unnamed button, whatever encloses it");
  assert.match(findings[0].wcag, /4\.1\.2/);
});

test("the unnamed cases the rule already caught still fire", () => {
  // Guarding against a fix that buys its false-positive reduction by going quiet. Each of these was caught
  // before the landmark-name change and must still be.
  for (const line of [
    "button",
    "navigation landmark, list, with 3 items, button",
    "banner landmark, navigation landmark, list, with 6 items, button",
  ]) {
    const findings = ruleFindings({ transcript: [], interaction: { controls: [line] } } as never);
    assert.equal(findings.length, 1, `should still flag: ${line}`);
  }
});

test("a combo box that stays collapsed after Enter is CORRECT, not a state-change failure", () => {
  // Verbatim from GOV.UK Design System captures. Enter is not the key that opens a search autocomplete, so
  // one that is still `collapsed` afterwards is behaving properly — the evidence is identical to a broken
  // disclosure's, character for character apart from the role.
  //
  // `screenreader_features.py` learned this as `TOGGLE_ROLE` at a cost of 3 false positives, and this rule
  // reproduced the identical bug at a cost of 12 wrong ASSERTIONS on conformant pages. The corpus cannot
  // express it: 69 conformant and 69 failing disclosures against six combo-box records, and no corpus page
  // has a search autocomplete.
  const comboBox = {
    transcript: [],
    interaction: {
      stateChanges: [{
        control: "banner landmark, Search Design system, combo box, collapsed, has auto complete, editable",
        after: "Search Design system, combo box, focused, collapsed, has auto complete, editable",
      }],
    },
  };
  assert.equal(ruleFindings(comboBox).length, 0,
    "a combo box unchanged after Enter is correct behaviour; asserting from it is this tool's worst error");
});

test("a disclosure BUTTON that stays collapsed after activation still fails", () => {
  // The other direction, so the role gate cannot be widened into silence. This is the flagship finding.
  const disclosure = {
    transcript: [],
    interaction: {
      stateChanges: [{
        control: "aquarium rules, button, collapsed",
        after: "aquarium rules, button, focused, collapsed",
      }],
    },
  };
  const found = ruleFindings(disclosure);
  assert.equal(found.length, 1, "the flagship 4.1.2 finding stopped firing");
  assert.match(found[0].wcag, /^4\.1\.2/);
  assert.equal(found[0].mapping, "conformance", "it must ASSERT — reporting it as a maybe is what this move fixed");
});

test("a disclosure button that DOES change state is silent", () => {
  const working = {
    transcript: [],
    interaction: {
      stateChanges: [{ control: "aquarium rules, button, collapsed", after: "aquarium rules, button, focused, expanded" }],
    },
  };
  assert.equal(ruleFindings(working).length, 0);
});

test("a combo box whose NAME was not repeated is not an unnamed control", () => {
  // Verbatim from caselaw.nationalarchives.gov.uk, and the markup was checked rather than inferred:
  //   <label for="order_by" class="result-controls__label">Order results by</label>
  //   <select class="result-controls__select" id="order_by" name="order">
  //     <option>Sort by: Most relevant</option>
  // So the control IS named, NVDA did not repeat the name in this sweep entry, and "Sort by: Newest" is the
  // selected VALUE. An empty name beside content the grammar could not place is not evidence of anything.
  //
  // Six false 4.1.2/3.3.2 ASSERTIONS across six government search pages came from treating it as such. The
  // corpus cannot express it: all 106 of its genuinely unnamed fields announce as a bare "edit".
  const searchPage = {
    transcript: [],
    structure: { formFields: ["combo box, collapsed, Sort by: Newest"] },
  };
  // REPORTED, never ASSERTED. Silence was the first fix and it was wrong: it lost three real corpus
  // positives (`field-followup-select*`), which `rules:gate` caught by noticing the rule no longer covered
  // every record it owns. The evidence is ambiguous, so the claim must be too.
  const found = ruleFindings(searchPage);
  assert.ok(found.length > 0, "the finding must still be reported — a human should look at this select");
  for (const f of found) {
    assert.equal(f.mapping, "secondary",
      `${f.wcag} was ASSERTED on a select whose markup carries <label for="order_by">. A conformance `
      + "mapping here accuses a publisher of a failure their own markup disproves");
  }
});

test("a genuinely unnamed field still fails — bare role, nothing trailing", () => {
  // The other direction, and the 106 corpus positives all look like this.
  const unlabelled = { transcript: [], structure: { formFields: ["edit"] } };
  const found = ruleFindings(unlabelled);
  assert.ok(found.length >= 1, "the corpus's own unnamed-field shape stopped being reported");
  assert.ok(found.some((f) => f.wcag.startsWith("4.1.2")));
});

test("A TRAP'S EVIDENCE COUNTS THE CONTROLS IT MISSED, not a subtraction on a different basis", () => {
  // The disjoint modal: the sweep announces the page BEHIND the dialog and Tab visits what is INSIDE it,
  // so both sets hold four and `swept - reached` is zero. `channelRelation` already had to become a set
  // difference for exactly this reason — the decision was fixed and the MESSAGE was not, so this printed
  // "never reached the other 0 of 4 controls" while asserting a keyboard trap.
  //
  // A number computed on a different basis from the claim it accompanies, in the sentence a human reads.
  const findings = ruleFindings({
    transcript: ["Checkout, document"],
    structure: { formFields: ["Full name, edit", "Email, edit", "Phone, edit", "Notes, edit"] },
    interaction: { focusOrder: ["Card number, edit", "Expiry, edit", "CVC, edit", "Postcode, edit",
      "Card number, edit"] },
  } as never).filter((f) => f.wcag.startsWith("2.1.2"));
  assert.equal(findings.length, 1, "the disjoint modal is a real trap and must still be reported");
  assert.doesNotMatch(findings[0].evidence, /reached (the other )?0 /,
    "an evidence string that says zero controls were missed contradicts the finding it is evidence for");
  assert.match(findings[0].evidence, /never reached 4 of the 4 controls/,
    "the missed count is the set difference, which is what the decision was made on");
});

test("2.4.2 MAKES NO CLAIM when the probe could not read a heading", () => {
  // `headingAfter` is `string | null` and null means the read FAILED, not that the page has no heading.
  // The title guard one line above already required both to be present; this one did not, so
  // `"Welcome" -> null` differed and the rule fired quoting `the page moved to null`.
  //
  // The rule's entire premise is that the VIEW MOVED. A failed read does not establish that.
  const route = (headingAfter: string | null) => ({
    transcript: ["Home, document"], structure: {},
    interaction: { routeChange: { control: "News, link", navigated: true,
      titleBefore: "Home", titleAfter: "Home", headingBefore: "Welcome", headingAfter } },
  } as never);
  assert.equal(ruleFindings(route("Latest news")).filter((f) => f.wcag.startsWith("2.4.2")).length, 1,
    "a heading that really changed is still a finding, or this passes by breaking the rule");
  assert.equal(ruleFindings(route(null)).filter((f) => f.wcag.startsWith("2.4.2")).length, 0,
    "an unread heading is 'cannot say', never 'the page moved to null'");
});

test("the 2.4.3 suppression counts a `section` container, which is what Edge 152 calls an unnamed form", () => {
  // THE REGRESSION A BROWSER UPGRADE WOULD HAVE CAUSED. `w3c/html-aria#423` made the `form` role
  // conditional on an accessible name, so Edge 152 announces an unnamed <form> as "section". This counter
  // gates 2.4.3: more than one such container means control names repeat by construction, and comparing
  // reading order with tab order across two of them invents a reordering. Counting only "form" returns 0
  // on a page of unnamed forms, the guard stops firing, and 2.4.3 goes back to accusing
  // `w3.org/WAI/tutorials/forms/validation/` — the false positive it was written to stop.
  //
  // TESTED DIRECTLY rather than through `ruleFindings`, and that is the second correction to this test.
  // Two attempts to build a firing 2.4.3 fixture asserted nothing: the first repeated control names so
  // `unambiguous` dropped them all, and the second put the container prefix on every line when NVDA
  // announces it ONCE ON ENTRY. Real captures then showed why a hand-written fixture was the wrong
  // instrument at all — the transcript carries a field's label and role on SEPARATE lines (bare "edit"),
  // so reconstructing one faithfully means reproducing most of the capture shape. The counter is the thing
  // that changed; test the thing that changed.
  const entry = (role: string) => [`${role}, Given name, edit`, "Family name, edit", "Postcode, edit"];

  assert.equal(repeatedStructureContainers(entry("form")), 1, "one form announced on entry");
  assert.equal(repeatedStructureContainers(entry("section")), 1,
    "Edge 152's name for the same thing must count the same");

  // Two containers is what actually suppresses, under EITHER announcement — the old one included, because
  // 3,246 captures on disk carry it and a rule that only reads the current browser cannot read its corpus.
  for (const role of ["form", "section"]) {
    assert.ok(repeatedStructureContainers([...entry(role), `${role}, Telephone, edit`, "Email, edit"]) > 1,
      `two "${role}" containers must exceed the threshold that suppresses 2.4.3`);
  }

  // A page with no such container must not suppress anything.
  assert.equal(repeatedStructureContainers(["heading, level 1, Contact us", "edit"]), 0);
});

test("1.4.13's Dismissable finding fires only on revealed+held+not-dismissed, and always as secondary", () => {
  // `focus-panel-undismissable`, moved from the trained scorer to the rules on 2026-09-05: the evidence is
  // a direct read of `focusRevealVerdict`'s own verdict, not an inference, but Dismissable itself carries
  // two exceptions this evidence cannot rule out ("unless the additional content communicates an input
  // error or does not obscure or replace other content") — so it reports `secondary`, never `conformance`.
  const capture = (focusReveal: unknown) => ({
    transcript: [], structure: {}, interaction: { focusReveal },
  } as never);

  const found = ruleFindings(capture({ revealed: true, focusHeld: true, dismissed: false,
    revealedBy: [["link", 1]] }));
  assert.equal(found.length, 1, "the genuine positive must fire exactly once");
  assert.equal(found[0].wcag, "1.4.13 Content on Hover or Focus");
  assert.equal(found[0].mapping, "secondary",
    "Dismissable's own exceptions (input error; does not obscure) are unruled-out by this evidence");

  // Every tri-state combination that is NOT the genuine positive must stay silent.
  const silent = [
    undefined,
    { revealed: false },                                              // nothing appeared on focus
    { revealed: null },                                                // census unavailable, or nothing focusable
    { revealed: true, focusHeld: true, dismissed: true },              // actually dismissed
    { revealed: true, focusHeld: false, dismissed: false },            // Escape navigated, did not dismiss
    { revealed: true, focusHeld: true, dismissed: null },              // census after Escape unavailable
  ];
  for (const focusReveal of silent) {
    assert.equal(ruleFindings(capture(focusReveal)).filter((f) => f.wcag.startsWith("1.4.13")).length, 0,
      `must make no claim on ${JSON.stringify(focusReveal)}`);
  }
});

// 2.4.7 F55 -- addFocusEventFindings walks the RAW `focusEvents.log` itself as of 2026-09-06 (see that
// function's own doc comment for the two capture-side designs it replaced and why both were wrong).
const focusEventsCapture = (focusEvents: unknown) => ({
  transcript: [], structure: {}, interaction: { focusEvents },
} as never);
const focusFindings = (log: unknown) =>
  ruleFindings(focusEventsCapture({ checked: true, log })).filter((f) => f.wcag.startsWith("2.4.7"));

test("TRUE POSITIVE FIRST: an ORPHANED focusout -- no matching focusin ever recorded -- is F55 regardless of what follows", () => {
  // The real shape from focus-removed-on-receipt-order.bad's 27-event log (trimmed to what matters): the
  // script intercepts focus so fast the browser's own focusin never fires, so "Delivery instructions"
  // (id 1) appears ONLY as a focusout, immediately followed by a real focusin elsewhere (id 2) -- which a
  // rule that only clears COMPLETED pairs on a destination would wrongly read as this control's own
  // redirect. This is the false negative that made the earlier capture-side designs catch 0 of 9 positives.
  const log = [
    { type: "focusin", id: 0, name: "Contact name", atMs: 3195 },
    { type: "focusout", id: 0, name: "Contact name", atMs: 5097 },
    { type: "focusout", id: 1, name: "Delivery instructions", atMs: 5098 }, // ORPHANED: no focusin for id 1
    { type: "focusin", id: 2, name: "Daytime telephone", atMs: 5098 },
    { type: "focusout", id: 2, name: "Daytime telephone", atMs: 5711 },
  ];
  const found = focusFindings(log);
  assert.equal(found.length, 1, "the orphaned control must be caught, not cleared by id 2's real focusin");
  assert.match(found[0].evidence, /Delivery instructions/);
  assert.match(found[0].evidence, /never fully received/);
  assert.equal(found[0].mapping, "secondary",
    "a focus-event read is evidence the mechanism is absent, not a read of a visible indicator");
});

test("the SAME orphaned control across two laps of a ring still reports as ONE finding, not two", () => {
  // The real 27-event log wraps the ring twice; both occurrences of id 1's orphaned focusout must collapse
  // to the one finding `add()`'s own dedup already provides (`wcag|evidence` key), the same as any other
  // rule reporting the same evidence twice.
  const log = [
    { type: "focusout", id: 1, name: "Delivery instructions", atMs: 5098 },
    { type: "focusin", id: 2, name: "Daytime telephone", atMs: 5098 },
    { type: "focusout", id: 2, name: "Daytime telephone", atMs: 5711 },
    { type: "focusin", id: 0, name: "Contact name", atMs: 12646 },
    { type: "focusout", id: 0, name: "Contact name", atMs: 14582 },
    { type: "focusout", id: 1, name: "Delivery instructions", atMs: 14582 },
    { type: "focusin", id: 2, name: "Daytime telephone", atMs: 14583 },
  ];
  assert.equal(focusFindings(log).length, 1);
});

test("REDIRECTION IS NOT F55: a completed receipt that lands on a DIFFERENT real control is silent", () => {
  // The real 17-event log from keyboard-trap-modal-escape.good, CONFORMANT: a modal claims focus for its
  // first field (id 0 held 0ms, landed on id 1 within 1ms) and the tab ring wraps (id 5 held 0ms, landed
  // on id 1 within 0ms). F55's own text (w3.org/WAI/WCAG22/Techniques/failures/F55) is explicit that every
  // example is a destination-less `.blur()` -- redirecting to a real control is not this failure.
  const log = [
    { type: "focusin", id: 0, name: "Full name", atMs: 3189 },
    { type: "focusout", id: 0, name: "Full name", atMs: 3189 },
    { type: "focusin", id: 1, name: "House number", atMs: 3190 },
    { type: "focusout", id: 1, name: "House number", atMs: 5105 },
    { type: "focusin", id: 2, name: "Street", atMs: 5106 },
    { type: "focusout", id: 2, name: "Street", atMs: 5718 },
    { type: "focusin", id: 3, name: "Town", atMs: 5719 },
    { type: "focusout", id: 3, name: "Town", atMs: 6328 },
    { type: "focusin", id: 4, name: "County", atMs: 6329 },
    { type: "focusout", id: 4, name: "County", atMs: 7964 },
    { type: "focusin", id: 5, name: "A", atMs: 7965 },
    { type: "focusout", id: 5, name: "A", atMs: 7965 },
    { type: "focusin", id: 1, name: "House number", atMs: 7965 },
    { type: "focusout", id: 1, name: "House number", atMs: 8568 },
    { type: "focusin", id: 2, name: "Street", atMs: 8569 },
    { type: "focusout", id: 2, name: "Street", atMs: 9174 },
    { type: "focusin", id: 3, name: "Town", atMs: 9175 },
  ];
  assert.deepEqual(focusFindings(log), [],
    "this exact 17-event log was the real false positive -- it must stay silent");
});

test("ordinary Tab transitions produce NO finding, however adjacent the pair looks", () => {
  // Per the UI Events spec, a Tab transition from A to B fires focusout(A) THEN focusin(B) as one
  // browser-level change, so A's own focusin is followed, a few entries later, by A's own focusout --
  // exactly the F55 shape by adjacency alone. TIME is what tells them apart: an ordinary transition's
  // focusout is caused by the NEXT Tab press, hundreds of ms away, never single digits.
  //
  // Deliberately starts on a focusin, not a leading focusout: a log opening on a bare focusout is its own,
  // separately-tested shape ("a lone focusout with nothing preceding it at all is still F55" below) and
  // would make THIS fixture assert two different things at once.
  const log = [
    { type: "focusin", id: 0, name: "First name", atMs: 1 },
    { type: "focusout", id: 0, name: "First name", atMs: 850 },
    { type: "focusin", id: 1, name: "Last name", atMs: 851 },
    { type: "focusout", id: 1, name: "Last name", atMs: 1600 },
    { type: "focusin", id: 2, name: "Submit", atMs: 1601 },
  ];
  assert.deepEqual(focusFindings(log), []);
});

test("a completed pair held under the window with NO landing at all is F55 -- the textbook destination-less blur", () => {
  const log = [
    { type: "focusin", id: 1, name: "Promo code", atMs: 851 },
    { type: "focusout", id: 1, name: "Promo code", atMs: 853 },
  ];
  const found = focusFindings(log);
  assert.equal(found.length, 1);
  assert.match(found[0].evidence, /Promo code/);
  assert.match(found[0].evidence, /held 2ms/);
});

test("landing back on the SAME control does not count as a destination", () => {
  const log = [
    { type: "focusin", id: 1, name: "Promo code", atMs: 851 },
    { type: "focusout", id: 1, name: "Promo code", atMs: 853 },
    { type: "focusin", id: 1, name: "Promo code", atMs: 854 },
  ];
  assert.equal(focusFindings(log).length, 1, "'landing' on itself is not a real destination");
});

test("a landing that arrives too slowly is the probe's OWN next Tab press, not the same script tick", () => {
  const log = [
    { type: "focusin", id: 1, name: "Promo code", atMs: 851 },
    { type: "focusout", id: 1, name: "Promo code", atMs: 853 },
    { type: "focusin", id: 2, name: "Submit", atMs: 1700 }, // ~850ms later -- an ordinary Tab press
  ];
  assert.equal(focusFindings(log).length, 1,
    "a slow landing is an unrelated recovery, not evidence the strip never happened");
});

test("matched by id, never by name -- two DIFFERENT controls sharing a name is not F55", () => {
  const log = [
    { type: "focusin", id: 0, name: "Submit", atMs: 10 },
    { type: "focusout", id: 0, name: "Submit", atMs: 900 },
    { type: "focusin", id: 1, name: "Submit", atMs: 901 },
  ];
  assert.deepEqual(focusFindings(log), [],
    "different ids, same name, ~900ms apart -- an ordinary Tab transition, not F55");
});

test("more than one control can exhibit F55 in the same capture, and both are reported", () => {
  const log = [
    { type: "focusin", id: 0, name: "Coupon", atMs: 10 },
    { type: "focusout", id: 0, name: "Coupon", atMs: 11 },
    { type: "focusin", id: 1, name: "Gift card", atMs: 500 },
    { type: "focusout", id: 1, name: "Gift card", atMs: 501 },
  ];
  const found = focusFindings(log);
  assert.deepEqual(found.map((f) => f.evidence.split(" (")[0]), ["Coupon", "Gift card"]);
});

test("THE LOG'S FIRST EVENT IS UNPAIRABLE, not F55 and not a clean page -- reversed again, by measurement", () => {
  // THIS TEST HAS NOW ASSERTED THREE ANSWERS, and the history is the useful part (issue #62).
  //
  // ORIGINALLY (before 2026-09-06) it read "a lone focusout with nothing preceding it at all is still
  // F55 -- it is orphaned by definition", correctly for a genuine orphan, but blind to the ambiguity below.
  //
  // THEN (2026-09-06, `known-gaps.md` §42) it flipped to "never F55", when the first real-page recapture
  // showed 37 conformant pages carrying exactly this shape at `log[0]`.
  //
  // THEN it flipped a third time to "F55 like any other", on the premise that
  // `installFocusEventListenerBeforeFirstFocus` (`capture-core.mjs`) makes `log[0]` always a real
  // listener-witnessed focusin -- true of a FRESH capture only. Issue #62 measured the captures already on
  // disk: `rules:real-pages` produced 80 findings at exactly this position, so the premise had not landed
  // for the evidence this rule is actually scored against.
  //
  // NOW: UNPAIRABLE. Neither "F55" (asserting through a real ambiguity repeats the 37-false-positive
  // mistake) nor "clear" (the page is not thereby vindicated -- there may be a real strip here that the
  // evidence simply cannot distinguish from the capture-side gap). `focusLossVerdict`'s own return type
  // keeps this a THIRD, distinct value rather than a `null` shared with genuine clearance.
  const log: { type: string; id: number; name: string; atMs: number }[] =
    [{ type: "focusout", id: 0, name: "Whatever held focus when the listener installed", atMs: 5 }];
  assert.deepEqual(focusLossVerdict(log, 0), { kind: "unpairable" });
  assert.equal(focusFindings(log).length, 0,
    "an orphan at index 0 must not be reported as F55 -- the ambiguity is real, not resolved");
});

test("PRE-FIX REAL-PAGE SHAPE (nhs.uk): kept as a regression fixture, and it is UNPAIRABLE, not a finding", () => {
  // www.nhs.uk/service-search/find-a-gp, verbatim from its stored log (first five events). This is one of
  // the 80 real-page findings issue #62 closes, and the reason the `i === 0` exception existed at all --
  // kept here, unmodified, as the regression fixture `not-working.md` §22 names.
  //
  // THE SAME SIGNATURE THE NINE GENUINE POSITIVES SHOW ONE INDEX LATER: `id 0`'s bare focusout at `atMs:
  // 3171` is followed, within the SAME MILLISECOND (3171), by a real focusin on `id 1` -- exactly the
  // "Tab had already moved on" shape `focus-removed-on-receipt-order.bad`'s own fixture shows at index 2.
  // The only difference is the missing preceding event, which is what makes index 0 unpairable rather
  // than a third, unrelated shape.
  //
  // NOT A FINDING, AND NOT A CLAIM THAT NHS.UK IS CLEAN. This log is evidence of the OLD capture-side bug
  // (the listener starting after `id 0` already held focus), and the rule cannot tell that apart from a
  // genuine strip -- nothing in a `focusin`/`focusout` log records when the LISTENER itself started. A
  // fresh capture of this same page, once half 2 lands, will not produce this shape any more (`id 0`'s own
  // gain will be in the log), so this fixture is not a claim about what nhs.uk looks like today -- it is a
  // permanent record of what the old bug's evidence looked like, kept so nobody has to re-derive it by
  // re-reading a stale capture.
  const log = [
    { type: "focusout", id: 0, name: "A", atMs: 3171 },
    { type: "focusin", id: 1, name: "nhsuk-cookie-banner__link_accept_analytics", atMs: 3171 },
    { type: "focusout", id: 1, name: "nhsuk-cookie-banner__link_accept_analytics", atMs: 4663 },
    { type: "focusin", id: 2, name: "nhsuk-cookie-banner__link_accept", atMs: 4663 },
    { type: "focusout", id: 2, name: "nhsuk-cookie-banner__link_accept", atMs: 5298 },
  ];
  assert.deepEqual(focusLossVerdict(log, 0), { kind: "unpairable" });
  assert.equal(focusFindings(log).length, 0,
    "the pre-fix shape must not be reported as F55 -- the fix is that a fresh capture cannot produce this "
    + "shape any more, not that this exact log is safe to assert through");
});

test("focusLossVerdict: unpairable, clear and finding are three distinct values, never collapsed to one null", () => {
  // The direct proof that "we could not ask" (unpairable) and "we asked and it was fine" (clear) cannot
  // be silently merged -- the exact defect class this criterion's own history keeps producing one layer
  // in from where it was last fixed (`docs/known-gaps.md` §42, then again here for issue #62).
  const orphanAtZero = [{ type: "focusout", id: 0, name: "X", atMs: 5 }];
  assert.deepEqual(focusLossVerdict(orphanAtZero, 0), { kind: "unpairable" });

  const ordinaryTab = [
    { type: "focusin", id: 0, name: "First name", atMs: 1 },
    { type: "focusout", id: 0, name: "First name", atMs: 850 },
  ];
  assert.deepEqual(focusLossVerdict(ordinaryTab, 1), { kind: "clear" });

  const realStrip = [
    { type: "focusin", id: 0, name: "Promo code", atMs: 851 },
    { type: "focusout", id: 0, name: "Promo code", atMs: 853 },
  ];
  assert.deepEqual(focusLossVerdict(realStrip, 1), { kind: "finding", evidence: "Promo code (id 0): focus held 2ms" });
});

test("CORPUS POSITIVE SHAPE: the same orphan one index later IS F55, so the fix cannot go deaf", () => {
  // focus-removed-on-receipt-order.bad, verbatim from its stored log (first four events), and the pairing
  // with the test above is the whole point: the two differ ONLY in whether a focusin precedes them. This
  // is the guard against the failure mode that matters more than the false positives -- "a rule can be
  // clean because it has gone DEAF", where a real-page number looks excellent for the worst reason.
  const log = [
    { type: "focusin", id: 0, name: "Contact name", atMs: 3295 },
    { type: "focusout", id: 0, name: "Contact name", atMs: 5213 },
    { type: "focusout", id: 1, name: "Delivery instructions", atMs: 5214 }, // ORPHANED, and index > 0
    { type: "focusin", id: 2, name: "Daytime telephone number", atMs: 5214 },
  ];
  const found = focusFindings(log);
  assert.equal(found.length, 1, "an orphan the listener was watching for is still F55");
  assert.match(found[0].evidence, /Delivery instructions/);
});

test("`checked: false` is 'cannot say', never 'no findings' -- must never read as a clean zero", () => {
  assert.equal(ruleFindings(focusEventsCapture({ checked: false, why: "no event log", log: null }))
    .filter((f) => f.wcag.startsWith("2.4.7")).length, 0);
  assert.equal(ruleFindings(focusEventsCapture(undefined)).filter((f) => f.wcag.startsWith("2.4.7")).length, 0);
});

test("a real, checked, empty log is a real zero: the oracle ran and found nothing", () => {
  assert.equal(focusFindings([]).length, 0);
});
