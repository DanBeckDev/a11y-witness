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
//   node scripts/assert-glob-not-empty.mjs <glob...> [--min=N] --run [--test-concurrency=N]
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
import { pathToFileURL } from "node:url";
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

function main() {
  refuseUnknownFlags(["--min", "--run", "--test-concurrency"],
    { entry: import.meta.url, command: "node scripts/assert-glob-not-empty.mjs" });
  const patterns = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  if (!patterns.length) {
    process.stderr.write("assert-glob-not-empty: no glob pattern given -- nothing to check.\n");
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
  const args = ["tsx", "--test", ...(concurrency ? [`--test-concurrency=${concurrency}`] : []), ...patterns];
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
