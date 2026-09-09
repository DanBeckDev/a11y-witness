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
 *
 * REPO-ROOT AND CAPTURES-PATH COMPUTED HERE, NOT IMPORTED FROM `@a11ign/lab` -- #199, chairman's
 * ruling. This file used to import `datasetRoot`/`captureRoot` straight from `@a11ign/lab/src/
 * dataset-paths.mjs`, which made `a11ign` (published, consumer-facing) depend on `lab` (private,
 * never published) -- a real boundary defect (ADR 0004), not merely a CI-scoping inconvenience: `lab`
 * ALSO depends on `cli` (`public-api.test.ts` imports the published package to verify its surface), so the
 * two depended on each other. `@a11ign/evidence` was considered as a shared home and rejected: ADR
 * 0004 states its contract explicitly -- "all contract, no I/O. Deliberately no `node:fs`, no
 * `process.env`" -- and every function this file needs reads `process.env` overrides. So this follows the
 * EXACT pattern `worker-fleet`'s `doctor.mjs`/`compare-workers.mjs`, `nvda-worker`'s
 * `capture-pure.corpus.test.ts` and `judge`'s `channel-tables-4.1.2.test.ts` already use for the identical
 * reason (documented in `dataset-paths.test.ts`'s own `EXEMPT` list): a local, duplicated computation
 * rather than an import that would create the cycle. Only the two env overrides this file's own read-only
 * existence check plausibly needs are honoured (`RUNS_ROOT`/`A11Y_RUNS_ROOT`, `DATASET_ROOT`) -- not the
 * full override surface `dataset-paths.mjs` supports, which this test has never needed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createServer, type Server, type ServerResponse } from "node:http";
import { AddressInfo } from "node:net";
import { stripComments } from "@a11ign/evidence/source-text";

import {
  applyArg, parseArgs, conformanceFor, captureViaWorker, errorReason, describeWorkerError, warnUnverified,
  witnessArtifactRoot, witnessArtifactSlug, writeWitnessArtifact, reportWitnessArtifact,
  earlyContainmentWatcher,
  type CaptureResponse, type CaptureRequest,
} from "./cli.js";

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const runsRoot = () => resolve(REPO_ROOT, process.env.RUNS_ROOT ?? process.env.A11Y_RUNS_ROOT ?? "runs");
const datasetRoot = () =>
  process.env.DATASET_ROOT ? resolve(REPO_ROOT, process.env.DATASET_ROOT) : resolve(runsRoot(), "screenreader-dataset");
const CAPTURES = resolve(datasetRoot(), process.env.DATASET_CAPTURE_ROOT || "captures");

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
 * through `captureTolerantly` (`@a11ign/worker-fleet/capture-client`), the same client every lab
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

test("#426: a real, slow capture prints the early notice AND still completes normally -- never a rejection", async () => {
  const written: string[] = [];
  const realWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk: string) => { written.push(String(chunk)); return true; }) as never;
  const recorded = new Map<string, { state: "running" } | { state: "done"; status: number; body: unknown }>();
  const w = await loopbackWorker((url, res, raw) => {
    if (url === "/capture") {
      const id = (JSON.parse(raw) as { captureId?: string }).captureId as string;
      recorded.set(id, { state: "running" });
      // Held "running" past ONE progress poll (POLL_MS=2000ms), long enough for the watcher to see the
      // contained marks at least once before the capture finishes -- a genuinely slow, contained page.
      setTimeout(() => recorded.set(id,
        { state: "done", status: 200, body: { transcript: ["heading, level 2, consent"] } }), 2400);
      res.writeHead(202);
      return res.end(JSON.stringify({ captureId: id, state: "running" }));
    }
    if (url === "/progress") {
      res.writeHead(200);
      return res.end(JSON.stringify({ busy: true, capturing: "https://example.com/", phases: [
        { event: "pageState", beforeProbe: "sweep", atMs: 1400, heading: 463, targetMatch: "matched" },
        { event: "structural", atMs: 1200, headings: 1 },
      ] }));
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
    // NEVER A REJECTION: the capture completes and returns its result exactly as if nothing had been
    // noticed -- the whole point of #426's second condition ("the warning must never become a rejection").
    assert.deepEqual((result as unknown as { transcript: string[] }).transcript, ["heading, level 2, consent"]);
    const notices = written.filter((line) => line.includes("NOTICE"));
    assert.equal(notices.length, 1, "exactly one notice, from a real poll cycle, not zero and not several");
    // observedAtMs is the LATER of the two marks (#426's revised acceptance) -- pageState here, at 1.4s.
    assert.match(notices[0], /1\.4s/);
  } finally { process.stderr.write = realWrite; await w.close(); }
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

/**
 * #426: the CLI's own `onProgress` for the "contained" doubt, read directly rather than by driving the
 * real 2s poll loop through a loopback worker -- `capture-client.test.ts` already covers that plumbing,
 * and what this unit owns is fewer marks in, one stderr write out.
 */
test("earlyContainmentWatcher prints the notice EXACTLY ONCE across repeated polls carrying the same marks", () => {
  const watcher = earlyContainmentWatcher();
  const written: string[] = [];
  const realWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk: string) => { written.push(String(chunk)); return true; }) as never;
  try {
    const containedProgress = { phases: [
      { event: "pageState", beforeProbe: "sweep", atMs: 6300, heading: 463, targetMatch: "matched" },
      { event: "structural", atMs: 6000, headings: 1 },
    ] };
    watcher(containedProgress);
    watcher(containedProgress); // a second poll before the capture finishes -- e.g. a slow, contained page
    watcher(containedProgress);
    assert.equal(written.length, 1, "the same fact must not repeat once per poll for five minutes");
    assert.match(written[0], /NOTICE/);
    assert.match(written[0], /6\.3s/);
  } finally { process.stderr.write = realWrite; }
});

