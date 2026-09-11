#!/usr/bin/env node
// @ts-check
// A TREE-WALKING GUARD DECLARES THE SUBTREE IT WALKS, AND ITS OWN RUN PROVES IT -- #929.
//
// `select-changed-tests.mjs`'s `alwaysRunTests` runs every guard whose population is discovered from the tree,
// on every pull request, because *"a file added anywhere can join the population of a guard living anywhere
// else"*. That is right for a guard whose population IS the repository. Measured by running all 131 of them
// with their reads observed: 17 walk the whole repository and 83 read inside a product package -- but 31 read
// nothing a product diff can touch, and 14 of those read nothing outside their own imports at all. Those 14
// are flagged because they transitively import `scripts/ready-label-audit.mjs`, whose `run("git",
// ["for-each-ref", ...])` the static predicate reads as a walk; the tests never take that path.
//
// So a guard may DECLARE its scope -- `export const WALK_SCOPE = ["docs"];` -- and the selector drops it from
// the always-run set on a diff that touches none of it. Undeclared means unbounded: nothing changes for a
// guard that says nothing, because the failure mode of getting this wrong is a guard that silently stops
// running.
//
// THE DECLARATION IS CHECKED BY THE GUARD'S OWN RUN, never trusted. A static check could only have verified
// the 18 walks that pass literal roots to `walkTree`; 70 of the 131 walk with `readdirSync`/`globSync` over
// computed paths. So importing this module starts recording every path the process reads, and
// `declareWalkScope` fails the guard's own test file if anything it read lies outside what it declared. The
// check runs exactly when the guard runs -- selected precisely because its code changed, or because its
// declared scope was touched -- and costs no extra process.
//
// IMPORT THIS FIRST in a declaring guard. ES module bodies evaluate in import order, so a read made by a
// module imported ABOVE this one happens before the observer is installed and is not seen.
// `declared-walk-scope.test.ts` pins the ordering.
import { createRequire, syncBuiltinESMExports } from "node:module";
import { fileURLToPath } from "node:url";
import { isAbsolute, relative, resolve } from "node:path";
// THE STRING-AWARE ONE, which `select-changed-tests.mjs` already uses. `local-import-closure.mjs` has its own
// `stripComments`, a regex that does not know about strings -- so a `//` inside one (any URL) blanks the rest
// of its line. The first version of this file imported that one, and a guard whose first import named a
// `file://` URL read as declaring nothing. Two copies of one function; this uses the right one.
import { stripComments } from "@a11ign/evidence/source-text";

const require = createRequire(import.meta.url);
// Indexed by NAME below to wrap each function in turn, so typed as a record rather than as the module.
/** @type {Record<string, any>} */
const fs = require("node:fs");
/** @type {Record<string, any>} */
const childProcess = require("node:child_process");

export const REPO_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

/** A read that cannot be bounded to a subtree -- a whole-repository walk. Never inside any declared scope. */
export const WHOLE_REPOSITORY = "(the whole repository)";

// ---------------------------------------------------------------------------------------------------------
// THE DECLARATION -- read statically, because the selector must not import a test file to learn its scope.
// ---------------------------------------------------------------------------------------------------------

