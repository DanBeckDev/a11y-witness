#!/usr/bin/env node
// @ts-check
// A PUSH TO `main` THAT FAILS ITS OWN GATE IS REVERTED, UNATTENDED -- pipeline unit 3, #316.
//
// `ci.yml` gates every PR BEFORE it merges, and its own header rules out a `push: branches: [main]`
// trigger there for exactly that reason -- "a check that runs AFTER it cannot stop it, which is exactly
// what a push trigger was". Unit 1 (#298) then made `strict=false` real: GitHub completes a merge the
// instant `gate` is green for the PR's own head, with no requirement that the resulting MERGE COMMIT
// itself has ever been tested. `trunk-guard.yml` is the check that commit never got: it runs the full,
// unscoped suite against `main`'s actual new tip, on every push, and this script decides what to do when
// that fails.
//
// TWO WAYS A "REVERT ON RED" WOULD BE WORSE THAN NOTHING, both measured live by `dispatcher` the morning
// this was built:
//
//   1. INHERITED FAILURE. 13 of 19 PRs read red on one bad commit and none was at fault -- their own
//      push-to-main gate run failed for a reason that already existed BEFORE they landed. Reverting one
//      of them removes innocent work and leaves the real breakage in place, and the NEXT push then reads
//      red for the identical reason, forever. `revertVerdict` refuses unless the commit immediately
//      BEFORE this push had its OWN trunk-guard run conclude `success` -- read from that commit's own
//      recorded check-run, never re-derived by re-running the suite against it (which would double the
//      cost of every red push for a fact GitHub already has on file).
//   2. A STALE ACTION. `main` was red for 90 minutes on 2026-09-07; the actual fix was a FOLLOW-UP commit,
//      not a revert. A revert firing minutes in would have been right; one firing after the follow-up
//      landed would have REVERTED THE FIX and restored the breakage. The bound this script uses is not a
//      clock -- it is `main`'s own tip: this only proceeds while the failing push is STILL the tip. If
//      anything has landed since (a fix, or another push entirely), something may already have resolved
//      it, and this refuses rather than guessing. That is a bound of "zero commits since", which needs no
//      arbitrary timeout to express and is exactly the property that matters.
//
// THE FIRST PUSH TRUNK-GUARD EVER SEES HAS NO RECORD FOR ITS PARENT, and that is CANNOT_ASK, never READY
// -- a lookup that finds nothing is not the same as a lookup that found `success`, the same distinction
// every guard in `merge-guard.mjs` already draws.
//
// `git revert -m 1`, NEVER a force-push. `main` protection forbids rewriting it anyway, and a revert is
// itself a normal commit -- reviewable, and revertible in turn if it turns out to be wrong. The revert PR
// is an ordinary PR: unit 1's `auto-arm.yml` arms it on open, unit 1's `mergeSafety` and the rest of
// `gate` test it before it can complete, so "opens armed" does not mean "merges blindly" -- it means the
// same pipeline that gates every other PR gates this one too.
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";
import { refuseUnknownFlags } from "@a11ign/worker-fleet/cli-flags";
import { sandboxGitEnv } from "./git-env.mjs";
import { REPO } from "./repo-identity.mjs";
import { gh, lookup, lookupCheckRuns } from "./merge-guard.mjs";

export const EXIT = { READY: 0, REFUSED: 1, CANNOT_ASK: 2 };

/** The job name in `trunk-guard.yml` -- read back as a check-run context, named once so it cannot drift. */
export const GATE_JOB_NAME = "trunkGate";

/**
 * THE VERDICT, PURE -- so both refusal shapes and the ready shape can be driven without a network.
 *
 * @param {{ beforeGateConclusion: string | null, currentMainSha: string | null, pushSha: string }} facts
 *   `beforeGateConclusion`: the commit immediately before this push's OWN `trunkGate` conclusion, or
 *   `null` if no record exists (never re-derived by re-running the suite against it). `currentMainSha`:
 *   `main`'s real tip right now, or `null` on a failed lookup.
 * @returns {{code: number, reason: string}}
 */
