// @ts-check
// DOC CROSS-REFERENCE CHECK (#905): a `§N` citation into `not-working.md`, `known-gaps.md` or
// `architecture-audit.md` is a claim that section N still exists there. Moved out of
// `doc-citation-integrity.test.ts`, which now asserts on `findCitations` -- read that file's header for the
// scope (a citation that NAMES its document beside the `§`, in prose or as a markdown link resolved against
// the HREF) and for why a bare `§N` is deliberately out of scope.
// #954: `doc-citation-integrity.test.ts` IS GONE. The sentences above describing what it asserts are the record of where this
// rule came from, not a claim about today: this module is now the only copy, and the nightly doc
// cross-reference report is where it runs. A pull request no longer fails on it.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname, join, relative } from "node:path";

/** Documents this repo cites BY SECTION NUMBER from elsewhere. Extend this, never a generic Markdown walk. */
export const NUMBERED_DOCS = /** @type {Record<string, string>} */ ({
  "not-working": "docs/not-working.md",
  "known-gaps": "docs/known-gaps.md",
  "architecture-audit": "docs/architecture-audit.md",
});

/**
 * Which section identifiers exist in one of the numbered documents, format-aware. THROWS when the document
 * cannot be read -- the caller records that as a link that does not resolve.
 * @param {string} root @param {string} relPath @returns {Set<string>}
 */
function sectionsIn(root, relPath) {
  const text = readFileSync(join(root, relPath), "utf8");
  /** @type {Set<string>} */
  const ids = new Set();
  if (relPath.endsWith("not-working.md")) {
    // `18`, `18a` -- the lettered-supersession scheme `not-working-numbering.test.ts` enforces. A bare
    // citation ("§18") is satisfied by EITHER form existing.
    for (const m of text.matchAll(/^#{2,4} (\d+)[a-z]?\./gm)) ids.add(m[1]);
  } else if (relPath.endsWith("known-gaps.md") || relPath.endsWith("architecture-audit.md")) {
    for (const m of text.matchAll(/^## (\d+)\./gm)) ids.add(m[1]);
    // architecture-audit.md ALSO has dotted subsections ("### 14.4"), its own citable unit.
    for (const m of text.matchAll(/^### (\d+)\.(\d+)/gm)) ids.add(`${m[1]}.${m[2]}`);
  }
  return ids;
}

/** Every `docs/*.md` plus `CLAUDE.md`, as root-relative paths. @param {string} root @returns {string[]} */
export function allDocs(root) {
  const docsDir = join(root, "docs");
  const files = existsSync(docsDir)
    ? readdirSync(docsDir).filter((f) => f.endsWith(".md")).map((f) => `docs/${f}`) : [];
  if (existsSync(join(root, "CLAUDE.md"))) files.push("CLAUDE.md");
  return files;
}

/**
 * @typedef {{ file: string, line: number, target: string, cited: string, ok: boolean | null, context: string }} Citation
 * `ok` is null when the link's own target path could not be read at all.
 */

/**
 * A document's sections, or null when it cannot be read at all.
 * @param {string} root @param {string} relPath @returns {Set<string> | null}
 */
function sectionsOrNull(root, relPath) {
  try {
    return sectionsIn(root, relPath);
  } catch {
    return null; // unreadable: a citation into it reads `ok: null`, "could not check" -- never false
  }
}

/**
 * Every `§N` citation that names its target document, with whether the cited section exists.
 * @param {string} root @returns {Citation[]}
 */
export function findCitations(root) {
  /** @type {Map<string, Set<string> | null>} */
  const cache = new Map();
  const sectionsFor = (/** @type {string} */ relPath) => {
    if (!cache.has(relPath)) cache.set(relPath, sectionsOrNull(root, relPath));
    return cache.get(relPath) ?? null;
  };
  /** @type {Citation[]} */
  const found = [];
  for (const file of allDocs(root)) {
    const text = readFileSync(join(root, file), "utf8");
    const lines = text.split("\n");
    const context = (/** @type {number} */ line) => (lines[line - 1] ?? "").trim().slice(0, 160);

    for (const [alias, target] of Object.entries(NUMBERED_DOCS)) {
      const re = new RegExp(`${alias}(?:\\.md)?[\`'"\\]]{0,3}\\s*§(\\d+(?:\\.\\d+)?)`, "g");
      for (const m of text.matchAll(re)) {
        const line = text.slice(0, m.index).split("\n").length;
        const sections = sectionsFor(target);
        found.push({ file, line, target, cited: m[1], ok: sections ? sections.has(m[1]) : null, context: context(line) });
      }
    }

    for (const m of text.matchAll(/\[([^\]]*§(\d+(?:\.\d+)?)[^\]]*)\]\(([^)]+)\)/g)) {
      const [, , cited, href] = m;
      const hrefPath = href.split("#")[0];
      if (!hrefPath.endsWith(".md")) continue;
      const line = text.slice(0, m.index).split("\n").length;
      const resolved = relative(root, resolve(dirname(join(root, file)), hrefPath)).split("\\").join("/");
      const sections = sectionsFor(resolved);
      found.push({ file, line, target: resolved, cited, ok: sections ? sections.has(cited) : null, context: context(line) });
    }
  }
  return found;
}

/** @param {string} root @returns {import("./check-result.mjs").CheckResult} */
export function check(root) {
  const citations = findCitations(root);
  return {
    examined: citations.length,
    unit: "§-citations",
    disagreements: citations.filter((c) => c.ok !== true).map((c) => ({
      where: `${c.file}:${c.line}`,
      reference: `${c.target} §${c.cited}`,
      why: c.ok === null ? `the link target "${c.target}" could not be read at all`
        : "that section does not exist in the target document",
    })),
  };
}
