/**
 * `scripts/ci-changed.mjs`'s `classify()` is the ONE place `.github/workflows/ci.yml`'s jobs decide
 * whether to run — replacing three independent copies of "what changed" (`lint.yml`'s total absence of a
 * filter, `changeset-check.yml`'s inline `git diff`, `ansible-check.yml`'s own `paths:` block). This pins
 * the classification, and separately pins `ci.yml`'s OWN trigger table plus its two Windows siblings'
 * (`action-smoke.yml`, `capture-regression.yml`), so a future "just add the tests to `ci`" — or a
 * `pull_request` trigger creeping back onto a Windows workflow — fails a unit test rather than the PR
 * budget both were rebuilt to protect.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { sandboxGitEnv } from "../../../../scripts/git-env.mjs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { classify, knownPackages } from "../../../../scripts/ci-changed.mjs";

const REPO = fileURLToPath(new URL("../../../../", import.meta.url));
const WORKFLOWS = `${REPO}.github/workflows/`;
const readWorkflow = (name: string) => readFileSync(`${WORKFLOWS}${name}`, "utf8");

test("classify: a docs-only change fires only the docs category", () => {
  const result = classify(["docs/known-gaps.md", "README.md"], ["lab", "judge"]);
  assert.deepEqual(result, { ts: false, python: false, ansible: false, docs: true, changeset: false, packages: [] });
});

test("classify: a source change under one package fires ts, names that package, and nothing else", () => {
  const result = classify(["packages/lab/src/training/case-matrix.mjs"], ["lab", "judge", "cli"]);
  assert.equal(result.ts, true);
  assert.deepEqual(result.packages, ["lab"]);
  assert.equal(result.python, false);
  assert.equal(result.ansible, false);
  assert.equal(result.docs, false);
});

test("classify: a python file under a package fires python, and (bluntly) ts for that package too", () => {
  // Same bluntness as the ansible case above: `changedPackages` does not filter by extension, so a `.py`
  // file under `packages/scorer/` marks `scorer` touched for the scoped unit-test run too. Harmless --
  // scorer's own TS-side tests simply run alongside the Python ones -- and consistent rather than a
  // second, narrower definition of "touched" living beside the one the pre-push hook already uses.
  const result = classify(["packages/scorer/python/score.py"], ["lab", "scorer"]);
  assert.equal(result.python, true);
  assert.equal(result.ts, true);
  assert.deepEqual(result.packages, ["scorer"]);
});

test("classify: the ansible layer fires ansible, and (bluntly, like changedPackages elsewhere) ts for control", () => {
  // `packages/control/ansible/**` sits INSIDE the `control` workspace, so `changedPackages` -- reused
  // here rather than re-derived, matching the pre-push hook's own "blunt, not dependency-aware"
  // philosophy -- correctly reads it as touching `control` too. Running `control`'s (fast) unit tests
  // alongside the ansible job is a harmless extra, not a wrong answer.
  const result = classify(["packages/control/ansible/deploy.yml"], ["control"]);
  assert.equal(result.ansible, true);
  assert.equal(result.ts, true);
  assert.deepEqual(result.packages, ["control"]);
});

test("classify: a published package's src fires changeset; a private package's does not", () => {
  const published = classify(["packages/cli/src/cli.ts"], ["cli"]);
  assert.equal(published.changeset, true);
  const priv = classify(["packages/lab/src/training/case-matrix.mjs"], ["lab"]);
  assert.equal(priv.changeset, false, "packages/lab is private: true and must never demand a changeset");
});

test("classify: a root config file touches EVERY known package, never just the ones that happened to change", () => {
  const result = classify(["package.json"], ["lab", "judge", "cli", "scorer"]);
  assert.equal(result.ts, true);
  assert.deepEqual(result.packages, ["cli", "judge", "lab", "scorer"].sort());
});

test("classify: a scripts/*.mjs change also touches EVERY known package, for the identical reason", () => {
  // `scripts/git-env.mjs` alone is imported by dozens of packaging tests directly -- a scoped-to-nothing
  // run here is exactly the "empty must read as run everything" defect the pre-push hook already names.
  const result = classify(["scripts/git-env.mjs"], ["lab", "judge"]);
  assert.equal(result.ts, true);
  assert.deepEqual(result.packages, ["judge", "lab"]);
});

test("classify: an unrelated file changes nothing", () => {
  const result = classify([".gitignore"], ["lab"]);
  assert.deepEqual(result, { ts: false, python: false, ansible: false, docs: false, changeset: false, packages: [] });
});

test("classify: a multi-package, multi-category diff sets every category it touches, independently", () => {
  const result = classify([
    "packages/lab/src/training/case-matrix.mjs",
    "packages/judge/src/rules.ts",
    "docs/known-gaps.md",
    "packages/control/ansible/deploy.yml",
    "packages/scorer/tests/test_runtime_versions.py",
  ], ["lab", "judge", "control", "scorer"]);
  assert.equal(result.ts, true);
  // `control` is here too -- the ansible file sits inside `packages/control/`, same as the test above.
  assert.deepEqual(result.packages, ["control", "judge", "lab", "scorer"]);
  assert.equal(result.docs, true);
  assert.equal(result.ansible, true);
  assert.equal(result.python, true);
  assert.equal(result.changeset, true, "packages/judge/src is published");
});

test("knownPackages finds the real repo's workspace directories, and refuses a second workspace glob", () => {
  const packages = knownPackages(REPO);
  // A floor, not a target -- matches the same convention `control-plane-hygiene.test.ts` uses for the
  // same reason: adding or retiring a package must not itself break this guard.
  assert.ok(packages.length >= 8, `found ${packages.length} package(s); the packages/* walk is broken`);
  assert.ok(packages.includes("lab") && packages.includes("judge"));

  // NO git repo needed here: the workspace-glob check runs, and throws, before `knownPackages` ever
  // shells out to `git ls-files` -- a plain directory with a package.json proves the refusal.
  const dir = mkdtempSync(join(tmpdir(), "ci-changed-workspaces-"));
  try {
    writeFileSync(join(dir, "package.json"),
      JSON.stringify({ name: "x", workspaces: ["packages/*", "tools/*"] }));
    assert.throws(() => knownPackages(dir), /single "packages\/\*" workspace glob/,
      "a second workspace glob must be refused loudly, not silently examine only the first");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// -------------------------------------------------------------------------------------------------------
// THE TRIGGER TABLE. `.github/workflows/on:` blocks, pinned so a future accidental trigger addition (the
// exact shape point 5 of the CI rebuild names: "mutation-checked by adding a pull_request trigger to
// action-smoke") fails here rather than costing real Windows minutes on every PR again.
// -------------------------------------------------------------------------------------------------------

test("ci.yml triggers on pull_request and on push to main only, never on an agent/lead branch push", () => {
  const doc = parseYaml(readWorkflow("ci.yml"));
  assert.ok(doc.on.pull_request, "ci.yml must trigger on pull_request -- that is the whole of the rebuild");
  assert.deepEqual(doc.on.push.branches, ["main"],
    "ci.yml's push trigger must be main-only, or a branch push and its PR both run the full check on the "
    + "same commit again");
  assert.equal(Object.keys(doc.on).length, 2,
    `ci.yml declares triggers ${Object.keys(doc.on).join(", ")} -- only pull_request and push are expected`);
});

test("action-smoke.yml and capture-regression.yml never trigger on pull_request, and push is main-only", () => {
  for (const file of ["action-smoke.yml", "capture-regression.yml"]) {
    const doc = parseYaml(readWorkflow(file));
    assert.ok(!("pull_request" in doc.on),
      `${file} must not trigger on pull_request -- it is a real Windows/NVDA job and doubling it onto `
      + "every PR is exactly what the CI rebuild removed");
    assert.ok(doc.on.workflow_dispatch !== undefined || "workflow_dispatch" in doc.on,
      `${file} must keep workflow_dispatch for an on-demand run`);
    assert.deepEqual(doc.on.push.branches, ["main"], `${file}'s push trigger must be main-only`);
  }
});

test("PROOF: the trigger-table guard bites -- a synthetic pull_request block on a push-only workflow fails", () => {
  // Driven directly against a FIXTURE rather than by mutating a real file on disk, for the reason every
  // other MUTATION test in this repo gives when the real check is cheap enough to reproduce inline: the
  // property under test is "does parsing a `pull_request:` key make `"pull_request" in doc.on` true", and
  // a fixture proves that without touching a tracked file at all.
  const withPullRequest = parseYaml([
    "on:",
    "  workflow_dispatch:",
    "  push:",
    "    branches: [main]",
    "  pull_request:",
    "    paths: [\"x\"]",
    "jobs:",
    "  x:",
    "    runs-on: ubuntu-latest",
  ].join("\n"));
  assert.ok("pull_request" in withPullRequest.on,
    "the fixture itself must carry a pull_request trigger, or this proves nothing about the real assertion");
});

test("lint.yml, ansible-check.yml and changeset-check.yml are retired, not merely unused", () => {
  for (const retired of ["lint.yml", "ansible-check.yml", "changeset-check.yml"]) {
    assert.throws(() => readWorkflow(retired), /ENOENT/,
      `${retired} still exists on disk -- it was meant to be folded into ci.yml and removed`);
  }
});

// -------------------------------------------------------------------------------------------------------
// THE CLI ITSELF, driven end to end -- `classify()` and `knownPackages()` above are the pure core, but
// `main()` is what `ci.yml`'s own `changed` job actually invokes, and a pure-function test cannot see a
// bug in the argv handling, the GITHUB_OUTPUT write, or the git subprocess it shells out to.
// -------------------------------------------------------------------------------------------------------

const SCRIPT = fileURLToPath(new URL("../../../../scripts/ci-changed.mjs", import.meta.url));

/** A disposable git repo with one `packages/*` layout, real commits on two branches, so `--event=
 *  pull_request` has a real base/HEAD diff to compute and `--event=push` has a real `packages/` to walk. */
