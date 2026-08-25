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

test("a radio group member absent from the tab order is NOT keyboard-unreachable", () => {
  // Native HTML gives a radio group ONE tab stop: Tab moves to the checked radio (or the first), and the
  // ARROW keys move between members. ARIA's Authoring Practices codify the same as "roving tabindex" for
  // tablists, menus and trees. None of it is a trap.
  //
  // Measured on design-system.service.gov.uk/components/radios, where the probe recorded
  // "England, radio button, focused, not checked, 1 of 5" — exactly one radio per group, as specified —
  // and 2.1.1 named Phone, Wales and Scotland as unreachable.
  //
  // The probe presses only Tab, so a capture cannot tell "reachable by arrows" from "unreachable". This
  // is the absence of a claim, not a narrower one.
  const radioGroup = {
    transcript: [],
    structure: {
      formFields: [
        "England, radio button, not checked", "Wales, radio button, not checked",
        "Scotland, radio button, not checked", "Continue, button",
      ],
      links: Array.from({ length: 4 }, (_, i) => `Link ${i}, link`),
    },
    interaction: {
      focusOrder: [
        "England, radio button, focused, not checked", "Continue, button, focused",
        "England, radio button, focused, not checked", "Continue, button, focused",
      ],
    },
  };
  assert.equal(fires(radioGroup, "2.1.1"), false,
    "Wales and Scotland are reached with arrow keys; Tab visiting one member of the group is correct");
});

test("a plain button the tab cycle never reaches IS still reported", () => {
  // The exclusion must not silence the rule. Same shape, but the missed control is a button — which has
  // its own tab stop, so its absence is the failure this rule exists for.
  const unreachable = {
    transcript: [],
    structure: {
      formFields: ["Search, edit", "Filter, combo box", "Hidden toggle, button"],
      links: Array.from({ length: 3 }, (_, i) => `Link ${i}, link`),
    },
    interaction: {
      focusOrder: ["Search, edit, focused", "Filter, combo box, focused", "Search, edit, focused"],
    },
  };
  assert.equal(fires(unreachable, "2.1.1"), true);
});

test("a disclosure button renamed by its own state is not keyboard-unreachable", () => {
  // Verbatim from docs.sign-in.service.gov.uk: the sweep recorded BOTH labels of one button, because
  // `probeDisclosure` activates a control and the capture spans that change, while the focus probe ran
  // afterwards and only ever saw the second.
  //
  //   sweep  "clickable, Expand Quick start, button, collapsed"
  //   sweep  "clickable, Collapse Quick start, button, expanded"
  //   focus  "Collapse Quick start, button, focused, expanded"
  //
  // 2.1.1 reported "Expand Quick start" as unreachable. It is the same button, before it was pressed.
  const disclosure = {
    transcript: [],
    structure: {
      formFields: [
        "clickable, Expand Quick start, button, collapsed",
        "clickable, Collapse Quick start, button, expanded",
        "Search, edit",
      ],
      links: Array.from({ length: 3 }, (_, i) => `Link ${i}, link`),
    },
    interaction: {
      focusOrder: [
        "Collapse Quick start, button, focused, expanded", "Search, edit, focused",
        "Collapse Quick start, button, focused, expanded", "Search, edit, focused",
      ],
    },
  };
  assert.equal(fires(disclosure, "2.1.1"), false,
    "the capture cannot tell a control RENAMED by an interaction from one nothing can reach");
});

test("NVDA saying there is no next link is not a control that was activated", () => {
  // Measured on gov.scot/publications: `after activating "no next link" the page moved to
  // "AUGUST 2025, heading, level 2" while the title stayed …`. Nothing was activated — quick-nav ran out
  // of links, NVDA said so, and the probe took its own end-of-page announcement for a control name.
  //
  // The heading changed because the caret moved, which is what quick-nav does.
  const exhausted = {
    transcript: [],
    interaction: {
      routeChange: {
        control: "no next link", navigated: true,
        titleBefore: "Publications - gov.scot", titleAfter: "Publications - gov.scot",
        headingBefore: "Publications, heading, level 1", headingAfter: "AUGUST 2025, heading, level 2",
      },
    },
  };
  assert.equal(fires(exhausted, "2.4.2"), false);
});

