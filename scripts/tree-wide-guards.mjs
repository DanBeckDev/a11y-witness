#!/usr/bin/env node
// @ts-check
// command: every tracked *.test.ts file that itself spawns `git ls-files` -- a TREE-WIDE GUARD, whose
// population is the whole repository rather than one file, and therefore whose own green run on a PR's
// diff is not a prediction: #704. #716 measured 21 such files at 141.3s together and made five of them
// (138 of the 141) fast, so the pre-push hook can run every one of them with no exclusion list.
//
// Comment-stripped source, not a raw grep, for the same reason `local-import-closure.mjs` strips comments
// before matching: a file DESCRIBING a tree walk in prose (this file's own header, or a test asserting
// against a quoted fixture string) must not be classified as performing one.
//
//   node scripts/tree-wide-guards.mjs                    one path per line, for `xargs npx tsx --test`
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";
import { sandboxGitEnv } from "./git-env.mjs";
import { stripComments } from "./local-import-closure.mjs";

const LS_FILES_INVOCATION = /ls-files/;

/** @type {() => string} */
const defaultLsFiles = () =>
  execFileSync("git", ["ls-files", "*.test.ts"], { encoding: "utf8", env: sandboxGitEnv() });

/**
 * Every tracked `*.test.ts` file whose comment-stripped source mentions `ls-files` -- a real `git
 * ls-files` invocation (direct or through a seam), not a description of one in prose or a fixture string
 * a sibling guard's own test quotes.
 *
 * @param {{ lsFiles?: typeof defaultLsFiles, readFile?: (path: string) => string }} [deps]
 * @returns {string[]}
 */
export function treeWideGuardFiles({ lsFiles = defaultLsFiles, readFile = (p) => readFileSync(p, "utf8") } = {}) {
  const tracked = lsFiles().split("\n").filter(Boolean);
  return tracked
    .filter((path) => LS_FILES_INVOCATION.test(stripComments(readFile(path))))
    .sort();
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) {
  for (const file of treeWideGuardFiles()) process.stdout.write(`${file}\n`);
}
