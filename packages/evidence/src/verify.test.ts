// The verification layer's job is to refuse evidence that only looks like evidence.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  captureDoubt, captureHasSubstance, captureIsSelfConsistent, captureMentionsTitle,
  captureRanRequestedProbes, probeStates, captureReachedThePage,
} from "./verify.js";

const TITLE = "Aquarium 001 schedule";
const empty = { headings: [], landmarks: [], formFields: [] };

test("a capture of only the document title has no substance", () => {
  // The real shape of the failure: 2 of 5 captures on a live worker looked exactly like this, and
  // captureMentionsTitle accepts them because the title IS the transcript.
  const degenerate = { transcript: [TITLE], structure: empty };
  assert.equal(captureMentionsTitle(degenerate, TITLE), true, "the title check cannot catch this");
  assert.equal(captureHasSubstance(degenerate, TITLE), false);
});

test("the title repeated is still not substance", () => {
  const repeated = { transcript: [TITLE, TITLE, "  " + TITLE + " "], structure: empty };
  assert.equal(captureHasSubstance(repeated, TITLE), false);
});

test("one phrase beyond the title is substance", () => {
  const real = { transcript: [TITLE, "heading, level 1, Aquarium 001 schedule"], structure: empty };
  assert.equal(captureHasSubstance(real, TITLE), true);
});

test("a structural element alone is substance", () => {
  // A page read by quick-nav but not line-by-line is unusual, not empty.
  const structural = { transcript: [TITLE], structure: { ...empty, headings: ["Aquarium, heading, level 1"] } };
  assert.equal(captureHasSubstance(structural, TITLE), true);
});

test("an interaction result alone is substance", () => {
  const interactive = {
    transcript: [TITLE],
    structure: empty,
    interaction: { controls: [], stateChanges: [{ control: "button, collapsed", after: "button, expanded" }] },
  };
  assert.equal(captureHasSubstance(interactive, TITLE), true);
});

test("a wholly empty capture has no substance", () => {
  assert.equal(captureHasSubstance({ transcript: [], structure: empty }, TITLE), false);
});

test("a capture that heard a heading but swept none contradicts itself", () => {
  // The real shape, from a live worker: the read-through announced the h1 and then advanced nowhere,
  // and the heading sweep found nothing. Both other checks pass on it.
  const degenerate = {
    transcript: ["heading, level 1, Aquarium 001 schedule"],
    structure: { headings: [], landmarks: [], formFields: [] },
  };
  assert.equal(captureMentionsTitle(degenerate, TITLE), true, "title check cannot catch this");
  assert.equal(captureHasSubstance(degenerate, TITLE), true, "substance check cannot catch this either");
  assert.equal(captureIsSelfConsistent(degenerate), false);
});

test("headings swept but none in the transcript is normal", () => {
  // The read-through is capped by `steps` and may stop before reaching a heading. Only the reverse
  // is a contradiction.
  const fine = {
    transcript: ["some body text"],
    structure: { headings: ["Aquarium, heading, level 1"], landmarks: [], formFields: [] },
  };
  assert.equal(captureIsSelfConsistent(fine), true);
});

test("a consistent capture passes", () => {
  const good = {
    transcript: ["heading, level 1, Aquarium 001 schedule", "table, with 2 rows"],
    structure: { headings: ["Aquarium 001 schedule, heading, level 1"], landmarks: [], formFields: [] },
  };
  assert.equal(captureIsSelfConsistent(good), true);
});

// Measured shape: `["blank","blank"]` -- NVDA reading an empty document.
const BLANK_CAPTURE = {
  transcript: ["blank", "blank"],
  structure: { headings: [], landmarks: [], formFields: [] },
};

test("a transcript of only NVDA's \"blank\" has no substance", () => {
  assert.equal(captureHasSubstance(BLANK_CAPTURE, TITLE), false);
});

test("a distinctive title catches the blank capture before substance has to", () => {
  // Worth stating so nobody assumes the substance check is load-bearing for every blank capture.
  assert.equal(captureMentionsTitle(BLANK_CAPTURE, TITLE), false);
});

