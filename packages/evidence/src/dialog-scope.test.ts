/**
 * A SWEEP THAT RAN OUT INSIDE A DIALOG RAN OUT OF THE DIALOG — #897, the cause behind #887.
 *
 * #887 stopped the report claiming a full page over a collapsed sweep, by comparing trips against the
 * census. That is the consequence and it is arithmetic. **This is the cause, and it can name the scope.**
 *
 * On `runs/781-r1-hubspot.json/capture-1` the `landmark` sweep's last stop is literally
 * `"Hub Bot, dialog"` — it walked into HubSpot's chat widget and left the cursor inside an open modal.
 * A screen reader's quick navigation is confined to one, so every sweep that ran while it was open
 * exhausted the DIALOG, truthfully:
 *
 *     formField  12 found — every one a chat-widget control
 *     graphic     2 found — the two Hub Bot avatars
 *     link        1 found — "privacy policy, link"        against a census of 79
 *
 * Then the dialog closed, `list` found the page's real 22 lists, and `frame` saw the widget as
 * `"... opens dialog"`. **Nothing was wrong with the page, the worker, the build or the sweep**, and the
 * same capture's `heading` sweep found 28 — as many as the healthy captures did. That discriminator is
 * what rules out a dead worker or a page that failed to load, and it is asserted below.
 *
 * ## WHAT THESE TESTS CAN AND CANNOT DO
 *
 * The captures predate the field, so **the fixture proves the defect happened and cannot exercise the
 * fix**. The split is deliberate and stated rather than papered over:
 *
 *   - `dom-census-expression.test.ts` runs the page-side rule against a synthetic DOM — it proves the
 *     field DETECTS an open modal, and refuses a non-modal one.
 *   - this file drives the consumer over both shapes — it proves a sealed sweep withholds the full-page
 *     claim and a healthy one does not.
 *   - the fixture below shows the two captures the row is about, and that the evidence was always on the
 *     record in a form nothing read.
 *
 * Joining them needs one capture taken after the fleet deploys, which is the fleet operator's.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ranOutInsideADialog, sweepOutcomes, conformanceScope } from "./conformance.js";

const fixture = JSON.parse(readFileSync(
  resolve(import.meta.dirname, "fixtures-dialog-scope-897.json"), "utf8")) as {
    captures: {
      source: string, census: Record<string, number>,
      sweeps: { type: string, found: number, prevTrips: number, nextTrips: number,
        prevStop: string, nextStop: string, lastPhrase: string | null, phrases: string[] }[],
    }[],
  };

const sweepOf = (capture: number, type: string) => {
  const found = fixture.captures[capture].sweeps.find((s) => s.type === type);
  assert.ok(found, `the fixture no longer holds capture-${capture + 1}'s ${type} sweep`);
  return found!;
};

/** A capture's sweep marks, with a scope attached as the fix would record it. */
const withScope = (capture: number, openDialog: string | null) =>
  fixture.captures[capture].sweeps.map((s) => ({ event: "sweep", ...s, scope: { openDialog } }));

const scopeInput = (marks: unknown[]) => ({
  assessedCriteria: [], screenReader: "NVDA 2024.4", ruleLayerRan: false,
  sweeps: sweepOutcomes(marks), census: fixture.captures[0].census,
});

test("THE EVIDENCE WAS ALWAYS ON THE RECORD: the landmark sweep ended inside the dialog", () => {
  // The row's whole cause, in one field nothing read. This is the fixture's job — it cannot exercise the
  // fix, and it can show that the fix is aimed at something real.
  assert.equal(sweepOf(0, "landmark").lastPhrase, "Hub Bot, dialog");
  assert.equal(sweepOf(1, "landmark").lastPhrase !== "Hub Bot, dialog", true,
    "the healthy capture's landmark sweep did not end inside the widget");
});

test("the discriminator that rules out a broken worker is inside the same capture", () => {
  // heading behaved on the very capture where link collapsed. A dead worker, a wedged NVDA or a page
  // that failed to load cannot produce that; a cursor sealed in a dialog can.
  assert.equal(sweepOf(0, "heading").found, 28);
  assert.equal(sweepOf(1, "heading").found, 28, "as many as the healthy capture found");
  assert.equal(sweepOf(0, "link").found, 1);
  assert.equal(sweepOf(1, "link").found, 74);
});

