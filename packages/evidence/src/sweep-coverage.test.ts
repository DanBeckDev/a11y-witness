/**
 * #951: A SWEEP THAT FOUND FAR LESS THAN THE CENSUS, WHATEVER HELD IT, IS NOT THE PAGE'S EVIDENCE --
 * `sweptElsewhere`, the one verdict. A coverage verdict, not a widget detector.
 *
 * #887's cause, from `runs/887-r9A-hubspot-w7.json`: on capture-1 HubSpot's chat widget had opened by itself,
 * and the link and graphic sweeps found the widget's 1 link and 2 graphics, both `exhausted`, with no modal
 * open. On capture-2, the same box minutes later, they found 44 and 22. Both captures are in
 * `fixtures-exhausted-887.json`, lifted verbatim.
 *
 * THE TWO POPULATIONS THE THRESHOLD SITS BETWEEN -- found ÷ `census.distinct.link`, the rule's own
 * denominator, for link sweeps `exhausted` in both directions with at least `LINK_CENSUS_FLOOR` distinct links:
 *
 *   local  this Mac's `runs/` (its `training:repeat`, `npm run witness` and dataset captures), recounted
 *          2026-09-11 -- a pre-check. Doubtful: 17 at most 0.066 -- hubspot (12), theregister (4), calendly
 *          (1). Healthy: 77 at least 0.603. Nothing between.
 *   lab    the real-page corpus `corpus-2026-09-11_03-35-45`, orchestrator's gate 1 on #951, recomputed on
 *          `distinct`. Doubtful: 4 -- gov.scot 0/45, nidirect 0/164, leeds 1/75, nrscotland/publications
 *          23/50 (0.460, a consent overlay that held part of the sweep). Healthy: 80 at least 0.639.
 *
 * product-manager's placement, on #951: above the highest doubtful sweep in EITHER (0.460), below the lowest
 * healthy in either (0.603). The lab captures named here are in the fixture, trimmed to the marks the rule reads.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  LINK_CENSUS_FLOOR, LINK_SWEEP_OF_THE_PAGE_FROM, captureIsSelfConsistent, captureSupports, sweepCompleteness, sweptElsewhere,
} from "./verify.js";

/** The measured edges, in both populations. The threshold must sit above every doubtful and below every healthy. */
const MEASURED = {
  local: { doubtfulAtMost: 0.066, doubtful: 17, healthyAtLeast: 0.603, healthy: 77 },
  lab: { doubtfulAtMost: 0.460, doubtful: 4, healthyAtLeast: 0.639, healthy: 80 },
};
/** A lab capture from the fixture, by the page name its `source` carries. */
const lab = (page: string) => captureOf(entry(`lab corpus-2026-09-11_03-35-45: ${page}`));
/** Graphics' edges, local only, which are why graphics have no ratio rule of their own. */
const GRAPHICS = { trappedAtMost: 0.074, pageAtLeast: 0.131 };

type Entry = { source: string, census: Record<string, unknown>, sweeps: Record<string, unknown>[] };
const FIXTURE = JSON.parse(readFileSync(resolve(import.meta.dirname, "fixtures-exhausted-887.json"), "utf8")) as
  { captures: Entry[] };
const entry = (source: string) => {
  const found = FIXTURE.captures.find((c) => c.source === source);
  assert.ok(found, `${source} is not in the fixture`);
  return found;
};

const FIELD: Record<string, string> = { heading: "headings", landmark: "landmarks", formField: "formFields",
  graphic: "graphics", link: "links", list: "lists", frame: "frames" };

/** A capture as a reader receives it: the census and the sweep marks as diagnostics, and `structure` from them. */
function captureOf({ census, sweeps }: Pick<Entry, "census" | "sweeps">): Parameters<typeof sweptElsewhere>[0] {
  // Every structure array present and empty to start, as on a real capture -- `captureIsSelfConsistent` reads them.
  const structure: Record<string, string[]> = Object.fromEntries(Object.values(FIELD).map((f) => [f, []]));
  for (const s of sweeps) structure[FIELD[String(s.type)] ?? String(s.type)] = (s.phrases as string[] | undefined) ?? [];
  return {
    transcript: [], structure,
    diagnostics: [{ event: "structureCensus", ...census }, ...sweeps.map((s) => ({ event: "sweep", ...s }))],
  } as unknown as Parameters<typeof sweptElsewhere>[0];
}

