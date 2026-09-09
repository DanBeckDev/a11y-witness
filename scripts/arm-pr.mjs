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

/** Exit codes are the contract: 0 armed or deliberately not, 2 could not ask. */
export const EXIT = { DONE: 0, CANNOT_ASK: 2 };

/** @param {string[]} args */
const gh = (args) => execFileSync("gh", args, { encoding: "utf8" }).trim();

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
  try {
    labels = JSON.parse(gh(["pr", "view", number, "--repo", repo, "--json", "labels"]))
      .labels.map((/** @type {{name: string}} */ l) => l.name);
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
  console.log(`arm-pr: armed #${number} -- ${verdict.reason}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) main();
