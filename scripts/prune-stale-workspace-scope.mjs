// #376: `npm install` ADDS a new workspace scope's node_modules symlinks and does not remove an old one,
// so after a rename both scopes resolve to the same packages -- a leftover `@old-scope/*` import does not
// throw `ERR_MODULE_NOT_FOUND` on a machine that has ever installed the previous scope, it works. It fails
// only on a fresh install (CI, a new clone, the next person who deletes node_modules), by which point the
// commit has landed. Run from `prepare`, so this fires on every plain `npm install` without anyone having
// to remember a bespoke postinstall step.
//
// DERIVED, NEVER HARD-CODED: the current scope is read from a real workspace package.json, and a stale
// scope is identified structurally -- a `node_modules/@*` directory whose members are symlinks resolving
// into this repo's own `packages/`, and that is not the current scope -- so the NEXT rename needs nothing
// edited here. A scope named `@a11y-witness` literally would answer only this rename and go quiet on the
// one after it.
//
// MUST NEVER FAIL AN INSTALL, the same rule `install-git-hooks.mjs` states for itself: every failure here
// is reported and swallowed, never thrown, because a broken symlink or an unreadable directory is not a
// reason to break `npm install`.
import { readFileSync, readdirSync, lstatSync, realpathSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
// RELATIVE, NOT `@a11ign/worker-fleet/cli-flags`: this is a `prepare`-time script, which npm runs on every
// plain `npm install` before any package's `dist/` exists -- the same reason `install-git-hooks.mjs`
// imports the same file the same way. `pre-install-import-graph.test.ts` derives this file from
// `package.json`'s `prepare` and enforces it.
import { refuseUnknownFlags } from "../packages/worker-fleet/src/cli-flags.mjs";

const REPO = fileURLToPath(new URL("..", import.meta.url));

/**
 * The scope this workspace currently uses, read from the first scoped `package.json` found under
 * `packages/`. Returns `undefined` rather than guessing when none is scoped.
 * @param {{ repo?: string, readdir?: typeof readdirSync, readFile?: typeof readFileSync }} [deps]
 * @returns {string | undefined}
 */
export function currentWorkspaceScope({ repo = REPO, readdir = readdirSync, readFile = readFileSync } = {}) {
  let entries;
  try { entries = readdir(join(repo, "packages"), { withFileTypes: true }); } catch { return undefined; }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    let pkg;
    try { pkg = JSON.parse(readFile(join(repo, "packages", entry.name, "package.json"), "utf8")); }
    catch { continue; }
    if (typeof pkg.name === "string" && pkg.name.startsWith("@")) return pkg.name.split("/")[0];
  }
  return undefined;
}

/**
 * Does at least one member of `scopeDir` symlink into `packagesRoot`? That is what makes a
 * `node_modules/@*` directory a WORKSPACE scope rather than an ordinary scoped dependency.
 * @param {{ scopeDir: string, packagesRoot: string, readdir: typeof readdirSync,
 *           lstat: typeof lstatSync, realpath: typeof realpathSync }} args
 * @returns {boolean}
 */
function isWorkspaceScopeDir({ scopeDir, packagesRoot, readdir, lstat, realpath }) {
  let members;
  try { members = readdir(scopeDir, { withFileTypes: true }); } catch { return false; }
  return members.some((member) => {
    const full = join(scopeDir, member.name);
    try { return lstat(full).isSymbolicLink() && realpath(full).startsWith(packagesRoot); }
    catch { return false; }
  });
}

/**
 * Which `node_modules/@*` directories are a STALE workspace scope: their members are symlinks resolving
 * into this repo's own `packages/`, and the scope name is not the current one. Structural, not by name,
 * so it survives the next rename unedited.
 * @param {{ repo?: string, readdir?: typeof readdirSync, lstat?: typeof lstatSync,
 *           realpath?: typeof realpathSync, currentScope?: string }} [deps]
 * @returns {string[]}
 */
export function staleWorkspaceScopes({ repo = REPO, readdir = readdirSync, lstat = lstatSync,
  realpath = realpathSync, currentScope } = {}) {
  const nodeModules = join(repo, "node_modules");
  let entries;
  try { entries = readdir(nodeModules, { withFileTypes: true }); } catch { return []; }
  const scope = currentScope ?? currentWorkspaceScope({ repo });
  if (!scope) return [];
  // Resolved from wherever `node_modules` ITSELF resolves, never from `repo` directly. A worktree's
  // `node_modules` is a symlink to the PRIMARY checkout's, so every workspace member inside it points at
  // the PRIMARY's `packages/` -- measured: `.../worktree/node_modules/@scope/judge` realpaths to
  // `.../primary/packages/judge`, not to anything under the worktree's own tree. Comparing against
  // `repo`'s own `packages/` made every real workspace symlink read as "outside packages/" and this
  // function returned `[]` from inside a worktree even with a genuinely stale scope present.
  let packagesRoot;
  try { packagesRoot = join(realpath(nodeModules), "..", "packages") + "/"; }
  catch { return []; }
  const isScopeCandidate = (entry) => entry.isDirectory() && entry.name.startsWith("@") && entry.name !== scope;
  return entries
    .filter(isScopeCandidate)
    .filter((entry) => isWorkspaceScopeDir({
      scopeDir: join(nodeModules, entry.name), packagesRoot, readdir, lstat, realpath,
    }))
    .map((entry) => entry.name);
}

/**
 * Remove every stale workspace scope found. Reports what it removed and what it could not; never throws.
 * @param {{ repo?: string, log?: (line: string) => void, remove?: (path: string, opts: { recursive: true, force: true }) => void }} [deps]
 */
export function pruneStaleWorkspaceScopes({ repo = REPO, log = console.error, remove = rmSync } = {}) {
  const scope = currentWorkspaceScope({ repo });
  if (!scope) {
    log("  workspace scope prune: no scoped workspace package.json found -- nothing to derive the current scope from.");
    return;
  }
  const stale = staleWorkspaceScopes({ repo, currentScope: scope });
  for (const name of stale) {
    const target = join(repo, "node_modules", name);
    try {
      remove(target, { recursive: true, force: true });
      log(`  removed stale workspace scope node_modules/${name} (current scope is ${scope})`);
    } catch (cause) {
      log(`  could not remove stale workspace scope node_modules/${name}: ${/** @type {Error} */ (cause).message}`
        + ` -- remove it by hand: rm -rf node_modules/${name}`);
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) {
  refuseUnknownFlags([], { entry: import.meta.url, command: "node scripts/prune-stale-workspace-scope.mjs" });
  pruneStaleWorkspaceScopes();
}
