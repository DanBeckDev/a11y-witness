// The verification layer's job is to refuse evidence that only looks like evidence.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  captureDoubt, captureHasSubstance, captureIsSelfConsistent, captureMentionsTitle,
  captureRanRequestedProbes, probeStates, sweepCompleteness, captureReachedThePage, domCensus, pageCensus,
} from "./verify.js";
import type { CapturedAnnouncements } from "./verify.js";

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

test("a fingerprint key the old hand-rolled copy ignored is still a page that moved", () => {
  // `gate:probe-order` hand-rolled this comparison over FOUR counts — tabbable, formField, link, heading —
  // hours before `probeStates` existed, and the two lived side by side for a day. `FINGERPRINT_KEYS` has
  // six. So a page whose GRAPHIC or LANDMARK count moved under its own probes was invisible to the copy
  // and is caught here, which is why the dedup is an improvement rather than a tidy-up.
  const states = probeStates({ diagnostics: [
    { event: "pageState", beforeProbe: "sweep", tabbable: 9, formField: 2, link: 5, heading: 3, graphic: 4 },
    { event: "pageState", beforeProbe: "focus", tabbable: 9, formField: 2, link: 5, heading: 3, graphic: 1 },
  ] } as never);
  assert.equal(states?.sameState, false);
  assert.deepEqual(states?.changed, ["graphic"]);
});

/**
 * IS THE SWEEP COMPLETE? — capture-integrity-plan C1.
 *
 * The sweep is a SAMPLE that everything downstream reads as a CENSUS, and when they differ an absence
 * claim describes the walk rather than the page. Comparing them honestly took two corrections: the census
 * counting DISTINCT NAMES rather than elements (75% of named elements on real pages share a name), and
 * then extracting the NAME from each announcement, because the sweep dedupes on the announcement and
 * "Contact, heading, level 2" / "level 3" are two announcements of one name.
 */
test("a sweep that announced every distinct name is EXACT", () => {
  const verdict = sweepCompleteness({
    structure: { headings: ["Overview, heading, level 1", "Contact, heading, level 2"], landmarks: [], formFields: [] },
    diagnostics: [{ event: "structureCensus", distinct: { heading: 2, link: 0, landmark: 0, graphic: 0 } }],
  } as never);
  assert.equal(verdict.heading, "exact");
});

test("TWO ANNOUNCEMENTS OF ONE NAME ARE ONE NAME — the finer gap the census fix exposed", () => {
  // The sweep dedupes on the ANNOUNCEMENT, so a page with "Contact" at two heading levels produces two
  // entries. The census counts names. Comparing lengths would call this a phantom; comparing names does
  // not. Measured on tfl.gov.uk, which reported `heading sweep 23 vs 17` for exactly this reason.
  const verdict = sweepCompleteness({
    structure: { headings: ["Contact, heading, level 2", "Contact, heading, level 3"], landmarks: [], formFields: [] },
    diagnostics: [{ event: "structureCensus", distinct: { heading: 1, link: 0, landmark: 0, graphic: 0 } }],
  } as never);
  assert.equal(verdict.heading, "exact", "two announcements of one name match a census of one name");
});

test("a sweep that missed names is TRUNCATED — the claim absence rules must not rest on", () => {
  // Measured on scotcourts.gov.uk after the census fix: `link sweep 1 vs 22 distinct`. A real failure that
  // the old element-count noise buried.
  const verdict = sweepCompleteness({
    structure: { headings: [], links: ["Judgments, link"], landmarks: [], formFields: [] },
    diagnostics: [{ event: "structureCensus", distinct: { heading: 0, link: 22, landmark: 0, graphic: 0 } }],
  } as never);
  assert.equal(verdict.link, "truncated");
});

test("UNKNOWN IS A VERDICT, and an older capture must never read as EXACT", () => {
  // A census predating `distinct` cannot answer. Absence treated as agreement is the defect this project
  // pays for most often — census.heading absent read as zero, sameState undefined read as false.
  const old = sweepCompleteness({
    structure: { headings: ["A, heading, level 1"], landmarks: [], formFields: [] },
    diagnostics: [{ event: "structureCensus", heading: 4 }],
  } as never);
  assert.equal(old.heading, "unknown");
  const none = sweepCompleteness({ structure: { headings: [], landmarks: [], formFields: [] }, diagnostics: [] } as never);
  assert.equal(none.heading, "unknown");
});

