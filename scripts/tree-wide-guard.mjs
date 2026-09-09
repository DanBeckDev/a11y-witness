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
