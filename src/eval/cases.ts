/**
 * Eval dataset: labeled cases with ground truth.
 *
 * Because the judge is an LLM, we treat its quality as an eval, not a one-off:
 * fixed cases, an automatic scorer, and recall/precision metrics that rerun on
 * every change. Ground truth comes from authoritative sources, not us.
 *
 * Scoring (see run.ts) is at the WCAG-criterion level:
 *   - `expect`: criteria the judge SHOULD flag (recall denominator). Limited to
 *     what is observable from a screen-reader read-through of the transcript.
 *   - `allow`:  criteria that are legitimate to flag on this page (precision).
 *     Anything flagged outside `allow` counts as a false positive.
 */
export interface EvalCase {
  id: string;
  /** Path to a capture transcript JSON: { url, screenReader, transcript }. */
  fixture: string;
  task: string;
  /** Criteria a reading-based tool should catch here (recall). */
  expect: string[];
  /** Criteria legitimate to flag here (precision); anything else is a false positive. */
  allow: string[];
  notes?: string;
}

// W3C's documented Level A/AA failures on the inaccessible "Before" home page
// (https://www.w3.org/WAI/demos/bad/before/reports/home.html). AAA criteria and
// the obsolete 4.1.1 are excluded. Used as the `allow` set: flagging any of
// these is legitimate; flagging anything outside it is a false positive.
const W3C_BEFORE_DOCUMENTED_AA = [
  "1.1.1", "1.3.1", "1.3.2", "1.4.1", "1.4.3", "1.4.5",
  "2.1.1", "2.4.1", "2.4.2", "2.4.4", "2.4.6", "2.4.7",
  "3.1.1", "3.2.1", "3.2.2", "3.2.4", "3.3.2", "4.1.2",
];

export const EVAL_CASES: EvalCase[] = [
  {
    id: "w3c-bad-before",
    fixture: "src/spike/fixtures/nvda-w3c-bad-before.json",
    task: "Read the City Lights home page and find the latest news",
    // The failures clearly observable from this page's announced reading:
    // unlabelled graphics (1.1.1), visual titles not marked as headings (1.3.1),
    // vague link text (2.4.4), and a phone number shown as an image (1.4.5).
    expect: ["1.1.1", "1.3.1", "2.4.4", "1.4.5"],
    allow: W3C_BEFORE_DOCUMENTED_AA,
    notes: "Ground truth: W3C BAD before-page evaluation report.",
  },
  {
    id: "w3c-bad-after",
    fixture: "src/spike/fixtures/nvda-w3c-bad-after.json",
    task: "Read the City Lights home page and find the latest news",
    // W3C documents the accessible page as fully conformant: expect nothing.
    expect: [],
    allow: [],
    notes: "Ground truth: W3C BAD after-page report = full WCAG 2.0 AA conformance. Any finding is a false positive; the demo's own Show/QuickMenu chrome is a known confound.",
  },
  {
    id: "planted-contact-form",
    fixture: "src/eval/fixtures/planted-contact-form.json",
    task: "Send a message to the team using the contact form",
    // Planted: bare "image" (1.1.1), unlabelled field (3.3.2 or 4.1.2),
    // unnamed "button" (4.1.2). The h1->h4 jump is NOT a clear failure, and
    // "For our privacy policy click here" IS clear in context, so flagging
    // 2.4.4 would be a false positive (tests the in-context link rule).
    expect: ["1.1.1", "4.1.2"],
    allow: ["1.1.1", "4.1.2", "3.3.2"],
    notes: "Synthetic; tests recall on labels/names and that in-context 'click here' is NOT flagged.",
  },
];