test("AN ENTIRELY UNNAMED SWEEP IS COMPLETE when it reached everything the tree exposes", () => {
  // REVERSED 2026-08-29, and the old assertion is kept in this comment because it was pinning a defect.
  //
  // It read: "AN ENTIRELY UNNAMED SWEEP CANNOT SAY, rather than reading as truncated", asserting
  // `graphic: "unknown"` here. The reasoning was that the census counts unnamed elements while extracting
  // names drops them, so the comparison is meaningless. The remedy chosen was to drop unnamed elements
  // from the sweep side and DECLINE when nothing was left — which fixed the symptom on a page of wholly
  // unnamed elements and created a worse one on every page carrying a MIX.
  //
  // Three named controls and one unnamed compare 3 against a census of 4: TRUNCATED, on a sweep that
  // announced all four. And an unnamed control IS the 4.1.2 and 3.3.2 finding, so the verdict fired on
  // exactly the captures whose finding was present. `assertableSweep` then refused 2.1.1's absence claim
  // and `rules:gate` failed the record — which is how it was found, on the real corpus, after this test
  // had been green for the whole time.
  //
  // The honest comparison is to count unnamed elements on BOTH sides, which is what `census.distinct`
  // already does: "an UNNAMED element has no name to be distinct from, and the sweep still announces it".
  // Three announcements against a census of three is a complete sweep, whether or not it could name them.
  const verdict = sweepCompleteness({
    structure: { headings: [], graphics: ["graphic", "graphic", "graphic"], landmarks: [], formFields: [] },
    diagnostics: [{ event: "structureCensus", distinct: { heading: 0, link: 0, landmark: 0, graphic: 3 } }],
  } as never);
  assert.equal(verdict.graphic, "exact",
    "the sweep announced three graphics and the tree exposes three; being unable to NAME them is the "
    + "1.1.1 finding, not a failure of the sweep");
});

test("A LANDMARK'S NAME IS IN `containers`, NOT `objects` — the channel this got wrong first", () => {
  // `announcement.ts` treats a landmark as CONTEXT by deliberate design: reading one as the object's role
  // once reported three conformant W3C pages as 4.1.2 failures. So `objects[0]` is correctly undefined for
  // "complementary landmark, Related WCAG resources", and the first version of `sweepCompleteness` read
  // `objects` for every type — yielding nothing for 100 of 267 real landmark announcements and reporting
  // `unknown` on essentially every page. It was recorded as a grammar gap. The grammar was right.
  const capture = {
    structure: { landmarks: ["Page Contents, navigation landmark, Page Contents"] },
    diagnostics: [{ event: "structureCensus", distinct: { landmark: 1 } }],
  } as unknown as CapturedAnnouncements;
  assert.equal(sweepCompleteness(capture).landmark, "exact");
});

test("AN UNNAMED LANDMARK COUNTS, because the census counts it per element", () => {
  // "complementary landmark, Related WCAG resources" is an UNNAMED complementary landmark followed by its
  // content. Dropping it — as the name-set does for every other type — would make a page of unnamed
  // landmarks read as truncated, which is a capture defect invented out of the page's own markup.
  const capture = {
    structure: { landmarks: ["complementary landmark, Related WCAG resources", "form, Explore Site by Topic:"] },
    diagnostics: [{ event: "structureCensus", distinct: { landmark: 2 } }],
  } as unknown as CapturedAnnouncements;
  assert.equal(sweepCompleteness(capture).landmark, "exact");
});

test("EVERY landmark container is counted, not just the first", () => {
  // 5% of real entries carry more than one, because NVDA announces the containers it passed through on
  // the way in. Taking `containers[0]` alone would under-count and read as truncated.
  const capture = {
    structure: { landmarks: ["banner landmark, Meta and Search, navigation landmark, list, with 3 items"] },
    diagnostics: [{ event: "structureCensus", distinct: { landmark: 2 } }],
  } as unknown as CapturedAnnouncements;
  assert.equal(sweepCompleteness(capture).landmark, "exact",
    "one entry announcing two landmarks is two landmarks");
});

test("an entry with NO landmark in it contributes nothing rather than counting as one", () => {
  // 35 of 267 real entries are the landmark sweep announcing something that is not a landmark —
  // "Get Involved, link". Counting those would inflate the found total into a phantom.
  //
  // When NOTHING resolves, the verdict is `unknown` and not `truncated`, and the test first asserted the
  // wrong one. "The page has no landmarks and NVDA announced something else" and "our extraction failed"
  // are indistinguishable from here, so declining is the honest answer — the same reasoning as the
  // entirely-unnamed-sweep guard. Claiming `truncated` would be inventing a capture defect.
  const capture = {
    structure: { landmarks: ["Get Involved, link"] },
    diagnostics: [{ event: "structureCensus", distinct: { landmark: 1 } }],
  } as unknown as CapturedAnnouncements;
  assert.equal(sweepCompleteness(capture).landmark, "unknown");
});

