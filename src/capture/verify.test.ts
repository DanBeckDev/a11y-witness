// The verification layer's job is to refuse evidence that only looks like evidence.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  captureHasSubstance, captureIsSelfConsistent, captureMentionsTitle, captureRanRequestedProbes,
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
