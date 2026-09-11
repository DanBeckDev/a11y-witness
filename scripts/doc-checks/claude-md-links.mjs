// @ts-check
// DOC CROSS-REFERENCE CHECK (#905): every `(docs/… .md#anchor)` link CLAUDE.md makes resolves to a heading that
// exists in its target file -- a moved or renamed section otherwise goes dark silently. Moved out of
// `claude-md-links.test.ts`, which now asserts on these same functions. The CLAUDE.md size limit in the same test
// file is not a cross-reference and stays on the pull-request path (product-manager's ruling on #905).
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export const CLAUDE_MD = "CLAUDE.md";

/**
 * Approximates GitHub's heading-anchor algorithm -- the approach `scripts/known-gaps-index.mjs` uses for the
 * identical reason: good enough for a reader to click through, not a reimplementation of GitHub's renderer.
 * @param {string} raw @returns {string}
 */
export function slugify(raw) {
  const stripped = raw
    .replace(/~~/g, "")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  return stripped
    .toLowerCase()
    .replace(/[^\w\- ]+/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

/**
 * Every heading in a markdown file, GitHub-anchor-disambiguated in document order.
 * @param {string} text @returns {Set<string>}
 */
export function headingAnchors(text) {
  /** @type {Map<string, number>} */
  const seen = new Map();
  /** @type {Set<string>} */
  const anchors = new Set();
  for (const line of text.split("\n")) {
    const match = /^#{1,6} (.*)$/.exec(line);
    if (!match) continue;
    const slug = slugify(match[1]);
    const count = seen.get(slug) ?? 0;
    seen.set(slug, count + 1);
    anchors.add(count === 0 ? slug : `${slug}-${count}`);
  }
  return anchors;
}

/**
 * Every `(relative/path.md#anchor)` link a document makes to another file in this repo.
 * @param {string} text @returns {{ file: string, anchor: string }[]}
 */
export function localAnchorLinks(text) {
  /** @type {{ file: string, anchor: string }[]} */
  const links = [];
  for (const m of text.matchAll(/\(((?:docs|packages)\/[^)#\s]+\.md)#([a-z0-9-]+)\)/g)) {
    links.push({ file: m[1], anchor: m[2] });
  }
  return links;
}

/** @param {string} root @returns {string} CLAUDE.md, or "" when there is none */
export function claudeMd(root) {
  const path = join(root, CLAUDE_MD);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

/**
 * The local anchor links in CLAUDE.md whose target heading does not exist (or whose target file is missing).
 * @param {string} root @returns {string[]} `file#anchor`
 */
export function brokenAnchorLinks(root) {
  /** @type {Map<string, Set<string>>} */
  const byFile = new Map();
  const broken = [];
  for (const { file, anchor } of localAnchorLinks(claudeMd(root))) {
    if (!byFile.has(file)) {
      const path = join(root, file);
      byFile.set(file, existsSync(path) ? headingAnchors(readFileSync(path, "utf8")) : new Set());
    }
    if (!/** @type {Set<string>} */ (byFile.get(file)).has(anchor)) broken.push(`${file}#${anchor}`);
  }
  return broken;
}

/** @param {string} root @returns {import("./check-result.mjs").CheckResult} */
export function check(root) {
  return {
    examined: localAnchorLinks(claudeMd(root)).length,
    unit: "local anchor links in CLAUDE.md",
    disagreements: brokenAnchorLinks(root).map((link) => ({ where: CLAUDE_MD, reference: link,
      why: "points at a heading that does not exist -- a moved or renamed section has gone dark" })),
  };
}
