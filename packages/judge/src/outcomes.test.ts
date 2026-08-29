/**
 * The four states that "0 findings" used to hide.
 *
 * Each test below is one of them, because the value of this module is entirely in telling them apart:
 * checked-and-fine, nothing-of-that-kind-here, could-not-determine, and never-evaluated. If they ever
 * collapse back into one another, a report goes back to reading as a clean bill of health.
 *
 * Precedence is asserted directly, not incidentally, since the order is the design: failed beats
 * everything, abstention beats truncation, truncation beats inapplicable.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { WCAG_22_AA } from "@a11y-witness/evidence/wcag";

import { assessedCriteria } from "./coverage.js";
import { criterionOutcomes, NOT_SWEEP_DERIVED, outcomeTally, type CriterionOutcome }
  from "./outcomes.js";

/** A capture with images, links, headings and an editable field, so most channels are non-empty. */
const RICH = {
  transcript: ["heading, level 1, Newsletter", "Sign up for updates, link"],
  structure: {
    headings: ["Newsletter, heading, level 1"],
    landmarks: ["main"],
    links: ["Sign up for updates, link"],
    graphics: ["Company logo, graphic"],
    formFields: ["Email address, edit", "Sign up, button"],
    lists: [],
  },
  interaction: { controls: [], stateChanges: [], formChanges: [], postSubmitFields: [] },
};

const find = (outcomes: CriterionOutcome[], criterion: string): CriterionOutcome =>
  outcomes.find((o) => o.criterion === criterion)!;

test("every WCAG 2.2 A/AA criterion gets an outcome — silence about the rest is the defect", () => {
  const outcomes = criterionOutcomes({ capture: RICH, findings: [] });
  assert.equal(outcomes.length, WCAG_22_AA.length);
  assert.equal(new Set(outcomes.map((o) => o.criterion)).size, WCAG_22_AA.length);
});

test("criteria no assessor covers are UNTESTED, not passed", () => {
  // The majority of them. A consumer reading only the ones we cover and inferring the rest are fine is what
  // this prevents, and ACT gives the word for it.
  const outcomes = criterionOutcomes({ capture: RICH, findings: [] });
  const tally = outcomeTally(outcomes);
  assert.equal(tally.untested, WCAG_22_AA.length - assessedCriteria().length);
  assert.equal(find(outcomes, "1.4.3").outcome, "untested", "contrast is not something we assess");
  assert.match(find(outcomes, "1.4.3").reason, /unchecked, not clean/);
});

test("a CONFORMANCE-mapped finding makes the criterion FAILED", () => {
  // Only a rule whose evidence establishes the criterion is unsatisfied may assert it — here, NVDA
  // announcing "Unlabeled graphic", which is 1.1.1 stated directly.
  const outcomes = criterionOutcomes({
    capture: RICH,
    findings: [
      { wcag: "1.1.1 Non-text Content", mapping: "conformance" as const },
      { wcag: "1.1.1 Non-text Content", mapping: "conformance" as const },
    ],
  });
  assert.equal(find(outcomes, "1.1.1").outcome, "failed");
  assert.match(find(outcomes, "1.1.1").reason, /2 finding/);
});

test("a SECONDARY-mapped finding is reported but does NOT assert non-conformance", () => {
  // The whole point of ACT's two mapping kinds. Our "click here" rule is stricter than 2.4.4, which lets
  // the link's surrounding context supply its purpose — so the finding is real and worth showing, and
  // claiming the criterion is unsatisfied from it would be an accusation the standard does not support.
  const outcomes = criterionOutcomes({
    capture: RICH, findings: [{ wcag: "2.4.4 Link Purpose (In Context)", mapping: "secondary" as const }],
  });
  assert.equal(find(outcomes, "2.4.4").outcome, "cantTell");
  assert.match(find(outcomes, "2.4.4").reason, /needs human confirmation/);
});

