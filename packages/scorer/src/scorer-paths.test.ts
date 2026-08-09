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
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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
  // `assert.ok` on the typeof rather than `assert.equal` of it: both check the same thing at runtime, but
  // only this form narrows `string | undefined` for the `assert.match` below, which otherwise does not
  // typecheck. Written the other way first, and `npm run typecheck` caught it.
  assert.ok(typeof provenance.featureSchema === "string",
    `featureSchema must be the schema string, got ${JSON.stringify(provenance.featureSchema)}`);
  assert.match(provenance.featureSchema, /^screenreader-/);
  assert.equal(typeof provenance.releaseEligible, "boolean",
    "the scorer refuses an ineligible report, so a caller must be able to check before spawning");
});

/**
 * The inference path must not import torch.
 *
 * Not a style preference: torch is a 400 MB wheel measured at 102 s in the GitHub Action — 34% of a cold
 * run — to compute a frozen 6-layer encoder and fourteen dot products. Inference now runs the encoder under
 * ONNX Runtime and its arithmetic in numpy, and `action.yml` no longer installs torch, so a `import torch`
 * added back to this path would break every consumer's workflow rather than merely slowing it.
 *
 * A STATIC check on the source, deliberately. The dynamic version — running the scorer with a fake `torch`
 * module that raises — reported a false failure, because `transformers` probes for torch and my stub made
 * it look present-but-broken rather than absent. A genuinely torch-free virtualenv scored the same fixture
 * with identical predictions and a worst score difference of 1.12e-08, which is what actually proves it;
 * this test just stops the property being lost between such runs.
 */
test("the scorer's inference path imports torch only behind a fallback", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const python = join(here, "..", "python");
  for (const file of ["score.py", "screenreader_features.py"]) {
    const source = readFileSync(join(python, file), "utf8");
    const lines = source.split("\n");
    lines.forEach((line, index) => {
      if (!/^\s*import torch\b|^\s*from torch\b/.test(line)) return;
      // The two permitted sites both sit inside a branch that has already established torch is present:
      // `_torch_encode` (used only when the ONNX file is missing) and the torch arm of `score_bags`.
      const context = lines.slice(Math.max(0, index - 40), index).join("\n");
      const permitted = /def _torch_encode\(/.test(context) || /hasattr\(unit_scores, "masked_fill"\)/.test(context);
      assert.ok(permitted,
        `${file}:${index + 1} imports torch outside a fallback branch — the Action no longer installs it`);
    });
  }
});

test("safetensors is opened with the numpy framework, not pt", () => {
  // `framework="pt"` makes safetensors import torch even when only metadata is read, which is exactly how
  // torch survived the ONNX swap unnoticed while every other check passed.
  const here = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(join(here, "..", "python", "score.py"), "utf8");
  assert.doesNotMatch(source, /framework\s*=\s*"pt"/);
  assert.match(source, /framework\s*=\s*"np"/);
});
