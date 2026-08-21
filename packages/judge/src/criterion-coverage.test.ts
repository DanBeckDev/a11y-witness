/**
 * The coverage map must not drift from what ships, in EITHER direction.
 *
 * A map that says a criterion is unreachable after someone made it work is a roadmap that sends people
 * to build what exists. A map that says a criterion is assessed when it is not is the over-claim that
 * `coverage.ts` was written to prevent, one level of detail down. Both are caught here.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { WCAG_22_AA } from "@a11y-witness/evidence/wcag";

import { assessedCriteria } from "./coverage.js";
import { CRITERION_COVERAGE, channelsPresent, criteriaAssessableFrom } from "./criterion-coverage.js";

test("every WCAG 2.2 AA criterion has an entry, and nothing else does", () => {
  const real = WCAG_22_AA.map((c) => c.num).sort();
  assert.deepEqual(Object.keys(CRITERION_COVERAGE).sort(), real,
    "the map must cover all 55 and invent none — a criterion with no entry is one nobody has decided about");
});

test("the assessed entries are exactly what the judge can return a finding for", () => {
  const claimed = Object.entries(CRITERION_COVERAGE)
    .filter(([, c]) => c.status === "assessed" || c.status === "partial")
    .map(([num]) => num).sort();
  assert.deepEqual(claimed, assessedCriteria(),
    "coverage.ts and this map disagree about what ships — one of them is lying to a consumer");
});

test("anything not assessed says what evidence it would need", () => {
  // Without this the map degrades into the same undifferentiated `untested` bucket it exists to replace.
  for (const [num, entry] of Object.entries(CRITERION_COVERAGE)) {
    if (entry.status === "assessed") continue;
    assert.ok(entry.needs?.length, `${num} is ${entry.status} and names no evidence source`);
  }
});

test("every entry carries a reason, not just a status", () => {
  for (const [num, entry] of Object.entries(CRITERION_COVERAGE)) {
    assert.ok(entry.note.length > 30, `${num}: a status with no argument is not a decision`);
  }
});

test("4.1.2 is recorded as PARTIAL, because one of its failure modes is unassessable", () => {
  // The case this map exists for. Reported at criterion granularity a fake-button page reads as fine;
  // it is not, and `rule-ownership.json` declares that subtype `unavailable` for the same reason.
  assert.equal(CRITERION_COVERAGE["4.1.2"].status, "partial");
  assert.match(CRITERION_COVERAGE["4.1.2"].note, /role-less|div onclick/i);
});

test("every criterion that could be assessed names the CHANNELS it reads", () => {
  // The `needs` axis says which SOURCE could decide a criterion; it cannot answer "can this capture decide
  // it?". Without channels that question cost an afternoon of walking 4,899 captures over SSH.
  for (const [num, entry] of Object.entries(CRITERION_COVERAGE)) {
    if (entry.status === "out-of-scope") continue;
    assert.ok(entry.channels?.length, `${num} is ${entry.status} and names no evidence channel`);
  }
});

test("out-of-scope criteria name NO channel, because none could carry them", () => {
  // Not "unknown" — genuinely none. A channel here would imply a probe could reach it, which is the
  // distinction this whole map exists to preserve.
  for (const [num, entry] of Object.entries(CRITERION_COVERAGE)) {
    if (entry.status !== "out-of-scope") continue;
    assert.ok(!entry.channels?.length, `${num} is out-of-scope but claims a channel`);
  }
});

test("an empty channel counts as ABSENT, not as a clean result", () => {
  // The distinction this project keeps paying for. An empty `formChanges` and a probe that never ran are the
  // same shape on disk, and treating the first as evidence is how "we did not look" becomes "nothing there".
  const present = channelsPresent({ transcript: ["a"], interaction: { formChanges: [], focusOrder: ["x"] } });
  assert.ok(present.has("transcript"));
  assert.ok(present.has("focusOrder"));
  assert.ok(!present.has("formChanges"), "an empty array is not evidence");
});

test("a capture with no focus probe cannot assess the focusOrder criteria — the afternoon, as a call", () => {
  // Reproduces a measured fact: `probeFocus` is opt-in, the dataset runner never sets it, so no corpus
  // capture carries `focusOrder`, and every criterion reading it is unassessable there.
  const corpusShaped = {
    transcript: ["heading, level 1, Thing"],
    structure: { headings: ["Thing"], formFields: ["Email, edit"] },
    interaction: { controls: ["Save, button"], formChanges: [{ control: "Email", after: "" }] },
  };
  const { assessable, blocked } = criteriaAssessableFrom(corpusShaped);

  const blockedOnFocus = blocked.filter((b) => b.missing.includes("focusOrder")).map((b) => b.criterion);
  assert.ok(blockedOnFocus.includes("2.1.2"), "2.1.2 reads focusOrder and must be reported blocked");
  assert.ok(blockedOnFocus.includes("2.4.1"), "2.4.1 reads focusOrder");
  assert.ok(!assessable.includes("2.1.2"), "a criterion must never be assessable without its channels");
});

test("out-of-scope criteria are absent from BOTH lists, not reported as blocked", () => {
  // Listing 1.4.3 Contrast as "blocked" would imply a probe could fix it. Nothing is missing; it is simply
  // not this tool's business, and the two must not read alike.
  const { assessable, blocked } = criteriaAssessableFrom({ transcript: ["x"] });
  const names = [...assessable, ...blocked.map((b) => b.criterion)];
  assert.ok(!names.includes("1.4.3"), "contrast is out of scope, not blocked");
});
