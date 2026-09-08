#!/usr/bin/env node
// @ts-check
// command: detect a piped command whose exit status was read from the wrong side of the pipe
/**
 * Detects the shape behind issue #180: `cmd | head` (or `| tail`, `| grep`) reports the STATUS TOOL's
 * exit code, not the piped command's — so `$?` read afterward names the wrong thing. Measured twice in
 * one night, once an hour after the first was diagnosed and warned about: `node scripts/merge-guard.mjs
 * 148 | head -4; echo EXIT=$?` printed `EXIT=0` for a command that actually exited 2.
 *
 * Deliberately narrow. A pipeline ending in head/tail/grep is only hazardous when something AFTER it
 * reads `$?` — `cat README.md | head -5` with nothing reading its status is completely fine, and is not
 * flagged. This is a heuristic over shell TEXT, not a real shell parser: it cannot see `set -o pipefail`
 * unless the same string mentions it, and it cannot see a `$?` read that a variable or function hides.
 * That is the tradeoff the issue itself calls for — measuring the real population first (38 pipe-to-
 * head/tail/grep sites across .sh/.mjs/.yml on 2026-09-07, none of them this hazard) rather than shipping
 * a remedy that fires on legitimate use and gets disabled.
 *
 * #535: NO WORKSPACE IMPORT, DELIBERATELY. This file used to import `@a11ign/worker-fleet/cli-flags` for
 * its own unknown-flag guard, and that import is exactly what broke it: `pre-commit` invokes this script
 * in EVERY worktree, including one created before `node_modules` is symlinked in, and there the import
 * throws `ERR_MODULE_NOT_FOUND` -- which pre-commit's `>/dev/null 2>&1` swallowed and misread as a hazard
 * on every single staged line (`fi`, `else`, `run: |`, prose comments -- none of them pipe anything).
 * `scripts/check-schema-migration.mjs` is this repo's own precedent for the identical bind (it is copied
 * into a throwaway directory with no `node_modules` by its own gate test) -- its one flag is checked with
 * a bare `process.argv.includes(...)`, no workspace import, and this file now does the same.
 *
 * #375: `checkPipedExitStatus` alone is WHOLE-TEXT — it flattens every `;`/`&&`/`||`/newline-separated
 * statement in whatever text it is given into ONE list and asks "does ANY of them read `$?`", with no
 * notion of which FUNCTION a statement lives in. Fine for a single diff LINE (pre-commit's own use, one
 * statement or a short chain, never more than one function's worth of text) and wrong for a whole FILE:
 * `scripts/git-hooks/pre-push` pipes into `grep` in `note_if_untouched()` and reads `$?` correctly,
 * redirected to a file, in the UNRELATED `run()` function -- and the flattened check reads the second as
 * answering the first. `checkPipedExitStatusInText` below scopes each hazard determination to the
 * FUNCTION it was found in (or the top-level code before any function), by running the existing,
 * UNCHANGED per-block logic independently per function -- so a single-statement or single-function input
 * (everything `checkPipedExitStatus` was ever called with before this) behaves identically, and only a
 * multi-function file stops bleeding across the boundary.
 */

import { realpathSync, readFileSync, existsSync, statSync } from "node:fs";
import { pathToFileURL } from "node:url";

const STATUS_TOOLS = ["head", "tail", "grep"];

/**
 * Split a compound shell command into its top-level statements: `;`, `&&`, `||`, and newlines.
 * @param {string} cmd
 */
function statementsOf(cmd) {
  return cmd.split(/;|&&|\|\||\r?\n/).map((s) => s.trim()).filter(Boolean);
}

/**
 * True when `stmt`'s pipeline ENDS in one of the status tools — i.e. that tool's exit code is what a
 * plain, non-`pipefail` shell reports for the whole pipeline. A tool that appears mid-pipeline (piped
 * INTO something else afterward) does not own the exit status and is not the hazard.
 */
/** @param {string} stmt */
function endsInStatusTool(stmt) {
  const lastPipe = stmt.lastIndexOf("|");
  if (lastPipe === -1) return false;
  const after = stmt.slice(lastPipe + 1).trim();
  const word = after.split(/\s+/)[0];
  return STATUS_TOOLS.includes(word);
}

const EXIT_STATUS_RE = /\$\?/;
const PIPEFAIL_RE = /\bpipefail\b/;

/**
 * @param {string} cmd a shell command string (may be multi-statement / multi-line)
 * @returns {{ hazard: boolean, reason: string }}
 */
export function checkPipedExitStatus(cmd) {
  if (PIPEFAIL_RE.test(cmd)) {
    return { hazard: false, reason: "pipefail is mentioned in the same text -- assumed handled" };
  }
  const statements = statementsOf(cmd);
  const pipedStatement = statements.find(endsInStatusTool);
  if (!pipedStatement) {
    return { hazard: false, reason: "no pipeline ends in head/tail/grep" };
  }
  const readsExitStatus = statements.some((s) => EXIT_STATUS_RE.test(s));
  if (!readsExitStatus) {
    return { hazard: false, reason: `pipes into a status tool ("${pipedStatement}") but nothing reads $?` };
  }
  return {
    hazard: true,
    reason: `"${pipedStatement}" pipes into a status tool, and $? read afterward names ITS exit code, `
      + "not the piped command's",
  };
}

