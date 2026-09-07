#!/usr/bin/env node
// @ts-check
// ARM THE PRs `auto-arm.yml` STRUCTURALLY CANNOT SEE -- the ones that were already open. #344.
//
// `auto-arm.yml` triggers on `pull_request: [opened, ready_for_review]`. A PR that was already open when
// that workflow shipped (10:38Z, 2026-09-07) has no such event left to fire, so nothing ever armed it and
// nothing ever would. Measured at 11:35Z, four hours later:
//
//   [276, 183, 181, 172]   open, base main, not draft, autoMergeRequest = null
//
// #183 and #181 had been GREEN ON `gate` and unarmed since 01:39 and 01:27. `synchronize` would not have
// fixed it: a PR nobody pushes to produces no `synchronize` event any more than a second `opened`.
//
// ## Why this is not a scheduled sweep
//
// `board-liveness.test.ts` pins the measurement: GitHub disables scheduled workflows repository-wide after
// 60 days of inactivity, and `board-schedule-liveness.test.ts` records `board-report.yml` firing ZERO
// scheduled runs the day after it was added. An arming sweep on a cron fails by STOPPING SILENTLY, and its
// symptom -- PRs quietly not merging -- reads as workers being slow rather than as a dead trigger. Riding
// the `pull_request` trigger cannot have that fault: the event it needs is another PR being opened, which
// in this repo is the most frequent event there is (11 in the hour this was measured).
//
// ## The predicate is STRICTER than the `arm` job's, deliberately
//
// The `arm` job's population is a PR opened seconds ago: its head is current by construction and nobody is
// inside it yet, so "open, base main, not draft" is the whole question. This job's population is the
// opposite -- a PR that has been STANDING, long enough that what was true when it opened may not be now.
// Three of the four it was built for must not be armed on sight, each for a reason a machine can check:
//
//   NO CHECK RUNS (#172)   `merge-guard.mjs`'s own headline: a required context that never ran is not a
//                          failing check, it is the ABSENCE of one, and it reads as CLEAN. Arming it is
//                          harmless (GitHub withholds), and REPORTING it is the useful act -- a PR nothing
//                          has ever tested is STRANDED, not slow, and needs a push, not patience.
//   HELD (#183)            it carries `session:worker-capture`. #266/#268's rule: on a PR the `session:`
//                          label IS the hold, and arming a PR somebody is working inside is the collision
//                          that rule was measured into existence by (#258, and #197's three
//                          double-dispatches before it).
//   BLOCKED (#181)         a 1,337-line move refused on its move-check by a person, and a green `gate`
//                          says nothing about that. There is no machine-checkable form of "somebody
//                          refused this", so it carries `blocked` -- ON THE PR, where its author can see
//                          the refusal, and NOT as a PR number hard-coded in a workflow. A number in a
//                          file is a fact stated twice with nothing comparing the copies, and it outlives
//                          its reason silently.
//
// Everything else is armed, on the same argument `auto-arm.yml` makes for arming at all: GitHub cannot
// complete a merge this arms without `gate`, and therefore `mergeSafety`, reporting green for the real,
// current head.
//
// ## It reports every PR it did NOT arm, and why
//
// A sweep that silently skips is a queue-drainer reporting success having drained nothing -- this
// repository's most-recorded defect, arriving in the one place whose whole job is to notice a stalled
// queue. Every skip prints its reason, and an arming FAILURE does not end the loop: failures are collected
// and the run exits non-zero naming them, so one unarmable PR cannot strand the rest.
//
// IT TAKES NO ARGUMENTS, AND THAT IS PRECISELY WHY IT IS GUARDED RATHER THAN SKIPPED.
//
// The first version of this comment said the opposite -- "no flag to mistype, so it is not an argv-reading
// module" -- and `cli-flags.test.ts` refused it: #164 widened that census to top-level `scripts/`, and a
// command with NO flags is exactly where a mistyped one is discarded in silence and the default reported
// as success. `check-preregistered-verdict.mjs` and `build-packages.mjs` both call it with an empty list
// for the same reason. An argument handed to this sweep means the caller wanted something other than
// "arm the standing queue", and running the sweep anyway would answer a question nobody asked.
//
// THE IMPORT IS RELATIVE, never `@a11ign/worker-fleet/cli-flags`. The package specifier resolves to
// `dist/cli-flags.mjs`, so it needs `npm ci` AND a build to have happened -- and this job deliberately has
// neither, only `actions/checkout`. #330 and #331 are what that circular bootstrap costs: a top-level
// workspace import in `build-packages.mjs` took `main` down, and every worktree symlinking `node_modules`
// to a sibling's inherited a stale `dist` and never saw it fail locally. `cli-flags.mjs` itself imports
// only `node:path`, `node:fs` and `node:url`, so the relative form needs nothing installed.
//
// Exit codes are the contract:
//   0  the queue is drained -- everything armable was armed, and every skip was reported with its reason
//   1  at least one PR could not be armed. NAMED, never counted.
//   2  a lookup failed. INCONCLUSIVE, never "fine".
import { execFileSync } from "node:child_process";
import { refuseUnknownFlags } from "../packages/worker-fleet/src/cli-flags.mjs";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const EXIT = { DRAINED: 0, COULD_NOT_ARM: 1, CANNOT_ASK: 2 };