const DECLARATION = /^export\s+const\s+WALK_SCOPE(?:\s*:\s*[^=\n]+)?\s*=\s*\[([^\]]*)\]\s*(?:as\s+const\s*)?;/m;
// AN ATTEMPT at a declaration: the name BOUND by `const`/`let`/`var`. A bare mention -- in a regex literal, a
// property access, an assertion message -- is not one, and must not be refused: the selector parses every
// always-run guard, so a refusal there breaks selection for every pull request. The first version refused
// any mention in code and threw on the very test that pins this parser, whose assertions quote the name
// inside regex literals.
const ATTEMPT = /\b(?:const|let|var)\s+WALK_SCOPE\b/;
const QUOTED = /^(["'])([^"']+)\1$/;

/**
 * The scope a test file declares, or `null` when it declares none.
 *
 * `null` and `[]` are different answers and must stay different: `null` is "this guard has not said", which
 * keeps today's always-run behaviour; `[]` is "this guard reads nothing outside its own imports", which its
 * own run then has to prove.
 *
 * A file that BINDS `WALK_SCOPE` without declaring it in the one parseable form is REFUSED rather than read
 * as undeclared. Guessing there is the silent-loss direction: a malformed declaration read as none
 * keeps the guard running, but one read as `[]` would stop it.
 *
 * @param {string} source
 * @returns {string[] | null}
 */
export function parseWalkScope(source) {
  const code = stripComments(source);
  // NAMED IN CODE, not in a string. A test that talks about `WALK_SCOPE` in an assertion message or builds a
  // fixture containing the word has not declared anything -- and refusing it would crash the selector on
  // every pull request, since the selector parses every always-run guard.
  if (!ATTEMPT.test(blankLiterals(code, { templatesOnly: false }))) return null;
  // And never matched inside a template literal, where a fixture's text can start a line with exactly the
  // declaration's shape. Quoted strings are kept: the declaration's own entries are quoted strings.
  const match = DECLARATION.exec(blankLiterals(code, { templatesOnly: true }));
  if (!match) {
    throw new Error("walk-scope: `WALK_SCOPE` is named but not declared as `export const WALK_SCOPE = "
      + "[\"<path>\", ...];` -- refusing to guess, because a scope read wrongly is a guard that silently "
      + "stops running.");
  }
  const items = match[1].split(",").map((item) => item.trim()).filter(Boolean);
  return items.map((item) => {
    const quoted = QUOTED.exec(item);
    if (!quoted) throw new Error(`walk-scope: WALK_SCOPE entry ${item} is not a string literal`);
    return quoted[2].replace(/\/+$/, "");
  });
}

/**
 * The source with the CONTENTS of its string literals blanked (quotes kept, so positions and shape survive).
 * A small scanner rather than a regex: an escaped quote, or a quote character inside a different kind of
 * literal, is exactly where a regex silently ends a string early.
 *
 * @param {string} code comment-free source
 * @param {{ templatesOnly: boolean }} options blank only backtick templates, leaving quoted strings intact
 */
function blankLiterals(code, { templatesOnly }) {
  let out = "";
  /** @type {string | null} */
  let open = null;
  for (let i = 0; i < code.length; i += 1) {
    const ch = code[i];
    if (open === null) {
      if (ch === "`" || (!templatesOnly && (ch === "\"" || ch === "'"))) open = ch;
      out += ch;
      continue;
    }
    if (ch === "\\") { out += "  "; i += 1; continue; }
    if (ch === open) { open = null; out += ch; continue; }
    out += ch === "\n" ? "\n" : " ";
  }
  return out;
}

/**
 * Is this repo-relative path inside the declared scope? A scope entry covers itself and everything under it.
 *
 * @param {string} path
 * @param {readonly string[]} scope
 */
export function inScope(path, scope) {
  return scope.some((entry) => path === entry || path.startsWith(`${entry}/`));
}

// ---------------------------------------------------------------------------------------------------------
// THE OBSERVER -- installed on import, so it sees every read after this module evaluates.
// ---------------------------------------------------------------------------------------------------------

/** @type {Set<string>} */
const observedReads = new Set();

/** @param {unknown} target @returns {string | null} repo-relative, or null when it is not a path in this repo */
function repoPath(target) {
  let path = target;
  if (path instanceof URL) path = fileURLToPath(path);
  else if (typeof path === "string" && path.startsWith("file:")) path = fileURLToPath(path);
  if (typeof path !== "string" && !Buffer.isBuffer(path)) return null; // a file descriptor: not a path
  const absolute = resolve(process.cwd(), String(path));
  const rel = relative(REPO_ROOT, absolute);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) return null;
  if (rel.split("/").some((segment) => segment === "node_modules" || segment === ".git")) return null;
  // `runs/` is gitignored, so nothing under it can ever be a changed file -- it cannot select or deselect a
  // guard. Counted, a guard that reads the corpus when one happens to exist would fail its own check on a
  // laptop that has a corpus and pass it in CI, which has none: a verdict that depends on the machine.
  if (rel === "runs" || rel.startsWith("runs/")) return null;
  return rel;
}

// `git` subcommands that read the TREE. `ls-files` and `grep` are bounded by their pathspecs; the rest read
// content or history in ways a path cannot bound, so they are recorded as the whole repository. Anything
// else (`rev-parse`, `config`, `worktree list`) reads no population and is not recorded.
const BOUNDED_GIT = new Set(["ls-files", "grep"]);
const UNBOUNDED_GIT = new Set(["show", "cat-file", "diff", "log", "for-each-ref", "branch", "tag", "archive"]);

/** @param {unknown[]} args @param {{ cwd?: unknown } | undefined} options */
function recordGit(args, options) {
  const strings = args.map(String);
  const dashC = strings.indexOf("-C");
  const where = dashC >= 0 ? strings[dashC + 1] : String(options?.cwd ?? process.cwd());
  if (repoPath(resolve(process.cwd(), where)) === null && resolve(process.cwd(), where) !== REPO_ROOT) return;
  const rest = dashC >= 0 ? strings.filter((_, i) => i !== dashC && i !== dashC + 1) : strings;
  const subcommand = rest.find((arg) => !arg.startsWith("-"));
  if (subcommand && UNBOUNDED_GIT.has(subcommand)) { observedReads.add(WHOLE_REPOSITORY); return; }
  if (!subcommand || !BOUNDED_GIT.has(subcommand)) return;
  const pathspecs = rest.slice(rest.indexOf(subcommand) + 1).filter((arg) => !arg.startsWith("-") && arg !== "--");
  if (pathspecs.length === 0) { observedReads.add(WHOLE_REPOSITORY); return; }
  for (const spec of pathspecs) {
    const bare = spec.replace(/^:\([^)]*\)/, "").replace(/\/?\*.*$/, "");
    observedReads.add(bare === "" ? WHOLE_REPOSITORY : bare);
  }
}

