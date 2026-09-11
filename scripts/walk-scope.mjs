#!/usr/bin/env node
// @ts-check
// A TREE-WALKING GUARD DECLARES THE SUBTREE IT WALKS, AND ITS OWN RUN PROVES IT -- #929.
//
// `select-changed-tests.mjs`'s `alwaysRunTests` runs every guard whose population is discovered from the tree,
// on every pull request, because *"a file added anywhere can join the population of a guard living anywhere
// else"*. That is right for a guard whose population IS the repository. Measured by running all 131 of them
// under this module's observer: 38 walk the whole repository and 69 read inside a product package -- but 24
// read nothing a product diff can touch, and 6 of those nothing outside their own imports at all. Five of the
// 6 transitively import `scripts/ready-label-audit.mjs`, whose `run("git", ["for-each-ref", ...])` the static
// predicate reads as a walk; the tests never take that path. A first observer that saw only the sync `fs`
// calls and argv `git` counted 17 / 83 / 31: child processes and root listings, which it could not see, are
// the difference.
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
import { basename, isAbsolute, relative, resolve } from "node:path";
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
//
// A DECLARATION IS ONLY AS GOOD AS WHAT THIS SEES, and an unseen read is a false pass: the exact defect the
// check exists to catch. So every route to the tree is either recorded or FAILS CLOSED.
//   - `fs`: every call that lists, opens or tests a path, in all three spellings -- sync, callback, and
//     `fs.promises`, which is the same object as `node:fs/promises`. The first version wrapped only the sync
//     calls, so a guard walking with `await readdir(...)` would have passed any declaration at all.
//   - `git` with an argv: `ls-files`, and `grep` after `--`, are recorded by pathspec; `rev-parse`, `config`
//     and `var` read no population; EVERY OTHER subcommand is the whole repository.
//   - ANY OTHER CHILD PROCESS -- `node`, `rg`, a shell, `git` inside a shell string -- is the whole
//     repository. What a child reads is invisible from here, so a guard that spawns one cannot be verified,
//     and an unverifiable declaration is the one #929 exists to refuse.
// Not seen: `import()` of a computed path (the loader reads off this thread) and worker threads. Neither is
// recorded, so `declared-walk-scope.test.ts` pins both as absent from every declaring guard instead.
// ---------------------------------------------------------------------------------------------------------

/** @type {Set<string>} */
let observedReads = new Set();

/** @param {string} how */
const unbounded = (how) => `${WHOLE_REPOSITORY} -- ${how}`;

/** @param {unknown} target @param {string} base @returns {string | null} repo-relative ("" is the root), or null */
function repoPath(target, base) {
  let path = target;
  if (path instanceof URL || (typeof path === "string" && path.startsWith("file:"))) path = fileURLToPath(path);
  if (typeof path !== "string" && !Buffer.isBuffer(path)) return null; // a file descriptor: not a path
  const rel = relative(REPO_ROOT, resolve(base, String(path)));
  if (rel === ".." || rel.startsWith("../") || isAbsolute(rel)) return null;
  if (rel.split("/").some((segment) => segment === "node_modules" || segment === ".git")) return null;
  // `runs/` is gitignored, so nothing under it can ever be a changed file -- it cannot select or deselect a
  // guard. Counted, a guard that reads the corpus when one happens to exist would fail its own check on a
  // laptop that has a corpus and pass it in CI, which has none: a verdict that depends on the machine.
  if (rel === "runs" || rel.startsWith("runs/")) return null;
  return rel;
}

/** @param {unknown} cwd @returns {string} */
const baseOf = (cwd) => resolve(process.cwd(),
  cwd instanceof URL ? fileURLToPath(cwd) : typeof cwd === "string" ? cwd : ".");

/** A path the process opened, statted or tested. The root itself is no population. */
function recordRead(/** @type {unknown} */ target, base = process.cwd()) {
  const path = repoPath(target, base);
  if (path) observedReads.add(path);
}

/** A directory the process LISTED. Listing the root is walking the whole repository. */
function recordListing(/** @type {unknown} */ target, base = process.cwd()) {
  const path = repoPath(target, base);
  if (path !== null) observedReads.add(path === "" ? unbounded("listed the repository root") : path);
}

