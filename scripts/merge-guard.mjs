#!/usr/bin/env node
// @ts-check
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
//   node scripts/merge-guard.mjs <pr-number> [--session=<name>] [--allow-claimed-close]
//
// Exit codes are the contract:
//   0  READY      -- based on main, every required context present and concluded, tested against this main
//   1  REFUSED    -- and it NAMES which of the reasons, because they need different fixes
//   2  CANNOT ASK -- a lookup failed. INCONCLUSIVE, never "fine": reporting an unaskable question as
//                    clean is how "verified" comes to mean "unexamined"
//
// #249: ARMING CLOSES ROWS, AND NOTHING AT THAT END EVER CHECKED WHETHER SOMEBODY ELSE WAS INSIDE ONE.
// `row-claim check` runs before a worker DISPATCHES or STARTS a row; nothing ran before a PR closing that
// row was ARMED, and arming is the act that actually closes it. Measured 2026-09-07: PR #245 was armed
// while the row it closed (#237) carried `in-progress`, `session:worker-judge`, `started` -- a second,
// independent fix on that row was discarded. Ninth dispatch collision that night, seventh from the
// dispatcher, who had been the one running `row-claim check` correctly at the OTHER end of the loop every
// time.
//
// So this guard now asks GitHub what a PR would close (`closingIssuesReferences` -- resolved server-side,
// never a `Closes #N` regex over the PR body) and reuses `row-claim.mjs`'s own claim predicate,
// `decideClaim`, rather than re-deriving "is this row somebody else's" a second time. `decideClaim`
// already draws the one line this needs: resuming your OWN claimed row is not a collision, which is why
// `--session=<name>` exists here -- the identity of whoever is running this check, compared against the
// `session:*` label on each row it would close. Omit it and every claimed row it would close reads as
// somebody else's, which is the conservative default: a check that does not know who is asking cannot
// vouch for the asker.
//
// NOT A POLICY CHANGE ABOUT WHO MAY ARM. A dispatcher who has confirmed with the row's holder should be
// able to proceed, and `--allow-claimed-close` is that escape hatch -- printed, never silent, the same
// shape `--allow-stale-workers` already uses elsewhere in this repo, because a bypass nobody can see is
// one that becomes the default.
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { refuseUnknownFlags } from "@a11y-witness/worker-fleet/cli-flags";
import { sandboxGitEnv } from "./git-env.mjs";
import { REPO } from "./repo-identity.mjs";
import { decideClaim } from "./row-claim.mjs";

const EXIT = { READY: 0, REFUSED: 1, CANNOT_ASK: 2 };

/** A concluded context that does not block a merge. `skipped` is a path filter declining, not a failure. */
const SATISFIED = new Set(["success", "skipped", "neutral"]);

/** @param {string[]} args */
export const gh = (args) => execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

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
 *          mainTipIso: string | null,
 *          behindBy: number | null,
 *          closes?: {number: number, title?: string, labels: string[]}[] | null,
 *          session?: string | null}} facts
 * @returns {{code: number, reasons: string[], notes: string[]}}
 */
