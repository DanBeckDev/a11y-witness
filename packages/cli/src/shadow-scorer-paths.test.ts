/**
 * The shadow scorer must be findable from ANY working directory, and must default to an interpreter
 * that actually exists.
 *
 * `SHADOW_PYTHON` defaulted to `packages/cli/.venv/bin/python`, a path this checkout never creates —
 * so even the documented `A11Y_SHADOW_MODEL=1 npm run witness -- <url>` workflow
 * (docs/local-model.md, packages/lab/src/training/README.md) could never run without an operator first
 * discovering and setting `A11Y_SHADOW_PYTHON` themselves. `local-judge.paths.test.ts` is the model:
 * assert existence only, never run Python, because CI has no venv and a test that needed one would be
 * skipped exactly where it matters.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { isAbsolute } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

import { shadowScorerPaths } from "./cli.js";

test("the shadow scorer PROGRAM resolves to an absolute path that exists", () => {
  const { script } = shadowScorerPaths();
  assert.ok(isAbsolute(script), `the shadow scorer program must resolve absolutely, got ${script}`);
  assert.ok(existsSync(script), `${script} does not exist`);
});

test("the default shadow interpreter is a PATH lookup, never a guessed venv location", () => {
  const original = { shadow: process.env.A11Y_SHADOW_PYTHON, real: process.env.A11Y_PYTHON };
  try {
    delete process.env.A11Y_SHADOW_PYTHON;
    delete process.env.A11Y_PYTHON;
    assert.equal(shadowScorerPaths().python, "python3",
      "with nothing set, the shadow scorer must fall back to a PATH lookup — packages/cli/.venv/bin/"
      + "python does not exist in any checkout, installed or not");
  } finally {
    if (original.shadow === undefined) delete process.env.A11Y_SHADOW_PYTHON;
    else process.env.A11Y_SHADOW_PYTHON = original.shadow;
    if (original.real === undefined) delete process.env.A11Y_PYTHON;
    else process.env.A11Y_PYTHON = original.real;
  }
});

test("A11Y_PYTHON is honoured when A11Y_SHADOW_PYTHON is unset, so shadow and real judge share one venv", () => {
  const original = { shadow: process.env.A11Y_SHADOW_PYTHON, real: process.env.A11Y_PYTHON };
  try {
    delete process.env.A11Y_SHADOW_PYTHON;
    process.env.A11Y_PYTHON = "/some/specific/python";
    assert.equal(shadowScorerPaths().python, "/some/specific/python");
  } finally {
    if (original.shadow === undefined) delete process.env.A11Y_SHADOW_PYTHON;
    else process.env.A11Y_SHADOW_PYTHON = original.shadow;
    if (original.real === undefined) delete process.env.A11Y_PYTHON;
    else process.env.A11Y_PYTHON = original.real;
  }
});

test("A11Y_SHADOW_PYTHON wins over A11Y_PYTHON, for a shadow run against a deliberately different interpreter", () => {
  const original = { shadow: process.env.A11Y_SHADOW_PYTHON, real: process.env.A11Y_PYTHON };
  try {
    process.env.A11Y_SHADOW_PYTHON = "/shadow/python";
    process.env.A11Y_PYTHON = "/real/python";
    assert.equal(shadowScorerPaths().python, "/shadow/python");
  } finally {
    if (original.shadow === undefined) delete process.env.A11Y_SHADOW_PYTHON;
    else process.env.A11Y_SHADOW_PYTHON = original.shadow;
    if (original.real === undefined) delete process.env.A11Y_PYTHON;
    else process.env.A11Y_PYTHON = original.real;
  }
});

test("resolution does not depend on the process working directory", () => {
  const before = shadowScorerPaths();
  const cwd = process.cwd();
  try {
    process.chdir(mkdtempSync(`${tmpdir()}/a11y-cwd-`));
    const after = shadowScorerPaths();
    assert.deepEqual(after, before, "the resolved script path changed with the cwd");
    assert.ok(existsSync(after.script), "the shadow scorer became unreachable from a different cwd");
  } finally {
    process.chdir(cwd);
  }
});
