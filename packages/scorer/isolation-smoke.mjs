// @ts-check
// Run by `scripts/isolation-gate.mjs` from a throwaway directory OUTSIDE this repository, against the
// installed tarball.
//
// It cannot run the scorer: that needs Python, torch and an 87 MB encoder that is deliberately not shipped.
// What it CAN prove is everything that has actually broken here before — that the paths resolve from the
// module rather than the cwd, that every file the API points at is really in the tarball, and that the
// encoder is NOT.
import assert from "node:assert/strict";
import { existsSync, readdirSync, statSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { chdir } from "node:process";

import { scorerPaths, encoderPresent, scorerProvenance } from "@a11y-witness/scorer";

// Resolve from a different cwd than the one we were started in. The M0 defect was a scorer resolved as
// `".venv/bin/python"` and `"scripts/score-screenreader-model.py"` — correct only when the cwd happened to be
// the repo root, so the default judge backend could not work from anywhere else.
chdir("/");
const paths = scorerPaths();

for (const [name, path] of Object.entries(paths)) {
  assert.ok(isAbsolute(path), `${name} must be absolute, got ${path}`);
}

// Everything the tarball is supposed to carry. `files` allow-lists drop assets silently — a `.py` or a
// `.safetensors` is exactly the kind of payload that goes missing and is only noticed at runtime.
for (const key of ["weights", "trainingReport", "scoreScript", "fetchEncoderScript", "requirements"]) {
  assert.ok(existsSync(paths[key]), `${key} is missing from the installed package: ${paths[key]}`);
}

// The weights must be the real thing, not a placeholder. A truncated file or an LFS pointer exists, is a few
// hundred bytes, and fails much later with a confusing torch error.
assert.ok(statSync(paths.weights).size > 10_000,
  `the weights look like a placeholder: ${statSync(paths.weights).size} bytes`);

// And the one thing it must NOT carry. The encoder is 87 MB and lives inside the package directory in the
// repo, untracked — and `npm pack` includes untracked files, so an allow-list naming `models` instead of
// `models/screenreader-scorer` would ship it to every consumer on every install.
const shippedEncoder = existsSync(paths.encoderDir) && readdirSync(paths.encoderDir).length > 0;
assert.equal(shippedEncoder, false, `the 87 MB encoder was shipped in the tarball: ${paths.encoderDir}`);

// So `encoderPresent()` must be FALSE on a fresh install, and that is correct rather than broken: it is the
// signal to run `a11y-scorer-fetch-encoder`. Reporting it as a failure would be a check rejecting evidence
// whose absence is the finding.
assert.equal(encoderPresent(), false, "a fresh install has no encoder yet");

const provenance = scorerProvenance();
assert.ok(provenance, "the training report should be readable");
assert.equal(typeof provenance.featureSchema, "string",
  `featureSchema must be the schema STRING, got ${JSON.stringify(provenance.featureSchema)}`);
assert.match(provenance.featureSchema, /^screenreader-/, "the schema name should identify this feature pipeline");
assert.equal(typeof provenance.releaseEligible, "boolean");

// The bin npm links as `a11y-scorer-fetch-encoder`. Derived from a path the API already gave us, because the
// smoke test runs in the CONSUMER's directory and has no relative route into the package.
const binWrapper = join(paths.scoreScript, "..", "..", "bin", "fetch-encoder.mjs");
assert.ok(existsSync(binWrapper), `the bin wrapper is missing from the tarball: ${binWrapper}`);

console.log(
  `@a11y-witness/scorer works when installed: schema ${provenance.featureSchema}, `
  + `releaseEligible=${provenance.releaseEligible}, encoder absent as designed`,
);
