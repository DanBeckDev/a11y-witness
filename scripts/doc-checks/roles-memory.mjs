// @ts-check
// DOC CROSS-REFERENCE CHECK (#905): `docs/roles/memory/MEMORY.md` indexes the memory fact files, and the index
// and the directory agree in both directions -- no entry links a missing file, no file goes unindexed. Moved
// out of `roles-memory.test.ts`, which now asserts on these same functions. Its frontmatter-shape and leak
// tests are not cross-references and stay there.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const MEMORY_DIR = "docs/roles/memory";
export const INDEX_PATH = `${MEMORY_DIR}/MEMORY.md`;

/** @typedef {{ title: string, file: string, hook: string }} IndexEntry `file` is resolved relative to MEMORY_DIR */

/**
 * Parses `- [Title](file.md) — hook` lines, this repo's own established memory-index shape.
 * @param {string} indexSource @returns {IndexEntry[]}
 */
export function parseIndex(indexSource) {
  /** @type {IndexEntry[]} */
  const entries = [];
  for (const line of indexSource.split("\n")) {
    const m = line.match(/^- \[([^\]]+)\]\(([^)]+)\) — (.+)$/);
    if (m) entries.push({ title: m[1], file: m[2], hook: m[3] });
  }
  return entries;
}

/** @param {string} root @returns {IndexEntry[]} */
export function indexEntries(root) {
  const path = join(root, INDEX_PATH);
  return existsSync(path) ? parseIndex(readFileSync(path, "utf8")) : [];
}

/** The fact files on disk (every `.md` but the index). @param {string} root @returns {string[]} */
export function factFiles(root) {
  const dir = join(root, MEMORY_DIR);
  return existsSync(dir) ? readdirSync(dir).filter((name) => name.endsWith(".md") && name !== "MEMORY.md") : [];
}

/** Index entries whose linked file does not exist. @param {string} root @returns {string[]} */
export function danglingIndexEntries(root) {
  return indexEntries(root).filter((e) => !existsSync(join(root, MEMORY_DIR, e.file))).map((e) => e.file);
}

/** Fact files on disk that the index does not link. @param {string} root @returns {string[]} */
export function unindexedFactFiles(root) {
  const linked = new Set(indexEntries(root).map((e) => e.file));
  return factFiles(root).filter((f) => !linked.has(f));
}

/** @param {string} root @returns {import("./check-result.mjs").CheckResult} */
export function check(root) {
  return {
    examined: indexEntries(root).length + factFiles(root).length,
    unit: `memory index entries and fact files under ${MEMORY_DIR}`,
    disagreements: [
      ...danglingIndexEntries(root).map((file) => ({ where: INDEX_PATH, reference: file,
        why: "the index links a fact file that does not exist" })),
      ...unindexedFactFiles(root).map((file) => ({ where: `${MEMORY_DIR}/${file}`, reference: file,
        why: "this fact file is not linked from the index" })),
    ],
  };
}
