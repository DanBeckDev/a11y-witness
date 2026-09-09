/**
 * `exhausted` IS TRUE ABOUT WHERE THE CURSOR WAS, NOT ABOUT THE PAGE — #887.
 *
 * A link sweep reported `exhausted` in BOTH directions after 8 trips, having found 1 link on a page whose
 * own accessibility census counts 79. Two captures of the same page, same worker, same build, minutes
 * apart, found 74. The report then rendered *"every structural sweep ran until the page ran out of
 * elements"* over the capture that read one link.
 *
 * **`exhausted` is the one stop reason this codebase treats as authoritative rather than inferred** —
 * `verify.ts` says so: *"NVDA announces the end of a page ('no next link'), which is `exhausted`; anything
 * else is an inference."* It is the screen reader's own answer, and it was not wrong. It was answering
 * about its cursor's scope.
 *
 * ## THE CAUSE, FROM THE CAPTURE'S OWN PHRASES
 *
 * The `landmark` sweep — the one before the collapse — ends on:
 *
 *     "Chat Widget, region, Chat Widget, frame, clickable, Open live chat, button, opens dialog"
 *     "Hub Bot, dialog"                                                    <- its LAST stop
 *
 * It walked into HubSpot's chat widget and left the cursor inside an open dialog. Every sweep that ran
 * while it was open exhausted that dialog, truthfully:
 *
 *     formField  12 found, and every one is a chat-widget control ("Ask me anything...", "send message",
 *                "Resize widget height or width", "Close live chat")
 *     graphic     2 found  ("Avatar of Hub Bot", "Message History ... Avatar of Hub Bot")
 *     link        1 found  ("privacy policy, link")
 *
 * Then the `list` sweep found the real page's 22 lists and the `frame` sweep saw the widget as
 * `"... Open live chat, button, opens dialog"` — closed again. **Nothing was wrong with the page, the
 * worker, the build or the sweep.** The same capture's `heading` sweep found 28, exactly as the healthy
 * ones did.
 *
 * This is #863's finding one probe over: a verdict about a scope nobody recorded. There it was which
 * DOCUMENT the walk ran on; here it is which part of the document the cursor was inside.
 *
 * ## WHAT THIS CHECKS, AND WHAT IT REFUSES TO CLAIM
 *
 * **A sweep cannot have visited more elements than it made trips.** That is arithmetic and needs no
 * threshold, which is what the row asked for: *"a rule that names the number it compares"*.
 *
 * It does **not** prove the sweep was scoped wrongly — the census counts AX nodes in roles a
 * quick-navigation key may never reach (#800's finding about `formControl` and `f`). So this WITHHOLDS
 * Requirement 2's affirmative full-page sentence rather than asserting incompleteness. Withholding a
 * claim needs doubt; making one needs proof.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ranOutShortOfTheCensus, sweepOutcomes, conformanceScope } from "./conformance.js";

const fixture = JSON.parse(readFileSync(
  resolve(import.meta.dirname, "fixtures-exhausted-887.json"), "utf8")) as {
    captures: {
      source: string,
      census: Record<string, number | string>,
      sweeps: { type: string, found: number, prevTrips: number, nextTrips: number,
        prevStop: string, nextStop: string, phrases: string[] }[],
    }[],
  };

/** The capture's sweep marks, in the shape `sweepOutcomes` reads them from. */
const diagnosticsOf = (n: number) => fixture.captures[n].sweeps.map((s) => ({ event: "sweep", ...s }));
const censusOf = (n: number) => fixture.captures[n].census as Record<string, number>;

const scopeInput = (n: number) => ({
  assessedCriteria: [], screenReader: "NVDA 2024.4", ruleLayerRan: false,
  sweeps: sweepOutcomes(diagnosticsOf(n)), census: censusOf(n),
});

test("the collapsed capture is caught, and the numbers are named", () => {
  const short = ranOutShortOfTheCensus(scopeInput(0));
  const link = short.find((s) => s.type === "link");
  assert.ok(link, "the 1-of-79-in-8-trips sweep must be caught — it is the row");
  assert.deepEqual(link, { type: "link", found: 1, census: 79, trips: 8 });

  const graphic = short.find((s) => s.type === "graphic");
  assert.deepEqual(graphic, { type: "graphic", found: 2, census: 28, trips: 12 },
    "the graphic sweep collapsed the same way in the same dialog, and the row names it too");
});

