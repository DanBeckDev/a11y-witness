/**
 * A CONSUMER WITHOUT `playwright` INSTALLED MUST NOT GET A SILENT RULE LAYER.
 *
 * The audit's own §7.1 finding was that the GitHub Action's axe layer went structurally dead and nothing
 * said so -- `ruleBased: null` on a run that never opted out, fixed by `assert-action-report.mjs --require-
 * rule-layer`. That fix covers the ACTION. This proves the same is true of the plain CLI, which a first
 * external user actually runs (`npx a11y-witness <url>`) on whatever machine they have -- one where
 * `playwright`/`@axe-core/playwright` failed to install, were pruned with `--omit=optional`, or were never
 * fetched because the registry was unreachable.
 *
 * `chooseRuleLayer` is the one place that decides. It is exercised here directly, not through a hand-built
 * report object standing in for its output -- `isolation-smoke.mjs` already proves the RENDER half (an
 * `axe: null` report says "not run... unchecked"); this proves the DECISION half feeds it that value and
 * tells the user why, rather than swallowing the gap.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseRuleLayer } from "./cli.js";

function captureStderr(): { restore: () => string } {
  const original = process.stderr.write.bind(process.stderr);
  let out = "";
  process.stderr.write = ((chunk: string) => { out += chunk; return true; }) as typeof process.stderr.write;
  return { restore: () => { process.stderr.write = original; return out; } };
}

test("axe unavailable: the layer is skipped AND the fix is named on stderr, not swallowed", async () => {
  const capture = captureStderr();
  const layer = await chooseRuleLayer({ wantAxe: true, axeResults: null }, async () => false);
  const stderr = capture.restore();
  assert.equal(layer, "none", "an unavailable rule layer must resolve to 'none', which pageContext maps "
    + "to `findings: null` -- never `[]`, or a failed scan would render as \"0 violations\"");
  assert.match(stderr, /axe-core layer skipped/i, "the user must be told the layer did not run");
  assert.match(stderr, /npm install playwright @axe-core\/playwright/,
    "the message must name the exact fix, not just that something is missing");
});

test("axe available: the layer runs, and nothing is printed about it being skipped", async () => {
  const capture = captureStderr();
  const layer = await chooseRuleLayer({ wantAxe: true, axeResults: null }, async () => true);
  const stderr = capture.restore();
  assert.equal(layer, "run");
  assert.doesNotMatch(stderr, /skipped/i, "a WORKING rule layer must not print a skip warning");
});

test("--no-axe: 'none' with NO warning -- an opt-out is not a failure and must not be reported as one", async () => {
  const capture = captureStderr();
  const layer = await chooseRuleLayer({ wantAxe: false, axeResults: null }, async () => false);
  const stderr = capture.restore();
  assert.equal(layer, "none");
  assert.equal(stderr, "", "declining axe on purpose is not the same event as axe being unavailable, and "
    + "must not print the same warning -- `isAvailable` is not even called on this path");
});

test("--axe-results wins even when the real layer would be unavailable: imported results need no scan", () => {
  // Deliberately not awaited against `isAvailable` at all -- see the assertion below.
  return chooseRuleLayer({ wantAxe: true, axeResults: "/tmp/some-results.json" }, async () => {
    throw new Error("isAvailable must not be consulted when a results file is supplied");
  }).then((layer) => assert.equal(layer, "import"));
});
