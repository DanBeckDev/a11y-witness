// A CONFIG THAT INSTRUCTS THE TOOL TO SUBMIT SOMEBODY'S LIVE FORM.
//
// The asymmetry with `axe-results.ts` is deliberate and these tests pin it. That module is TOLERANT
// because "axe results" means several packagings of the same substance. This file is not, because a
// misunderstood field there produces a wrong count and a misunderstood field here produces a real action
// on a real site.
import { test } from "node:test";
import assert from "node:assert/strict";

import { parseFormsConfig, refuseIfWrongOrigin, FormsConfigError, STATE_NAMES } from "./config.js";

const VALID = `
version: 1
origin: https://booking.example.com
forms:
  - form: "Book a room"
    submit: "Confirm booking"
    states:
      - state: error
        because: "no email address"
        fields:
          - field: "Email address"
            value: ""
      - state: success
        fields:
          - field: "Email address"
            value: "ada@example.test"
          - field: "Room type"
            choose: "Double"
          - field: "I accept the terms"
            check: true
`;

const rejects = (yaml: string, match: RegExp) =>
  assert.throws(() => parseFormsConfig(yaml), (e: Error) => {
    assert.ok(e instanceof FormsConfigError, `expected a FormsConfigError, got ${e.name}`);
    assert.match(e.message, match);
    return true;
  });

test("a complete config parses, with all three verbs", () => {
  const config = parseFormsConfig(VALID);
  assert.equal(config.forms.length, 1);
  assert.deepEqual(config.forms[0].states.map((s) => s.state), ["error", "success"]);
  // `because` is kept, and it is the point of the states model: a run that hears NO error can then report
  // what it EXPECTED to hear rather than reporting bare silence.
  assert.equal(config.forms[0].states[0].because, "no email address");
  const success = config.forms[0].states[1].fields;
  assert.equal(success[0].value, "ada@example.test");
  assert.equal(success[1].choose, "Double");
  assert.equal(success[2].check, true);
});

test("a field with NO instruction is refused", () => {
  // Not defaulted to "type nothing". A field nobody said what to do with is a config the author has not
  // finished, and guessing would make the file's meaning depend on this parser rather than on its author.
  rejects(VALID.replace('            value: ""\n', ""), /says nothing to do with "Email address"/);
});

test("a field with TWO instructions is refused rather than silently preferred", () => {
  // Preferring one would make the file's meaning depend on the parser's internal order, which is exactly
  // the kind of hidden precedence that makes a config file untrustworthy.
  rejects(VALID.replace('            check: true', '            check: true\n            value: "x"'),
    /more than one instruction/);
});

test("a state name outside the fixed vocabulary is refused", () => {
  // The vocabulary is what makes "properly tested" computable: each criterion declares which states it
  // needs, so a config with only an error state can be reported as answering HALF of 4.1.3.
  rejects(VALID.replace("      - state: error", "      - state: mostly-fine"), /must be error or success/);
  assert.deepEqual([...STATE_NAMES], ["error", "success"]);
});

test("origin is required, and it is not decoration", () => {
  rejects(VALID.replace("origin: https://booking.example.com\n", ""), /origin: is required/);
});

test("a config is refused against a DIFFERENT origin", () => {
  const config = parseFormsConfig(VALID);
  assert.doesNotThrow(() => refuseIfWrongOrigin(config, "https://booking.example.com/rooms?x=1"));
  assert.throws(() => refuseIfWrongOrigin(config, "https://booking.example.org/rooms"),
    /Refusing/);
});

test("origin is compared as an ORIGIN, never as a string prefix", () => {
  // `startsWith` would accept this, and it is the classic way an allowlist is escaped. The values in a
  // forms config were supplied for one site; sending them to a lookalike is the failure this guard exists
  // to prevent, not a stylistic preference for URL parsing.
  const config = parseFormsConfig(VALID);
  assert.throws(() => refuseIfWrongOrigin(config, "https://booking.example.com.attacker.test/rooms"),
    /Refusing/);
});

test("a form with no states does nothing, and says so", () => {
  rejects(`
version: 1
origin: https://x.example.com
forms:
  - form: "F"
    submit: "S"
    states: []
`, /declares no states:/);
});

test("a file that is not this config at all is refused, not half-read", () => {
  rejects("just a string", /is empty or is not a mapping/);
  rejects("version: 2\norigin: https://x.test\nforms: []", /version: must be 1/);
});
