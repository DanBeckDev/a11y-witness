/**
 * #951: A SWEEP THAT RAN OUT OF A CONTAINER IS NOT THE PAGE'S EVIDENCE -- `sweptElsewhere`, the one verdict.
 *
 * #887's cause, from `runs/887-r9A-hubspot-w7.json`: on capture-1 HubSpot's chat widget had opened by itself,
 * and the link and graphic sweeps found the widget's 1 link and 2 graphics, both `exhausted`, with no modal
 * open. On capture-2, the same box minutes later, they found 44 and 22. Both captures are in
 * `fixtures-exhausted-887.json`, lifted verbatim.
 *
 * THE DISTRIBUTION THE THRESHOLD CAME FROM -- found ÷ `census.distinct.link` for every link sweep exhausted in
 * both directions, on this Mac's `runs/` (its own `training:repeat` and `npm run witness` outputs, file times
 * 2026-09-01 to 2026-09-11; a pre-check, confirmed on the lab's corpus before merge). The 18 below the gap are
 * four pages: hubspot (12 captures), theregister (4), calendly (1) and a modal dataset fixture.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  LINK_SWEEP_OF_THE_PAGE_FROM, captureIsSelfConsistent, captureSupports, sweepCompleteness, sweptElsewhere,
} from "./verify.js";

/** The measured edges of the gap. The threshold must sit strictly between them. */
const MEASURED = { trappedAtMost: 0.066, trappedSweeps: 18, pageAtLeast: 0.603, pageSweeps: 120, between: 0 };
/** Graphics' edges, which are why graphics have no ratio rule of their own. */
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

test("#951 THE TRAPPED CAPTURE: its link and graphic sweeps ran out of a container, and the container is named", () => {
  assert.deepEqual(sweptElsewhere(TRAPPED), [
    // "privacy policy, link" names no container: its absence is a first-class answer, not a failure to find one.
    { type: "link", container: null, found: 1 },
    { type: "graphic", container: "Message History, region", found: 2 },
  ]);
});

test("#951 THE CONTROL: capture-2, the same page on the same box minutes later, is the page's own sweep", () => {
  assert.deepEqual(sweptElsewhere(HEALTHY), []);
});

test("#951: the threshold sits in the MEASURED gap, not at a number somebody picked", () => {
  assert.ok(MEASURED.trappedAtMost < LINK_SWEEP_OF_THE_PAGE_FROM && LINK_SWEEP_OF_THE_PAGE_FROM < MEASURED.pageAtLeast,
    `the threshold ${LINK_SWEEP_OF_THE_PAGE_FROM} must lie between the trapped ${MEASURED.trappedAtMost} and the page's ${MEASURED.pageAtLeast}`);
  assert.equal(MEASURED.between, 0, "the gap was measured empty; if the lab's corpus fills it, the threshold is decided again");
});

test("#951: a page sweep is never marked -- near 1.0, a page with few links, the 0.5-0.9 band, a one-link page", () => {
  assert.deepEqual(sweptElsewhere(linkSweep(33, 33)), [], "a healthy sweep near 1.0");
  assert.deepEqual(sweptElsewhere(linkSweep(3, 3)), [], "a genuine page with few links, where found equals the census");
  assert.deepEqual(sweptElsewhere(linkSweep(1, 1)), [], "A GENUINE ONE-LINK PAGE reads as a page sweep");
  assert.deepEqual(sweptElsewhere(linkSweep(20, 33)), [], "0.61, in the 0.5-0.9 band");
  assert.deepEqual(sweptElsewhere(linkSweep(55, 100)), [], "0.55, in the 0.5-0.9 band");
});

test("#951: graphics FOLLOW their capture's link verdict, and have no ratio rule of their own", () => {
  // Their gap is too narrow to use -- trapped at most 0.074, a page's own from 0.131 -- but the collapse is the
  // capture's: all 17 trapped-link captures with a graphic census collapsed on graphics, none the other way.
  assert.ok(GRAPHICS.pageAtLeast - GRAPHICS.trappedAtMost < MEASURED.pageAtLeast - MEASURED.trappedAtMost);
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

test("#951 READER sweepCompleteness: the trapped sweeps are `elsewhere`, never `truncated` against a page they never examined", () => {
  const verdicts = sweepCompleteness(TRAPPED);
  assert.equal(verdicts.link, "elsewhere");
  assert.equal(verdicts.graphic, "elsewhere");
  assert.notEqual(sweepCompleteness(HEALTHY).link, "elsewhere");
});

test("#951 READER captureSupports: absence is refused, and the reason names the container -- or says there was none", () => {
  const { absence } = captureSupports(TRAPPED);
  assert.equal(absence.link.ok, false);
  assert.match(absence.link.why, /inside a container it did not name, not the page \(#951\)/);
  assert.equal(absence.graphic.ok, false);
  assert.match(absence.graphic.why, /inside "Message History, region", not the page \(#951\)/);
});

test("#951: the verdict WITHHOLDS CLAIMS and never discards a capture -- a modal fixture that traps by design stays evidence", () => {
  // `keyboard-trap-modal-escape.bad`'s shape: its sweeps are confined to the modal ON PURPOSE -- 0 of 6 links,
  // both directions exhausted -- and that confinement is the 2.1.2 finding. `captureIsSelfConsistent` decides
  // whether a capture is evidence at all (`isEvidence`, and a rejected training capture is retried), so the
  // verdict must not reach it: "a check must never reject evidence whose absence is the finding".
  const trapByDesign = captureOf({ census: { distinct: { link: 6 } },
    sweeps: [{ type: "link", found: 0, prevStop: "exhausted", nextStop: "exhausted", phrases: [] }] });
  assert.equal(sweepCompleteness(trapByDesign).link, "elsewhere", "the sweep is still marked: it is not the page's evidence");
  assert.equal(captureIsSelfConsistent(trapByDesign), true, "and the capture is still evidence");
  assert.equal(captureIsSelfConsistent(TRAPPED), true, "the chat-widget capture too: withheld from, never rejected");
});