test("a sweep sealed inside a modal is reported, by the dialog's name", () => {
  const sealed = ranOutInsideADialog(scopeInput(withScope(0, "Hub Bot")));
  assert.deepEqual(sealed.map((s) => `${s.type}:${s.dialog}`).sort(),
    ["formField:Hub Bot", "frame:Hub Bot", "graphic:Hub Bot", "heading:Hub Bot",
      "landmark:Hub Bot", "link:Hub Bot", "list:Hub Bot"],
    "every sweep that ran out while the modal was open is confined by it — the field says WHICH scope "
    + "was examined, and the report needs the name to point a reader at it");
});

test("no modal open means nothing is reported, however little a sweep found", () => {
  // The healthy capture, and the direction that matters: this must not fire on a page that was simply
  // sparse. `null` is "read, no modal" — a real answer, not an absence.
  assert.deepEqual(ranOutInsideADialog(scopeInput(withScope(1, null))), []);
});

test("`sweepOutcomes` omits the key entirely when no scope was recorded", () => {
  // Where the undefined/null distinction is actually OBSERVABLE. In `ranOutInsideADialog` both are
  // falsy and a guard for it could not fail — mutation proved that and the guard came out. Here the
  // difference is real: a reader can tell "nobody asked" from "asked, and there was no dialog".
  const noScope = sweepOutcomes([{ event: "sweep", type: "link", prevStop: "exhausted", found: 1 }]);
  assert.equal("openDialog" in noScope[0], false,
    "a pre-#897 capture must not be reported as having seen no dialog — it saw nothing either way");

  const readNoModal = sweepOutcomes([
    { event: "sweep", type: "link", prevStop: "exhausted", found: 1, scope: { openDialog: null } },
  ]);
  assert.equal(readNoModal[0].openDialog, null,
    "a capture that DID look and found no modal has a real answer, and it is not absence");
});

test("a capture that never recorded a scope is not told what it did not record", () => {
  // Every capture on disk today. `undefined` and `null` are different answers, and reading the first as
  // the second would withhold the full-page claim from the entire corpus on evidence none of it carries.
  const noScope = fixture.captures[0].sweeps.map((s) => ({ event: "sweep", ...s }));
  assert.deepEqual(ranOutInsideADialog(scopeInput(noScope)), []);
});

test("Requirement 2 withholds the full-page claim and NAMES the dialog", () => {
  const [, requirement2] = conformanceScope(scopeInput(withScope(0, "Hub Bot")));
  assert.equal(requirement2.establishes, "Part of the page was examined.");
  assert.match(requirement2.limitation, /inside "Hub Bot"/,
    "the dialog's name must be IN the sentence — a reader cannot go and look at 'a modal'");
  assert.match(requirement2.limitation, /ran out of the DIALOG rather than of the page/);
  assert.match(requirement2.limitation, /it is correct about the dialog/,
    "`exhausted` is the screen reader's own answer and the sentence must not call it wrong");
});

test("the healthy capture still earns the full-page sentence", () => {
  const [, requirement2] = conformanceScope(scopeInput(withScope(1, null)));
  assert.match(requirement2.establishes, /Every structural sweep ran until the page ran out of elements/,
    "withholding the claim from a capture that earned it is the same defect pointed the other way");
});

test("a HALF-exhausted sweep is left to `truncatedSweeps`, not double-reported", () => {
  const oneDirection = [{
    event: "sweep", type: "link", found: 1, prevTrips: 4, nextTrips: 4,
    prevStop: "exhausted", nextStop: "deadline", scope: { openDialog: "Hub Bot" },
  }];
  assert.deepEqual(ranOutInsideADialog(scopeInput(oneDirection)), [],
    "a sweep that hit a deadline in one direction is already truncated and already reported");
});

test("a sweep with only ONE direction on the record cannot be judged", () => {
  // The case that survived mutation on #887 and had to be added afterwards. Written first this time.
  const oneSide = [{
    event: "sweep", type: "link", found: 1, prevTrips: 4, prevStop: "exhausted",
    scope: { openDialog: "Hub Bot" },
  }];
  assert.deepEqual(ranOutInsideADialog(scopeInput(oneSide)), [],
    "half a sweep is not a sweep, and a mark recording one direction is one this check has no "
    + "arithmetic for");
});
