/**
 * The scorer must be findable from ANY working directory.
 *
 * `scoreCapture` resolved its two paths as `".venv/bin/python"` and
 * `"scripts/score-screenreader-model.py"` — relative to wherever the process started. That is the repo root
 * for `npm run …` and nothing else: not an installed package, not a git worktree, not a scheduled task, not
 * `cd /tmp && node …`. `PLAN.md`'s M0 names it as one of the two defects that make this layout impossible
 * to consume, and it is the reason the default judge backend cannot be used by anyone who installs us.
 *
 * Asserts existence only, never runs Python: CI has no venv, and a test that needs one would be skipped
 * exactly where it matters. The point is the RESOLUTION, and resolution is checkable anywhere.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { isAbsolute } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

import { scorerPaths } from "./local-judge.js";

test("the scorer PROGRAM resolves to an absolute path that exists", () => {
  const { python, script } = scorerPaths();
  assert.ok(isAbsolute(script), `the scorer program must resolve absolutely, got ${script}`);
  assert.ok(existsSync(script),
    `${script} does not exist. This program is the DEFAULT judge backend — action.yml ships `
    + `judge-backend: local and JUDGE_BACKEND defaults to local — and it went uncommitted for the whole `
    + `project's life, so a fresh clone could not run its own judge.`);
  // The INTERPRETER is deliberately NOT absolute. It defaulted to `<repo>/.venv/bin/python`, derived as
  // `../../` from the source file — which quietly became `packages/.venv/bin/python` the moment the judge
  // moved into its own package, and every score failed with ENOENT. A default that depends on where the
  // source file sits is the cwd defect one level removed, and an installed package has no venv at all. So the
  // default is a PATH lookup, and anything that wants a specific interpreter names it.
  if (!process.env.A11Y_PYTHON) {
    assert.equal(python, "python3", "the default interpreter should be a PATH lookup, not a guessed location");
  }
});

test("A11Y_PYTHON wins, because a Windows runner has no venv", () => {
  // `action.yml` sets a bare `python`. If this override ever stopped being honoured, the GitHub Action would
  // spawn an interpreter that does not exist on the runner.
  const original = process.env.A11Y_PYTHON;
  try {
    process.env.A11Y_PYTHON = "/some/specific/python";
    assert.equal(scorerPaths().python, "/some/specific/python");
  } finally {
    if (original === undefined) delete process.env.A11Y_PYTHON;
    else process.env.A11Y_PYTHON = original;
  }
});

test("resolution does not depend on the process working directory", () => {
  // The regression, reproduced: before this fix, running from anywhere but the repo root produced relative
  // paths that pointed at nothing. Restore either literal in `scoreCapture` and this assertion fails.
  const before = scorerPaths();
  const cwd = process.cwd();
  try {
    process.chdir(mkdtempSync(`${tmpdir()}/a11y-cwd-`));
    const after = scorerPaths();
    assert.deepEqual(after, before, "the resolved paths changed with the cwd");
    assert.ok(existsSync(after.script), "the scorer became unreachable from a different cwd");
  } finally {
    process.chdir(cwd);
  }
});