/** A glob lists from its static prefix: `packages/{a,b}/src/**` walks `packages`. */
function recordGlob(/** @type {unknown} */ pattern, /** @type {{ cwd?: unknown } | undefined} */ options) {
  for (const each of [pattern].flat()) {
    const segments = String(each).split("/");
    const literal = segments.slice(0, Math.max(0, segments.findIndex((s) => /[*?[\]{}()!]/.test(s))));
    recordListing(segments.some((s) => /[*?[\]{}()!]/.test(s)) ? literal.join("/") : String(each), baseOf(options?.cwd));
  }
}

// `git`'s own options that take a value in the NEXT argument. Unskipped, `git -c core.quotepath=off ls-files
// scripts` reads its subcommand as `core.quotepath=off` -- unknown, so the whole repository. That fails closed,
// but it fails a declaration that was right; skipping the value is what lets the pathspec bound it.
const GIT_OPTION_WITH_VALUE = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--config-env"]);
const POPULATION_FREE_GIT = new Set(["rev-parse", "config", "var", "version", "check-ref-format"]);

/**
 * Where `git` runs and what it was asked, past its own options.
 * @param {string[]} argv @param {string} base
 */
function gitInvocation(argv, base) {
  let where = base;
  let at = 0;
  for (; at < argv.length && argv[at].startsWith("-"); at += 1) {
    if (argv[at] === "-C") where = resolve(where, argv[at + 1] ?? ".");
    if (GIT_OPTION_WITH_VALUE.has(argv[at])) at += 1;
  }
  return { where, subcommand: argv[at], rest: argv.slice(at + 1) };
}

/**
 * The pathspecs a tree-reading subcommand was bounded to, or null when nothing bounds it.
 *
 * `ls-files` takes pathspecs anywhere; `grep`'s first operand is its PATTERN, so only what follows `--` is a
 * path. Recorded by operand position, `git grep scripts` -- the word, searched for everywhere -- read as a
 * walk of `scripts/` and passed a declaration of it.
 * @param {string} subcommand @param {string[]} rest
 * @returns {string[] | null}
 */
function gitPathspecs(subcommand, rest) {
  if (subcommand !== "ls-files" && subcommand !== "grep") return null;
  const dashes = rest.indexOf("--");
  if (dashes >= 0) return rest.slice(dashes + 1);
  return subcommand === "ls-files" ? rest.filter((arg) => !arg.startsWith("-")) : null;
}

/** @param {unknown[]} args @param {{ cwd?: unknown } | undefined} options */
function recordGit(args, options) {
  const { where, subcommand, rest } = gitInvocation(args.map(String), baseOf(options?.cwd));
  // A git run somewhere else entirely -- a fixture repository in a temp directory -- reads nothing here.
  if (repoPath(where, where) === null) return;
  if (subcommand === undefined || POPULATION_FREE_GIT.has(subcommand)) return;
  const pathspecs = gitPathspecs(subcommand, rest);
  if (pathspecs === null) { observedReads.add(unbounded(`git ${subcommand}`)); return; }
  if (pathspecs.length === 0) recordListing(".", where);
  for (const spec of pathspecs) recordGlob(spec.replace(/^:\([^)]*\)/, ""), { cwd: where });
}

// A command line only a shell can read: `git ls-files | wc -l` is two processes, and which paths the second
// touches is not in the string.
const SHELL_SYNTAX = /[|&;<>()$`\\"'*?[\]{}~!#\n]/;

/** @param {unknown} command @param {{ cwd?: unknown } | undefined} options */
function recordCommandLine(command, options) {
  const line = String(command).trim();
  if (/^git\s/.test(line) && !SHELL_SYNTAX.test(line)) recordGit(line.split(/\s+/).slice(1), options);
  else observedReads.add(unbounded(`a shell ran \`${line.slice(0, 60)}\``));
}

