#!/usr/bin/env node
// @ts-check
// command: pick only the test files that reference a changed file, narrower than package scoping
// A1B: THE PR `ts` JOB AND `trunk-guard` RAN THE SAME SUITE, TWICE, ON EVERY MERGE.
//
// Chairman, verbatim: "the trunk guard is running all of the unit tests. this takes just as long as the
// pr one. so we should change the pr unit tests to only run on the files changed for pr efficiency and
// ci efficiency." Measured: PR `ts` 83-155s, `trunk-guard` 144-155s -- close enough that the existing
// PACKAGE-level scoping (`ci-changed.mjs`'s `testPackages`, the transitive closure of dependent
// PACKAGES) was not narrowing much: a change to a package many others depend on already selects nearly
// every test in the repo at package granularity, even when only one FILE in it actually matters.
//
// THIS FILE NARROWS ONE STEP FURTHER, TO FILES: which TEST FILES actually reference -- directly, or
// through any number of other files -- a changed file. `ci-changed.mjs`'s package-level `testPackages` is
// still the SEARCH SCOPE and the SAFETY NET (unchanged): this only refines what runs WITHIN it.
//
// A1C: PACKAGE SOURCE WAS NEVER THE ONLY THING A TEST CAN DEPEND ON. A1b covered `packages/*/src/` by
// IMPORT and left everything else to a single `BROAD` fallback -- correct, but wide enough that the
// chairman opened a git-hook PR (#479, `scripts/git-hooks/pre-push`) expecting the narrow path and saw
// the full suite, because every conflict-fix row in flight that night was exactly this shape. Two more
// reference kinds are covered now, so `BROAD` narrows to what genuinely has no better answer:
//
//   `scripts/*.mjs`            BY IMPORT -- the SAME reverse index as packages/*/src/, since
//                              `sourceClosure`'s relative-import walk was never package-restricted; a
//                              test reaching `scripts/foo.mjs` via `../../../../scripts/foo.mjs` was
//                              already IN the index, just never looked up for a script's own changes.
//   hooks, workflow files      BY PATH STRING -- `scripts/git-hooks/pre-push` has no extension a module
//   (other than ci.yml)        resolver would ever touch, and `.github/workflows/*.yml` is never
//                              `import`ed, so no walk can reach them. `pathStringReferences` searches
//                              comment-stripped test source for the changed file's path inside a real
//                              quoted literal -- never a bare substring match against the WHOLE file,
//                              which would also fire on a doc comment merely discussing the path (this
//                              repo's own `` `scripts/foo.mjs` `` markdown convention). A test that
//                              DISCUSSES a file is not a test that exercises it.
//
// `BROAD` now applies to exactly two things: `.github/workflows/ci.yml` itself (a job definition can
// affect anything the job runs) and `ci-changed.mjs`'s own `ROOT_TS_FILES` (a root config or lockfile
// change that touches how everything builds). Reused from there rather than a second hand-typed list --
// this file's own most-repeated lesson, one row up.
//
// THE ZERO-TESTS FALLBACK IS THE LOAD-BEARING HALF, not the narrowing. "Run only what changed" is the
// easy half; "notice when that set is empty and say so" is what stops this shipping as a job that passes
// having run nothing -- CLAUDE.md's own most-recorded defect, and this is the job that gates every PR. A
// changed `packages/*/src/` file no test's import closure reaches falls back to ITS OWN PACKAGE's full
// suite; a changed `scripts/*.mjs` or hook/workflow file with no reference anywhere falls back to EVERY
// implicated package's full suite (there is no "its own package" for a file outside `packages/`) --
// either way, named, never silent.
//
// THE WALK MUST BE TRANSITIVE OR THE ROW IS WORSE THAN USELESS. A source file with no test of its own,
// imported by a test three hops away, must still select that test -- `sourceClosure` below walks the
// full reachable set from each test file, not one level of its own imports.
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { stripComments } from "@a11ign/evidence/source-text";
import { refuseUnknownFlags, flagValue } from "../packages/worker-fleet/src/cli-flags.mjs";
import { sandboxGitEnv } from "./git-env.mjs";
import { knownPackages, readWorkspaceDependencyGraph, classify, ROOT_TS_FILES } from "./ci-changed.mjs";

