#!/usr/bin/env node
// @ts-check
// command: take or release a hold on a pull request, the record merge-guard reads before treating it as free
/**
 * TAKE OR RELEASE A HOLD ON A PULL REQUEST — the record `merge-guard` reads (#266).
 *
 *   npm run pr:hold -- <n> --session=<name>       # take it; prints who held it before
 *   npm run pr:release -- <n> --session=<name>    # give it back
 *   npm run pr:hold -- <n>                        # no --session: REPORTS who holds it, writes nothing
 *
 * **THERE IS NO `pr-release.mjs`.** `pr:release` is this file with `--release` (see `package.json`), and
 * the two being named as a pair everywhere else makes a sibling script the natural thing to go looking
 * for — `dispatcher` did, and got a module-not-found. One file because the two operations share the
 * lookup, the holder parsing and the refusals; splitting them would be two spellings of one fact.
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

import { refuseUnknownFlags, flagValue } from "@a11ign/worker-fleet/cli-flags";
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
 * `displaces` IS THE WHOLE FIX FOR #268's FIRST REAL USE. `--steal` printed "STEALING from X" and then
 * only ADDED its own label, leaving both holders on the PR — so the thief was simultaneously a holder and
 * refused by `merge-guard`, and the refusal named somebody who no longer thought they held it. That is
 * this command's own argument turned on itself: `--steal` exists because `--add-label` is idempotent and
 * so says nothing about what happened, and the fix said nothing about what happened either.
 *
 * Found by `dispatcher` running it against the real PR within a minute of it being pushed, which no unit
 * test here could have done — these exercise the decision, and the defect was in the WRITE.
 *
 * @param {{holders: string[], session: string, steal: boolean}} state
 * @returns {{act: boolean, code: number, message: string, displaces: string[]}}
 */
export function holdDecision({ holders, session, steal }) {
  const others = holders.filter((held) => held !== session);
  if (others.length === 0) {
    return holders.includes(session)
      ? { act: false, code: EXIT.DONE, displaces: [], message: `you (${session}) already hold it — nothing to do` }
      : { act: true, code: EXIT.DONE, displaces: [], message: "it was unheld" };
  }
  if (!steal) {
    return { act: false, code: EXIT.REFUSED, displaces: [],
      message: `REFUSING: ${others.join(", ")} holds it. Ask them `
      + "to release it, or pass --steal, which says so in the output rather than doing it quietly" };
  }
  return { act: true, code: EXIT.DONE, displaces: others,
    message: `STEALING from ${others.join(", ")} — say why to them` };
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

  process.exit(process.argv.includes("--release")
    ? releaseHold(number, session, holders)
    : takeHold(number, session, holders, process.argv.includes("--steal")));
}

/**
 * Give back a hold you own. Releasing one you do NOT own writes nothing and says so — `--remove-label`
 * is idempotent in the same direction `--add-label` is, so quietly succeeding here would be the same
 * false success `--steal` exists to prevent, pointed the other way.
 *
 * @param {number} number @param {string} session @param {string[]} holders
 * @returns {number} the exit code
 */
function releaseHold(number, session, holders) {
  if (!holders.includes(session)) {
    process.stdout.write(`#${number} was not held by ${session}`
      + `${holders.length ? ` (it is held by ${holders.join(", ")})` : ""} — nothing released.\n`);
    return EXIT.DONE;
  }
  writeLabel(number, session, "remove");
  process.stdout.write(`#${number}: ${session} released it.\n`);
  return EXIT.DONE;
}

/**
 * Take the hold, displacing anyone else who has it — and then PROVE the PR says so.
 *
 * DISPLACE FIRST, THEN TAKE, so a half-failed write leaves the PR UNHELD rather than doubly held. Unheld
 * is visible and recoverable; two holders is the state that had `merge-guard` refusing the very session
 * that had just been told it succeeded.
 *
 * @param {number} number @param {string} session @param {string[]} holders @param {boolean} steal
 * @returns {number} the exit code
 */
function takeHold(number, session, holders, steal) {
  const decision = holdDecision({ holders, session, steal });
  process.stdout.write(`#${number}: ${decision.message}\n`);
  if (!decision.act) return decision.code;
  for (const displaced of decision.displaces) writeLabel(number, displaced, "remove");
  writeLabel(number, session, "add");
  // READ IT BACK, because this is two or more writes and either can half-succeed. `gh pr edit` exiting 0
  // says the request was accepted, not that the PR now says what you think -- the same reason
  // `/health.code` is checked over HTTP rather than through the channel that performed the deploy.
  const after = prLabels(number);
  const nowHeld = after === null ? null : claimStatus(after).sessions;
  if (nowHeld === null || nowHeld.length !== 1 || nowHeld[0] !== session) {
    process.stderr.write(`#${number}: THE WRITE DID NOT LAND AS INTENDED. Expected exactly `
      + `session:${session}; the PR now reads `
      + `${nowHeld === null ? "unreadable" : nowHeld.join(", ") || "no holder"}.\n`
      + "  Fix it by hand with `gh pr edit --add-label/--remove-label` before anyone acts on this PR.\n");
    return EXIT.CANNOT_ASK;
  }
  process.stdout.write(`#${number} is now held by ${session}${decision.displaces.length
    ? `, and ${decision.displaces.join(", ")} no longer holds it` : ""}.\n`);
  return EXIT.DONE;
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) main();
