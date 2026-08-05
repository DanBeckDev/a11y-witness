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
  assert.deepEqual(found, ["1.1.1", "1.3.1", "2.4.4", "4.1.2"]);
});
