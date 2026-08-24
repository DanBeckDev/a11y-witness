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
    // The sweep mark is REQUIRED now, and this fixture gaining one is the point rather than an
    // inconvenience: `structure.formFields` is the sweep's raw output, whose backward half is reversed,
    // so it is not reading order and 2.4.3 is entirely about order. `prevCount: 0` says the caret was at
    // the top and the whole sweep ran forwards, which is what makes this array document order.
    diagnostics: [{
      event: "sweep", type: "formField", prevCount: 0,
      phrases: ["Full name, edit", "Email, edit", "Postcode, edit"],
    }],
    interaction: {
      focusOrder: ["Postcode, edit, focused", "Full name, edit, focused", "Email, edit, focused"],
    },
  };
  const found = ruleFindings(scrambled as never).map((f) => f.wcag);
  assert.ok(found.some((w) => w.startsWith("2.4.3")),
    "dropping ambiguous names must not stop the rule reporting a real reordering");
});

test("2.1.1 makes no claim when the tab cycle was never observed to close", () => {
  // THE ROOT CAUSE, from developer.mozilla.org: 18 controls read, 12 tab stops, truncated, and the cycle
  // never returned to its first control. The rule used to reason "something LATER IN READING ORDER was
  // reached, so the probe got past this point" — a reading-order proxy for tab-order progress, unsound for
  // exactly the reason 2.4.3 exists: the two orders can differ. MDN's theme switch, language picker and
  // sidebar toggle read early and tab late, so the probe stopped before them and they were reported as
  // keyboard-unreachable on a well-built page.
  //
  // Tab wraps, so a recording that revisits its own starting control has seen every focusable there is.
  // Only then does "announced but never focused" mean unreachable.
  const truncated = {
    transcript: [],
    structure: {
      formFields: ["Switch color theme, button", "Toggle sidebar, button", "HTML, link", "CSS, link"],
    },
    // Starts somewhere else and stops without returning: a partial view of the cycle.
    interaction: { focusOrder: ["Skip to search, link, focused", "HTML, link, focused", "CSS, link, focused"] },
  };
  assert.deepEqual(ruleFindings(truncated as never).filter((f) => f.wcag.startsWith("2.1.1")), [],
    "a truncated tab order cannot distinguish an unreachable control from one the probe never got to");

  // And the claim survives when the cycle IS closed: same missing control, tab order wraps to its start.
  const complete = {
    ...truncated,
    interaction: {
      focusOrder: ["HTML, link, focused", "CSS, link, focused", "Toggle sidebar, button, focused",
        "HTML, link, focused"],
    },
  };
  assert.ok(ruleFindings(complete as never).some((f) => f.wcag.startsWith("2.1.1")),
    "with the whole cycle observed, a control announced and never focused IS unreachable");
});
