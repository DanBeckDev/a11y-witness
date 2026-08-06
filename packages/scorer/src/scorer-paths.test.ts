/**
 * Every scorer path must resolve from the module, because the cwd is not the repo root for anyone but us.
 *
 * This is the M0 defect's home: the scorer was once resolved as `"scripts/score-screenreader-model.py"`,
 * correct only when the process started at the repo root — so the DEFAULT judge backend could not run from
 * anywhere else, and nobody noticed because development always happens at the repo root.
 *
 * The isolation smoke test covers this against an installed tarball, but that only runs in `gate:isolation`.
 * These assertions run in the normal suite, where a regression is caught in seconds rather than at release time.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import { isAbsolute } from "node:path";
import { chdir, cwd } from "node:process";

import { scorerPaths, encoderPresent, scorerProvenance } from "./index.js";

test("every path is absolute, from any working directory", () => {
  const before = scorerPaths();
  const original = cwd();
  try {
    chdir("/");
    assert.deepEqual(scorerPaths(), before, "the paths changed with the cwd, which is the M0 defect exactly");
  } finally {
    chdir(original);
  }
  for (const [name, path] of Object.entries(before)) {
    assert.ok(isAbsolute(path), `${name} must be absolute, got ${path}`);
  }
});

test("the shipped artefacts exist, and the weights are not a placeholder", () => {
  const { weights, trainingReport, scoreScript, fetchEncoderScript, requirements } = scorerPaths();
  for (const [name, path] of Object.entries({ weights, trainingReport, scoreScript, fetchEncoderScript, requirements })) {
    assert.ok(existsSync(path), `${name} is missing: ${path}`);
  }
  // A truncated file or an LFS pointer exists, is a few hundred bytes, and fails much later inside torch.
  assert.ok(statSync(weights).size > 10_000, `the weights look like a placeholder: ${statSync(weights).size} bytes`);
});

test("the encoder is NOT shipped, and saying so is correct rather than broken", () => {
  // 87 MB, fetched on demand. `encoderPresent()` is the signal to run `a11y-scorer-fetch-encoder`, so reporting
  // its absence as a failure would be a check rejecting evidence whose absence is the finding.
  const { encoderDir } = scorerPaths();
  assert.equal(typeof encoderPresent(), "boolean");
  assert.equal(encoderPresent(), existsSync(`${encoderDir}/model.safetensors`),
    "encoderPresent must reflect the encoder on disk, not a cached guess");
});

test("provenance reads the schema as a STRING, not as the object it sits in", () => {
  // It shipped `[object Object]` once: `representation` is an object in the training report and a string in the
  // safetensors metadata, and reading the wrong one produced a provenance value that looked fine in a log.
  const provenance = scorerProvenance();
  assert.ok(provenance, "the training report ships with the weights and must be readable");
  assert.equal(typeof provenance.featureSchema, "string",
    `featureSchema must be the schema string, got ${JSON.stringify(provenance.featureSchema)}`);
  assert.match(provenance.featureSchema, /^screenreader-/);
  assert.equal(typeof provenance.releaseEligible, "boolean",
    "the scorer refuses an ineligible report, so a caller must be able to check before spawning");
});
