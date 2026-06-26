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

// W3C's documented Level A/AA failures on the inaccessible "before" SURVEY page
// (https://www.w3.org/WAI/demos/bad/before/reports/survey.html). Form-heavy.
const W3C_SURVEY_DOCUMENTED_AA = [
  "1.1.1", "1.3.1", "1.3.2", "1.4.1", "1.4.3",
  "2.1.1", "2.4.1", "2.4.2", "2.4.3", "2.4.4", "2.4.6", "2.4.7",
  "3.1.1", "3.2.1", "3.2.2", "3.3.2", "4.1.2",
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
    fixture: "src/spike/fixtures/nvda-w3c-bad-after-content.json",
    task: "Read the City Lights home page and find the latest news",
    // W3C documents the accessible page as fully conformant: expect nothing.
    // Uses the content-only fixture (demo switcher chrome stripped) so we score
    // the certified page, not W3C's demo navigation.
    expect: [],
    allow: [],
    notes: "Ground truth: W3C BAD after-page report = full WCAG 2.0 AA conformance. Content-only fixture; any finding is a false positive.",
  },
  {
    id: "w3c-bad-before-survey",
    fixture: "src/spike/fixtures/nvda-w3c-bad-before-survey.json",
    task: "Fill in and submit the City Lights visitor survey",
    // Form-heavy page: radio buttons are announced with no label ("radio
    // button, not checked, [no name]") and the menu is a junk-named combo box.
    // Tests recall on unlabelled form controls. 3.3.2 (Labels or Instructions)
    // is the equivalent citation and is allowed.
    expect: ["4.1.2"],
    allow: W3C_SURVEY_DOCUMENTED_AA,
    notes: "Ground truth: W3C BAD before-survey report. Exercises form-control recall the home page didn't.",
  },
  {
    id: "w3c-wai-home",
    fixture: "src/spike/fixtures/nvda-w3c-wai-home.json",
    task: "Find guidance on getting started with accessibility",
    // W3C's own WAI site: a reference-quality accessible page, no demo chrome.
    // A conformant page should yield ~no findings, so this is a clean
    // false-positive test (unlike the confounded "after" demo page).
    expect: [],
    allow: [],
    notes: "Reference-accessible real page (W3C WAI). Any finding is a false positive; measures over-flagging on good pages.",
  },
  {
    id: "contamination-fresh-page",
    fixture: "src/eval/fixtures/contamination-test.json",
    task: "Sign up for an Acme Widgets account",
    // Authored fresh (src/eval/pages/contamination-test.html), never published,
    // so no model can have memorized it. This is both an anti-contamination
    // test (recall here cannot be recall-from-memory) and a held-out case (not
    // tuned against). Planted observable violations: a visual title that is not
    // a real heading (1.3.1), an alt-less image (1.1.1), a vague "click here"
    // link (2.4.4), and an unlabelled input + icon-only button (4.1.2 / 3.3.2),
    // mixed with correct controls (real alt, descriptive link, labelled input).
    expect: ["1.1.1", "1.3.1", "2.4.4", "4.1.2"],
    allow: ["1.1.1", "1.3.1", "2.4.4", "4.1.2", "3.3.2", "2.4.6"],
    notes: "Contamination + held-out test: ground truth is the planted issues, not a public report.",
  },
  // --- W3C tutorial baseline: paired good/bad pages authored from the W3C WAI
  // tutorials (https://www.w3.org/WAI/tutorials/). Ground truth is W3C's own
  // documented technique. Good pages must be clean (precision); bad pages must
  // surface the documented failure (recall). Pages in src/eval/pages/tutorials/.
  {
    id: "tut-images-good",
    fixture: "src/eval/fixtures/tutorials/images-good.json",
    task: "View the trail photos",
    expect: [],
    allow: [],
    notes: "W3C images tutorial, correct: descriptive alt, null alt for decorative, functional-link alt. Clean.",
  },
  {
    id: "tut-images-bad",
    fixture: "src/eval/fixtures/tutorials/images-bad.json",
    task: "View the trail photos",
    expect: ["1.1.1"],
    // 4.1.2 is allowed: the alt-less image used as a link genuinely has no
    // accessible name, so citing Name/Role/Value alongside 1.1.1 is defensible.
    allow: ["1.1.1", "4.1.2"],
    notes: "W3C images tutorial failures: missing alt on informative image and image link, filename-as-alt.",
  },
  {
    id: "tut-forms-good",
    fixture: "src/eval/fixtures/tutorials/forms-good.json",
    task: "Sign up for the newsletter",
    expect: [],
    allow: [],
    notes: "W3C forms tutorial, correct: label/for, fieldset/legend grouping. Clean.",
  },
  {
    id: "tut-forms-bad",
    fixture: "src/eval/fixtures/tutorials/forms-bad.json",
    task: "Sign up for the newsletter",
    expect: ["4.1.2"],
    allow: ["4.1.2", "3.3.2", "1.3.1"],
    notes: "W3C forms tutorial failures: unlabelled input, ungrouped unlabelled radios.",
  },
  {
    id: "tut-structure-good",
    fixture: "src/eval/fixtures/tutorials/structure-good.json",
    task: "Find the library's opening hours",
    expect: [],
    allow: [],
    notes: "W3C page-structure tutorial, correct: landmarks + h1/h2/h3 hierarchy + skip link. Clean.",
  },
  {
    id: "tut-structure-bad",
    fixture: "src/eval/fixtures/tutorials/structure-bad.json",
    task: "Find the library's opening hours",
    expect: ["1.3.1"],
    allow: ["1.3.1", "2.4.6", "2.4.1"],
    notes: "W3C page-structure tutorial failures: visual titles as styled text (no heading role), no landmarks.",
  },
  {
    id: "tut-tables-good",
    fixture: "src/eval/fixtures/tutorials/tables-good.json",
    task: "Find which platform the Hilltop train departs from",
    expect: [],
    allow: [],
    notes: "W3C tables tutorial, correct: caption + th/scope; cells announced with their headers. Clean.",
  },
  {
    id: "tut-tables-bad",
    fixture: "src/eval/fixtures/tutorials/tables-bad.json",
    task: "Find which platform the Hilltop train departs from",
    expect: ["1.3.1"],
    allow: ["1.3.1"],
    notes: "W3C tables tutorial failure: data table with no header cells; cells not associated with headers.",
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
