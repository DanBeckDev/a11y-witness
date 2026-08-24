import { test } from "node:test";
import assert from "node:assert/strict";
import { ruleFindings } from "./rules.js";

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
  const asserted = ruleFindings({
    transcript: ["Unlabeled graphic"],
    structure: { formFields: ["combo box, collapsed"] },
  } as never);
  assert.ok(asserted.length >= 2, "the fixture must produce both asserting rules");
  for (const finding of asserted) {
    assert.equal(finding.mapping, "conformance",
      `${finding.wcag} — ${finding.issue}: this rule reads the failure directly and should assert it`);
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
  assert.match(trap[0].evidence, /reaching 2 of 5 controls/);
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