function install() {
  for (const name of ["readdirSync", "readFileSync", "statSync", "lstatSync", "existsSync", "opendirSync", "globSync"]) {
    const original = fs[name];
    if (typeof original !== "function") continue;
    fs[name] = function observed(/** @type {unknown} */ target, /** @type {unknown[]} */ ...rest) {
      const path = repoPath(target);
      if (path !== null) observedReads.add(path);
      return original.call(this, target, ...rest);
    };
  }
  for (const name of ["execFileSync", "spawnSync", "execFile", "spawn"]) {
    const original = childProcess[name];
    childProcess[name] = function observed(/** @type {unknown} */ file, /** @type {unknown} */ args, /** @type {unknown[]} */ ...rest) {
      if (file === "git" && Array.isArray(args)) {
        recordGit(args, /** @type {any} */ (rest.find((r) => r && typeof r === "object")));
      }
      return original.call(this, file, args, ...rest);
    };
  }
  // Named ESM imports of a builtin are a snapshot of its exports; this re-points them at the wrappers.
  syncBuiltinESMExports();
}
install();

/** Every repo-relative path read since this module was imported. */
export function readsSoFar() {
  return [...observedReads].sort();
}

/**
 * The reads a declaration does not cover: outside the scope and outside the guard's own import closure.
 *
 * The closure is excluded because a change to it already selects the guard PRECISELY, whatever its scope --
 * reading its own imports is not a population, it is the guard's code.
 *
 * @param {readonly string[]} reads repo-relative
 * @param {readonly string[]} scope
 * @param {ReadonlySet<string>} ownFiles repo-relative paths in the guard's import closure
 */
export function readsOutsideScope(reads, scope, ownFiles) {
  return reads.filter((path) => path === WHOLE_REPOSITORY || (!ownFiles.has(path) && !inScope(path, scope)));
}

/** Every package's name -> { dir, exportsMap }, which `sourceClosure` resolves bare specifiers with. */
function packageIndex() {
  const packages = new Map();
  for (const entry of fs.readdirSync(resolve(REPO_ROOT, "packages"), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifest = resolve(REPO_ROOT, "packages", entry.name, "package.json");
    if (!fs.existsSync(manifest)) continue;
    const parsed = JSON.parse(fs.readFileSync(manifest, "utf8"));
    packages.set(parsed.name, { dir: entry.name, exportsMap: parsed.exports ?? {} });
  }
  return packages;
}

/**
 * Register the guard's own check: once every test in the file has run, anything it read outside its
 * declared scope fails the file.
 *
 * The scope is PARSED from the file's own source rather than passed in, so this checks exactly the fact the
 * selector acts on. A value handed in could differ from the literal the selector reads -- two copies of one
 * fact, which is the shape that produced #904's wrong numbers.
 *
 * @param {string} testUrl the declaring guard's `import.meta.url`
 */
export async function declareWalkScope(testUrl) {
  const { after } = await import("node:test");
  const testPath = fileURLToPath(testUrl);
  const scope = parseWalkScope(fs.readFileSync(testPath, "utf8"));
  if (scope === null) {
    throw new Error(`walk-scope: ${relative(REPO_ROOT, testPath)} calls declareWalkScope but declares no WALK_SCOPE`);
  }
  after(async () => {
    // SNAPSHOT FIRST, before this check reads anything itself. `packageIndex` and `sourceClosure` below read
    // every `package.json` and probe extensions for files that do not exist, through the same patched `fs` --
    // and counted as the guard's reads, they would be violations the guard never committed.
    const reads = readsSoFar();
    // Dynamic, not static: `select-changed-tests.mjs` imports this module for `parseWalkScope`, and a static
    // edge back would be a cycle evaluated before either side's exports exist.
    const { sourceClosure } = await import("./select-changed-tests.mjs");
    const own = new Set([...sourceClosure(testPath, REPO_ROOT, packageIndex())]
      .map((absolute) => relative(REPO_ROOT, absolute)));
    const outside = readsOutsideScope(reads, scope, own);
    if (outside.length > 0) {
      throw new Error(`${relative(REPO_ROOT, testPath)} declares WALK_SCOPE ${JSON.stringify(scope)} and read `
        + `${outside.length} path(s) outside it: ${outside.slice(0, 8).join(", ")}`
        + `${outside.length > 8 ? ", ..." : ""}. A declaration narrower than the walk is a guard that stops `
        + "running on a diff that would fail it -- widen WALK_SCOPE to cover these, or remove it.");
    }
  });
}
