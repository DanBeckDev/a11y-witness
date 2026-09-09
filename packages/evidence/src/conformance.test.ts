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
import { documentIdentity } from "./document-identity.js";

import {
  conformanceScope,
  notAConformanceClaim,
  NON_INTERFERENCE_CRITERIA,
  sweepOutcomes,
  truncatedSweeps, sweepCoverage, censusCountsDistinctNames, censusFromDiagnostics, censusElementCounts,
  activationBudgetFromDiagnostics, type ConformanceScopeInput,
  censusTargetMismatchReason, examinationState } from "./conformance.js";

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

test("a truncated FOCUS probe is reported like a truncated sweep", () => {
  // It is not a quick-nav sweep, but it stops after a fixed number of Tab presses and the consequence is
  // the same: a keyboard trap past that point was never looked for. 2.1.2 must not read as passed.
  const outcomes = sweepOutcomes([
    { event: "focusOrder", stops: 12, truncated: true, stalled: false },
    { event: "focusOrder", stops: 4, truncated: false, stalled: false },
  ]);
  assert.deepEqual(outcomes, [{ type: "focusOrder", stop: "cap" }]);
  assert.equal(truncatedSweeps(outcomes).length, 1);
});

/**
 * Measured coverage — the number that replaces the word "INCOMPLETE".
 *
 * A real page reported `link (cap)` and the report could only say examination was incomplete. A reader cannot
 * act on that: missing two links and missing two hundred are the same sentence. The census is the browser's own
 * element count, so the reach can be stated — and when the census is absent that must read as UNKNOWN, never as
 * full coverage, which is this project's first rule applied to its own reporting.
 */
test("states reach per type against the browser's own count", () => {
  const coverage = sweepCoverage({
    assessedCriteria: [], screenReader: "NVDA", ruleLayerRan: true,
    census: { heading: 10, landmark: 5, link: 57, graphic: 12 },
    swept: { heading: 10, landmark: 5, link: 46, graphic: 12 },
  });
  assert.deepEqual(coverage.find((c) => c.type === "link"),
    // `examined: "examined"` with NO sweep outcomes given, and that is the deliberate default (#677):
    // a capture predating the stop marks must not be relabelled as truncated on a field it never had.
    // `reachable === present` with no raw census supplied: both denominators fall back to the same
    // number, which is exactly what a capture predating `censusElements` must keep doing.
    { type: "link", reached: 46, present: 57, reachable: 57, complete: false, examined: "examined" });
  assert.equal(coverage.every((c) => c.type === "link" || c.complete), true);
});

test("a missing census yields NO coverage claim, not a claim of full coverage", () => {
  assert.deepEqual(sweepCoverage({
    assessedCriteria: [], screenReader: "NVDA", ruleLayerRan: true,
    census: null, swept: { link: 46 },
  }), []);
});

test("a failed census makes the report say coverage is UNKNOWN", () => {
  const [, fullPages] = conformanceScope({
    assessedCriteria: ["1.1.1"], screenReader: "NVDA", ruleLayerRan: true,
    sweeps: [{ type: "link", stop: "exhausted" }], census: null, swept: { link: 46 },
  });
  assert.match(fullPages.establishes + fullPages.limitation, /coverage could not be measured/i);
});

test("reaching MORE than the census counted is not a coverage gap", () => {
  // The two walk different trees: the sweep walks what the screen reader exposes, the census walks the AX
  // tree, and a link inside a list can be announced twice. Calling that incomplete would report a defect in
  // the page for a disagreement between two measuring instruments.
  const [link] = sweepCoverage({
    assessedCriteria: [], screenReader: "NVDA", ruleLayerRan: true,
    census: { link: 40 }, swept: { link: 46 },
  });
  assert.equal(link.complete, true);
});

test("types with no census entry are omitted rather than given an invented denominator", () => {
  const coverage = sweepCoverage({
    assessedCriteria: [], screenReader: "NVDA", ruleLayerRan: true,
    census: { link: 10 }, swept: { link: 10, formField: 13, list: 4 },
  });
  assert.deepEqual(coverage.map((c) => c.type), ["link"]);
});

test("THE COVERAGE SENTENCE COMPARES LIKE WITH LIKE when the census has distinct names", () => {
  // Its own comment has named this since it was written: the sweep deduplicates by announcement, so 66
  // images with 47 distinct alt values were reported as "5 of 66" — "understating our own coverage is the
  // safe direction to be wrong in, but it is still wrong". `census.distinct` is the number that fixes it.
  const scope = conformanceScope({
    assessedCriteria: ["1.1.1"], screenReader: "NVDA 2026.1", ruleLayerRan: false,
    census: { graphic: 47 }, swept: { graphic: 47 }, censusCountsDistinctNames: true,
  } as never);
  const text = JSON.stringify(scope);
  assert.match(text, /DISTINCT NAMES the browser/, "the sentence must say which denominator it used");
  assert.match(text, /like compared with like/);
});