/** A capture with one exhausted link sweep of `found` against a census of `census` distinct links. */
function linkSweep(found: number, census: number, graphic?: { found: number, census: number }) {
  const sweep = (type: string, n: number) => ({ type, found: n, prevStop: "exhausted", nextStop: "exhausted",
    phrases: Array.from({ length: n }, (_, i) => `main landmark, item ${i}, ${type}`) });
  return captureOf({
    census: { distinct: { link: census, ...(graphic ? { graphic: graphic.census } : {}) } },
    sweeps: [sweep("link", found), ...(graphic ? [sweep("graphic", graphic.found)] : [])],
  });
}

const TRAPPED = captureOf(entry("runs/887-r9A-hubspot-w7.json/capture-1.json"));
const HEALTHY = captureOf(entry("runs/887-r9A-hubspot-w7.json/capture-2.json"));

test("#951 THE HELD CAPTURE: its link and graphic sweeps found far less than the census, and the first container named is reported", () => {
  assert.deepEqual(sweptElsewhere(TRAPPED), [
    // "privacy policy, link" names no container: its absence is a first-class answer, not a failure to find one.
    { type: "link", container: null, found: 1 },
    { type: "graphic", container: "Message History, region", found: 2 },
  ]);
});

test("#951 THE CONTROL: capture-2, the same page on the same box minutes later, is the page's own sweep", () => {
  assert.deepEqual(sweptElsewhere(HEALTHY), []);
});

test("#951: the threshold sits between BOTH populations' edges, not at a number somebody picked", () => {
  const doubtful = Math.max(MEASURED.local.doubtfulAtMost, MEASURED.lab.doubtfulAtMost);
  const healthy = Math.min(MEASURED.local.healthyAtLeast, MEASURED.lab.healthyAtLeast);
  assert.ok(doubtful < LINK_SWEEP_OF_THE_PAGE_FROM && LINK_SWEEP_OF_THE_PAGE_FROM < healthy,
    `the threshold ${LINK_SWEEP_OF_THE_PAGE_FROM} must lie above every doubtful sweep (${doubtful}) and below every healthy one (${healthy})`);
});

test("#951 THE LAB'S DOUBTFUL SWEEPS are all marked -- the three zeros-and-ones, and the overlay that held PART of one", () => {
  for (const page of ["gov.scot/publications", "nidirect.gov.uk/information-and-services/motoring/mot-and-vehicle-testing",
    "leeds.ac.uk/undergraduate", "nrscotland.gov.uk/publications"]) {
    assert.deepEqual(sweptElsewhere(lab(page)).map((s) => s.type), ["link", "graphic"], page);
  }
});

test("#951 THE TWO LAB SWEEPS THE PLACEMENT WAS FIRST ARGUED FROM, and why neither is marked", () => {
  assert.deepEqual(sweptElsewhere(lab("nrscotland.gov.uk/statistics-and-data")), [],
    "doubtful on raw (23/48 = 0.479), healthy on distinct (23/36 = 0.639): the rule divides by distinct");
  assert.deepEqual(sweptElsewhere(lab("sepa.org.uk/environment/water/bathing-waters")), [],
    "no `distinct` census (captured 2026-08-25): not judged, whatever its raw ratio");
});

test("#951 THE FLOOR: below LINK_CENSUS_FLOOR distinct links the rule does not judge -- one link is not evidence", () => {
  assert.equal(LINK_CENSUS_FLOOR, 10);
  const oneLinkPage = lab("focus-panel-undismissable-help/good.html (dataset page)");
  assert.deepEqual(sweptElsewhere(oneLinkPage), [], "a known-good page counting one distinct link, its sweep finding none");
  assert.notEqual(sweepCompleteness(oneLinkPage).link, "elsewhere", "not judged, never `elsewhere`");
  // `keyboard-trap-modal-escape.bad`'s shape: 0 of 6, trapped by design. Under the floor, main's census
  // comparison answers unchanged -- `truncated`, so its absence is still withheld.
  const modalFixture = linkSweep(0, 6);
  assert.deepEqual(sweptElsewhere(modalFixture), []);
  assert.equal(sweepCompleteness(modalFixture).link, "truncated");
  assert.deepEqual(sweptElsewhere(linkSweep(0, LINK_CENSUS_FLOOR)).map((s) => s.type), ["link"], "AT the floor, it judges");
});

