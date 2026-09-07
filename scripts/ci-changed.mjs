#!/usr/bin/env node
// WHAT CHANGED, CLASSIFIED — the one place `ci.yml`'s conditional jobs read to decide whether they run.
//
// Before this, a PR ran everything: `lint.yml` had no path filter at all, and ran lint, typecheck, the
// full TS suite and the full Python suite on a one-line docs edit exactly as it did on a capture-path
// rewrite. `changeset-check.yml` re-derived its own "does this touch a published package" answer inline
// in YAML, and `ansible-check.yml` carried a THIRD copy of "did the fleet's Ansible layer change" as a
// third `paths:` block. Three copies of "what changed", and nothing kept them agreeing — this repo's own
// most-repeated defect, aimed at its own CI.
//
// `classify` is PURE — a file list, a package list and a dependency graph in, a handful of booleans and
// two package lists out — so the categories are testable without a checkout, a diff, or a runner, and a
// category that stops matching anything is a red unit test rather than a silent CI budget regression. The
// CLI wrapper is the only impure part: it reads `git diff --name-only` against the PR's base and every
// package's `package.json` to build the dependency graph.
//
// PULL_REQUEST ONLY, DELIBERATELY -- chairman's direction, 2026-09-06. This file used to also support
// `--event=push`, unconditionally reporting every category true for a push straight to `main`; `ci.yml`
// no longer HAS a push trigger at all (a check that runs after a merge cannot stop it), so that mode had
// no caller left and was removed rather than kept as an unused, untested escape hatch. Every check now
// runs on the PR, before the merge; branch protection (checks green AND up to date with `main`) is what
// makes the tested commit the one that lands.
//
// `testPackages` (touched + every workspace DEPENDENT, transitively) IS THE POINT OF THIS FILE'S SECOND
// PASS -- 2026-09-06, chairman's follow-up measuring `ci/ts` at 269s on a one-package PR. `packages`
// alone (a PR's directly touched packages) would test the changed code but not its consumers -- a
// contract change under `packages/evidence` breaking `packages/judge`'s use of it would pass a scoped run
// that only ever looked at `evidence`. `testPackages` is the transitive closure of dependents, computed
// from the real `@a11y-witness/*` `dependencies`/`devDependencies` in every package's own `package.json`
// -- never a hand-written map, for this file's own stated reason: three independent hand-written copies
// of "what changed" is the defect this file exists to end.
import { execFileSync } from "node:child_process";
import { readFileSync, appendFileSync } from "node:fs";
// RELATIVE, NOT `@a11y-witness/worker-fleet/cli-flags` — every other root script uses the package
// specifier, and every other root script runs after `npm run build`. This one gates whether ANYTHING
// else in the workflow builds at all, so it cannot depend on a build having already happened; the file
// itself is plain JS with no TypeScript syntax, so importing straight from `src` costs nothing.
import { refuseUnknownFlags, flagValue } from "../packages/worker-fleet/src/cli-flags.mjs";
import { sandboxGitEnv } from "./git-env.mjs";
// REUSED, NOT RE-DERIVED. `changedPackages` already exists, already extracts `packages/<name>` from a
// diff, and already has its own test (`changed-packages.test.ts`) proving it against real shapes (a
// rename, a deletion, a file directly under `packages/` with no subdirectory). Writing a second copy of
// `/^packages\/([^/]+)\//` here would be the exact defect this file's own header names.
import { changedPackages } from "./changed-packages.mjs";

