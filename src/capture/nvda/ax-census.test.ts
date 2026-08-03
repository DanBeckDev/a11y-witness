/**
 * The completeness oracle.
 *
 * `structure.landmarks` is swept with quick navigation, which cannot reach a landmark containing the
 * caret — so a `<main>` wrapping the page is invisible, on 2,063 of 2,064 corpus captures. An
 * under-reporting sweep is indistinguishable from a page that exposes nothing, and nothing could see it.
 *
 * Asking Chromium over the already-open DevTools socket costs milliseconds. Asking NVDA's own Elements
 * List costs ~11s per capture, because every keystroke waits on guidepup's 1s speech-quiet debounce —
 * the difference between a check you run on every capture and one you can never afford.
 *
 * This census is an ORACLE, never evidence: what the screen reader announced remains the evidence, and
 * the accessibility tree is explicitly barred from being a model feature.
 */
import { strict as assert } from "node:assert";
import test from "node:test";

import { censusFromAXTree } from "./browser-session.mjs";

const node = (role: string, name?: string, ignored = false) => ({
  role: { value: role }, name: name === undefined ? undefined : { value: name }, ignored,
});

test("counts the landmark roles a screen reader would announce", () => {
  const census = censusFromAXTree([
    node("main"), node("navigation", "Support links"), node("banner"), node("contentinfo"),
    node("complementary"), node("search"), node("form", "Hire duration"),
  ]);
  assert.equal(census.landmark, 7);
});

test("an UNNAMED region is not a landmark", () => {
  // ARIA requires an accessible name for role="region" to be exposed as a landmark, and NVDA agrees:
  // named regions are announced ("Latest news, region") while a bare <section> is not. Counting them
  // would make the oracle demand landmarks the page does not have, and a guard that cries wolf is
  // removed rather than heeded.
  assert.equal(censusFromAXTree([node("region")]).landmark, 0);
  assert.equal(censusFromAXTree([node("region", "")]).landmark, 0);
  assert.equal(censusFromAXTree([node("region", "Latest news")]).landmark, 1);
});

test("ignored nodes are not counted", () => {
  // A node the accessibility tree ignores is one NVDA can never announce, so requiring it would create
  // a disagreement no capture could ever satisfy.
  assert.equal(censusFromAXTree([node("main", undefined, true)]).landmark, 0);
  assert.equal(censusFromAXTree([node("heading", "Title", true)]).heading, 0);
});

test("the case that started this: a main wrapping the page IS exposed", () => {
  // The sweep reports [] here and the page really does have a landmark. That gap is the whole point.
  const census = censusFromAXTree([node("main"), node("heading", "Cycling guide"), node("heading", "Route safety")]);
  assert.equal(census.landmark, 1);
  assert.equal(census.heading, 2);
});

test("headings, links and graphics are counted for the other sweeps", () => {
  const census = censusFromAXTree([
    node("heading", "A"), node("link", "Read more"), node("image", "A chart"), node("img", "Another"),
  ]);
  assert.deepEqual(census, { landmark: 0, heading: 1, link: 1, graphic: 2 });
});

test("a malformed or empty tree yields zeros, not a throw", () => {
  // The oracle must never be the reason a capture fails.
  assert.deepEqual(censusFromAXTree([]), { landmark: 0, heading: 0, link: 0, graphic: 0 });
  assert.deepEqual(censusFromAXTree(undefined as never), { landmark: 0, heading: 0, link: 0, graphic: 0 });
  assert.deepEqual(censusFromAXTree([null, {}] as never), { landmark: 0, heading: 0, link: 0, graphic: 0 });
});