test("a title of common words is where the substance check earns its place", () => {
  // captureMentionsTitle is lenient by design: "Home page" has no distinctive word to look for, so it
  // passes anything. Substance is the only check left standing.
  assert.equal(captureMentionsTitle(BLANK_CAPTURE, "Home page"), true);
  assert.equal(captureHasSubstance(BLANK_CAPTURE, "Home page"), false);
});

test("\"blank\" among real content is fine", () => {
  // Pages legitimately contain empty lines; only a transcript that is ENTIRELY blank is the fault.
  const mixed = { transcript: ["blank", "heading, level 1, Aquarium"], structure: { headings: [], landmarks: [], formFields: [] } };
  assert.equal(captureHasSubstance(mixed, TITLE), true);
});

test("a requested table probe that found no cells is incomplete", () => {
  const noCells = {
    transcript: ["heading, level 1, Train timetable", "table, with 2 rows and 3 columns"],
    structure: { headings: ["Train timetable, heading, level 1"], landmarks: [], formFields: [], tableCells: [] },
  };
  assert.equal(captureRanRequestedProbes(noCells, { probeTables: true }), false);
  assert.equal(captureRanRequestedProbes(noCells, { probeTables: false }), true);
});

test("a table probe that found cells passes", () => {
  const withCells = {
    transcript: ["heading, level 1, Train timetable"],
    structure: { headings: [], landmarks: [], formFields: [], tableCells: ["column 2, 09:15"] },
  };
  assert.equal(captureRanRequestedProbes(withCells, { probeTables: true }), true);
});

// --- The gov.uk false refusal, and the overlay that must still be caught ---
//
// Both shapes below are real, taken from captures on this machine. They are a pair on purpose: the fix
// for the first must not weaken the second, and the two differ only in whether what NVDA said has
// anything to do with the page.

/** gov.uk's own accessible names, as the CDP census recorded them. */
const GOVUK_NAMES = [
  "Welcome to GOV.UK", "Cookies on GOV.UK", "Skip to main content", "Accept additional cookies",
  "Reject additional cookies", "View cookies", "The best place to find government services and information",
];

const census = (names: string[]) => [{ event: "structureCensus", names }];

test("a capture that READ the page is accepted even when no title word appears in it", () => {
  // "Welcome to GOV.UK" yields exactly one word that can vote — `gov` is 3 characters and `uk` is 2 —
  // and `welcome` is in the <title> only. The h1 is "The best place to find government services and
  // information". Before the page's own names were consulted this exact capture was reported as
  // "could not read this page", so the Action refused to report findings about a page it had read.
  const capture = {
    transcript: [
      "heading, level 2, Cookies on GOV dot UK",
      "button, Accept additional cookies",
      "main landmark, heading, level 1, The best place to find government services and information",
    ],
    diagnostics: census(GOVUK_NAMES),
  };
  assert.equal(captureMentionsTitle(capture, "Welcome to GOV.UK"), true);
});

test("Edge's image-magnifier overlay is STILL rejected, on the same page and title", () => {
  // The fault this gate exists for. Ctrl twice over an image opens Edge's magnifier, and NVDA reads the
  // overlay: the run then reported a 4.1.2 finding about the browser's own Zoom In and Rotate buttons as
  // though gov.uk were at fault. None of those is a gov.uk accessible name, so overlap is zero.
  const capture = {
    transcript: ["Image Magnify, document", "Zoom In, button", "Rotate, button", "Close, button"],
    diagnostics: census(GOVUK_NAMES),
  };
  assert.equal(captureMentionsTitle(capture, "Welcome to GOV.UK"), false,
    "blaming a page for its browser is the one thing this gate must prevent");
});

test("ONE page name heard is not enough to vouch for a capture", () => {
  // Two independent long names is not a coincidence; one can be. "Skip to main content" in particular is
  // boilerplate that appears on a great many pages, so it cannot be the sole proof of which page was read.
  const capture = {
    transcript: ["Image Magnify, document", "link, Skip to main content"],
    diagnostics: census(GOVUK_NAMES),
  };
  assert.equal(captureMentionsTitle(capture, "Welcome to GOV.UK"), false);
});