test("but a non-landmark entry ALONGSIDE real ones is a short sweep, and says so", () => {
  // The common shape on a real page: most entries resolve, one is the sweep landing on a link. Here we
  // CAN tell — landmarks were found, and fewer than the tree exposes.
  const capture = {
    structure: { landmarks: ["Page Contents, navigation landmark, x", "Get Involved, link"] },
    diagnostics: [{ event: "structureCensus", distinct: { landmark: 2 } }],
  } as unknown as CapturedAnnouncements;
  assert.equal(sweepCompleteness(capture).landmark, "truncated");
});

test("A TABLE'S COMPLETENESS COMES FROM NVDA'S OWN WORDS, not the census", () => {
  // The census counts landmarks, headings, links, graphics and form controls — never cells. NVDA states
  // the dimensions when the caret enters ("table, with 3 rows and 7 columns"), which is the only ground
  // truth there is, and arguably the better oracle: it is what the screen reader actually said.
  const capture = {
    transcript: ["Prices, table, with 3 rows and 7 columns"],
    structure: { tableCells: Array.from({ length: 18 }, (_, i) => `cell ${i}`) },
    // The mark says the probe RAN. Without it the verdict is `unknown`, because `probeTables` is opt-in
    // and an empty `tableCells` from a probe nobody ran is not a sweep that came up short.
    diagnostics: [{ event: "tableCells", found: 18 }],
  } as unknown as CapturedAnnouncements;
  assert.equal(sweepCompleteness(capture).tableCells, "exact");
});

test("a cell sweep that barely started is TRUNCATED, which is the case this was built for", () => {
  // The real page that prompted it reached 0 of 21 cells. A 1.3.1 finding of "no cell announces a header"
  // ranges over every cell, so a sweep that did not look cannot support it.
  const capture = {
    transcript: ["Prices, table, with 3 rows and 7 columns"],
    structure: { tableCells: [] },
    // The probe RAN and found none — which is the case this test is about, and is a different fact from
    // the probe never running. Only the mark separates them.
    diagnostics: [{ event: "tableCells", found: 0 }],
  } as unknown as CapturedAnnouncements;
  assert.equal(sweepCompleteness(capture).tableCells, "truncated");
});

test("A FRACTION AND NOT EQUALITY, because merged cells make exactness wrong", () => {
  // Demanding rows x columns exactly would mark healthy captures incomplete and suppress real findings:
  // merged cells, a caption row, and cells NVDA groups all legitimately reduce the count. 122 of 122
  // corpus table captures are complete at this threshold.
  const capture = {
    transcript: ["Prices, table, with 4 rows and 4 columns"],
    structure: { tableCells: Array.from({ length: 9 }, (_, i) => `cell ${i}`) },
    diagnostics: [{ event: "tableCells", found: 9 }],
  } as unknown as CapturedAnnouncements;
  assert.equal(sweepCompleteness(capture).tableCells, "exact", "9 of 16 is a real table, not a short sweep");
});

test("no table announced means UNKNOWN, never complete", () => {
  // A page with no table has nothing to be incomplete about, and saying `exact` would let a 1.3.1 absence
  // claim rest on a channel that was never exercised.
  assert.equal(sweepCompleteness({ transcript: ["Home, document"], structure: {} } as never).tableCells,
    "unknown");
});

/**
 * COMPLETENESS MUST NOT FIRE ON THE FINDING ITSELF.
 *
 * `sweptElements` counted unnamed elements for landmarks only. `browser-session.mjs` builds
 * `census.distinct` the other way and says why: "An UNNAMED element has no name to be distinct from, and
 * the sweep still announces it — so it counts once per element rather than being collapsed. Treating
 * unnamed elements as one would under-count the very thing 1.1.1 and 4.1.2 are about."
 *
 * So the two sides could never agree on a page carrying an unnamed control, and the verdict was TRUNCATED
 * on exactly the captures whose finding IS an unnamed control. `assertableSweep` then refused 2.1.1's
 * absence claim and `rules:gate` failed the record — which is how this was found.
 */
const censusOf = (distinct: Record<string, number>) =>
  [{ event: "structureCensus", distinct }];

