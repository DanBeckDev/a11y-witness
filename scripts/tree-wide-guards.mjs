#!/usr/bin/env node
// @ts-check
// command: every tracked *.test.ts file that DECLARES ITSELF a TREE-WIDE GUARD by importing and calling
// `scripts/tree-wide-guard.mjs`'s marker -- a guard whose population is the whole repository rather than
// one file, so its own green run on a PR's diff is not a prediction: #704. #716 measured 21 such files at
// 141.3s together and made five of them (138 of the 141) fast, so the pre-push hook can run every one of
// them with no exclusion list.
//
// IMPORT-BASED, never a grep -- ceo's ruling 2026-09-09, after a comment-aware text-grep for "ls-files"
// (this file's own first version) still counted as "a test deriving its expectations from source TEXT",
// this repo's own most-repeated defect shape. `localImports` (`local-import-closure.mjs`, #621/B8) parses
// real ES import statements, comment-stripped -- the same discipline that lets B8 derive a test's
// requirements from its import closure rather than scanning it for a keyword a future guard might not
// happen to spell. See `tree-wide-guard.mjs`'s own header for why the check is IMPORT AND CALL, never the
// import alone.
//
//   node scripts/tree-wide-guards.mjs                    one path per line, for `npm run guards:sweep`
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { sandboxGitEnv } from "./git-env.mjs";
import { localImports, stripComments } from "./local-import-closure.mjs";
import { refuseUnknownFlags } from "../packages/worker-fleet/src/cli-flags.mjs";

/** Exported so the discovery's own test can construct a fixture that genuinely resolves to this module,
 *  rather than guessing at the path a real `localImports` call would compute. */
export const MARKER_MODULE = resolve(new URL(".", import.meta.url).pathname, "tree-wide-guard.mjs");
/** Imported is not used -- the same distinction `git-spawn-classification.test.ts`'s own
 *  `usesCanonicalHelper` draws for the identical reason (a canonical helper pulled in and never called). */
const CALLS_MARKER = /\bdeclareTreeWideGuard\(/;

/** @type {() => string} */
const defaultLsFiles = () =>
  execFileSync("git", ["ls-files", "*.test.ts"], { encoding: "utf8", env: sandboxGitEnv() });

/**
 * Every tracked `*.test.ts` file that IMPORTS `tree-wide-guard.mjs`'s marker AND calls it -- a guard
 * declares its own membership; the population is a fact the tree computes from the import graph, never a
 * text pattern a guard's own source might or might not happen to contain.
 *
 * @param {{ lsFiles?: typeof defaultLsFiles, readFile?: (path: string) => string,
 *           imports?: typeof localImports }} [deps]
 * @returns {string[]}
 */
export function treeWideGuardFiles(
  { lsFiles = defaultLsFiles, readFile = (p) => readFileSync(p, "utf8"), imports = localImports } = {},
) {
  const tracked = lsFiles().split("\n").filter(Boolean);
  return tracked
    .filter((path) => imports(path).includes(MARKER_MODULE) && CALLS_MARKER.test(stripComments(readFile(path))))
    .sort();
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) {
  refuseUnknownFlags([], { entry: import.meta.url, command: "node scripts/tree-wide-guards.mjs" });
  for (const file of treeWideGuardFiles()) process.stdout.write(`${file}\n`);
}
