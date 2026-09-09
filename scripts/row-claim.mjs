// @ts-check
// command: check, claim, or decline a tracker row by reading its labels, the record, never git history
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
//
// #176 (2026-09-07): a `session:` label marked who held a row AFTER they took it, but nothing marked it
// as it went OUT -- so a row handed out in a dispatcher message and a row taken by `claim` were
// indistinguishable from unclaimed until the SECOND of the two acted, and three real double-dispatches
// (#156, #158, #159) were caught only by a worker's own caution, not by this tool. The fix, per
// `dispatcher`'s 2026-09-07 ruling quoted on the row: apply `in-progress` + `session:<name>` at DISPATCH,
// not only at claim -- so THREE states exist, not two: unclaimed, dispatched-but-not-started (in-progress
// + session, no `started`), and started (`started` too). `dispatchRow` writes the first pair;
// `claimRow`/`startRow` additionally writes `started`, so a worker pulling a row itself with no prior
// dispatch goes straight from unclaimed to started, and a worker beginning a row dispatcher already
// marked goes from dispatched to started without a second race window.
//
// The cost this trades for: a row dispatched and then declined would sit marked forever with nobody
// obligated to un-label it -- `dispatcher`'s own judgement is that a STALE `in-progress` is visible and
// costs a question, while a double-dispatch is invisible and costs a worker's evening, and that trade is
// right. `declineRow` is the remedy: it returns a row this session holds to genuinely unclaimed, and is
// also the general "give it back" this tool always lacked -- #186 needed it too, when `worker-audit`
// claimed a row, found it unstartable, and had no way to release it short of a hand edit.
//
// #226: A WORKER FINDING A DISPATCHED ROW ALREADY CLOSED, HELD OR BUILT IS A DISAGREEMENT NOBODY RECORDS.
// Three times on 2026-09-07 a worker ran `check`, was told a verdict, and then discovered reality was
// different -- and every one of those reached `dispatcher` as a message and died there. This is #188 one
// layer out: `merge-guard`'s wrong answers were absorbed by branch protection, so nothing recorded them
// being wrong; `row-claim check`'s wrong answers are absorbed by a person being careful, which does not
// survive the session.
//
// So EVERY `check` call now appends its own verdict to a log -- unconditionally, not only when something
// later turns out wrong. That is what makes "how often is this tool wrong" answerable rather than "three
// times that somebody happened to mention": the check-log is the DENOMINATOR, and a `conflict` entry
// (recorded by a worker who found reality different, pairing the tool's own verdict with what they found)
// is the NUMERATOR. A log that only ever grew on disagreement could never tell "the tool was right" from
// "nobody checked" -- the exact trap #188's `agreementLogPath` already exists to avoid, and the reason
// this reuses its `gitCommonDir`/`appendJsonl` (both exported from `merge-guard.mjs` for exactly this)
// rather than inventing a second version of "append one JSON line, fail loud".
//
// IT RECORDS; IT NEVER GATES -- same as `reportReachability` below. A log write failing is reported and
// never touches `process.exitCode`, for the identical reason `reportReachability`'s own failure does not:
// "I could not tell you whether it is claimed" and "I could not log that I told you" are different
// failures, and conflating them would make a full disk read as an unreadable board.
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { existsSync, realpathSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
// RELATIVE, NOT the `@a11ign/worker-fleet/cli-flags` package specifier: that export map
// points at `dist/`, so it needs both `node_modules` AND a completed build. This file is reachable
// from a pre-install entry (see `pre-install-import-graph.test.ts`, which derives that population
// rather than naming it), and there it dies on startup with ERR_MODULE_NOT_FOUND.
import { refuseUnknownFlags } from "../packages/worker-fleet/src/cli-flags.mjs";
import { REPO } from "./repo-identity.mjs";
import { READY_LABEL, WAS_READY_LABEL } from "./ready-label-audit.mjs";
import { gitCommonDir, appendJsonl } from "./merge-guard.mjs";
import { withBoardSnapshot, PROJECT_OWNER, PROJECT_NUMBER } from "./board-snapshot.mjs";
import { runnerReason } from "./row-claim/runner-rule.mjs";
import { ownPrHealthReason, lookupOwnPrHealth } from "./row-claim/own-pr-health-rule.mjs";
import { fileOverlapReason, lookupMyRegionFiles, lookupOpenPrFiles } from "./row-claim/file-overlap-rule.mjs";
import { templateFieldsReason, lookupIssueBody } from "./row-claim/template-fields-rule.mjs";
import { sandboxGitEnv } from "./git-env.mjs";

export const CLAIM_LABEL = "in-progress";
export const STARTED_LABEL = "started";
export const BLOCKED_LABEL = "blocked";
// #656: THE CLAIM RECORDS THE BRANCH. `session:*` names WHO holds a row; nothing named WHAT git object
// that session was actually working on, so the dispatcher's own attempt to carry #614 -- "the row moves
// to whoever is free" -- discovered only by running `git worktree add` that the branch was checked out
// on this same machine, in the owner's own worktree, with no way to have known that beforehand. A row's
// claim is now the one place that fact is recorded, so an escalating session can tell a PORTABLE row
// (branch not held anywhere) from a HELD one before it ever offers to take it.
export const BRANCH_LABEL_PREFIX = "branch:";
// #665: THE CLAIM RECORDS THE WORKTREE TOO. Measured 2026-09-09T10:03Z: 115 worktrees on the host with
// ~57 MB free -- each row taken opens one and nothing closes it when the row is done, because "prune
// after every merge" is a habit, and this repository's own rule is that anything a human has to
// remember is something that does not happen. Recording the path at claim time is what lets RELEASING
// the claim -- the moment the releasing session, and only it, is known to be done with that directory --
// remove it automatically rather than trusting the next sweep to notice.
export const WORKTREE_LABEL_PREFIX = "worktree:";

/**
 * @typedef {{ number: number, title: string, labels: string[], state?: "OPEN" | "CLOSED" }} IssueClaim
 */

/**
 * #709: `git worktree remove` (below) DESTROYS A DIRECTORY, and an unscrubbed spawn inherits any
 * `GIT_DIR`/`GIT_WORK_TREE` a caller's environment carries -- the exact shape that once redirected a
 * spawned git call onto the wrong repository. `sandboxGitEnv()` scrubs every `GIT_*` var; applying it to
 * every spawn here, `gh` included, costs nothing (`gh` reads none of them) and needs no second helper for
 * the one call that actually matters.
 * @type {(cmd: string, args: string[]) => string}
 */
const defaultRun = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8", env: sandboxGitEnv() });

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
    raw = run("gh", ["issue", "view", String(issueNumber), "--repo", REPO,
      "--json", "number,title,labels,state"]);
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
  const obj = /** @type {{ number?: unknown, title?: unknown, labels?: unknown, state?: unknown }} */ (parsed);
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
  // #752: OPTIONAL, DELIBERATELY -- every existing caller/test that mocks a `gh issue view` response
  // without a `state` field must keep behaving exactly as it did (the open case), so an absent or
  // unrecognised value is treated as "not verified closed" rather than refused outright. `declineRow`
  // is the one place this actually changes behaviour, and only when `state` is the literal `"CLOSED"`.
  const state = obj.state === "OPEN" || obj.state === "CLOSED" ? obj.state : undefined;
  return { number: obj.number, title: obj.title, labels: names, state };
}