test("an unnamed control does not make its own sweep read as truncated", () => {
  // Verbatim from `keyboard-unreachable-native-button+also-filename-alt-bare-edit-inert.bad`: four
  // controls, one of them unnamed, and a census that counts all four.
  const verdicts = sweepCompleteness({
    structure: { formFields: ["Full name, edit", "Delete draft, button", "Email, edit", "edit"] },
    diagnostics: censusOf({ formControl: 4 }),
  } as never);
  assert.equal(verdicts.formControl, "exact",
    "the sweep announced all four; dropping the unnamed one invents a truncation");
});

test("a genuinely short sweep is still truncated", () => {
  // The guard must not become permissive: counting unnamed elements must not turn a real miss into a pass.
  const verdicts = sweepCompleteness({
    structure: { formFields: ["Full name, edit"] },
    diagnostics: censusOf({ formControl: 4 }),
  } as never);
  assert.equal(verdicts.formControl, "truncated");
});

test("a sweep that announced MORE than the tree exposes is a phantom", () => {
  const verdicts = sweepCompleteness({
    structure: { headings: ["A, heading, level 1", "B, heading, level 2", "C, heading, level 2"] },
    diagnostics: censusOf({ heading: 2 }),
  } as never);
  assert.equal(verdicts.heading, "phantom");
});

test("a table probe that never ran is UNKNOWN, not truncated", () => {
  // `probeTables` is opt-in. A page whose transcript announces a table, captured without the probe, has
  // `tableCells: []` — and reading that as TRUNCATED says the sweep tried and missed, which refuses
  // 1.3.1's claim on a capture that was never asked. Measured on
  // `keyboard-unreachable-action+also-position-only-table-bare-edit-inert.bad`.
  const verdicts = sweepCompleteness({
    transcript: ["table with 2 rows and 2 columns"],
    structure: { tableCells: [] },
    diagnostics: [],
  } as never);
  assert.equal(verdicts.tableCells, "unknown");
});

test("a table probe that RAN and came up short is truncated", () => {
  // The probe marks `tableCells` whenever it runs, including when it finds none — which is the whole
  // reason that mark exists, and the only thing separating these two cases.
  const verdicts = sweepCompleteness({
    transcript: ["table with 2 rows and 2 columns"],
    structure: { tableCells: [] },
    diagnostics: [{ event: "tableCells", found: 0 }],
  } as never);
  assert.equal(verdicts.tableCells, "truncated");
});


test("protocol 9: a channel the capture says nobody asked about is `unknown`, not `truncated`", () => {
  // The whole point of `observed`. Before it, a page with a table captured without `probeTables` read
  // TRUNCATED — "the sweep tried and missed" — and `assertableSweep` then refused 1.3.1's claim on a
  // capture that had simply never been asked. The capture now says so itself.
  const capture = {
    url: "https://example.test/", screenReader: "NVDA", transcript: ["Example, document"],
    structure: { headings: [], links: [], landmarks: [], graphics: [], formFields: [], lists: [] },
    diagnostics: [{ event: "structureCensus", distinct: { heading: 4 } }],
    observed: { headings: { asked: false, why: "not asked" } },
  } as unknown as Parameters<typeof sweepCompleteness>[0];
  assert.equal(sweepCompleteness(capture).heading, "unknown",
    "the census counts 4 and the sweep found 0, which WITHOUT `observed` is truncated — the recorded "
    + "fact must win, because a sweep nobody ran did not come up short");
});

test("protocol 9: absent `observed` falls back to inference rather than assuming it was asked", () => {
  // A pre-9 capture cannot say, and reading absence as `asked: true` is the defect this field removes.
  const capture = {
    url: "https://example.test/", screenReader: "NVDA", transcript: ["Example, document"],
    structure: { headings: [], links: [], landmarks: [], graphics: [], formFields: [], lists: [] },
    diagnostics: [{ event: "structureCensus", distinct: { heading: 4 } }],
  } as unknown as Parameters<typeof sweepCompleteness>[0];
  assert.equal(sweepCompleteness(capture).heading, "truncated",
    "with no `observed` the census comparison still decides — deleting that would make every pre-9 "
    + "capture unreadable to answer a question they can answer");
});

