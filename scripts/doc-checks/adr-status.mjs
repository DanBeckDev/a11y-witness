// @ts-check
// DOC CROSS-REFERENCE CHECK (#905): each ADR's own status agrees with the index row that summarises it, and the
// index lists no ADR that does not exist. Moved out of `adr-status.test.ts`, which now asserts on these same
// functions -- see that file's header for why seven ADRs once contradicted the index, and why the INDEX is the
// authority (it carries the qualification the file header cannot).
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { adrFiles } from "./adr-index.mjs";

/**
 * The status phrase, from whichever of the directory's THREE formats this ADR happens to use:
 * `- Status: X` (0001-0008), `**Status:** X` (0009-0011, 0015-0024), `## Status\n\nX.` (0012-0014).
 * @param {string} source @returns {string | null}
 */
export function statusInFile(source) {
  const patterns = [
    /^- Status:\s*(.+)$/m,
    /^\*\*Status:?\*\*:?\s*(.+)$/m,
    /^##+\s*Status\s*\n+\s*([^\n.]+)/m,
  ];
  for (const pattern of patterns) {
    const found = pattern.exec(source);
    if (found) return found[1].trim();
  }
  return null;
}

/**
 * The first word of a status phrase -- "accepted 2026-08-24" and "accepted; judge half proven" agree.
 * @param {string} status
 */
export const statusWord = (status) =>
  status.replace(/\*/g, "").split(/[;,.]/)[0].trim().split(/\s+/)[0].toLowerCase();

/**
 * The index's status for each ADR number it lists.
 * @param {string} root @returns {Map<string, string>}
 */
export function indexStatuses(root) {
  const path = join(root, "docs", "adr", "README.md");
  const index = existsSync(path) ? readFileSync(path, "utf8") : "";
  /** @type {Map<string, string>} */
  const out = new Map();
  for (const row of index.matchAll(/\|\s*\[(\d{4})\]\([^)]+\)\s*\|[^|]*\|\s*([^|]+?)\s*\|/g)) {
    out.set(row[1], row[2].trim());
  }
  return out;
}

/** @param {string} root @param {string} file */
const ownStatus = (root, file) => statusInFile(readFileSync(join(root, "docs", "adr", file), "utf8"));

/**
 * ADR files that state no status in any recognised format -- and so cannot be checked against the index.
 * @param {string} root @returns {string[]}
 */
export function adrsWithNoStatus(root) {
  return adrFiles(root).filter((file) => !ownStatus(root, file));
}

/**
 * ADR numbers that exist on disk and have no index row.
 * @param {string} root @returns {string[]}
 */
export function adrsMissingFromIndex(root) {
  const fromIndex = indexStatuses(root);
  return adrFiles(root).map((file) => file.slice(0, 4)).filter((num) => !fromIndex.has(num));
}

/**
 * ADRs whose own status word differs from the index's -- the fact stated twice, drifted.
 * @param {string} root @returns {{ num: string, own: string | null, indexed: string }[]}
 */
export function statusDisagreements(root) {
  const fromIndex = indexStatuses(root);
  return adrFiles(root).flatMap((file) => {
    const num = file.slice(0, 4);
    const indexed = fromIndex.get(num);
    const own = ownStatus(root, file);
    if (indexed === undefined || own === null || statusWord(own) === statusWord(indexed)) return [];
    return [{ num, own, indexed }];
  });
}

/**
 * Index rows for an ADR that is not in `docs/adr/` -- a phantom that makes the count look right.
 * @param {string} root @returns {string[]}
 */
export function phantomIndexRows(root) {
  const present = new Set(adrFiles(root).map((f) => f.slice(0, 4)));
  return [...indexStatuses(root).keys()].filter((num) => !present.has(num));
}

/** @param {string} root @returns {import("./check-result.mjs").CheckResult} */
export function check(root) {
  const where = "docs/adr/README.md";
  return {
    examined: adrFiles(root).length + indexStatuses(root).size,
    unit: "ADR files and index rows",
    disagreements: [
      ...adrsWithNoStatus(root).map((file) => ({ where: `docs/adr/${file}`, reference: "Status",
        why: "states no status in any recognised format, so it cannot be checked against the index" })),
      ...adrsMissingFromIndex(root).map((num) => ({ where, reference: `ADR ${num}`,
        why: "exists in docs/adr/ and the index has no row for it" })),
      ...statusDisagreements(root).map(({ num, own, indexed }) => ({ where: `docs/adr/${num}`, reference: `Status: ${own}`,
        why: `the index says "${indexed}" -- the index is the authority, so the file is the copy to correct` })),
      ...phantomIndexRows(root).map((num) => ({ where, reference: `ADR ${num}`,
        why: "the index lists an ADR that is not in docs/adr/" })),
    ],
  };
}