test("the healthy capture of the SAME page is not caught", () => {
  // The control, and the reason this is not a threshold: 208 trips against a census of 79 is a sweep that
  // could have visited them. Same page, same build, minutes apart.
  const short = ranOutShortOfTheCensus(scopeInput(1));
  assert.deepEqual(short.map((s) => s.type), [],
    "a sweep with more trips than the census has elements must pass — otherwise this fires on everything "
    + "and says nothing");
});

test("the same capture's HEADING sweep is not caught, because it behaved", () => {
  // The failure is PARTIAL, which is what rules out a dead worker or a page that failed to load. A check
  // that condemned the whole capture would lose that.
  const short = ranOutShortOfTheCensus(scopeInput(0));
  assert.equal(short.some((s) => s.type === "heading"), false,
    "heading found 28 in 62 trips on the collapsed capture — as many as the healthy ones");
});

test("Requirement 2 WITHHOLDS the full-page claim, and says what it compared", () => {
  const [, requirement2] = conformanceScope(scopeInput(0));
  assert.equal(requirement2.number, 2);
  assert.equal(requirement2.establishes, "Part of the page was examined.",
    "the affirmative sentence must not be rendered over a capture that read one link");
  assert.match(requirement2.limitation, /link \(1 found in 8 trips, census 79\)/,
    "the numbers must be IN the sentence — a reader cannot weigh 'incomplete'");
  assert.match(requirement2.limitation, /cannot have visited more elements than it made trips/);
  // And it must not overclaim in the other direction.
  assert.match(requirement2.limitation, /does not establish that anything was missed/,
    "the census counts elements a quick-nav key may not reach, and the sentence has to say so");
});

test("the healthy capture still gets the full-page sentence", () => {
  const [, requirement2] = conformanceScope(scopeInput(1));
  assert.match(requirement2.establishes, /Every structural sweep ran until the page ran out of elements/,
    "withholding the claim from a capture that earned it would be the same defect pointed the other way");
});

test("a capture with no trips recorded is not told what it did not record", () => {
  // Every capture taken before #887 lacks `prevTrips`/`nextTrips` on its sweep marks. Absent is not zero:
  // reading it as zero would withhold the claim from the entire corpus on evidence none of it carries.
  const withoutTrips = diagnosticsOf(0).map((mark) => {
    const stripped: Record<string, unknown> = { ...mark };
    delete stripped.prevTrips;
    delete stripped.nextTrips;
    return stripped;
  });
  const short = ranOutShortOfTheCensus({
    assessedCriteria: [], screenReader: "NVDA", ruleLayerRan: false,
    sweeps: sweepOutcomes(withoutTrips), census: censusOf(0),
  });
  assert.deepEqual(short, [], "a pre-#887 capture cannot answer this question and must not be made to");
});

test("no census, no comparison", () => {
  const short = ranOutShortOfTheCensus({
    assessedCriteria: [], screenReader: "NVDA", ruleLayerRan: false,
    sweeps: sweepOutcomes(diagnosticsOf(0)), census: null,
  });
  assert.deepEqual(short, [], "an invented denominator is worse than an absent one");
});

test("a sweep with only ONE direction on the record cannot be judged", () => {
  // Found by mutation: removing the both-directions check failed nothing, because the half-exhausted case
  // below is already caught by the stop reason. THIS is what that check actually guards — a mark carrying
  // `prevStop` and no `nextStop` at all. One direction's trips are half a sweep's trips, so comparing
  // them against a whole page's census would refuse the claim on arithmetic that does not apply.
  const oneDirectionOnly = [{
    event: "sweep", type: "link", found: 40, prevTrips: 8, prevStop: "exhausted",
  }];
  const short = ranOutShortOfTheCensus({
    assessedCriteria: [], screenReader: "NVDA", ruleLayerRan: false,
    sweeps: sweepOutcomes(oneDirectionOnly), census: { link: 79 },
  });
  assert.deepEqual(short, [],
    "half a sweep's trips are not the sweep's trips, and a mark that records one direction is a mark this "
    + "check has no arithmetic for");
});

test("a HALF-exhausted sweep is left to `truncatedSweeps`, not double-reported", () => {
  const oneDirectionRanOut = [{
    event: "sweep", type: "link", found: 1, prevTrips: 4, nextTrips: 4,
    prevStop: "exhausted", nextStop: "deadline",
  }];
  const short = ranOutShortOfTheCensus({
    assessedCriteria: [], screenReader: "NVDA", ruleLayerRan: false,
    sweeps: sweepOutcomes(oneDirectionRanOut), census: { link: 79 },
  });
  assert.deepEqual(short, [],
    "a sweep that hit a deadline in one direction is already truncated and already reported; counting it "
    + "here as well would report one capture's incompleteness twice");
});