/** @param {unknown} file @param {unknown[]} rest the arguments after `file`, in whichever overload was used */
function recordSpawn(file, rest) {
  const args = Array.isArray(rest[0]) ? rest[0] : [];
  const options = /** @type {{ cwd?: unknown, shell?: unknown } | undefined} */ (
    rest.find((r) => r !== null && typeof r === "object" && !Array.isArray(r)));
  if (options?.shell) recordCommandLine([file, ...args].join(" "), options);
  else if (basename(String(file)) === "git") recordGit(args, options);
  else observedReads.add(unbounded(`a child process, \`${basename(String(file))}\`, whose reads are not visible here`));
}

/**
 * Replace `owner[name]` with a wrapper that records before it calls through. Own properties are carried
 * across: `realpathSync.native` is called directly, and `exists` keeps a `util.promisify.custom`.
 * @param {Record<string, any>} owner @param {string} name @param {(args: unknown[]) => void} record
 */
function wrap(owner, name, record) {
  const original = owner[name];
  if (typeof original !== "function") return;
  const observed = function observed(/** @type {unknown[]} */ ...args) {
    record(args);
    // @ts-expect-error -- `this` is whatever the caller bound, passed through untouched
    return original.apply(this, args);
  };
  for (const key of Reflect.ownKeys(original)) {
    if (key === "length" || key === "name" || key === "prototype") continue;
    Object.defineProperty(observed, key, /** @type {PropertyDescriptor} */ (Object.getOwnPropertyDescriptor(original, key)));
  }
  owner[name] = observed;
}

const LISTS = ["readdir", "opendir"];
const READS = ["readFile", "stat", "lstat", "access", "open", "realpath", "readlink", "exists"];

function install() {
  const read = (/** @type {unknown[]} */ [target]) => recordRead(target);
  const list = (/** @type {unknown[]} */ [target]) => recordListing(target);
  const glob = (/** @type {unknown[]} */ [pattern, options]) => recordGlob(pattern, /** @type {any} */ (options));
  for (const owner of [fs, fs.promises]) {
    for (const name of LISTS) { wrap(owner, name, list); wrap(owner, `${name}Sync`, list); }
    for (const name of READS) { wrap(owner, name, read); wrap(owner, `${name}Sync`, read); }
    wrap(owner, "glob", glob);
    wrap(owner, "globSync", glob);
  }
  wrap(fs, "createReadStream", read);
  for (const name of ["execFileSync", "spawnSync", "execFile", "spawn", "fork"]) {
    wrap(childProcess, name, ([file, ...rest]) => (name === "fork" ? recordSpawn(process.execPath, rest) : recordSpawn(file, rest)));
  }
  for (const name of ["exec", "execSync"]) {
    wrap(childProcess, name, ([command, options]) => recordCommandLine(command, /** @type {any} */ (options)));
  }
  // Named ESM imports of a builtin are a snapshot of its exports; this re-points them at the wrappers -- for
  // `node:fs/promises` too, whose exports are `fs.promises`.
  syncBuiltinESMExports();
}
install();

/** Every repo-relative path read since this module was imported. */
export function readsSoFar() {
  return [...observedReads].sort();
}

/**
 * The paths read while `run` runs, and only those -- how `declared-walk-scope.test.ts` proves each route is
 * seen. Tested against `readsSoFar()` instead, a path something else had already read would pass vacuously.
 * @param {() => unknown} run
 * @returns {Promise<string[]>}
 */
export async function readsDuring(run) {
  const outer = observedReads;
  observedReads = new Set();
  try {
    await run();
    return [...observedReads].sort();
  } finally {
    for (const path of observedReads) outer.add(path);
    observedReads = outer;
  }
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
  return reads.filter((path) => path.startsWith(WHOLE_REPOSITORY) || (!ownFiles.has(path) && !inScope(path, scope)));
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
    const [{ sourceClosure, packageIndex }, { knownPackages }] = await Promise.all(
      [import("./select-changed-tests.mjs"), import("./ci-changed.mjs")]);
    const packages = packageIndex(REPO_ROOT, knownPackages(REPO_ROOT));
    const own = new Set([...sourceClosure(testPath, REPO_ROOT, packages)]
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
