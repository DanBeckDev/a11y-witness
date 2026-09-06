// IS THIS ROW CLAIMED? -- reads the BOARD (issue labels), never git history.
//
// #28 and #30 (2026-09-06) were both pulled twice in one hour. Both workers ran the documented collision
// check -- `git log --branches='agent/*' --not origin/main -- <region path>` -- and both got a clean,
// correct answer to the wrong question. That check answers "would I collide with someone in this FILE";
// it does not answer "is somebody already on this ROW", and a branch existing (or not) is not a claim.
// The claim that DID exist sat on the board the whole time: Status `In progress` plus the `in-progress`
// label, unconsulted because the documented procedure named the region check, never the board.
//
// `in-progress` is the label to trust, not the Project Status field, per `product-manager`'s own ruling:
// the Project Status field is a VIEW, and the label -- applied to the issue itself, timestamped by
// GitHub's own timeline -- is the record. `session:<name>` labels name who.
//
// THE VACUITY GUARD IS THE SHARPEST VERSION OF THIS REPO'S OWN RECURRING SHAPE: a query that fails and
// is read as "no labels" would report every row UNCLAIMED, turning one duplicate pull into a queue-wide
// free-for-all. So `fetchLabels` refuses to guess -- any malformed, incomplete, or failed response is a
// thrown error, never a silent empty array. See `decideClaim`'s own doc for why "unclaimed" must be
// EARNED, not defaulted to.
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";
import { REPO } from "./repo-identity.mjs";

export const CLAIM_LABEL = "in-progress";

/**
 * @typedef {{ number: number, title: string, labels: string[] }} IssueClaim
 */

/** @type {(cmd: string, args: string[]) => string} */
const defaultRun = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8" });

/**
 * Reads an issue's CURRENT labels from the real board. Injectable `run`, the same seam
 * `install-git-hooks.mjs` uses, so this is testable without a network call or a real repo.
 *
 * REFUSES TO GUESS: `gh` failing (network, auth, a deleted issue), or answering with a shape this
 * function does not recognise, throws -- it never falls through to an empty label list, which is
 * indistinguishable from "genuinely no labels" and would make every failure read as UNCLAIMED.
 *
 * @param {number} issueNumber
 * @param {{ run?: typeof defaultRun }} [deps]
 * @returns {IssueClaim}
 */
export function fetchLabels(issueNumber, { run = defaultRun } = {}) {
  /** @type {string} */
  let raw;
  try {
    raw = run("gh", ["issue", "view", String(issueNumber), "--repo", REPO, "--json", "number,title,labels"]);
  } catch (cause) {
    throw new Error(`row-claim: could not read issue #${issueNumber} from ${REPO} -- refusing to guess `
      + `whether it is claimed. ${/** @type {Error} */ (cause).message}`, { cause });
  }
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw new Error(`row-claim: gh's response for issue #${issueNumber} was not JSON -- refusing to `
      + `guess. First 200 chars: ${raw.slice(0, 200)}`, { cause });
  }
  const obj = /** @type {{ number?: unknown, title?: unknown, labels?: unknown }} */ (parsed);
  if (typeof obj?.number !== "number" || typeof obj?.title !== "string" || !Array.isArray(obj?.labels)) {
    throw new Error(`row-claim: gh's response for issue #${issueNumber} is missing number/title/labels -- `
      + `refusing to guess. Got: ${JSON.stringify(parsed).slice(0, 300)}`);
  }
  const names = obj.labels.map((/** @type {unknown} */ l) => {
    const name = /** @type {{ name?: unknown }} */ (l)?.name;
    if (typeof name !== "string") {
      throw new Error(`row-claim: a label on issue #${issueNumber} has no name -- refusing to guess. `
        + `Got: ${JSON.stringify(l)}`);
    }
    return name;
  });
  return { number: obj.number, title: obj.title, labels: names };
}

/**
 * Pure: does this label set say the row is claimed, and by whom?
 *
 * `sessions` can be EMPTY even when `claimed` is true -- a row moved to In progress by the dispatcher
 * before assigning it (exactly how #55 itself was claimed) has `in-progress` with no `session:*` yet.
 * That is still a claim; "claimed, owner not yet recorded" and "unclaimed" are different states and this
 * function does not conflate them.
 *
 * @param {string[]} labels
 * @returns {{ claimed: boolean, sessions: string[] }}
 */
export function claimStatus(labels) {
  return {
    claimed: labels.includes(CLAIM_LABEL),
    sessions: labels.filter((l) => l.startsWith("session:")).map((l) => l.slice("session:".length)),
  };
}

/**
 * Pure: given the labels read BEFORE this session's own claim attempt, should it proceed?
 *
 * A row already carrying `session:<mySession>` is not a collision -- resuming your own claimed row (the
 * pull-before-report loop revisiting a row it already owns) must not read as someone else having it.
 *
 * @param {string[]} labelsBefore
 * @param {string} mySession
 * @returns {{ proceed: true } | { proceed: false, reason: string }}
 */
