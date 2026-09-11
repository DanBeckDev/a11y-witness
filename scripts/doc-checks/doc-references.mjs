// @ts-check
// DOC CROSS-REFERENCE CHECK (#905): every path the top-level docs cite exists, and every cited path that exists
// is one git tracks (or one this check knows how to generate). Moved out of `doc-references.test.ts`, which now
// asserts on these same functions; read its header for #393 (a generated page cited in prose, present only by
// residue) and for why build output is CLASSIFIED rather than silently excluded.
// #954: `doc-references.test.ts` IS GONE. The sentences above describing what it asserts are the record of where this
// rule came from, not a claim about today: this module is now the only copy, and the nightly doc
// cross-reference report is where it runs. A pull request no longer fails on it.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sandboxGitEnv } from "../git-env.mjs";

/** The documents a reader is most likely to follow an instruction from. */
export const DOCS = ["README.md", "RELEASE.md", "PLAN.md", "CLAUDE.md"];

/**
 * A relative Markdown link, `(./path)`, or a backticked repo path, `` `packages/…` ``. Bare prose words are
 * deliberately NOT matched: a regex loose enough to catch every mention flags ordinary English.
 */
const REFERENCE = /\(\.\/([A-Za-z0-9._/-]+)\)|`((?:docs|packages|scripts|\.github)\/[A-Za-z0-9._/-]+)`/g;

/** Build output named in prose as the SUBJECT of a sentence, not somewhere a reader is sent. */
export const isBuildOutput = (/** @type {string} */ path) => /^packages\/[^/]+\/dist\//.test(path);

/** Glob-ish citations name a set, not a file, so they cannot be resolved by existence. */
const isPattern = (/** @type {string} */ path) => path.includes("*");

/** Generated, deliberately untracked pages the docs cite, with the command that produces each. */
export const GENERATED_CITATIONS = [
  { path: "docs/coverage.md", generator: ["tsx", "packages/lab/scripts/generate-coverage-doc.ts"] },
];

/**
 * Every checkable citation in the top-level docs, first occurrence per document, patterns and build output
 * excluded. A top-level doc that is itself missing contributes nothing -- `missingDocs` names it.
 * @param {string} root @returns {{ doc: string, path: string }[]}
 */
export function citedPaths(root) {
  /** @type {{ doc: string, path: string }[]} */
  const cited = [];
  for (const doc of DOCS) {
    const full = join(root, doc);
    if (!existsSync(full)) continue;
    const seen = new Set();
    for (const match of readFileSync(full, "utf8").matchAll(REFERENCE)) {
      const path = match[1] ?? match[2];
      if (isPattern(path) || isBuildOutput(path) || seen.has(path)) continue;
      seen.add(path);
      cited.push({ doc, path });
    }
  }
  return cited;
}

/** The top-level docs this check reads that do not exist. @param {string} root @returns {string[]} */
export const missingDocs = (root) => DOCS.filter((doc) => !existsSync(join(root, doc)));

/**
 * Citations that point at nothing. With `{ generatedResolves: true }` -- the nightly report's reading, which
 * does not run generators -- a generated page counts as resolvable exactly when its generator exists.
 * @param {string} root @param {{ generatedResolves?: boolean }} [options]
 * @returns {{ broken: string[], checked: number }}
 */
export function brokenCitations(root, { generatedResolves = false } = {}) {
  const generators = new Map(GENERATED_CITATIONS.map((g) => [g.path, g.generator[g.generator.length - 1]]));
  const cited = citedPaths(root);
  const resolves = (/** @type {string} */ path) => existsSync(join(root, path))
    || (generatedResolves && generators.has(path) && existsSync(join(root, /** @type {string} */ (generators.get(path)))));
  return { broken: cited.filter(({ path }) => !resolves(path)).map(({ doc, path }) => `${doc}: ${path}`), checked: cited.length };
}

/**
 * Which of these paths git deliberately does not track -- ONE `check-ignore --stdin`, because per-path calls
 * took the test past two minutes. Exit 1 means "nothing matched", a normal answer; outside a git repository
 * the answer is the empty set.
 * @param {string} root @param {string[]} paths @returns {Set<string>}
 */
export function gitIgnoredAmong(root, paths) {
  if (paths.length === 0) return new Set();
  /** @type {string} */
  let out;
  try {
    out = execFileSync("git", ["check-ignore", "--stdin"],
      { cwd: root, env: sandboxGitEnv(), input: `${paths.join("\n")}\n`, encoding: "utf8", stdio: "pipe" });
  } catch (error) {
    out = String(/** @type {{ stdout?: string }} */ (error).stdout ?? "");
  }
  return new Set(out.split("\n").map((line) => line.trim()).filter(Boolean));
}

/**
 * Cited paths that exist here but are gitignored -- present only by residue, absent on a fresh checkout.
 * @param {string} root @returns {{ untracked: string[], scanned: number }}
 */
export function untrackedCitations(root) {
  const generated = new Set(GENERATED_CITATIONS.map((entry) => entry.path));
  const cited = citedPaths(root).filter(({ path }) => !generated.has(path) && existsSync(join(root, path)));
  const ignored = gitIgnoredAmong(root, [...new Set(cited.map((entry) => entry.path))]);
  return { untracked: cited.filter((entry) => ignored.has(entry.path)).map((entry) => `${entry.doc}: ${entry.path}`),
    scanned: cited.length };
}

/** @param {string} root @returns {import("./check-result.mjs").CheckResult} */
export function check(root) {
  const { broken, checked } = brokenCitations(root, { generatedResolves: true });
  const split = (/** @type {string} */ line) => ({ where: line.split(": ")[0], reference: line.split(": ").slice(1).join(": ") });
  return {
    examined: checked,
    unit: `paths cited by ${DOCS.join(", ")}`,
    disagreements: [
      ...missingDocs(root).map((doc) => ({ where: doc, reference: doc, why: "this top-level document is itself missing" })),
      ...broken.map((line) => ({ ...split(line), why: "points at nothing -- a reader following it gets a dead end" })),
      ...untrackedCitations(root).untracked.map((line) => ({ ...split(line),
        why: "exists here but is gitignored, so a fresh checkout does not have it" })),
    ],
  };
}
