// @ts-check
// DOC CROSS-REFERENCE CHECK (#905): every source comment that cites a section of the schema migration history
// doc names a section that exists there. Moved out of `schema-migration-citations.test.ts`, which now asserts
// on these same functions. That file's OTHER half -- no comment may cite a specific key inside the migration
// toggle file -- is a rule about the shape of code, #908's, and stays in the test.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const HISTORY_DOC = "docs/schema-migration-history.md";
const SKIP_DIRS = new Set(["node_modules", "dist", ".git"]);
const SELF = fileURLToPath(import.meta.url);

/**
 * Every file matching `filter` under `dir`, recursively. A private copy, as in the test this came from, so
 * this scan and `env-doc-coverage`'s agreeing is a fact about the source rather than about one shared walk.
 * @param {string} dir @param {(name: string) => boolean} filter @returns {string[]}
 */
function walk(dir, filter) {
  /** @type {import("node:fs").Dirent[]} */
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    if (SKIP_DIRS.has(entry.name)) return [];
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return walk(full, filter);
    return filter(entry.name) ? [full] : [];
  });
}

/**
 * The source files the citation scan reads: `.py` alongside the JS family, because the one real citation lives
 * in Python. EXCLUDES this module and anything in `exclude` -- a scanner necessarily writes down what it scans
 * for, so its own file would otherwise always report itself.
 * @param {string} root @param {string[]} [exclude] absolute paths @returns {string[]}
 */
export function sourceFiles(root, exclude = []) {
  const skip = new Set([SELF, ...exclude]);
  return [
    ...walk(join(root, "packages"), (n) => /\.(mjs|ts|js|py)$/.test(n)),
    ...walk(join(root, "scripts"), (n) => /\.(mjs|ts|js|py)$/.test(n)),
  ].filter((file) => !skip.has(file));
}

// The citation's phrasing: the doc's path, a possessive, a quoted section name, then the word "section".
// Quoted so the section name is read off the citation itself rather than a second, hand-kept list.
const HISTORY_CITATION = /docs\/schema-migration-history\.md`?['’]s\s+"([^"]+)"\s+section/g;

/**
 * Every citation of a history-doc section in source, with the file it is in (root-relative).
 * @param {string} root @param {string[]} [exclude] @returns {{ file: string, section: string }[]}
 */
export function historyCitations(root, exclude = []) {
  /** @type {{ file: string, section: string }[]} */
  const citations = [];
  for (const file of sourceFiles(root, exclude)) {
    for (const match of readFileSync(file, "utf8").matchAll(HISTORY_CITATION)) {
      citations.push({ file: relative(root, file), section: match[1] });
    }
  }
  return citations;
}

/**
 * Citations naming a section the history doc does not have. A heading carries "(opened ..., closed by ...)"
 * after its name, so a citation matches a heading that STARTS with it, not only one that equals it.
 * @param {string} root @param {string[]} [exclude] @returns {{ file: string, section: string }[]}
 */
export function danglingHistoryCitations(root, exclude = []) {
  const path = join(root, HISTORY_DOC);
  const headings = existsSync(path)
    ? [...readFileSync(path, "utf8").matchAll(/^##\s+(.+?)\s*$/gm)].map((m) => m[1]) : [];
  const exists = (/** @type {string} */ cited) => headings.some((h) => h === cited || h.startsWith(`${cited} `));
  return historyCitations(root, exclude).filter(({ section }) => !exists(section));
}

/** @param {string} root @returns {import("./check-result.mjs").CheckResult} */
export function check(root) {
  return {
    examined: historyCitations(root).length,
    unit: `citations of ${HISTORY_DOC} sections in source`,
    disagreements: danglingHistoryCitations(root).map(({ file, section }) => ({ where: file, reference: `"${section}"`,
      why: `no section of ${HISTORY_DOC} has that name -- the heading moved or was deleted, or the citation is stale` })),
  };
}