// `name() {` or `function name {` on its OWN line, brace on the same line -- the shape every function in
// this repo's own hook scripts uses (`mentioned_paths() {`, `note_if_untouched() {`, `run() { # comment`).
// A heuristic over TEXT, same tradeoff `checkPipedExitStatus` itself already makes: it cannot see a
// function whose brace lands on the NEXT line, and does not need to for the population this guards --
// the false-NEGATIVE direction (missing a boundary, so two functions get merged into one block) only
// widens the adjacency window back toward the OLD whole-text behaviour, never past it.
const FUNCTION_START_RE = /^\s*(?:function\s+)?[A-Za-z_][\w-]*\s*\(\)\s*\{/;

/**
 * Split multi-line shell text into BLOCKS at each top-level function definition: everything before the
 * first one is its own block (module-level code), and each function's body runs until the next function
 * definition or end of text. Never splits WITHIN a function, so `checkPipedExitStatus`'s existing
 * statement-flattening keeps working exactly as before on each block.
 * @param {string} text
 * @returns {string[]}
 */
export function splitIntoBlocks(text) {
  const lines = text.split(/\r?\n/);
  /** @type {string[]} */
  const blocks = [];
  let current = [];
  for (const line of lines) {
    if (FUNCTION_START_RE.test(line) && current.length > 0) {
      blocks.push(current.join("\n"));
      current = [];
    }
    current.push(line);
  }
  if (current.length > 0) blocks.push(current.join("\n"));
  return blocks;
}

/**
 * The FILE-aware check #375 exists for: run `checkPipedExitStatus` -- UNCHANGED -- independently on each
 * function-scoped block, so a piped statement in one function and an unrelated `$?` read in another never
 * combine into a false hazard. A single-line or single-function input has exactly one block, so this
 * behaves identically to calling `checkPipedExitStatus` directly for every case that function was ever
 * used for before this.
 * @param {string} text
 * @returns {{ hazard: boolean, reason: string }}
 */
export function checkPipedExitStatusInText(text) {
  for (const block of splitIntoBlocks(text)) {
    const result = checkPipedExitStatus(block);
    if (result.hazard) return result;
  }
  return { hazard: false, reason: "no block pipes into a status tool with a $? read in the same function" };
}

// #535: THREE DISTINCT EXIT CODES, so the caller can tell "a real hazard" apart from "I could not decide"
// -- the same three-outcome discipline `acceptance-commands.mjs` already applies to RAN/REFUSED/MISSING
// (#353). `0` ALLOW, `1` REFUSE (a genuine hazard, this guard's own verdict), `2` ERROR (usage, or an
// unexpected exception -- this guard could not examine the input at all). Node's OWN default for an
// uncaught exception is exit code 1, which would collide with REFUSE and reproduce this exact bug one
// layer further in -- caught here explicitly so that collision can never happen again, regardless of what
// throws.
const EXIT_ALLOW = 0;
const EXIT_HAZARD = 1;
const EXIT_ERROR = 2;

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) {
  try {
    // Guarded per #164, WITHOUT a workspace import (#535, this file's own header) -- takes the command
    // POSITIONALLY (argv[2]) and no flags. Checked against `process.argv.slice(3)` -- everything AFTER
    // that positional -- never the default `.slice(2)`. The positional is arbitrary shell/YAML text and
    // routinely starts with `-` or `--` on its own merits (`---`, a YAML doc marker; `--foo` inside a
    // shell command being checked) -- checking IT for flag-shape misreads the PAYLOAD as an unknown flag
    // on this CLI's own command line (#349). Found the day this guard shipped, false-flagging on its own
    // pre-commit hook: `node ... "---"` (the line pre-commit feeds it for any newly-staged YAML file)
    // refused with "unknown flag ---".
    const extraArgs = process.argv.slice(3);
    if (extraArgs.length > 0) {
      console.error(`piped-exit-status-guard.mjs takes no flags; unexpected argument(s): ${extraArgs.join(", ")}`);
      process.exit(EXIT_ERROR);
    }
    const cmd = process.argv[2];
    if (!cmd) {
      console.error("usage: piped-exit-status-guard.mjs '<shell command string>'");
      process.exit(EXIT_ERROR);
    }
    // #375's own acceptance shape: a FILE PATH, checked whole-file and function-boundary-aware. Everything
    // pre-commit ever passes is a single staged LINE, which is never an existing path on disk, so this
    // never changes that call's behaviour -- `checkPipedExitStatus` alone still runs for it, unchanged.
    const isFile = existsSync(cmd) && statSync(cmd).isFile();
    const { hazard, reason } = isFile
      ? checkPipedExitStatusInText(readFileSync(cmd, "utf8"))
      : checkPipedExitStatus(cmd);
    console.log(`${hazard ? "REFUSE" : "ALLOW"}: ${reason}`);
    process.exit(hazard ? EXIT_HAZARD : EXIT_ALLOW);
  } catch (error) {
    // #535: THE WHOLE REASON THIS BLOCK EXISTS. A checker that returns the same verdict for every input
    // is broken, not thorough (measured live: 18 unrelated lines all reported REFUSE) -- so an unexpected
    // exception must never fall through to node's default exit-1 handling, which this guard's caller reads
    // as a real hazard. "GUARD ERROR" on stderr, and a code neither ALLOW nor HAZARD can produce any other
    // way, so `pre-commit` can tell the two apart without parsing this message's text.
    console.error(`GUARD ERROR: piped-exit-status-guard.mjs could not examine its input: `
      + `${/** @type {Error} */ (error).message}`);
    process.exit(EXIT_ERROR);
  }
}