export function revertVerdict({ beforeGateConclusion, currentMainSha, pushSha }) {
  if (beforeGateConclusion === null) {
    return { code: EXIT.CANNOT_ASK, reason: "could not read whether the commit BEFORE this push had its own "
      + "trunk-guard gate conclude `success` -- either the lookup failed, or (for the very first push this "
      + "workflow has ever seen) no record exists yet. CANNOT SAY whether this failure is this push's own "
      + "or inherited, and that is INCONCLUSIVE, never treated as either answer." };
  }
  if (beforeGateConclusion !== "success") {
    return { code: EXIT.REFUSED, reason: `the commit before this push was ALREADY RED (its own trunk-guard `
      + `run concluded \`${beforeGateConclusion}\`, not \`success\`). This push's failure is INHERITED, not `
      + "its own -- reverting it would remove innocent work and leave the real breakage in place, and the "
      + "NEXT push would read red for the identical reason." };
  }
  if (currentMainSha === null) {
    return { code: EXIT.CANNOT_ASK, reason: "could not read main's current tip." };
  }
  if (currentMainSha !== pushSha) {
    return { code: EXIT.REFUSED, reason: `main has moved on since this push -- it is now at `
      + `${currentMainSha.slice(0, 10)}, and this push was ${pushSha.slice(0, 10)}. Something may already `
      + "have landed to address it (a follow-up fix, or another push entirely); refusing rather than "
      + "reverting a commit that is no longer the tip, which could revert a fix instead of the fault." };
  }
  return { code: EXIT.READY, reason: "this push's own gate failed, the commit before it was green, and "
    + "nothing has landed on main since -- safe to revert." };
}

/**
 * The immediately-preceding commit's OWN `trunkGate` conclusion -- read from ITS check-run, never
 * re-derived by re-running the suite. `null` when the lookup fails OR no such run exists (the first-push
 * case); those two causes are indistinguishable from here and both correctly read as CANNOT_ASK.
 * @param {string} sha
 * @returns {string | null}
 */
export function lookupPreviousGateConclusion(sha) {
  const runs = lookupCheckRuns(sha);
  if (runs === null) return null;
  const run = runs.find((r) => r.name === GATE_JOB_NAME);
  return run && run.status === "completed" ? run.conclusion : null;
}

/** @returns {string | null} */
export function lookupCurrentMainSha() {
  return lookup(() => {
    const sha = gh(["api", `repos/${REPO}/commits/main`, "--jq", ".sha"]).trim();
    return sha || null;
  });
}

/**
 * Is a revert for this exact sha already open? Checked by SEARCHING open PRs for the sha this script
 * always writes into the body (see `revertPrBody`), rather than trusting a branch-name convention -- a
 * re-run of this workflow (GitHub allows re-running a completed run) must not open a second revert PR for
 * a fault the first one is already carrying.
 * @param {string} pushSha
 * @returns {number | null} the existing PR number, or null if none was found (including on a failed search)
 */
export function lookupExistingRevertPr(pushSha) {
  return lookup(() => {
    const results = JSON.parse(gh(["pr", "list", "--repo", REPO, "--state", "all",
      "--search", `"Reverts commit ${pushSha}" in:body`, "--json", "number"]));
    return Array.isArray(results) && results.length > 0 ? results[0].number : null;
  });
}

/**
 * Which merged PR introduced `sha`, and who authored it -- resolved by GitHub itself (the commit's own
 * associated-PR list), never parsed out of the merge commit's message. `null` on failure; the revert can
 * still proceed without this (the body just says less), which is why it is not folded into
 * `revertVerdict`'s own missing-lookup handling -- that function answers "safe to revert", not
 * "everything about the context is known".
 * @param {string} sha
 * @returns {{number: number, author: string, title: string} | null}
 */
export function lookupOriginPr(sha) {
  return lookup(() => {
    const pulls = JSON.parse(gh(["api", `repos/${REPO}/commits/${sha}/pulls`]));
    if (!Array.isArray(pulls) || pulls.length === 0) return null;
    const pr = pulls[0];
    return { number: pr.number, author: pr.user?.login ?? "unknown", title: pr.title };
  });
}

/**
 * The revert PR's body, naming everything `ceo` asked for: the original PR and its author, the failure
 * that triggered this, and the reverted sha -- because `git revert -m 1` is itself revertible, and
 * whoever reads this needs the sha to put it back if the revert turns out to be wrong.
 * @param {{ pushSha: string, originPr: {number: number, author: string, title: string} | null,
 *           runUrl: string }} args
 */
export function revertPrBody({ pushSha, originPr, runUrl }) {
  const originLine = originPr
    ? `Reverts the merge of #${originPr.number} ("${originPr.title}") by @${originPr.author}.`
    : "Reverts a push to `main` whose originating PR could not be identified (see the reverted sha below).";
  return `${originLine}\n\n`
    + `**Reverted commit:** ${pushSha}\n`
    + `**Why:** this repository's trunk-guard gate failed on \`main\`'s own tip after this merge landed, `
    + `and the commit immediately before it was verified green -- so this failure is this merge's own, not `
    + "inherited. See the failing run for the actual cause:\n"
    + `${runUrl}\n\n`
    + "This PR was opened automatically (pipeline unit 3, #316) and will auto-arm like any other PR -- it "
    + "still has to pass `gate` itself before it can merge. If this revert is wrong (the failure was a "
    + "false positive, or the fix has already landed elsewhere), close it and say why on the original PR; "
    + `\`git revert -m 1 ${pushSha}\` is itself revertible.\n\n`
    + `Reverts commit ${pushSha}.`;
}

