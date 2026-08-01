// What the profile pruner deletes. This is the riskiest thing in the worker: delete the wrong path and
// every capture on that guest silently gains Edge's first-run welcome surface as phantom page content.
// So the decision of WHAT to remove is a pure function, and these are its boundaries.
import { test } from "node:test";
import assert from "node:assert/strict";
import { prunablePaths } from "./browser-profile.mjs";

const ROOT = "C:\\Users\\witness\\AppData\\Local\\a11y-witness\\edge-profile";
const everythingExists = () => true;

test("a healthy profile keeps its caches but still loses BrowserMetrics", () => {
  // 261 MB was measured running 11-12s captures; dropping its caches pushed it to 63s and it was still
  // only back to ~28s eight captures later. The cache earns its space. BrowserMetrics does not: one file
  // per Edge launch, 348 MB of a 448 MB profile on the busiest guest, and nothing ever reads it.
  const paths = prunablePaths({ megabytes: 261, root: ROOT, exists: everythingExists });
  assert.ok(paths.some((p) => p.endsWith("BrowserMetrics")), "telemetry must go regardless of size");
  assert.ok(!paths.some((p) => p.endsWith("Cache")), "a small profile keeps its warm cache");
});

test("BrowserMetrics is dropped even when the profile size cannot be read", () => {
  // Unknown size must not mean "leave the unbounded directory alone".
  const paths = prunablePaths({ megabytes: null, root: ROOT, exists: everythingExists });
  assert.ok(paths.some((p) => p.endsWith("BrowserMetrics")));
});

test("only a genuinely runaway profile gives up its caches", () => {
  // Deliberately far above anything a healthy guest reaches, because the 200 MB version of this
  // threshold made a working worker 5x slower.
  const paths = prunablePaths({ megabytes: 1_200, root: ROOT, exists: everythingExists });
  assert.ok(paths.length > 0);
  assert.ok(paths.some((p) => p.endsWith("Cache")), "the HTTP cache is the point of this");
});

test("the files that suppress Edge's first-run experience are NEVER removed", () => {
  // The whole reason the profile is durable. Losing these puts the welcome/sign-in surface into
  // captures on any page with no headings — a documented evidence-corruption bug.
  const paths = prunablePaths({ megabytes: 9_999, root: ROOT, exists: everythingExists });
  for (const kept of ["Local State", "Preferences", "Secure Preferences", "First Run"]) {
    assert.ok(!paths.some((p) => p.endsWith(kept)), `${kept} must survive pruning`);
  }
});

test("the profile root itself is never a target", () => {
  // Deleting the root is the same as having no durable profile at all.
  const paths = prunablePaths({ megabytes: 9_999, root: ROOT, exists: everythingExists });
  assert.ok(!paths.includes(ROOT), "pruning must never remove the profile directory");
  for (const p of paths) assert.ok(p.startsWith(ROOT), `${p} escapes the profile directory`);
});

test("session-restore records are removed, so Edge cannot reopen a previous window", () => {
  // A restored window both slows startup and risks restoring page content into a capture.
  const paths = prunablePaths({ megabytes: 1_200, root: ROOT, exists: everythingExists });
  assert.ok(paths.some((p) => p.endsWith("Sessions")), "Sessions drives restore-on-launch");
});

test("paths that do not exist are not offered for deletion", () => {
  assert.deepEqual(prunablePaths({ megabytes: 1_200, root: ROOT, exists: () => false }), []);
});

test("an unreadable profile size never prunes the size-gated caches", () => {
  // Guessing "prune it" on no information is how you throw away a cache that was doing its job.
  const paths = prunablePaths({ megabytes: null, root: ROOT, exists: everythingExists });
  assert.ok(!paths.some((p) => p.endsWith("Cache")));
});

test("only BrowserMetrics is pruned unconditionally — nothing irreplaceable", () => {
  // Guard against re-adding "probably unnecessary" paths. Edge's component payloads were once on the
  // unconditional list; the guests have the auto-updater disabled, so deleting them was permanent, and
  // the two workers it happened to went from 11-12s captures to ~26s with no way back.
  const paths = prunablePaths({ megabytes: 100, root: ROOT, exists: everythingExists });
  assert.equal(paths.length, 1, `unconditional prune list must stay at one entry, got: ${paths}`);
  assert.ok(paths[0].endsWith("BrowserMetrics"));
});