test("an older capture keeps the honest caveat, rather than claiming a comparison it cannot make", () => {
  // Absent `distinct` is not a licence to pretend. Every capture before 2026-08-29 is in this state.
  const scope = conformanceScope({
    assessedCriteria: ["1.1.1"], screenReader: "NVDA 2026.1", ruleLayerRan: false,
    census: { graphic: 66 }, swept: { graphic: 5 },
  } as never);
  assert.match(JSON.stringify(scope), /identical announcements collapse/);
});

test("censusCountsDistinctNames reads the MARK, and absence is false rather than a throw", () => {
  assert.equal(censusCountsDistinctNames([{ event: "structureCensus", distinct: { link: 3 } }]), true);
  assert.equal(censusCountsDistinctNames([{ event: "structureCensus", link: 3 }]), false,
    "a census without `distinct` cannot support the like-for-like sentence");
  assert.equal(censusCountsDistinctNames([]), false);
});

test("censusFromDiagnostics PREFERS the distinct-name count, which is what the sweep can be compared with", () => {
  // The test above asserts the SENTENCE and feeds `conformanceScope` a census directly, so it never
  // exercised the merge — a mutation removing the merge left it green. Caught by mutation, not by reading:
  // a test that cannot see its own subject disabled is the shape this repo keeps paying for.
  const census = censusFromDiagnostics([
    { event: "structureCensus", graphic: 66, link: 58, distinct: { graphic: 47, link: 51 } },
  ]);
  assert.equal(census?.graphic, 47, "66 elements collapse to 47 distinct alt values; the sweep sees 47");
  assert.equal(census?.link, 51);
});

// --- #685/#691: calendly's OAuth-redirected census, "reach 44/1" printed and quoted as evidence ---

/**
 * `runs/witness/2026-09-09T08-12-27-003Z-calendly-com.json`, verbatim (`runs/` is gitignored and not
 * available in CI — the same reason `verify.test.ts` pins the `w3.org` and `tfl.gov.uk` real-page shapes
 * as literal fixtures rather than reading a file). The form probe activated calendly's own "Continue with
 * Google" button (`interaction.formChanges`: `{control:"Continue with Google, button", kind:"submit",
 * after:"unavailable, busy"}`), which navigated to `accounts.google.com`'s sign-in screen BEFORE the
 * census ran — `structural` (the sweep) read 44 real calendly headings, `structureCensus` (taken later, at
 * the time this fix closes) read Google's page: `heading:1, link:5, targetMatch:"fallback", candidates:1`.
 * 10:42Z re-ran the identical script on a redeployed fleet and produced byte-identical numbers; 10:50Z
 * with `probeForms` off navigated nowhere and its census (`targetMatch:"fallback", candidates:2` — the
 * ambiguity is calendly's own CDP target resolution, not proof of navigation) agreed with its own 44/46
 * sweep. Confirmed live by reading all three files before writing this fixture, not assumed from the
 * incident report.
 */
const CALENDLY_08_12Z_CENSUS = [
  { event: "structureCensus", atMs: 258312, landmark: 2, heading: 1, link: 5, graphic: 1, formControl: 6,
    targetMatch: "fallback", candidates: 1,
    targetUrl: "https://accounts.google.com/v3/signin/identifier?...",
    expectedUrl: "https://calendly.com/" },
];
const CALENDLY_08_12Z_SWEPT = { heading: 44, landmark: 19, link: 0, graphic: 0 };
const CALENDLY_08_12Z_ROUTE_CHANGE = {
  control: "Privacy Policy, visited, link",
  titleBefore: "Sign in - Google Accounts",
  titleAfter: "Privacy Notice Calendly - Profile 1 - Microsoft​ Edge",
};

test("censusFromDiagnostics REFUSES a fallback-target census outright, not just a failed one", () => {
  assert.equal(censusFromDiagnostics(CALENDLY_08_12Z_CENSUS), null,
    "a census that could not confirm its own target must read as 'coverage unknown', the same as no "
    + "census at all -- never as a real, small page");
});

