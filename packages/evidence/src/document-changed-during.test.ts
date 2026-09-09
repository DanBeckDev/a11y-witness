/**
 * #758 — WHICH PART OF THE RUN WALKED WHICH DOCUMENT?
 *
 * `documentIdentity` (#687) gives a capture ONE identity; `targetMatch` (#699) says whether the census
 * described the requested page. Neither localises a mid-run navigation, and the calendly case turns on it.
 *
 * The fixture is the `pageState` and `sweep` marks lifted verbatim from the two captures #758's acceptance
 * names, so CI exercises the real records; `runs/` is gitignored and the corpus test below reads the
 * originals when they are present.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { documentChangedDuring } from "./verify.js";
import fixture from "./fixtures/calendly-758-pagestate.json" with { type: "json" };

const arm = (name: string) => fixture.arms.find((a) => a.arm === name)!;

test("the served document is named on both sides of the crossing", () => {
  const [crossing] = documentChangedDuring(arm("probeForms-on").capture as never)!;
  assert.equal(crossing.was, "https://calendly.com/");
  assert.equal(crossing.became, "https://accounts.google.com/v3/signin/identifier");
  assert.equal(crossing.from, "sweep");
  assert.equal(crossing.to, "focus");
});

/**
 * THE CORRECTION THIS TEST EXISTS TO PIN. The first version of `documentChangedDuring` compared
 * `FINGERPRINT_KEYS` counts and reported a change in BOTH arms — true, and useless: a page that
 * lazy-loads content changes its counts without changing document. Identity is the served URL.
 */
test("both arms navigated, and the OFF arm did not 'hold still'", () => {
  const off = documentChangedDuring(arm("probeForms-off").capture as never)!;
  assert.equal(off.length, 1, "the probeForms-off arm navigated too — to another calendly page");
  assert.equal(off[0].became, "https://calendly.com/scheduling");
  assert.notEqual(off[0].became, off[0].was);
});

test("a run that stayed on one document reports no crossing, not null", () => {
  // `[]` and `null` are different answers: nothing moved, versus nobody could tell. Collapsing them is
  // the defect this whole area is about.
  const still = {
    diagnostics: [
      { event: "pageState", beforeProbe: "sweep", targetUrl: "https://example.org/a", heading: 3 },
      { event: "pageState", beforeProbe: "focus", targetUrl: "https://example.org/a?utm=x", heading: 9 },
    ],
  };
  assert.deepEqual(documentChangedDuring(still as never), [],
    "a query string is not a document change — the served path is origin + path (#687)");
});

test("fewer than two readings is null — nobody asked", () => {
  assert.equal(documentChangedDuring({ diagnostics: [
    { event: "pageState", beforeProbe: "sweep", targetUrl: "https://example.org/a" }] } as never), null);
  assert.equal(documentChangedDuring({ diagnostics: [] } as never), null);
});

test("a failed fingerprint is not a reading", () => {
  // `markPageState` marks even when the count failed, precisely so "not counted" stays distinguishable
  // from "none". Reading one as a document would invent a crossing out of an error.
  assert.equal(documentChangedDuring({ diagnostics: [
    { event: "pageState", beforeProbe: "sweep", targetUrl: "https://example.org/a" },
    { event: "pageState", beforeProbe: "focus", error: "not counted", targetUrl: "https://elsewhere/" },
  ] } as never), null, "one usable reading is not two");
});

test("granularity follows the marks: per-sweep fingerprints name the sweep", () => {
  // The point of #758's instrumentation. With only per-probe marks this can say "between sweep and
  // focus" — a window containing eight sweeps. With `sweep:<type>` marks it names which one, and
  // reporting the first as though it were the second would be invented precision.
  const perSweep = {
    diagnostics: [
      { event: "pageState", beforeProbe: "sweep:heading", targetUrl: "https://calendly.com/" },
      { event: "pageState", beforeProbe: "sweep:formField", targetUrl: "https://calendly.com/" },
      { event: "pageState", beforeProbe: "sweep:graphic", targetUrl: "https://accounts.google.com/v3/signin/identifier" },
      { event: "pageState", beforeProbe: "sweep:link", targetUrl: "https://accounts.google.com/v3/signin/identifier" },
    ],
  };
  const crossings = documentChangedDuring(perSweep as never)!;
  assert.equal(crossings.length, 1);
  assert.equal(crossings[0].from, "sweep:formField",
    "the navigation happened during the formField sweep — which is what the extra marks buy");
  assert.equal(crossings[0].to, "sweep:graphic");
});

test("every crossing is reported, not just the first", () => {
  // A run that navigates away and back would otherwise read as a run that navigated once.
  const there = "https://calendly.com/";
  const away = "https://accounts.google.com/v3/signin/identifier";
  const marks = [there, away, there].map((targetUrl, i) =>
    ({ event: "pageState", beforeProbe: `sweep:${i}`, targetUrl }));
  assert.equal(documentChangedDuring({ diagnostics: marks } as never)!.length, 2);
});

/** THE SAME ASSERTION AGAINST THE FILES THEMSELVES — skips honestly where `runs/` is absent. */
test("the real captures on disk say what the fixture says", (t) => {
  const present = fixture.arms
    .map((a) => resolve(import.meta.dirname, "../../..", a.source))
    .filter((path) => existsSync(path));
  if (present.length < fixture.arms.length) {
    t.skip(`needs both records under runs/witness — found ${present.length} of ${fixture.arms.length}`);
    return;
  }
  for (const [i, path] of present.entries()) {
    const real = documentChangedDuring(JSON.parse(readFileSync(path, "utf8")).capture);
    const fromFixture = documentChangedDuring(fixture.arms[i].capture as never);
    assert.deepEqual(real, fromFixture, "the fixture is a reduction and must not have changed the answer");
  }
});
