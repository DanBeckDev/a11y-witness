#!/usr/bin/env node
// @ts-check
/**
 * TAKE OR RELEASE A HOLD ON A PULL REQUEST — the record `merge-guard` reads (#266).
 *
 *   npm run pr:hold -- <n> --session=<name>       # take it; prints who held it before
 *   npm run pr:release -- <n> --session=<name>    # give it back
 *   npm run pr:hold -- <n>                        # no --session: REPORTS who holds it, writes nothing
 *
 * ## Why this is a command rather than a remembered `gh pr edit --add-label`
 *
 * #197's finding was not that people are careless, it was that **a claim depending on somebody
 * remembering to record it does not get recorded**: `row-claim.mjs` only wrote the label when a worker
 * ran `claim`, so a row named in a dispatch message carried no label at all and three double-dispatches
 * followed. A hold that costs a hand-typed `gh` invocation with a label name spelled from memory is a
 * sentence with extra steps — it will be skipped exactly when things are busy, which is when it matters.
 *
 * ## It PRINTS THE PREVIOUS HOLDER rather than silently succeeding
 *
 * Adding a label is idempotent, so taking a PR somebody else holds succeeds and looks identical to
 * taking a free one. That is the shape this repo pays for most — an operation whose success says nothing
 * about what it did. So this reports the prior state, and taking a PR held by someone else REFUSES
 * unless `--steal` is passed, which prints the name of who is being displaced.
 *
 * ## `session:*`, the same vocabulary rows use
 *
 * Deliberately not GitHub's PR assignees: `session:<name>` already marks a ROW as held and
 * `merge-guard` already parses it, so a PR hold reads through the same field with the same code. Two
 * spellings of one fact is the shape half this repo's defects share.
 */
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { refuseUnknownFlags, flagValue } from "@a11y-witness/worker-fleet/cli-flags";
import { claimStatus } from "./row-claim.mjs";
import { REPO } from "./repo-identity.mjs";

const EXIT = { DONE: 0, REFUSED: 1, CANNOT_ASK: 2 };

/** @param {string[]} args */
const gh = (args) => execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

/**
 * This PR's labels, or `null` when the answer could not be had.
 *
 * NEVER `[]` ON FAILURE. An empty list reads as "nobody holds this PR", which is the answer that lets
 * you proceed — so a failed lookup returning it would hand out a hold on the strength of a network
 * error. The same rule `merge-guard.mjs` applies to every one of its own lookups.
 *
 * @param {number} number
 * @returns {string[] | null}
 */
export function prLabels(number) {
  try {
    const pr = JSON.parse(gh(["pr", "view", String(number), "--repo", REPO, "--json", "labels"]));
    if (!Array.isArray(pr.labels)) return null;
    const names = pr.labels.map((/** @type {{name?: unknown}} */ l) => l?.name);
    return names.every((/** @type {unknown} */ n) => typeof n === "string")
      ? /** @type {string[]} */ (names) : null;
  } catch {
    return null;
  }
}

/**
 * PURE: what should taking a hold do, given who already holds it?
 *
 * Separated from the `gh` calls so every outcome is testable without a network — including the two that
 * cannot be produced on demand against a live API (a failed lookup, and a PR held by a third party).
 *
 * @param {{holders: string[], session: string, steal: boolean}} state
 * @returns {{act: boolean, code: number, message: string}}
 */
export function holdDecision({ holders, session, steal }) {
  const others = holders.filter((held) => held !== session);
  if (others.length === 0) {
    return holders.includes(session)
      ? { act: false, code: EXIT.DONE, message: `you (${session}) already hold it — nothing to do` }
      : { act: true, code: EXIT.DONE, message: "it was unheld" };
  }
  if (!steal) {
    return { act: false, code: EXIT.REFUSED, message: `REFUSING: ${others.join(", ")} holds it. Ask them `
      + "to release it, or pass --steal, which says so in the output rather than doing it quietly" };
  }
  return { act: true, code: EXIT.DONE, message: `STEALING from ${others.join(", ")} — say why to them` };
}

/** @param {number} number @param {string} session @param {"add"|"remove"} how */
function writeLabel(number, session, how) {
  gh(["pr", "edit", String(number), "--repo", REPO, `--${how}-label`, `session:${session}`]);
}

function usage() {
  return "usage: pr-hold.mjs <pr-number> [--session=<name>] [--release] [--steal]\n"
    + "  with --session: takes the hold (or releases it with --release)\n"
    + "  without       : reports who holds it and writes nothing\n";
}

function main() {
  refuseUnknownFlags(["--session=", "--release", "--steal"],
    { entry: import.meta.url, command: "npm run pr:hold" });
  const number = Number(process.argv.slice(2).find((a) => /^\d+$/.test(a)));
  if (!Number.isInteger(number) || number <= 0) {
    process.stderr.write(usage());
    process.exit(EXIT.CANNOT_ASK);
  }
  const labels = prLabels(number);
  if (labels === null) {
    process.stderr.write(`CANNOT SAY who holds #${number}: could not read its labels. This is `
      + "INCONCLUSIVE, not 'nobody holds it' -- refusing rather than handing out a hold on a failed "
      + "lookup.\n");
    process.exit(EXIT.CANNOT_ASK);
  }
  const holders = claimStatus(labels).sessions;
  const session = flagValue(process.argv, "session");
  if (!session) {
    process.stdout.write(holders.length === 0
      ? `#${number} is UNHELD.\n`
      : `#${number} is held by ${holders.join(", ")}.\n`);
    process.exit(EXIT.DONE);
  }

  if (process.argv.includes("--release")) {
    if (!holders.includes(session)) {
      process.stdout.write(`#${number} was not held by ${session}`
        + `${holders.length ? ` (it is held by ${holders.join(", ")})` : ""} — nothing released.\n`);
      process.exit(EXIT.DONE);
    }
    writeLabel(number, session, "remove");
    process.stdout.write(`#${number}: ${session} released it.\n`);
    process.exit(EXIT.DONE);
  }

  const decision = holdDecision({ holders, session, steal: process.argv.includes("--steal") });
  process.stdout.write(`#${number}: ${decision.message}\n`);
  if (!decision.act) process.exit(decision.code);
  writeLabel(number, session, "add");
  process.stdout.write(`#${number} is now held by ${session}.\n`);
  process.exit(EXIT.DONE);
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) main();