export function mergeReadiness({ pr, required, runs, mainTipIso, behindBy, closes = [], session = null }) {
  const missingLookups = [
    required === null && "the required status checks for `main` (branch protection)",
    runs === null && `the check runs for head ${pr.headRefOid.slice(0, 10)}`,
    mainTipIso === null && "the current tip of `main`",
    behindBy === null && "whether this head contains `main`'s tip (the compare API)",
    closes === null && "which rows this PR would close (the closingIssuesReferences lookup)",
  ].filter(Boolean);
  if (missingLookups.length > 0) {
    return { code: EXIT.CANNOT_ASK, notes: [], reasons: [
      `CANNOT SAY whether #${pr.number} is tested: could not read ${missingLookups.join("; ")}.\n`
      + "  This is INCONCLUSIVE, not clear. Re-run with a network and a `gh` credential.",
    ] };
  }

  const notes = pr.state === "OPEN" ? []
    : [`note: #${pr.number} is ${pr.state}, so this is a post-mortem rather than a merge decision.`];
  // Already proven non-null by `missingLookups` above -- TS's narrowing does not follow a null check
  // performed inside an array-literal expression, so the casts restate what the guard clause established.
  const knownRequired = /** @type {string[]} */ (required);
  const knownRuns = /** @type {{name: string, status: string, conclusion: string | null,
    completedAt: string | null}[]} */ (runs);
  const knownMainTipIso = /** @type {string} */ (mainTipIso);
  const knownCloses = /** @type {{number: number, title?: string, labels: string[]}[]} */ (closes);
  const reasons = [...baseReason(pr), ...checkReasons(pr, knownRequired, knownRuns),
    ...ancestryReason(behindBy), ...stalenessReason(knownRuns, knownMainTipIso),
    ...closingClaimReasons(knownCloses, session)];
  return { code: reasons.length > 0 ? EXIT.REFUSED : EXIT.READY, reasons, notes };
}

/**
 * WOULD ARMING THIS PR CLOSE A ROW SOMEBODY ELSE IS INSIDE? — #249.
 *
 * Reuses `row-claim.mjs`'s own claim predicate rather than re-deriving "is this row somebody else's" a
 * second time in this file: `decideClaim` already draws the line that resuming your OWN claimed row is
 * not a collision (row-claim.mjs, `decideClaim`'s own doc comment). `session` is who is running THIS
 * check, never inferred from the PR -- omit it and every claimed row this PR would close reads as
 * somebody else's, which is the safe default when the asker has not said who they are.
 *
 * @param {{number: number, title?: string, labels: string[]}[]} closes
 * @param {string | null} session
 * @returns {string[]}
 */
function closingClaimReasons(closes, session) {
  const reasons = [];
  for (const issue of closes) {
    const decision = decideClaim(issue.labels, session ?? "");
    if (!decision.proceed) {
      reasons.push(`WOULD CLOSE #${issue.number}${issue.title ? ` "${issue.title}"` : ""}, but `
        + `${decision.reason}.\n`
        + "  Arming this PR closes that row whether or not you hold it. Confirm with whoever does, or\n"
        + "  wait -- or pass `--allow-claimed-close` if you have already confirmed.");
    }
  }
  return reasons;
}

/** @param {{baseRefName: string}} pr */
function baseReason(pr) {
  if (pr.baseRefName === "main") return [];
  return [`BASE IS NOT main — it is \`${pr.baseRefName}\`.\n`
    + "  `ci.yml` triggers on `pull_request: branches: [main]`, so NO workflow runs for this PR and the\n"
    + "  branch protection that covers `main` protects nothing here. Re-target it at `main`, or merge its\n"
    + "  base first and let this one re-open against `main`."];
}

/**
 * @param {{headRefOid: string}} pr
 * @param {string[]} required
 * @param {{name: string, status: string, conclusion: string | null}[]} runs
 * @returns {string[]}
 */
export function checkReasons(pr, required, runs) {
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

  // `.filter(Boolean)` does not narrow `(string | false)[]` to `string[]` -- a well-known TS gap, not a
  // behaviour bug -- so the predicate says so explicitly.
  return [
    missing.length > 0 && `REQUIRED CONTEXT NEVER RAN: ${missing.join(", ")}.\n`
      + "  Present-and-failing and never-ran are different states; this is the second.",
    unfinished.length > 0 && `STILL RUNNING: ${unfinished.join(", ")}. Not a refusal forever — ask again.`,
    failing.length > 0 && `FAILING: ${failing.join(", ")}.`,
  ].filter(/** @returns {reason is string} */ (reason) => Boolean(reason));
}

/**
 * A REAL RESULT AGAINST A BASE THAT HAS MOVED — the shape that looks like evidence.
 *
 * Measured 2026-09-07: #100's newest run finished 00:45:35Z against a `main` tipped 00:41:07Z and is
 * current; #135's finished 00:08:02Z against that same tip and is not. The comparison is deliberately
 * against the COMMIT DATE of `main`'s tip rather than against a run of `main`, because what matters is
 * whether this head was ever tested alongside the code it is about to join.
 *
 * @param {{completedAt: string | null}[]} runs
 * @param {string} mainTipIso
 * @returns {string[]}
 */
