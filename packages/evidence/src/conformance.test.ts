/**
 * The conformance-requirement statements, tested for the property that matters: **no requirement may
 * read as a pass.**
 *
 * The danger this guards is not a wrongly worded sentence, it is a missing one. A report that lists
 * findings and stops invites "no findings, so the page is fine" — and for the five requirements in WCAG
 * §5.2 that conclusion is wrong even when every criterion we checked really did pass, because we did not
 * check the whole page (2), the whole process (3), or the whole set of criteria (1).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  conformanceScope,
  notAConformanceClaim,
  NON_INTERFERENCE_CRITERIA,
  sweepOutcomes,
  truncatedSweeps,
} from "./conformance.js";

const CLEAN = {
  assessedCriteria: ["1.1.1", "1.3.1", "2.4.4", "2.4.6", "3.3.1", "4.1.2", "4.1.3", "2.1.2"],
  sweeps: [
    { type: "heading", stop: "exhausted" as const },
    { type: "link", stop: "repeat" as const },
  ],
  screenReader: "NVDA 2026.1.1",
  browser: "Edge 141.0.3537.85",
  ruleLayerRan: true,
};

test("all five requirements are always returned, in order", () => {
  // A requirement omitted because it was awkward to compute is exactly the silent gap this prevents.
  const scope = conformanceScope(CLEAN);
  assert.deepEqual(scope.map((r) => r.number), [1, 2, 3, 4, 5]);
});

test("every requirement states a LIMIT, even on the cleanest possible run", () => {
  // The load-bearing invariant. If this ever passes with an empty limitation, some requirement has
  // become a blanket pass and the report can be read as certification.
  for (const requirement of conformanceScope(CLEAN)) {
    assert.ok(requirement.establishes.trim().length > 0,
      `requirement ${requirement.number} must say what it established`);
    assert.ok(requirement.limitation.trim().length > 20,
      `requirement ${requirement.number} (${requirement.name}) must state what it did NOT establish`);
  }
});

test("no conformance LEVEL is ever claimed", () => {
  // "No findings" plus a level reads as certification, which is the most damaging thing this tool
  // could output. Asserted as an absence across the whole scope, not just requirement 1.
  const text = conformanceScope(CLEAN).map((r) => `${r.establishes} ${r.limitation}`).join(" ");
  assert.doesNotMatch(text, /\bconforms\b|\bis conformant\b|\bpasses (WCAG|Level)\b/i);
  assert.match(conformanceScope(CLEAN)[0].limitation, /No conformance level is claimed/i);
});

test("requirement 1 counts the criteria it did NOT assess, and calls them unchecked", () => {
  const [level] = conformanceScope(CLEAN);
  assert.match(level.establishes, /Assessed 8 of 55/);
  assert.match(level.limitation, /47 criteria were NOT assessed/);
  assert.match(level.limitation, /unchecked, not clean/i);
});

test("a truncated sweep makes requirement 2 report INCOMPLETE examination", () => {
  // The case Requirement 2 exists for: we stopped, the page did not. Reporting that as full-page
  // coverage would be a false claim, and an absence of findings past the cap proves nothing.
  const [, fullPages] = conformanceScope({
    ...CLEAN,
    sweeps: [{ type: "heading", stop: "exhausted" }, { type: "link", stop: "cap" }],
  });
  assert.match(fullPages.limitation, /INCOMPLETE/);
  assert.match(fullPages.limitation, /link \(cap\)/);
  assert.match(fullPages.limitation, /not evidence they are correct/);
});

test("an untruncated run still admits iframes and post-interaction content", () => {
  // Full-page coverage of what a screen reader can REACH is not full-page coverage.
  const [, fullPages] = conformanceScope(CLEAN);
  assert.match(fullPages.establishes, /examined in full/);
  assert.match(fullPages.limitation, /iframes/);
});

test("only `exhausted` and `repeat` count as the page ending first", () => {
  // Everything else is us stopping first. Getting this backwards would silently restore the false
  // full-page claim: a capped sweep would be reported as complete.
  assert.equal(truncatedSweeps([{ type: "h", stop: "exhausted" }, { type: "l", stop: "repeat" }]).length, 0);
  for (const stop of ["cap", "deadline", "error", "silent", "channelReset", "focusModeStuck"]) {
    assert.equal(truncatedSweeps([{ type: "h", stop }]).length, 1, `${stop} means we stopped first`);
  }
});

test("a sweep with no recorded stop is not counted as truncated", () => {
  // Absence of a stop reason is "not recorded", which must not become "truncated" — the same
  // could-not-ask/answer-is-no conflation this project refuses everywhere else.
  assert.equal(truncatedSweeps([{ type: "heading" }]).length, 0);
  assert.equal(truncatedSweeps().length, 0);
});

test("sweep outcomes are read from diagnostics, both directions per mark", () => {
  // A sweep walks backwards and forwards from the cursor and either can truncate on its own, so one
  // mark carries two outcomes.
  const outcomes = sweepOutcomes([
    { event: "sweep", type: "heading", prevStop: "exhausted", nextStop: "cap" },
    { event: "structureCensus", graphic: 3 },
    { event: "sweep", type: "link", prevStop: "repeat" },
  ]);
  assert.deepEqual(outcomes, [
    { type: "heading", stop: "exhausted" },
    { type: "heading", stop: "cap" },
    { type: "link", stop: "repeat" },
  ]);
  assert.equal(truncatedSweeps(outcomes).length, 1);
});

test("requirement 4 names the exact stack, because support is only demonstrated for it", () => {
  const [, , , supported] = conformanceScope(CLEAN);
  assert.match(supported.establishes, /NVDA 2026\.1\.1 driving Edge 141/);
  assert.match(supported.limitation, /that one combination only/);
  // Without a browser it must degrade to naming the screen reader alone, not print "undefined".
  const noBrowser = conformanceScope({ ...CLEAN, browser: null })[3];
  assert.match(noBrowser.establishes, /NVDA 2026\.1\.1 actually announced/);
  assert.doesNotMatch(noBrowser.establishes, /undefined|null/);
});

test("requirement 5 names which of the four non-interference criteria went unchecked", () => {
  // These apply to ALL content whether or not it is relied upon, so silence about them is the exact
  // gap §5.2.5 exists to close.
  const [, , , , nonInterference] = conformanceScope(CLEAN);
  assert.match(nonInterference.establishes, /2\.1\.2/);
  assert.match(nonInterference.limitation, /NOT assessed: 1\.4\.2, 2\.2\.2, 2\.3\.1/);
  assert.match(nonInterference.limitation, /whether or not/);
});

test("CAPTURING focus-order evidence does not count as assessing 2.1.2", () => {
  // The trap this asserts against, and the project made it in its own docs: `interaction.focusOrder` is
  // captured by the worker and read by no rule and no scorer head, so a keyboard trap in that array
  // reaches nobody. Only `assessedCriteria` counts — a criterion is covered when something can return a
  // finding for it, not when bytes about it exist.
  const [, , , , nonInterference] = conformanceScope({ ...CLEAN, assessedCriteria: ["1.1.1"] });
  assert.match(nonInterference.limitation, /NOT assessed: 1\.4\.2, 2\.1\.2, 2\.2\.2, 2\.3\.1/);
  assert.match(nonInterference.establishes, /None of the four/);
});

test("requirement 5 says whether the layer that owns 2.3.1 actually ran", () => {
  // "The other layer handles it" is only true if the other layer ran; otherwise it is an unchecked
  // criterion wearing a delegation.
  assert.match(conformanceScope(CLEAN)[4].limitation, /rule-based layer, which ran/);
  assert.match(conformanceScope({ ...CLEAN, ruleLayerRan: false })[4].limitation,
    /rule-based layer, which did NOT run/);
});

test("the four non-interference criteria are the ones WCAG names", () => {
  // Pinned against the spec, so an edit cannot quietly drop one.
  assert.deepEqual([...NON_INTERFERENCE_CRITERIA], ["1.4.2", "2.1.2", "2.2.2", "2.3.1"]);
});

test("the report says plainly that it is NOT a conformance claim", () => {
  // §5.3 specifies what a claim must carry, and two of the five components are the author's determination
  // about their own site rather than anything a tool can observe. A document listing WCAG criteria,
  // evidence and a date looks exactly like a claim to a reader who has not read §5.3.
  const disclaimer = notAConformanceClaim();
  assert.match(disclaimer.name, /not a conformance claim/i);
  assert.match(disclaimer.limitation, /relied upon/i, "must name the components only the author can supply");
  assert.match(disclaimer.limitation, /no level is asserted/i);
});

test("requirement 2 admits one viewport, iframes, and single-URI application states", () => {
  // Three separate things WCAG counts as part of "the full page" that we do not reach. The third is the
  // least obvious: an application at one URI is ONE page, so its dialogs and wizard steps belong to it.
  const [, fullPages] = conformanceScope(CLEAN);
  assert.match(fullPages.limitation, /viewport/i);
  assert.match(fullPages.limitation, /iframes/i);
  assert.match(fullPages.limitation, /without a URL change/i);
});

test("requirement 3 admits third-party content, which §5.4 exists for", () => {
  const [, , processes] = conformanceScope(CLEAN);
  assert.match(processes.limitation, /third-party/i);
  assert.match(processes.limitation, /cannot control/i);
});

test("requirement 4 admits one language and one technology configuration", () => {
  // §5.5 requires each language offered to conform on its own, and §5.2.5 requires conformance with the
  // technology turned off or unsupported. We do neither, and silence about them would read as coverage.
  const [, , , supported] = conformanceScope(CLEAN);
  assert.match(supported.limitation, /language/i);
  assert.match(supported.limitation, /turned OFF|unsupported/i);
});
