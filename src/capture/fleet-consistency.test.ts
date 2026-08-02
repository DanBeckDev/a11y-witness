// The pool assumes guests are interchangeable: cases are dispatched to whichever is free, the cache
// lets any guest reuse another's evidence, and a good/bad pair is only comparable because both halves
// came from equivalent machines. Two real divergences happened in one day and BOTH were caught by a
// human reading a console by eye. These tests are the replacement for that.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fleetConsistency, describeMismatches } from "./fleet-consistency.mjs";

const guest = (worker: string, over = {}) => ({
  worker,
  environment: {
    browserVersion: "151.0.4129.59", screenReaderVersion: "2026.1.1",
    windowsVersion: "Microsoft Windows 11 Pro 10.0.22621", architecture: "arm64", captureProtocol: 2,
    ...over,
  },
  policy: { StartupBoostEnabled: 0, BackgroundModeEnabled: 0 },
});

test("a matched fleet is consistent", () => {
  const r = fleetConsistency([guest("http://192.168.64.4:8765"), guest("http://192.168.64.5:8765")]);
  assert.equal(r.consistent, true);
  assert.deepEqual(r.mismatches, []);
});

test("the real Edge version split is caught", () => {
  // Measured: Edge auto-updated to 151 on one guest while others stayed on 150, despite the updater
  // being policy-disabled. Noticed by reading a boot log by eye.
  const r = fleetConsistency([
    guest("http://192.168.64.4:8765", { browserVersion: "151.0.4129.59" }),
    guest("http://192.168.64.5:8765", { browserVersion: "150.0.4078.105" }),
  ]);
  assert.equal(r.consistent, false);
  assert.equal(r.mismatches[0].field, "browserVersion");
  assert.match(describeMismatches(r.mismatches)[0], /\.4=151\.0\.4129\.59 \.5=150\.0\.4078\.105/);
});

test("the real StartupBoost policy split is caught", () => {
  // Measured: 1 on two guests, 0 on a third. Nothing keys on it, so only a check like this can see it.
  const a = guest("http://192.168.64.4:8765");
  const r = fleetConsistency([
    { ...a, policy: { StartupBoostEnabled: 1, BackgroundModeEnabled: 0 } },
    guest("http://192.168.64.6:8765"),
  ]);
  assert.equal(r.consistent, false);
  assert.ok(r.mismatches.some((m) => m.field === "edgePolicy.StartupBoostEnabled"));
});

test("a guest on an older capture protocol is caught", () => {
  // The worst case: its evidence means something different, and the cache would happily mix them.
  const r = fleetConsistency([
    guest("http://192.168.64.4:8765", { captureProtocol: 2 }),
    guest("http://192.168.64.5:8765", { captureProtocol: 1 }),
  ]);
  assert.ok(r.mismatches.some((m) => m.field === "captureProtocol"));
});

test("a mixed-architecture fleet is caught", () => {
  const r = fleetConsistency([
    guest("http://a:8765", { architecture: "arm64" }),
    guest("http://b:8765", { architecture: "x64" }),
  ]);
  assert.ok(r.mismatches.some((m) => m.field === "architecture"));
});

test("an absent field is not a mismatch", () => {
  // An older worker that does not report a field must not be flagged against newer ones. Only
  // DIFFERING known values are evidence of drift; missing data is missing data.
  const partial = { worker: "http://old:8765", environment: { browserVersion: "151.0.4129.59" }, policy: {} };
  assert.equal(fleetConsistency([guest("http://new:8765"), partial]).consistent, true);
});

test("one guest, or none, is not a finding", () => {
  // A fleet of one is trivially consistent with itself, and zero guests is not a fleet.
  assert.equal(fleetConsistency([guest("http://a:8765")]).consistent, true);
  assert.equal(fleetConsistency([]).consistent, true);
  assert.equal(fleetConsistency(undefined as never).consistent, true);
});

test("every mismatch explains why it matters", () => {
  // A report that says "these differ" without saying what breaks is one an operator will learn to skip.
  const r = fleetConsistency([
    guest("http://a:8765", { browserVersion: "151.0.4129.59" }),
    guest("http://b:8765", { browserVersion: "150.0.4078.105" }),
  ]);
  for (const line of describeMismatches(r.mismatches)) {
    assert.match(line, / — .{10,}/, `no explanation in: ${line}`);
  }
});
