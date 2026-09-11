// @ts-check
// DOC CROSS-REFERENCE CHECK (#905): every ADR is in `docs/adr/README.md`'s index, and the index links no ADR
// that does not exist. Moved out of `adr-index.test.ts`, which now asserts on these same functions, so the PR
// path and the nightly report read one copy of the rule. The prose ADR count in the same test file is #907's
// (a number pinned in prose) and stays there.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

/** @param {string} root */
const adrDir = (root) => join(root, "docs", "adr");

/**
 * The ADR files themselves -- the only source of truth here; everything else is a copy of this.
 * @param {string} root @returns {string[]}
 */
export function adrFiles(root) {
  if (!existsSync(adrDir(root))) return [];
  return readdirSync(adrDir(root)).filter((f) => /^\d{4}-.*\.md$/.test(f)).sort();
}

/** @param {string} root @returns {string} */
const indexText = (root) => {
  const path = join(adrDir(root), "README.md");
  return existsSync(path) ? readFileSync(path, "utf8") : "";
};

/**
 * The ADR files the index does not mention -- nobody will find them before re-arguing the decision.
 * @param {string} root @returns {string[]}
 */
export function unindexedAdrs(root) {
  const index = indexText(root);
  return adrFiles(root).filter((f) => !index.includes(f));
}

/**
 * Every ADR filename the index LINKS, in link order.
 * @param {string} root @returns {string[]}
 */
export function indexedAdrLinks(root) {
  return [...indexText(root).matchAll(/\((?:\.\/)?(\d{4}-[a-z0-9-]+\.md)\)/g)].map((m) => m[1]);
}

/**
 * Index links to an ADR that does not exist: a renamed or deleted ADR leaves a dead link, and a dead link in
 * the one document that exists to be an index is worse than a missing row.
 * @param {string} root @returns {string[]}
 */
export function deadAdrLinks(root) {
  const files = new Set(adrFiles(root));
  return [...new Set(indexedAdrLinks(root))].filter((f) => !files.has(f));
}

/** @param {string} root @returns {import("./check-result.mjs").CheckResult} */
export function check(root) {
  return {
    examined: adrFiles(root).length + indexedAdrLinks(root).length,
    unit: "ADR files and index links",
    disagreements: [
      ...unindexedAdrs(root).map((file) => ({ where: "docs/adr/README.md", reference: file,
        why: "this ADR is not in the index, so nobody will find it before re-arguing the decision" })),
      ...deadAdrLinks(root).map((file) => ({ where: "docs/adr/README.md", reference: file,
        why: "the index links an ADR that does not exist" })),
    ],
  };
}