/** Every top-level package directory this repo has, read once rather than hardcoded twice. */
export function knownPackages(repoRoot) {
  const pkg = JSON.parse(readFileSync(`${repoRoot}/package.json`, "utf8"));
  const patterns = pkg.workspaces ?? ["packages/*"];
  // This repo has exactly one workspace glob, `packages/*`; a second would need a real glob library.
  // `ci-changed.test.ts` asserts that shape holds against the real package.json, so a future second
  // workspace glob fails a unit test rather than silently only ever seeing the first entry.
  if (patterns.length !== 1 || patterns[0] !== "packages/*") {
    throw new Error(`ci-changed.mjs assumes a single "packages/*" workspace glob; package.json now says `
      + `${JSON.stringify(patterns)} — update knownPackages() before trusting this script's output`);
  }
  return execFileSync("git", ["ls-files", "packages"], { cwd: repoRoot, env: sandboxGitEnv(), encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    // A file tracked directly under `packages/` (`packages/README.md`) has only two path segments and is
    // not a package -- pre-existing and harmless as long as nothing tried to read `packages/<name>/
    // package.json` for every returned "name". `readWorkspaceDependencyGraph` is the first thing that
    // does, and crashed on exactly this (`ENOTDIR: not a directory, open './packages/README.md/
    // package.json'`) the first time it ran against the real repo. A real package always has at least
    // one file NESTED under its directory, so three-or-more segments is what distinguishes it.
    .filter((f) => f.split("/").length > 2)
    .map((f) => f.split("/")[1])
    .filter((name, index, all) => name && all.indexOf(name) === index)
    .sort();
}

/**
 * Every package directory's own workspace dependencies, as directory names -- not by convention (e.g.
 * assuming `@a11y-witness/<dir>`), because `packages/cli`'s own `package.json` name is the UNSCOPED
 * `"a11y-witness"`, and `packages/lab` genuinely depends on it. Each directory's real declared `name` is
 * read and used as the lookup key, so a future package with an unconventional name is still resolved
 * correctly rather than silently dropped from the graph.
 *
 * @param {string} repoRoot
 * @param {string[]} allPackages every package directory name
 * @returns {Record<string, string[]>} directory name -> the directory names of its workspace dependencies
 */
export function readWorkspaceDependencyGraph(repoRoot, allPackages) {
  const nameToDir = {};
  const manifests = {};
  for (const dir of allPackages) {
    const manifest = JSON.parse(readFileSync(`${repoRoot}/packages/${dir}/package.json`, "utf8"));
    nameToDir[manifest.name] = dir;
    manifests[dir] = manifest;
  }
  const graph = {};
  for (const dir of allPackages) {
    const deps = Object.keys({ ...manifests[dir].dependencies, ...manifests[dir].devDependencies });
    // `.filter(Boolean)`: a dependency outside this workspace (`@guidepup/guidepup`, `typescript`, ...)
    // has no entry in `nameToDir` and resolves to `undefined` -- not every declared dependency is a
    // workspace package, and only workspace packages belong in this graph.
    graph[dir] = deps.map((name) => nameToDir[name]).filter(Boolean);
  }
  return graph;
}

/**
 * The transitive closure of `changed` plus every package that depends on one, directly or through
 * another dependent -- e.g. `evidence` changing must also test `judge` (depends on `evidence`) AND `lab`
 * (depends on `judge`), not just the packages that import `evidence` directly.
 *
 * @param {string[]} changed
 * @param {Record<string, string[]>} dependencyGraph from `readWorkspaceDependencyGraph`
 * @returns {string[]} sorted, deduplicated
 */
export function dependentsOf(changed, dependencyGraph) {
  const reverse = {};
  for (const [pkg, deps] of Object.entries(dependencyGraph)) {
    for (const dep of deps) (reverse[dep] ??= new Set()).add(pkg);
  }
  const result = new Set(changed);
  const queue = [...changed];
  while (queue.length > 0) {
    const pkg = queue.pop();
    for (const dependent of reverse[pkg] ?? []) {
      if (!result.has(dependent)) {
        result.add(dependent);
        queue.push(dependent);
      }
    }
  }
  return [...result].sort();
}

/** Root-level files a change to which must be treated as "every TS/JS package changed". */
const ROOT_TS_FILES = new Set([
  "package.json", "package-lock.json", "tsconfig.json", "tsconfig.base.json",
  ".eslintrc.json", ".eslintrc.cjs", "eslint.config.js", "eslint.config.mjs",
]);

const DOC_ROOT_FILES = new Set(["README.md", "CLAUDE.md", "CONTRIBUTING.md", "SECURITY.md", "PLAN.md"]);

/**
 * Classify a list of repo-relative changed paths into which `ci.yml` jobs must run.
 *
 * @param {string[]} files
 * @param {string[]} allPackages every package directory name, for the "a root config file changed" case
 * @param {Record<string, string[]>} [dependencyGraph] from `readWorkspaceDependencyGraph`; defaults to
 *   empty, so `testPackages` degrades to exactly `packages` when no graph is supplied (every existing
 *   call site that predates `testPackages` keeps working unchanged)
 * @returns {{ ts: boolean, python: boolean, ansible: boolean, docs: boolean, board: boolean,
 *   changeset: boolean, rulesFitness: boolean, packages: string[], testPackages: string[] }}
 */
export function classify(files, allPackages, dependencyGraph = {}) {
  const rootTsChanged = files.some((f) => ROOT_TS_FILES.has(f));
  // BLUNT ON PURPOSE, matching `changedPackages`'s own stated philosophy: any file under `packages/<name>/`
  // — not only `.ts`/`.mjs`/`.json` under `src`/`bin` — marks that package touched. A second, narrower
  // definition of "touched" living beside the pre-push hook's is exactly the shape that drifts; the hook's
  // own tests already exercise renames, deletions and the no-subdirectory edge case for this function.
  const tsPackages = new Set(changedPackages(files.join("\n")));
  const rootScriptsChanged = files.some((f) => /^scripts\/.*\.mjs$/.test(f));
  // A root config file (tsconfig, eslint config, the workspace's own package.json) OR a `scripts/*.mjs`
  // file can change what EVERY package lints, typechecks or tests as — dozens of packaging tests import
  // `scripts/git-env.mjs`, `scripts/cli-flags.mjs` and their siblings directly, so a change there is not
  // scoped to any one package. Both are treated as touching every package rather than none, matching the
  // pre-push hook's own rule: an EMPTY touched-package result must read as "run everything", never as
  // "run nothing" (`scripts/git-hooks/pre-push`'s FAST/FULL split header states this for the identical
  // reason).
  if (rootTsChanged || rootScriptsChanged) for (const name of allPackages) tsPackages.add(name);

  // `requirements-ci.txt` is the CI subset; the lab's own full environment lives at
  // `packages/scorer/requirements.txt` (NOT a root `requirements.txt` — `python-ci-requirements.test.ts`
  // already pins the two equal at every shared constraint, so a change to either is a reason to re-run).
  const python = files.some((f) =>
    /^packages\/[^/]+\/(python|tests)\/.*\.py$/.test(f)
    || f === "requirements-ci.txt" || f === "packages/scorer/requirements.txt");

  const ansible = files.some((f) => f.startsWith("packages/control/ansible/"));

  const docsFiles = files.filter((f) => f.startsWith("docs/") || DOC_ROOT_FILES.has(f));
  // BOARD-ONLY, THE FIRST NAMED INSTANCE OF THIS SHAPE -- chairman's direction, 2026-09-06, the product
  // manager's single largest recurring cost that night. `docs/board/summaries/*.md` and
  // `docs/board/reported.json` are edited far more often than anything else under `docs/`, and every such
  // edit used to pay the full `docs` job (a build, then the whole `packages/lab/src/packaging/` directory)
  // for a change no rule outside the board guards could possibly react to. `board` is true, and `docs`
  // FALSE, only when EVERY doc-touching file in the diff is a board file -- mixing in any other doc means
  // the ordinary, wider `docs` job runs instead, because this file's own rule is "narrower than usual
  // needs its own argument", and a mixed diff has not made that argument.
  const board = docsFiles.length > 0 && docsFiles.every((f) =>
    f === "docs/board/reported.json" || /^docs\/board\/summaries\/.*\.md$/.test(f));
  const docs = docsFiles.length > 0 && !board;

  // The exact regex `changeset-check.yml` used before this file existed — kept identical rather than
  // "improved", because the set of published packages IS the decision and re-deriving it independently is
  // how the two copies would drift.
  const changeset = files.some((f) =>
    /^packages\/(cli|judge|scorer|evidence|nvda-worker|worker-fleet)\/(src|python|models|bin)\//.test(f));

  // NARROW ON PURPOSE, unlike every other category above -- chairman's direction, 2026-09-06. Coverage
  // and `gate:isolation` left the PR path entirely (release-time and nightly instead; see `ci.yml`'s and
  // `coverage.yml`'s own headers), and the rules fitness gate (`npm run rules-check`) is the one PR-time
  // check remaining that measures something repo-wide rather than a single package's own behaviour. It
  // reads fixtures scored against `packages/judge`'s rule engine over `packages/evidence`'s announcement
  // grammar, so those two are the only paths that can move its answer -- unlike `ts`, a root config or
  // `scripts/*.mjs` change does NOT imply this needs to re-run.
  const rulesFitness = files.some((f) => f.startsWith("packages/judge/") || f.startsWith("packages/evidence/"));

  const packages = [...tsPackages].sort();

  return {
    // `packages` (any file under a package dir) OR `scripts/*.mjs` OR a root config file -- the last two
    // touch nothing `changedPackages` can name, but still need `npm run lint`/`typecheck`, which are
    // whole-repo regardless of which package(s) end up in the scoped test run below.
    ts: rootTsChanged || rootScriptsChanged || tsPackages.size > 0,
    python,
    ansible,
    docs,
    board,
    changeset,
    rulesFitness,
    packages,
    // The transitive closure of dependents -- see `dependentsOf`'s own doc comment. When `packages` is
    // every known package already (a root config or scripts/*.mjs change), the closure is a no-op: every
    // dependent of every package is still every package.
    testPackages: dependentsOf(packages, dependencyGraph),
  };
}

function writeOutputs(result) {
  const outFile = process.env.GITHUB_OUTPUT;
  const lines = [
    `ts=${result.ts}`,
    `python=${result.python}`,
    `ansible=${result.ansible}`,
    `docs=${result.docs}`,
    `board=${result.board}`,
    `changeset=${result.changeset}`,
    `rulesFitness=${result.rulesFitness}`,
    `packages=${result.packages.join(" ")}`,
    `testPackages=${result.testPackages.join(" ")}`,
  ];
  if (!outFile) {
    // Not inside a GitHub Actions job — print rather than fail, so this is also runnable by hand.
    console.log(lines.join("\n"));
    return;
  }
  appendFileSync(outFile, `${lines.join("\n")}\n`);
}

async function main() {
  const KNOWN_FLAGS = ["--event", "--base", "--repo"];
  refuseUnknownFlags(KNOWN_FLAGS, { entry: import.meta.url, command: "ci-changed" });

  // `--event` stays a required, explicit flag rather than being dropped outright: a caller that types
  // `--event=push` today gets a clear refusal naming why, instead of silently falling through some
  // default — the same "an ignored flag runs the default and reports success" defect `cli-flags.mjs`
  // exists to prevent, one value along.
  const event = flagValue(process.argv, "event");
  if (event !== "pull_request") {
    console.error(`ci-changed: --event must be "pull_request", got ${JSON.stringify(event)}. `
      + "--event=push was removed: ci.yml has no push trigger left to call it from.");
    process.exit(2);
  }

  const repoRoot = flagValue(process.argv, "repo") ?? process.cwd();
  const packages = knownPackages(repoRoot);

  const base = flagValue(process.argv, "base");
  if (!base) {
    console.error("ci-changed: --base=<ref> is required for --event=pull_request");
    process.exit(2);
  }
  // Three dots: the PULL REQUEST's own diff, against the merge base rather than the base branch's tip —
  // the same operator `changeset-check.yml` already used, for the identical reason: two dots would
  // include every commit that landed on main since the branch was cut, which is not this PR's change.
  const files = execFileSync("git", ["diff", "--name-only", `${base}...HEAD`],
    { cwd: repoRoot, env: sandboxGitEnv(), encoding: "utf8" })
    .split("\n")
    .filter(Boolean);

  if (files.length === 0) {
    console.error(`ci-changed: "git diff --name-only ${base}...HEAD" returned nothing — either this PR is `
      + "empty, or --base is wrong. Refusing to report every job as unnecessary on the strength of a diff "
      + "that may simply have failed to run.");
    process.exit(2);
  }

  const dependencyGraph = readWorkspaceDependencyGraph(repoRoot, packages);
  writeOutputs(classify(files, packages, dependencyGraph));
}

// Only when invoked directly — importing `classify` for a test must not trigger a git subprocess.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