test("earlyContainmentWatcher stays silent while undecided, and on a healthy capture", () => {
  const watcher = earlyContainmentWatcher();
  const written: string[] = [];
  const realWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk: string) => { written.push(String(chunk)); return true; }) as never;
  try {
    watcher({ phases: [] }); // nothing recorded yet
    watcher({ phases: [{ event: "structural", atMs: 1000, headings: 1 }] }); // still only one mark
    watcher({ busy: true, capturing: null }); // the idle shape -- no `phases` at all
    watcher({ phases: [
      { event: "pageState", beforeProbe: "sweep", atMs: 9200, heading: 38, targetMatch: "matched" },
      { event: "structural", atMs: 9000, headings: 37 },
    ] }); // decided, and healthy
    assert.equal(written.length, 0, "no doubt was ever decided-and-contained; nothing should print");
  } finally { process.stderr.write = realWrite; }
});

// `errorReason` -- a stranger's "no worker answered" message must never print a bare "()".
test("errorReason prefers .message when the error has one", () => {
  assert.equal(errorReason(new Error("connect timed out")), "connect timed out");
});

test("errorReason falls back to .code when .message is EMPTY -- the real shape of a raw ECONNREFUSED", () => {
  // Measured directly against a real closed-port connection on this Node version: message is "", code is
  // "ECONNREFUSED". A fallback that only checked `.message` produced a bare, unexplained "()".
  const err = Object.assign(new Error(""), { code: "ECONNREFUSED" });
  assert.equal(errorReason(err), "ECONNREFUSED");
});

test("errorReason falls back to String(error) when neither .message nor .code exists", () => {
  assert.equal(errorReason("a plain string throw"), "a plain string throw");
});

// MUTATION: prove the reproduction is real, or the two tests above establish nothing.
test("MUTATION: an error with a message but no code still prefers the message, not the fallback chain", () => {
  const err = Object.assign(new Error("real reason"), { code: "SOME_CODE" });
  assert.equal(errorReason(err), "real reason", "a present .message must win over .code, not the other way round");
});

test("describeWorkerError: a hard-timeout fault reports how far the capture got -- issue #336", () => {
  // The worker's own wire shape (server.mjs's `runCapture` catch block) -- `reachedPhase` and
  // `diagnostics` were already being sent and were unused here until #336 gave a reason to read them.
  const message = describeWorkerError(500, {
    error: "capture exceeded the hard timeout of 520000 ms and was abandoned",
    fault: "hard-timeout",
    reachedPhase: "readingForm",
    diagnostics: [{ event: "navigated" }, { event: "sweptHeadings" }, { event: "readingForm" }],
  });
  assert.match(message, /hard-timeout/, "the fault code must still be printed");
  assert.match(message, /readingForm/, "the phase the capture actually reached must be named");
  assert.match(message, /3 progress mark/, "how many marks were recorded must be stated, not just named");
});

test("describeWorkerError: a fault with no reachedPhase omits the progress line rather than inventing one", () => {
  const message = describeWorkerError(500, { error: "the browser could not reach the page", fault: "page-unreachable" });
  assert.doesNotMatch(message, /Got as far as/, "no reachedPhase was reported, so none must be claimed");
});

/** `warnUnverified` writes straight to `process.stderr`, so capturing its output means stubbing the write
 *  method for the duration of one call and restoring it immediately after -- never left stubbed across
 *  tests, or a later test's own diagnostics would silently vanish too. */
function capturedStderr(run: () => void): string {
  const original = process.stderr.write.bind(process.stderr);
  let out = "";
  process.stderr.write = ((chunk: string) => { out += chunk; return true; }) as typeof process.stderr.write;
  try {
    run();
  } finally {
    process.stderr.write = original;
  }
  return out;
}

test("warnUnverified: a 'contained' doubt gets the full WHAT/TRY/WHERE treatment -- issue #398", () => {
  const out = capturedStderr(() => warnUnverified("contained", "Order details"));
  assert.match(out, /reached almost none of this page/i, "the doubt itself must still be named");
  assert.match(out, /Try:/, "#398: a bare doubt with no remediation sends the reader nowhere");
  assert.match(out, /docs\/try-it\.md/i, "the same consent-banner guidance a first reader is already sent");
});

