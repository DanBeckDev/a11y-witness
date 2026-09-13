#!/usr/bin/env node
// @ts-check
// command: refuse a test glob that resolves to zero files instead of passing silently
// `npm test` PASSES, exit 0, if the glob it hands to `tsx --test` resolves to zero files (#355) --
//
//   $ npx tsx --test "packages/lab/src/packaging/nothing-matches-*.test.ts"; echo "EXIT=$?"
//   EXIT=0    ℹ tests 0  ℹ pass 0  ℹ fail 0
//
// A LITERAL missing path fails correctly (`tsx --test` errors "Could not find ..."); a QUOTED GLOB that
// matches nothing is globbed by the runner itself and reported as a clean, empty pass -- which is exactly
// the form `test:ts` and `pre-push` both use, because an unquoted glob would otherwise be expanded by the
// shell before either script sees it, and `zsh` errors on no match while `bash` (CI's shell) passes the
// literal pattern straight through unexpanded.
//
// EVERY VACUITY GUARD THIS REPO HAS IS INSIDE A FILE THE GLOB WOULD HAVE LOADED. A guard cannot fire from
// inside the thing that failed to load -- the same shape as a diagnostic that cannot report itself. So
// this floor has to live OUTSIDE the suite: a plain script, run BEFORE `tsx --test` is ever invoked,
// never another `*.test.ts` (that is the defect this row exists to end, one level further in).
//
//   node scripts/assert-glob-not-empty.mjs <glob...> [--min=N]                 -- check only
//   node scripts/assert-glob-not-empty.mjs <glob...> [--min=N] --run [--runner=tsx|rstest] [--test-concurrency=N]
//
// Each glob given is resolved independently and must match at least `--min` files (default 1 -- "not
// vacuous", never "exactly this many"). A directory rename, a package restructure, or #66's tree-wide
// rename to `a11ign` breaking a path glob is exactly the ordinary change this is built to catch, on the
// day it happens rather than as a silent, green no-op.
//
// `--run` EXECUTES `tsx --test` on the SAME `<glob...>` ARGV THIS PROCESS PARSED, rather than checking one
// copy of the pattern and leaving the caller to write a second copy for the real invocation. A `--run`-less
// version of this shipped first and looked complete: `test:ts` read
// `npm run test:glob-check && tsx --test "<pattern>"`, the SAME literal typed twice in one JSON string.
// Mutating ONLY the second copy -- exactly the shape of an ordinary future edit, someone widening the real
// glob and not noticing the separate check line -- passed `test:glob-check` (which still validated the
// FIRST, unmutated copy) and then silently zero-test-passed the actual suite, reproducing #355 through the
// fix meant to close it. "A fact stated twice" (this file's own CLAUDE.md section) applies to a shell
// command's own argv, not only to prose. `--run` makes the two uses of the pattern the same JS array.
import { globSync, realpathSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { refuseUnknownFlags, flagValue } from "@a11ign/worker-fleet/cli-flags";
import { npmCliInvocation } from "./npm-cli-executable.mjs";

/**
 * Pure: which of the given globs resolved to fewer than `min` files, and how many each actually matched.
 * @param {string[]} patterns
 * @param {number} min
 * @param {(pattern: string) => string[]} [glob]
 * @returns {{ pattern: string, matched: number }[]}
 */
export function underFloor(patterns, min, glob = globSync) {
  return patterns
    .map((pattern) => ({ pattern, matched: glob(pattern).length }))
    .filter(({ matched }) => matched < min);
}

/** #1319: the runners `--run` can execute. `tsx` is the default, so a caller that names none is unchanged. */
export const RUNNERS = Object.freeze(["tsx", "rstest"]);

/** #1319: the rstest config every rstest run uses, resolved from this file so the caller's cwd cannot change it. */
export const RSTEST_CONFIG = fileURLToPath(new URL("./rstest/rstest.config.mjs", import.meta.url));

/**
 * #1319: THE COMMAND `--run` EXECUTES, PURE, so the runner switch is pinned by a test rather than read off a spawn.
 *
 * `tsx` stays the default: `test:nightly` and c8's `coverage` still run node:test through it until step 4 of the rstest
 * adoption (#1320) moves coverage. `test:ts` and CI's scoped step ask for `rstest`.
 *
 * EACH PATTERN GOES TO RSTEST AS ITS OWN `--include`, NEVER AS A POSITIONAL ARGUMENT. A positional argument is a
 * filter matched inside the config's include: measured at `9c12a0f5`, the bare word `region-paths` selected
 * `region-paths.test.ts`. `--include` replaces the include with exactly these patterns, which is what a list of
 * selected files needs, and a pattern outside the config's include still runs (measured on `packages/*` + `/nightly`).
 * `--test-concurrency` maps to rstest's worker count, the nearest equivalent of node:test's file concurrency.
 * @param {{ runner: string, patterns: string[], concurrency?: string }} request
 * @returns {string[]} the arguments for `npx`
 */
export function runnerInvocation({ runner, patterns, concurrency }) {
  if (runner === "tsx") {
    return ["tsx", "--test", ...(concurrency ? [`--test-concurrency=${concurrency}`] : []), ...patterns];
  }
  if (runner === "rstest") {
    return ["rstest", "run", "--config", RSTEST_CONFIG, ...(concurrency ? [`--pool.maxWorkers=${concurrency}`] : []),
      ...patterns.flatMap((pattern) => ["--include", pattern])];
  }
  throw new Error(`assert-glob-not-empty: --runner=${runner} is not a runner this script knows `
    + `(${RUNNERS.join(", ")}) -- refusing to guess which one to run.`);
}

function main() {
  refuseUnknownFlags(["--min", "--run", "--runner", "--test-concurrency"],
    { entry: import.meta.url, command: "node scripts/assert-glob-not-empty.mjs" });
  const patterns = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  if (!patterns.length) {
    process.stderr.write("assert-glob-not-empty: no glob pattern given -- nothing to check.\n");
    process.exitCode = 2;
    return;
  }
  const runner = flagValue(process.argv, "runner") ?? "tsx";
  if (!RUNNERS.includes(runner)) {
    process.stderr.write(`assert-glob-not-empty: --runner=${runner} is not a runner this script knows `
      + `(${RUNNERS.join(", ")}) -- refusing to guess which one to run.\n`);
    process.exitCode = 2;
    return;
  }
  const min = Number(flagValue(process.argv, "min") ?? "1");
  const offenders = underFloor(patterns, min);
  if (offenders.length) {
    process.stderr.write("REFUSING: a test glob matched too few files, which is indistinguishable from a "
      + "typo'd or moved path -- `tsx --test` reports a zero-match glob as a clean, empty PASS, never an "
      + "error, so this is the only place that failure can be caught:\n");
    for (const { pattern, matched } of offenders) {
      process.stderr.write(`  ${pattern}  matched ${matched}, need at least ${min}\n`);
    }
    process.exitCode = 1;
    return;
  }
  if (!process.argv.includes("--run")) return;
  // The SAME `patterns` array just proven non-vacuous -- not a second copy re-typed by the caller.
  const concurrency = flagValue(process.argv, "test-concurrency");
  const args = runnerInvocation({ runner, patterns, concurrency });
  // `NODE_TEST_CONTEXT=child-v8` is how Node's OWN test runner marks a process as a subtest reporting to a
  // parent harness, and it is set in THIS process's env whenever something here is itself invoked from
  // inside `node --test` (this script's own test suite does exactly that, exercising `--run` end to end).
  // Inherited by a plain env-passthrough spawn, it makes the CHILD `tsx --test` believe it too is a
  // subtest -- it changes its TAP behaviour and stops setting its own exit code on failure, so a real
  // test failure underneath `--run` silently reported exit 0. Stripped here so `--run`'s child is always a
  // normal, top-level test run regardless of what process happened to launch this script.
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const npx = npmCliInvocation("npx", args);
  const result = spawnSync(npx.command, npx.args, { stdio: "inherit", env });
  process.exitCode = result.status ?? 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) {
  main();
}
