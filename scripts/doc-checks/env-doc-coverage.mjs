// @ts-check
// DOC CROSS-REFERENCE CHECK (#905): a `process.env` variable read in more than one file must be documented
// somewhere a human looks -- the named variable must exist where the code points a reader. Moved out of
// `env-doc-coverage.test.ts`, which now asserts on these same functions; read its header for why
// `docs/architecture-audit.md` is excluded from the corpus BY NAME (including it once made a real measurement
// read "0 undocumented" while the true number was 55).
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const SKIP_DIRS = new Set(["node_modules", "dist", ".git"]);

/**
 * Every file matching `filter` under `dir`, recursively. A directory that cannot be listed contributes
 * nothing -- the callers' own population floors are what catch a walk that reached nothing.
 * @param {string} dir @param {(name: string) => boolean} filter @returns {string[]}
 */
export function walk(dir, filter) {
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
 * The `docs/` files that count as documentation -- every `.md` except `architecture-audit.md`, which is the
 * audit OF this problem, not documentation of any variable it discusses.
 * @param {string} root @returns {string[]}
 */
export function documentationDocs(root) {
  return walk(join(root, "docs"), (n) => n.endsWith(".md") && n !== "architecture-audit.md");
}

/**
 * Where a human would look: CLAUDE.md (working ON the repo), README.md, CONTRIBUTING.md, docs/ and package
 * READMEs (using it).
 * @param {string} root @returns {string}
 */
export function documentation(root) {
  const parts = [];
  for (const name of ["CLAUDE.md", "README.md", "CONTRIBUTING.md"]) {
    if (existsSync(join(root, name))) parts.push(readFileSync(join(root, name), "utf8"));
  }
  for (const file of documentationDocs(root)) parts.push(readFileSync(file, "utf8"));
  for (const file of walk(join(root, "packages"), (n) => n === "README.md")) parts.push(readFileSync(file, "utf8"));
  return parts.join("\n");
}

/** Shell/OS built-ins a `process.env` read can pick up incidentally -- never anything this repo defines. */
const NOT_A_PROJECT_VARIABLE = new Set(["HOME", "HOSTNAME", "HOST", "PATH", "LOCALAPPDATA", "TEMP", "TMP", "TMPDIR"]);

const ENV_READ = /process\.env\.([A-Z][A-Z0-9_]*)\b|process\.env\[["']([A-Z][A-Z0-9_]*)["']\]/g;

/**
 * Every `process.env.NAME` this repo's own source reads, mapped to the files that read it.
 * @param {string} root @returns {Map<string, Set<string>>}
 */
export function envReadsByFile(root) {
  /** @type {Map<string, Set<string>>} */
  const map = new Map();
  const files = [
    ...walk(join(root, "packages"), (n) => /\.(mjs|ts|js)$/.test(n)),
    ...walk(join(root, "scripts"), (n) => /\.(mjs|ts|js)$/.test(n)),
  ];
  for (const file of files) {
    for (const match of readFileSync(file, "utf8").matchAll(ENV_READ)) {
      const name = match[1] ?? match[2];
      if (NOT_A_PROJECT_VARIABLE.has(name)) continue;
      if (!map.has(name)) map.set(name, new Set());
      /** @type {Set<string>} */ (map.get(name)).add(file);
    }
  }
  return map;
}

/** Variables read in 2+ files. @param {string} root @returns {[string, Set<string>][]} */
export function multiFileReads(root) {
  return [...envReadsByFile(root).entries()].filter(([, files]) => files.size > 1);
}

/**
 * Variables read in 2+ files that appear nowhere a human looks.
 * @param {string} root @returns {{ name: string, files: string[] }[]}
 */
export function undocumentedVariables(root) {
  const docs = documentation(root);
  return multiFileReads(root)
    .filter(([name]) => !new RegExp(`\\b${name}\\b`).test(docs))
    .map(([name, files]) => ({ name, files: [...files].map((f) => relative(root, f)).sort() }));
}

/** @param {string} root @returns {import("./check-result.mjs").CheckResult} */
export function check(root) {
  return {
    examined: multiFileReads(root).length,
    unit: "env variables read in 2+ files",
    disagreements: undocumentedVariables(root).map(({ name, files }) => ({
      where: files[0], reference: name,
      why: `read in ${files.length} files and documented nowhere a human looks (CLAUDE.md, README, docs/, a package README)`,
    })),
  };
}
