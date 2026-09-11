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
 * #941: a STANDALONE directory item -- a whole line, or a whole item of a list on one line (split at `,`,
 * `;`, `and`, `or`), that is exactly one path ending in `/`, bar a list bullet or backticks. `PATH_IN_PROSE`
 * needs a file extension, so `packages/control/ansible/` never matched it and vanished: on 2026-09-11, 14 of
 * 60 open rows with a Region declared nothing at all, 12 of them for this reason -- 5 written a directory
 * per line, 7 as one line of comma-separated directories.
 *
 * STANDALONE ONLY: an item with any other word in it -- "`scripts/` for the helper" -- is prose, not a
 * declaration. The Region's prose was read as a declaration twice on 2026-09-11 (#848, #920), and a prefix
 * must not reopen that.
 *
 * ANY ROOT, not a list of them. The standalone rule is what keeps prose out; a hand-written list of roots
 * only drops the ones nobody typed. The first version listed `packages|scripts|docs|.github` and read
 * `examples/`, `data/` and `.claude/skills/` as `[]` -- #941's own defect for three of the eight roots
 * the tree tracks (worker-judge's review of #945). `region-paths.test.ts` checks every tracked root.
 */
const DIRECTORY_ITEM = /^(?:[-*+]\s+)?`?((?:[A-Za-z0-9_.-]+\/)+)`?$/;
/** `.` and `..` name no directory in the tree: `../x/` is outside it and `./` is all of it. */
const isTreePath = (/** @type {string} */ path) => !path.split("/").some((segment) => segment === "." || segment === "..");
const LIST_SEPARATOR = /[,;]|\band\b|\bor\b/;

/**
 * #941: does a declared Region entry cover this repo-relative file? A directory entry (`docs/`) covers
 * everything under it and nothing that merely shares its spelling (`docsite/`); a file entry covers itself.
 * The ONE answer, so the overlap rule and the lane derivation cannot read a prefix two ways.
 * @param {string} entry @param {string} file
 */
export function regionCovers(entry, file) {
  return entry.endsWith("/") ? file.startsWith(entry) : entry === file;
}

/**
 * #710: the paths a row's OWN `## Region` section declares it will touch -- NOT every path its prose
 * mentions anywhere (that question is `regionPathsFromBody`'s, unchanged, and still what
 * `row-reachability.mjs`'s STARTABLE check wants). A row citing a file as a worked example, a fixture, or
 * something someone else's PR already touches is not declaring intent to change it, and
 * `fileOverlapReason` needs exactly that narrower question. `null` when the body has no Region section at
 * all -- CANNOT_ASK, distinct from `[]` (a Region section that names no source path).
 *
 * #941: a standalone directory item is declared as that PREFIX (`packages/control/ansible/`), after the
 * files -- see `DIRECTORY_ITEM` and `regionCovers`. It used to vanish, so a Region of only directories
 * declared the empty set and overlap-checked as touching nothing.
 * @param {string} body
 * @returns {string[] | null}
 */
export function declaredRegionFiles(body) {
  const section = extractRegionSection(body);
  if (section === null) return null;
  const directories = section.split(/\r\n|\r|\n/)
    .flatMap((line) => line.split(LIST_SEPARATOR))
    .map((item) => DIRECTORY_ITEM.exec(item.trim())?.[1])
    .filter((path) => path !== undefined)
    .filter(isTreePath);
  return [...new Set([...regionPathsFromBody(section), ...directories])];
}

/**
 * #707: the raw text of a row's OWN section for ANY of the three required template fields -- Region,
 * Acceptance, or Open-check -- or `null` when the body has none. The same heading/inline shape as
 * `extractRegionSection` above (`## <Field>`, any heading level, optional trailing colon and inline text,
 * OR a bare `Field:` / `**Field:**` line), generalised to a field name so a third and fourth copy of the
 * identical regex pair do not drift from each other or from Region's. `extractRegionSection` itself is
 * left untouched rather than rewritten to call this -- #710's tests pin its exact behaviour, and the risk
 * of a subtle regression there outweighs the small duplication of the pattern-building logic here.
 * @param {string} body @param {string} fieldName exact label as it appears in a heading or inline colon
 *   line, e.g. "Acceptance" or "Open-check" -- matched case-insensitively, word-bounded
 * @returns {string | null}
 */
export function extractLabeledSection(body, fieldName) {
  const escaped = fieldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // The trailing inline VALUE is captured ONLY after an explicit colon -- `## Field: value`. Without the
  // colon required, a real template heading's own descriptive suffix (the actual text this repo's
  // template uses: "## Open-check — the command that shows this row is still open", em-dash, no colon)
  // was captured AS the value, reading a heading with real content on the FOLLOWING lines as though it
  // had none. `.*$` after the optional group still consumes the rest of the line either way, so a
  // colon-less descriptive heading is recognised as a bare heading and this function correctly falls
  // through to the lines beneath it.
  const heading = new RegExp(`^\\s*#{1,6}\\s*${escaped}\\b(?::\\s*(.*))?.*$`, "i");
  const inline = new RegExp(`^\\s*(?:\\*\\*|__)?${escaped}:(?:\\*\\*|__)?\\s*(.*)$`, "i");
  const lines = body.split(/\r\n|\r|\n/);
  for (const [index, line] of lines.entries()) {
    const headingMatch = heading.exec(line);
    if (headingMatch) {
      const trailingInline = (headingMatch[1] ?? "").trim();
      return trailingInline.length > 0 ? trailingInline : linesUntilNextHeading(lines, index + 1).join("\n").trim();
    }
    const inlineMatch = inline.exec(line);
    if (inlineMatch) return inlineMatch[1].trim();
  }
  return null;
}

/**
 * #707: does `body` state a non-empty value for `fieldName` -- naming the field itself is not enough, the
 * "I checked" shape #603's owned-path sign-off already refuses by name. `null`/empty-after-trim text (a
 * heading with nothing under it before the next one) reads as absent, not present-but-blank.
 * @param {string} body @param {string} fieldName
 * @returns {boolean}
 */
export function hasTemplateField(body, fieldName) {
  const section = extractLabeledSection(body, fieldName);
  return section !== null && section.trim().length > 0;
}