/**
 * The action: `git revert`, push, open the PR, comment on the original. Not unit-tested directly (it
 * shells to `git`/`gh` throughout) -- the pure decision above and the body-builder above are; this is
 * proven live, the same way `fleet-playbook.mjs` and `board-document.mjs`'s action code is.
 *
 * RUNS IN THE JOB'S OWN CHECKOUT, not a fresh clone -- `trunk-guard.yml`'s `decideRevert` job checks out
 * this repository with `fetch-depth: 0` (a shallow clone leaves the reverted commit's parent objects
 * absent, which `git revert -m 1` needs to compute the diff), already sitting at `pushSha`. Reusing it
 * avoids a second clone for no reason; the working directory IS the target repository here.
 *
 * @param {{ pushSha: string, runUrl: string }} args
 */
function performRevert({ pushSha, runUrl }) {
  const existing = lookupExistingRevertPr(pushSha);
  if (existing !== null) {
    console.log(`A revert for ${pushSha.slice(0, 10)} already exists: #${existing}. Not opening a second one.`);
    process.exit(EXIT.READY);
  }

  const env = sandboxGitEnv();
  const run = (/** @type {string[]} */ args, opts = {}) =>
    execFileSync("git", args, { encoding: "utf8", env, ...opts });

  run(["config", "user.name", "github-actions[bot]"]);
  run(["config", "user.email", "github-actions[bot]@users.noreply.github.com"]);
  const branch = `revert/${pushSha.slice(0, 10)}-316`;
  run(["checkout", "-b", branch, pushSha]);
  run(["revert", "--mainline", "1", "--no-edit", pushSha]);
  run(["push", "--quiet", "-u", "origin", branch]);

  const originPr = lookupOriginPr(pushSha);
  const title = originPr ? `revert: "${originPr.title}" broke main` : `revert: ${pushSha.slice(0, 10)} broke main`;
  const body = revertPrBody({ pushSha, originPr, runUrl });
  const created = gh(["pr", "create", "--repo", REPO, "--title", title, "--body", body,
    "--base", "main", "--head", branch]).trim();
  console.log(`Opened ${created}`);

  // ARMED HERE DIRECTLY, NOT LEFT TO `auto-arm.yml`'s OWN `pull_request: opened` TRIGGER -- a PR created
  // with the workflow's own `GITHUB_TOKEN` does not fire a NEW workflow run for other workflows listening
  // on `pull_request` (GitHub's own documented anti-recursion behaviour), so relying on unit 1 to arm this
  // PR would silently never happen. Arming it here makes "opens armed" a fact about this job, not a hope
  // about a second workflow noticing.
  const number = created.split("/").pop();
  gh(["pr", "merge", String(number), "--repo", REPO, "--auto", "--merge"]);

  if (originPr) {
    gh(["pr", "comment", String(originPr.number), "--repo", REPO, "--body",
      `This merge's own trunk-guard run failed on \`main\`'s tip and was verified NOT inherited -- `
      + `reverted automatically in ${created}.`]);
  }
  process.exit(EXIT.READY);
}

function main() {
  refuseUnknownFlags(["--push-sha", "--before-sha", "--run-url"],
    { entry: import.meta.url, command: "node scripts/trunk-revert.mjs" });
  const flag = (/** @type {string} */ name) => {
    const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
    return arg ? arg.slice(name.length + 3) : null;
  };
  const pushSha = flag("push-sha");
  const beforeSha = flag("before-sha");
  const runUrl = flag("run-url") ?? "";
  if (!pushSha || !beforeSha) {
    console.error("Usage: node scripts/trunk-revert.mjs --push-sha=<sha> --before-sha=<sha> [--run-url=<url>]\n"
      + "Called by trunk-guard.yml's decideRevert job after trunkGate has already failed for --push-sha.");
    process.exit(EXIT.CANNOT_ASK);
  }

  const verdict = revertVerdict({
    beforeGateConclusion: lookupPreviousGateConclusion(beforeSha),
    currentMainSha: lookupCurrentMainSha(),
    pushSha,
  });
  if (verdict.code !== EXIT.READY) {
    console.error(`NOT REVERTING ${pushSha.slice(0, 10)}: ${verdict.reason}`);
    process.exit(verdict.code);
  }
  console.log(`REVERTING ${pushSha.slice(0, 10)}: ${verdict.reason}`);
  performRevert({ pushSha, runUrl });
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) main();
