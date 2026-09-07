#!/usr/bin/env node
// @ts-check
// CLOSE THE ROWS A MERGED PR DECLARED, BECAUSE GITHUB DOES NOT DO IT FOR A BOT MERGE -- #298, unit 1d.
//
// ## The measurement
//
// `Closes #N` in a PR body is the tracker's whole closing mechanism under the pipeline. GitHub honours it
// AS THE ACTOR THAT MERGED, and under auto-arm that actor is `github-actions[bot]`. Measured 2026-09-07,
// after `issues: write` was added to `auto-arm.yml` at 11:04:36Z:
//
//   target  state   merged by              PR    armed
//   #310    OPEN    github-actions[bot]    #320  10:27Z  (pre-fix)
//   #321    OPEN    github-actions[bot]    #346  11:40Z  (36 MINUTES POST-FIX)
//   #326    CLOSED  DanBeckDev             #334
//   #331    CLOSED  DanBeckDev             #335
//
// **Three of three bot merges failed to close; two of two human merges closed**, with the permission
// present in the file. So `issues: write` was not the lever, and the pipeline must close rows itself.
//
// THE MECHANISM IS A HYPOTHESIS AND IS DELIBERATELY NOT RELIED ON. It may be that a merge performed under
// `GITHUB_TOKEN` cannot close a referenced issue at all, the way GitHub already stops `GITHUB_TOKEN`
// events cascading into new workflow runs. Nobody here has read documentation saying so, and this
// repository's record is full of mechanisms that were reasoned, sounded right, and were wrong. This fix
// works whether or not that explanation is true, which is why it was preferred over arguing the cause.
//
// ## Why it cannot close a row whose work did not land
//
// `close-merged-rows.mjs` -- which is in the tree and which NOTHING INVOKES -- deliberately refuses rather
// than closes, and its reason is right: *"closing needs the sha and a sentence, which is the dispatcher's
// to write, and a tool that closed rows automatically would eventually close one whose work did not
// actually land."* That reasoning assumed a human dispatcher merged. Under the pipeline nobody merges, so
// the premise is gone -- but the RISK it names is real and is answered here rather than dropped:
//
//   - It runs on `pull_request: types: [closed]`, gated on `merged == true` and `base.ref == 'main'`, so
//     a closed-unmerged PR closes nothing.
//   - It closes only the issues GITHUB ITSELF resolved as that PR's `closingIssuesReferences` -- not a
//     regex over the body. That is the exact set GitHub would have closed, so this restores the intended
//     behaviour rather than inventing a broader one. A `#123` mentioned in prose is not a closing
//     reference and is not touched.
//   - Every closure comments the PR number and the MERGE SHA first, so the sentence the header asks for
//     is on the row, and `git` can be asked what actually landed.
//
// ## Reporting
//
// Four outcomes and they must never collapse. `NONE DECLARED` is not a failure -- most PRs close nothing
// -- but it must be distinguishable from `declared and closed`, or a job that resolved no references
// would report success having done nothing, which is this repository's most-recorded defect. An issue
// somebody already closed by hand is reported as `ALREADY CLOSED` rather than silently skipped.
//
// Exit codes are the contract:
//   0  every declared row is closed -- by this run or already
//   1  one or more could not be closed. NAMED, never counted.
//   2  a lookup failed. INCONCLUSIVE, never "fine".
//
//   node scripts/close-rows-for-merged-pr.mjs <pr-number>
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
// RELATIVE, never `@a11y-witness/worker-fleet/cli-flags`: this job runs with `actions/checkout` and
// nothing else -- no `npm ci`, no build -- so the package specifier would resolve to a `dist/` that does
// not exist there. #330 and #331 are what that circular bootstrap costs. `cli-flags.mjs` imports only
// `node:path`, `node:fs` and `node:url`.
import { refuseUnknownFlags } from "../packages/worker-fleet/src/cli-flags.mjs";

export const EXIT = { DONE: 0, COULD_NOT_CLOSE: 1, CANNOT_ASK: 2 };

