/**
 * Imported axe results come in three shapes, and reading them wrong reports the wrong page confidently.
 *
 * `--axe-results file.json` lets someone supply an axe run they did themselves, so the CLI never scans twice
 * and never gives two differently-versioned opinions on one page. But axe's output has three legitimate
 * shapes in the wild — a results object, an array of them (one per page/frame), and a bare violations array —
 * and a parser that guesses wrong either throws on a valid file or, far worse, silently finds zero violations
 * in a file full of them. Zero violations renders as "axe ran and found nothing", which is a clean bill of
 * health this tool must never issue by accident.
 *
 * None of this was tested. Found by measuring coverage across every file rather than only the ones a test
 * loads.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadAxeResults, warnOnUrlMismatch } from "./axe-results.js";

const VIOLATION = {
  id: "color-contrast",
  impact: "serious",
  help: "Elements must meet minimum colour contrast ratio thresholds",
  tags: ["wcag2aa", "wcag143"],
  nodes: [{ html: "<p>hi</p>", target: ["p"] }],
};

/** Write a fixture and hand back its path; a temp dir per call keeps the tests Isolated. */
function fixture(contents: unknown): string {
  const path = join(mkdtempSync(join(tmpdir(), "axe-results-")), "axe.json");
  writeFileSync(path, typeof contents === "string" ? contents : JSON.stringify(contents));
  return path;
}

test("a results object with violations is read", async () => {
  const { findings } = await loadAxeResults(fixture({ url: "https://example.com", violations: [VIOLATION] }));
  assert.equal(findings.length, 1);
  // `wcag` is an ARRAY of criteria — one axe rule can map to several — and `rule` carries the axe id.
  assert.deepEqual(findings[0].wcag, ["1.4.3"]);
  assert.equal(findings[0].rule, "color-contrast");
  assert.equal(findings[0].source, "axe-core", "the layer must be attributable in the report");
});

test("an ARRAY of results objects is flattened, not mistaken for a violations array", async () => {
  // axe-core reports per frame, so an array of results objects is normal. Treating it as a bare violations
  // array yields zero findings from a file that has two.
  const { findings } = await loadAxeResults(fixture([
    { url: "https://example.com", violations: [VIOLATION] },
    { url: "https://example.com/iframe", violations: [{ ...VIOLATION, id: "link-name" }] },
  ]));
  assert.equal(findings.length, 2, "both frames' violations must survive");
});

test("a bare violations array is read", async () => {
  const { findings } = await loadAxeResults(fixture([VIOLATION]));
  assert.equal(findings.length, 1);
});

test("the scanned URL is recovered from either shape, so a mismatch can be noticed", async () => {
  assert.equal((await loadAxeResults(fixture({ url: "https://a.test", violations: [] }))).scannedUrl,
    "https://a.test");
  assert.equal((await loadAxeResults(fixture([{ url: "https://b.test", violations: [] }]))).scannedUrl,
    "https://b.test");
  // Absent rather than invented when the file records none: an empty string is checkable, a guess is not.
  assert.equal((await loadAxeResults(fixture([VIOLATION]))).scannedUrl, "");
});

test("an empty violations list is zero findings, NOT an error", async () => {
  // "axe ran and found nothing" is a real and meaningful result. Refusing it would push callers toward
  // --no-axe, which reports the visual criteria as unchecked and means something entirely different.
  const { findings } = await loadAxeResults(fixture({ url: "https://example.com", violations: [] }));
  assert.deepEqual(findings, []);
});

test("a file that is not axe results is REFUSED, never read as zero violations", async () => {
  // The dangerous failure: silently returning [] from a file we did not understand renders as a clean axe run.
  await assert.rejects(() => loadAxeResults(fixture({ some: "other json" })), /does not look like axe results/);
  await assert.rejects(() => loadAxeResults(fixture("not json at all")), /could not read axe results/);
  await assert.rejects(() => loadAxeResults(join(tmpdir(), "definitely-missing-axe.json")),
    /could not read axe results/);
});

test("the refusal names the file and the shapes it expected", async () => {
  // A parse failure here is a user error in a hand-supplied file, so the message has to be actionable.
  await assert.rejects(() => loadAxeResults(fixture({ nope: true })), (error: Error) => {
    assert.match(error.message, /axe\.json/, "the message must name the file");
    assert.match(error.message, /violations/, "and the shape it wanted");
    return true;
  });
});

test("a URL mismatch warns without throwing, because a trailing slash is not an error", () => {
  // It writes to stderr, not console.warn: the report goes to stdout, so a warning on stdout would corrupt
  // `--json` output for anything parsing it.
  const warnings: string[] = [];
  const original = process.stderr.write.bind(process.stderr);
  (process.stderr as { write: unknown }).write = (chunk: string) => { warnings.push(String(chunk)); return true; };
  try {
    warnOnUrlMismatch("https://example.com/", "https://example.com");
    warnOnUrlMismatch("https://staging.example.com", "https://example.com");
    warnOnUrlMismatch("https://example.com", "https://example.com");
    warnOnUrlMismatch("", "https://example.com");
  } finally {
    (process.stderr as { write: unknown }).write = original;
  }
  // A stale file from another page is the failure worth warning about; identical or absent URLs are not.
  assert.ok(warnings.some((w) => w.includes("staging.example.com")),
    `a genuinely different host must warn; got ${JSON.stringify(warnings)}`);
  assert.equal(warnings.length, 2,
    `only a genuinely different URL warns — identical and absent must stay silent; got ${JSON.stringify(warnings)}`);
});
