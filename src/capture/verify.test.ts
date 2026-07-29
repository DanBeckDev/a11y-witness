// The verification layer's job is to refuse evidence that only looks like evidence.
import { test } from "node:test";
import assert from "node:assert/strict";
import { captureHasSubstance, captureMentionsTitle } from "./verify.js";

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