/**
 * WHAT TO DO WITH EACH ROW THE MERGED PR DECLARED -- the whole decision, as one pure function.
 *
 * Separated from the API calls so the four outcomes can be driven directly. A job whose reporting is
 * only exercised through a live merge is one whose reporting is never exercised.
 *
 * @param {{ number: number, state: string }[]} issues  as GitHub resolved them
 * @returns {{ close: number[], already: number[], none: boolean }}
 */
export function closurePlan(issues) {
  const close = issues.filter((i) => i.state === "OPEN").map((i) => i.number);
  const already = issues.filter((i) => i.state !== "OPEN").map((i) => i.number);
  return { close, already, none: issues.length === 0 };
}

/** @param {string[]} args */
const gh = (args) => execFileSync("gh", args, { encoding: "utf8" }).trim();

function main() {
  refuseUnknownFlags([], {
    entry: import.meta.url,
    command: "node scripts/close-rows-for-merged-pr.mjs <pr-number>",
  });

  const repo = process.env.GITHUB_REPOSITORY;
  const number = process.argv.slice(2).find((a) => /^\d+$/.test(a));
  if (!repo || !number) {
    console.error("CANNOT ASK: need GITHUB_REPOSITORY and a PR number.\n"
      + "  node scripts/close-rows-for-merged-pr.mjs <pr-number>");
    process.exit(EXIT.CANNOT_ASK);
  }

  const [owner, name] = repo.split("/");
  let issues, sha;
  try {
    const query = `{repository(owner:"${owner}",name:"${name}"){pullRequest(number:${number}){`
      + `mergeCommit{oid} closingIssuesReferences(first:20){nodes{number state}}}}}`;
    const pr = JSON.parse(gh(["api", "graphql", "-f", `query=${query}`,
      "--jq", ".data.repository.pullRequest"]));
    issues = pr.closingIssuesReferences.nodes;
    sha = pr.mergeCommit?.oid ?? "unknown";
  } catch (cause) {
    console.error(`CANNOT ASK: resolving #${number}'s closing references failed -- `
      + `${cause instanceof Error ? cause.message : cause}`);
    process.exit(EXIT.CANNOT_ASK);
  }

  const { close, already, none } = closurePlan(issues);

  if (none) {
    // NOT a failure, and not silence either. Most PRs declare nothing.
    console.log(`CLOSE-ROWS: #${number} declared NO closing references. Nothing to close.`);
    process.exit(EXIT.DONE);
  }
  for (const n of already) console.log(`CLOSE-ROWS: #${n} ALREADY CLOSED -- left alone.`);

  const failed = [];
  for (const n of close) {
    const sentence = `Closed by the pipeline: PR #${number} merged as \`${sha}\` and declared `
      + `\`Closes #${n}\`.\n\nGitHub does not apply a closing reference when the merge is performed by `
      + `\`github-actions[bot]\` -- measured on #310, #321 and #344 (see #298), where three of three bot `
      + `merges left their rows open while two of two human merges closed theirs. This comment and this `
      + `closure are that step, performed explicitly.\n\nIf the work did not land, reopen and say so on `
      + `the row: \`git show ${sha}\` is what actually merged.`;
    try {
      gh(["issue", "close", String(n), "--repo", repo, "--comment", sentence, "--reason", "completed"]);
      console.log(`CLOSE-ROWS: #${n} CLOSED (PR #${number}, merge ${sha}).`);
    } catch (cause) {
      console.log(`CLOSE-ROWS: #${n} COULD NOT CLOSE -- `
        + `${cause instanceof Error ? cause.message : cause}`);
      failed.push(n);
    }
  }

  if (failed.length > 0) {
    console.error(`CLOSE-ROWS: could not close ${failed.length}: ${failed.join(" ")}`);
    process.exit(EXIT.COULD_NOT_CLOSE);
  }
  process.exit(EXIT.DONE);
}

// The entry guard `merge-guard.mjs` uses: a bare `file://` + argv[1] comparison misreads a path with a
// space in it and a symlinked checkout, and reports the module as imported when it was run.
if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) main();
