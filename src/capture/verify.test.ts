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

test("a transcript of only NVDA's \"blank\" has no substance", () => {
  // Measured shape: `["blank","blank"]` -- NVDA reading an empty document.
  //
  // The title check ALREADY rejects this one, which is worth asserting so nobody assumes the substance
  // check is load-bearing here. It becomes load-bearing when a page's title is made of common words,
  // where captureMentionsTitle is deliberately lenient and returns true.
  const blank = { transcript: ["blank", "blank"], structure: { headings: [], landmarks: [], formFields: [] } };
  assert.equal(captureMentionsTitle(blank, TITLE), false, "the title check catches this one");
  assert.equal(captureIsSelfConsistent(blank), true, "the consistency check cannot see it");
  assert.equal(captureHasSubstance(blank, TITLE), false);
  // The case the substance check is actually needed for: a title with no distinctive words.
  assert.equal(captureMentionsTitle(blank, "Home page"), true, "lenient by design");
  assert.equal(captureHasSubstance(blank, "Home page"), false);
});

test("\"blank\" among real content is fine", () => {
  // Pages legitimately contain empty lines; only a transcript that is ENTIRELY blank is the fault.
  const mixed = { transcript: ["blank", "heading, level 1, Aquarium"], structure: { headings: [], landmarks: [], formFields: [] } };
  assert.equal(captureHasSubstance(mixed, TITLE), true);
});

test("a requested form probe that found no controls is an incomplete capture", () => {
  // Measured: a healthy 3-phrase transcript with controls: 0 and formProbe activated: 0. Every
  // transcript-based guard passes it, and the case's entire signal is about what submitting announces.
  // Faithful to the real capture: headings ARE populated, so nothing contradicts itself and every
  // transcript-based guard is satisfied. This is the only check that sees the fault.
  const noControls = {
    transcript: ["heading, level 1, Health pavilion 042 booking", "form, Health pavilion contact"],
    structure: { headings: ["Health pavilion 042 booking, heading, level 1"], landmarks: [], formFields: [] },
    interaction: { controls: [], stateChanges: [] },
  };
  assert.equal(captureHasSubstance(noControls, TITLE), true, "substance check cannot see this");
  assert.equal(captureIsSelfConsistent(noControls), true, "consistency check cannot see it either");
  assert.equal(captureRanRequestedProbes(noControls, { probeForms: true }), false);
});

test("no form probe requested means no controls is fine", () => {
  const noControls = { transcript: ["text"], structure: { headings: [], landmarks: [], formFields: [] } };
  assert.equal(captureRanRequestedProbes(noControls, { probeForms: false }), true);
  assert.equal(captureRanRequestedProbes(noControls, {}), true);
});

test("a form probe that found controls passes", () => {
  const withControls = {
    transcript: ["text"],
    structure: { headings: [], landmarks: [], formFields: [] },
    interaction: { controls: ["Submit, button"], stateChanges: [] },
  };
  assert.equal(captureRanRequestedProbes(withControls, { probeForms: true }), true);
});