function stalenessReason(runs, mainTipIso) {
  const finished = runs.map((run) => run.completedAt).filter(Boolean).sort();
  const newest = finished[finished.length - 1];
  if (!newest || newest >= mainTipIso) return [];
  return [`EVERY RUN PREDATES THE CURRENT main. Newest run ${newest}, \`main\` tipped ${mainTipIso}.\n`
    + "  These runs are real results, which is what makes them misleading: they tested this head against\n"
    + "  a base that has since moved. Update the branch and let it re-run."];
}

/**
 * DOES THIS HEAD CONTAIN `main`'s TIP? — an ANCESTRY fact, and the clock cannot answer it (#182).
 *
 * The function above compares the newest run's completion time against `main`'s tip commit DATE, and that
 * was a proxy standing in for this question. **A run can finish AFTER `main`'s tip was committed while the
 * branch still does not contain that commit** — which is not a corner case, it is what ordinary concurrent
 * merging produces. Measured 2026-09-07 on #165: `main` tipped 01:31:03Z with #147, #165's run finished
 * later, the branch had never seen #147, and this tool printed *"run against the current main"* and exited
 * 0. GitHub refused the merge; `gh pr update-branch` then reported the branch updated.
 *
 * The original comment stated the right question — *"whether this head was ever tested alongside the code
 * it is about to join"* — and then asked a different one. Two commits' timestamps say nothing about
 * whether one contains the other.
 *
 * KEPT SEPARATE FROM THE CLOCK CHECK, deliberately. `PREDATES` and `DOES NOT CONTAIN` are different
 * faults: the first says the runs are old, the second says the tree is. Collapsing them into one message
 * would lose the diagnosis the original was built for — #135's runs genuinely predate the tip, and that
 * sentence, with both timestamps, is still the right thing to print about it.
 *
 * `behind_by` FROM THE COMPARE API, NOT `mergeStateStatus`. That distinction is this tool's whole reason
 * for existing, so it is worth being exact: `mergeStateStatus` folds together checks, conflicts and branch
 * protection into one opinion about mergeability, which is why it reads `CLEAN` for a PR nothing ever
 * tested. `behind_by` is arithmetic on the commit graph — how many commits `main` has that this head does
 * not — and it is the same fact `git merge-base --is-ancestor` answers, asked of a server that has both
 * commits without this checkout needing to fetch a PR ref it may never have seen.
 *
 * @param {number | null} behindBy
 * @returns {string[]}
 */
function ancestryReason(behindBy) {
  if (behindBy === null || behindBy === 0) return [];
  return [`THIS HEAD DOES NOT CONTAIN main's TIP — it is ${behindBy} commit(s) behind.\n`
    + "  Whatever ran, ran against a tree missing that work, so it cannot say the two go together. This is\n"
    + "  NOT the same as the runs being old: they may be minutes fresh and still have tested a base that\n"
    + "  no longer exists. Update the branch and let it re-run."];
}

