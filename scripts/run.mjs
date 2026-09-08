#!/usr/bin/env node
// @ts-check
// command: the one-line dispatcher: run a named command from commands.mjs, or --list every command declared
/**
 * THE ONE-LINE DISPATCHER — A3.
 *
 *   node scripts/run.mjs --list             every command this repository declares, by name
 *   node scripts/run.mjs <name> [args...]   run one, passing everything after the name through
 *
 * A command in `commands.mjs` needs no `package.json` entry, which is the whole point: 19 PRs edited
 * `package.json` for unrelated reasons, so a changeset, a dependency bump and a new script collided in one
 * file for no reason connected to any of them.
 *
 * ## IT REFUSES AN UNKNOWN NAME AND SAYS WHAT IS NEAR IT
 *
 * The same rule as `refuseUnknownFlags`: an argument the receiving thing does not recognise must never be
 * DISCARDED, because the default then runs and reports success. A mistyped command name here would
 * otherwise be a silent no-op with exit 0, which is this repository's most-recorded shape.
 *
 * ## ARGUMENTS ARE PASSED THROUGH, NEVER RE-PARSED
 *
 * `spawnSync` with an argv array, never a shell string. A command's own flags are its business, and
 * putting a shell between the operator and the command is what sent four capture shards at
 * `--worker=http://:8765` for 29 minutes.
 */
import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { didYouMean } from "../packages/worker-fleet/src/cli-flags.mjs";
import { COMMANDS } from "./commands.mjs";

const EXIT = { REFUSED: 2 };

/**
 * PURE: what should happen for this argv? Separated from doing it so every outcome is exercisable without
 * spawning anything -- a dispatcher whose refusals are only reachable by running real commands is one
 * whose refusals never get tested.
 *
 * @param {string[]} argv @param {Record<string, {argv: string[]}>} commands
 * @returns {{action: "list"} | {action: "run", argv: string[]} | {action: "refuse", message: string}}
 */
export function decide(argv, commands) {
  const names = Object.keys(commands).sort();
  const [name, ...rest] = argv;
  if (!name || name === "--list") {
    return name === "--list" ? { action: "list" } : { action: "refuse",
      message: `node scripts/run.mjs <command> [args...]\n  --list  names every command\n\n`
        + `${names.length} command(s): ${names.join(", ")}` };
  }
  const command = commands[name];
  if (!command) {
    // `didYouMean` FROM `cli-flags.mjs`, not a second spelling of it. The first version of this file had
    // its own substring matcher, and my own test caught it failing on `merge-gaurd` -- a transposition,
    // the commonest typo there is, which no substring test can see. That module already carries a
    // Levenshtein written for exactly this question, so the fix was to delete the copy rather than to
    // improve it: two answers to "which name did they mean" would drift, and one of them would be wrong
    // in a way nobody notices until they mistype.
    const near = didYouMean(name, names);
    return { action: "refuse",
      message: `no command named ${JSON.stringify(name)}.`
        + `${near ? ` Did you mean ${near}?` : ""}\n`
        + "  Refusing rather than ignoring it: an unrecognised name that runs nothing and exits 0 reads "
        + "exactly like a command that ran and found nothing.\n"
        + `  ${names.length} command(s): ${names.join(", ")}` };
  }
  return { action: "run", argv: [...command.argv, ...rest] };
}

function main() {
  const decision = decide(process.argv.slice(2), COMMANDS);
  if (decision.action === "list") {
    for (const name of Object.keys(COMMANDS).sort()) {
      process.stdout.write(`${name}\n    ${COMMANDS[name].argv.join(" ")}\n`);
    }
    return;
  }
  if (decision.action === "refuse") {
    process.stderr.write(`${decision.message}\n`);
    process.exit(EXIT.REFUSED);
  }
  const [file, ...args] = decision.argv;
  const result = spawnSync(file, args, { stdio: "inherit" });
  // A SIGNAL IS NOT AN EXIT CODE, and reporting 0 for a killed child is the compound-status trap wearing
  // a dispatcher's clothes -- the thing that made a failed push report success tonight.
  if (result.status === null) process.exit(1);
  process.exit(result.status ?? 1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) main();
