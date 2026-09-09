#!/usr/bin/env node
// @ts-check
// RULE: IS THE CLAIMING SESSION'S OWN OPEN PR RED OR UNMERGED? -- B2, #476.
//
// "A unit is finished when the PR reads MERGED -- not when the local run is green." #472's owner
// reported a clean local run and moved on while CI went red; nine PRs sat red on their acceptance lines
// the same night with their owners asleep, every one a fault its author could have fixed in a minute.
//
// So `row-claim` refuses a NEW claim while the claiming session's own open PR is still open at all --
// naming it and whether it is RED (a required check failing) or simply not yet merged -- rather than
// letting a session open a second front while its first is unresolved.
//
// `behind` alone MUST NOT block, per `ceo`'s ruling: under strict branch protection every merge puts
// every other open PR behind, and #406 sat `behind=55` while being entirely healthy -- `update-branch`
// now fixes that without the owner. So this asks only whether the PR is OPEN (blocking, regardless of
// its own CI colour -- "one PR in flight" is the rule's own name) versus MERGED (clear) or CLOSED
// (abandoned, no longer in flight); the message additionally says whether it is RED, because a red PR
// and a green-but-not-yet-merged PR need the same refusal but a different next action.
//
// FOUND VIA `closedByPullRequestsReferences`, THE REVERSE OF `merge-guard.mjs`'s OWN `closingIssuesReferences`
// -- not a `session:*` label on the PR (that label is a manual HOLD, applied by `pr:hold`, and most open
// PRs never carry one) and not a branch-name convention (not every branch encodes its issue number). The
// one fact this whole fleet can rely on is which issue a PR's own `Closes #N` resolves, because GitHub
// computes it server-side. So: find the OTHER issues `mySession` currently holds (`in-progress` +
// `session:<name>`, excluding the row being claimed right now), and ask GitHub which PR would close each.
import { REPO } from "../repo-identity.mjs";
import { gh, lookup, lookupRequiredContexts, lookupCheckRuns } from "../merge-guard/lookups.mjs";
import { checkReasons } from "../merge-guard/checks-rule.mjs";

// NO `git` SPAWN HERE, deliberately -- every lookup in this file goes through `gh` (issue/PR/GraphQL
// reads), which needs no `sandboxGitEnv()` scrub: that helper exists for `execFileSync("git", ...)`
// specifically (a leaked `GIT_DIR` redirects a spawned GIT call onto the wrong repository), and
// `git-spawn-classification.test.ts` discovers files spawning `git`, not `gh`. #455 found the real gap
// this shape can hide in `scripts/merge-guard/lookups.mjs`; this file has no such call to have one in.

/**
 * #733: THE COLOUR, NAMED FROM THE REASONS THEMSELVES -- `checkReasons` (`checks-rule.mjs`) already
 * separates "still running" from "failing" (and "never ran") in its own returned strings; this reads
 * those categories back rather than re-deriving them, so a mutation to `checkReasons`'s own output shape
 * is the only thing that can desynchronise this from what it actually found.
 *
 * `unfinished`-only is a DIFFERENT sentence from `failing`-only: a still-running required check is not a
 * failure a claimant can go fix, it is a wait whose remedy is asking again -- reported to `checkReasons`'s
 * own PROSE as "Not a refusal forever". Naming it "a required check is failing" sent a reader
 * (`product-manager`, #733) looking for a failure that did not exist, on a PR that needed nothing but 80
 * more seconds.
 * @param {readonly string[]} reasons the exact array `checkReasons` returned for this PR's head
 * @returns {string}
 */
function colourFor(reasons) {
  const stillRunning = reasons.some((reason) => reason.startsWith("STILL RUNNING"));
  const failing = reasons.some((reason) => reason.startsWith("FAILING")
    || reason.startsWith("REQUIRED CONTEXT NEVER RAN"));
  if (failing && stillRunning) {
    return "RED (a required check is failing) AND STILL RUNNING (another has not finished -- not a "
      + "refusal forever on that half, ask again)";
  }
  if (failing) return "RED (a required check is failing)";
  if (stillRunning) return "STILL RUNNING (a required check has not finished yet -- not a failure; the "
    + "wait is the remedy, ask again)";
  return "not yet merged";
}

/**
 * THE VERDICT, PURE.
 *
 * @param {{ number: number, state: "OPEN" | "MERGED" | "CLOSED", reasons: readonly string[] } | null} ownPr
 * @returns {string | null}
 */
export function ownPrHealthReason(ownPr) {
  if (ownPr === null) return null;
  if (ownPr.state !== "OPEN") return null;
  const colour = colourFor(ownPr.reasons);
  return `#${ownPr.number} is still open and ${colour} -- a unit is finished when the PR reads MERGED, `
    + "not when a local run is green. Finish that one before starting another (this is B2: one PR in "
    + "flight per session).";
}

/**
 * Every OTHER issue `mySession` currently holds (`in-progress` + `session:<name>`), excluding the row
 * being claimed right now -- `null` on a failed lookup, never `[]`, the same convention every lookup in
 * this fleet uses: a network failure must never read as "holds nothing".
 *
 * @param {string} mySession
 * @param {number} excludeIssueNumber
 * @param {{ run?: (args: string[]) => string }} [deps]
 * @returns {number[] | null}
 */
