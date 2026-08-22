// A REAL PAGE, ON THE FIRST RUN, ACCUSED OF SOMETHING IT DOES NOT DO.
//
// Running the tool against developer.mozilla.org — an out-of-sample page, chosen because it is well built,
// so the direction that matters for an accessibility tool is a FALSE POSITIVE — produced:
//
//   [SERIOUS] 2.4.3 Focus Order
//     reads as ["Toggle","Search the site","Toggle","HTML",...] but tabs as ["Search the site","Toggle",...]
//
// MDN has a sidebar toggle and a theme toggle. Both announce as "Toggle", so the reading order contains the
// name twice and the tab order once, and a comparison on NAMES cannot tell "this control moved" from "that
// is a different control". Drop the ambiguous name and the two sequences are identical.
//
// The report's own §2 already names the mechanism as a coverage limit — "the two differ where identical
// announcements collapse" — but nothing had connected that to the rules built on matching names. This
// project's own standard: "a missed finding costs a user; an invented one is an accusation someone may be
// challenged over."
import { test } from "node:test";
import assert from "node:assert/strict";

import { ruleFindings } from "./rules.js";

/** The MDN evidence, reduced to the two channels the rules compare. */
const mdn = {
  transcript: [],
  structure: {
    formFields: ["Toggle, button", "Search the site, edit", "Toggle, button", "HTML, link", "CSS, link",
      "Java Script, link", "Web AP Is, link", "All, link", "Learn, link"],
  },
  interaction: {
    focusOrder: ["Search the site, edit, focused", "Toggle, button, focused", "HTML, link, focused",
      "CSS, link, focused", "Java Script, link, focused", "Web AP Is, link, focused",
      "All, link, focused", "Learn, link, focused"],
  },
};

test("a repeated control name does not become a focus-order finding", () => {
  const found = ruleFindings(mdn as never).map((f) => f.wcag);
  assert.ok(!found.some((w) => w.startsWith("2.4.3")),
    `2.4.3 fired on evidence whose only disagreement is an ambiguous name: ${found.join(", ")}`);
});

test("a repeated control name does not become a keyboard-unreachable finding", () => {
  const found = ruleFindings(mdn as never).map((f) => f.wcag);
  assert.ok(!found.some((w) => w.startsWith("2.1.1")),
    `2.1.1 fired on a control that cannot be tracked by name: ${found.join(", ")}`);
});

test("an UNAMBIGUOUS reordering is still reported", () => {
  // The guard must not buy silence by refusing to decide. Same shape, no repeated names.
  const scrambled = {
    transcript: [],
    structure: { formFields: ["Full name, edit", "Email, edit", "Postcode, edit"] },
    interaction: {
      focusOrder: ["Postcode, edit, focused", "Full name, edit, focused", "Email, edit, focused"],
    },
  };
  const found = ruleFindings(scrambled as never).map((f) => f.wcag);
  assert.ok(found.some((w) => w.startsWith("2.4.3")),
    "dropping ambiguous names must not stop the rule reporting a real reordering");
});
