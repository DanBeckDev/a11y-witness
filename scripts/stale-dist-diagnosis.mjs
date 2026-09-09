#!/usr/bin/env node
// @ts-check
// command: augment a resolution failure naming a missing export or module with a stale-dist diagnosis
//
// TWO REAL INCIDENTS, ONE AFTERNOON, BOTH MISDIAGNOSED. `SyntaxError: The requested module
// '@a11ign/evidence/conformance' does not provide an export named 'activationBudgetFromDiagnostics'`
// reads as "somebody removed the export". `error TS2307: Cannot find module
// '@a11ign/evidence/document-identity'` reads as "that module does not exist". Both exports existed, in
// the source, on `main` -- the `dist` being resolved simply predated the source it was built from, which
// is exactly the shape #751 made rarer (a fast-forward now rebuilds) and did not make impossible.
//
// NOT AN AUTO-REBUILD. Silently changing the tree in response to a failing command is the shape this
// repository has paid for more than once -- "the remedy fired and nothing recorded it". This only
// DIAGNOSES: it reads two mtimes and appends a line, never touches a file.
//
// NOT A CHECK ON EVERY IMPORT. This runs once, reactively, against the text of a failure that already
// happened -- the cost belongs at the point of failure, never on the happy path.
import { existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { refuseUnknownFlags } from "../packages/worker-fleet/src/cli-flags.mjs";

const require = createRequire(import.meta.url);

/**
 * `packages/<pkg>/dist/<name>.js` (or `.d.ts`) -> its source file, whichever extension this repo's own
 * build actually produced it from. ONE mapping, not guessed per package: every published package here
 * mirrors `dist/<name>.{js,d.ts}` from exactly one `src/<name>.{ts,mts,mjs}` (`.mjs` for the handful of
 * packages, like `nvda-worker`, that ship plain source with no TypeScript build at all -- see ADR 0031 --
 * though those have no `dist` for this function to be asked about in the first place).
 * @param {string} distPath
 * @returns {string | null}
 */
export function srcPathFor(distPath) {
  if (!distPath.includes("/dist/")) return null;
  const withoutExt = distPath.replace("/dist/", "/src/").replace(/\.(d\.ts|js)$/, "");
  for (const ext of [".ts", ".mts", ".mjs"]) {
    if (existsSync(withoutExt + ext)) return withoutExt + ext;
  }
  return null;
}

/**
 * The line to APPEND to an existing resolution failure -- never a replacement for it, and never printed
 * at all unless `dist` really is older than the `src` it claims to be built from. `null` on every other
 * outcome (either path missing, or `dist` current) is the acceptance-3 case: a genuinely missing export
 * with a current build must report nothing extra, or this becomes noise on the case it was not written
 * for and gets filtered like any other warning that cries wolf.
 * @param {string} distPath @param {string} srcPath
 * @returns {string | null}
 */
export function staleDistNote(distPath, srcPath) {
  if (!existsSync(distPath) || !existsSync(srcPath)) return null;
  const distMtime = statSync(distPath).mtime;
  const srcMtime = statSync(srcPath).mtime;
  if (distMtime.getTime() >= srcMtime.getTime()) return null;
  return "STALE DIST, possibly the real cause of the error above:\n"
    + `    ${distPath}\n    built    ${distMtime.toISOString()}\n`
    + `    ${srcPath}\n    modified ${srcMtime.toISOString()} -- AFTER the build above.\n`
    + "  A dist older than its source can report a missing export or module that exists in the source you "
    + "are reading. Run `npm run build` (or `npm run primary:update` in a shared checkout with worktrees) "
    + "and re-run the command that produced the error above before trusting it.";
}

// The two real shapes from #789's own two incidents. Both name the specifier; only the SyntaxError also
// names the missing export (a TS2307 "cannot find module" has nothing more specific to blame).
const MISSING_EXPORT = /The requested module '([^']+)' does not provide an export named '([^']+)'/;
const MISSING_MODULE = /Cannot find module '([^']+)'/;

/**
 * The specifier a resolution failure's own text names, or `null` if this text matches neither known
 * shape -- in which case there is nothing here for this tool to diagnose.
 * @param {string} errorText
 * @returns {string | null}
 */
export function specifierFromFailure(errorText) {
  return errorText.match(MISSING_EXPORT)?.[1] ?? errorText.match(MISSING_MODULE)?.[1] ?? null;
}

/**
 * The whole tool: given the TEXT of a resolution failure (stderr from a crashed `node`/`tsx`/`tsc`
 * invocation, pasted or captured) and a resolver, return the stale-dist note to print ALONGSIDE the
 * original error -- or `null` when there is nothing to add.
 *
 * `resolve` is injected (defaulting to this repo's own `require.resolve`) rather than derived from a
 * "which file failed" argument: a real diagnosis run from anywhere in this workspace reaches the same
 * flattened `node_modules`, so there is no second resolution context to reproduce, and a test can supply
 * one pointed at a synthetic fixture without touching a real published package.
 * @param {string} errorText @param {(specifier: string) => string} [resolve]
 * @returns {string | null}
 */
export function diagnoseResolutionFailure(errorText, resolve = require.resolve) {
  const specifier = specifierFromFailure(errorText);
  if (!specifier) return null;
  let distPath;
  try {
    distPath = resolve(specifier);
  } catch {
    return null; // truly unresolvable -- nothing this tool can add to an error that is not stale-dist
  }
  const srcPath = srcPathFor(distPath);
  if (!srcPath) return null;
  return staleDistNote(distPath, srcPath);
}

function usage() {
  return "Usage: node scripts/stale-dist-diagnosis.mjs <file with the failure's stderr>\n"
    + "  Paste or redirect the raw error text from a resolution failure -- a SyntaxError naming a "
    + "missing export, or a TS2307 'Cannot find module' -- and this names whether the dist behind it "
    + "is older than its own source.\n";
}

function main() {
  // Takes no flags at all -- one positional argument, the file to read. Refusing an unrecognised `--flag`
  // rather than silently ignoring it matters more here than almost anywhere else in this repo: a
  // diagnosis tool that ignores `--verbose` and answers anyway is exactly the "ignored input, plausible
  // wrong answer" shape #789 itself exists to fix, one layer over.
  refuseUnknownFlags([], { entry: import.meta.url, command: "node scripts/stale-dist-diagnosis.mjs" });
  const [file] = process.argv.slice(2);
  if (!file) {
    process.stderr.write(usage());
    process.exitCode = 2;
    return;
  }
  const errorText = readFileSync(file, "utf8");
  const note = diagnoseResolutionFailure(errorText);
  if (note) {
    process.stdout.write(`${note}\n`);
    return;
  }
  process.stdout.write("No stale-dist signature found in that text -- either the specifier resolved to a "
    + "current build, or this text does not match a resolution failure this tool recognises.\n");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
