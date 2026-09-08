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
import { refuseUnknownFlags } from "@a11ign/worker-fleet/cli-flags";

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

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) {
  // Guarded per #164: takes the command POSITIONALLY (argv[2]) and no flags. The check is scoped to
  // `process.argv.slice(3)` -- everything AFTER that positional -- never the default `.slice(2)`.
  // The positional is arbitrary shell/YAML text and routinely starts with `-` or `--` on its own merits
  // (`---`, a YAML doc marker; `--foo` inside a shell command being checked) -- checking it for
  // flag-shape misreads the PAYLOAD as an unknown flag on this CLI's own command line (#349). Found the
  // day this guard shipped, false-flagging on its own pre-commit hook: `node ... "---"` (the line the
  // pre-commit hook feeds it for any newly-staged YAML file) refused with "unknown flag ---".
  refuseUnknownFlags([], {
    entry: import.meta.url,
    command: "node scripts/piped-exit-status-guard.mjs",
    argv: process.argv.slice(3),
  });
  const cmd = process.argv[2];
  if (!cmd) {
    console.error("usage: piped-exit-status-guard.mjs '<shell command string>'");
    process.exit(2);
  }
  // #375's own acceptance shape: a FILE PATH, checked whole-file and function-boundary-aware. Everything
  // pre-commit ever passes is a single staged LINE, which is never an existing path on disk, so this
  // never changes that call's behaviour -- `checkPipedExitStatus` alone still runs for it, unchanged.
  const isFile = existsSync(cmd) && statSync(cmd).isFile();
  const { hazard, reason } = isFile
    ? checkPipedExitStatusInText(readFileSync(cmd, "utf8"))
    : checkPipedExitStatus(cmd);
  console.log(`${hazard ? "REFUSE" : "ALLOW"}: ${reason}`);
  process.exit(hazard ? 1 : 0);
}
