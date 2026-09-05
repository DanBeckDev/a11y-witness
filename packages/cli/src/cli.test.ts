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
import { createServer, type Server, type ServerResponse } from "node:http";
import { AddressInfo } from "node:net";
import { stripComments } from "@a11y-witness/evidence/source-text";
import { datasetRoot, captureRoot } from "@a11y-witness/lab/src/dataset-paths.mjs";

import {
  applyArg, parseArgs, conformanceFor, captureViaWorker, type CaptureResponse, type CaptureRequest,
} from "./cli.js";

const CAPTURES = captureRoot(datasetRoot());

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
  // trap, hit twice already today and fixed the same way both times. `stripComments` is shared across
  // every guard with this shape rather than a further hand-rolled regex.
  const source = stripComments(readFileSync(new URL("./cli.ts", import.meta.url), "utf8"));
  assert.doesNotMatch(source, /ruleLayer === "none" \? null : axe\.findings/,
    "nullness must be decided by pageContext, which knows whether results were produced");
  const context = source.slice(source.indexOf("async function pageContext"));
  const body = context.slice(0, context.indexOf("\ninterface"));
  assert.doesNotMatch(body, /findings: \[\] as AxeFinding\[\]/,
    "a failed scan must return null findings, never an empty array");
  assert.match(body, /catch[\s\S]*?findings: null/,
    "the catch for a failed scan must produce null");
});

/**
 * THE PRODUCT CLI GAINS THE SOCKET-LOSS RECOVERY EVERY LAB CLIENT ALREADY HAD —
 * architecture-audit.md §5, item 6.
 *
 * `captureViaWorker` used to POST synchronously with no `captureId`, so a response lost in transit meant
 * the page was reported as never examined even when the worker had already finished it. It now goes
 * through `captureTolerantly` (`@a11y-witness/worker-fleet/capture-client`), the same client every lab
 * capture already uses, which mints its own id and reconciles a lost acknowledgement or poll by asking
 * about that SAME id before ever giving up. Reproduced against a loopback worker exactly like
 * `capture-async.test.ts` does, at the real function this package calls rather than at a lower-level
 * helper: before this fix, this test's own worker (which destroys the response and finishes the capture
 * regardless) made `captureViaWorker` throw with zero recovery attempts.
 */
async function loopbackWorker(handler: (url: string, res: ServerResponse, body: string) => void) {
  const s: Server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => handler(req.url ?? "", res, body));
  });
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${(s.address() as AddressInfo).port}`,
    close: () => new Promise<void>((r) => s.close(() => r())) };
}

const CAPTURE_REQUEST: Omit<CaptureRequest, "worker"> = {
  task: "find the opening hours", probeForms: false, probeFocus: false,
  probeNavigation: false, probeFocusContext: false, probeFocusReveal: false,
};

test("a capture that finished is RECOVERED, not reported as never examined", async () => {
  const recorded = new Map<string, { state: "running" } | { state: "done"; status: number; body: unknown }>();
  let posts = 0;
  const w = await loopbackWorker((url, res, raw) => {
    if (url === "/capture") {
      posts += 1;
      const id = (JSON.parse(raw) as { captureId?: string }).captureId as string;
      recorded.set(id, { state: "running" });
      // The worker DID accept and finish the capture -- only the acknowledgement dies here.
      setTimeout(() => recorded.set(id,
        { state: "done", status: 200, body: { transcript: ["heading, level 1, Opening hours"] } }), 20);
      return res.destroy();
    }
    const id = url.split("/").pop() ?? "";
    const entry = recorded.get(id);
    if (!entry) { res.writeHead(404); return res.end(JSON.stringify({ error: "no such capture" })); }
    if (entry.state === "running") { res.writeHead(202); return res.end(JSON.stringify({ state: "running" })); }
    res.writeHead(entry.status);
    res.end(JSON.stringify(entry.body));
  });
  try {
    const result = await captureViaWorker("https://example.com/", { ...CAPTURE_REQUEST, worker: w.url });
    assert.deepEqual((result as unknown as { transcript: string[] }).transcript,
      ["heading, level 1, Opening hours"]);
    assert.equal(posts, 1, "recovering a lost acknowledgement must not pay for a second capture");
  } finally { await w.close(); }
});

test("captureViaWorker sends a captureId, without which nothing above it can recover anything", async () => {
  let sentId: unknown;
  const w = await loopbackWorker((url, res, raw) => {
    if (url === "/capture") {
      sentId = (JSON.parse(raw) as { captureId?: unknown }).captureId;
      res.writeHead(202);
      return res.end(JSON.stringify({ captureId: sentId, state: "running" }));
    }
    res.writeHead(200);
    res.end(JSON.stringify({ transcript: [] }));
  });
  try {
    await captureViaWorker("https://example.com/", { ...CAPTURE_REQUEST, worker: w.url });
    assert.equal(typeof sentId, "string", "no captureId reached the worker -- recovery has nothing to ask about");
    assert.ok((sentId as string).length > 0);
  } finally { await w.close(); }
});
