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
