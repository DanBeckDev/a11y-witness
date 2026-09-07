#!/usr/bin/env node
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
 */

import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { refuseUnknownFlags } from "@a11y-witness/worker-fleet/cli-flags";

const STATUS_TOOLS = ["head", "tail", "grep"];

/** Split a compound shell command into its top-level statements: `;`, `&&`, `||`, and newlines. */
function statementsOf(cmd) {
  return cmd.split(/;|&&|\|\||\r?\n/).map((s) => s.trim()).filter(Boolean);
}

/**
 * True when `stmt`'s pipeline ENDS in one of the status tools — i.e. that tool's exit code is what a
 * plain, non-`pipefail` shell reports for the whole pipeline. A tool that appears mid-pipeline (piped
 * INTO something else afterward) does not own the exit status and is not the hazard.
 */
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
  const { hazard, reason } = checkPipedExitStatus(cmd);
  console.log(`${hazard ? "REFUSE" : "ALLOW"}: ${reason}`);
  process.exit(hazard ? 1 : 0);
}
