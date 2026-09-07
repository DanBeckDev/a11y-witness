#!/usr/bin/env node
// IS THIS PR ACTUALLY TESTED? -- asked of the check RUNS, never of `mergeStateStatus`.
//
// `mergeStateStatus` cannot tell "every required check passed" from "no check ever ran", and on
// 2026-09-07 the second one presented as the greenest PR on the board. #148's base was another open PR's
// branch rather than `main`:
//
//     #148  lead/gate-ages-what-it-scored -> lead/real-page-outcome-is-stated
//     CLEAN/MERGEABLE   check-runs: []   182 insertions into check-real-page-findings.ts
//
// `ci.yml` is `on: pull_request: branches: [main]`, so a PR into a non-`main` base triggers no workflow
// at all and branch protection -- which covers `main` -- applies to nothing. **`CLEAN/MERGEABLE` is the
// CORRECT answer to the question GitHub was asked**, which is exactly what makes it dangerous: a required
// context that never ran is not a failing check, it is NO check, and the field cannot express the
// difference. That is this repository's most-recorded defect -- a check reporting cleanly having examined
// nothing -- arriving in the merge flow itself. It was caught by a human noticing the check-run list was
// EMPTY rather than green.
//
// THIS TOOL THEREFORE NEVER READS `mergeStateStatus`, and `merge-guard.test.ts` asserts that it does not.
// A verification that shares a failure mode with the action verifies nothing -- the same rule as checking
// `/health` over HTTP rather than through the deploy channel that just failed.
//
// THERE ARE TWO SHAPES AND THEY NEED OPPOSITE FIXES. Conflating them is how the first draft of this
// finding went wrong:
//
//   | stacked PR (#148)     | check-run list EMPTY          | nothing has ever tested this           |
//   | conflicting PR (#137) | runs WITH conclusions          | real results, against a base that moved |
//
// The second reads as evidence, which is worse. And a bounded listing turns the second into the first if
// you let it: that draft claimed #137 had zero runs, from a `gh run list --limit 25 | grep` that did not
// reach far enough back. **Ask the authoritative source and let it tell you what it is bounded to** --
// `/commits/<sha>/check-runs` for the head sha, never a grep over the most recent runs.
//
//   node scripts/merge-guard.mjs <pr-number>
//
// Exit codes are the contract:
//   0  READY      -- based on main, every required context present and concluded, tested against this main
//   1  REFUSED    -- and it NAMES which of the reasons, because they need different fixes
//   2  CANNOT ASK -- a lookup failed. INCONCLUSIVE, never "fine": reporting an unaskable question as
//                    clean is how "verified" comes to mean "unexamined"
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { refuseUnknownFlags } from "@a11y-witness/worker-fleet/cli-flags";
import { REPO } from "./repo-identity.mjs";

const EXIT = { READY: 0, REFUSED: 1, CANNOT_ASK: 2 };

/** A concluded context that does not block a merge. `skipped` is a path filter declining, not a failure. */
const SATISFIED = new Set(["success", "skipped", "neutral"]);

const gh = (args) => execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

/**
 * THE VERDICT, PURE — so every state can be exercised without a network, including the one no fixture
 * gives you for free (a real run against a base that has since moved).
 *
 * Each input is a FACT somebody looked up; `null` means the lookup failed and is never treated as an
 * empty answer. `[]` and `null` are the difference between "nothing ran" and "I could not ask", and this
 * whole tool exists because two states that need opposite responses were being reported as one.
 *
 * @param {{pr: {number: number, state: string, baseRefName: string, headRefOid: string},
 *          required: string[] | null,
 *          runs: {name: string, status: string, conclusion: string | null, completedAt: string | null}[] | null,
 *          mainTipIso: string | null}} facts
 * @returns {{code: number, reasons: string[], notes: string[]}}
 */
export function mergeReadiness({ pr, required, runs, mainTipIso }) {
  const missingLookups = [
    required === null && "the required status checks for `main` (branch protection)",
    runs === null && `the check runs for head ${pr.headRefOid.slice(0, 10)}`,
    mainTipIso === null && "the current tip of `main`",
  ].filter(Boolean);
  if (missingLookups.length > 0) {
    return { code: EXIT.CANNOT_ASK, notes: [], reasons: [
      `CANNOT SAY whether #${pr.number} is tested: could not read ${missingLookups.join("; ")}.\n`
      + "  This is INCONCLUSIVE, not clear. Re-run with a network and a `gh` credential.",
    ] };
  }

  const notes = pr.state === "OPEN" ? []
    : [`note: #${pr.number} is ${pr.state}, so this is a post-mortem rather than a merge decision.`];
  const reasons = [...baseReason(pr), ...checkReasons(pr, required, runs),
    ...stalenessReason(runs, mainTipIso)];
  return { code: reasons.length > 0 ? EXIT.REFUSED : EXIT.READY, reasons, notes };
}