/**
 * A GUARD WHOSE WRONG ANSWERS ARE ABSORBED BY ANOTHER MECHANISM HAS NO FAILURE SIGNAL (#188).
 *
 * #182 was caught only because strict branch protection refused what this tool passed — the guard's own
 * wrongness was invisible until somebody happened to run `gh pr update-branch` right after. Nothing
 * compared the guard's verdict to what actually happened, so the disagreement left no record anywhere.
 *
 * So: every verdict this tool computes for an OPEN PR is appended to a log. Once a PR is terminal (merged
 * or closed), `--reconcile` compares the LAST recorded verdict against the real outcome and records
 * whether they AGREED or DISAGREED — always, not only on conflict, because a log that only records
 * disagreements cannot tell "the two agreed" from "the two were never compared" (`worker-capture`'s
 * constraint on this row).
 *
 * THE COMPARISON TARGET IS `pr.state` (MERGED / CLOSED), NEVER `mergeStateStatus`. The issue is explicit
 * that this must be an OUTCOME, not an opinion — the same distinction the rest of this file exists for.
 * There is deliberately no attempt to reconstruct history for PRs that resolved before this shipped:
 * "did this merge need an update first" is not reliably decidable from git alone after the fact, so
 * reconciliation is forward-only rather than producing a plausible retro-verdict.
 *
 * THE LOG LIVES AT THE GIT COMMON DIR, NEVER `runs/`. `runs/` exists only in the primary checkout (it is
 * gitignored, and absent from every worktree) — a worker running this from its own worktree would write
 * this log nowhere, silently, and an empty log from "nothing ran here" is indistinguishable from an empty
 * log from "nothing ever disagreed", which is exactly the failure mode this row exists to close. The git
 * common dir resolves to the SAME `.git` for the primary and every worktree.
 */
