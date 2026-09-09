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

// #710: `## Region` (any heading level, optional trailing colon and inline text) or a bare `Region:` /
// `**Region:**` line -- both seen in real issue bodies (compare #621's `## Region` heading against this
// row's own trailing `Region: ...` line). A markdown heading line, matched separately, is what bounds a
// heading-form Region section: the text runs until the next one or the end of the body.
const REGION_HEADING = /^\s*#{1,6}\s*Region\s*:?\s*(.*)$/i;
const REGION_INLINE = /^\s*(?:\*\*|__)?Region:(?:\*\*|__)?\s*(.*)$/i;
const MARKDOWN_HEADING = /^\s*#{1,6}\s+\S/;

/**
 * Every line after `startIndex`, up to (not including) the next markdown heading or the end.
 * @param {string[]} lines
 * @param {number} startIndex
 * @returns {string[]}
 */
function linesUntilNextHeading(lines, startIndex) {
  const rest = [];
  for (const later of lines.slice(startIndex)) {
    if (MARKDOWN_HEADING.test(later)) break;
    rest.push(later);
  }
  return rest;
}

/**
 * #710: the raw text of a row's OWN declared `## Region` (or inline `Region:`) section, or `null` when
 * the body has no Region section at all. Deliberately returns text, not paths -- `declaredRegionFiles`
 * (below) runs `regionPathsFromBody` over exactly this substring, so a Region section and a whole body
 * are read by the identical path grammar and can never disagree about what counts as a path.
 * @param {string} body
 * @returns {string | null}
 */
export function extractRegionSection(body) {
  const lines = body.split(/\r\n|\r|\n/);
  for (const [index, line] of lines.entries()) {
    const heading = REGION_HEADING.exec(line);
    if (heading) {
      const inline = heading[1].trim();
      return inline.length > 0 ? inline : linesUntilNextHeading(lines, index + 1).join("\n");
    }
    const plain = REGION_INLINE.exec(line);
    if (plain) return plain[1].trim();
  }
  return null;
}

/**
 * #710: the paths a row's OWN `## Region` section declares it will touch -- NOT every path its prose
 * mentions anywhere (that question is `regionPathsFromBody`'s, unchanged, and still what
 * `row-reachability.mjs`'s STARTABLE check wants). A row citing a file as a worked example, a fixture, or
 * something someone else's PR already touches is not declaring intent to change it, and
 * `fileOverlapReason` needs exactly that narrower question. `null` when the body has no Region section at
 * all -- CANNOT_ASK, distinct from `[]` (a Region section that names no source path).
 * @param {string} body
 * @returns {string[] | null}
 */
export function declaredRegionFiles(body) {
  const section = extractRegionSection(body);
  return section === null ? null : regionPathsFromBody(section);
}
