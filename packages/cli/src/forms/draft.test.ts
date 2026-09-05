// THE DRAFT IS ITSELF AN ACCESSIBILITY REPORT, and these tests are what keep it one.
//
// The easy failure would be to emit only the fields we can address. That produces a tidy file, and it
// silently drops every field NVDA announced with no name -- which are exactly the 4.1.2 failures, and
// exactly what a screen reader user also cannot reach. An omitted field is the empty-channel defect
// arriving in a generated artefact: the file looks complete and the page looks fine.
import { test } from "node:test";
import assert from "node:assert/strict";

import { draftFormsConfig } from "./draft.js";
import { parseFormsConfig } from "./config.js";

const ORIGIN = "https://booking.example.com";

test("a drafted config PARSES — otherwise we emit files that cannot load", () => {
  // The draft's whole value is that an author edits it rather than writing it. A skeleton the parser
  // rejects would send them to fix our output before they can start, which is worse than no draft.
  const { yaml } = draftFormsConfig(["Full name, edit", "Email address, edit"], { origin: ORIGIN });
  const config = parseFormsConfig(yaml);
  assert.equal(config.origin, ORIGIN);
  assert.equal(config.forms[0].states[0].state, "error");
  assert.deepEqual(config.forms[0].states[0].fields.map((f) => f.field), ["Full name", "Email address"]);
});

test("an UNNAMED field is named in a comment, never dropped", () => {
  const draft = draftFormsConfig(["Full name, edit", "edit", "Email address, edit"], { origin: ORIGIN });
  assert.deepEqual(draft.unnamed, [{ position: 2, announced: "edit" }]);
  assert.match(draft.yaml, /UNNAMED FIELD, 2 in reading order/);
  // The consequence spelled out in the file, because the author reading it is the person who can fix it.
  assert.match(draft.yaml, /neither can a screen reader user/);
  assert.match(draft.yaml, /4\.1\.2/);
});

test("a name collision gets `within:` from the group NVDA announced", () => {
  // Solved in the DRAFT, not in the schema: the easiest API for a collision is one the author never
  // writes. `within` is how a screen reader user tells two "Address line 1" apart.
  const draft = draftFormsConfig([
    "Billing address, grouping, Address line 1, edit",
    "Delivery address, grouping, Address line 1, edit",
  ], { origin: ORIGIN });
  const [billing, delivery] = draft.addressable;
  assert.equal(billing.name, "Address line 1");
  assert.equal(billing.within, "Billing address");
  assert.equal(delivery.within, "Delivery address");
  assert.match(draft.yaml, /DRAFTED: two fields share this name/);
});

test("a collision with NO group falls back to nth:, counting from 1", () => {
  const draft = draftFormsConfig(["Search, edit", "Search, edit"], { origin: ORIGIN });
  assert.deepEqual(draft.addressable.map((f) => f.nth), [1, 2]);
  assert.equal(draft.addressable[0].within, undefined);
});

test("a field whose name does NOT collide carries no disambiguator", () => {
  // Adding `within:` everywhere would be noise, and worse: it binds a field to a container that may change
  // for reasons unrelated to the field, so an edit elsewhere breaks a config that never needed it.
  const draft = draftFormsConfig(["Billing address, grouping, Postcode, edit"], { origin: ORIGIN });
  assert.equal(draft.addressable[0].within, undefined);
  assert.equal(draft.addressable[0].nth, undefined);
});

test("the draft leads with the fact that a success state SUBMITS", () => {
  // The one thing an author must understand before filling this in. It belongs at the top of the file
  // they are editing, not only in a document they may never open.
  const { yaml } = draftFormsConfig(["Full name, edit"], { origin: ORIGIN });
  assert.match(yaml, /`success` state COMPLETES the form/);
  assert.match(yaml, /--plan/);
});

test("a page with NO form fields still drafts something that loads", () => {
  // A real state, and it must not crash or emit an unparseable stub. It should be visibly empty instead.
  const draft = draftFormsConfig([], { origin: ORIGIN });
  assert.deepEqual(draft.addressable, []);
  assert.deepEqual(draft.unnamed, []);
  // No fields means the parser refuses it, and that refusal is CORRECT -- there is nothing to configure.
  assert.throws(() => parseFormsConfig(draft.yaml), /lists no fields:/);
});

// --- Found by running this against a real W3C page, which no unit test above would have caught. ---

test("a BUTTON is a submit candidate, never something to type into", () => {
  // First run against a real page drafted `"Submit Search", button` with `value: ""`. Typing into a button
  // is not a thing — the wrong verb for the control, which is the exact confusion the three-verb schema
  // exists to prevent, arriving through the generator instead of through the config.
  // `structure.formFields` is NVDA's FORM-FIELD quick-nav and it visits buttons; the census comment says so.
  const draft = draftFormsConfig(["Email address, edit", "Sign up, button"], { origin: ORIGIN });
  assert.deepEqual(draft.addressable.map((f) => f.name), ["Email address"]);
  assert.deepEqual(draft.submitCandidates, ["Sign up"]);
  // And it is USED, not merely collected: the author should not have to look up what they just saw.
  assert.match(draft.yaml, /submit: "Sign up"/);
});

