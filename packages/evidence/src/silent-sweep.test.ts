import { test } from "node:test";
import assert from "node:assert/strict";

import { captureIsSelfConsistent } from "./verify.js";

/**
 * The §20 shape, reconstructed from the capture that caused it.
 *
 * `headings-none-refunds+also-filename-alt` read for 330 s and produced 12 lines while every sweep came
 * back silent — links 0 against a census of 6, graphics 0 against 1, on a page whose accessibility tree
 * even named the image. It passed the old self-consistency check because that check asks only about
 * HEADINGS, and this is a no-headings case by construction. It reached the corpus and surfaced hours later
 * as a `grants-audit` failure: a record labelled for a defect its capture did not carry.
 */
const pathological = {
  transcript: ["You may request a refund within thirty days of delivery."],
  structure: { headings: [], links: [], graphics: [], landmarks: [], formFields: [] },
  observed: {
    links: { asked: true, complete: false, stop: { prev: "silent", next: "silent" } },
    graphics: { asked: true, complete: false, stop: { prev: "silent", next: "silent" } },
  },
  diagnostics: [{ event: "structureCensus", distinct: { link: 6, graphic: 1, heading: 0 } }],
};

test("a sweep that went SILENT while the tree names the element is refused", () => {
  assert.equal(captureIsSelfConsistent(pathological as never), false);
});

test("a page that genuinely has none is accepted — the census is 0 too", () => {
  // THE RULE THIS FILE EXISTS TO PROTECT: a check must never reject evidence whose absence is the finding.
  // An unnamed control, a missing alt, a page with no headings — in every one the CENSUS is 0 as well, so
  // the first condition already excludes them. This is the assertion that keeps that true.
  const empty = {
    ...pathological,
    diagnostics: [{ event: "structureCensus", distinct: { link: 0, graphic: 0, heading: 0 } }],
  };
  assert.equal(captureIsSelfConsistent(empty as never), true);
});

test("a sweep that ran to EXHAUSTION is accepted, even if it found fewer than the tree", () => {
  // The documented residual gap between quick navigation and the accessibility tree — "a question about
  // this tool, not a finding about the page". `exhausted` is the screen reader's own answer; `silent` is
  // an inference. Only the second is refused.
  const exhausted = {
    ...pathological,
    observed: {
      links: { asked: true, complete: true, stop: { prev: "exhausted", next: "exhausted" } },
      graphics: { asked: true, complete: true, stop: { prev: "exhausted", next: "exhausted" } },
    },
  };
  assert.equal(captureIsSelfConsistent(exhausted as never), true);
});

test("a channel nobody asked about is accepted", () => {
  // `observed.asked === false` means the probe never ran, which is a fact about the request and not about
  // the page. Rejecting there would fail every capture that declined an opt-in sweep.
  const unasked = {
    ...pathological,
    observed: { links: { asked: false, why: "not requested" }, graphics: { asked: false, why: "x" } },
  };
  assert.equal(captureIsSelfConsistent(unasked as never), true);
});

test("a capture with no census is accepted, because it cannot say", () => {
  assert.equal(captureIsSelfConsistent({ ...pathological, diagnostics: [] } as never), true);
});

test("the original heading contradiction still fires", () => {
  // The check this extends, unchanged: the read-through heard a heading and the sweep found none.
  const heardNotSwept = {
    transcript: ["heading, level 1, Aquarium 001 schedule"],
    structure: { headings: [], links: [], graphics: [] },
    diagnostics: [],
  };
  assert.equal(captureIsSelfConsistent(heardNotSwept as never), false);
});