test("#951: a page sweep is never marked -- near 1.0, both populations' lowest healthy, a page with few links", () => {
  assert.deepEqual(sweptElsewhere(linkSweep(33, 33)), [], "a healthy sweep near 1.0");
  assert.deepEqual(sweptElsewhere(linkSweep(20, 33)), [], "0.606, the local population's lowest healthy edge");
  assert.deepEqual(sweptElsewhere(linkSweep(23, 36)), [], "0.639, the lab's lowest healthy on distinct");
  assert.deepEqual(sweptElsewhere(linkSweep(10, 10)), [], "a page at the floor, where found equals the census");
});

test("#951: graphics FOLLOW their capture's link verdict, and have no ratio rule of their own", () => {
  // Their gap is too narrow to use -- trapped at most 0.074, a page's own from 0.131 -- but the collapse is the
  // capture's: all 17 trapped-link captures with a graphic census collapsed on graphics, none the other way.
  assert.ok(GRAPHICS.pageAtLeast - GRAPHICS.trappedAtMost < MEASURED.local.healthyAtLeast - MEASURED.local.doubtfulAtMost);
  assert.deepEqual(sweptElsewhere(linkSweep(1, 33, { found: 30, census: 32 })).map((s) => s.type), ["link", "graphic"],
    "a graphic sweep in a trapped-link capture is marked, whatever its own ratio");
  assert.deepEqual(sweptElsewhere(linkSweep(33, 33, { found: 2, census: 32 })), [],
    "a collapsed graphic sweep in a HEALTHY capture is not marked -- there is no graphic ratio rule");
});

test("#951: only a sweep that CLAIMED the end is judged, and only against a census that can say", () => {
  const halfExhausted = captureOf({ census: { distinct: { link: 33 } },
    sweeps: [{ type: "link", found: 1, prevStop: "exhausted", nextStop: "deadline", phrases: ["x, link"] }] });
  assert.deepEqual(sweptElsewhere(halfExhausted), [], "a sweep cut off by the deadline never claimed the end; it is truncated");
  const noDistinct = captureOf({ census: { link: 79 },
    sweeps: [{ type: "link", found: 1, prevStop: "exhausted", nextStop: "exhausted", phrases: ["x, link"] }] });
  assert.deepEqual(sweptElsewhere(noDistinct), [], "the gap was measured against `distinct`; without it there is no verdict");
});

test("#951 READER sweepCompleteness: the held sweeps are `elsewhere`, never `truncated` against a page they never covered", () => {
  const verdicts = sweepCompleteness(TRAPPED);
  assert.equal(verdicts.link, "elsewhere");
  assert.equal(verdicts.graphic, "elsewhere");
  assert.notEqual(sweepCompleteness(HEALTHY).link, "elsewhere");
});

test("#951 READER captureSupports: absence is refused, and the reason says what held it -- as far as the sweep said", () => {
  const { absence } = captureSupports(TRAPPED);
  assert.equal(absence.link.ok, false);
  assert.match(absence.link.why, /far less than the page's census, so something held it \(it named no container\), so it cannot speak for the page \(#951\)/);
  assert.equal(absence.graphic.ok, false);
  assert.match(absence.graphic.why, /something held it \(it named "Message History, region" first\)/);
  assert.doesNotMatch(absence.link.why, /widget/, "a coverage verdict names no cause");
});

test("#951: the verdict WITHHOLDS CLAIMS and never discards a capture -- a modal fixture that traps by design stays evidence", () => {
  // A page that confines its sweeps to a modal ON PURPOSE, as `keyboard-trap-modal-escape.bad` does -- both
  // directions exhausted, and that confinement is the 2.1.2 finding. `captureIsSelfConsistent` decides whether
  // a capture is evidence at all (`isEvidence`, and a rejected training capture is retried), so the verdict must
  // not reach it: "a check must never reject evidence whose absence is the finding". Shaped at 0 of 12 links,
  // above the floor, so the verdict fires; the real fixture's 0 of 6 is below it -- see THE FLOOR.
  const trapByDesign = captureOf({ census: { distinct: { link: 12 } },
    sweeps: [{ type: "link", found: 0, prevStop: "exhausted", nextStop: "exhausted", phrases: [] }] });
  assert.equal(sweepCompleteness(trapByDesign).link, "elsewhere", "the sweep is still marked: it is not the page's evidence");
  assert.equal(captureIsSelfConsistent(trapByDesign), true, "and the capture is still evidence");
  assert.equal(captureIsSelfConsistent(TRAPPED), true, "the chat-widget capture too: withheld from, never rejected");
});