test("MUTATION TARGET: censusTargetMismatchReason names the mismatch on the real 08:12Z capture, with "
  + "both numbers", () => {
  const reason = censusTargetMismatchReason(CALENDLY_08_12Z_CENSUS, CALENDLY_08_12Z_SWEPT);
  assert.ok(reason, "a fallback-target census must produce a reason, not silently agree with the sweep");
  assert.match(reason as string, /44 swept against 1 the census claims/,
    "the exact numbers that were printed and quoted as evidence today must be traceable in the refusal");
  assert.match(reason as string, /UNKNOWN/, "coverage must read as unknown, not as a small real page");
  assert.doesNotMatch(reason as string, /form probe/i,
    "the cause is named from THIS capture's own recorded evidence, never a hardcoded mechanism a report "
    + "reader cannot actually see run");
});

test("the routeChange title transition is quoted verbatim when this capture recorded one", () => {
  const reason = censusTargetMismatchReason(CALENDLY_08_12Z_CENSUS, CALENDLY_08_12Z_SWEPT,
    CALENDLY_08_12Z_ROUTE_CHANGE);
  assert.match(reason as string, /"Sign in - Google Accounts" to "Privacy Notice Calendly/,
    "an observed fact this capture already recorded, not an inferred cause");
});

test("no routeChange evidence -- the reason still fires, just without the title note", () => {
  const reason = censusTargetMismatchReason(CALENDLY_08_12Z_CENSUS, CALENDLY_08_12Z_SWEPT, null);
  assert.ok(reason);
  assert.doesNotMatch(reason as string, /titleBefore|undefined/i);
});

test("a MATCHED target (hubspot/ikea's own shape) is never refused, even with a real coverage gap", () => {
  // hubspot's real capture the same session: sweep found 1 heading against the (TRUSTED, matched) census's
  // 28 -- a genuine 'reached almost none of this page' finding, not a mismatched document. The refusal
  // must not fire here, or a real, useful finding would be silently swallowed by this fix.
  const matched = [{ event: "structureCensus", heading: 28, targetMatch: "matched", candidates: 1 }];
  assert.equal(censusTargetMismatchReason(matched, { heading: 1 }), null);
  assert.equal(censusFromDiagnostics(matched)?.heading, 28, "a matched census is trusted as before");
});

test("a census that predates `targetMatch` entirely is trusted as before -- this field cannot "
  + "retroactively accuse a capture it was never computed for", () => {
  const noTargetMatch = [{ event: "structureCensus", heading: 40 }];
  assert.equal(censusTargetMismatchReason(noTargetMatch, { heading: 40 }), null);
  assert.equal(censusFromDiagnostics(noTargetMatch)?.heading, 40);
});

test("the full report over the real 08:12Z capture states the refusal, never 'reached in full'", () => {
  const scope = conformanceScope({
    assessedCriteria: ["1.3.1"], screenReader: "NVDA 2026.1.1", ruleLayerRan: false,
    census: censusFromDiagnostics(CALENDLY_08_12Z_CENSUS), swept: CALENDLY_08_12Z_SWEPT,
    censusMismatchReason: censusTargetMismatchReason(CALENDLY_08_12Z_CENSUS, CALENDLY_08_12Z_SWEPT,
      CALENDLY_08_12Z_ROUTE_CHANGE),
  } as never);
  const text = JSON.stringify(scope);
  assert.match(text, /44 swept against 1 the census claims/);
  // The exact OLD success-claim sentence `coverageSentence` prints when every type's `complete` reads
  // true -- not the bare phrase, which this fix's own explanation legitimately quotes.
  assert.doesNotMatch(text, /Every type with ground truth was reached in full/,
    "the old, misleading claim this fix exists to stop printing over a page that was never examined");
});

test("and falls back to the element count when the capture predates `distinct`", () => {
  const census = censusFromDiagnostics([{ event: "structureCensus", graphic: 66 }]);
  assert.equal(census?.graphic, 66, "an older capture keeps its only number, and the sentence says so");
});


// --- #677: the absence of a measurement is not the measurement zero ---

test("NOT EXAMINED is distinct from found-nothing, and PARTIAL is distinct from both -- the three states "
  + "read off the stop reasons every capture already carries", () => {
  // The real shape of `2026-09-09T08-20-19-020Z-www-ikea-com.json`: one sweep spent the whole budget and
  // five never ran. `formField` is the case a BINARY would report wrongly -- it also stopped on
  // `deadline`, and it found 100.
  assert.equal(examinationState(["exhausted", "exhausted"], 80), "examined");
  assert.equal(examinationState(["deadline", "deadline"], 100), "partial",
    "it examined a great deal and then ran out; calling that NOT EXAMINED is false in the other direction");
  assert.equal(examinationState(["deadline", "deadline"], 0), "not-examined");
  assert.equal(examinationState(["exhausted", "deadline"], 0), "not-examined",
    "a sweep walks both directions and either can truncate independently");
  assert.equal(examinationState([undefined, undefined], 0), "examined",
    "a capture predating the stop marks has no stop reason, and reading that silence as truncation would "
    + "relabel the whole corpus on a field that did not exist when it was taken");
});

