/**
 * The CLI's own decisions, tested against captures a REAL screen reader produced.
 *
 * `cli.ts` had no tests, and the reason was structural rather than principled: it exported nothing, so
 * nothing could import it. "Capture needs NVDA on Windows" is true of the code that DRIVES NVDA and not of
 * the code that reads what NVDA said — and this repo has 2,122 real captures on disk. Mocking from
 * recorded output is not a compromise here; it is better evidence than an invented fixture, because the
 * shapes are ones the pipeline actually produces.
 *
 * Skips honestly when the corpus is absent, as `verify.corpus.test.ts` does — CI cannot see `runs/`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { applyArg, parseArgs, conformanceFor, type CaptureResponse } from "./cli.js";

const CAPTURES = resolve(process.cwd(), "runs/screenreader-dataset/captures");

/** A handful of real captures, chosen by name so a failure names a case rather than an index. */
function realCaptures(limit = 6): { name: string; capture: CaptureResponse }[] {
  if (!existsSync(CAPTURES)) return [];
  return readdirSync(CAPTURES).filter((f) => f.endsWith(".json")).sort().slice(0, limit)
    .map((name) => {
      const file = JSON.parse(readFileSync(resolve(CAPTURES, name), "utf8")) as
        { capture?: CaptureResponse } & CaptureResponse;
      return { name, capture: file.capture ?? file };
    });
}

test("--task and --worker take the NEXT token, not the rest of the line", () => {
  const args = parseArgs(["https://example.com", "--task", "Find the opening hours", "--worker", "http://w:8765"]);
  assert.equal(args.url, "https://example.com");
  assert.equal(args.task, "Find the opening hours");
  assert.equal(args.worker, "http://w:8765");
});

test("flags are flags and the bare token is the URL, in any order", () => {
  const args = parseArgs(["--json", "--no-axe", "https://example.com/checkout", "--probe-forms"]);
  assert.equal(args.url, "https://example.com/checkout");
  assert.equal(args.json, true);
  assert.equal(args.axe, false);
  assert.equal(args.probeForms, true);
});

test("--no-probe-focus turns OFF what defaults on", () => {
  assert.equal(parseArgs(["https://example.com"]).probeFocus, true);
  assert.equal(parseArgs(["https://example.com", "--no-probe-focus"]).probeFocus, false);
});

test("probe-forms defaults OFF in the CLI, because it presses buttons on somebody else's page", () => {
  // Not a preference. `probeForms` submits forms, and the split follows who owns the page: on in the
  // Action, where a workflow runs against your own app, off here, where the URL can be anyone's.
  assert.equal(parseArgs(["https://example.com"]).probeForms, false);
});

test("a missing value leaves the previous one rather than consuming the next flag", () => {
  // `--task --json` must not set the task to "--json". The value-taking cases advance the index, so a
  // trailing flag with no value would otherwise swallow whatever follows.
  const args = parseArgs(["https://example.com", "--task", "--json"]);
  assert.notEqual(args.task, undefined);
  assert.notEqual(args.url, "--json");
});

test("applyArg returns the index it consumed to, so the caller cannot double-read a value", () => {
  const args = parseArgs(["https://example.com"]);
  const argv = ["--task", "Book a ticket"];
  assert.equal(applyArg(args, argv, 0), 1, "a value-taking flag must advance past its value");
  assert.equal(applyArg(args, ["--json"], 0), 0, "a bare flag must not advance");
});

test("conformance is derived from EVERY real capture without throwing", () => {
  // The shape this guards: `conformanceFor` reads diagnostics, the structure census and the environment,
  // all of which vary across the corpus. A hand-written fixture would exercise one shape; the corpus
  // exercises the ones the pipeline actually produces.
  const captures = realCaptures();
  if (captures.length === 0) {
    console.log("    no corpus under runs/ — skipping (expected in CI)");
    return;
  }
  for (const { name, capture } of captures) {
    const scope = conformanceFor(capture, null);
    assert.ok(Array.isArray(scope), `${name}: conformance was not a list`);
    assert.ok(scope.length > 0, `${name}: no criteria reported at all`);
  }
});

test("running WITHOUT axe is reported differently from running with it", () => {
  // "not run" and "0 violations" must never look alike: one means the visual criteria are unchecked, the
  // other that they were checked and were clean. That distinction is the report's whole contract.
  const captures = realCaptures(1);
  if (captures.length === 0) return;
  const withAxe = JSON.stringify(conformanceFor(captures[0].capture, []));
  const without = JSON.stringify(conformanceFor(captures[0].capture, null));
  assert.notEqual(withAxe, without,
    "the conformance scope is identical whether or not the rule layer ran — unchecked is being reported "
    + "as clean");
});

test("A FAILED AXE SCAN IS NOT '0 violations' — pageContext decides nullness", () => {
  // `pageContext` returned `[]` when the scan threw, and `runWitness` decided nullness with
  // `ruleLayer === "none" ? null : axe.findings`. So a scan that was REQUESTED, ran and failed came out as
  // an empty array and the report rendered "Rule layer (axe-core): 0 violations." — a clean bill of health
  // for a scan that did not happen.
  //
  // The ternary's own comment describes exactly this defect and fixed it for `--no-axe` only. Asserted on
  // the SOURCE because the failure path needs a browser to exercise: what is pinned is that nullness is no
  // longer decided by a caller who cannot know, and that the catch returns null.
  // COMMENTS STRIPPED FIRST. The fix's own comment QUOTES the old ternary to explain what it replaced,
  // so a raw match flagged the very documentation of the fix — the "expectations derived from source TEXT"
  // trap, hit twice already today and fixed the same way both times.
  const source = readFileSync(new URL("./cli.ts", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(source, /ruleLayer === "none" \? null : axe\.findings/,
    "nullness must be decided by pageContext, which knows whether results were produced");
  const context = source.slice(source.indexOf("async function pageContext"));
  const body = context.slice(0, context.indexOf("\ninterface"));
  assert.doesNotMatch(body, /findings: \[\] as AxeFinding\[\]/,
    "a failed scan must return null findings, never an empty array");
  assert.match(body, /catch[\s\S]*?findings: null/,
    "the catch for a failed scan must produce null");
});
