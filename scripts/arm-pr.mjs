#!/usr/bin/env node
// @ts-check
// command: arm-pr -- enable auto-merge on ONE pull request, unless it is held
//
// #645. `auto-arm.yml`'s per-PR `arm` job ran `gh pr merge --auto` from three lines of `run:` bash,
// gated on `draft == false && base.ref == 'main'` and NOTHING else. `auto-arm-sweep.mjs` refused a HELD
// PR; this path did not, so a PR held by a ruling was re-armed by its own next `pull_request` event.
//
// The predicate was written twice and only one copy was correct. It now lives once, in
// `pr-hold-state.mjs`, and both callers read it -- adding the missing `if` here would have made it two
// correct copies, which is the same shape with a longer fuse.
//
// A NODE SCRIPT RATHER THAN BASH, for the reason `auto-arm-sweep.mjs`'s own header gives: a predicate
// written in `run:` can only ever be checked by asserting on the text of a shell script, and a guard
// whose expectations are scraped out of the source it tests is this repository's own recorded defect.
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";
import { refuseUnknownFlags, flagValue } from "../packages/worker-fleet/src/cli-flags.mjs";
import { armabilityOf } from "./pr-hold-state.mjs";
import { extractClosesDeclaration } from "./acceptance-commands.mjs";

/** Exit codes are the contract: 0 armed or deliberately not, 2 could not ask. */
export const EXIT = { DONE: 0, CANNOT_ASK: 2 };

/** @param {string} cmd @param {string[]} args */
const defaultRun = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8" });

/** @param {string[]} args @param {typeof defaultRun} [run] */
const gh = (args, run = defaultRun) => run("gh", args).trim();

/**
 * MAY THIS PR BE ARMED? -- pure, so it can be driven with real shapes rather than asserted against the
 * text of this file. The first version of #645's tests checked that the workflow CALLS this script and
 * that this script MENTIONS the predicate, and `npm run mutate` reported THE GUARD DID NOT BITE when the
 * hold check was disabled: asserting on wiring is not asserting on behaviour, which is the same defect
 * as a pin that watches the wrong half.
 *
 * `null` labels means the read FAILED. It is refused, never treated as unheld: the whole failure #645
 * records is a merge that happened because nothing looked, and "could not ask" answering "clear" is this
 * repository's most expensive recurring shape.
 *
 * @param {string[] | null} labels
 * @returns {{ arm: boolean, reason: string }}
 */
export function armDecision(labels) {
  if (labels === null) {
    return { arm: false, reason: "could not read this PR's labels -- REFUSING to arm. Unreadable is not unheld" };
  }
  return armabilityOf({ labels });
}

/**
 * #725: WHICH ROW(S) DOES THIS PR CLOSE -- pure, and read from the PR body's own `Closes #N`
 * declaration via `extractClosesDeclaration` (NO SECOND PARSER), never from the branch name. Every
 * worker's branch shares the `agent/` prefix, so a branch-derived guess is the same three-hop
 * attribution #725 measured, with fewer steps visible and no correctness for a branch that doesn't
 * happen to end in its row number.
 * @param {string | null | undefined} prBody
 * @returns {number[]}
 */
export function closedRowNumbers(prBody) {
  const declaration = extractClosesDeclaration(prBody);
  return declaration.kind === "closes" ? declaration.numbers : [];
}

/**
 * Pure: the `session:*` labels ONE row carries -- zero, one, or (rare, two rows in one PR) more.
 * @param {string[]} rowLabels
 * @returns {string[]}
 */
export function sessionLabelsOf(rowLabels) {
  return rowLabels.filter((l) => l.startsWith("session:"));
}

/**
 * Pure: given the `session:*` labels of every row this PR closes (one label-array per row, in
 * `closedRowNumbers` order), which labels should the PR carry? A row that carries none contributes
 * nothing -- an absent claim on the row must not become an invented one on the PR (#725's own ruling:
 * a row with no session label is unclaimed whoever filed it).
 * @param {string[][]} rowLabelLists
 * @returns {string[]}
 */
