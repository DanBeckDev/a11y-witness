// "PROPERLY TESTED" AS A CALCULATION, NOT A JUDGEMENT.
//
// The states model exists so this can be computed. A config carrying only an error state must report
// 4.1.3 as HALF answered and name the missing half -- not quietly assess what it happens to have and call
// the criterion done, which is the shape of every overclaim this project refuses.
import { test } from "node:test";
import assert from "node:assert/strict";

import { formCoverage, submissionPlan, CRITERION_STATES } from "./coverage.js";
import { parseFormsConfig } from "./config.js";
import { CRITERION_COVERAGE } from "@a11y-witness/judge/internal";

const config = (states: string) => parseFormsConfig(`
version: 1
origin: https://booking.example.com
forms:
  - form: "Book a room"
    submit: "Confirm booking"
    states:
${states}
`).forms[0];

const ERROR_STATE = `      - state: error
        because: "no email address"
        fields:
          - field: "Email address"
            value: ""`;
const SUCCESS_STATE = `      - state: success
        fields:
          - field: "Email address"
            value: "ada@example.test"`;

const readinessOf = (form: ReturnType<typeof config>, criterion: string) =>
  formCoverage(form).criteria.find((c) => c.criterion === criterion);

test("an ERROR state alone answers 3.3.1 and 3.3.3 fully", () => {
  const form = config(ERROR_STATE);
  assert.equal(readinessOf(form, "3.3.1")?.readiness, "configured");
  assert.equal(readinessOf(form, "3.3.3")?.readiness, "configured");
});

test("4.1.3 with only an error state is PARTLY answered, and says which half is missing", () => {
  // The assertion that justifies the whole states model. An error status being announced does not prove a
  // success status is, and reporting the criterion as done would be exactly the unearned reassurance this
  // tool exists to refuse.
  const partial = readinessOf(config(ERROR_STATE), "4.1.3");
  assert.equal(partial?.readiness, "partly");
  assert.match(partial?.why ?? "", /No success state was supplied/);
  assert.match(partial?.why ?? "", /unknown/);

  const both = readinessOf(config(`${ERROR_STATE}\n${SUCCESS_STATE}`), "4.1.3");
  assert.equal(both?.readiness, "configured");
});

test("3.2.2 is answered by FILLING, so one state is enough", () => {
  // And this is why supplying values enables the typing probe by construction: we type the author's own
  // value into the field they named, at their instruction, so consent is not a second question.
  assert.equal(readinessOf(config(SUCCESS_STATE), "3.2.2")?.readiness, "configured");
});

test("a form with no relevant state says what to supply, not just that it cannot", () => {
  // "notConfigured" alone sends someone to read source. Naming the state they need is what makes an
  // unconfigured form actionable rather than merely honest.
  const only = readinessOf(config(SUCCESS_STATE), "3.3.1");
  assert.equal(only?.readiness, "notConfigured");
  assert.match(only?.why ?? "", /needs a error state|needs an? error/);
});

test("the plan names the state that COMPLETES the form, before anything is submitted", () => {
  // origin: stops a staging config reaching production. It cannot tell an author that the file they just
  // wrote books a room twice on every CI run. This can, and it is the only thing between "I configured a
  // success state" and finding out what that meant.
  const lines = submissionPlan([config(`${ERROR_STATE}\n${SUCCESS_STATE}`)], "https://booking.example.com");
  const text = lines.join("\n");
  assert.match(text, /THIS COMPLETES THE FORM/);
  assert.match(text, /because: no email address/);
  assert.match(text, /Nothing was submitted/);
});

test("the plan runs the ERROR state first", () => {
  // A success submission may navigate away, and the less destructive state should have been observed
  // before the one that completes the form: a run that dies midway has then done the safer thing.
  const lines = submissionPlan([config(`${SUCCESS_STATE}\n${ERROR_STATE}`)], "https://x.test");
  const order = lines.filter((l) => /^\s+\d\. state/.test(l));
  assert.match(order[0], /"error"/);
  assert.match(order[1], /"success"/);
});

/**
 * The three CHANNELS the forms probe (`probeForms`/`probeTyping`) populates. Not exported from
 * `criterion-coverage.ts` as a named group -- there is exactly one place that needs the grouping, here.
 */
const FORMS_PROBE_CHANNELS = new Set(["formChanges", "postSubmitFields", "typedFeedback"]);

/**
 * Every ASSESSED criterion whose evidence, per `CRITERION_COVERAGE`, comes (at least partly) from the
 * forms probe -- the set `CRITERION_STATES` exists to report readiness for.
 */
function formsProbeBackedAssessedCriteria(): string[] {
  return Object.entries(CRITERION_COVERAGE)
    .filter(([, coverage]) =>
      coverage.status === "assessed" && (coverage.channels ?? []).some((ch) => FORMS_PROBE_CHANNELS.has(ch)))
    .map(([criterion]) => criterion)
    .sort();
}

test("CRITERION_STATES covers exactly the assessed, forms-probe-backed criteria -- DERIVED from CRITERION_COVERAGE, not hand-listed", () => {
  // architecture-audit.md §6.5: CRITERION_STATES is "a second table of criterion knowledge beside
  // criterion-coverage.ts", and this test used to assert against its OWN literal list -- a hand-written
  // copy of the very fact it claimed to guard, the same shape as the 4.1.2 channel-table disagreement
  // that reported a criterion BLOCKED where a rule had just asserted a conformance failure for it.
  //
  // The per-criterion VALUES (`needs`, `mode`) are NOT derived, and cannot be: 3.3.1 and 4.1.3 share the
  // identical channel set (`formChanges`, `postSubmitFields`) and need different states in different
  // modes (`all` vs `partial`) -- `channels` alone under-determines which form STATES complete a
  // criterion, because that depends on which half of the criterion's own definition each state answers.
  // What CAN be derived, and is the one thing worth pinning, is the SET of criteria this table must
  // cover -- a criterion present here that is not assessed-and-forms-probe-backed over there overclaims
  // precision the tool does not have; one assessed-and-forms-probe-backed criterion missing here is a
  // form config that can never fully answer it, silently.
  assert.deepEqual(Object.keys(CRITERION_STATES).sort(), formsProbeBackedAssessedCriteria(),
    "CRITERION_STATES and CRITERION_COVERAGE disagree about which criteria the forms probe answers -- "
    + "see the comment above this test for the two ways that can happen and why each matters.");
});