/** @type {[RegExp, string][]} */
const REASON_KINDS = [
  [/^BASE IS NOT main/, "BASE_NOT_MAIN"],
  [/^NO CHECK RUNS EXIST/, "NO_RUNS"],
  [/^REQUIRED CONTEXT NEVER RAN/, "MISSING_REQUIRED_CONTEXT"],
  [/^STILL RUNNING/, "STILL_RUNNING"],
  [/^FAILING/, "FAILING"],
  [/^THIS HEAD DOES NOT CONTAIN main's TIP/, "ANCESTRY"],
  [/^EVERY RUN PREDATES THE CURRENT main/, "STALE"],
  [/^WOULD CLOSE #/, "CLAIMED_BY_ANOTHER_SESSION"],
];

/**
 * WHICH reason a refusal is, not just that there was one — because "the guard refused for ancestry and
 * GitHub merged it" and "the guard refused for a missing check and GitHub merged it" are different bugs,
 * and a bare verdict cannot distinguish them.
 *
 * @param {string} reason
 * @returns {string}
 */
export function reasonKind(reason) {
  const hit = REASON_KINDS.find(([pattern]) => pattern.test(reason));
  return hit ? hit[1] : "UNCLASSIFIED";
}

/**
 * Never a silent no-op: a write failure is the exact defect this mechanism exists to avoid.
 *
 * Exported (#226) so a second log -- `row-claim`'s check/conflict log -- reuses this rather than
 * re-deriving "append one JSON line, fail loud" a second time in this repo.
 *
 * @param {string} path
 * @param {object} entry
 */
export function appendJsonl(path, entry) {
  try {
    appendFileSync(path, `${JSON.stringify(entry)}\n`);
  } catch (error) {
    throw new Error(`could not write the log at ${path}: ${/** @type {Error} */ (error).message}`,
      { cause: error });
  }
}

/** @returns {string} the `.git` directory shared by the primary checkout and every worktree. */
export function gitCommonDir() {
  return execFileSync("git", ["rev-parse", "--git-common-dir"],
    { encoding: "utf8", env: sandboxGitEnv() }).trim();
}

export function verdictLogPath() {
  return `${gitCommonDir()}/merge-guard-log.jsonl`;
}

export function agreementLogPath() {
  return `${gitCommonDir()}/merge-guard-agreement-log.jsonl`;
}

/**
 * Appends one verdict. Called on every live guard run against an OPEN PR.
 * @param {string} logPath
 * @param {number} prNumber
 * @param {{code: number, reasons: string[]}} verdict
 */
export function recordVerdict(logPath, prNumber, verdict) {
  appendJsonl(logPath, {
    prNumber, at: new Date().toISOString(),
    code: verdict.code,
    reasonKinds: verdict.reasons.map(reasonKind),
  });
}

/**
 * The most recently recorded verdict for a PR, or null if none was ever recorded.
 * @param {string} logPath
 * @param {number} prNumber
 * @returns {{prNumber: number, at: string, code: number, reasonKinds: string[]} | null}
 */
export function latestVerdictFor(logPath, prNumber) {
  let text;
  try {
    text = readFileSync(logPath, "utf8");
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === "ENOENT") return null;
    throw error;
  }
  const entries = text.split("\n").filter(Boolean).map((line) => JSON.parse(line))
    .filter((entry) => entry.prNumber === prNumber);
  return entries.length > 0 ? entries[entries.length - 1] : null;
}

/**
 * `pr.state` -> a real outcome, or null when there isn't one yet. Never `mergeStateStatus` — see the
 * header above this section.
 *
 * @param {string} state
 * @returns {"ACCEPTED" | "REFUSED" | null}
 */
export function realOutcomeFor(state) {
  if (state === "MERGED") return "ACCEPTED";
  if (state === "CLOSED") return "REFUSED";
  return null; // OPEN, or anything not yet terminal
}

/**
 * THE COMPARISON, PURE. Records AGREEMENT as explicitly as DISAGREEMENT — an absent line here is
 * indistinguishable from "never compared", which is the trap this row exists to close.
 *
 * `resolvedAt` guards a real trap, found by running this live against an already-merged PR: recomputing
 * the guard's verdict AFTER a PR has resolved almost always reads REFUSED, because `main` has kept moving
 * and the merged head is now "behind" a tip it was never tested against and never needed to be — that is
 * not a disagreement, it is a stale question asked of a settled outcome. So a verdict recorded AFTER the
 * PR's own resolution timestamp is refused here rather than reconciled: it was never a live, pre-decision
 * check, and treating it as one would flood this log with false DISAGREED entries for every merged PR
 * anyone runs the guard against after the fact.
 *
 * @param {{prNumber: number, recordedVerdict: {code: number, reasonKinds: string[], at: string} | null,
 *          realOutcome: "ACCEPTED" | "REFUSED" | null, resolvedAt: string | null}} args
 * @returns {{code: number, reason: string, record: null} | {code: number, reason: null, record:
 *   {prNumber: number, at: string, guardVerdict: "READY" | "REFUSED", guardReasonKinds: string[],
 *    realOutcome: "ACCEPTED" | "REFUSED", agreement: "AGREED" | "DISAGREED"}}}
 */
export function reconcile({ prNumber, recordedVerdict, realOutcome, resolvedAt }) {
  if (recordedVerdict === null) {
    return { code: EXIT.CANNOT_ASK, record: null,
      reason: `no recorded guard verdict for #${prNumber} — nothing to reconcile against.` };
  }
  if (realOutcome === null) {
    return { code: EXIT.CANNOT_ASK, record: null,
      reason: `#${prNumber} has no outcome yet — reconciliation is forward-only and never invents one ` +
        "for a PR that is still OPEN." };
  }
  if (resolvedAt != null && recordedVerdict.at > resolvedAt) {
    return { code: EXIT.CANNOT_ASK, record: null,
      reason: `the recorded verdict for #${prNumber} (${recordedVerdict.at}) was made AFTER it resolved ` +
        `(${resolvedAt}) — that is a stale post-mortem question, not a live pre-decision check, and ` +
        "comparing it would read as a disagreement for a reason that has nothing to do with the merge." };
  }
  const guardVerdict = recordedVerdict.code === EXIT.READY ? "READY" : "REFUSED";
  const platformAccepted = realOutcome === "ACCEPTED";
  const agreement = (guardVerdict === "READY") === platformAccepted ? "AGREED" : "DISAGREED";
  return {
    code: EXIT.READY,
    reason: null,
    record: {
      prNumber, at: new Date().toISOString(), guardVerdict,
      guardReasonKinds: recordedVerdict.reasonKinds, realOutcome, agreement,
    },
  };
}

/**
 * Each lookup returns null on failure rather than an empty answer — the distinction the verdict needs.
 * @template T
 * @param {() => T} fn
 * @returns {T | null}
 */
export function lookup(fn) {
  try {
    return fn();
  } catch (error) {
    void error;
    return null;
  }
}

// EXPORTED SO `workflow-run-liveness.mjs` (#118) DOES NOT RE-DERIVE THESE — the same
// fact-stated-twice shape this repo's own CLAUDE.md names most often, one call away from happening here.
// Both return `null` on failure, never an empty answer: `lookup`'s whole point is that "could not ask" and
// "asked and got nothing" must stay distinguishable.

/** The branch-protection required status-check contexts for `main`, or `null` if the lookup failed. */
export function lookupRequiredContexts() {
  return lookup(() => JSON.parse(
    gh(["api", `repos/${REPO}/branches/main/protection/required_status_checks`])).contexts);
}

/**
 * Every check run recorded against a commit sha, or `null` if the lookup failed.
 * @param {string} sha
 * @returns {{name: string, status: string, conclusion: string | null, completedAt: string | null}[] | null}
 */
export function lookupCheckRuns(sha) {
  return lookup(() => JSON.parse(
    gh(["api", `repos/${REPO}/commits/${sha}/check-runs`, "--paginate"])).check_runs
    .map((/** @type {{name: string, status: string, conclusion: string | null, completed_at: string | null}} */ run) => (
      { name: run.name, status: run.status, conclusion: run.conclusion, completedAt: run.completed_at })));
}

/**
 * Which issues arming PR `number` would close, resolved by GitHub itself (never a `Closes #N` regex over
 * the PR body) -- #249. `null` on failure, same as every other lookup here.
 * @param {number} number
 * @returns {{number: number, title?: string, labels: string[]}[] | null}
 */
export function lookupClosingIssues(number) {
  return lookup(() => {
    const [owner, name] = REPO.split("/");
    const query = "query($owner:String!,$name:String!,$number:Int!){"
      + "repository(owner:$owner,name:$name){pullRequest(number:$number){"
      + "closingIssuesReferences(first:20){nodes{number title labels(first:20){nodes{name}}}}}}}";
    const data = JSON.parse(gh(["api", "graphql", "-f", `query=${query}`,
      "-F", `owner=${owner}`, "-F", `name=${name}`, "-F", `number=${number}`]));
    return data.data.repository.pullRequest.closingIssuesReferences.nodes.map(
      (/** @type {{number: number, title: string, labels: {nodes: {name: string}[]}}} */ issue) => ({
        number: issue.number, title: issue.title,
        labels: issue.labels.nodes.map((/** @type {{name: string}} */ l) => l.name),
      }));
  });
}

/** @param {number} number */
function facts(number) {
  // DELIBERATELY NOT REQUESTING `mergeStateStatus`. Asking for it at all would invite the next reader to
  // use it, and this tool's entire reason for existing is that its answer cannot be trusted here.
  const pr = JSON.parse(gh(["pr", "view", String(number), "--repo", REPO,
    "--json", "number,state,baseRefName,headRefOid"]));
  const required = lookupRequiredContexts();
  const runs = lookupCheckRuns(pr.headRefOid);
  const mainTipIso = lookup(() => gh(["api", `repos/${REPO}/commits/main`,
    "--jq", ".commit.committer.date"]).trim() || null);
  // `behind_by` is how many commits `main` has that this head does not -- the ancestry fact, not a
  // mergeability opinion. `lookup` keeps a failed call NULL so it lands as INCONCLUSIVE rather than 0,
  // which would read as "contains main's tip" and reintroduce the false pass this replaced.
  const behindBy = lookup(() => {
    const value = JSON.parse(gh(["api",
      `repos/${REPO}/compare/main...${pr.headRefOid}`])).behind_by;
    return typeof value === "number" ? value : null;
  });
  const closes = lookupClosingIssues(number);
  return { pr, required, runs, mainTipIso, behindBy, closes };
}

/**
 * `--reconcile <n>`: compare the LAST recorded verdict for #n against its real, terminal outcome (#188).
 * @param {number} number
 */
function reconcileCommand(number) {
  const recordedVerdict = latestVerdictFor(verdictLogPath(), number);
  const pr = JSON.parse(gh(["pr", "view", String(number), "--repo", REPO,
    "--json", "state,mergedAt,closedAt"]));
  const realOutcome = realOutcomeFor(pr.state);
  const resolvedAt = pr.mergedAt ?? pr.closedAt ?? null;
  const result = reconcile({ prNumber: number, recordedVerdict, realOutcome, resolvedAt });
  // NARROWED ON `record`, NEVER ON `code` -- `code` is typed as plain `number` in both branches of
  // `reconcile`'s return union, so comparing it to `EXIT.READY` (also a plain number) cannot narrow
  // which branch this is. `record` is the actual discriminant: null in one branch, an object in the
  // other. Checking the wrong field type-checked as fine before #234 added `@ts-check` to this file.
  if (result.record === null) {
    console.error(`CANNOT RECONCILE #${number}: ${result.reason}`);
    process.exit(result.code);
  }
  appendJsonl(agreementLogPath(), result.record);
  console.log(`#${number}: guard said ${result.record.guardVerdict} `
    + `(${result.record.guardReasonKinds.join(", ") || "no reasons"}), the platform's real outcome was `
    + `${result.record.realOutcome} — ${result.record.agreement}.`);
  process.exit(EXIT.READY);
}

function main() {
  refuseUnknownFlags(["--reconcile", "--session", "--allow-claimed-close"],
    { entry: import.meta.url, command: "node scripts/merge-guard.mjs" });
  const number = process.argv.slice(2).find((arg) => /^\d+$/.test(arg));
  if (!number) {
    console.error("Usage: node scripts/merge-guard.mjs <pr-number> [--session=<name>] [--allow-claimed-close]\n"
      + "       node scripts/merge-guard.mjs --reconcile <pr-number>\n"
      + "Answers whether that PR has actually been tested, by reading its check RUNS rather than\n"
      + "`mergeStateStatus` -- which reports CLEAN for a PR that has never run a check. `--reconcile`\n"
      + "compares the last recorded verdict against the PR's real, terminal outcome (#188).");
    process.exit(EXIT.CANNOT_ASK);
  }

  if (process.argv.includes("--reconcile")) {
    reconcileCommand(Number(number));
    return;
  }

  const sessionArg = process.argv.find((arg) => arg.startsWith("--session="));
  const session = sessionArg ? sessionArg.slice("--session=".length) : null;
  const allowClaimedClose = process.argv.includes("--allow-claimed-close");

  const verdict = mergeReadiness({ ...facts(Number(number)), session });
  recordVerdict(verdictLogPath(), Number(number), verdict);
  for (const note of verdict.notes) console.error(note);

  // `--allow-claimed-close` OVERRIDES ONLY THE CLAIM-COLLISION REASON, never any other refusal, and
  // never a CANNOT_ASK (that code carries a lookup-failure message, not a reasons list to filter) --
  // and it PRINTS what it bypassed, following the `--allow-stale-workers` precedent: a bypass nobody
  // can see is one that becomes the default.
  const applyOverride = allowClaimedClose && verdict.code === EXIT.REFUSED;
  const overridden = applyOverride
    ? verdict.reasons.filter((r) => reasonKind(r) === "CLAIMED_BY_ANOTHER_SESSION") : [];
  const remaining = applyOverride
    ? verdict.reasons.filter((r) => reasonKind(r) !== "CLAIMED_BY_ANOTHER_SESSION") : verdict.reasons;
  for (const reason of overridden) {
    console.error(`OVERRIDDEN by --allow-claimed-close: ${reason}`);
  }
  const code = verdict.code === EXIT.CANNOT_ASK ? EXIT.CANNOT_ASK
    : (remaining.length > 0 ? EXIT.REFUSED : EXIT.READY);

  if (code === EXIT.READY) {
    console.log(`#${number} is tested: based on main, every required context present and concluded, and `
      + "this head CONTAINS main's tip -- so what ran, ran against the code it is about to join.");
  } else if (code === EXIT.REFUSED) {
    console.error(`REFUSING #${number}:\n${remaining.map((r) => `- ${r}`).join("\n")}`);
  }
  process.exit(code);
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) main();