/**
 * MAY AN UNATTENDED SWEEP ARM THIS PR? -- the whole decision, as one pure function.
 *
 * Separated from the `gh` calls so it can be driven with real shapes rather than asserted against the
 * text of a shell script. A guard whose expectations are scraped out of the source it is testing is this
 * repository's own recorded defect (`SIGNAL_TYPES`, the `sweepLog` regex) -- both passed having examined
 * nothing.
 *
 * @param {{ labels: string[], checkRunCount: number }} pr
 * @returns {{ arm: boolean, reason: string }}
 */
export function sweepDecision({ labels, checkRunCount }) {
  if (labels.includes("blocked")) {
    return { arm: false, reason: "labelled `blocked` -- a person refused this one, and a green `gate` does not answer that" };
  }
  const holders = labels.filter((l) => l.startsWith("session:"));
  if (holders.length > 0) {
    return { arm: false, reason: `held by ${holders.join(", ")} -- on a PR the \`session:\` label IS the hold (#266)` };
  }
  if (checkRunCount === 0) {
    return {
      arm: false,
      reason: "NO CHECK RUNS EXIST for its head -- not one, ever. Nothing has tested this code; push to the "
        + "branch to trigger `ci.yml`. This is STRANDED, not slow",
    };
  }
  return { arm: true, reason: `${checkRunCount} check run(s) on its head` };
}

/** @param {string[]} args */
const gh = (args) => execFileSync("gh", args, { encoding: "utf8" }).trim();

function main() {
  refuseUnknownFlags([], { entry: import.meta.url, command: "node scripts/auto-arm-sweep.mjs" });

  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) {
    console.error("CANNOT ASK: GITHUB_REPOSITORY is unset, so there is no repo to sweep.");
    process.exit(EXIT.CANNOT_ASK);
  }

  let candidates;
  try {
    candidates = gh(["pr", "list", "--repo", repo, "--state", "open", "--base", "main", "--limit", "100",
      "--json", "number,isDraft,autoMergeRequest",
      "-q", ".[] | select(.isDraft == false and .autoMergeRequest == null) | .number"])
      .split("\n").filter(Boolean);
  } catch (cause) {
    console.error(`CANNOT ASK: listing open PRs failed -- ${cause instanceof Error ? cause.message : cause}`);
    process.exit(EXIT.CANNOT_ASK);
  }

  if (candidates.length === 0) {
    console.log("SWEEP: every open non-draft PR against main is already armed.");
    process.exit(EXIT.DRAINED);
  }
  console.log(`SWEEP: ${candidates.length} unarmed: ${candidates.join(" ")}`);

  const failed = [];
  for (const number of candidates) {
    let labels, head, checkRunCount;
    try {
      labels = JSON.parse(gh(["pr", "view", number, "--repo", repo, "--json", "labels", "-q", "[.labels[].name]"]));
      head = gh(["pr", "view", number, "--repo", repo, "--json", "headRefOid", "-q", ".headRefOid"]);
      checkRunCount = Number(gh(["api", `repos/${repo}/commits/${head}/check-runs`, "--jq", ".total_count"]));
    } catch (cause) {
      // A PR we could not ASK about is not a PR we may arm, and it is not a clean skip either.
      console.log(`SWEEP: #${number} COULD NOT ASK -- ${cause instanceof Error ? cause.message : cause}`);
      failed.push(number);
      continue;
    }

    const { arm, reason } = sweepDecision({ labels, checkRunCount });
    if (!arm) {
      console.log(`SWEEP: #${number} SKIPPED -- ${reason}`);
      continue;
    }

    try {
      gh(["pr", "merge", "--auto", "--merge", number, "--repo", repo]);
      console.log(`SWEEP: #${number} ARMED -- ${reason}`);
    } catch (cause) {
      console.log(`SWEEP: #${number} FAILED TO ARM -- ${cause instanceof Error ? cause.message : cause}`);
      failed.push(number);
    }
  }

  if (failed.length > 0) {
    console.error(`SWEEP: could not arm ${failed.length}: ${failed.join(" ")}`);
    process.exit(EXIT.COULD_NOT_ARM);
  }
  process.exit(EXIT.DRAINED);
}

// The same entry guard `merge-guard.mjs` uses: a bare `file://` + argv[1] comparison misreads a path
// with a space in it and a symlinked checkout, and reports the module as "imported, not run".
if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) main();