test("a finding with NO mapping is treated as secondary, never as an assertion", () => {
  // The default has to be the weaker claim: a new finding source must opt IN to asserting non-conformance,
  // or the next rule added quietly starts making them.
  const outcomes = criterionOutcomes({ capture: RICH, findings: [{ wcag: "2.4.4 Link Purpose" }] });
  assert.equal(find(outcomes, "2.4.4").outcome, "cantTell");
});

test("one conformance finding outranks several secondary ones on the same criterion", () => {
  const outcomes = criterionOutcomes({
    capture: RICH,
    findings: [
      { wcag: "1.1.1 Non-text Content" },
      { wcag: "1.1.1 Non-text Content", mapping: "conformance" as const },
      { wcag: "1.1.1 Non-text Content" },
    ],
  });
  assert.equal(find(outcomes, "1.1.1").outcome, "failed");
  assert.match(find(outcomes, "1.1.1").reason, /1 finding/, "only the asserted one is counted as proof");
});

test("an empty channel is INAPPLICABLE, never passed", () => {
  // A page with no links cannot pass 2.4.4 — there is nothing to be right or wrong about. This is the
  // case that once had the scorer returning 0.19 for link purpose on a page containing no links.
  const outcomes = criterionOutcomes({
    capture: { ...RICH, structure: { ...RICH.structure, links: [] } },
    findings: [],
  });
  assert.equal(find(outcomes, "2.4.4").outcome, "inapplicable");
  assert.match(find(outcomes, "2.4.4").reason, /nothing of the kind/i);
});

test("a full examination with nothing wrong is PASSED, and says what was checked", () => {
  const outcomes = criterionOutcomes({ capture: RICH, findings: [] });
  assert.equal(find(outcomes, "2.4.4").outcome, "passed");
  // A bare "passed" is the same unearned reassurance as a bare "0 findings".
  assert.match(find(outcomes, "2.4.4").reason, /examined in full/);
});

test("a TRUNCATED sweep makes the criteria it feeds cantTell, not passed", () => {
  // WCAG Conformance Requirement 2 per criterion: we stopped, the page did not, so an unclear link past
  // the cap was never looked at. Measured for real — link, list and postSubmit all hit `deadline` on the
  // W3C survey page.
  const outcomes = criterionOutcomes({
    capture: RICH, findings: [], truncatedSweeps: [{ type: "link" }],
  });
  assert.equal(find(outcomes, "2.4.4").outcome, "cantTell");
  assert.match(find(outcomes, "2.4.4").reason, /link sweep stopped before the page did/);
  // Only the criteria that sweep feeds are affected; the rest are unchanged.
  assert.equal(find(outcomes, "2.4.6").outcome, "passed", "a link truncation says nothing about headings");
});

test("the postSubmit sweep truncating makes BOTH interaction criteria cantTell", () => {
  // The real defect this was written for: postSubmit came back empty because the capture budget expired,
  // and "found nothing" was indistinguishable from "never asked". 3.3.1 and 4.1.3 both read that field.
  const outcomes = criterionOutcomes({
    capture: RICH, findings: [], truncatedSweeps: [{ type: "postSubmit" }],
  });
  assert.equal(find(outcomes, "3.3.1").outcome, "cantTell");
  assert.equal(find(outcomes, "4.1.3").outcome, "cantTell");
});

test("abstention makes every covered criterion cantTell, including rule-covered ones", () => {
  // Deliberate: a deterministic rule covers PART of a criterion, so a silent rule plus an absent scorer is
  // not a pass. 1.1.1 has both a rule and a scorer head, and it must still come back undetermined.
  const outcomes = criterionOutcomes({ capture: RICH, findings: [], abstained: true });
  for (const criterion of assessedCriteria()) {
    assert.equal(find(outcomes, criterion).outcome, "cantTell", `${criterion} must be undetermined`);
  }
  assert.match(find(outcomes, "1.1.1").reason, /abstained/);
});