test("a real activation with a stale title IS still reported", () => {
  const stale = {
    transcript: [],
    interaction: {
      routeChange: {
        control: "Bookings, link", navigated: true,
        titleBefore: "Home - Example", titleAfter: "Home - Example",
        headingBefore: "Home, heading, level 1", headingAfter: "Your bookings, heading, level 1",
      },
    },
  };
  assert.equal(fires(stale, "2.4.2"), true);
});

test("a disclosure that opened DURING the capture stops 2.1.1 claiming anything", () => {
  // Measured on sportengland.org. The sweep recorded "Close search, button, expanded" and the fields
  // inside the open panel; the focus probe recorded "Toggle search, button, focused, collapsed". The
  // panel was open for one measurement and closed for the other, so the focusable set genuinely differed
  // — and 2.1.1 reported "Search" and "Submit search query" as unreachable when they did not exist at
  // the moment Tab was pressed.
  //
  // A capture is not an instant: probeDisclosure activates a control unconditionally.
  const mutated = {
    transcript: [],
    structure: {
      formFields: [
        "Toggle search, button, collapsed", "Toggle search, button, expanded",
        "form, Search, edit, required", "Submit search query, button",
      ],
      links: Array.from({ length: 4 }, (_, i) => `Link ${i}, link`),
    },
    interaction: {
      focusOrder: [
        "Toggle search, button, focused, collapsed", "Link 0, link, focused",
        "Toggle search, button, focused, collapsed", "Link 0, link, focused",
      ],
    },
  };
  assert.equal(fires(mutated, "2.1.1"), false,
    "the page mutated between the two measurements, so a set comparison across them proves nothing");
});

test("a code SAMPLE read aloud is not an image with a filename alternative", () => {
  // NVDA speaks punctuation, so markup printed on a page becomes text:
  // `<input type="image" src="searchbutton.png" alt="Search">` is announced as
  // "less input type equals image src equals searchbutton dot png alt equals Search greater".
  //
  // Measured on three of W3C's own accessibility TUTORIAL pages. `isImage` matched the word "image"
  // inside `type equals image`, and the filename rule then matched `searchbutton dot png` — so the pages
  // that TEACH how to write image alternatives were reported as getting it wrong. The example is the
  // subject of the lesson, printed as an example.
  const sample = {
    transcript: [
      "example:, less input type equals image src equals searchbutton dot png alt equals Search greater",
    ],
  };
  assert.equal(fires(sample, "1.1.1"), false);
});

test("a REAL filename alternative is still reported", () => {
  // The guard must not buy silence. This is the finding 1.1.1 exists for, and networkrail.co.uk has a
  // genuine one: an alt of "cropped-Awesome-railways-graphic-2-1035x532.png".
  const real = { transcript: ["graphic, cropped-Awesome-railways-graphic-2-1035 times 532 dot png"] };
  assert.equal(fires(real, "1.1.1"), true);
});

test("a label and role WRAPPED onto separate transcript lines is still one control", () => {
  // NVDA wraps a field's label and its role onto separate lines, and the corpus is full of it:
  //
  //     "form, Full name"     <- the label, with no role
  //     "edit"                <- the role, with no name
  //
  // Requiring both on one line found nothing there, so 2.4.3 caught 0 of the 4 corpus records it owns —
  // clean on real pages by being DEAF, which rules:gate refused. `hasEmptyName` already names this exact
  // shape. Both the wrapped and inline forms must reach the same finding.
  const wrapped = {
    transcript: ["form, Full name", "edit", "Email", "edit", "Postcode", "edit"],
    interaction: {
      focusOrder: ["Postcode, edit, focused", "Full name, edit, focused", "Email, edit, focused"],
    },
  };
  assert.equal(fires(wrapped, "2.4.3"), true, "the corpus shape must still be caught");

  const inline = {
    transcript: ["edit, Full name", "edit, Email", "edit, Postcode"],
    interaction: {
      focusOrder: ["Postcode, edit, focused", "Full name, edit, focused", "Email, edit, focused"],
    },
  };
  assert.equal(fires(inline, "2.4.3"), true, "and so must the real-page shape");
});