test("warnUnverified: a 'wrong-content' doubt names the title it expected", () => {
  const out = capturedStderr(() => warnUnverified("wrong-content", "Order details"));
  assert.match(out, /Order details/, "the expected title must still be printed");
  assert.match(out, /Try:/, "this doubt also gets actionable remediation, not a bare sentence");
});

// --- #431: witness runs keep an artefact by default -- unit-testable against an INJECTED capture, no
// worker needed. `writeWitnessArtifact`/`witnessArtifactRoot` are exempted alongside `dataset-paths.mjs`'s
// own EXEMPT entry for this file, for the identical #199 boundary reason. ---

/** Points `witnessArtifactRoot()` at an isolated temp dir for the duration of `run`, restoring after. */
function withIsolatedRunsRoot<T>(run: (root: string) => T): T {
  const dir = mkdtempSync(resolve(tmpdir(), "a11ign-witness-artifact-"));
  const before = process.env.RUNS_ROOT;
  process.env.RUNS_ROOT = dir;
  try {
    return run(dir);
  } finally {
    if (before === undefined) delete process.env.RUNS_ROOT; else process.env.RUNS_ROOT = before;
    rmSync(dir, { recursive: true, force: true });
  }
}

function minimalCapture(url: string): CaptureResponse {
  return { url, screenReader: "NVDA", transcript: ["heading, level 1, Test"] };
}

test("witnessArtifactSlug: a plain URL becomes host-dashes-dot-com, matching #431's own acceptance example", () => {
  assert.equal(witnessArtifactSlug("https://example.com"), "example-com");
});

test("witnessArtifactSlug: path and query are stripped -- only the host distinguishes a filename", () => {
  assert.equal(witnessArtifactSlug("https://example.com/checkout?step=2"), "example-com");
});

test("witnessArtifactSlug: a URL whose host reduces to nothing falls back to 'page' rather than producing "
  + "an empty filename", () => {
  assert.equal(witnessArtifactSlug(""), "page");
  assert.equal(witnessArtifactSlug("https://"), "page");
});

test("witnessArtifactRoot: RUNS_ROOT (an absolute override) wins over process.cwd(), and 'witness' is "
  + "always the subdirectory", () => {
  withIsolatedRunsRoot((dir) => {
    assert.equal(witnessArtifactRoot(), resolve(dir, "witness"));
  });
});

test("writeWitnessArtifact writes a file `capture:explain` can open, and returns its real path", () => {
  withIsolatedRunsRoot(() => {
    const cap = minimalCapture("https://example.com");
    const path = writeWitnessArtifact(cap, "Read and understand this page");
    assert.ok(existsSync(path), "the returned path must actually exist -- a printed path that is not "
      + "written is worse than no path");
    const written = JSON.parse(readFileSync(path, "utf8")) as
      { task?: string; capturedAt?: string; capture?: CaptureResponse };
    // `captureOf` in explain-capture.mjs reads `.capture` when present, so this shape is exactly what
    // the product-path reader already knows how to unwrap.
    assert.equal(written.capture?.url, cap.url);
    assert.deepEqual(written.capture?.transcript, cap.transcript);
    assert.equal(written.task, "Read and understand this page");
    assert.equal(typeof written.capturedAt, "string");
  });
});

test("writeWitnessArtifact: two captures of two different URLs in the same run get two different files, "
  + "never a silent overwrite", () => {
  withIsolatedRunsRoot(() => {
    const a = writeWitnessArtifact(minimalCapture("https://example.com"), "task");
    const b = writeWitnessArtifact(minimalCapture("https://example.org"), "task");
    assert.notEqual(a, b);
    assert.ok(existsSync(a) && existsSync(b));
  });
});

/** `reportWitnessArtifact` writes straight to stdout via `console.log`; capture it the same way
 *  `capturedStderr` above captures `warnUnverified`'s stream, so a later test's own output is never lost. */
function capturedStdout(run: () => void): string {
  const original = console.log;
  let out = "";
  console.log = ((chunk: string) => { out += `${chunk}\n`; }) as typeof console.log;
  try {
    run();
  } finally {
    console.log = original;
  }
  return out;
}

test("reportWitnessArtifact: a written path is announced as 'capture written to <relative path>'", () => {
  withIsolatedRunsRoot((dir) => {
    const path = resolve(dir, "witness", "2026-01-01T00-00-00-000Z-example-com.json");
    const out = capturedStdout(() => reportWitnessArtifact(path));
    assert.match(out, /^capture written to /);
    assert.doesNotMatch(out, new RegExp(process.cwd()), "the path must be relative to where the reader is "
      + "standing, not an absolute machine path nobody else can use");
  });
});

test("reportWitnessArtifact: --no-keep says so explicitly rather than staying silent about the skip", () => {
  const out = capturedStdout(() => reportWitnessArtifact(null));
  assert.match(out, /capture not written \(--no-keep\)/);
});

test("--no-keep parses to keep:false; the default is true", () => {
  assert.equal(parseArgs(["https://example.com"]).keep, true);
  assert.equal(parseArgs(["https://example.com", "--no-keep"]).keep, false);
});
