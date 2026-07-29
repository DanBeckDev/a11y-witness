// The cache decides whether to trust evidence on disk, so its failure mode is silently reusing a
// capture that no longer describes the page. Every test here is one way that could happen.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { cacheDecision, cacheKey, environmentKey, hashPageDir, stampProvenance } from "./capture-cache.mjs";

const ENV = {
  screenReader: "NVDA",
  screenReaderVersion: "2026.1.1",
  browser: "Microsoft Edge",
  browserVersion: "150.0.4078.105",
  captureProtocol: 1,
  provisionRevision: "abc1234-deadbeef",
  workerCode: "code0000",
};

function sandbox() {
  const root = mkdtempSync(resolve(tmpdir(), "a11y-cache-"));
  const pages = resolve(root, "pages", "case-1");
  const captures = resolve(root, "captures");
  mkdirSync(pages, { recursive: true });
  mkdirSync(captures, { recursive: true });
  writeFileSync(resolve(pages, "good.html"), "<h1>good</h1>");
  writeFileSync(resolve(pages, "bad.html"), "<h1>bad</h1>");
  return { root, pages, captures };
}

const keyFor = (pages: string, over: Record<string, unknown> = {}) => cacheKey({
  caseId: "case-1",
  pageHash: hashPageDir(pages),
  options: { steps: 150, probeForms: false, task: null, reuseScreenReader: true },
  environment: ENV,
  ...over,
});

function writePair(captures: string, key: string | undefined, over: Record<string, unknown> = {}) {
  for (const variant of ["good", "bad"]) {
    const capture = stampProvenance(
      { screenReader: "NVDA", transcript: ["a phrase"], capturedAt: "2026-07-29T00:00:00.000Z" },
      { key: key!, options: {}, environment: ENV },
    );
    if (key === undefined) delete (capture as { provenance?: unknown }).provenance;
    writeFileSync(resolve(captures, `case-1.${variant}.json`), JSON.stringify({ ...capture, ...over }));
  }
}

test("an unchanged case is reused", () => {
  const { pages, captures, root } = sandbox();
  const key = keyFor(pages);
  writePair(captures, key);
  const decision = cacheDecision({ captureRoot: captures, caseId: "case-1", key });
  assert.equal(decision.reuse, true);
  rmSync(root, { recursive: true, force: true });
});

test("changing a page byte invalidates the case", () => {
  const { pages, captures, root } = sandbox();
  writePair(captures, keyFor(pages));
  writeFileSync(resolve(pages, "bad.html"), "<h1>bad!</h1>");
  const decision = cacheDecision({ captureRoot: captures, caseId: "case-1", key: keyFor(pages) });
  assert.equal(decision.reuse, false);
  rmSync(root, { recursive: true, force: true });
});

test("a new asset in the page directory invalidates the case", () => {
  const { pages, captures, root } = sandbox();
  writePair(captures, keyFor(pages));
  // There are no assets today, but a fixture that gains one must not keep its old evidence.
  writeFileSync(resolve(pages, "photo.svg"), "<svg/>");
  assert.equal(cacheDecision({ captureRoot: captures, caseId: "case-1", key: keyFor(pages) }).reuse, false);
  rmSync(root, { recursive: true, force: true });
});

test("a protocol bump invalidates everything", () => {
  const { pages, captures, root } = sandbox();
  writePair(captures, keyFor(pages));
  const bumped = keyFor(pages, { environment: { ...ENV, captureProtocol: 2 } });
  assert.equal(cacheDecision({ captureRoot: captures, caseId: "case-1", key: bumped }).reuse, false);
  rmSync(root, { recursive: true, force: true });
});

test("a new NVDA or Edge version invalidates the case", () => {
  const { pages, captures, root } = sandbox();
  writePair(captures, keyFor(pages));
  for (const changed of [{ screenReaderVersion: "2026.2" }, { browserVersion: "151.0.1.1" }]) {
    const key = keyFor(pages, { environment: { ...ENV, ...changed } });
    assert.equal(cacheDecision({ captureRoot: captures, caseId: "case-1", key }).reuse, false);
  }
  rmSync(root, { recursive: true, force: true });
});

test("re-provisioning the guest invalidates the case", () => {
  const { pages, captures, root } = sandbox();
  writePair(captures, keyFor(pages));
  const key = keyFor(pages, { environment: { ...ENV, provisionRevision: "ffff999-cafebabe" } });
  assert.equal(cacheDecision({ captureRoot: captures, caseId: "case-1", key }).reuse, false);
  rmSync(root, { recursive: true, force: true });
});

test("a comment-only code change does NOT invalidate the case", () => {
  // The whole reason the key excludes the worker's code hash: rewording a comment must not cost a
  // 1.5-hour recapture. The differing hash is reported to the caller, not acted on.
  const { pages, captures, root } = sandbox();
  const key = keyFor(pages);
  writePair(captures, key);
  const decision = cacheDecision({ captureRoot: captures, caseId: "case-1", key });
  assert.equal(decision.reuse, true);
  assert.equal(decision.staleCode, "code0000");
  rmSync(root, { recursive: true, force: true });
});

test("evidence captured before the cache existed is not reused", () => {
  const { pages, captures, root } = sandbox();
  writePair(captures, undefined);
  assert.equal(cacheDecision({ captureRoot: captures, caseId: "case-1", key: keyFor(pages) }).reuse, false);
  rmSync(root, { recursive: true, force: true });
});

test("an empty transcript is never reused, even with a matching key", () => {
  // Empty captures are the known foreground flake. Caching one would make a transient failure
  // permanent.
  const { pages, captures, root } = sandbox();
  const key = keyFor(pages);
  writePair(captures, key, { transcript: [] });
  assert.equal(cacheDecision({ captureRoot: captures, caseId: "case-1", key }).reuse, false);
  rmSync(root, { recursive: true, force: true });
});

test("one stale variant invalidates the whole pair", () => {
  // A pair is only comparable if both halves came from the same worker and environment, so reuse
  // must be all-or-nothing.
  const { pages, captures, root } = sandbox();
  const key = keyFor(pages);
  writePair(captures, key);
  const good = JSON.parse(readFileSync(resolve(captures, "case-1.good.json"), "utf8"));
  good.provenance.cacheKey = "0000000000000000";
  writeFileSync(resolve(captures, "case-1.good.json"), JSON.stringify(good));
  assert.equal(cacheDecision({ captureRoot: captures, caseId: "case-1", key }).reuse, false);
  rmSync(root, { recursive: true, force: true });
});

test("the key is stable under object key order", () => {
  const a = cacheKey({ caseId: "c", pageHash: "h", options: { a: 1, b: 2 }, environment: ENV });
  const b = cacheKey({ caseId: "c", pageHash: "h", options: { b: 2, a: 1 }, environment: ENV });
  assert.equal(a, b);
});

test("an unreportable environment still keys consistently", () => {
  assert.deepEqual(environmentKey({}), {
    screenReader: "NVDA/unknown",
    browser: "unknown/unknown",
    captureProtocol: "unknown",
    provisionRevision: "unstamped",
  });
});
