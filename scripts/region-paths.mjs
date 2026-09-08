#!/usr/bin/env node
// @ts-check
// EVERY REPO-RELATIVE PATH NAMED IN A ROW'S PROSE -- a LEAF module, deliberately: no other import in this
// tree, so anything reaching for this one fact does not also drag in whatever else its original owner
// needed.
//
// This started life inside `row-reachability.mjs`, and moving it here (#462, B4) is not a style choice:
// `row-claim/file-overlap-rule.mjs` needs the identical extraction -- a row's Region must mean the same
// set of files to both tools, or the fact-stated-twice shape recurs with a second regex that can disagree
// about what counts as a path -- but `row-reachability.mjs` itself imports
// `@a11ign/worker-fleet/cli-flags` (a package specifier, fine for its own CLI parsing, fatal before
// `npm ci`/`npm run build`) for its own `main()`. Importing `regionPathsFromBody` FROM that file would
// have pulled that specifier into `row-claim.mjs`'s own import graph, which is reachable from a
// pre-install entry: `pre-install-import-graph.test.ts` caught exactly this the first time it was tried.
// `row-reachability.mjs` was also built to run as a SEPARATE PROCESS on purpose (see its own header on
// `reportReachability`) precisely so importing it would not become the default; reaching into it for one
// regex would have quietly defeated that.

/** Repo-relative source paths named anywhere in a row's prose — its Region, and whatever else it cites. */
export const PATH_IN_PROSE = /(?:^|[\s`"'(])((?:packages|scripts|docs|\.github)\/[A-Za-z0-9/_.-]+\.[A-Za-z]{2,4})/g;

/**
 * Every repo-relative path named anywhere in an issue's body text, deduplicated. `.matchAll` needs a
 * fresh regex state each call, hence a plain module-level constant with the global flag is safe here:
 * `matchAll` does not mutate `lastIndex` on the source regex.
 * @param {string} body
 * @returns {string[]}
 */
export function regionPathsFromBody(body) {
  return [...new Set([...body.matchAll(PATH_IN_PROSE)].map((m) => m[1]))];
}
