/**
 * The committed weights and the committed trainer must agree on the feature schema.
 *
 * `score-screenreader-model.py` refuses to load weights whose `representation` metadata does not match the
 * trainer's `FEATURE_SCHEMA_VERSION` — a correct guard, because a mismatch means the 413 inputs the heads
 * were fitted on are not the 413 inputs being computed. But it can only refuse at RUNTIME, on a machine
 * with Python, an encoder and a capture to score. Nothing checked the committed artifacts against each
 * other, and they had drifted:
 *
 *     model.safetensors metadata     screenreader-structured-v4
 *     train-screenreader-model.py    screenreader-structured-v1   (at HEAD)
 *
 * The v4 trainer existed only as an uncommitted file in one working tree, so **a fresh clone could not
 * score anything at all** — the default judge backend (`judge-backend: local`, and `JUDGE_BACKEND`'s
 * default) was broken for every consumer, and had been since before the weights were last retrained.
 *
 * `referenced-scripts.test.ts` cannot catch this: the trainer IS tracked. It is tracked at the wrong
 * version, which is the same defect family — "the working tree is not the repo" — wearing a different
 * disguise.
 *
 * Reads the safetensors header directly rather than shelling out to Python: the format is an 8-byte
 * little-endian header length followed by JSON, so this needs no venv and runs in CI, which is the one
 * environment that sees only committed files.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { openSync, readSync, closeSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { scorerPaths } from "@a11y-witness/scorer";
import { join } from "node:path";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

/** `__metadata__` from a safetensors file, without loading a single tensor. */
function safetensorsMetadata(path: string): Record<string, string> {
  const fd = openSync(path, "r");
  try {
    const lengthBytes = Buffer.alloc(8);
    readSync(fd, lengthBytes, 0, 8, 0);
    const headerLength = Number(lengthBytes.readBigUInt64LE(0));
    const header = Buffer.alloc(headerLength);
    readSync(fd, header, 0, headerLength, 8);
    return (JSON.parse(header.toString("utf8")).__metadata__ ?? {}) as Record<string, string>;
  } finally {
    closeSync(fd);
  }
}

test("the committed weights carry the schema the committed feature pipeline computes", () => {
  // `FEATURE_SCHEMA_VERSION` moved out of the trainer and into the feature module that SHIPS WITH the weights
  // (PLAN.md M3), which is the point: the two must version together, and the trainer is not published at all.
  // Reading the trainer here would now find nothing and — before the guard below existed — would have passed
  // by examining an empty match.
  const weights = scorerPaths().weights;
  const trainer = join(repoRoot, "packages/scorer/python/screenreader_features.py");

  const stamped = safetensorsMetadata(weights).representation;
  assert.ok(stamped, `${weights} has no \`representation\` metadata; it was not written by the trainer`);

  const declared = /^FEATURE_SCHEMA_VERSION\s*=\s*["']([^"']+)["']/m.exec(readFileSync(trainer, "utf8"))?.[1];
  assert.ok(declared, `could not find FEATURE_SCHEMA_VERSION in ${trainer}; the check is broken, not passing`);

  assert.equal(stamped, declared,
    `the weights were trained under "${stamped}" but the trainer in this tree computes "${declared}". `
    + `The scorer refuses that combination at runtime, so the default judge backend cannot run — which is `
    + `exactly what a consumer gets if only one of the two is committed.`);
});

test("the training report agrees with the weights", () => {
  // The scorer checks this too, and separately: a report from a different run than the weights would make
  // every threshold and every recorded metric describe a model that is not the one loaded.
  const { weights, trainingReport } = scorerPaths();
  const report = JSON.parse(readFileSync(trainingReport, "utf8")) as { representation?: { schema?: string } };
  assert.equal(report.representation?.schema, safetensorsMetadata(weights).representation,
    "the training report and the weights come from different runs");
});