function baseReason(pr) {
  if (pr.baseRefName === "main") return [];
  return [`BASE IS NOT main — it is \`${pr.baseRefName}\`.\n`
    + "  `ci.yml` triggers on `pull_request: branches: [main]`, so NO workflow runs for this PR and the\n"
    + "  branch protection that covers `main` protects nothing here. Re-target it at `main`, or merge its\n"
    + "  base first and let this one re-open against `main`."];
}

function checkReasons(pr, required, runs) {
  if (runs.length === 0) {
    return [`NO CHECK RUNS EXIST for head ${pr.headRefOid.slice(0, 10)} — not one, ever.\n`
      + "  Nothing has tested this code. This is the state that reads as `CLEAN`, because a required\n"
      + "  context that never ran is not a failing check; it is the absence of one."];
  }
  const byName = new Map(runs.map((run) => [run.name, run]));
  const missing = required.filter((context) => !byName.has(context));
  const unfinished = runs.filter((run) => run.status !== "completed").map((run) => run.name);
  const failing = runs.filter((run) => run.status === "completed" && !SATISFIED.has(run.conclusion ?? ""))
    .map((run) => `${run.name} (${run.conclusion})`);

  return [
    missing.length > 0 && `REQUIRED CONTEXT NEVER RAN: ${missing.join(", ")}.\n`
      + "  Present-and-failing and never-ran are different states; this is the second.",
    unfinished.length > 0 && `STILL RUNNING: ${unfinished.join(", ")}. Not a refusal forever — ask again.`,
    failing.length > 0 && `FAILING: ${failing.join(", ")}.`,
  ].filter(Boolean);
}

/**
 * A REAL RESULT AGAINST A BASE THAT HAS MOVED — the shape that looks like evidence.
 *
 * Measured 2026-09-07: #100's newest run finished 00:45:35Z against a `main` tipped 00:41:07Z and is
 * current; #135's finished 00:08:02Z against that same tip and is not. The comparison is deliberately
 * against the COMMIT DATE of `main`'s tip rather than against a run of `main`, because what matters is
 * whether this head was ever tested alongside the code it is about to join.
 */
function stalenessReason(runs, mainTipIso) {
  const finished = runs.map((run) => run.completedAt).filter(Boolean).sort();
  const newest = finished[finished.length - 1];
  if (!newest || newest >= mainTipIso) return [];
  return [`EVERY RUN PREDATES THE CURRENT main. Newest run ${newest}, \`main\` tipped ${mainTipIso}.\n`
    + "  These runs are real results, which is what makes them misleading: they tested this head against\n"
    + "  a base that has since moved. Update the branch and let it re-run."];
}

/** Each lookup returns null on failure rather than an empty answer — the distinction the verdict needs. */
function lookup(fn) {
  try {
    return fn();
  } catch (error) {
    void error;
    return null;
  }
}

function facts(number) {
  // DELIBERATELY NOT REQUESTING `mergeStateStatus`. Asking for it at all would invite the next reader to
  // use it, and this tool's entire reason for existing is that its answer cannot be trusted here.
  const pr = JSON.parse(gh(["pr", "view", String(number), "--repo", REPO,
    "--json", "number,state,baseRefName,headRefOid"]));
  const required = lookup(() => JSON.parse(
    gh(["api", `repos/${REPO}/branches/main/protection/required_status_checks`])).contexts);
  const runs = lookup(() => JSON.parse(
    gh(["api", `repos/${REPO}/commits/${pr.headRefOid}/check-runs`, "--paginate"])).check_runs
    .map((run) => ({ name: run.name, status: run.status, conclusion: run.conclusion,
      completedAt: run.completed_at })));
  const mainTipIso = lookup(() => gh(["api", `repos/${REPO}/commits/main`,
    "--jq", ".commit.committer.date"]).trim() || null);
  return { pr, required, runs, mainTipIso };
}

function main() {
  refuseUnknownFlags([], { entry: import.meta.url, command: "node scripts/merge-guard.mjs" });
  const number = process.argv.slice(2).find((arg) => /^\d+$/.test(arg));
  if (!number) {
    console.error("Usage: node scripts/merge-guard.mjs <pr-number>\n"
      + "Answers whether that PR has actually been tested, by reading its check RUNS rather than\n"
      + "`mergeStateStatus` -- which reports CLEAN for a PR that has never run a check.");
    process.exit(EXIT.CANNOT_ASK);
  }

  const verdict = mergeReadiness(facts(Number(number)));
  for (const note of verdict.notes) console.error(note);
  if (verdict.code === EXIT.READY) {
    console.log(`#${number} is tested: based on main, every required context present and concluded, and `
      + "run against the current main.");
  } else {
    console.error(`REFUSING #${number}:\n${verdict.reasons.map((r) => `- ${r}`).join("\n")}`);
  }
  process.exit(verdict.code);
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) main();