/**
 * `import ... from "<spec>"` specifiers, in source order -- identical regex to
 * `pre-install-import-graph.test.ts`'s `specifiersOf`, which this repo already relies on to find every
 * import a script or test carries, `from` included as optional for a bare `import "./side-effect.mjs"`.
 * @param {string} source
 * @returns {string[]}
 */
function specifiersOf(source) {
  return [...source.matchAll(/\bimport\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g)].map((m) => m[1]);
}

/**
 * Every `@a11ign/*` (and the unscoped `a11ign`) package's own name -> { dir, exportsMap }, so a bare
 * workspace specifier can be resolved back to a SOURCE file rather than the `dist/*.js` its own
 * `exports` field actually points a real Node resolution at -- this walk answers "what does a test
 * import", which for a workspace package means its SOURCE, not its build output.
 * @param {string} repoRoot
 * @param {string[]} packageDirs
 * @returns {Map<string, { dir: string, exportsMap: Record<string, unknown> }>}
 */
function packageIndex(repoRoot, packageDirs) {
  const index = new Map();
  for (const dir of packageDirs) {
    const manifest = JSON.parse(readFileSync(join(repoRoot, "packages", dir, "package.json"), "utf8"));
    index.set(manifest.name, { dir, exportsMap: manifest.exports ?? {} });
  }
  return index;
}

/**
 * The literal export target string for one subpath -- `exports` values are either a bare string
 * (`nvda-worker`'s no-build-step packages, ADR 0031) or `{types, default}` (every `tsc --build` package),
 * and only `default` is ever a real runtime resolution target.
 * @param {unknown} value
 * @returns {string | null}
 */
function exportTarget(value) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && typeof (/** @type {any} */ (value)).default === "string") {
    return /** @type {any} */ (value).default;
  }
  return null;
}

/**
 * One `dist/*.js` (or `dist/*.d.ts`) export target back to its SOURCE counterpart, mirroring
 * `candidatePackedPaths`'s inverse in `ci-changed.mjs`: every `tsc --build` package here uses
 * `rootDir: src`, `outDir: dist`, so `dist/foo.js` is built from `src/foo.ts`. A package shipping `src`
 * RAW (`nvda-worker`) has no `dist/` in its own targets at all, so the swap is a no-op and the literal
 * target -- already a real source file -- is tried as-is.
 * @param {string} target relative to the package root, e.g. "./dist/wcag.js"
 * @returns {string[]} candidate paths, relative to the package root, most-likely first
 */
