// Run by `scripts/isolation-gate.mjs` from a throwaway directory OUTSIDE this repository, against the
// installed tarball. Imports by PACKAGE NAME on purpose: a relative import would resolve inside the repo and
// prove nothing.
//
// It exercises the first example in README.md, and every declared `exports` subpath — an entry point the
// README tells people to import and that does not resolve is one of the failures this gate exists to catch,
// and it is invisible to a workspace install.
import assert from "node:assert/strict";

import { captureReachedThePage, captureDoubt, pageCensus } from "@a11y-witness/evidence/verify";
import { WCAG_22_AA } from "@a11y-witness/evidence/wcag";

// The `.` subpath is types only, so at runtime it is an empty module. Importing it still proves the subpath
// resolves and that `dist/index.js` was actually shipped — `files` allow-lists drop assets silently.
await import("@a11y-witness/evidence");

// The README's first example, verbatim in shape: the browser's census is the oracle, and the screen reader's
// reach is what is judged against it.
const contained = {
  // NVDA speaks the document title on load, so the title check PASSES — which is exactly why a title
  // check cannot see this failure.
  transcript: ["The Register, document", "We value your privacy", "button, Accept all"],
  structure: { headings: ["We value your privacy"], landmarks: [], formFields: [] },
  diagnostics: [{ event: "structureCensus", heading: 463, link: 793 }],
};
assert.equal(captureReachedThePage(contained), false, "1 of 463 headings is a contained capture");
assert.equal(captureDoubt(contained, "The Register"), "contained");

const healthy = {
  transcript: ["Accessible Technology, heading, level 1", "link, About us"],
  structure: { headings: ["Accessible Technology", "Our work", "Contact"], landmarks: [], formFields: [] },
  diagnostics: [{ event: "structureCensus", heading: 12, link: 79 }],
};
assert.equal(captureReachedThePage(healthy), true);
assert.equal(captureDoubt(healthy, "Accessible Technology"), null);
assert.deepEqual(pageCensus(healthy), { heading: 12, link: 79, graphic: undefined, graphicUnnamed: undefined });

// No census means no oracle, and no oracle means no verdict — every capture taken before the census existed
// must still be usable rather than rejected.
assert.equal(captureReachedThePage({ transcript: ["something"] }), true);

// Absence must remain expressible. A div-based fake button announces no form controls at all, and that
// silence IS the WCAG 4.1.2 failure; a guard that rejected it once threw away 44 real cases.
assert.equal(pageCensus({ transcript: [] }), null);

assert.ok(WCAG_22_AA.length > 20, `expected the full AA criteria list, got ${WCAG_22_AA.length}`);
assert.ok(WCAG_22_AA.every((c) => c.num && c.name && c.level && c.since),
  "every criterion needs num, name, level and since");
assert.ok(WCAG_22_AA.some((c) => c.num === "1.1.1" && c.level === "A"), "1.1.1 Non-text Content should be present");

console.log(`@a11y-witness/evidence works when installed: ${WCAG_22_AA.length} criteria, 3 subpaths resolve`);