test("a short accessible name cannot vouch for a capture at all", () => {
  // "View cookies" is 12 characters and counts; anything shorter sits in browser chrome as readily as in
  // a page. Without a length floor, a magnifier overlay announcing "Close" and "Zoom In" could match a
  // page that happens to have buttons of those names.
  const capture = {
    transcript: ["Image Magnify, document", "Close, button", "Zoom In, button"],
    diagnostics: census(["Close", "Zoom In", "Search", "Home", "Menu"]),
  };
  assert.equal(captureMentionsTitle(capture, "Welcome to GOV.UK"), false);
});

test("with no census the check behaves exactly as it did before", () => {
  // Every capture already on disk predates the census mark, and a capture from an older worker has no
  // diagnostics at all. The new route must be unreachable for those rather than throwing or, worse,
  // silently accepting them.
  assert.equal(captureMentionsTitle({ transcript: ["blank", "blank"] }, "Welcome to GOV.UK"), false);
  assert.equal(captureMentionsTitle({ transcript: ["heading, level 1, Welcome"] }, "Welcome to GOV.UK"), true);
});

// --- The consent wall: right page, right title, almost none of it read ---

const censusHeadings = (heading: number, names: string[] = []) =>
  [{ event: "structureCensus", heading, names }];

test("a capture held inside a consent modal is REJECTED, though every other gate passes", () => {
  // theregister.com, measured: the page exposes 463 headings, 793 links and 13 landmarks; the sweep
  // reached 1 heading, 0 links and 0 landmarks, because the consent dialog traps focus and quick
  // navigation cannot leave it. The URL was right, the title was right, and "Register" appears in the
  // dialog's own text — so the title gate passed and the run reported "No lived-experience findings"
  // about a page it had never seen.
  const walled = {
    transcript: ["button, Close", "heading, level 2, The Register asks for your consent to use your personal data to:"],
    structure: { headings: ["heading, level 2, The Register asks for your consent"], landmarks: [], formFields: [] },
    diagnostics: censusHeadings(463),
  };
  assert.equal(captureMentionsTitle(walled, "The Register: Enterprise Technology News"), true,
    "the title gate genuinely cannot see this — that is why a second gate exists");
  assert.equal(captureReachedThePage(walled), false);
  assert.equal(captureDoubt(walled, "The Register: Enterprise Technology News"), "contained");
});

test("a healthy capture of a big page is accepted", () => {
  // gov.uk, measured: 38 headings exposed, 37 reached.
  const healthy = {
    transcript: [
      "heading, level 2, Cookies on GOV dot UK",
      "button, Accept additional cookies",
      "main landmark, heading, level 1, The best place to find government services and information",
    ],
    structure: { headings: Array.from({ length: 37 }, (_, i) => `heading, level 2, section ${i}`), landmarks: [], formFields: [] },
    // Real census names, because the title "Welcome to GOV.UK" offers only the word `welcome` and the
    // page never says it — the names route is what verifies this capture, and a fixture without them
    // tests the wrong thing. (It did, and this test failed against correct code until it carried them.)
    diagnostics: censusHeadings(38, GOVUK_NAMES),
  };
  assert.equal(captureReachedThePage(healthy), true);
  assert.equal(captureDoubt(healthy, "Welcome to GOV.UK"), null);
});

test("a SMALL page cannot be judged on reachability, so it is not", () => {
  // Missing two of three headings says nothing; missing 462 of 463 says everything. Without a floor this
  // gate would fire on the synthetic dataset pages, which have single-figure heading counts.
  const small = { transcript: ["blank"], structure: { headings: [], landmarks: [], formFields: [] }, diagnostics: censusHeadings(3) };
  assert.equal(captureReachedThePage(small), true);
});

test("no census means no verdict on reachability", () => {
  // Every capture taken before the census existed, and any guest whose CDP call failed, lands here. A
  // gate that treats a missing oracle as a failure would reject the entire corpus.
  assert.equal(captureReachedThePage({ transcript: ["x"], structure: { headings: [], landmarks: [], formFields: [] } }), true);
  assert.equal(captureReachedThePage({ transcript: ["x"], diagnostics: [{ event: "structureCensus", error: "CDP listed no page target" }] }), true);
});