/**
 * #1000/#913: THE FIVE SESSIONS THAT EXIST. Four `session:*` labels are RETIRED BY DESCRIPTION rather than
 * deleted -- `dispatcher`, `worker-audit`, `worker-contracts`, `worker-config` -- because deleting one
 * strips it from the merged PRs that carry it as attribution, and eleven of thirteen are read by
 * `attributionFor` (`claim-provenance.mjs`) to return the `worker` verdict. A record of the past is never
 * renamed, and GitHub has no deletion that spares history.
 *
 * **So four live labels carry a retired meaning, and the only thing keeping them retired is that nobody
 * applies them.** That is a rule nobody enforces, which in this repository is a rule that has already
 * drifted: `sessionLabelsOf` copies WHATEVER `session:*` label a row carries onto the closing PR, and a row
 * hand-labelled `session:dispatcher` tomorrow would put a retired label on a merged PR with nothing saying
 * so.
 *
 * A LITERAL HERE, DELIBERATELY, AND PINNED FROM THE TEST. `docs/roles/README.md`'s roster is not the source
 * -- measured: it names eleven agents including every retired one, because it is a record of the roles this
 * org has had. No file holds "who is live" today, so the list lives in ONE place with #913 named, and
 * `arm-pr.test.ts` pins these two sets against the `session:*` labels that actually exist: disjoint, and
 * together covering all nine. A sixth session added next month fails there rather than silently
 * attributing to nothing.
 */
export const LIVE_SESSIONS = ["ceo", "product-manager", "orchestrator", "worker-capture", "worker-judge"];

/** Retired 2026-09-10 by the Org Reset (#913), kept as labels because merged PRs carry them. */
export const RETIRED_SESSIONS = ["dispatcher", "worker-audit", "worker-config", "worker-contracts"];

/**
 * Pure: which of these labels name a session that is not live, AND WHICH KIND OF NOT-LIVE -- retired by
 * #913, or unknown to this repository at all. **Named, never dropped**: a silent drop and a correct run
 * produce identical output, which is the failure shape this repository has the longest record of.
 *
 * THE TWO CASES NEED DIFFERENT SENTENCES, and getting that wrong was worker-capture's second finding on
 * #1020. Filtering on "not in LIVE_SESSIONS" alone refuses all three of `session:dispatcher`,
 * `session:worker-captur` (a typo) and `session:brand-new-role` -- correct, because failing closed is
 * right -- but told all three they were RETIRED BY THE ORG RESET, which is false about a typo and about a
 * session created next week, and sends that reader to a row with nothing to do with their problem.
 * Consulting `RETIRED_SESSIONS` also makes that export load-bearing rather than decorative, which is what
 * stops it drifting.
 * @param {string[]} sessionLabels @returns {{ label: string, retired: boolean }[]}
 */
export function unknownSessionLabels(sessionLabels) {
  return sessionLabels
    .filter((l) => !LIVE_SESSIONS.includes(l.slice("session:".length)))
    .map((label) => ({ label, retired: RETIRED_SESSIONS.includes(label.slice("session:".length)) }));
}

/**
 * Pure: given the `session:*` labels of every row this PR closes (one label-array per row, in
 * `closedRowNumbers` order), which labels should the PR carry? A row that carries none contributes
 * nothing -- an absent claim on the row must not become an invented one on the PR (#725's own ruling:
 * a row with no session label is unclaimed whoever filed it).
 * @param {string[][]} rowLabelLists
 * @returns {string[]}
 */
export function sessionLabelsForArm(rowLabelLists) {
  return [...new Set(rowLabelLists.flatMap(sessionLabelsOf))];
}

/**
 * IMPURE: reads the label set of every row this PR closes and, in the SAME act as arming, puts each
 * row's `session:*` label(s) on the PR. `--add-label` is idempotent (`row-claim.mjs`'s own convention:
 * this needs no special case for a label already present), so re-arming an already-labelled PR calls
 * this again harmlessly rather than churning anything.
 *
 * A row this can't read, or that carries no session label, leaves the PR unlabelled for that row --
 * #725's stated gap, not a bug here: a PR opened without arming, or a row claimed after the PR opens,
 * still carries nothing, because the arm path is the only place the information and the action
 * coincide.
 * @param {{ number: string, repo: string, prBody: string | null | undefined, run?: typeof defaultRun }} args
 * @returns {{ refused: boolean }} `refused` when a RETIRED session label stopped the arm (#1000)
 */
