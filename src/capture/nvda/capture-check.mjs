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

// Each check has:
//  - signature: text unique to THIS page that NVDA must have announced. This is
//    the Root-1 capture-integrity net: if NVDA read the wrong content (the Edge
//    start page / MSN feed / welcome screen / browser chrome), the signature is
//    absent and the whole check fails loudly instead of silently asserting
//    against polluted data. None of these strings occur in that chrome.
//  - assert: the deterministic raw signals for the page (NVDA's transcript
//    varies run-to-run, so we never diff exact text). [label, passed, actual].
const CHECKS = [
  {
    page: "structure-good.html",
    signature: /City Library/i,
    assert: (r) => [
      ["read-through produced lines", r.transcript.length >= 3, r.transcript.length],
      ["structural nav found headings", r.structure.headings.length >= 3, r.structure.headings.length],
      ["structural nav found landmarks", r.structure.landmarks.length >= 1, r.structure.landmarks.length],
    ],
  },
  {
    page: "structure-bad.html",
    signature: /City Library/i,
    // The point of the bad page: visual titles and div-soup expose NO real
    // headings or landmarks, even though it looks structured.
    assert: (r) => [
      ["no real headings exposed", r.structure.headings.length === 0, r.structure.headings.length],
      ["no landmarks exposed", r.structure.landmarks.length === 0, r.structure.landmarks.length],
    ],
  },
  {
    page: "disclosure-good.html",
    signature: /password|FAQ/i,
    assert: (r) => [
      ["disclosure probe fired", r.interaction.stateChanges.length >= 1, r.interaction.stateChanges.length],
      ["found a collapsed control", /collapsed/i.test(r.interaction.stateChanges[0]?.control ?? ""), r.interaction.stateChanges[0]?.control],
    ],
  },
  {
    page: "disclosure-bad.html",
    signature: /password|FAQ/i,
    assert: (r) => [
      ["disclosure probe fired", r.interaction.stateChanges.length >= 1, r.interaction.stateChanges.length],
    ],
  },
  // CI gates only on the robust signal: the form-submit probe fires and finds
  // the submit control. Whether the error was CONVEYED (the good/bad distinction)
  // is NOT gated here — NVDA's post-submit announcements are nondeterministic in
  // both channels (live-region and field re-read), even on a stable machine, so
  // gating on it would flake. The dump records both signals for visibility, and
  // the semantic distinction is validated by `npm run eval` on representative
  // fixtures (see ADR 0003 Phase 1b).
  {
    page: "forms-validation-good.html",
    signature: /Newsletter|Email address/i,
    probeForms: true,
    assert: (r) => [
      ["form-submit probe fired", r.interaction.formChanges.length >= 1, r.interaction.formChanges.length],
      ["submit control identified", /sign ?up|submit|button/i.test(r.interaction.formChanges[0]?.control ?? ""), r.interaction.formChanges[0]?.control],
    ],
  },
  {
    page: "forms-validation-bad.html",
    signature: /Newsletter|Email address/i,
    probeForms: true,
    assert: (r) => [
      ["form-submit probe fired", r.interaction.formChanges.length >= 1, r.interaction.formChanges.length],
    ],
  },
];

// Everything NVDA announced for a capture, flattened — used to confirm page identity.
function capturedText(r) {
  return [
    ...r.transcript,
    ...r.structure.headings, ...r.structure.landmarks, ...r.structure.formFields,
    ...r.interaction.stateChanges.map((s) => `${s.control} ${s.after}`),
    ...r.interaction.formChanges.map((s) => `${s.control} ${s.after}`),
    ...(r.interaction.postSubmitFields ?? []),
  ].join(" | ");
}

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
  // Dump the full capture so a CI failure shows exactly what NVDA produced
  // (NVDA phrasing/behaviour varies by version, so failures need the raw text).
  console.log(`  headings:    ${JSON.stringify(result.structure.headings)}`);
  console.log(`  landmarks:   ${JSON.stringify(result.structure.landmarks)}`);
  console.log(`  formFields:  ${JSON.stringify(result.structure.formFields)}`);
  console.log(`  stateChanges:${JSON.stringify(result.interaction.stateChanges)}`);
  console.log(`  formChanges: ${JSON.stringify(result.interaction.formChanges)}`);
  console.log(`  postSubmit:  ${JSON.stringify(result.interaction.postSubmitFields)}`);
  // Root-1 integrity gate: confirm NVDA actually read THIS page before trusting
  // any other assertion. A miss means it read the browser chrome / start page.
  if (!check.signature.test(capturedText(result))) {
    console.log(`  FAIL  page identity NOT confirmed — capture does not contain ${check.signature} (read the wrong content?)`);
    return 1;
  }
  console.log(`  PASS  page identity confirmed (${check.signature})`);
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