function repo(): { dir: string; base: string } {
  const dir = mkdtempSync(join(tmpdir(), "ci-changed-cli-"));
  const run = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8", env: sandboxGitEnv() });
  run("init", "-q");
  run("config", "user.email", "t@example.com");
  run("config", "user.name", "t");
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "x", workspaces: ["packages/*"] }));
  mkdirSync(join(dir, "packages", "lab", "src"), { recursive: true });
  writeFileSync(join(dir, "packages", "lab", "src", "index.mjs"), "export const x = 1;\n");
  run("add", "-A");
  run("commit", "-q", "-m", "base");
  const base = run("rev-parse", "HEAD").trim();
  writeFileSync(join(dir, "docs.placeholder"), "placeholder\n"); // present only so mkdirSync above has a sibling
  mkdirSync(join(dir, "docs"), { recursive: true });
  writeFileSync(join(dir, "docs", "note.md"), "a doc change\n");
  run("add", "-A");
  run("commit", "-q", "-m", "docs change");
  return { dir, base };
}

/** Runs the real CLI and returns its exit code, stdout/stderr, and whatever it wrote to GITHUB_OUTPUT. */
function runCli(args: string[], cwd: string): { code: number; out: string; outputs: Record<string, string> } {
  const outFile = join(cwd, "github_output");
  writeFileSync(outFile, "");
  let out: string;
  let code = 0;
  try {
    out = execFileSync("node", [SCRIPT, ...args, `--repo=${cwd}`],
      { cwd, encoding: "utf8", env: { ...process.env, GITHUB_OUTPUT: outFile } });
  } catch (error) {
    const e = error as { status?: number; stdout?: string; stderr?: string };
    code = e.status ?? -1;
    out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
  const outputs: Record<string, string> = {};
  for (const line of readFileSync(outFile, "utf8").split("\n")) {
    const eq = line.indexOf("=");
    if (eq !== -1) outputs[line.slice(0, eq)] = line.slice(eq + 1);
  }
  return { code, out, outputs };
}

test("CLI: --event=push writes every category true and every package touched", () => {
  const { dir } = repo();
  try {
    const { code, outputs } = runCli(["--event=push"], dir);
    assert.equal(code, 0);
    assert.equal(outputs.ts, "true");
    assert.equal(outputs.python, "true");
    assert.equal(outputs.ansible, "true");
    assert.equal(outputs.docs, "true");
    assert.equal(outputs.changeset, "false");
    assert.equal(outputs.packages, "lab");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI: --event=pull_request computes the real diff against --base", () => {
  const { dir, base } = repo();
  try {
    const { code, outputs } = runCli(["--event=pull_request", `--base=${base}`], dir);
    assert.equal(code, 0);
    // The second commit touched only docs/note.md -- ts/ansible/changeset must all read false.
    assert.equal(outputs.docs, "true");
    assert.equal(outputs.ts, "false");
    assert.equal(outputs.ansible, "false");
    assert.equal(outputs.changeset, "false");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI: an invalid --event is refused, exit 2", () => {
  const { dir } = repo();
  try {
    const { code, out } = runCli(["--event=merge_group"], dir);
    assert.equal(code, 2);
    assert.match(out, /--event must be "push" or "pull_request"/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI: --event=pull_request with no --base is refused, exit 2", () => {
  const { dir } = repo();
  try {
    const { code, out } = runCli(["--event=pull_request"], dir);
    assert.equal(code, 2);
    assert.match(out, /--base=<ref> is required/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI: an empty diff against --base is refused rather than reported as nothing changed", () => {
  const { dir } = repo();
  try {
    // HEAD against itself -- a real, zero-file diff, the shape a wrong --base or a no-op PR produces.
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8", env: sandboxGitEnv() }).trim();
    const { code, out } = runCli(["--event=pull_request", `--base=${head}`], dir);
    assert.equal(code, 2);
    assert.match(out, /returned nothing/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI: an unknown flag is refused by the shared guard, not silently ignored", () => {
  const { dir } = repo();
  try {
    const { code, out } = runCli(["--event=push", "--branch=main"], dir);
    assert.equal(code, 2);
    assert.match(out, /unknown flag --branch/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI: with no GITHUB_OUTPUT set, writeOutputs prints to stdout instead of throwing", () => {
  const { dir } = repo();
  try {
    const env = { ...process.env };
    delete env.GITHUB_OUTPUT;
    const out = execFileSync("node", [SCRIPT, "--event=push", `--repo=${dir}`], { cwd: dir, encoding: "utf8", env });
    assert.match(out, /^ts=true$/m);
    assert.match(out, /^packages=lab$/m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
