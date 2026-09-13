// WHERE THE EXAMINATION ENDED (#1363): the pure half, over captures built from rehearsal 2's own strings.
// The real artifacts are driven through the real producer in `packages/cli/src/left-site-acceptance.test.ts`.
import { test } from "node:test";
import assert from "node:assert/strict";

import { announcesANewWindow, leftSite, leftSiteReason, withinTheSite, type SiteBoundCapture } from "./left-site.js";

// Quoted from run 34767932873's `a11ign-result.json` (#915's rehearsal 2).
const EMBED = "main landmark, Web Accessibility Perspectives: Video Captions, region, Video, frame, clickable, "
  + "thumbnail-image, graphic, button";
const YOUTUBE_TAB = "W 3C Web Accessibility Initiative (WAI) - You Tube - Memory usage - 293 MB, tab, focused, "
  + "selected, youtube dot com, 1 of 1";
const ADDRESS_BAR = "Address and search bar, search landmark, focused, collapsed, Search or enter web address, Ctrl "
  + "plus, L, selected https: slash slash www dot youtube dot com slash channel slash UCU 6ljj 3m 1fgl I Pj Sjs 2Dp RA";

/** The rehearsal's shape: the embed is the first form field, and everything after it ran on youtube.com. */
function rehearsalShape(overrides: Partial<SiteBoundCapture> = {}): SiteBoundCapture {
  return {
    url: "https://www.w3.org/WAI",
    structure: {
      headings: ["W 3C Web Accessibility Initiative Home, heading, level 1"],
      landmarks: ["main landmark"],
      formFields: [EMBED, "Search, button", "Subscribe, button"],
      links: ["You Tube Home, link"],
      graphics: [],
      lists: [],
      frames: [],
      tableCells: [],
    },
    interaction: {
      controls: [EMBED, "Search, button", "Subscribe, button"],
      stateChanges: [],
      formChanges: [
        { control: EMBED, kind: "taskButton", after: "Opening new window" },
        { control: "Subscribe, button", kind: "submit", after: "Want to subscribe to this channel?" },
        { control: "You Tube Home, link", kind: "route", after: "same page" },
      ],
      postSubmitFields: ["Search, button"],
      postSubmitNames: ["YouTube"],
      navigatedOnSubmit: { checked: true, navigated: false },
      focusOrder: ["You Tube Home, link, focused, linked", YOUTUBE_TAB, ADDRESS_BAR],
      routeChange: { control: "You Tube Home, link", navigated: true },
    },
    ...overrides,
  };
}

test("#1363: an older capture's excursion is DERIVED from the activation that announced a new window", () => {
  assert.deepEqual(leftSite(rehearsalShape()), {
    control: EMBED,
    kind: "taskButton",
    phase: "sweep",
    from: "https://www.w3.org/WAI",
    to: "https://www.youtube.com",
    source: "derived",
    evidence: "Opening new window",
  });
});

test("#1363: a capture whose activations all stayed on the page has no excursion", () => {
  const stayed = rehearsalShape();
  stayed.interaction!.formChanges = [{ control: "Search, button", kind: "submit", after: "dialog" }];
  assert.equal(leftSite(stayed), null);
});

test("#1363: Edge's own New Tab BUTTON is not an activation opening a tab", () => {
  assert.equal(announcesANewWindow("New Tab, button, focused, New tab (Ctrl plus T), Ctrl plus, T"), false);
  assert.equal(announcesANewWindow("Opening new tab"), true);
});

test("#1363: the cut keeps what ran before the excursion and names everything after it", () => {
  const capture = rehearsalShape();
  const before = JSON.stringify(capture);
  const left = leftSite(capture)!;
  const { capture: within, notExamined } = withinTheSite(capture, left);

  assert.deepEqual(within.structure!.headings, capture.structure!.headings, "headings were swept on the page");
  assert.deepEqual(within.structure!.landmarks, capture.structure!.landmarks);
  assert.deepEqual(within.structure!.formFields, [EMBED], "fields up to and including the control that left");
  assert.deepEqual(within.interaction!.controls, [EMBED]);
  assert.deepEqual(within.interaction!.formChanges, [capture.interaction!.formChanges![0]],
    "the activation that left is the page's own behaviour; nothing after it is");

  for (const gone of ["links", "graphics", "lists", "frames", "tableCells"]) {
    assert.equal(gone in within.structure!, false, `${gone} ran on the other site`);
  }
  for (const gone of ["postSubmitFields", "postSubmitNames", "navigatedOnSubmit", "focusOrder", "routeChange"]) {
    assert.equal(gone in within.interaction!, false, `${gone} ran on the other site`);
  }
  assert.deepEqual(notExamined, ["formFields", "graphics", "links", "lists", "frames", "tableCells",
    "navigatedOnSubmit", "postSubmitNames", "postSubmitFields", "focusOrder", "routeChange"]);
  assert.deepEqual(within.observed!.links, { asked: false, why: leftSiteReason(left) });
  assert.equal(leftSiteReason(left), `left the site at "${EMBED}"`);
  assert.equal(JSON.stringify(capture), before, "the input is not modified");
});

test("#1363: a RECORDED excursion in the route-change probe removes that probe and nothing before it", () => {
  const capture = rehearsalShape();
  capture.interaction!.formChanges = [];
  capture.interaction!.leftSite = {
    control: "You Tube Home, link", kind: "route", phase: "routeChange",
    from: "https://www.w3.org/WAI", to: "https://www.youtube.com/", evidence: "https://www.youtube.com/",
  };
  const left = leftSite(capture)!;
  assert.equal(left.source, "recorded");
  const { capture: within, notExamined } = withinTheSite(capture, left);
  assert.deepEqual(notExamined, ["routeChange"]);
  assert.deepEqual(within.structure!.links, capture.structure!.links);
  assert.deepEqual(within.interaction!.focusOrder, capture.interaction!.focusOrder);
});

test("#1363: with the focus pass FIRST, a sweep excursion leaves the focus pass standing", () => {
  const capture = rehearsalShape({ diagnostics: [{ event: "probeOrder", order: "focus,sweep" }] });
  const { capture: within, notExamined } = withinTheSite(capture, leftSite(capture)!);
  assert.deepEqual(within.interaction!.focusOrder, capture.interaction!.focusOrder, "it ran before the sweep");
  assert.equal(notExamined.includes("focusOrder"), false);
  assert.equal(notExamined.includes("links"), true);
});