test("the LANGUAGE census reaches the rule layer, and an absent one is not 'no language'", () => {
  // THE DEFECT THIS REPO HAS ALREADY PAID FOR ONCE, in different fields. `addMissingHeadings` needs
  // `census.heading === 0`; the worker recorded it on every capture and `domCensus` did not carry it, so
  // the rule read `undefined` and `rules:coverage` reported "NEVER FIRED ANYWHERE — the claim rests on
  // nothing" for as long as that rule had existed.
  //
  // Same shape here until 2026-09-05: a real capture read `documentLang: "en", partLangs: ["fr"],
  // partLangCount: 1` and every rule saw nothing, because these three were computed by the worker and
  // dropped at this hop. 3.1.2's marked-but-silent rule is specified as `partLangCount > 0 AND no language
  // announced`, so building it first would have produced a rule that never fires — indistinguishable, from
  // the outside, from a corpus with nothing to find.
  const withLang = domCensus({
    diagnostics: [{ event: "domCensus", heading: 2, documentLang: "en", partLangs: ["fr"], partLangCount: 1 }],
  } as never);
  assert.equal(withLang?.documentLang, "en");
  assert.deepEqual(withLang?.partLangs, ["fr"]);
  assert.equal(withLang?.partLangCount, 1);

  // ABSENT IS NOT ZERO. Every capture taken before the census learned to read these carries no such field,
  // and `partLangCount === 0` would mean "this page marks no passage" — a claim about the page. `undefined`
  // means "we did not look", and a rule keyed on the first would accuse every old capture.
  const older = domCensus({ diagnostics: [{ event: "domCensus", heading: 2 }] } as never);
  assert.equal(older?.partLangCount, undefined, "a capture predating the census must read 'cannot say'");
  assert.equal(older?.documentLang, undefined);
});

test("a census whose CDP target was never confirmed reads as ABSENT, not as its own numbers", () => {
  // The bathingwaters/lbhf shape, reproduced directly: two real page-type targets competed and neither
  // matched the URL this capture navigated to. `targetMatch: "fallback"` alone cannot say whether the
  // fallback was forced (this) or vacuous (one candidate); `candidates` is what tells them apart.
  const suspectStructure = { diagnostics: [
    { event: "structureCensus", heading: 173, link: 253, graphic: 6, targetMatch: "fallback", candidates: 2 },
  ] } as never;
  assert.equal(pageCensus(suspectStructure), null,
    "a census from an unconfirmed target among real competitors must not be handed to a rule as this page's own");

  const suspectDom = { diagnostics: [
    { event: "domCensus", heading: 55, link: 281, targetMatch: "fallback", candidates: 2 },
  ] } as never;
  assert.equal(domCensus(suspectDom), null);

  // "no-expected-url" is the same finding by a different route: nothing was recorded to compare against,
  // so a real second candidate is exactly as unconfirmed as a fallback that failed to match one.
  const noExpectedUrl = { diagnostics: [
    { event: "structureCensus", heading: 40, targetMatch: "no-expected-url", candidates: 3 },
  ] } as never;
  assert.equal(pageCensus(noExpectedUrl), null);
});

test("a fallback with only ONE candidate is trusted -- nothing else it could have picked", () => {
  // The vacuous half of the same mechanism: a redirect or a URL the page server normalised, with no real
  // competing document. Demanding this read as absent too would make EVERY synthetic capture's census
  // unusable, since a synthetic page's single CDP target legitimately never matches by host.
  const census = pageCensus({ diagnostics: [
    { event: "structureCensus", heading: 12, link: 40, targetMatch: "fallback", candidates: 1 },
  ] } as never);
  assert.equal(census?.heading, 12);
  assert.equal(census?.link, 40);
});

test("a matched target is trusted regardless of how many candidates existed", () => {
  const census = pageCensus({ diagnostics: [
    { event: "structureCensus", heading: 12, targetMatch: "matched", candidates: 4 },
  ] } as never);
  assert.equal(census?.heading, 12);
});

test("a capture predating targetMatch entirely is trusted exactly as before -- this field cannot "
  + "retroactively accuse a capture it was never computed for", () => {
  const census = pageCensus({ diagnostics: [{ event: "structureCensus", heading: 12 }] } as never);
  assert.equal(census?.heading, 12);
});

test("targetMatch present with candidates missing is read as suspect, not as trusted", () => {
  // The transitional gap: a capture taken after `targetMatch` shipped and before `candidates` did.
  // Conservative by design -- a census this function cannot vouch for is treated the same as one it can
  // disprove, never the same as one it has no opinion about.
  const census = pageCensus({ diagnostics: [
    { event: "structureCensus", heading: 12, targetMatch: "fallback" },
  ] } as never);
  assert.equal(census, null);
});