/**
 * Pure: does this label set say the row is claimed, and by whom, and has work actually started?
 *
 * `sessions` can be EMPTY even when `claimed` is true -- a row moved to In progress by the dispatcher
 * before assigning it (exactly how #55 itself was claimed) has `in-progress` with no `session:*` yet.
 * That is still a claim; "claimed, owner not yet recorded" and "unclaimed" are different states and this
 * function does not conflate them.
 *
 * `started` is a THIRD, independent bit (#176): `in-progress` alone (or with a session) means dispatched
 * but not yet begun; `in-progress` + `started` means the assigned session is actually working it. A row
 * can be `claimed` with `started: false` -- that is the dispatched-not-started state this function exists
 * to make visible, not an inconsistency to normalise away.
 *
 * `branch` (#656) is the row's recorded `branch:<name>` label, or `null` when none is set -- a row can
 * be legitimately claimed with no branch yet (dispatched but not started, or a non-code row entirely), so
 * absence here is a real state, not a parse failure. Only the FIRST such label is read; more than one
 * would mean two claims wrote branches without one being declined first, which `writeRowLabels`'s own
 * race handling already prevents from standing.
 *
 * `worktree` (#665) is the identical shape one field over -- the row's recorded `worktree:<path>` label,
 * or `null`. Recorded alongside `branch` so `declineRow` knows what directory to remove when the claim
 * is released, without guessing a path from a naming convention nobody enforces.
 *
 * @param {string[]} labels
 * @returns {{ claimed: boolean, started: boolean, sessions: string[], branch: string | null, worktree: string | null }}
 */
