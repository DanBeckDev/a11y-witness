#!/usr/bin/env node
// @ts-check
// THE TREE-WIDE-GUARD MARKER -- #716/#704, ceo's ruling 2026-09-09.
//
// `scripts/tree-wide-guards.mjs`'s discovery used to grep comment-stripped source for the literal
// substring "ls-files" -- a real fix for the mention-vs-use trap (a comment describing a tree walk no
// longer counted), but still "a test deriving its expectations from source TEXT", this repo's own
// most-repeated defect shape (CLAUDE.md, "A LIST OF FIELDS TO CHECK", "signal regexes broke whenever...").
// A guard whose own source happens to spell a different tree-walk idiom (`readdirSync` recursion, a
// different git subcommand) would be silently invisible to a text pattern, and a fixture STRING quoting
// the pattern (this file's own sibling test needed fragment concatenation to dodge exactly this) is
// always one draft away from a false positive.
//
// So: a TREE-WIDE GUARD is a test that IMPORTS this module -- a real ES import statement, parsed the same
// way `local-import-closure.mjs` (#621, B8) derives a test's requirements from its import closure rather
// than scanning its text. A guard declares its own membership by importing `declareTreeWideGuard` and
// calling it; the population is then a fact the tree computes from the import graph, never a keyword a
// future guard might happen to share or fail to spell the expected way.
//
//   node scripts/tree-wide-guards.mjs     one path per line, for `npm run guards:sweep`
import { execFileSync } from "node:child_process";
import { extname } from "node:path";
import ts from "typescript";
import { sandboxGitEnv } from "./git-env.mjs";

/**
 * Call this once, at module scope, in any test whose own population is the whole tracked tree rather than
 * one file. The return value carries no meaning -- `scripts/tree-wide-guards.mjs`'s discovery only checks
 * that the CALL exists (never merely the import), the same "imported is not used" distinction
 * `git-spawn-classification.test.ts`'s own `usesCanonicalHelper` already draws for the identical reason.
 * @returns {true}
 */
export function declareTreeWideGuard() {
  return true;
}

/** @type {(args: string[]) => string} */
const defaultGitLsFiles = (args) =>
  execFileSync("git", ["ls-files", ...args], { encoding: "utf8", env: sandboxGitEnv() });

/**
 * One tracked file `walkTree` found, paired with the `ts.ScriptKind` a correct parse must use --
 * extension-derived, never guessed. #715/#794's own bug was two INDEPENDENT, both-wrong copies of exactly
 * this ternary in `function-size.test.ts`; this is the one place it is computed now.
 * @typedef {{ path: string, scriptKind: import("typescript").ScriptKind, isSelf: boolean }} WalkedFile
 */

/**
 * #795: THE SHARED TREE WALK, so the SEARCH is asserted once rather than 20-odd times, each written by
 * hand. #794 fixed and mutation-tested the worked example (`function-size.test.ts`'s own walk) and audited
 * the other 20 tree-wide guards: 20 of 21 already carry a `.length >= N` floor on their RESULT. ceo named
 * the gap that leaves: a floor on the result catches a search that ran correctly and then silently
 * shrank its findings -- it does NOT catch a search that never ran the intended query at all (a wrong
 * root, a pathspec that quietly matches the wrong thing, a leaked `GIT_DIR`). Those two failure modes
 * report identically to a `.length >= N` check: fewer files, no distinguishing signal.
 *
 * THE ASSERTION IS A CROSS-CHECK, not a count: git's own pathspec filter (`git ls-files <roots> "*.<ext>"`)
 * and an INDEPENDENT `extname` filter applied in JS to an unfiltered `git ls-files <roots>` must agree on
 * exactly which files match. They are two different mechanisms answering the identical question -- the
 * same shape as `bounded-window-reads.test.ts`'s own doctrine (a lookbehind regex meant to exclude the
 * `--json` field list excluded the reads it meant to include instead, and only a second check caught it).
 * A guard trusting either one alone would never notice the two had drifted apart.
 *
 * `kind: "all"` applies no extension filter -- for a guard whose own population isn't ts/mjs (a `.md`
 * scan, a mixed `.mjs`/`.sh`/`.yml` scan), so it still gets the scrubbed `git ls-files` call and the
 * zero-population floor from one place, even though its own further filtering happens after this returns.
 *
 * `selfPath` (repo-relative, from the calling guard's own `import.meta.url`) marks the guard's OWN file
 * `isSelf: true` when the walk finds it -- named rather than silently included or silently excluded, the
 * same "mention vs use" self-reference trap this tree keeps meeting (`git-spawn-classification.test.ts`'s
 * own fixture regex matching its own describing prose was the same shape, one file over).
 *
 * @param {{ kind: "ts" | "mjs" | "both" | "all", roots?: string[], selfPath?: string }} opts
 * @param {{ gitLsFiles?: typeof defaultGitLsFiles }} [deps]
 * @returns {WalkedFile[]}
 */
export function walkTree({ kind, roots = [], selfPath }, { gitLsFiles = defaultGitLsFiles } = {}) {
  if (!["ts", "mjs", "both", "all"].includes(kind)) {
    throw new Error(`walkTree: unknown kind "${kind}" -- expected "ts", "mjs", "both", or "all"`);
  }
  /** @type {(path: string) => import("typescript").ScriptKind} */
  const scriptKindOf = (path) => (extname(path) === ".ts" ? ts.ScriptKind.TS : ts.ScriptKind.JS);
  const raw = gitLsFiles(roots).split("\n").filter(Boolean);
  if (raw.length === 0) {
    throw new Error(`walkTree(${JSON.stringify(roots)}): git ls-files found zero tracked files -- wrong `
      + "root, wrong cwd, or a leaked GIT_DIR pointed this at the wrong repository.");
  }

  const paths = kind === "all" ? raw : (() => {
    const exts = kind === "both" ? ["ts", "mjs"] : [kind];
    const viaJsFilter = raw.filter((path) => exts.includes(extname(path).slice(1))).sort();
    // ANCHORED, one pathspec per root x extension -- `git ls-files <root> "*.ext"` passed as two SEPARATE
    // pathspecs is an OR (every path under root, UNION every *.ext anywhere in the repo), not an AND, and
    // returned 564 files for a 198-file population the first time this ran. `${root}/*.ext`, concatenated
    // into one pathspec, is what actually scopes the glob to the root -- verified against the same
    // independent JS-filtered count this cross-check exists to agree with.
    const pathspecs = (roots.length > 0 ? roots : [""])
      .flatMap((root) => exts.map((ext) => (root ? `${root}/*.${ext}` : `*.${ext}`)));
    const viaGitPathspec = gitLsFiles(pathspecs).split("\n").filter(Boolean).sort();
    if (viaGitPathspec.length !== viaJsFilter.length
      || viaGitPathspec.some((path, i) => path !== viaJsFilter[i])) {
      throw new Error(`walkTree("${kind}", ${JSON.stringify(roots)}): git's own pathspec filter `
        + `(${viaGitPathspec.length} file(s)) and an independent extname filter over the same unfiltered `
        + `listing (${viaJsFilter.length} file(s)) disagree -- one of the two is wrong, and a guard `
        + "trusting either alone would never notice.");
    }
    return viaJsFilter;
  })();

  return paths.map((path) => ({ path, scriptKind: scriptKindOf(path), isSelf: path === selfPath }));
}
