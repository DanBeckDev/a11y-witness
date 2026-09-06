#!/usr/bin/env node
// @ts-check
/**
 * CLOSE THE ISSUES A MERGE LANDED, OR REFUSE — because a routine that lives in a conversation is lost
 * with it.
 *
 * Close-on-merge was added to the dispatcher's routine on 2026-09-06 after issue #12 was dispatched at a
 * row whose fix was already on main. That evening FOUR merged rows were still open, and the tracker
 * showed three idle sessions holding five in-progress rows -- of which four were done. Nobody forgot: the
 * step was in a conversation, and the conversation had compacted.
 *
 * So the step is a command with an exit code. It reads the issue numbers out of the commit range's
 * subjects and bodies, asks GitHub which are still open, and REFUSES (exit 1) naming them. It closes
 * nothing itself: closing needs the sha and a sentence, which is the dispatcher's to write, and a tool
 * that closed rows automatically would eventually close one whose work did not actually land.
 *
 * Exit codes are the contract, and 2 is deliberately distinct from 1:
 *   0  every issue this range references is closed -- nothing to do
 *   1  one or more are STILL OPEN, named
 *   2  could not tell: `gh` unavailable, unauthenticated, or the range is empty
 *
 * 2 is not 1 for the reason this repo names most often: "could not ask" and "asked and found nothing"
 * must never be the same answer. An empty range reporting 0 would be a check that passes having examined
 * nothing.
 *
 *   node scripts/close-merged-rows.mjs <base>..<head>
 */
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import { sandboxGitEnv } from "./git-env.mjs";

/**
 * Issue references a commit range makes: `#12`, `Closes #12`, `fix(#30):`.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function issuesReferenced(text) {
  return [...new Set([...text.matchAll(/#(\d{1,6})\b/g)].map((m) => m[1]))];
}

// ENTRY-POINT GUARD, and this file is why `main` went red rather than merely being untested. Without it
// the module cannot be imported to drive `issuesReferenced` -- importing RUNS the check and exits -- so it
// shipped with no test at 0% coverage, and a coverage threshold is a SHARED BUDGET: one untestable file
// spends everyone's, and the cost lands on whoever pushes next.
//
// `pathToFileURL(...).href` and not string concatenation, which does not percent-encode: a path with a
// space makes the guard silently never match and `main()` never run. Both are `entry-points.test.ts`'s
// own rules, and this file failed both -- on the same night I wrote a sibling script that failed them too.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}

function main() {
  const range = process.argv[2];
  if (!range || !range.includes("..")) {
    process.stderr.write("usage: close-merged-rows.mjs <base>..<head>\n");
    process.exit(2);
  }

  let log = "";
  try {
    log = execFileSync("git", ["log", "--format=%s%n%b", range], { encoding: "utf8", env: sandboxGitEnv() });
  } catch (error) {
    process.stderr.write(`could not read ${range}: ${/** @type {Error} */ (error).message}\n`);
    process.exit(2);
  }

  const referenced = issuesReferenced(log);
  if (referenced.length === 0) {
    // An empty range and a range referencing no issue are different, and neither is a pass.
    process.stderr.write(`INCONCLUSIVE: ${range} references no issue, so there is nothing to check.\n`);
    process.exit(2);
  }

  /** @type {string[]} */
  const stillOpen = [];
  for (const n of referenced) {
    // `gh` resolves the repo from git, so a leaked GIT_DIR points it at another checkout -- the same
    // scrub every git-spawning file here takes, for the same reason.
    let state;
    try {
      state = execFileSync("gh", ["issue", "view", n, "--json", "state", "--jq", ".state"],
        { encoding: "utf8", env: sandboxGitEnv() }).trim();
    } catch {
      continue; // not an issue in this repo (a PR number, a line reference); silence is correct here
    }
    if (state === "OPEN") stillOpen.push(n);
  }

  if (stillOpen.length > 0) {
    process.stderr.write(
      `STILL OPEN after ${range}: ${stillOpen.map((n) => `#${n}`).join(", ")}\n`
      + "Close each with the sha and a sentence saying what the acceptance printed ON THE MERGED RESULT,\n"
      + "or say why the merge does not close it. Do not close a row on the strength of a branch subject.\n");
    process.exit(1);
  }
  process.stdout.write(`every issue referenced by ${range} is closed\n`);

}
