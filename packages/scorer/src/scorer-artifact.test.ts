/**
 * The committed weights and the committed trainer must agree on the feature schema.
 *
 * `score-screenreader-model.py` refuses to load weights whose `representation` metadata does not match the
 * trainer's `FEATURE_SCHEMA_VERSION` — a correct guard, because a mismatch means the inputs the heads
 * were fitted on are not the inputs being computed. But it can only refuse at RUNTIME, on a machine
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
import { openSync, readSync, closeSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { scorerPaths } from "@a11y-witness/scorer";
import { join } from "node:path";

/**
 * Resolved from THIS package, not from the repo root.
 *
 * This test moved here with the artefacts it checks (PLAN.md M4 retired `src/spike/`), and `../../` used to
 * mean the repo root — from `packages/scorer/src/` it means `packages/`, so the schema check failed on a
 * missing file. Anchoring on the package is also the correct relationship: the feature pipeline and the
 * weights are what must agree, and both live here.
 */
const packageRoot = fileURLToPath(new URL("../", import.meta.url));

const MIGRATION_FILE = "packages/scorer/models/schema-migration.json";

/**
 * A deliberate, declared divergence between the shipped weights and the pipeline in this tree.
 *
 * Before this existed the only way past the assertion below was `A11Y_SKIP_VERIFY=1`, and that does not skip
 * this check — it skips the whole pre-push hook, lint and 949 tests included. A guard that is routinely
 * bypassed by disabling every other guard is a net loss, so the divergence is declared instead and refused at
 * release by `scripts/check-schema-migration.mjs`.
 */
function openMigration(): { pendingSchema: string; shippedSchema: string; why?: string } | null {
  const path = join(packageRoot, "models/schema-migration.json");
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
}

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
  const trainer = join(packageRoot, "python/screenreader_features.py");

  const stamped = safetensorsMetadata(weights).representation;
  assert.ok(stamped, `${weights} has no \`representation\` metadata; it was not written by the trainer`);

  const declared = /^FEATURE_SCHEMA_VERSION\s*=\s*["']([^"']+)["']/m.exec(readFileSync(trainer, "utf8"))?.[1];
  assert.ok(declared, `could not find FEATURE_SCHEMA_VERSION in ${trainer}; the check is broken, not passing`);

  const migration = openMigration();

  if (stamped === declared) {
    // A declaration left behind after the retrain landed would silently disable this guard forever, which is
    // strictly worse than not having it: the check would keep reporting success while examining nothing.
    assert.equal(migration, null,
      `weights and pipeline agree on "${stamped}", but ${MIGRATION_FILE} still declares a migration. `
      + `Delete it — a stale declaration turns this check off without anyone deciding to.`);
    return;
  }

  // They disagree. That is legitimate on a branch changing the schema ahead of a retrain, and a release
  // blocker anywhere else — so it must be DECLARED, and the declaration must match reality rather than merely
  // exist. `npm run scorer:migration` fails release while it is open.
  assert.ok(migration,
    `the weights were trained under "${stamped}" but the pipeline in this tree computes "${declared}". `
    + `The scorer refuses that combination at runtime, so the default judge backend cannot run — which is `
    + `exactly what a consumer gets if only one of the two is committed. If this divergence is deliberate, `
    + `declare it in ${MIGRATION_FILE}; the release gate will refuse to promote while it is open.`);
  assert.equal(migration.pendingSchema, declared,
    `${MIGRATION_FILE} declares pendingSchema "${migration.pendingSchema}" but the pipeline computes "${declared}"`);
  assert.equal(migration.shippedSchema, stamped,
    `${MIGRATION_FILE} declares shippedSchema "${migration.shippedSchema}" but the weights carry "${stamped}"`);
  assert.ok((migration.why ?? "").trim().length > 0,
    `${MIGRATION_FILE} must say WHY the schema is changing; a declaration nobody can evaluate is a skip with extra steps`);
});

test("the training report agrees with the weights", () => {
  // The scorer checks this too, and separately: a report from a different run than the weights would make
  // every threshold and every recorded metric describe a model that is not the one loaded.
  const { weights, trainingReport } = scorerPaths();
  const report = JSON.parse(readFileSync(trainingReport, "utf8")) as { representation?: { schema?: string } };
  assert.equal(report.representation?.schema, safetensorsMetadata(weights).representation,
    "the training report and the weights come from different runs");
});