test("THE REPORT SAYS SO: a type whose sweep never ran renders as NOT EXAMINED, never as `0/340` -- the "
  + "sentence a reader acts on is where this defect was survivable", () => {
  const input = {
    assessedCriteria: ["1.1.1"], screenReader: "NVDA", ruleLayerRan: true,
    census: { heading: 80, link: 340 },
    swept: { heading: 80, link: 0 },
    sweeps: [
      { type: "heading", stop: "exhausted" }, { type: "heading", stop: "exhausted" },
      { type: "link", stop: "deadline" }, { type: "link", stop: "deadline" },
    ],
  };
  const sentence = conformanceScope(input).map((r) => r.establishes + " " + r.limitation).join(" ");
  assert.match(sentence, /link NOT EXAMINED \(of 340\)/,
    "`link 0/340` is a true number answering a question nobody asked: it reads as a coverage shortfall "
    + "and means the capture is truncated");
  assert.match(sentence, /TRUNCATED/);
  assert.doesNotMatch(sentence, /link 0\/340/);
  assert.match(sentence, /heading 80\/80/, "a type that DID run still reports its reach normally");
});

/**
 * #687 — Requirement 2 has always said "one viewport, one state, one document" without saying WHICH.
 */
test("Full pages names the document the report describes, and omits the sentence when nobody read one", () => {
  const base = { assessedCriteria: ["1.1.1"], screenReader: "NVDA 2024.4", ruleLayerRan: false };
  const identified = conformanceScope({
    ...base,
    documentIdentity: documentIdentity({ diagnostics: [
      { event: "structureCensus", targetUrl: "https://calendly.com/scheduling", targetMatch: "fallback" },
      { event: "domCensus", tabbable: 98, heading: 28 },
      { event: "titleSource", title: "Automated scheduling software", source: "document" },
    ] }),
  }).find((r) => r.number === 2)!;
  assert.match(identified.limitation, /served https:\/\/calendly\.com\/scheduling/);
  assert.match(identified.limitation, /tabbable=98/);

  // ABSENT MEANS ABSENT. A report that named "the page you asked for" from a reading nobody took would be
  // the claim this whole row exists to stop something making.
  const anonymous = conformanceScope(base).find((r) => r.number === 2)!;
  assert.doesNotMatch(anonymous.limitation, /Document /);
  assert.doesNotMatch(anonymous.limitation, /NOT RECORDED/);
});

/**
 * #677 — TWO DENOMINATORS, BECAUSE "NOT EXAMINED (of N)" AND "reach R/N" ASK DIFFERENT QUESTIONS.
 *
 * `distinct` collapses by NAME and an element with no name counts as its own, so on a page with unnamed
 * graphics it is nearly the element count. Measured 2026-09-09: calendly `graphic=63, graphicUnnamed=38,
 * distinct.graphic=61` (two collapsed); ikea `graphic=205, graphicUnnamed=0, distinct.graphic=165`
 * (forty collapsed, correctly).
 */
const calendlyGraphics = {
  assessedCriteria: [], screenReader: "NVDA", ruleLayerRan: true,
  census: { graphic: 61 },                                  // distinct-overlaid, as the reader produces it
  censusElements: { graphic: 63, graphicUnnamed: 38 },       // raw, straight off the mark
  swept: { graphic: 10 },
};

test("reach excludes what a sweep could never announce; NOT EXAMINED counts every element", () => {
  const [graphic] = sweepCoverage(calendlyGraphics);
  assert.equal(graphic.present, 63, "NOT EXAMINED asks how much of the page went unlooked-at");
  assert.equal(graphic.reachable, 23, "61 distinct minus 38 unnamed — distinct names among NAMED elements");
  assert.equal(graphic.reached, 10);
  assert.equal(graphic.complete, false);
});

test("the sentence states both numbers, so neither denominator can be mistaken for the other", () => {
  const sentence = conformanceScope({ ...calendlyGraphics, sweeps: [] })
    .find((r) => r.number === 2)!.establishes;
  assert.match(sentence, /graphic 10\/23 of 63 on the page/);
});

