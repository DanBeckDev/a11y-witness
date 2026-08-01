// Host capacity decides how much parallelism a run gets. Getting it wrong in either direction is
// expensive: too many workers made every capture 1.6x slower and produced mute-NVDA failures, too few
// leaves the machine idle. These are the boundaries.
import { test } from "node:test";
import assert from "node:assert/strict";
import { capacityReason, workersHostCanRun } from "./host-capacity.mjs";

test("the measured case: 12.6 GB available with one worker up allows a second, not a third", () => {
  // The real reading from the host this was written on. Three workers is what the pool used to start.
  assert.equal(workersHostCanRun({ availableMb: 12_654, alreadyRunning: 1 }), 2);
});

test("a host with nothing spare keeps the workers it already has", () => {
  assert.equal(workersHostCanRun({ availableMb: 1_000, alreadyRunning: 2 }), 2);
});

test("a roomy host is not capped below what it can hold", () => {
  // 64 GB free, headroom off the top, ~7.6 GB each.
  assert.equal(workersHostCanRun({ availableMb: 65_536, alreadyRunning: 0 }), 8);
});

test("at least one worker always runs, even on a host with no memory at all", () => {
  // Refusing to start the only guest turns a tight host into an outage.
  assert.equal(workersHostCanRun({ availableMb: 0, alreadyRunning: 0 }), 1);
});

test("an unreadable host memory figure does not constrain the run", () => {
  // A diagnostic that cannot read the host must never be the thing that shrinks the pool.
  assert.equal(workersHostCanRun({ availableMb: null, alreadyRunning: 3 }), Number.POSITIVE_INFINITY);
});

test("a capped pool explains itself, naming the numbers and the override", () => {
  const reason = capacityReason({ limit: 2, wanted: 3, availableMb: 12_654 });
  assert.match(reason!, /2 of 3 local workers/);
  assert.match(reason!, /12654 MB available/);
  assert.match(reason!, /A11Y_MAX_WORKERS/);
});

test("a pool that was not capped says nothing", () => {
  assert.equal(capacityReason({ limit: 3, wanted: 3, availableMb: 40_000 }), null);
  assert.equal(capacityReason({ limit: Number.POSITIVE_INFINITY, wanted: 3, availableMb: null }), null);
});