function sourceCandidatesForExportTarget(target) {
  const stripped = target.replace(/^\.\//, "");
  const distMatch = /^dist\/(.*)\.(js|d\.ts|mjs)$/.exec(stripped);
  if (distMatch) return [`src/${distMatch[1]}.ts`, `src/${distMatch[1]}.tsx`, `src/${distMatch[1]}.mjs`];
  return [stripped];
}

/**
 * One RELATIVE specifier, from the file that imported it, to a real file on disk -- same shape as
 * `pre-install-import-graph.test.ts`'s `importGraph`, extended for `.ts` source: this repo's `.ts` files
 * import each other with the COMPILED `.js` extension (NodeNext-style TypeScript), so `./foo.js` from a
 * `.ts` file must resolve to the SOURCE `./foo.ts` that produces it, not a `dist/foo.js` that may not
 * exist yet on an unbuilt tree.
 * @param {string} spec
 * @param {string} fromFile absolute path
 * @returns {string | null} absolute path, or null if nothing on disk matches any candidate
 */
function resolveRelative(spec, fromFile) {
  const base = resolve(dirname(fromFile), spec);
  const jsMatch = /^(.*)\.(js|mjs|cjs)$/.exec(spec);
  const candidates = jsMatch
    ? [base, `${base.slice(0, -jsMatch[2].length - 1)}.ts`, `${base.slice(0, -jsMatch[2].length - 1)}.tsx`]
    : [base, `${base}.ts`, `${base}.mjs`, `${base}/index.ts`];
  return candidates.find((c) => existsSync(c)) ?? null;
}

/**
 * One BARE `@a11ign/*` (or unscoped `a11ign`) specifier, with an optional subpath, to a source file --
 * `.` for the package root, `./x` for `exports["./x"]`. Any other bare specifier (a real npm dependency)
 * is not a workspace file and returns null.
 * @param {string} spec
 * @param {string} repoRoot
 * @param {Map<string, { dir: string, exportsMap: Record<string, unknown> }>} packages
 * @returns {string | null} absolute path
 */
function resolveWorkspacePackage(spec, repoRoot, packages) {
  const scopedMatch = /^(@[^/]+\/[^/]+)(\/.*)?$/.exec(spec);
  const pkgName = scopedMatch ? scopedMatch[1] : /^([^/@][^/]*)(\/.*)?$/.exec(spec)?.[1];
  const subpath = scopedMatch ? scopedMatch[2] : /^([^/@][^/]*)(\/.*)?$/.exec(spec)?.[2];
  const entry = pkgName ? packages.get(pkgName) : undefined;
  if (!entry) return null;
  const { dir, exportsMap } = entry;
  const key = subpath ? `.${subpath}` : ".";
  const target = exportTarget(exportsMap[key]);
  if (!target) return null;
  const pkgRoot = join(repoRoot, "packages", dir);
  for (const candidate of sourceCandidatesForExportTarget(target)) {
    const abs = join(pkgRoot, candidate);
    if (existsSync(abs)) return abs;
  }
  return null;
}

/**
 * Everything reachable from `entryFile` by relative import or workspace-package specifier, transitively
 * -- the reverse of what `ci-changed.mjs`'s own header calls the point of ITS second pass: that file asks
 * "who depends on this PACKAGE"; this asks "which SOURCE FILES does this one TEST FILE actually reach",
 * so a change to any of them is a reason to run it.
 *
 * @param {string} entryFile absolute path
 * @param {string} repoRoot
 * @param {Map<string, { dir: string, exportsMap: Record<string, unknown> }>} packages
 * @returns {Set<string>} absolute paths, entry included
 */
export function sourceClosure(entryFile, repoRoot, packages) {
  const seen = new Set();
  const queue = [entryFile];
  while (queue.length > 0) {
    const file = /** @type {string} */ (queue.pop());
    if (seen.has(file) || !existsSync(file)) continue;
    seen.add(file);
    for (const spec of specifiersOf(readFileSync(file, "utf8"))) {
      if (spec.startsWith("node:")) continue;
      const resolved = spec.startsWith(".")
        ? resolveRelative(spec, file)
        : resolveWorkspacePackage(spec, repoRoot, packages);
      if (resolved && !seen.has(resolved)) queue.push(resolved);
    }
  }
  return seen;
}

/**
 * Every test file this repo's `ts` job would ever glob, for the given packages only -- the SAME pattern
 * `ci.yml`'s own step and `testDependencyMap` in `ci-changed.mjs` already use
 * (`packages/<pkg>/src/**\/*.test.ts`), so this can never select a file the shell glob it drives would not
 * also have matched.
 * @param {string} repoRoot
 * @param {string[]} pkgDirs
 * @returns {string[]} repo-relative paths
 */
export function discoverTestFiles(repoRoot, pkgDirs) {
  const dirSet = new Set(pkgDirs);
  return execFileSync("git", ["ls-files", "packages"], { cwd: repoRoot, env: sandboxGitEnv(), encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    .filter((f) => {
      const m = /^packages\/([^/]+)\/src\/.*\.test\.ts$/.exec(f);
      return m !== null && dirSet.has(m[1]);
    });
}

// #A1c: `.github/workflows/ci.yml` itself -- a job definition can affect anything the job runs, so
// narrowing it would mean reasoning about what the CHANGE to the job does, not what it touches.
const BROAD_ALWAYS = new Set([".github/workflows/ci.yml"]);

/**
 * A changed file with genuinely NO better answer than `ci-changed.mjs`'s existing, coarser
 * "touching every implicated package" rule: `.github/workflows/ci.yml` itself, or one of `ROOT_TS_FILES`
 * (a root config or lockfile change that touches how everything builds). Reused, not re-typed -- see this
 * file's own header for why a second hand-written list is the mistake to avoid here specifically.
 *
 * Everything else outside `packages/*\/src/` (a `scripts/*.mjs` file, a hook, a non-`ci.yml` workflow) is
 * NOT broad any more -- `selectTests` below covers it by reference instead.
 * @param {string[]} changedFiles
 * @returns {string[]} the files responsible, for the caller to report
 */
export function broadReasons(changedFiles) {
  return changedFiles.filter((f) => BROAD_ALWAYS.has(f) || ROOT_TS_FILES.has(f));
}

/**
 * Every quoted string literal's CONTENT in `source` -- single-, double- or backtick-delimited. Coarse
 * rather than a real tokenizer (an escaped quote inside one literal is not unescaped), which is fine for
 * this file's one question: does SOME literal mention this path, never what the literal's exact runtime
 * value would be.
 * @param {string} source
 * @returns {string[]}
 */
function quotedLiterals(source) {
  return [...source.matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)]
    .map((m) => m[1] ?? m[2] ?? m[3]);
}

/**
 * Which of `testFiles` reference `changedFile` BY PATH STRING -- for a hook or workflow file no `import`
 * can ever name. COMMENTS ARE STRIPPED FIRST (`@a11ign/evidence/source-text`'s `stripComments`, the same
 * tool A2's `command-line-census.mjs` already uses), so a doc comment that MENTIONS a path in prose --
 * this repo's own `` `scripts/foo.mjs` `` markdown convention, never a real JS string literal -- cannot
 * be mistaken for a test that actually exercises it. A test that DISCUSSES a file is not a test that
 * reads or runs it, and collapsing the two is exactly the heading-collision shape #446 is open about.
 * @param {string} changedFile repo-relative
 * @param {string[]} testFiles repo-relative
 * @param {string} repoRoot
 * @returns {string[]}
 */
export function pathStringReferences(changedFile, testFiles, repoRoot) {
  const found = [];
  for (const testFile of testFiles) {
    const source = stripComments(readFileSync(join(repoRoot, testFile), "utf8"));
    if (quotedLiterals(source).some((lit) => lit.includes(changedFile))) found.push(testFile);
  }
  return found;
}

/**
 * The reverse index ONCE: source file (repo-relative) -> every test file that reaches it. Never
 * restricted to `packages/*\/src/` -- a test reaching `scripts/foo.mjs` via a relative import was already
 * in here; #A1c is the first place anything LOOKS it up for a script's own changes.
 * @param {string[]} testFiles
 * @param {(testFile: string) => Set<string>} closureOf
 * @param {string} repoRoot
 * @returns {Map<string, Set<string>>}
 */
function buildReverseIndex(testFiles, closureOf, repoRoot) {
  /** @type {Map<string, Set<string>>} */
  const reverse = new Map();
  for (const testFile of testFiles) {
    for (const abs of closureOf(testFile)) {
      const rel = relative(repoRoot, abs);
      if (!reverse.has(rel)) reverse.set(rel, new Set());
      /** @type {Set<string>} */ (reverse.get(rel)).add(testFile);
    }
  }
  return reverse;
}

/**
 * One changed file's verdict: which tests select it (possibly the file itself, if it IS a test), or an
 * empty selection naming which package(s) the caller must fall back to instead. Never both empty and
 * silent -- see `selectTests`'s own header for why that is the rule this whole row exists to keep.
 *
 * @param {string} file repo-relative
 * @param {{ reverse: Map<string, Set<string>>, testFiles: string[], testPackages: string[],
 *   referencesPath: (file: string, testFiles: string[]) => string[] }} ctx
 * @returns {{ selectedBy: string[], fallbackPackages: string[] }}
 */
function classifyOneFile(file, ctx) {
  if (/^packages\/([^/]+)\/src\/.*\.test\.ts$/.test(file)) return { selectedBy: [file], fallbackPackages: [] };

  const pkgMatch = /^packages\/([^/]+)\/src\/.*$/.exec(file);
  if (pkgMatch) {
    const reachedBy = [...(ctx.reverse.get(file) ?? [])];
    return reachedBy.length > 0
      ? { selectedBy: reachedBy, fallbackPackages: [] }
      : { selectedBy: [], fallbackPackages: [pkgMatch[1]] };
  }

  // #A1c: `scripts/*.mjs` -- BY IMPORT, the SAME reverse index every `packages/*\/src/` lookup uses.
  if (/^scripts\/.*\.mjs$/.test(file)) {
    const reachedBy = [...(ctx.reverse.get(file) ?? [])];
    return reachedBy.length > 0
      ? { selectedBy: reachedBy, fallbackPackages: [] }
      // No "own package" for a file outside packages/ -- every implicated package is the honest fallback.
      : { selectedBy: [], fallbackPackages: ctx.testPackages };
  }

  // #A1c: anything else non-package, non-broad (a hook, a non-ci.yml workflow) -- BY PATH STRING.
  const referencedBy = ctx.referencesPath(file, ctx.testFiles);
  return referencedBy.length > 0
    ? { selectedBy: referencedBy, fallbackPackages: [] }
    : { selectedBy: [], fallbackPackages: ctx.testPackages };
}

/**
 * THE SELECTION -- pure, given the diff and a pre-built reverse index (constructed once, real disk reads
 * bounded to the touched packages' own test files, never the whole repo).
 *
 * THE ZERO-TESTS FALLBACK IS THE LOAD-BEARING HALF, not the narrowing (see this file's own top-of-file
 * header). Every branch in `classifyOneFile` returns SOME fallback package the instant it finds no
 * selecting test, and this function's own job is to never lose that signal on the way to the output.
 *
 * @param {string[]} changedFiles repo-relative
 * @param {{ closureOf: (testFile: string) => Set<string>, testFiles: string[], repoRoot: string,
 *   testPackages?: string[], referencesPath?: (file: string, testFiles: string[]) => string[] }} options
 *   `closureOf` -- injected so the caller builds it once per test file rather than this function
 *   re-walking the same test file once per changed source line. `testFiles` -- every candidate test file
 *   (repo-relative), the population `closureOf` and `referencesPath` may report against. `testPackages`
 *   -- every implicated package (from `ci-changed.mjs`'s `classify`), the fallback target for a
 *   `scripts/*.mjs` or hook/workflow file with no reference anywhere; defaults to `[]` so an existing
 *   caller testing only `packages/*\/src/` files is unaffected. `referencesPath` -- injected the same way
 *   `closureOf` is, so a unit test never touches disk unless it deliberately wants to; defaults to the
 *   real `pathStringReferences`.
 * @returns {{ selectedTests: string[], fallbackPackages: string[], uncoveredFiles: string[] }}
 */
export function selectTests(changedFiles, options) {
  const { closureOf, testFiles, repoRoot, testPackages = [],
    referencesPath = (file, candidates) => pathStringReferences(file, candidates, repoRoot) } = options;
  const reverse = buildReverseIndex(testFiles, closureOf, repoRoot);

  const selected = new Set();
  const fallbackPackages = new Set();
  /** @type {string[]} */
  const uncoveredFiles = [];
  for (const file of changedFiles) {
    const verdict = classifyOneFile(file, { reverse, testFiles, testPackages, referencesPath });
    for (const t of verdict.selectedBy) selected.add(t);
    if (verdict.selectedBy.length === 0) {
      for (const pkg of verdict.fallbackPackages) fallbackPackages.add(pkg);
      uncoveredFiles.push(file);
    }
  }
  return { selectedTests: [...selected].sort(), fallbackPackages: [...fallbackPackages].sort(), uncoveredFiles };
}

/** @param {{ selectedTests: string[], fallbackPackages: string[], uncoveredFiles: string[], broad: string[] }} result */
function writeOutputs(result) {
  const globsForFallback = result.fallbackPackages.map((p) => `packages/${p}/src/**/*.test.ts`);
  const testFiles = result.broad.length > 0 ? [] : [...result.selectedTests, ...globsForFallback];
  const count = result.broad.length > 0 ? -1 : result.selectedTests.length;
  const outFile = process.env.GITHUB_OUTPUT;
  const lines = [
    `testFiles=${testFiles.join(" ")}`,
    `selectedCount=${count}`,
    `fallbackPackages=${result.fallbackPackages.join(" ")}`,
    `broad=${result.broad.length > 0}`,
  ];
  console.log(`select-changed-tests: ${result.broad.length > 0
    ? `BROAD -- ${result.broad.length} file(s) outside the by-reference search (ci.yml itself or a root `
      + `config): (${result.broad.slice(0, 5).join(", ")}${result.broad.length > 5 ? ", ..." : ""}), `
      + "falling back to ci-changed.mjs's existing package-level scope"
    : `${result.selectedTests.length} test file(s) selected precisely` + (result.fallbackPackages.length > 0
      ? `, plus the full suite of ${result.fallbackPackages.length} package(s) with an uncovered change `
        + `(${result.uncoveredFiles.join(", ")})`
      : "")}`);
  if (!outFile) { console.log(lines.join("\n")); return; }
  appendFileSync(outFile, `${lines.join("\n")}\n`);
}

async function main() {
  refuseUnknownFlags(["--base", "--repo"], { entry: import.meta.url, command: "select-changed-tests" });
  const repoRoot = flagValue(process.argv, "repo") ?? process.cwd();
  const base = flagValue(process.argv, "base");
  if (!base || base.endsWith("/")) {
    console.error(`select-changed-tests: --base=${JSON.stringify(base)} is empty or a bare prefix -- `
      + "same shape ci-changed.mjs refuses, for the identical reason.");
    process.exit(2);
  }
  const files = execFileSync("git", ["diff", "--name-only", `${base}...HEAD`],
    { cwd: repoRoot, env: sandboxGitEnv(), encoding: "utf8" }).split("\n").filter(Boolean);
  if (files.length === 0) {
    console.error(`select-changed-tests: "git diff --name-only ${base}...HEAD" returned nothing.`);
    process.exit(2);
  }

  const allPackages = knownPackages(repoRoot);
  const depGraph = readWorkspaceDependencyGraph(repoRoot, allPackages);
  const { testPackages } = classify(files, allPackages, depGraph, { repoRoot });
  const broad = broadReasons(files);

  if (broad.length > 0) {
    writeOutputs({ selectedTests: [], fallbackPackages: testPackages, uncoveredFiles: [], broad });
    return;
  }

  const packages = packageIndex(repoRoot, allPackages);
  const testFiles = discoverTestFiles(repoRoot, testPackages);
  const closureOf = (/** @type {string} */ testFile) =>
    sourceClosure(join(repoRoot, testFile), repoRoot, packages);
  const result = selectTests(files, { closureOf, testFiles, repoRoot, testPackages });
  writeOutputs({ ...result, broad: [] });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
