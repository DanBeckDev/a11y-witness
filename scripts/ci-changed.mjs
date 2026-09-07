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
// `classify` is PURE — a file list in, five booleans and a package list out — so the categories are
// testable without a checkout, a diff, or a runner, and a category that stops matching anything is a red
// unit test rather than a silent CI budget regression. The CLI wrapper is the only impure part: it reads
// `git diff --name-only` against the PR's base.
//
// PULL_REQUEST ONLY, DELIBERATELY -- chairman's direction, 2026-09-06. This file used to also support
// `--event=push`, unconditionally reporting every category true for a push straight to `main`; `ci.yml`
// no longer HAS a push trigger at all (a check that runs after a merge cannot stop it), so that mode had
// no caller left and was removed rather than kept as an unused, untested escape hatch. Every check now
// runs on the PR, before the merge; branch protection (checks green AND up to date with `main`) is what
// makes the tested commit the one that lands.
import { execFileSync } from "node:child_process";
import { readFileSync, appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
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
    .map((f) => f.split("/")[1])
    .filter((name, index, all) => name && all.indexOf(name) === index)
    .sort();
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
 * @returns {{ ts: boolean, python: boolean, ansible: boolean, docs: boolean, changeset: boolean, packages: string[] }}
 */
export function classify(files, allPackages) {
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

  const docs = files.some((f) => f.startsWith("docs/") || DOC_ROOT_FILES.has(f));

  // The exact regex `changeset-check.yml` used before this file existed — kept identical rather than
  // "improved", because the set of published packages IS the decision and re-deriving it independently is
  // how the two copies would drift.
  // A TRIGGER, NOT THE GATE, and the distinction is deliberate rather than a shortcut.
  //
  // This asks where a file LIVES, which is answerable from a path list with no npm, no install and no
  // build -- exactly what this pure function is for. It is over-inclusive on purpose: it fires for a
  // `.test.ts` that npm never packs.
  //
  // `scripts/consumer-visible.mjs` decides the PR, by asking `npm pack --dry-run --json` which files are
  // actually in each tarball and which sources build into one. That needs an install and a build, so it
  // runs INSIDE the changeset job rather than here. Splitting them means the cheap question gates the
  // expensive one instead of standing in for it -- see #132, where this regex alone refused three PRs in
  // one night over test files, and the prescribed escape (`changeset add --empty`) is the very silence
  // the gate exists to prevent.
  const changeset = files.some((f) =>
    /^packages\/(cli|judge|scorer|evidence|nvda-worker|worker-fleet)\/(src|python|models|bin)\//.test(f));

  return {
    // `packages` (any file under a package dir) OR `scripts/*.mjs` OR a root config file -- the last two
    // touch nothing `changedPackages` can name, but still need `npm run lint`/`typecheck`, which are
    // whole-repo regardless of which package(s) end up in the scoped test run below.
    ts: rootTsChanged || rootScriptsChanged || tsPackages.size > 0,
    python,
    ansible,
    docs,
    changeset,
    packages: [...tsPackages].sort(),
  };
}

function writeOutputs(result) {
  const outFile = process.env.GITHUB_OUTPUT;
  const lines = [
    `ts=${result.ts}`,
    `python=${result.python}`,
    `ansible=${result.ansible}`,
    `docs=${result.docs}`,
    `changeset=${result.changeset}`,
    `packages=${result.packages.join(" ")}`,
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

  writeOutputs(classify(files, packages));
}

// Only when invoked directly — importing `classify` for a test must not trigger a git subprocess.
//
// `pathToFileURL`, not a template literal. Concatenation does not percent-encode, so a checkout under a
// path containing a SPACE compares false, the guard never fires, and this exits 0 having classified
// nothing — which a workflow reads as a clean run. `entry-points.test.ts` forbids the concatenated form
// and could not see this file, because it discovers entry points from `package.json` and `ci.yml` invokes
// this one with `node` directly. Fixed in passing; the discovery gap is its own row.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
