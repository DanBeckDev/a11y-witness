/**
 * EVERY BUILDER OF A TRAINING RECORD MUST EMIT `observation`, AND THERE ARE FOUR OF THEM.
 *
 * `observation` is a sibling of `input` carrying which questions the capture actually put, and the
 * featurizer crosses two channels with it. Its failure mode is the worst kind: **absent and `asked: false`
 * are the same row by design**, so a builder that never learned about the field produces records that are
 * structurally valid, featurize cleanly, and quietly say "nobody looked" about every capture it made.
 * Nothing downstream can tell that from the truth.
 *
 * It was missed at two of the four sites within an hour of being written, and neither miss was careless:
 *
 * - `build-realism-tier.mjs` — every REAL-PAGE record, the tier that grounds the model in real sites.
 *   The comment directly above its `modelInput(capture)` call already warned about this exact drift:
 *   *"These two constructed the model's input separately until 2026-08-24, and the copies drifted the
 *   moment the contract gained a field."* The contract gained a field, and the copy drifted again.
 * - `score.py` — the PRODUCT path. It SELECTS keys, so a live capture would have reached the model with
 *   both crossed columns at zero while every corpus record carried signal: the head fed a row it never
 *   saw in training. Its own comment records the identical miss for `parsed`, which broke the abstention
 *   sweep, and calls it "the model-input contract existing in a fifth place".
 *
 * So this DISCOVERS the builders rather than trusting a list — the same remedy `cli-flags.test.ts` and
 * `worker-code-check.test.ts` apply, and for the same reason: a hand-maintained list of call sites is one
 * more copy of the fact it is checking.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../../..");

/** Every source file under packages/, excluding build output and tests. */
function* sources(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "dist" || entry.name === "node_modules" || entry.name === "__pycache__") continue;
      yield* sources(full);
    } else if (/\.(ts|mjs|py)$/.test(entry.name) && !/\.test\.ts$|_test\.py$|^test_/.test(entry.name)) {
      yield full;
    }
  }
}

/** A file that constructs a training record: it emits an `input:`/`"input":` key into an object. */
function recordBuilders(): string[] {
  return [...sources(join(ROOT, "packages"))]
    .filter((file) => {
      const text = readFileSync(file, "utf8");
      // The record's own shape, not a parameter named `input` — the key must be paired with `target`,
      // which every training record carries and nothing else in this codebase does.
      return /(^|\s)("input"|input):/m.test(text) && /(^|\s)("target"|target):\s*\{/m.test(text);
    })
    .map((file) => file.slice(ROOT.length + 1))
    .filter((file) => !(file in NOT_A_BUILDER));
}

/**
 * Files the matcher reaches that do not CONSTRUCT a record, each with the reason.
 *
 * Classified rather than pattern-excluded, because "nothing needs this" and "somebody forgot" must stay
 * different states -- the same rule `criterion-coverage.ts` learned when a union and a parallel array
 * drifted and `tsc` could not see it. A new entry here is a decision somebody made and can be argued with.
 */
const NOT_A_BUILDER: Readonly<Record<string, string>> = {
  "packages/lab/scripts/score-rules.ts":
    "declares the record's TYPE (`interface Record_`) to read an exported corpus; it constructs nothing. "
    + "It also reads `ruleEvidence`, the other sibling of `input`, which is the shape this is about -- "
    + "but as a consumer.",
};

test("every training-record builder emits `observation` beside `input`", () => {
  const builders = recordBuilders();

  // Mutation-safety: a matcher that finds nothing would pass having examined nothing, which is the exact
  // failure mode of the field it is guarding.
  assert.ok(builders.length >= 3,
    `found only ${builders.length} record builder(s); the matcher went blind. Expected at least the corpus `
    + "export, the realism tier and the live scorer.");

  const silent = builders.filter((file) =>
    !/(^|\s)("observation"|observation):/m.test(readFileSync(join(ROOT, file), "utf8")));

  assert.deepEqual(silent, [],
    "These build a training record and never set `observation`:\n  " + silent.join("\n  ")
    + "\n\nAbsent and `asked: false` are the SAME row for the featurizer, so such a record says 'nobody"
    + "\nlooked' about every capture and nothing downstream can tell that from the truth. Import"
    + "\n`observationOf` from @a11y-witness/scorer/evidence-units rather than writing a second spelling"
    + "\n-- one builder is the point; the drift is what this guards.");
});

test("the builders discovered are the ones we think", () => {
  // Named so that a NEW builder is a visible change to this list rather than a silent pass, and so that a
  // builder that disappears is noticed. It is an assertion about coverage, not about correctness.
  const builders = recordBuilders().sort();
  assert.deepEqual(builders, [
    "packages/lab/scripts/build-realism-tier.mjs",
    "packages/lab/scripts/compose-multi-defect-probe.py",
    "packages/lab/src/training/export-screenreader-dataset.mjs",
    "packages/scorer/python/score.py",
  ], "the set of training-record builders changed -- confirm the new one sets `observation`, then update this list");
});