test("an UNNAMED button is still reported — it is not fillable, and it is not a NAMED candidate either", () => {
  // `unnamed` used to be derived from `fillable`, which a button never is (it takes no verb) -- so an
  // icon-only submit button with no accessible name fell out of BOTH `unnamed` (not fillable) and
  // `submitCandidates` (no name to offer) and vanished from the draft with no trace at all. Measured
  // before the fix: `draftFormsConfig(["Email, edit", ", button"], ...).unnamed` was `[]`. A button
  // announced with no name is exactly as much a 4.1.2 finding as an unnamed edit field.
  const draft = draftFormsConfig(["Email, edit", ", button"], { origin: ORIGIN });
  assert.deepEqual(draft.unnamed, [{ position: 2, announced: ", button" }]);
  assert.deepEqual(draft.submitCandidates, [], "an unnamed button cannot be offered as a submit candidate");
  assert.match(draft.yaml, /UNNAMED FIELD, 2 in reading order/);
});

test("several buttons are all listed, because guessing which one submits is not ours to do", () => {
  const draft = draftFormsConfig(
    ["Email, edit", "Search, button", "Sign up, button"], { origin: ORIGIN });
  assert.match(draft.yaml, /buttons found: "Search", "Sign up"/);
});

test("a phrase the GRAMMAR cannot read is not reported as a page defect", () => {
  // The important one, and it is why `unparsed` exists as a category. A claim about OUR PARSER must never
  // be rendered as a claim about the PAGE: the first version put unreadable phrases under "UNNAMED FIELD"
  // and so stated a false 4.1.2 in a generated artefact.
  //
  // The specimen that found it — "Subscribe to newsletter, check box" — no longer belongs here, because
  // the grammar was fixed to read it (CONTROL_ROLES carried "checkbox" and NVDA says "check box"). That
  // is the right outcome and this test moved rather than being deleted: the CATEGORY must keep working
  // for the next role nobody has added yet, which is exactly what the old specimen proved is possible.
  const announced = "Time:, grouping, Show colour picker, colour well, empty";
  const draft = draftFormsConfig(["Email, edit", announced], { origin: ORIGIN });

  assert.deepEqual(draft.unnamed, [], "a phrase we could not parse must NOT be reported as unnamed");
  assert.deepEqual(draft.unparsed, [{ position: 2, announced }]);
  assert.match(draft.yaml, /NOT UNDERSTOOD by a11y-witness/);
  assert.match(draft.yaml, /gap in THIS TOOL's announcement grammar, not a finding about your page/);
  assert.doesNotMatch(draft.yaml, /UNNAMED FIELD, 2 /);
});

test("each control gets the VERB its role takes, not `value:` for everything", () => {
  // Two live bugs, the same shape, found one after the other by running against real pages: a button
  // drafted as typeable, then a checkbox drafted the same way the moment the grammar could see one.
  // Offering `value: ""` on a checkbox tells the author to type into it — the confusion the three-verb
  // schema exists to prevent, arriving through the generator.
  const draft = draftFormsConfig([
    "Email address, edit",
    "Room type, combo box",
    "complementary landmark, form, Subscribe to newsletter, check box, not checked",
  ], { origin: ORIGIN });

  assert.deepEqual(draft.addressable.map((f) => [f.name, f.verb]), [
    ["Email address", "value"],
    ["Room type", "choose"],
    ["Subscribe to newsletter", "check"],
  ]);
  assert.match(draft.yaml, /field: "Room type"\n\s+choose: ""/);
  // `check` drafts FALSE rather than an empty string: a checkbox has no empty value, and `check: ""`
  // would not survive the schema's own verb validation.
  assert.match(draft.yaml, /field: "Subscribe to newsletter"\n\s+check: false/);
  assert.deepEqual(draft.unparsed, [], "the grammar now reads a check box");
});

test("an unnamed FILLABLE control is still a real 4.1.2 finding", () => {
  // The other half. Separating parse failures from unnamed controls must not silence the finding that
  // matters — a control the grammar DID read, with no accessible name, is exactly 4.1.2.
  const draft = draftFormsConfig(["Email, edit", "edit"], { origin: ORIGIN });
  assert.deepEqual(draft.unparsed, []);
  assert.deepEqual(draft.unnamed, [{ position: 2, announced: "edit" }]);
  assert.match(draft.yaml, /UNNAMED FIELD, 2 in reading order/);
});