test("a finding still outranks abstention and truncation", () => {
  // What we found is real even if the scorer abstained and the sweep later stopped early. Reporting it as
  // cantTell would discard a confirmed failure.
  const outcomes = criterionOutcomes({
    capture: RICH,
    findings: [{ wcag: "1.1.1 Non-text Content", mapping: "conformance" as const }],
    abstained: true,
    truncatedSweeps: [{ type: "graphic" }],
  });
  assert.equal(find(outcomes, "1.1.1").outcome, "failed");
});

test("abstention outranks truncation, because nothing was scored either way", () => {
  const outcomes = criterionOutcomes({
    capture: RICH, findings: [], abstained: true, truncatedSweeps: [{ type: "link" }],
  });
  assert.match(find(outcomes, "2.4.4").reason, /abstained/);
});

test("truncation outranks inapplicable — 'we stopped early' is not 'there are none'", () => {
  // The conflation this project refuses everywhere: an empty channel after an incomplete sweep must not be
  // reported as "nothing of that kind here".
  const outcomes = criterionOutcomes({
    capture: { ...RICH, structure: { ...RICH.structure, links: [] } },
    findings: [],
    truncatedSweeps: [{ type: "link" }],
  });
  assert.equal(find(outcomes, "2.4.4").outcome, "cantTell");
});

test("every outcome carries a reason", () => {
  // Including `passed`. An outcome a reader cannot interpret is a number to be quoted out of context.
  const withBoth = [
    { wcag: "1.1.1", mapping: "conformance" as const }, { wcag: "2.4.4", mapping: "secondary" as const },
  ];
  for (const outcome of criterionOutcomes({ capture: RICH, findings: withBoth })) {
    assert.ok(outcome.reason.trim().length > 20,
      `${outcome.criterion} (${outcome.outcome}) must explain itself`);
  }
});

test("a criterion number is parsed from the full WCAG label", () => {
  // Findings carry "1.1.1 Non-text Content"; the outcome list is keyed on "1.1.1". Getting this wrong
  // would match nothing and silently downgrade every failure to passed.
  const outcomes = criterionOutcomes({
    capture: RICH, findings: [{ wcag: "4.1.2 Name, Role, Value", mapping: "conformance" as const }],
  });
  assert.equal(find(outcomes, "4.1.2").outcome, "failed");
});

test("a malformed or missing wcag string does not crash or match everything", () => {
  const outcomes = criterionOutcomes({ capture: RICH, findings: [{}, { wcag: "" }, { wcag: "   " }] });
  assert.equal(outcomeTally(outcomes).failed, 0);
});

test("every criterion we assess has an entry in SWEEPS_FEEDING", () => {
  // A missing entry does not fail loudly, it silently DISABLES the truncation guard for that criterion —
  // so a sweep that stopped at its cap would be reported as `passed`. This repo's most expensive defect
  // was exactly this shape: a required entry added to a shared table with nothing checking the call sites,
  // which emptied `postSubmitFields` on all 2,122 captures while every other check stayed green.
  //
  // Asserted through the public behaviour rather than by importing the table: for each criterion, claiming
  // its sweeps truncated must change the outcome. If it does not, the criterion is missing from the table.
  for (const criterion of assessedCriteria()) {
    if (NOT_SWEEP_DERIVED.includes(criterion)) continue; // declared explicitly, so not a silent gap
    const everySweep = ["heading", "landmark", "list", "link", "formField", "graphic", "postSubmit"]
      .map((type) => ({ type }));
    const outcome = find(criterionOutcomes({ capture: RICH, findings: [], truncatedSweeps: everySweep }),
      criterion);
    assert.equal(outcome.outcome, "cantTell",
      `${criterion} ignored a truncated sweep — it is probably missing from SWEEPS_FEEDING`);
  }
  // Nothing may fall through BOTH tables: that is the silent gap this guard exists for.
  for (const criterion of assessedCriteria()) {
    const known = NOT_SWEEP_DERIVED.includes(criterion)
      || criterionOutcomes({ capture: RICH, findings: [], truncatedSweeps: [] }).some(
        (o) => o.criterion === criterion);
    assert.ok(known, `${criterion} is in neither SWEEPS_FEEDING nor NOT_SWEEP_DERIVED`);
  }
});