export function decideClaim(labelsBefore, mySession) {
  const status = claimStatus(labelsBefore);
  if (!status.claimed) return { proceed: true };
  if (status.sessions.includes(mySession)) return { proceed: true };
  const by = status.sessions.length > 0 ? status.sessions.join(", ") : "someone (no session label recorded yet)";
  return { proceed: false, reason: `issue is already claimed by ${by}` };
}

/**
 * CLAIM-THEN-VERIFY, not verify-then-claim.
 *
 * Reading labels and THEN writing them leaves the gap between the two open to another session doing the
 * same thing -- and propagation lag is measured, not hypothetical (a bulk board query reported a row
 * `Ready` moments after it was known taken, 2026-09-06). Writing first narrows that window: this session's
 * own claim lands as one atomic label-add, and the RE-READ after writing is what would catch a genuine
 * collision in the gap, not the read before it.
 *
 * NOT proven race-free, and that is stated rather than hidden: two `gh issue edit --add-label` calls a
 * few hundred milliseconds apart both succeed (label add is idempotent, not compare-and-swap), so a
 * collision landing inside this function's own write-then-reread window is only DETECTED after the fact,
 * on the re-read -- via `session:*` labels both being present -- never prevented outright. GitHub's REST
 * API has no compare-and-swap primitive for labels to close that window completely; building one (an
 * external lock service, or polling the issue timeline for the eventPRECEDING commitment) is
 * disproportionate to a defect that, both times it fired today, was "nobody checked the board at all" --
 * not two sessions racing within the same second. That narrower race is refuted as a target for THIS row;
 * see the commit message for the measurement this claim rests on.
 *
 * @param {number} issueNumber
 * @param {string} mySession
 * @param {{ run?: typeof defaultRun }} [deps]
 * @returns {{ claimed: true } | { claimed: false, reason: string }}
 */
export function claimRow(issueNumber, mySession, { run = defaultRun } = {}) {
  const before = fetchLabels(issueNumber, { run });
  const decision = decideClaim(before.labels, mySession);
  if (!decision.proceed) return { claimed: false, reason: decision.reason };

  const sessionLabel = `session:${mySession}`;
  run("gh", ["issue", "edit", String(issueNumber), "--repo", REPO,
    "--add-label", CLAIM_LABEL, "--add-label", sessionLabel]);

  const after = fetchLabels(issueNumber, { run });
  const afterStatus = claimStatus(after.labels);
  const otherSessions = afterStatus.sessions.filter((s) => s !== mySession);
  if (otherSessions.length > 0) {
    // LOST THE RACE, DETECTED AFTER THE FACT: back off rather than leave a contested claim standing.
    // Removing only OUR OWN session label, never `in-progress` (which the other session's claim needs)
    // and never the other session's label (not ours to touch).
    run("gh", ["issue", "edit", String(issueNumber), "--repo", REPO, "--remove-label", sessionLabel]);
    return { claimed: false, reason: `lost a race to ${otherSessions.join(", ")} -- backed off` };
  }
  return { claimed: true };
}

function usage() {
  return "Usage:\n"
    + "  node scripts/row-claim.mjs check <issue-number>\n"
    + "  node scripts/row-claim.mjs claim <issue-number> --session=<name>\n";
}

async function main() {
  const [mode, issueArg, ...rest] = process.argv.slice(2);
  const issueNumber = Number(issueArg);
  if (!mode || !Number.isInteger(issueNumber) || issueNumber <= 0) {
    process.stderr.write(usage());
    process.exitCode = 2;
    return;
  }

  if (mode === "check") {
    try {
      const { labels, title } = fetchLabels(issueNumber);
      const status = claimStatus(labels);
      if (status.claimed) {
        const by = status.sessions.length > 0 ? status.sessions.join(", ") : "someone (no session label yet)";
        process.stdout.write(`CLAIMED by ${by} -- #${issueNumber} "${title}"\n`);
        process.exitCode = 1;
      } else {
        process.stdout.write(`UNCLAIMED -- #${issueNumber} "${title}"\n`);
        process.exitCode = 0;
      }
    } catch (error) {
      process.stderr.write(`COULD NOT DETERMINE: ${/** @type {Error} */ (error).message}\n`);
      process.exitCode = 2;
    }
    return;
  }

  if (mode === "claim") {
    const sessionFlag = rest.find((a) => a.startsWith("--session="));
    const mySession = sessionFlag?.slice("--session=".length);
    if (!mySession) {
      process.stderr.write(`row-claim claim: --session=<name> is required\n${usage()}`);
      process.exitCode = 2;
      return;
    }
    try {
      const result = claimRow(issueNumber, mySession);
      if (result.claimed) {
        process.stdout.write(`CLAIMED -- #${issueNumber} is now ${CLAIM_LABEL} / session:${mySession}\n`);
        process.exitCode = 0;
      } else {
        process.stdout.write(`NOT CLAIMED: ${result.reason}\n`);
        process.exitCode = 1;
      }
    } catch (error) {
      process.stderr.write(`COULD NOT DETERMINE: ${/** @type {Error} */ (error).message}\n`);
      process.exitCode = 2;
    }
    return;
  }

  process.stderr.write(usage());
  process.exitCode = 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) {
  main();
}