test("wrong-content beats contained, because it is the more fundamental doubt", () => {
  // Edge's magnifier overlay: we did not read a fraction of the page, we read a different document.
  const overlay = { transcript: ["Image Magnify, document", "Zoom In, button"], diagnostics: censusHeadings(463) };
  assert.equal(captureDoubt(overlay, "Welcome to GOV.UK"), "wrong-content");
});

/**
 * DID THE TWO PROBES SEE THE SAME PAGE? — determinism-plan D7.
 *
 * The capture has stamped a fingerprint before each probe since D7's first half, and nothing read it. The
 * rules INFERRED the same fact from zero overlap between the channels, which cannot distinguish "the page
 * moved" from "the sweep found nothing" and is silent whenever the two overlap a little.
 */
test("two fingerprints that agree report sameState, and name nothing as changed", () => {
  const states = probeStates({ diagnostics: [
    { event: "pageState", beforeProbe: "sweep", tabbable: 150, heading: 12 },
    { event: "pageState", beforeProbe: "focus", tabbable: 150, heading: 12 },
  ] } as never);
  assert.equal(states?.sameState, true);
  assert.equal(states?.changed, undefined);
});

test("a page whose shape moved reports WHICH counts moved, not merely that something did", () => {
  // nls.uk/join/: the sweep's disclosure probe opens the search panel, and the tab ring collapses.
  const states = probeStates({ diagnostics: [
    { event: "pageState", beforeProbe: "sweep", tabbable: 150, heading: 12 },
    { event: "pageState", beforeProbe: "focus", tabbable: 10, heading: 12 },
  ] } as never);
  assert.equal(states?.sameState, false);
  assert.deepEqual(states?.changed, ["tabbable"]);
});

test("A TICKING CLOCK IS NOT A STATE CHANGE — content moves, structure does not", () => {
  // tfl.gov.uk differs between probe orders by `"now at 17:30" -> "now at 17:34"` and a link's `visited`
  // state. A fingerprint comparing CONTENT would refuse every real site; this one compares shape.
  const states = probeStates({ diagnostics: [
    { event: "pageState", beforeProbe: "sweep", tabbable: 67, link: 51, heading: 9 },
    { event: "pageState", beforeProbe: "focus", tabbable: 67, link: 51, heading: 9 },
  ] } as never);
  assert.equal(states?.sameState, true);
});

test("ONE fingerprint cannot answer the question, and says so rather than saying yes", () => {
  const states = probeStates({ diagnostics: [
    { event: "pageState", beforeProbe: "sweep", tabbable: 150 },
  ] } as never);
  assert.equal(states?.sameState, undefined,
    "a single reading is not agreement — `undefined` is a third answer and rules must read it as such");
  assert.deepEqual(states?.states.sweep, { tabbable: 150 });
});

test("A FAILED CENSUS IS NOT A READING OF ZERO", () => {
  // `markPageState` marks even when the count failed, precisely so "not counted" stays distinguishable
  // from "none". Reading that mark as zeroes would invent a state change on every capture that had one.
  const states = probeStates({ diagnostics: [
    { event: "pageState", beforeProbe: "sweep", tabbable: 150 },
    { event: "pageState", beforeProbe: "focus", error: "not counted" },
  ] } as never);
  assert.equal(states?.sameState, undefined);
  assert.equal(states?.states.focus, undefined);
});

test("a key only ONE probe counted is not a change — that is a census upgrade mid-capture", () => {
  const states = probeStates({ diagnostics: [
    { event: "pageState", beforeProbe: "sweep", tabbable: 40, heading: 3 },
    { event: "pageState", beforeProbe: "focus", heading: 3 },
  ] } as never);
  assert.equal(states?.sameState, true, "only keys every fingerprint carries can be compared");
});

test("a capture with no pageState marks yields null, never a fabricated agreement", () => {
  assert.equal(probeStates({ diagnostics: [{ event: "structureCensus", heading: 4 }] } as never), null);
  assert.equal(probeStates({} as never), null);
});