test("the tally accounts for every criterion exactly once", () => {
  const outcomes = criterionOutcomes({ capture: RICH, findings: [{ wcag: "1.1.1" }] });
  const tally = outcomeTally(outcomes);
  const total = Object.values(tally).reduce((sum, n) => sum + n, 0);
  assert.equal(total, WCAG_22_AA.length);
});

/**
 * COMPLETENESS IS THE SECOND WAY A SWEEP IS SHORT, and the one that fires on a healthy-looking capture.
 *
 * `truncatedSweeps` reads a sweep's own stop reason — it says "I gave up". Completeness compares what the
 * sweep announced against what the browser exposes, and catches the sweep that ended CLEANLY and still
 * missed something. That is the norm: quick navigation cannot reach a landmark containing the caret, so
 * `structure.landmarks` misses a page-wrapping `<main>` on 2,063 of 2,064 corpus captures — every one of
 * which reported "Content of the relevant kind was examined in full".
 *
 * Measured on 80 fresh protocol-7 captures: 16 flip, all `1.3.1 passed -> cantTell`, none any other way.
 */
const bare = {
  transcript: ["Home, document", "Welcome, heading, level 1"],
  structure: { headings: ["Welcome, heading, level 1"], landmarks: [], links: ["About, link"] },
  interaction: {},
} as never;

test("A TRUNCATED FEEDING SWEEP WITHDRAWS THE PASS, and the reason names the sweep", () => {
  const [outcome] = criterionOutcomes({
    capture: bare, findings: [], truncatedSweeps: [],
    completeness: { landmark: "truncated", heading: "exact", link: "exact" },
  }).filter((o) => o.criterion === "1.3.1");
  assert.equal(outcome.outcome, "cantTell");
  assert.match(outcome.reason, /landmark sweep/, "a reader must be told WHICH channel was short");
});

test("a criterion whose own sweeps are exact is UNTOUCHED by another's shortfall", () => {
  // Per-criterion, not blanket. 2.4.4 reads links; a short landmark sweep says nothing about it, and
  // withdrawing that pass too would be the over-broad guard this repo has shipped before.
  const [outcome] = criterionOutcomes({
    capture: bare, findings: [], truncatedSweeps: [],
    completeness: { landmark: "truncated", link: "exact" },
  }).filter((o) => o.criterion === "2.4.4");
  assert.equal(outcome.outcome, "passed");
});

test("UNKNOWN IS NOT INCOMPLETE — or every capture predating the counter goes cantTell", () => {
  // The same trade `assertableSweep` makes. Refusing on `unknown` would turn the entire corpus
  // undetermined overnight and read as a catastrophic regression, for no new information.
  const [outcome] = criterionOutcomes({
    capture: bare, findings: [], truncatedSweeps: [],
    completeness: { landmark: "unknown", heading: "unknown", link: "unknown" },
  }).filter((o) => o.criterion === "1.3.1");
  assert.equal(outcome.outcome, "passed");
});

test("a FINDING still outranks it, so evidence of a failure is never softened into cantTell", () => {
  // Step 1 of the precedence order, and it must survive: what we found is real even if the sweep that
  // found it was later shown to be partial. Softening a real failure would be the worse error.
  const [outcome] = criterionOutcomes({
    capture: bare,
    findings: [{ wcag: "1.3.1 Info and Relationships", mapping: "conformance" }],
    truncatedSweeps: [], completeness: { landmark: "truncated" },
  }).filter((o) => o.criterion === "1.3.1");
  assert.equal(outcome.outcome, "failed");
});

test("a PHANTOM sweep withdraws the pass too — it announced things the page does not have", () => {
  const [outcome] = criterionOutcomes({
    capture: bare, findings: [], truncatedSweeps: [], completeness: { link: "phantom" },
  }).filter((o) => o.criterion === "2.4.4");
  assert.equal(outcome.outcome, "cantTell");
});
