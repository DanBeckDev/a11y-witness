/**
 * #81: `scoreCapture` must read score.py's parseable fault line and attach `.fault`, not just wrap the
 * raw stderr — that is the whole difference between a stranger seeing a NAMED, actionable fault and a
 * caught traceback.
 *
 * Exercises the REAL subprocess path `scoreCapture` uses (spawn, not a mock), pointed at a tiny fixture
 * "python" (really `process.execPath` running a fixture .mjs file) that reproduces exactly what
 * `score.py`'s `__main__` block does on an ArtifactSchemaMismatch: one JSON line on stdout, exit 3.
 * `options.python`/`options.script` are the injection seam `scoreCapture` already exposed for this.
 */
import { strict as assert } from "node:assert";
import test from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scoreCapture } from "./local-judge.js";

function fixtureScript(dir: string, body: string): string {
  const path = join(dir, "fixture-scorer.mjs");
  writeFileSync(path, body);
  return path;
}

test("a fault-JSON line on stdout becomes a rejection carrying .fault, not a generic wrap", async () => {
  const dir = mkdtempSync(join(tmpdir(), "score-capture-fault-"));
  const script = fixtureScript(dir, `
    console.log(JSON.stringify({ fault: "artifact-schema-mismatch", error: "scorer representation schema does not match the runtime" }));
    console.error("screen-reader scorer failed: scorer representation schema does not match the runtime");
    process.exit(3);
  `);
  await assert.rejects(
    scoreCapture({}, { python: process.execPath, script }),
    (err: Error & { fault?: string }) => {
      assert.equal(err.fault, "artifact-schema-mismatch");
      assert.match(err.message, /schema does not match/);
      return true;
    },
  );
  rmSync(dir, { recursive: true, force: true });
});

test("a non-zero exit with NO fault line still gets the generic wrap, unchanged", async () => {
  const dir = mkdtempSync(join(tmpdir(), "score-capture-fault-"));
  const script = fixtureScript(dir, `
    console.error("screen-reader scorer failed: missing scorer weights: /tmp/nope/model.safetensors");
    process.exit(1);
  `);
  await assert.rejects(
    scoreCapture({}, { python: process.execPath, script }),
    (err: Error & { fault?: string }) => {
      assert.equal(err.fault, undefined, "a plain failure must not acquire a fault code from nowhere");
      assert.match(err.message, /the local scorer exited 1/);
      return true;
    },
  );
  rmSync(dir, { recursive: true, force: true });
});

test("stdout JSON that happens to start with '{' but carries no fault key is not misread as one", async () => {
  const dir = mkdtempSync(join(tmpdir(), "score-capture-fault-"));
  const script = fixtureScript(dir, `
    console.log(JSON.stringify({ someOtherField: "not a fault" }));
    process.exit(1);
  `);
  await assert.rejects(
    scoreCapture({}, { python: process.execPath, script }),
    (err: Error & { fault?: string }) => {
      assert.equal(err.fault, undefined);
      assert.match(err.message, /the local scorer exited 1/);
      return true;
    },
  );
  rmSync(dir, { recursive: true, force: true });
});

test("a SUCCESSFUL run (exit 0) is unaffected -- the fault-line check only runs on a non-zero exit", async () => {
  const dir = mkdtempSync(join(tmpdir(), "score-capture-fault-"));
  const script = fixtureScript(dir, `
    console.log(JSON.stringify({ records: [{ novelty: {} }] }));
    process.exit(0);
  `);
  const result = await scoreCapture({}, { python: process.execPath, script });
  assert.ok(result.records?.[0]);
  rmSync(dir, { recursive: true, force: true });
});