export function lookupOtherHeldIssues(mySession, excludeIssueNumber, { run = gh } = {}) {
  return lookup(() => {
    const raw = run(["issue", "list", "--repo", REPO, "--state", "open",
      "--label", "in-progress", "--label", `session:${mySession}`, "--json", "number"]);
    /** @type {{ number: number }[]} */
    const parsed = JSON.parse(raw);
    return parsed.map((issue) => issue.number).filter((n) => n !== excludeIssueNumber);
  });
}

/**
 * Which PR (if any) would close `issueNumber`, and whether that PR's head is RED right now.
 *
 * `closedByPullRequestsReferences` is resolved server-side by GitHub, never a `Closes #N` regex over a
 * PR body -- the same discipline `merge-guard.mjs`'s `lookupClosingIssues` already applies in reverse.
 * `null` on a failed lookup; `{ number, state: "OPEN"/"MERGED"/"CLOSED", reasons }` when a closing PR
 * exists (`reasons` is `checkReasons`'s own exact returned array, `[]` when nothing blocks or when the
 * required-contexts/check-runs sub-lookup itself failed -- see #476's own "fail open" rule); an issue with
 * NO closing PR at all (nobody has opened one yet) is reported as `undefined`, distinct from a failed
 * lookup -- "nothing to check" and "could not ask" are different states.
 *
 * @param {number} issueNumber
 * @param {{ run?: (args: string[]) => string, requiredContexts?: typeof lookupRequiredContexts,
 *           checkRuns?: typeof lookupCheckRuns }} [deps]
 * @returns {{ number: number, state: "OPEN" | "MERGED" | "CLOSED", reasons: string[] } | undefined | null}
 */
export function lookupClosingPrHealth(issueNumber,
  { run = gh, requiredContexts = lookupRequiredContexts, checkRuns = lookupCheckRuns } = {}) {
  return lookup(() => {
    const [owner, name] = REPO.split("/");
    const query = "query($owner:String!,$name:String!,$number:Int!){"
      + "repository(owner:$owner,name:$name){issue(number:$number){"
      + "closedByPullRequestsReferences(first:5){nodes{number state headRefOid}}}}}";
    const data = JSON.parse(run(["api", "graphql", "-f", `query=${query}`,
      "-F", `owner=${owner}`, "-F", `name=${name}`, "-F", `number=${issueNumber}`]));
    /** @type {{ number: number, state: "OPEN" | "MERGED" | "CLOSED", headRefOid: string }[]} */
    const nodes = data.data.repository.issue.closedByPullRequestsReferences.nodes;
    if (nodes.length === 0) return undefined;
    // MOST RECENT (last) reference wins -- an issue can accumulate more than one over its life (a
    // reverted fix reopened and closed by a second PR); the newest is the one that matters now.
    const pr = nodes[nodes.length - 1];
    if (pr.state !== "OPEN") return { number: pr.number, state: pr.state, reasons: [] };
    // INJECTABLE, NOT THE BARE IMPORTS -- `lookupRequiredContexts`/`lookupCheckRuns` spawn `gh` through
    // their OWN internal helper, not through this file's `run` parameter, so a test injecting `run` alone
    // would silently make a real network call the moment a fixture's PR reads OPEN. Defaulting the params
    // to the real functions keeps production behaviour identical; only a test needs to override them.
    const required = requiredContexts();
    const runs = checkRuns(pr.headRefOid);
    const reasons = required !== null && runs !== null
      ? checkReasons({ headRefOid: pr.headRefOid }, required, runs) : [];
    return { number: pr.number, state: "OPEN", reasons };
  });
}

/**
 * THE FULL LOOKUP, composed: does `mySession` hold any OTHER row whose PR is open? `null` on ANY failed
 * sub-lookup -- an inconclusive answer must never read as "healthy", which would silently defeat the
 * rule this file exists to enforce.
 *
 * @param {string} mySession
 * @param {number} excludeIssueNumber the row being claimed right now -- never checked against itself
 * @param {{ run?: (args: string[]) => string, requiredContexts?: typeof lookupRequiredContexts,
 *           checkRuns?: typeof lookupCheckRuns }} [deps]
 * @returns {{ number: number, state: "OPEN" | "MERGED" | "CLOSED", reasons: string[] } | null}
 */
export function lookupOwnPrHealth(mySession, excludeIssueNumber, deps = {}) {
  const otherHeld = lookupOtherHeldIssues(mySession, excludeIssueNumber, deps);
  if (otherHeld === null) return null;
  if (otherHeld.length === 0) return null;
  // #476 is B2, "ONE PR in flight" -- so ordinarily this is 0 or 1 issues. If more than one is somehow
  // held (a state this rule exists to prevent from recurring, not one it assumes never happened before
  // it shipped), the FIRST one found unhealthy is reported; a session with several open fronts learns
  // about one and fixes it before the others are even asked about, rather than being handed all of them
  // in one refusal that reads like a demand.
  for (const issueNumber of otherHeld) {
    const health = lookupClosingPrHealth(issueNumber, deps);
    if (health === null) return null; // a failed lookup partway through is INCONCLUSIVE, not "healthy"
    if (health === undefined) continue; // no PR opened yet for that row -- nothing to be unhealthy
    if (health.state === "OPEN") return health;
  }
  return null;
}
