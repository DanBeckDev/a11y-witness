/**
 * Two defects that only appeared once the focus probe was allowed past twelve tab stops.
 *
 * `addKeyboardUnreachableControl` had never run against a real page. It refuses to claim anything unless
 * the tab cycle closes, and with `MAX_TAB_STOPS = 12` on pages carrying a median of 79 focusable elements
 * it never did. Raising the cap ran it for the first time, and it reported keyboard-unreachable controls
 * on 23 of 35 CONFORMANT real pages.
 *
 * The evidence below is taken from those captures verbatim.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { ruleFindings } from "./rules.js";

const fires = (capture: unknown, criterion: string) =>
  ruleFindings(capture as never).some((f) => String(f.wcag).startsWith(criterion));

/**
 * A named landmark, as NVDA announces one on a real site: the container's NAME and its ROLE are separate
 * comma groups. The corpus only ever produced the one-group form (`"form, Full name, edit"`), so every
 * fixture in `name-normalisation.test.ts` agreed while the two normalisers disagreed on this.
 */
const govUkNav = {
  transcript: [],
  structure: {
    formFields: [
      "banner landmark, Main navigation, navigation landmark, list, with 6 items, About us, button, collapsed",
      "Our work, button, collapsed",
      "Business guidance, button, collapsed",
    ],
  },
  interaction: {
    focusOrder: [
      "About us, button, focused, collapsed",
      "Our work, button, focused, collapsed",
      "Business guidance, button, focused, collapsed",
      "About us, button, focused, collapsed",
    ],
  },
};

test("a container prefix on the sweep's first entry is not a keyboard-unreachable control", () => {
  // What actually happened: the prefix survived normalisation, so "About us" reduced to
  // "main navigation navigation with 6 items about us" and matched nothing Tab had landed on.
  assert.equal(fires(govUkNav, "2.1.1"), false,
    "the control IS in the tab order; only the container preamble made it look absent");
});

test("...nor a focus-order finding, which reads the same two channels", () => {
  assert.equal(fires(govUkNav, "2.4.3"), false);
});

/**
 * `gov.scot/publications`, reduced: the probe recorded a closed cycle in 10 stops while the sweeps found
 * 78 focusable elements. A repeated navigation block satisfies `cycleClosed`, and then every control past
 * the false wrap reads as unreachable.
 */
const falseCycle = {
  transcript: [],
  structure: {
    links: Array.from({ length: 70 }, (_, i) => `Publication ${i}, link`),
    formFields: ["Search publications, edit", "Filter by topic, combo box", "Sort order, combo box"],
    buttons: ["Apply filters, button", "Clear filters, button"],
  },
  interaction: {
    // Ten stops, wrapping onto its own first three — a nav block that repeats, not a full cycle.
    focusOrder: [
      "Skip to main content, link, focused", "Cookies, link, focused", "Menu, button, focused",
      "Home, link, focused", "News, link, focused", "Publications, link, focused",
      "Topics, link, focused",
      "Skip to main content, link, focused", "Cookies, link, focused", "Menu, button, focused",
    ],
  },
};

test("a cycle that accounts for a tenth of the page is not evidence the rest is unreachable", () => {
  // The guard asks a SEPARATE instrument: quick-nav walks the document, Tab walks the focus ring, and
  // neither can produce the other's error. Ten stops against 75 swept focusable elements is the
  // order-of-magnitude disagreement a false wrap produces.
  assert.equal(fires(falseCycle, "2.1.1"), false,
    "a repeated nav block closed the cycle; the tab order never reached the page's controls");
});

test("a cycle that DOES account for the page still reports a genuinely missed control", () => {
  // The guard must not silence the rule. Same shape, but the tab order covers the page and one swept
  // control is genuinely absent from it.
  const real = {
    transcript: [],
    structure: { formFields: ["Search, edit", "Filter, combo box", "Hidden toggle, button"] },
    interaction: {
      focusOrder: ["Search, edit, focused", "Filter, combo box, focused", "Search, edit, focused"],
    },
  };
  assert.equal(fires(real, "2.1.1"), true,
    "a control the sweep announces and a COMPLETE tab cycle never reaches is the finding this rule is for");
});
