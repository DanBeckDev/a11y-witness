// capture-check.mjs — capture-regression test (ADR 0003, Phase 1).
//
// Drives the REAL capture worker over the bundled W3C tutorial pages and asserts
// the stable raw signals each page should yield. NVDA's transcript varies
// run-to-run, so we never diff exact text: we assert structural counts, whether
// the interaction probes fired, and the presence/absence of key announced
// substrings. Semantic WCAG classification is the judge's job (`npm run eval`).
//
// MUST run in an interactive desktop session with NVDA set up — see
// .github/workflows/capture-regression.yml. Exits non-zero on any failed check.
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { captureWithNvda } from "./capture-core.mjs";

const STEPS = 40; // tutorial pages are tiny; a small read-through cap keeps it fast
const pagesDir = join(dirname(fileURLToPath(import.meta.url)), "../../eval/pages/tutorials");
const ERROR_TEXT = /required|problem|error/i; // words an accessible form error announces

// Each check asserts only what is deterministic about a page's capture. An
// assertion is [label, passed, actualValue].
const CHECKS = [
  {
    page: "structure-good.html",
    assert: (r) => [
      ["read-through produced lines", r.transcript.length >= 3, r.transcript.length],
      ["structural nav found headings", r.structure.headings.length >= 3, r.structure.headings.length],
      ["structural nav found landmarks", r.structure.landmarks.length >= 1, r.structure.landmarks.length],
    ],
  },
  {
    page: "structure-bad.html",
    // The point of the bad page: visual titles and div-soup expose NO real
    // headings or landmarks, even though it looks structured.
    assert: (r) => [
      ["no real headings exposed", r.structure.headings.length === 0, r.structure.headings.length],
      ["no landmarks exposed", r.structure.landmarks.length === 0, r.structure.landmarks.length],
    ],
  },
  {
    page: "disclosure-good.html",
    assert: (r) => [
      ["disclosure probe fired", r.interaction.stateChanges.length >= 1, r.interaction.stateChanges.length],
      ["found a collapsed control", /collapsed/i.test(r.interaction.stateChanges[0]?.control ?? ""), r.interaction.stateChanges[0]?.control],
    ],
  },
  {
    page: "disclosure-bad.html",
    assert: (r) => [
      ["disclosure probe fired", r.interaction.stateChanges.length >= 1, r.interaction.stateChanges.length],
    ],
  },
  {
    page: "forms-validation-good.html",
    probeForms: true,
    assert: (r) => [
      ["form-submit probe fired", r.interaction.formChanges.length >= 1, r.interaction.formChanges.length],
      ["error announced after submit", ERROR_TEXT.test(r.interaction.formChanges[0]?.after ?? ""), r.interaction.formChanges[0]?.after],
    ],
  },
  {
    page: "forms-validation-bad.html",
    probeForms: true,
    assert: (r) => [
      ["form-submit probe fired", r.interaction.formChanges.length >= 1, r.interaction.formChanges.length],
      ["NO error announced after submit", !ERROR_TEXT.test(r.interaction.formChanges[0]?.after ?? ""), r.interaction.formChanges[0]?.after],
    ],
  },
];

async function runCheck(check) {
  const url = pathToFileURL(join(pagesDir, check.page)).href;
  process.stdout.write(`\n=== ${check.page} ===\n`);
  let result;
  try {
    result = await captureWithNvda(url, { steps: STEPS, probeForms: !!check.probeForms });
  } catch (e) {
    console.log(`  FAIL  capture threw: ${(e && e.message) || e}`);
    return 1;
  }
  let failed = 0;
  for (const [label, passed, actual] of check.assert(result)) {
    console.log(`  ${passed ? "PASS" : "FAIL"}  ${label}  (got ${JSON.stringify(actual)})`);
    if (!passed) failed++;
  }
  return failed;
}

let failures = 0;
for (const check of CHECKS) failures += await runCheck(check);

console.log(`\n${failures === 0 ? "ALL CAPTURE CHECKS PASSED" : `${failures} CAPTURE CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