export function claimStatus(labels) {
  const branchLabel = labels.find((l) => l.startsWith(BRANCH_LABEL_PREFIX));
  const worktreeLabel = labels.find((l) => l.startsWith(WORKTREE_LABEL_PREFIX));
  return {
    claimed: labels.includes(CLAIM_LABEL),
    started: labels.includes(STARTED_LABEL),
    sessions: labels.filter((l) => l.startsWith("session:")).map((l) => l.slice("session:".length)),
    branch: branchLabel ? branchLabel.slice(BRANCH_LABEL_PREFIX.length) : null,
    worktree: worktreeLabel ? worktreeLabel.slice(WORKTREE_LABEL_PREFIX.length) : null,
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
  // #444: a RESERVATION check, ahead of the CLAIM check -- a row can be `ready` (not yet `in-progress`)
  // and still reserved for a specific session, which is #324's own shape before anyone claims it.
  const reserved = runnerReason(labelsBefore, mySession);
  if (reserved) return { proceed: false, reason: reserved };

  const status = claimStatus(labelsBefore);
  if (!status.claimed) return { proceed: true };
  if (status.sessions.includes(mySession)) return { proceed: true };
  const by = status.sessions.length > 0 ? status.sessions.join(", ") : "someone (no session label recorded yet)";
  return { proceed: false, reason: `issue is already claimed by ${by}` };
}

/**
 * Moves an issue's Project Status field -- the VIEW -- to match the label that is the RECORD. #400: a
 * claim writing the label and leaving Status behind is what let 45 stale Status values regenerate at the
 * rate work is claimed, measured live as `unlabeled ready / labeled in-progress` for the three minutes
 * between a real claim and the next hourly audit.
 *
 * SNAPSHOTTED FIRST, via `withBoardSnapshot` (#399): the day this row was filed, a single-field Project
 * mutation silently dropped all 112 items' Status values, and only a snapshot taken minutes earlier for
 * an unrelated reason made recovery possible. No board write ships without one.
 *
 * NEVER THROWS, on purpose -- but the two ways it can fail to move Status are NOT the same failure, per
 * `ceo`'s 2026-09-08 ruling on this issue: "'could not ask' and 'asked and wrote' must not look the same,
 * and a half-applied claim is worse than none."
 *
 * A row genuinely not on the Project is a real, common state -- four existed the night this was written --
 * and `gh project item-edit` refuses it with a STABLE, recognisable message ("is not an item in project
 * N"); this is the one case this issue's own acceptance text names outright ("a claim on a row that is not
 * on the Project at all must not fail"), so it is reported as `notOnBoard: true` and never treated as a
 * defect for a caller to surface as a failure.
 *
 * ANY OTHER failure -- auth, network, a field-name typo, a real API error -- is the half-applied case ceo's
 * ruling is about: the label (the record) was written and the view write genuinely did not reach the
 * board. That is reported as `notOnBoard: false`, and callers (`writeRowLabels`/`declineRow` below) surface
 * it distinctly rather than folding it into an ordinary success.
 *
 * Reading that a mutation failed is not the same failure as being unable to tell whether it failed at all
 * -- matching `reportReachability`'s own rule a few functions up -- so this still never THROWS; it reports
 * via the return value and `log`, and it is `writeRowLabels`/`declineRow`'s job to decide what that means
 * for their own exit code.
 *
 * @param {number} issueNumber
 * @param {string} statusName exactly one of the Project's real Status option names ("Ready", "In progress", …)
 * @param {{ run?: typeof defaultRun, log?: (line: string) => void, snapshot?: typeof withBoardSnapshot }} [deps]
 * @returns {{ moved: true } | { moved: false, reason: string, notOnBoard: boolean }}
 */
export function moveProjectStatus(issueNumber, statusName,
  { run = defaultRun, log = (line) => process.stderr.write(`${line}\n`), snapshot = withBoardSnapshot } = {}) {
  const url = `https://github.com/${REPO}/issues/${issueNumber}`;
  try {
    snapshot(() => run("gh", ["project", "item-edit", String(PROJECT_NUMBER), "--owner", PROJECT_OWNER,
      "--url", url, "--field", "Status", "--value", statusName]), { run, log });
    return { moved: true };
  } catch (error) {
    const message = /** @type {Error} */ (error).message;
    // `gh`'s own wording, observed live against issue #393 (closed, never added to the Project): stable
    // enough to match on because it names the mechanism ("is not an item in project N"), not a paraphrase.
    const notOnBoard = /is not an item in project/.test(message);
    const reason = `could not move #${issueNumber}'s Status to "${statusName}" -- ${message}`;
    log(`row-claim: ${reason}`);
    return { moved: false, reason, notOnBoard };
  }
}

/**
 * WRITE-THEN-VERIFY, not verify-then-write. Shared by `dispatchRow` and `claimRow`, which differ only in
 * whether `started` is among the labels written.
 *
 * Reading labels and THEN writing them leaves the gap between the two open to another session doing the
 * same thing -- and propagation lag is measured, not hypothetical (a bulk board query reported a row
 * `Ready` moments after it was known taken, 2026-09-06). Writing first narrows that window: this session's
 * own write lands as one atomic label-add, and the RE-READ after writing is what would catch a genuine
 * collision in the gap, not the read before it.
 *
 * NOT proven race-free, and that is stated rather than hidden: two `gh issue edit --add-label` calls a
 * few hundred milliseconds apart both succeed (label add is idempotent, not compare-and-swap), so a
 * collision landing inside this function's own write-then-reread window is only DETECTED after the fact,
 * on the re-read -- via `session:*` labels both being present -- never prevented outright. GitHub's REST
 * API has no compare-and-swap primitive for labels to close that window completely; building one (an
 * external lock service, or polling the issue timeline for the event PRECEDING commitment) is
 * disproportionate to a defect that, both times it fired today, was "nobody checked the board at all" --
 * not two sessions racing within the same second. That narrower race is refuted as a target for THIS row;
 * see the commit message for the measurement this claim rests on.
 *
 * Re-adding a label the row already carries (e.g. `claimRow` on a row `dispatchRow` already marked for
 * this same session) is a harmless no-op -- `--add-label` is idempotent -- so this needs no special case
 * for "already dispatched to me, now starting".
 *
 * ALSO REMOVES `ready` IN THE SAME CALL. `dispatchRow`/`claimRow` only ever added labels, so a row still
 * carrying `ready` at the moment it was dispatched came out the other side as `ready` + `in-progress` +
 * `session:*` -- exactly the state `ready-label-audit.mjs` exists to catch (a row cannot be both
 * "unclaimed, pickable" and "claimed"), found on #197's own review after being stripped by hand seventeen
 * times in one evening. `--remove-label` on a label a row does not carry is a harmless no-op, so this needs
 * no branch for "was it ready in the first place".
 *
 * `runner:*` (#444) IS DELIBERATELY NEVER REMOVED HERE -- it survives a claim, unlike `ready`. It records
 * WHO the row was reserved for, and that fact does not stop being true once the reservation is honoured;
 * removing it would lose the record of why a specific session took this row rather than another. A closed
 * row still carrying it is handled separately, as debris (`ready-label-audit.mjs`'s `isClosedDebrisLabel`).
 */

/**
 * B2 (#476) + B4 (#462), COMPOSED: should `mySession` start a NEW row right now, independent of whether
 * this particular row is claimed by someone else? `null` means proceed; a string is the refusal reason.
 *
 * BOTH FAIL OPEN ON A LOOKUP FAILURE, deliberately -- the opposite of `decideClaim`'s own "unclaimed must
 * be EARNED, not defaulted to" rule a few functions up. That rule protects a VERDICT about who holds a
 * row; this protects a session's ability to claim ANYTHING at all when the network is down or `gh` is
 * unauthenticated -- the identical reasoning `merge-guard.mjs`'s `racesAnArmedMerge` states for the same
 * choice made the other way: a convenience guard that blocks all work on a lookup failure gets bypassed
 * and then never consulted again, which is worse than the rare miss it would have caught.
 *
 * `requiredContexts`/`checkRuns` are separately injectable (rather than folded into `run`) because
 * `own-pr-health-rule.mjs`'s own lookup reads them through `merge-guard/lookups.mjs`'s dedicated helpers,
 * not through an arbitrary `gh` argv -- a test overriding only `run` would otherwise reach a real network
 * call the moment a fixture's own PR reads OPEN, which is exactly the trap `lookupClosingPrHealth`'s own
 * comment names.
 *
 * @param {number} issueNumber the row about to be claimed -- excluded from B2's "other held rows" check
 * @param {string} mySession
 * @param {{ run?: typeof defaultRun,
 *           requiredContexts?: () => (string[] | null),
 *           checkRuns?: (sha: string) => ({name: string, status: string, conclusion: string | null,
 *             completedAt: string | null}[] | null) }} deps
 * @returns {string | null}
 */
export function sessionEligibilityReason(issueNumber, mySession,
  { run = defaultRun, requiredContexts, checkRuns } = {}) {
  const ghRun = (/** @type {string[]} */ args) => run("gh", args);

  const ownPr = lookupOwnPrHealth(mySession, issueNumber, { run: ghRun, requiredContexts, checkRuns });
  const health = ownPrHealthReason(ownPr);
  if (health) return health;

  const myFiles = lookupMyRegionFiles(issueNumber, { run: ghRun });
  const otherPrFiles = lookupOpenPrFiles({ run: ghRun });
  if (myFiles !== null && otherPrFiles !== null) {
    const { reason, emptyOtherPrs } = fileOverlapReason(myFiles, otherPrFiles);
    for (const prNumber of emptyOtherPrs) {
      process.stderr.write(`row-claim: #${prNumber} is open and reports ZERO changed files -- not folded `
        + "into \"no overlap\", just nothing to compare against right now. Worth a look if that surprises "
        + "you (B4, #462).\n");
    }
    if (reason) return reason;
  }
  return null;
}

/**
 * @param {number} issueNumber
 * @param {string} mySession
 * @param {string[]} extraLabels labels written alongside `in-progress` + `session:<name>` -- `[]` for a
 *   dispatch, `[STARTED_LABEL]` for a claim/start
 * @param {{ run?: typeof defaultRun, moveStatus?: typeof moveProjectStatus, branch?: string,
 *           worktree?: string, requiredContexts?: () => (string[] | null),
 *           checkRuns?: (sha: string) => ({name: string, status: string, conclusion: string | null,
 *             completedAt: string | null}[] | null) }} deps
 * @returns {{ claimed: true, statusMoved: true } | { claimed: true, statusMoved: false, notOnBoard: boolean, statusReason: string } | { claimed: false, reason: string }}
 */
function writeRowLabels(issueNumber, mySession, extraLabels,
  { run = defaultRun, moveStatus = moveProjectStatus, branch, worktree, requiredContexts, checkRuns } = {}) {
  const before = fetchLabels(issueNumber, { run });
  const decision = decideClaim(before.labels, mySession);
  if (!decision.proceed) return { claimed: false, reason: decision.reason };

  // #707: THE TEMPLATE FIELDS, checked on EVERY claim attempt -- unlike the session-eligibility block
  // below, this is a property of the ROW, not of who is claiming it or when they last touched it, so it
  // is not skipped on a resumed (`alreadyMine`) claim: a row dispatched before this check shipped, or by
  // a hand-claim (#673) that bypassed row-claim entirely, must still be caught the first time row-claim
  // itself acts on it, which may well be a "resume".
  const ghRunForBody = (/** @type {string[]} */ args) => run("gh", args);
  const body = lookupIssueBody(issueNumber, { run: ghRunForBody });
  if (body !== null) {
    const templateReason = templateFieldsReason(body, issueNumber);
    if (templateReason) return { claimed: false, reason: templateReason };
  }

  // B2 (#476) + B4 (#462): SESSION ELIGIBILITY, not row ownership -- `decideClaim` above already answered
  // "is this row somebody else's"; these ask "should THIS session start ANY new row right now", which is
  // why they are skipped entirely when resuming a row this session already holds (the `dispatched -> started`
  // transition is not a NEW front, and re-running these lookups on every resume would be pure cost for a
  // question already answered the first time this row was claimed).
  const alreadyMine = claimStatus(before.labels).sessions.includes(mySession);
  if (!alreadyMine) {
    const ineligible = sessionEligibilityReason(issueNumber, mySession, { run, requiredContexts, checkRuns });
    if (ineligible) return { claimed: false, reason: ineligible };
  }

  const sessionLabel = `session:${mySession}`;
  // #656: THE BRANCH LABEL, when this claim names one -- optional, since not every row is code-changing
  // and a dispatch (no branch created yet) legitimately omits it. `branchLabel` is `[]` rather than
  // `undefined` so it composes into `labelsToAdd`/the back-off removal list below exactly like
  // `extraLabels` does, with no special-casing at either site.
  const branchLabel = branch ? [`${BRANCH_LABEL_PREFIX}${branch}`] : [];
  // #665: THE WORKTREE LABEL, identical shape one field over -- optional for the same reason `branch` is
  // (a dispatch has no worktree yet, a non-code row never gets one).
  const worktreeLabel = worktree ? [`${WORKTREE_LABEL_PREFIX}${worktree}`] : [];
  // #449: RECORD, IN THE SAME EDIT, THAT THIS ROW WAS `ready` BEFORE THE CLAIM -- `declineRow`'s only way
  // to know whether releasing this row should restore `ready`, since removing it below is the one place
  // that fact is ever seen. A resumed claim (dispatched -> started, `ready` already gone) computes false
  // here and adds nothing, harmlessly -- the marker this row's own earlier dispatch already wrote stays
  // exactly where it is.
  const wasReady = before.labels.includes(READY_LABEL);
  const labelsToAdd = [CLAIM_LABEL, sessionLabel, ...extraLabels, ...branchLabel, ...worktreeLabel,
    ...(wasReady ? [WAS_READY_LABEL] : [])];
  run("gh", ["issue", "edit", String(issueNumber), "--repo", REPO,
    ...labelsToAdd.flatMap((l) => ["--add-label", l]),
    "--remove-label", READY_LABEL]);

  const after = fetchLabels(issueNumber, { run });
  const afterStatus = claimStatus(after.labels);
  const otherSessions = afterStatus.sessions.filter((s) => s !== mySession);
  if (otherSessions.length > 0) {
    // LOST THE RACE, DETECTED AFTER THE FACT: back off rather than leave a contested claim standing.
    // Removing only OUR OWN session label (and any of our extras, including the branch/worktree labels
    // we just added), never `in-progress` (which the other session's claim needs) and never the other
    // session's label (not ours to touch).
    run("gh", ["issue", "edit", String(issueNumber), "--repo", REPO,
      ...[sessionLabel, ...extraLabels, ...branchLabel, ...worktreeLabel].flatMap((l) => ["--remove-label", l])]);
    return { claimed: false, reason: `lost a race to ${otherSessions.join(", ")} -- backed off` };
  }
  // #400: THE LABEL IS THE RECORD; THIS MOVES THE VIEW TO MATCH IT, IN THE SAME ACT. A view corrected only
  // by a later sweep is wrong between sweeps, and "between sweeps" is where a worker reads it -- measured
  // live, a row read `unlabeled ready / labeled in-progress` for the three minutes between a real claim and
  // the next audit pass. `moveStatus` never throws (see its own comment); a claim this session actually
  // holds must complete regardless of whether the Project view could be updated to match -- but a genuine,
  // unexpected Status-write failure (as opposed to the row simply not being on the board) is a HALF-APPLIED
  // claim, per ceo's ruling, and must be visible to the caller rather than folded into a plain success.
  const statusResult = moveStatus(issueNumber, "In progress", { run });
  if (statusResult.moved) return { claimed: true, statusMoved: true };
  return { claimed: true, statusMoved: false, notOnBoard: statusResult.notOnBoard, statusReason: statusResult.reason };
}

/**
 * Print whether the row can be STARTED today, alongside whether it is claimed (#177).
 *
 * A SEPARATE PROCESS on purpose. `row-reachability.mjs` walks every remote ref and shells `git` dozens of
 * times; importing it would make every `check` pay that even when the answer is not wanted, and a slow
 * claim tool is one people stop running before claiming -- which is the defect `row-claim` exists for.
 *
 * ITS FAILURE IS NOT THIS COMMAND'S FAILURE. If reachability cannot be computed, the claim answer above
 * is still correct and is what the caller asked for; swallowing the reachability error here keeps
 * "I could not tell you whether it is startable" from reading as "I could not tell you whether it is
 * claimed". The exit code is set before this runs and is never touched by it.
 *
 * RETURNS the verdict (#226), rather than only printing it, so the caller can log the exact same answer
 * it showed the worker -- `code: null` for the one case not even the subprocess's own exit code can name
 * (the spawn itself failing, e.g. `node` missing), kept distinct from `row-reachability.mjs`'s own real
 * `CANNOT_ASK` (2), which IS a code and is logged as one.
 *
 * @param {number} issueNumber
 * @returns {{ code: number | null, output: string }}
 */
/** @param {number} issueNumber */
function reportReachability(issueNumber) {
  try {
    // `fileURLToPath`, NOT `.pathname` -- a URL's pathname is percent-ENCODED, so a checkout under a
    // path containing a space becomes `%20` and node cannot find the file. This repo already records that
    // exact defect for entry-point guards built by string concatenation; it is the same trap read from
    // the other end.
    const out = execFileSync("node",
      [fileURLToPath(new URL("row-reachability.mjs", import.meta.url)), String(issueNumber)],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    process.stdout.write(out);
    return { code: 0, output: out };
  } catch (error) {
    const spawned = /** @type {{stdout?: string, stderr?: string, status?: number}} */ (error);
    const output = `${spawned.stdout ?? ""}${spawned.stderr ?? ""}`;
    process.stdout.write(output);
    return { code: typeof spawned.status === "number" ? spawned.status : null, output };
  }
}

/**
 * DISPATCH: mark a row taken the moment it is handed to a session, before that session has done anything.
 * This is the fix for #176 -- called by `dispatcher`/`product-manager` in the same action as assigning a
 * row in a message, so a second dispatch in the same window sees this one on the board rather than
 * reading unclaimed. Writes `in-progress` + `session:<name>` only; `started` is NOT set, which is what
 * makes `check`/`status` able to report "dispatched but not started" rather than collapsing it into
 * "started".
 *
 * @param {number} issueNumber
 * @param {string} mySession
 * @param {{ run?: typeof defaultRun, moveStatus?: typeof moveProjectStatus,
 *           requiredContexts?: () => (string[] | null),
 *           checkRuns?: (sha: string) => ({name: string, status: string, conclusion: string | null,
 *             completedAt: string | null}[] | null) }} [deps]
 * @returns {{ claimed: true, statusMoved: true } | { claimed: true, statusMoved: false, notOnBoard: boolean, statusReason: string } | { claimed: false, reason: string }}
 */
export function dispatchRow(issueNumber, mySession, deps = {}) {
  return writeRowLabels(issueNumber, mySession, [], deps);
}

/**
 * CLAIM / START: mark a row as actually being worked. Used two ways -- a worker self-pulling a row with
 * no prior dispatch goes straight from unclaimed to started; a worker beginning a row `dispatchRow`
 * already marked for it goes from dispatched to started, re-adding the same `in-progress`/`session:*`
 * labels harmlessly and adding `started`.
 *
 * `branch` (#656) and `worktree` (#665) are OPTIONAL, deliberately -- not every claimed row changes code
 * (a doc row, a filing task) and neither may exist at the moment `started` is written even for one that
 * does. Passed once here, at the point a worker actually knows its own worktree's path and branch name.
 *
 * @param {number} issueNumber
 * @param {string} mySession
 * @param {{ run?: typeof defaultRun, moveStatus?: typeof moveProjectStatus, branch?: string,
 *           worktree?: string, requiredContexts?: () => (string[] | null),
 *           checkRuns?: (sha: string) => ({name: string, status: string, conclusion: string | null,
 *             completedAt: string | null}[] | null) }} [deps]
 * @returns {{ claimed: true, statusMoved: true } | { claimed: true, statusMoved: false, notOnBoard: boolean, statusReason: string } | { claimed: false, reason: string }}
 */
export function claimRow(issueNumber, mySession, deps = {}) {
  return writeRowLabels(issueNumber, mySession, [STARTED_LABEL], deps);
}

/**
 * #665: Is `worktreePath` clean (no uncommitted changes)? `{ clean: false }` names every dirty path --
 * the issue's own stated acceptance: "A dirty worktree is refused by name, listing the files." A path
 * that no longer exists (already removed by hand, or never created) reads as CLEAN: nothing there can be
 * lost, and refusing to release a claim over a directory that is already gone would be the housekeeping
 * failure this row exists to fix, one layer over.
 * @param {string} worktreePath
 * @param {{ run?: typeof defaultRun }} [deps]
 * @returns {{ clean: true } | { clean: false, files: string[] }}
 */
export function worktreeStatus(worktreePath, { run = defaultRun } = {}) {
  if (!existsSync(worktreePath)) return { clean: true };
  const out = run("git", ["-C", worktreePath, "status", "--porcelain"]);
  const files = out.split("\n").filter(Boolean);
  return files.length === 0 ? { clean: true } : { clean: false, files };
}

/**
 * #665: Removes `worktreePath` via `git worktree remove` -- REFUSING on a dirty tree, by name, never
 * `--force`. A dirty worktree is exactly the state this function exists to protect; forcing past it would
 * be the destructive shortcut CLAUDE.md already warns against for `git checkout --` one door over. A path
 * that no longer exists is treated as already-removed success, not a failure to report.
 * @param {string} worktreePath
 * @param {{ run?: typeof defaultRun }} [deps]
 * @returns {{ removed: true } | { removed: false, reason: string, files?: string[] }}
 */
export function removeClaimedWorktree(worktreePath, { run = defaultRun } = {}) {
  if (!existsSync(worktreePath)) return { removed: true };
  const status = worktreeStatus(worktreePath, { run });
  if (!status.clean) {
    return { removed: false,
      reason: `${worktreePath} has uncommitted change(s) -- refusing to remove it: ${status.files.join(", ")}`,
      files: status.files };
  }
  try {
    run("git", ["worktree", "remove", worktreePath]);
    return { removed: true };
  } catch (error) {
    return { removed: false,
      reason: `git worktree remove failed -- ${/** @type {Error} */ (error).message}` };
  }
}

/**
 * Pure: every label a decline removes -- pulled out of `declineRow` to keep that function's own
 * complexity below the lint gate, and because "what comes off a decline" is a fact worth naming on its
 * own. #656/#665: the branch and worktree labels come off too -- a released row is no longer this
 * session's, and a stale `branch:*`/`worktree:*` naming an object nobody here is working any more is
 * worse than none: it would tell a future escalation "held" for a row that is actually free.
 * @param {{ branch: string | null, worktree: string | null }} status
 * @param {string} mySession
 * @param {boolean} wasReady
 * @returns {string[]}
 */
function declineRemoveLabels(status, mySession, wasReady) {
  return [CLAIM_LABEL, `session:${mySession}`, STARTED_LABEL,
    ...(status.branch ? [`${BRANCH_LABEL_PREFIX}${status.branch}`] : []),
    ...(status.worktree ? [`${WORKTREE_LABEL_PREFIX}${status.worktree}`] : []),
    ...(wasReady ? [WAS_READY_LABEL] : [])];
}

/**
 * Pure: what a decline's label EDIT should add, and whether that amounts to a `ready` restore -- pulled
 * out of `declineRow` to keep its own complexity below the lint gate, same reason `declineRemoveLabels`
 * was. `isClosed` wins over every other reason to add a label (#752): a closed row has no lane to go back
 * to, so neither `wasReady` nor `blockedReason` may add anything once it is true.
 * @param {{ isClosed: boolean, wasReady: boolean, blockedReason: string | undefined }} facts
 * @returns {{ restoreReady: boolean, addLabels: string[] }}
 */
function declineAddLabels({ isClosed, wasReady, blockedReason }) {
  if (isClosed) return { restoreReady: false, addLabels: [] };
  const restoreReady = wasReady && !blockedReason;
  return { restoreReady, addLabels: blockedReason ? [BLOCKED_LABEL] : restoreReady ? [READY_LABEL] : [] };
}

/**
 * Pure: may `mySession` decline this row at all, given its labels? Pulled out of `declineRow` to keep
 * that function's own complexity below the lint gate -- the three ownership checks it always ran, now
 * named as the single question they jointly answer.
 * @param {{ claimed: boolean, sessions: string[] }} status
 * @param {string} mySession
 * @returns {string | null} a refusal reason, or `null` to proceed
 */
function declineOwnershipReason(status, mySession) {
  if (!status.claimed) return "row is not claimed -- nothing to decline";
  if (status.sessions.length > 1) {
    return `row carries multiple session labels (${status.sessions.join(", ")}) -- an unresolved race, `
      + "not a single decline; resolve it by hand";
  }
  if (!status.sessions.includes(mySession)) {
    const by = status.sessions.length > 0 ? status.sessions.join(", ") : "someone (no session label recorded yet)";
    return `row is held by ${by}, not ${mySession} -- refusing to release a claim that is not this session's`;
  }
  return null;
}

/**
 * DECLINE: give a row back. The second acceptance case for #176 -- a row dispatched (or claimed) and then
 * declined must return to genuinely unclaimed and say so, not sit `in-progress` forever with nobody
 * obligated to un-label it. Also the general "release" this tool always lacked: #186 needed exactly this
 * when `worker-audit` claimed a row, found it unstartable, and had to be un-labelled by hand.
 *
 * Refuses to release a row this session does not hold -- decline is a session giving BACK its own claim,
 * never a way to clear someone else's. A row with more than one session label (a race not yet resolved
 * one way or the other) is also refused rather than guessed at, because removing all of them would take
 * back a claim that may be the OTHER session's legitimate one.
 *
 * #449: RESTORES THE LABEL THE ROW CARRIED BEFORE THE CLAIM, NOT ALWAYS `ready`. Measured live on #171:
 * a row claimed then correctly declined came out `[backlog]` -- not held, not `ready`, invisible to the
 * Ready queue, because the old code only ever stripped the claim labels and never asked what was true
 * before them. `WAS_READY_LABEL` (written by `writeRowLabels`, in the same edit that removed `ready`) is
 * the only place that fact survives, so this reads it rather than assuming.
 *
 * THE ASYMMETRY: a decline is not always a return to `ready`. `blockedReason`, when given, means the
 * decline is itself a finding -- the row is blocked, not merely released -- and must NOT read as ready
 * again just because it was before. It adds `BLOCKED_LABEL` instead, and records the reason as an issue
 * comment (never a label -- a label carries no free text) so the finding survives for whoever picks the
 * row up next. Either way the marker is removed in the same edit: its job -- carrying the fact from claim
 * to decline -- is done the moment this function reads it.
 *
 * #665: REMOVES THE RECORDED WORKTREE FIRST, before touching any label. A dirty worktree refuses the
 * WHOLE decline, not merely the removal -- otherwise the claim record disappears while the directory (and
 * whatever uncommitted work sits in it) silently survives, untracked by anything that could tell a future
 * session it still needs attention. Safe specifically because DECLINING is releasing YOUR OWN claim: the
 * releasing session is, by construction, the one that owns the worktree being removed.
 *
 * #752: A CLOSED ROW HAS NO LANE TO GO BACK TO. Measured live: `decline`d #721 restored `ready` because
 * it carried `WAS_READY_LABEL`, and #721 was already closed -- the row that was "genuinely unclaimed,
 * pickable" one edit ago is now "done", and a closed row cannot be both. `ready-label-audit.mjs`'s own
 * `isClosedDebrisLabel` already names `ready`/`in-progress`/`session:*` as debris ON a closed row; this
 * is that same fact enforced at the ONE place that was still writing `ready` onto one. `isClosed` wins
 * over EVERY other reason to add a label -- `wasReady` and `blockedReason` both describe what the row
 * needs going forward, and a closed row has no "forward". Labels only come OFF; nothing goes back on, and
 * no Project Status move is attempted (there is no board lane for done work to return to).
 *
 * @param {number} issueNumber
 * @param {string} mySession
 * @param {{ run?: typeof defaultRun, moveStatus?: typeof moveProjectStatus, blockedReason?: string,
 *           removeWorktree?: typeof removeClaimedWorktree }} [deps]
 * @returns {{ declined: true, restoredReady: boolean, blocked: boolean, closed: boolean, statusMoved: true }
 *   | { declined: true, restoredReady: true, blocked: false, closed: false, statusMoved: false,
 *       notOnBoard: boolean, statusReason: string }
 *   | { declined: false, reason: string }}
 */
export function declineRow(issueNumber, mySession,
  { run = defaultRun, moveStatus = moveProjectStatus, blockedReason, removeWorktree = removeClaimedWorktree } = {}) {
  const before = fetchLabels(issueNumber, { run });
  const status = claimStatus(before.labels);
  const ownershipReason = declineOwnershipReason(status, mySession);
  if (ownershipReason) return { declined: false, reason: ownershipReason };
  // #665: THE WORKTREE COMES OFF FIRST, before any label is touched -- a dirty one refuses the WHOLE
  // decline (see this function's own header for why), so the claim record stays intact until an operator
  // has dealt with the uncommitted work by hand.
  if (status.worktree) {
    const removal = removeWorktree(status.worktree, { run });
    if (!removal.removed) return { declined: false, reason: removal.reason };
  }

  const isClosed = before.state === "CLOSED";
  const wasReady = before.labels.includes(WAS_READY_LABEL);
  const { restoreReady, addLabels } = declineAddLabels({ isClosed, wasReady, blockedReason });
  const removeLabels = declineRemoveLabels(status, mySession, wasReady);
  run("gh", ["issue", "edit", String(issueNumber), "--repo", REPO,
    ...removeLabels.flatMap((l) => ["--remove-label", l]),
    ...addLabels.flatMap((l) => ["--add-label", l])]);

  if (blockedReason && !isClosed) {
    // A LABEL CARRIES NO FREE TEXT -- the reason has to live somewhere a future reader can see it, and an
    // issue comment is where every other "record why" in this codebase already puts one
    // (board-report.mjs, npm-token-liveness.mjs).
    run("gh", ["issue", "comment", String(issueNumber), "--repo", REPO, "--body",
      `Declined by \`${mySession}\` and marked \`blocked\`: ${blockedReason}`]);
  }

  if (isClosed) {
    // NO STATUS MOVE -- a closed row is off the board's lanes entirely, and `statusMoved: true` here
    // means the identical "nothing needed moving" reading the other no-restore branch already uses.
    return { declined: true, restoredReady: false, blocked: false, closed: true, statusMoved: true };
  }
  if (!restoreReady) {
    // Neither a genuine restore (nothing to move to "Ready" for) nor a verified "Blocked" Status option
    // exists to move to instead -- labels only, per this row's own stated Region. `statusMoved: true` here
    // means "nothing needed moving", not "something moved"; it reads as a clean decline either way.
    return { declined: true, restoredReady: false, blocked: Boolean(blockedReason), closed: false, statusMoved: true };
  }
  // #400: THE MATCHING MOVE ON RELEASE. "Genuinely unclaimed" and "Ready" are the same state in this
  // tracker's own model (`ready-label-audit.mjs`'s definition: a row cannot be both "unclaimed, pickable"
  // and "claimed"), so a decline moves the view back the same way a claim moved it forward. Never throws;
  // see `moveProjectStatus`'s own comment for why an unexpected failure here is surfaced distinctly rather
  // than folded into a plain `declined: true`.
  const statusResult = moveStatus(issueNumber, "Ready", { run });
  if (statusResult.moved) {
    return { declined: true, restoredReady: true, blocked: false, closed: false, statusMoved: true };
  }
  return { declined: true, restoredReady: true, blocked: false, closed: false, statusMoved: false,
    notOnBoard: statusResult.notOnBoard, statusReason: statusResult.reason };
}

/** @returns {string} the check/conflict log's path -- shared across every worktree, per `gitCommonDir`. */
export function checkLogPath() {
  return `${gitCommonDir()}/row-claim-check-log.jsonl`;
}

/**
 * Appends ONE `check` verdict -- called on EVERY `check`/`--row=` invocation, whatever it found. This is
 * the log's DENOMINATOR (#226): without an entry for every ask, a reader can never tell "the tool has been
 * asked N times and wrong M of them" from "the tool has only ever been asked when someone suspected it".
 *
 * @param {string} logPath
 * @param {{ issueNumber: number, claimed: boolean, started: boolean, sessions: string[],
 *           reachability: { code: number | null, output: string } | null }} entry
 */
export function recordCheck(logPath, entry) {
  appendJsonl(logPath, { kind: "check", at: new Date().toISOString(), ...entry });
}

/**
 * Appends ONE `conflict` -- a worker's own finding, paired with the tool's most recently recorded verdict
 * for the SAME issue. This is the log's NUMERATOR. `recordedVerdict` is whatever `latestCheckFor` returned
 * -- `null` when nobody ever ran `check` on this issue first, which is itself worth keeping rather than
 * inventing a verdict that was never given.
 *
 * @param {string} logPath
 * @param {{ issueNumber: number, recordedVerdict: object | null, found: string }} entry
 */
export function recordConflict(logPath, entry) {
  appendJsonl(logPath, { kind: "conflict", at: new Date().toISOString(), ...entry });
}

/**
 * The most recently recorded `check` entry for an issue, or `null` if `check` was never run against it --
 * mirrors `merge-guard.mjs`'s `latestVerdictFor` exactly, one field renamed.
 *
 * @param {string} logPath
 * @param {number} issueNumber
 * @returns {Record<string, any> | null}
 */
export function latestCheckFor(logPath, issueNumber) {
  /** @type {string} */
  let text;
  try {
    text = readFileSync(logPath, "utf8");
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === "ENOENT") return null;
    throw error;
  }
  const entries = text.split("\n").filter(Boolean).map((line) => JSON.parse(line))
    .filter((entry) => entry.kind === "check" && entry.issueNumber === issueNumber);
  return entries.length > 0 ? entries[entries.length - 1] : null;
}

/**
 * Records the `check` verdict without letting a LOGGING failure read as a CLAIM-DETERMINATION failure --
 * the same distinction `reportReachability`'s own doc draws for reachability. A full disk should not turn
 * a correctly-answered `check` into `COULD NOT DETERMINE`.
 *
 * @param {{ issueNumber: number, claimed: boolean, started: boolean, sessions: string[],
 *           reachability: { code: number | null, output: string } | null }} entry
 */
function recordCheckSafely(entry) {
  try {
    recordCheck(checkLogPath(), entry);
  } catch (error) {
    process.stderr.write(`row-claim: could not record this check to the log -- the answer above is still `
      + `correct. ${/** @type {Error} */ (error).message}\n`);
  }
}

function usage() {
  return "Usage:\n"
    + "  node scripts/row-claim.mjs --row=<issue-number>                       (status: three states)\n"
    + "  node scripts/row-claim.mjs check <issue-number>                       (alias of --row=)\n"
    + "  node scripts/row-claim.mjs dispatch <issue-number> --session=<name>   (mark taken at dispatch)\n"
    + "  node scripts/row-claim.mjs claim <issue-number> --session=<name> [--branch=<name>] "
    + "[--worktree=<path>]  (mark started; #656/#665: records the branch and worktree, so a future "
    + "escalation can tell portable from held, and decline can remove the worktree safely)\n"
    + "  node scripts/row-claim.mjs decline <issue-number> --session=<name>    (give it back; #665: also "
    + "removes the recorded worktree, refusing by name if it is dirty)\n"
    + "  node scripts/row-claim.mjs conflict <issue-number> --found=<text>     (#226: reality differed)\n";
}

/**
 * Renders the three-state read `claimStatus` makes possible, shared by `--row=` and `check`. A boolean
 * "claimed" cannot express the state #176 is about -- see the file header.
 *
 * UNCLAIMED IS NOT THE SAME AS STARTABLE (#177), and the labels cannot tell you which. Three rows on
 * 2026-09-07 were `ready`, not `fleet-gated`, correctly classified, and unstartable: one held by an
 * unmerged branch, one whose step 1 could not reproduce on `main`, and one whose SUBJECT existed on a
 * single open PR and nowhere else. A worker should learn that here rather than at step 1, which is where
 * the evening goes -- so an unclaimed row also gets `reportReachability`'s answer, REPORTED, NEVER
 * ENFORCED: the exit code below is untouched, because the inference is coarse (the blocking PR may land
 * in ten minutes, or the worker may mean to build on that branch) and a check that refuses a claim on it
 * would be bypassed and then not consulted at all.
 *
 * @param {number} issueNumber
 * @param {string} title
 * @param {{ claimed: boolean, started: boolean, sessions: string[], branch: string | null, worktree: string | null }} status
 */
function renderStatus(issueNumber, title, status) {
  if (!status.claimed) {
    process.stdout.write(`UNCLAIMED -- #${issueNumber} "${title}"\n`);
    process.exitCode = 0;
    const reachability = reportReachability(issueNumber);
    recordCheckSafely({ issueNumber, claimed: false, started: false, sessions: [], reachability });
    return;
  }
  const by = status.sessions.length > 0 ? status.sessions.join(", ") : "someone (no session label yet)";
  const state = status.started ? "STARTED" : "DISPATCHED (not started)";
  // #656: THE RECORDED BRANCH, so a session weighing whether to escalate can tell a portable claim (no
  // branch recorded, or none checked out here) from a held one BEFORE it ever tries `git worktree add`
  // on the branch name -- exactly the check the dispatcher's own #614 attempt had no way to make first.
  const branchSuffix = status.branch ? `, branch ${status.branch}` : "";
  // #665: THE RECORDED WORKTREE, for the identical reason -- and so a session reading a stale-looking
  // claim can see, from the board alone, whether a local directory is what is actually holding it open.
  const worktreeSuffix = status.worktree ? `, worktree ${status.worktree}` : "";
  process.stdout.write(`${state} by ${by}${branchSuffix}${worktreeSuffix} -- #${issueNumber} "${title}"\n`);
  process.exitCode = 1;
  recordCheckSafely({ issueNumber, claimed: true, started: status.started, sessions: status.sessions,
    reachability: null });
}

/** @param {number} issueNumber */
function runStatus(issueNumber) {
  try {
    const { labels, title } = fetchLabels(issueNumber);
    renderStatus(issueNumber, title, claimStatus(labels));
  } catch (error) {
    process.stderr.write(`COULD NOT DETERMINE: ${/** @type {Error} */ (error).message}\n`);
    process.exitCode = 2;
  }
}

/**
 * Pure: the one-line summary of a successful dispatch/claim -- pulled out of `runDispatchOrClaim` to keep
 * that function's own complexity below the lint gate. `record` bundles `branch`/`worktree` rather than
 * two more positional parameters, per this repo's own "no boolean-flag-shaped argument lists" convention.
 * @param {"dispatch" | "claim"} mode
 * @param {number} issueNumber
 * @param {string} mySession
 * @param {{ branch?: string, worktree?: string }} record
 * @returns {string}
 */
function claimLineFor(mode, issueNumber, mySession, { branch, worktree }) {
  const label = mode === "dispatch" ? "DISPATCHED" : "STARTED";
  const startedSuffix = mode === "claim" ? ` / ${STARTED_LABEL}` : "";
  const branchSuffix = mode === "claim" && branch ? ` / ${BRANCH_LABEL_PREFIX}${branch}` : "";
  const worktreeSuffix = mode === "claim" && worktree ? ` / ${WORKTREE_LABEL_PREFIX}${worktree}` : "";
  return `${label} -- #${issueNumber} is now ${CLAIM_LABEL} / session:${mySession}`
    + `${startedSuffix}${branchSuffix}${worktreeSuffix}`;
}

/**
 * @param {"dispatch" | "claim"} mode
 * @param {number} issueNumber
 * @param {string[]} rest
 */
function runDispatchOrClaim(mode, issueNumber, rest) {
  const sessionFlag = rest.find((a) => a.startsWith("--session="));
  const mySession = sessionFlag?.slice("--session=".length);
  if (!mySession) {
    process.stderr.write(`row-claim ${mode}: --session=<name> is required\n${usage()}`);
    process.exitCode = 2;
    return;
  }
  // #656/#665: `--branch=`/`--worktree=` ONLY MEAN ANYTHING FOR `claim` -- a dispatch precedes either
  // existing, so `dispatchRow` never reads them (it does not accept those deps at all); silently ignoring
  // them on `dispatch` rather than refusing here matches `wasReady`'s own "unused declaration is a
  // warning, never a hard error" tolerance elsewhere in this file, not a new inconsistency.
  const branchFlag = rest.find((a) => a.startsWith("--branch="));
  const branch = branchFlag?.slice("--branch=".length);
  const worktreeFlag = rest.find((a) => a.startsWith("--worktree="));
  const worktree = worktreeFlag?.slice("--worktree=".length);
  try {
    const result = mode === "dispatch" ? dispatchRow(issueNumber, mySession)
      : claimRow(issueNumber, mySession, { branch, worktree });
    if (result.claimed) {
      const claimLine = claimLineFor(mode, issueNumber, mySession, { branch, worktree });
      if (result.statusMoved) {
        process.stdout.write(`${claimLine}\n`);
        process.exitCode = 0;
      } else if (result.notOnBoard) {
        // #400's own acceptance case: a row with no Project item at all is a known, permitted gap, not a
        // failure -- the claim (the record) stands and this exits clean.
        process.stdout.write(`${claimLine} (not on the Project board -- Status view not applicable)\n`);
        process.exitCode = 0;
      } else {
        // ceo's ruling: a half-applied claim -- the label (the record) is written, but the board Status
        // write genuinely failed -- must never look like the plain success above. Exit code 3, distinct
        // from 0 (clean), 1 (not claimed) and 2 (could not determine at all).
        process.stdout.write(`${claimLine}, BUT the Project Status could not be moved to match: `
          + `${result.statusReason}\n`);
        process.exitCode = 3;
      }
    } else {
      process.stdout.write(`NOT CLAIMED: ${result.reason}\n`);
      process.exitCode = 1;
    }
  } catch (error) {
    process.stderr.write(`COULD NOT DETERMINE: ${/** @type {Error} */ (error).message}\n`);
    process.exitCode = 2;
  }
}

/**
 * @param {number} issueNumber
 * @param {string[]} rest
 */
function runDecline(issueNumber, rest) {
  const sessionFlag = rest.find((a) => a.startsWith("--session="));
  const mySession = sessionFlag?.slice("--session=".length);
  if (!mySession) {
    process.stderr.write(`row-claim decline: --session=<name> is required\n${usage()}`);
    process.exitCode = 2;
    return;
  }
  const blockedFlag = rest.find((a) => a.startsWith("--blocked="));
  const blockedReason = blockedFlag?.slice("--blocked=".length);
  if (blockedFlag && !blockedReason) {
    process.stderr.write(`row-claim decline: --blocked=<reason> needs a reason, not an empty string\n`);
    process.exitCode = 2;
    return;
  }
  try {
    const result = declineRow(issueNumber, mySession, { blockedReason });
    if (result.declined) {
      // #449/#752: WHAT CAME BACK, NOT JUST THAT SOMETHING DID -- the four shapes read differently to a
      // human deciding what happens next: restored (pickable again), blocked (a finding, do not repick
      // yet), closed (done -- "restored to ready" would be false on its face), or neither (was never
      // `ready`, unclaimed and no more startable than that already implies).
      const outcome = result.closed ? "; the row is CLOSED, so it is NOT returned to `ready`"
        : result.blocked ? "and marked `blocked`"
        : result.restoredReady ? "and restored to `ready`"
        : "(was not `ready` before the claim -- not restored)";
      if (result.statusMoved) {
        process.stdout.write(`DECLINED -- #${issueNumber} is unclaimed again ${outcome}\n`);
        process.exitCode = 0;
      } else if (result.notOnBoard) {
        process.stdout.write(`DECLINED -- #${issueNumber} is unclaimed again ${outcome} (not on the Project `
          + `board -- Status view not applicable)\n`);
        process.exitCode = 0;
      } else {
        process.stdout.write(`DECLINED -- #${issueNumber} is unclaimed again ${outcome}, BUT the Project `
          + `Status could not be moved to match: ${result.statusReason}\n`);
        process.exitCode = 3;
      }
    } else {
      process.stdout.write(`NOT DECLINED: ${result.reason}\n`);
      process.exitCode = 1;
    }
  } catch (error) {
    process.stderr.write(`COULD NOT DETERMINE: ${/** @type {Error} */ (error).message}\n`);
    process.exitCode = 2;
  }
}

/**
 * A worker recording that reality differed from `check`'s own last-recorded verdict for this issue (#226)
 * -- CLOSED when it read startable, already built, a held region that turned out to matter, or the
 * inverse. Pairs the tool's verbatim answer with what was actually found, the same way `merge-guard`'s
 * `reconcile` pairs a recorded verdict with the real PR outcome -- except here nothing can look the real
 * outcome up automatically, so the worker who found it IS the reconciliation.
 *
 * @param {number} issueNumber
 * @param {string[]} rest
 */
function runConflict(issueNumber, rest) {
  const foundFlag = rest.find((a) => a.startsWith("--found="));
  const found = foundFlag?.slice("--found=".length);
  if (!found) {
    process.stderr.write(`row-claim conflict: --found=<what you found instead> is required\n${usage()}`);
    process.exitCode = 2;
    return;
  }
  try {
    const recordedVerdict = latestCheckFor(checkLogPath(), issueNumber);
    recordConflict(checkLogPath(), { issueNumber, recordedVerdict, found });
    const against = recordedVerdict
      ? `against the check recorded at ${recordedVerdict.at}`
      : "-- no prior `check` was ever recorded for this issue, so there is nothing to pair it against, "
        + "and that absence is itself recorded";
    process.stdout.write(`RECORDED -- #${issueNumber} conflict logged ${against}\n`);
    process.exitCode = 0;
  } catch (error) {
    process.stderr.write(`COULD NOT RECORD: ${/** @type {Error} */ (error).message}\n`);
    process.exitCode = 2;
  }
}

async function main() {
  // THE PULL LOOP RESTS ON THIS COMMAND, so a flag it silently discards is the worst place for one.
  // Measured 2026-09-07 before this guard: `row-claim.mjs check 161 --jsonn` printed the ordinary claim
  // line and exited 0, and so did `--format=json`. Both look like a machine-readable request that was
  // honoured.
  //
  // `--row=` IS DECLARED ALONGSIDE `--session` because #197 added it while this branch was open: it is
  // the bare status-read shape below, and a guard listing only `--session` would refuse the command's
  // own documented invocation. A flag guard that has not been merged forward is a guard that breaks the
  // thing it protects.
  refuseUnknownFlags(["--session", "--row=", "--found=", "--blocked=", "--branch=", "--worktree="],
    { entry: import.meta.url, command: "node scripts/row-claim.mjs" });
  const argv = process.argv.slice(2);
  const rowFlag = argv.find((a) => a.startsWith("--row="));

  // Bare `--row=<n>` (the acceptance's own invocation shape) is a status read with no mode word.
  if (rowFlag && argv[0] === rowFlag) {
    const issueNumber = Number(rowFlag.slice("--row=".length));
    if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
      process.stderr.write(usage());
      process.exitCode = 2;
      return;
    }
    runStatus(issueNumber);
    return;
  }

  const [mode, issueArg, ...rest] = argv;
  const issueNumber = Number(issueArg);
  if (!mode || !Number.isInteger(issueNumber) || issueNumber <= 0) {
    process.stderr.write(usage());
    process.exitCode = 2;
    return;
  }

  if (mode === "check") {
    runStatus(issueNumber);
    return;
  }
  if (mode === "dispatch" || mode === "claim") {
    runDispatchOrClaim(mode, issueNumber, rest);
    return;
  }
  if (mode === "decline") {
    runDecline(issueNumber, rest);
    return;
  }
  if (mode === "conflict") {
    runConflict(issueNumber, rest);
    return;
  }

  process.stderr.write(usage());
  process.exitCode = 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) {
  main();
}
