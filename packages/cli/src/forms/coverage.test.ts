// "PROPERLY TESTED" AS A CALCULATION, NOT A JUDGEMENT.
//
// The states model exists so this can be computed. A config carrying only an error state must report
// 4.1.3 as HALF answered and name the missing half -- not quietly assess what it happens to have and call
// the criterion done, which is the shape of every overclaim this project refuses.
import { test } from "node:test";
import assert from "node:assert/strict";

import { formCoverage, submissionPlan, CRITERION_STATES } from "./coverage.js";
import { parseFormsConfig } from "./config.js";

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

test("the criterion table covers exactly the probe-gated criteria", () => {
  // These four are the ones unreachable on a page we do not own, which is what ADR 0024 exists to fix.
  // A fifth appearing here without a decision would be a coverage claim nobody made.
  assert.deepEqual(Object.keys(CRITERION_STATES).sort(), ["3.2.2", "3.3.1", "3.3.3", "4.1.3"]);
});
