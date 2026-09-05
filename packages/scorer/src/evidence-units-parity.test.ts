/**
 * ONE MODEL-INPUT FUNCTION, WRITTEN TWICE ACROSS A LANGUAGE BOUNDARY, AND THE COPIES DISAGREED.
 *
 * `evidenceUnits` (this package's `evidence-units.ts`) is what every training record is built through —
 * `export-screenreader-dataset.mjs` and `build-realism-tier.mjs` both call it, and it deliberately omits
 * `landmarks` for a measured reason (see its own comment: the landmark sweep is nondeterministic and swung
 * a conformant page's 3.3.2 score across the threshold). `score.py`'s `evidence_units` is the SAME
 * function, needed because this package ships with zero npm dependencies and its README documents
 * `score.py --capture-json <file>` as a standalone entry a consumer runs with no TypeScript upstream of it
 * — so the two cannot be merged into one implementation without breaking that public contract.
 *
 * Until 2026-09-06 they disagreed on exactly one channel: Python appended `landmark-navigation` and
 * TypeScript did not. `local-judge.ts` sends every LIVE capture to `score.py --stdin`, which builds its
 * record through the Python function — so every live page and every real-page calibration fed the encoder
 * a unit type that appears in NO training record, averaging ~12 extra units and up to 25 on a single real
 * page (measured across the real-page corpus). Found by the architecture audit (`docs/architecture-audit.md`
 * §4.1), not by a test — `model-input.test.ts` checks two JS suspects and structurally cannot see
 * `score.py`, and the two dataset-contract guards this file's own header already knows about
 * (`test_input_contract_version.py`) pin a VERSION NUMBER, never the unit list itself.
 *
 * The remedy is the one direction available: the weights are fitted to the TypeScript units, so `score.py`
 * stopped appending landmarks rather than TypeScript learning to compute them — that would re-introduce
 * the nondeterminism the TS comment exists to keep out. See `score.py`'s own comment on `evidence_units`
 * for the full reasoning, including why `MODEL_INPUT_VERSION` does not move for this (it versions record
 * SHAPE, not this bug).
 *
 * This test is the third repo remedy for "a fact stated twice" applied across a language boundary that
 * cannot be closed by deleting a copy or deriving one from the other: it spawns Python's real
 * `evidence_units` (via the same `importlib.util.spec_from_file_location` trick
 * `test_live_capture_carries_the_parse.py` already uses, so it exercises the actual shipped function, never
 * a restated copy) over a shared table of captures and asserts the unit list matches TypeScript's exactly.
 *
 * Deliberately does NOT need the Python venv, torch, or the encoder: `score.py`'s inference path moved off
 * torch to ONNX + numpy (`scorer-paths.test.ts` pins that), so importing the module and calling a pure
 * function on it needs nothing beyond a plain `python3` — confirmed empirically before writing this file,
 * because a parity test that skips whenever the venv is absent would have caught nothing on the ONE run
 * that mattered here (a laptop with no venv scoring a real page for the first time).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { evidenceUnits, type ScorableCapture } from "./evidence-units.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCORE_PY = join(HERE, "..", "python", "score.py");
const PYTHON = process.env.A11Y_PYTHON ?? "python3";

/**
 * Python's `evidence_units`, run through the REAL file — never a restated copy in this test — the same
 * way `test_live_capture_carries_the_parse.py` already imports `score.py` for a torch-free assertion.
 */
function pythonEvidenceUnits(capture: ScorableCapture): { channel: string; text: string }[] {
  const dir = mkdtempSync(join(tmpdir(), "evidence-units-parity-"));
  const captureFile = join(dir, "capture.json");
  try {
    writeFileSync(captureFile, JSON.stringify(capture));
    const script = `
import importlib.util, json, sys
from pathlib import Path
root = Path(${JSON.stringify(SCORE_PY)}).resolve().parent
sys.path.insert(0, str(root))
spec = importlib.util.spec_from_file_location("scorer_score", root / "score.py")
score = importlib.util.module_from_spec(spec)
spec.loader.exec_module(score)
capture = json.load(open(${JSON.stringify(captureFile)}))
print(json.dumps(score.evidence_units(capture)))
`;
    const out = execFileSync(PYTHON, ["-c", script], { encoding: "utf8" });
    return JSON.parse(out.slice(out.indexOf("[")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Real-shaped fields, including the one that used to disagree. */
const CAPTURES: { name: string; capture: ScorableCapture }[] = [
  {
    name: "a page with landmarks -- the exact shape that disagreed",
    capture: {
      transcript: ["heading, level 1, Bookings", "Check availability, link"],
      structure: {
        headings: ["Bookings, heading, level 1"],
        formFields: ["Departure date, edit"],
        tableCells: [],
        // present on the raw capture -- TypeScript's own `ScorableCapture` type still admits it via its
        // index signature, it is simply never turned into a unit. This is the field that must NOT survive
        // into either implementation's output.
        landmarks: ["main landmark", "navigation landmark"],
      } as ScorableCapture["structure"],
      interaction: {
        controls: ["Search, button"],
        stateChanges: [{ control: "Filter", after: "3 results" }],
        // NOT `after: null` here deliberately -- that is a SEPARATE, pre-existing divergence this test
        // incidentally found (TypeScript coerces `null` into the literal text "-> null" via string
        // concatenation with no `?? ""`; Python's `isinstance(after, str)` guard drops the unit instead),
        // and it does not belong to the landmark-navigation fix this file exists to pin. Recorded rather
        // than fixed here: 0 of 536 `form-change` units in the current training export end in "-> null",
        // so it is dormant in the shipped corpus, not a live regression, and deserves its own measurement
        // and remedy decision the same way the landmark divergence got one.
        formChanges: [{ control: "Departure date", after: "Required field" }],
        postSubmitFields: ["Submission failed"],
      },
    },
  },
  {
    name: "a page with no landmarks at all",
    capture: {
      transcript: ["Welcome"],
      structure: { headings: [], formFields: [], tableCells: [] },
      interaction: {},
    },
  },
  {
    name: "empty transcript, empty everything",
    capture: { transcript: [], structure: null, interaction: null },
  },
];

test("evidenceUnits (TypeScript) and evidence_units (Python) produce IDENTICAL unit lists", () => {
  for (const { name, capture } of CAPTURES) {
    const ts = evidenceUnits(capture);
    const python = pythonEvidenceUnits(capture);
    assert.deepEqual(python, ts,
      `${name}: Python and TypeScript disagree -- Python: ${JSON.stringify(python)}, TS: ${JSON.stringify(ts)}`);
  }
});

test("neither implementation emits a landmark-navigation unit, however many landmarks the capture carries", () => {
  const capture: ScorableCapture = {
    transcript: [],
    structure: { headings: [], formFields: [], tableCells: [], landmarks: ["main landmark", "navigation landmark", "search landmark"] } as ScorableCapture["structure"],
    interaction: {},
  };
  const ts = evidenceUnits(capture);
  const python = pythonEvidenceUnits(capture);
  assert.equal(ts.some((u) => u.channel === "landmark-navigation"), false, "TypeScript must stay landmark-free");
  assert.equal(python.some((u) => u.channel === "landmark-navigation"), false,
    "Python must no longer append landmark-navigation -- this is the regression this file exists to catch");
});