export function labelArmedPr({ number, repo, prBody, run = defaultRun }) {
  const rows = closedRowNumbers(prBody);
  if (rows.length === 0) return { refused: false };
  const rowLabelLists = rows.map((rowNumber) => {
    try {
      return JSON.parse(gh(["issue", "view", String(rowNumber), "--repo", repo, "--json", "labels"], run))
        .labels.map((/** @type {{name: string}} */ l) => l.name);
    } catch (cause) {
      console.error(`arm-pr: could not read row #${rowNumber}'s labels -- leaving the PR unlabelled `
        + `for it: ${/** @type {Error} */ (cause).message}`);
      return [];
    }
  });
  const sessionLabels = sessionLabelsForArm(rowLabelLists);
  if (sessionLabels.length === 0) return { refused: false };
  // #1000: REFUSED, AND THE LABEL IS NAMED. Applying a retired label to a merged PR would put a claim on
  // the attribution record that no live session can answer for, and a reader of `attributionFor` would get
  // a verdict naming a session that does not exist. Nothing is applied -- not even the live labels beside
  // it -- because a partial arm is the state nobody can tell from a complete one.
  const notLive = unknownSessionLabels(sessionLabels);
  if (notLive.length > 0) {
    const why = notLive.map(({ label, retired }) => (retired
      ? `${label} is RETIRED (#913, the Org Reset of 2026-09-10) -- the label still exists because merged `
        + "PRs carry it as attribution, but nothing new may be given it"
      : `${label} is not a session this repository knows`)).join("; ");
    console.error(`arm-pr: REFUSING to label #${number} -- ${why}.\n`
      + `  The five live sessions are ${LIVE_SESSIONS.join(", ")}.\n`
      + `  Fix the ROW's own label first: \`gh issue edit <row> --remove-label ${notLive[0].label} `
      + "--add-label session:<a live session>`, then re-run this.");
    // RETURNED, NEVER `process.exitCode` FROM IN HERE: setting the exit code inside a library function
    // fails its CALLER's whole process -- caught by this row's own test file, where every named test
    // passed and the FILE failed. `main` owns the exit code; this owns the verdict.
    return { refused: true };
  }
  gh(["pr", "edit", number, "--repo", repo, ...sessionLabels.flatMap((l) => ["--add-label", l])], run);
  console.log(`arm-pr: labelled #${number} with ${sessionLabels.join(", ")} from row #${rows.join(", #")}`);
  return { refused: false };
}

function main() {
  refuseUnknownFlags(["--pr=", "--repo="], { entry: import.meta.url, command: "node scripts/arm-pr.mjs" });
  const number = flagValue(process.argv, "pr");
  const repo = flagValue(process.argv, "repo") ?? process.env.GITHUB_REPOSITORY;
  if (!number || !repo) {
    console.error("arm-pr: --pr=<n> is required, and --repo or GITHUB_REPOSITORY must name the repo.\n"
      + "  REFUSING rather than guessing: arming the wrong PR is not recoverable by re-running.");
    process.exit(EXIT.CANNOT_ASK);
  }

  /** @type {string[] | null} */
  let labels = null;
  /** @type {string | null} */
  let prBody = null;
  try {
    const view = JSON.parse(gh(["pr", "view", number, "--repo", repo, "--json", "labels,body"]));
    labels = view.labels.map((/** @type {{name: string}} */ l) => l.name);
    prBody = view.body;
  } catch (cause) {
    console.error(`arm-pr: could not read #${number}'s labels: ${/** @type {Error} */ (cause).message}`);
  }

  const verdict = armDecision(labels);
  if (labels === null) {
    console.error(`arm-pr: ${verdict.reason}.`);
    process.exit(EXIT.CANNOT_ASK);
  }
  if (!verdict.arm) {
    console.log(`arm-pr: NOT arming #${number} -- ${verdict.reason}`);
    return;
  }
  gh(["pr", "merge", "--auto", "--merge", number, "--repo", repo]);
  // #1000: `main` owns the exit code. A retired session label refuses the arm, and the workflow step
  // running this must go red rather than reporting a PR labelled with a session that does not exist.
  if (labelArmedPr({ number, repo, prBody }).refused) process.exitCode = 1;
  console.log(`arm-pr: armed #${number} -- ${verdict.reason}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) main();