test("without the raw census, both denominators fall back and the report is unchanged", () => {
  // A capture predating `censusElements` must read exactly as it always did. Reporting a NEW number on an
  // OLD capture would be this project's own defect — a value invented from an absent measurement.
  const [graphic] = sweepCoverage({ ...calendlyGraphics, censusElements: null });
  assert.equal(graphic.present, 61);
  assert.equal(graphic.reachable, 61);
  const sentence = conformanceScope({ ...calendlyGraphics, censusElements: null, sweeps: [] })
    .find((r) => r.number === 2)!.establishes;
  assert.match(sentence, /graphic 10\/61/);
  assert.doesNotMatch(sentence, /on the page/);
});

test("a type with every element named is untouched by the correction", () => {
  // ikea's graphics: 205 raw, 0 unnamed, 165 distinct. The dedupe is real name-collapsing and must survive.
  const [graphic] = sweepCoverage({
    assessedCriteria: [], screenReader: "NVDA", ruleLayerRan: true,
    census: { graphic: 165 }, censusElements: { graphic: 205, graphicUnnamed: 0 }, swept: { graphic: 165 },
  });
  assert.equal(graphic.reachable, 165, "nothing unnamed, so nothing to subtract");
  assert.equal(graphic.present, 205);
  assert.equal(graphic.complete, true, "reaching every NAMED graphic is complete reach");
});

test("a nonsense denominator is clamped rather than printed", () => {
  // The two numbers come from one mark and cannot disagree today. A reach of "10/-3" would render rather
  // than fail, and a nonsense number in a report is worse than a conservative one.
  const [graphic] = sweepCoverage({
    assessedCriteria: [], screenReader: "NVDA", ruleLayerRan: true,
    census: { graphic: 5 }, censusElements: { graphic: 9, graphicUnnamed: 9 }, swept: { graphic: 1 },
  });
  assert.equal(graphic.reachable, 0);
});

test("censusElementCounts returns the RAW counts, with no distinct laid over them", () => {
  const raw = censusElementCounts([
    { event: "structureCensus", graphic: 63, graphicUnnamed: 38, link: 76, distinct: { graphic: 61 } }]);
  assert.equal(raw?.graphic, 63, "the distinct overlay must not reach this reader");
  assert.equal(raw?.graphicUnnamed, 38, "the unnamed count is what `reachable` subtracts");
  assert.equal(censusElementCounts([{ event: "structureCensus", error: "CDP listed no page target" }]), null,
    "a failed census is not a reading");
  assert.equal(censusElementCounts([]), null);
});

/**
 * #677 part 2 — A CONTROL THE BUDGET REFUSED AND A CONTROL THAT SAID NOTHING PRODUCE THE SAME EVIDENCE.
 */
const withBudget = (budget: ConformanceScopeInput["activationBudget"]) =>
  conformanceScope({ assessedCriteria: [], screenReader: "NVDA", ruleLayerRan: true, sweeps: [],
    activationBudget: budget }).find((r) => r.number === 2)!.limitation;

test("an exhausted activation budget is reported as NOT ACTIVATED, with the count", () => {
  const said = withBudget({ fields: 100, allowed: 60, skipped: 40, exhausted: true });
  assert.match(said, /40 of 100 form control\(s\) were NOT ACTIVATED/);
  assert.match(said, /statement about this capture and not about the page/);
});

test("a budget that covered every control says so, rather than saying nothing", () => {
  // ALWAYS PRINTED, including the good case. A line that appears only when something went wrong cannot
  // tell "nothing went wrong" from "nobody looked" — the distinction this whole row is about.
  const said = withBudget({ fields: 12, allowed: 12, skipped: 0, exhausted: false });
  assert.match(said, /Every one of the 12 form control\(s\) found was offered/);
  assert.doesNotMatch(said, /NOT ACTIVATED/);
});

test("no budget, or no controls, states nothing at all", () => {
  // A configured form activates exactly the control the author named and keeps no budget; a page with no
  // form controls consulted none. Neither is a coverage claim, and inventing one would be the defect.
  assert.doesNotMatch(withBudget(null), /activation probe|NOT ACTIVATED|form control/);
  assert.doesNotMatch(withBudget({ fields: 0, allowed: 0, skipped: 0, exhausted: false }),
    /activation probe|NOT ACTIVATED|form control/);
});

test("activationBudgetFromDiagnostics reads the mark, and absence is null rather than a zeroed budget", () => {
  const read = activationBudgetFromDiagnostics([
    { event: "activationBudget", budgetMs: 175000, spentMs: 175200, allowed: 60, skipped: 40,
      exhausted: true, fields: 100 }]);
  assert.deepEqual(read, { fields: 100, allowed: 60, skipped: 40, exhausted: true });
  assert.equal(activationBudgetFromDiagnostics([]), null,
    "a capture with no mark has no budget — not a budget of zero, which would claim it covered everything");
});
