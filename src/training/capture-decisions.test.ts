// Each of these decisions has been wrong in production at least once. The tests assert the REASONS,
// not just the booleans, because the reason is what a human reads and acts on.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isEvidence, isTransient, rejectionReason, runOutcome, shouldEvictWorker, shouldRetireWorker,
} from "./capture-decisions.mjs";

const TITLE = "Aquarium 001 schedule";
const URL = "http://host:5050/aquarium/good";
const empty = { headings: [], landmarks: [], formFields: [] };
const good = {
  transcript: ["heading, level 1, Aquarium 001 schedule", "Departures from Central station"],
  structure: { ...empty, headings: ["Aquarium 001 schedule, heading, level 1"] },
};

test("a good capture is evidence", () => {
  assert.equal(isEvidence(good, TITLE), true);
});

test("a good capture has no rejection reason", () => {
  assert.equal(rejectionReason(good, { title: TITLE, url: URL }), null);
});

test("a capture of the wrong page says so, and quotes what it heard", () => {
  const wrongPage = { transcript: ["Cannot reach this site", "Try again"], structure: empty };
  const reason = rejectionReason(wrongPage, { title: TITLE, url: URL });
  assert.match(reason!, /did not read "Aquarium 001 schedule"/);
  assert.match(reason!, /Cannot reach this site/);
});

test("a capture of only the title says the page was not read", () => {
  const titleOnly = { transcript: [TITLE], structure: empty };
  assert.match(rejectionReason(titleOnly, { title: TITLE, url: URL })!, /nothing beyond the page title/);
});

test("a self-contradicting capture says the page was not traversed", () => {
  // Heard a heading, swept none — the two halves of one capture disagree.
  const contradicts = { transcript: ["heading, level 1, Aquarium 001 schedule"], structure: empty };
  assert.match(rejectionReason(contradicts, { title: TITLE, url: URL })!, /contradicts itself/);
});

test("a dropped connection is transient", () => {
  assert.equal(isTransient(new Error("fetch failed")), true);
});

test("a busy worker is transient", () => {
  assert.equal(isTransient(new Error("HTTP 429 from worker: a capture is already in progress")), true);
});

test("a mute screen reader is transient — the worker cold-starts a fresh one next capture", () => {
  assert.equal(isTransient(new Error("NVDA is running but not speaking (afterStart was empty)")), true);
});

test("an abandoned capture is transient — same self-healing reason", () => {
  assert.equal(isTransient(new Error("capture exceeded the hard timeout of 240000 ms")), true);
});

test("a programming error is not transient", () => {
  assert.equal(isTransient(new TypeError("x is not a function")), false);
});

test("a missing error object is not transient", () => {
  // Defensive: isTransient is called on whatever a catch block caught.
  assert.equal(isTransient(undefined), false);
});

test("three consecutive failures evicts a worker from a healthy pool", () => {
  assert.equal(shouldEvictWorker({ consecutiveFailures: 3, poolSize: 3, evictedCount: 0 }), true);
});

test("two failures is not yet a pattern", () => {
  assert.equal(shouldEvictWorker({ consecutiveFailures: 2, poolSize: 3, evictedCount: 0 }), false);
});

test("the last worker standing is never evicted", () => {
  // With nothing to hand the work to, recording failures beats abandoning the run silently.
  assert.equal(shouldEvictWorker({ consecutiveFailures: 9, poolSize: 1, evictedCount: 0 }), false);
  assert.equal(shouldEvictWorker({ consecutiveFailures: 9, poolSize: 3, evictedCount: 2 }), false);
});

test("cached cases count as skipped, never as captured", () => {
  // Counting them as captured would report worker time that was never spent.
  const outcome = runOutcome({ total: 10, failures: 0, skipped: 6, cached: 6, poolSize: 3 });
  assert.equal(outcome, "4 captured, 0 failed, 6 skipped (6 cached), of 10 cases across 3 workers");
});

test("a single-worker run does not claim a pool", () => {
  assert.equal(runOutcome({ total: 2, failures: 0, skipped: 0, cached: 0, poolSize: 1 }),
    "2 captured, 0 failed, 0 skipped, of 2 cases");
});

test("an evicted worker is named in the outcome", () => {
  const outcome = runOutcome({
    total: 5, failures: 1, skipped: 0, cached: 0, poolSize: 3, evicted: ["http://w2:8765"],
  });
  assert.match(outcome, /1 evicted \(http:\/\/w2:8765\)/);
});

test("a fault code from the worker is transient without matching any message text", () => {
  // The point of the code: this error's message says nothing a regex would recognise.
  const error = Object.assign(new Error("HTTP 500 from http://w:8765/capture: {...}"),
    { code: "screen-reader-mute" });
  assert.equal(isTransient(error), true);
});

test("an unknown fault code falls through to the message rules", () => {
  const error = Object.assign(new Error("something we have never seen"), { code: "who-knows" });
  assert.equal(isTransient(error), false);
});

test("a worker recovering on every capture is retired, even with zero failures", () => {
  // The real case: 4 of 4 captures needed a screen-reader recovery, so consecutiveFailures never left
  // zero and eviction could never fire, while that guest ran at 122.9s against a peer's 40.6s.
  const { retire, reason } = shouldRetireWorker({
    vitals: { captures: 4, recoveries: 4, failures: 0 }, poolSize: 3, retiredCount: 0,
  });
  assert.equal(retire, true);
  assert.match(reason!, /4 of 4 captures needed a screen-reader recovery/);
});

test("a healthy worker is never retired", () => {
  assert.equal(shouldRetireWorker({
    vitals: { captures: 20, recoveries: 0, failures: 0 }, poolSize: 3, retiredCount: 0,
  }).retire, false);
});

test("the last worker standing is never retired, however degraded", () => {
  // A slow run beats no run — the same rule eviction follows.
  assert.equal(shouldRetireWorker({
    vitals: { captures: 8, recoveries: 8, failures: 0 }, poolSize: 3, retiredCount: 2,
  }).retire, false);
});

test("retired workers are named in the run outcome", () => {
  const outcome = runOutcome({
    total: 10, failures: 0, skipped: 0, cached: 0, poolSize: 3, retired: ["http://w1:8765"],
  });
  assert.match(outcome, /1 retired as degraded \(http:\/\/w1:8765\)/);
});
