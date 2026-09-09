#!/usr/bin/env node
// @ts-check
// command: audit the tracker's ready label for contradictions, debris, and rows absent from the board
// `ready` MUST BE MUTUALLY EXCLUSIVE WITH EVERY LABEL THAT ALREADY MEANS "NOT ACTUALLY PICKABLE".
//
// Tonight (2026-09-06) `dispatcher` labelled #13 and #75 `ready` to hit a floor `ceo` had asked for, while
// #13's own comment thread said "DISPUTED, and not Ready until it is ruled on" and #75 carried no Region
// or Acceptance a worker could run. Both labels were removed once caught -- "a floor met by a label I
// control is not a measurement". `ready`/`fleet-gated` was already ruled mutually exclusive the same
// night, for the identical reason: a row with a completable offline half should be SPLIT, never
// double-labelled. This generalises that rule to every label that already carries the same meaning, and
// makes it a command rather than a memory.
//
// `disputed`, `decision`, `awaiting-merge` and `blocked` each already say, in their own GitHub label
// description, that the row is not currently pickable. `review-only` is new -- for #27's shape, a row
// filed to solicit review or a decision and never meant to be started as work, which had no label at all
// until now and was dispatched twice for lack of one.
//
// #378: THIS AUDIT ITSELF WAS THE FOURTH INSTANCE, IN ONE DAY, OF A CHECK THAT CANNOT SEE THE CASE IT
// EXISTS FOR. It reads `--state open`, and its own docstring says "which OPEN issues carry `ready`..." --
// so 119 CLOSED rows still carrying `ready`, `in-progress` or a `session:*` label (spotted when three of
// worker-audit's own completed rows kept reading "still Ready" after merge) sat entirely outside its
// population. Two of the 119 (#291, #292) carry `ready` while closed, so any Ready count taken by label
// rather than by state was silently wrong by two.
//
// A CLOSED row and an OPEN row need DIFFERENT verdicts, reported as separate populations, never collapsed:
// on an open row `ready` beside `blocked` is a CONTRADICTION to resolve; on a closed row it is DEBRIS --
// nobody is going to pick it up, and reporting it as a contradiction would bury real ones under 119 pieces
// of noise. The mutex check on open rows (#246) is UNCHANGED by this -- `fetchOpenIssues` still reads
// `--state open` and `mutexViolations` still means exactly what it meant before. `fetchAllIssues` and
// `closedDebris` below are additive, reading `--state all` for the population the mutex check cannot see.
//
// This audit REPORTS the debris; it does not strip it. The tracker's labels are `product-manager`'s, and
// `ceo` has ruled that a bulk label mutation is their deliberate act, not a side effect of a script change.
//
//   npm run ready:audit           print every violation and exit 1, or exit 0 with the count
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";
// RELATIVE, NOT the `@a11ign/worker-fleet/cli-flags` package specifier: that export map
// points at `dist/`, so it needs both `node_modules` AND a completed build. This file is reachable
// from a pre-install entry (see `pre-install-import-graph.test.ts`, which derives that population
// rather than naming it), and there it dies on startup with ERR_MODULE_NOT_FOUND.
import { refuseUnknownFlags } from "../packages/worker-fleet/src/cli-flags.mjs";
import { REPO } from "./repo-identity.mjs";
import { fetchBoardItems, PROJECT_NUMBER } from "./board-snapshot.mjs";
import { fetchClosedRowEvents, claimsFromEvents, describeClaims, unattributableClosedRows,
  PROVENANCE_REQUIRED_FROM } from "./claim-provenance.mjs";
import { sandboxGitEnv } from "./git-env.mjs";
import { READY_LABEL, WAS_READY_LABEL } from "./claim-labels.mjs";
// #782: THE PURE DECISION ONLY -- `labelsToStrip` classifies a label, it never calls `gh`. Importing it
// does NOT give this file a mutation capability; the header above's ruling ("this audit REPORTS the
// debris; it does not strip it... a bulk label mutation is product-manager's deliberate act") is
// untouched. Safe from a cycle (#804): `close-rows-for-merged-pr.mjs` imports its own label constants
// from the leaf `claim-labels.mjs`, never from this file, so this file importing FROM it forms no loop.
import { labelsToStrip } from "./close-rows-for-merged-pr.mjs";

// #804: READY_LABEL/WAS_READY_LABEL are IMPORTED (above) from the leaf claim-labels.mjs and re-exported
// here, not declared in this file -- see claim-labels.mjs's own header for why. Every existing
// `import { READY_LABEL } from "./ready-label-audit.mjs"` call site is unchanged. A bare `export {...}
// from` would forward the binding WITHOUT creating a local one, and this file's own code below needs the
// local name -- hence import-then-export as two separate statements rather than one re-export line.
export { READY_LABEL, WAS_READY_LABEL };

/**
 * Every label that already means "not actually pickable", independent of `ready`.
 *
 * `in-progress` USED TO belong here (#246), and #673 split it out into its own check
 * (`handClaims`/`reportHandClaims`, below). `row-claim.mjs`'s `writeRowLabels` removes `READY_LABEL` in
 * the SAME `gh issue edit` call that adds `in-progress`/`session:*` -- always, atomically -- so a row
 * genuinely claimed through `row-claim.mjs` can never be observed carrying both. `ready` + `in-progress`
 * together is therefore not a generic contradiction the way `ready` + `blocked` is: it is PROOF the claim
 * was made through some other route (`gh issue edit --add-label` by hand, or a direct assignment), never
 * through the mechanism itself. Measured 2026-09-09: #634, #635 and #633 all sat in exactly this state,
 * claimed by hand within hours of being filed, and stayed advertised as pickable until an audit run by
 * hand caught them. Reporting that as "remove one or the other" -- this list's generic remedy -- names
 * the symptom; naming it as a hand claim names the cause AND the remedy in the same sentence (#655's
 * rule), so it gets a dedicated check instead of a place in this generic list.
 *
 * `runner:*` DELIBERATELY DOES NOT JOIN THIS LIST (#444). A row reserved for a specific session
 * (`ready` + `runner:worker-audit`) is still genuinely pickable -- BY ITS RUNNER -- so it is not a
 * contradiction the way `ready` + `blocked` is. Adding `runner:` here would make every reserved row read
 * as a violation nobody can resolve, since the "fix" `mutexViolations` implies (remove one of the two
 * labels) is wrong for a reservation that is working exactly as designed. See `isClosedDebrisLabel`
 * below for the state `runner:` genuinely DOES belong to: a reservation nobody is left to honour, once
 * the row is closed.
 */
export const MUTEX_LABELS =
  ["fleet-gated", "disputed", "decision", "awaiting-merge", "blocked", "review-only"];

/**
 * @typedef {{ number: number, title: string, labels: string[] }} LabelledIssue
 */

/** @type {(cmd: string, args: string[]) => string} */
const defaultRun = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8", env: sandboxGitEnv() });

/**
 * Reads every OPEN issue's labels from the real board. Same discipline as `row-claim.mjs`'s `fetchLabels`:
 * `gh` failing, or answering with a shape this function does not recognise, THROWS -- it never falls
 * through to an empty issue list, which would report "audited: 0 violations" having examined nothing. A
 * clean sweep and a broken query must never print the same thing.
 *
 * @param {{ run?: typeof defaultRun }} [deps]
 * @returns {LabelledIssue[]}
 */
export function fetchOpenIssues({ run = defaultRun } = {}) {
  return fetchIssues({ run, state: "open", limit: 200 });
}

/**
 * #788: THE ISSUE NUMBERS GITHUB ITSELF REPORTS OPEN, independent of `fetchIssues`'s own `gh issue list`
 * call -- GitHub's search index, asked the identical question a second way, so the two can be compared
 * rather than one trusted alone. `type:issue`/`is:open` (via `is:issue is:open`) deliberately does NOT
 * use the repository API's own `open_issues_count`: that field is the well-documented quirk of counting
 * open issues AND open pull requests together, so it would never equal `fetchIssues`'s issues-only count
 * even on a perfectly healthy tracker.
 *
 * #838: RETURNS THE NUMBERS, NOT JUST A COUNT -- the count-only version could say two reads disagreed,
 * never which row was the difference, so a genuine population shrink and an ordinary single-row race
 * (an issue opened or closed between two reads of a live tracker moving underneath it) printed the
 * identical "examined 66, search reports 65" and were refused identically. `openIssueSetSummary` below
 * needs the actual SET to tell them apart.
 *
 * THROWS on any failure or an unparseable number, same discipline as every other fetcher here: a silent
 * empty list would read as "no issues are open", the opposite of an honest "could not ask".
 *
 * @param {{ run?: typeof defaultRun }} [deps]
 * @returns {number[]}
 */
export function fetchReportedOpenIssueNumbers({ run = defaultRun } = {}) {
  /** @type {string} */
  let raw;
  try {
    raw = run("gh", ["api", `search/issues?q=${encodeURIComponent(`repo:${REPO} is:issue is:open`)}`,
      "--paginate", "--jq", ".items[].number"]);
  } catch (cause) {
    throw new Error(`ready-label-audit: could not read GitHub's reported open-issue numbers -- refusing `
      + `to guess whether the examined population is complete. `
      + `${/** @type {Error} */ (cause).message}`, { cause });
  }
  return raw.split("\n").filter(Boolean).map((line) => {
    const n = Number(line.trim());
    if (!Number.isFinite(n)) {
      throw new Error(`ready-label-audit: GitHub's reported open-issue numbers included a non-number `
        + `line -- refusing to guess. Got: ${line.slice(0, 200)}`);
    }
    return n;
  });
}

/**
 * Pure: do two SETS of open-issue numbers agree, and if not, which numbers are in one and not the
 * other? #838: named EXPLICITLY as "in one, not the other" rather than a bare count difference -- a
 * count of 66 vs 65 says nothing about WHICH row, and cannot distinguish a genuine population shrink
 * from the two sides each naming 65 of the same 66 rows plus one different straggler apiece (a count
 * that could, by coincidence, even agree while the sets do not).
 * @param {number[]} examined
 * @param {number[]} reported
 * @returns {{ agree: boolean, onlyExamined: number[], onlyReported: number[] }}
 */
export function openIssueSetSummary(examined, reported) {
  const examinedSet = new Set(examined);
  const reportedSet = new Set(reported);
  const onlyExamined = examined.filter((n) => !reportedSet.has(n));
  const onlyReported = reported.filter((n) => !examinedSet.has(n));
  return { agree: onlyExamined.length === 0 && onlyReported.length === 0, onlyExamined, onlyReported };
}

/**
 * #788: `fetchOpenIssues`, but STATES what it examined against what GitHub's own search index reports
 * open, and REFUSES the whole read as partial when they differ -- rather than each of the mutex,
 * hand-claim, stranded, board-membership, dead-claim, already-merged and #788's own labelless-row checks
 * silently examining a population smaller (or larger) than the tracker actually holds and reporting a
 * clean result regardless. #715's own rule, generalised: a guard whose population is a query must assert
 * about the SEARCH, not only about its result -- an audit reporting "OK 74 open issues checked" has
 * examined only the rows its query could see, and #623 was reachable by NO label query at all.
 *
 * #838: A MISMATCH RE-READS ONCE BEFORE REFUSING. Measured live: "examined 66, search reports 65"
 * refused FIVE of nine checks -- two reads a second apart across a tracker that keeps moving, the
 * ORDINARY state for a live board, not a shrunk population. Two reads is not proof against a genuine
 * shrink either, so the SECOND disagreement still refuses -- this buys one honest retry against a race,
 * not infinite trust in whatever the tracker says. A mismatch the retry resolves is NAMED on stderr
 * (which rows raced, and that a second read agreed), never silently swallowed: the audit proceeds, but
 * the fact that it needed a second look is part of the record, not folded into a plain "OK".
 *
 * @param {{ run?: typeof defaultRun, fetchReportedNumbers?: typeof fetchReportedOpenIssueNumbers }} [deps]
 * @returns {{ issues: LabelledIssue[], reportedCount: number }}
 */
export function fetchOpenIssuesChecked(
  { run = defaultRun, fetchReportedNumbers = fetchReportedOpenIssueNumbers } = {}) {
  const issues = fetchOpenIssues({ run });
  const reportedNumbers = fetchReportedNumbers({ run });
  const first = openIssueSetSummary(issues.map((i) => i.number), reportedNumbers);
  if (first.agree) return { issues, reportedCount: reportedNumbers.length };

  const retryIssues = fetchOpenIssues({ run });
  const retryReportedNumbers = fetchReportedNumbers({ run });
  const second = openIssueSetSummary(retryIssues.map((i) => i.number), retryReportedNumbers);
  if (second.agree) {
    process.stderr.write(`ready-label-audit: the first read disagreed with GitHub's search index -- `
      + `examined-only: ${first.onlyExamined.join(", ") || "none"}; search-only: `
      + `${first.onlyReported.join(", ") || "none"}. A live tracker moving between two reads is the `
      + `ordinary state; the second read agrees, so this is named here rather than counted as partial.\n`);
    return { issues: retryIssues, reportedCount: retryReportedNumbers.length };
  }
  throw new Error(`ready-label-audit: examined open issues disagree with GitHub's search index on BOTH `
    + `reads -- refusing to audit a population that may have shrunk (or grown) for real, not merely `
    + `raced. Examined but not in search: ${second.onlyExamined.join(", ") || "none"}. In search but `
    + `not examined: ${second.onlyReported.join(", ") || "none"}.`);
}

/**
 * Reads issues from the real board, at the given `--state`. Shared by `fetchOpenIssues` (unchanged
 * behaviour: `--state open`, limit 200, still exactly what the mutex check reads) and `fetchAllIssues`
 * (`--state all`, the population #378 exists to make visible). `gh` failing, answering with a shape this
 * function does not recognise, or returning exactly `limit` rows all THROW -- the last case is a BOUNDED
 * LISTING READ AS AN ANSWER, this repo's own most-repeated shape, and 51 open + 174 closed already exceeds
 * the audit's old 200 cap once both populations are read together.
 *
 * @param {{ run?: typeof defaultRun, state: "open" | "all", limit?: number }} args
 * @returns {(LabelledIssue & { state?: "OPEN" | "CLOSED" })[]}
 */
export function fetchIssues({ run = defaultRun, state, limit = 500 }) {
  /** @type {string} */
  let raw;
  try {
    raw = run("gh", ["issue", "list", "--repo", REPO, "--state", state, "--limit", String(limit),
      "--json", "number,title,labels,state"]);
  } catch (cause) {
    throw new Error(`ready-label-audit: could not list ${state} issues from ${REPO} -- refusing to guess. `
      + `${/** @type {Error} */ (cause).message}`, { cause });
  }
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw new Error(`ready-label-audit: gh's response was not JSON -- refusing to guess. `
      + `First 200 chars: ${raw.slice(0, 200)}`, { cause });
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`ready-label-audit: gh's response was not a list -- refusing to guess. `
      + `Got: ${JSON.stringify(parsed).slice(0, 300)}`);
  }
  if (parsed.length === limit) {
    throw new Error(`ready-label-audit: gh returned exactly the requested limit (${limit}) of ${state} `
      + `issues -- this is indistinguishable from a truncated result, refusing to report a partial count `
      + `as a complete one. Raise the limit.`);
  }
  return parsed.map((/** @type {unknown} */ entry, /** @type {number} */ i) => {
    const obj = /** @type {{ number?: unknown, title?: unknown, labels?: unknown, state?: unknown }} */ (entry);
    if (typeof obj?.number !== "number" || typeof obj?.title !== "string" || !Array.isArray(obj?.labels)) {
      throw new Error(`ready-label-audit: entry ${i} is missing number/title/labels -- refusing to guess. `
        + `Got: ${JSON.stringify(entry).slice(0, 300)}`);
    }
    // `state` is READ, not REQUIRED: `fetchOpenIssues` never asked `gh` for it before #378 and every
    // existing caller of the shared parser (including this file's own long-standing test fixtures) omits
    // it -- requiring it here would make a well-formed OLD-shape response throw. Absent reads as neither
    // OPEN nor CLOSED, which `closedDebris` treats as "not closed" -- conservative, since the one thing
    // that function must never do is report a row as closed debris on a guess.
    const state = obj?.state === "OPEN" || obj?.state === "CLOSED" ? obj.state : undefined;
    const names = obj.labels.map((/** @type {unknown} */ l) => {
      const name = /** @type {{ name?: unknown }} */ (l)?.name;
      if (typeof name !== "string") {
        throw new Error(`ready-label-audit: issue #${obj.number} has a label with no name -- refusing to `
          + `guess. Got: ${JSON.stringify(l)}`);
      }
      return name;
    });
    // `state` is OMITTED, not set to `undefined`, when absent -- so `fetchOpenIssues`'s existing shape
    // (no `state` key at all) is byte-identical to before #378, rather than gaining a key whose value is
    // always `undefined` for every caller that never asked `gh` for it.
    return state === undefined
      ? { number: obj.number, title: obj.title, labels: names }
      : { number: obj.number, title: obj.title, labels: names, state };
  });
}

/**
 * Every issue, open and closed, in ONE call -- `--state all`. #378's own population: `mutexViolations`
 * keeps reading only what `fetchOpenIssues` returns, unchanged; this is additive.
 * @param {{ run?: typeof defaultRun }} [deps]
 * @returns {(LabelledIssue & { state?: "OPEN" | "CLOSED" })[]}
 */
export function fetchAllIssues({ run = defaultRun } = {}) {
  return fetchIssues({ run, state: "all" });
}

/**
 * Pure: which open issues carry `ready` together with a label that already means "not pickable"?
 *
 * @param {LabelledIssue[]} issues
 * @returns {Array<{ number: number, title: string, conflicting: string[] }>}
 */
export function mutexViolations(issues) {
  const violations = [];
  for (const { number, title, labels } of issues) {
    if (!labels.includes(READY_LABEL)) continue;
    const conflicting = MUTEX_LABELS.filter((l) => labels.includes(l));
    if (conflicting.length > 0) violations.push({ number, title, conflicting });
  }
  return violations;
}

/**
 * #673: Pure -- which open issues carry BOTH `ready` and `in-progress`? `row-claim.mjs`'s
 * `writeRowLabels` removes `READY_LABEL` in the same edit that adds `in-progress`/`session:*`, always --
 * so this co-occurrence can only arise from a claim made outside `row-claim.mjs` (a hand-applied label, a
 * direct assignment). A row claimed through the real mechanism never reaches this filter, which is the
 * mutation the issue itself names: claim one through `row-claim` and confirm this stays silent.
 *
 * @param {LabelledIssue[]} issues
 * @returns {Array<{ number: number, title: string, sessions: string[] }>}
 */
export function handClaims(issues) {
  const claims = [];
  for (const { number, title, labels } of issues) {
    if (!labels.includes(READY_LABEL) || !labels.includes("in-progress")) continue;
    const sessions = labels.filter((l) => l.startsWith("session:"));
    claims.push({ number, title, sessions });
  }
  return claims;
}

/**
 * A label on a CLOSED row that means "pickable" or "claimed" -- not a contradiction to resolve, DEBRIS
 * nobody is going to act on.
 *
 * #782: DELEGATES TO `labelsToStrip` for `ready`/`in-progress`/`started`/`session:*`, rather than a
 * second, hand-rolled list -- found 2026-09-09 when a real sweep using `labelsToStrip` caught 52 closed
 * rows carrying only a stale `started` label that this function's own list (missing `started` entirely)
 * had never once flagged. That is the "a fact stated twice, and the copies drifted" shape: two
 * independent answers to "what counts as a stale claim label on a closed row", with nothing comparing
 * them. Delegating means there is exactly one list to drift FROM now.
 *
 * `runner:*` stays as this function's OWN addition, deliberately not folded into `labelsToStrip` (#444): a
 * reservation is the same family as `session:*` -- a claim on a row with nobody left to honour it once the
 * row is closed -- but `labelsToStrip` must never remove it (`row-claim.mjs`'s own comment: it survives a
 * claim on purpose, recording WHO a row was reserved for). A closed, runner-reserved row is not a
 * contradiction (see `mutexViolations`'s own doc for why `runner:` must NOT join `MUTEX_LABELS` instead),
 * it is the identical stale-bookkeeping shape `session:*` debris already is -- reported here, never
 * stripped by either function.
 * @param {string} label
 * @returns {boolean}
 */
export function isClosedDebrisLabel(label) {
  return labelsToStrip([label]).length > 0 || label.startsWith("runner:");
}

/**
 * Pure: which CLOSED issues still carry a label that means pickable/claimed? A SEPARATE population from
 * `mutexViolations`, reported with separate wording -- collapsing the two would bury the real open-row
 * contradictions under however many closed rows carry stale bookkeeping (measured 2026-09-07: 119).
 *
 * @param {(LabelledIssue & { state?: "OPEN" | "CLOSED" })[]} issues
 * @returns {Array<{ number: number, title: string, debris: string[] }>}
 */
export function closedDebris(issues) {
  const found = [];
  for (const { number, title, labels, state } of issues) {
    if (state !== "CLOSED") continue;
    const debris = labels.filter(isClosedDebrisLabel);
    if (debris.length > 0) found.push({ number, title, debris });
  }
  return found;
}

/**
 * #788: Pure -- which open issues carry NO labels at all? Not `unclaimed`, not `not ready`, not
 * `blocked` -- ABSENT. Every check in this file, the Ready lane, the backlog view, the WIP count, the
 * dead-claim check, the hourly table and the section-backfill sweep are all keyed on labels, so a row
 * carrying none is invisible to all of them at once, not merely to one. Measured 2026-09-09: three open
 * rows (#623, #644, #600), fixed by hand -- #623 was the most irreversible row on the 15 September
 * transfer milestone and reachable by no label query at all. Nothing stops a fourth: filing requires no
 * label, and every check that would notice reads by label.
 * @param {LabelledIssue[]} openIssues
 * @returns {LabelledIssue[]}
 */
export function labellessRows(openIssues) {
  return openIssues.filter((i) => i.labels.length === 0);
}

/**
 * Pure: which OPEN issues have NO item on the Project board at all? Neither a label check (the label is
 * correct) nor a Status check (there is no item to read a Status from) can see this on its own -- it is
 * visible only as a comparison between the two populations. Measured 2026-09-08: four `ready` rows
 * existed this way while the Ready lane read empty and idled a worker.
 *
 * #788: WIDENED FROM `ready` ROWS TO EVERY OPEN ROW -- ceo's ruling, 2026-09-09. The `ready`-only version
 * reported nothing while 24 open rows of every OTHER kind had no Project item; it was right to, since it
 * was only ever asked about the `ready` subset. Project 2 is the view the chairman reads, so a row off
 * it is invisible there exactly as a labelless row was invisible to the label-keyed checks -- the same
 * shape at a different layer, closed the same way: widen the population, not the label list.
 * @param {LabelledIssue[]} openIssues
 * @param {Set<number>} boardNumbers issue numbers that have an item on the Project
 * @returns {LabelledIssue[]}
 */
export function openRowsAbsentFromBoard(openIssues, boardNumbers) {
  return openIssues.filter((i) => !boardNumbers.has(i.number));
}

/**
 * @typedef {{ number: number, state: string, mergedAt: string | null }} ClosingPrRef
 */

/**
 * @typedef {{ number: number, title: string, state: "ALREADY-MERGED", closedBy: number, mergedAt: string }
 *   | { number: number, title: string, state: "REOPENED-AFTER-MERGE", closedBy: number, mergedAt: string,
 *       reopenedAt: string }} AlreadyMergedRow
 */

/**
 * Pure: which OPEN `ready`/`in-progress` issues does a MERGED PR already claim to close, and -- #550 --
 * was the row put back DELIBERATELY after that merge, rather than simply forgotten? #443 -- #438 was
 * merged as #440 at 02:31Z, never auto-closed (bot-attributed merges do not close a referenced issue --
 * see `close-rows-for-merged-pr.mjs`'s own header), and sat `ready` until a worker claimed it and had to
 * revert. Every existing check misses this: the collision check asks "does anyone else hold this row",
 * the mutex check asks "is `ready` beside a not-pickable LABEL", `openRowsAbsentFromBoard` asks "is it on
 * the board" -- none of them ask "did the work already ship".
 *
 * DELIBERATELY KEYED ON A CLOSING REFERENCE, never a bare mention -- `closingIssuesReferences` (fed here
 * per issue as `closingRefsByIssue`) is GitHub's OWN resolution of a `Closes #N`-shaped keyword in a PR
 * body, so a PR that only MENTIONS this issue in prose never appears in the map at all. And deliberately
 * MERGED, not merely present: an OPEN PR that declares `Closes #N` is exactly the state a worker taking
 * this row would want to know about, not a reason to hide the row.
 *
 * #550: #492 was closed by #529 (18:37:31Z), reopened (18:51:57Z), closed again by #545 (19:00:41Z), and
 * reopened again (19:06:33Z) -- every clause of the old ALREADY-MERGED sentence was true and the
 * conclusion was not, because a row REOPENED after the merge that referenced it is a refuted fix, not a
 * forgotten one. So this compares the LATEST reopen against the MOST RECENT QUALIFYING MERGE, never the
 * first of either found: a row can cycle through this more than once (as #492 did, TWICE), and only the
 * latest events on each side are the ones actually in a race. Comparing against the first reopen or the
 * first merge is right by luck whenever there is only one of each, and wrong the moment there are two.
 *
 * @param {LabelledIssue[]} readyIssues open issues already filtered to a live-state label
 * @param {Map<number, ClosingPrRef[]>} closingRefsByIssue issue number -> the PRs that would close it
 * @param {Map<number, string | null>} [latestReopenByIssue] issue number -> its LATEST `reopened` event's
 *   timestamp, from the issue's own timeline (never from a label -- a label records what somebody SET,
 *   the timeline records WHEN the row actually came back, and this whole distinction is about ordering
 *   in time). Absent or null means the issue has never been reopened.
 * @returns {AlreadyMergedRow[]}
 */
export function readyRowsAlreadyMerged(readyIssues, closingRefsByIssue, latestReopenByIssue = new Map()) {
  /** @type {AlreadyMergedRow[]} */
  const flagged = [];
  for (const issue of readyIssues) {
    const refs = closingRefsByIssue.get(issue.number) ?? [];
    const merged = refs.filter((ref) => ref.state === "MERGED" && ref.mergedAt);
    if (merged.length === 0) continue;
    const mostRecentMerge = merged.reduce(
      (a, b) => (/** @type {string} */ (a.mergedAt) > /** @type {string} */ (b.mergedAt) ? a : b),
    );
    const mergedAt = /** @type {string} */ (mostRecentMerge.mergedAt);
    const reopenedAt = latestReopenByIssue.get(issue.number);
    if (reopenedAt && reopenedAt > mergedAt) {
      flagged.push({ number: issue.number, title: issue.title, state: "REOPENED-AFTER-MERGE",
        closedBy: mostRecentMerge.number, mergedAt, reopenedAt });
    } else {
      flagged.push({ number: issue.number, title: issue.title, state: "ALREADY-MERGED",
        closedBy: mostRecentMerge.number, mergedAt });
    }
  }
  return flagged;
}


/** A row that ADVERTISES A LIVE STATE -- pickable or claimed. Both are claims about the present, and both
 * are falsified the same way: by the work already being on main.
 * @param {string[]} labels */
export function livesStateLabels(labels) {
  return labels.includes(READY_LABEL) || labels.includes("in-progress");
}

/**
 * Pure: which `in-progress` rows have no open pull request and no push behind them?
 *
 * THE CLAIM IS ABOUT THE PRESENT AND NOTHING CHECKED IT. `in-progress` says a session is working this
 * row right now. Measured 2026-09-08, after the chairman read the board: 24 open rows carried it and
 * 15 were finished or dead -- one claimed THIRTY HOURS earlier with no branch ever pushed. A claim
 * nobody can falsify is not a status, it is a decoration.
 *
 * WHY EACH SIGNAL, AND WHY NONE ALONE. An open PR is proof of work in flight. A recent push is proof of
 * work in progress that has not opened one yet. A recent COMMENT is proof of work that has produced no
 * commit at all -- a measurement posted, a plan written before the act, a deploy reported -- which is a
 * whole class of row on this tracker. Requiring a PR alone would flag every session in its first hour;
 * requiring a push alone flags a session whose only artefact so far is what it wrote on the row. A row is
 * stale only when NONE holds.
 *
 * THE COMMENT LEG IS #723's, AND THIS CHECK DISAGREED WITH IT UNTIL #756. `ceo`'s release rule reads a
 * claim as live on a push OR a comment; this read only the push, so on 2026-09-09 it reported #426 as a
 * DEAD-CLAIM while a comment 47 minutes old sat on it, and `tracker-auditor` had to overrule the tool to
 * follow the rule. A guard that disagrees with the rule it enforces trains its reader to overrule it, and
 * this one survived because it erred safe: nobody was harmed, so nobody fixed it, and what got built was
 * the habit of skipping its output.
 *
 * "BY THE CLAIMANT" IS NOT MEASURABLE HERE, AND SAYING SO IS PART OF THE FIX. `ceo`'s rule says a comment
 * BY THE CLAIMANT. Every session in this repository posts as the same GitHub user -- the identical
 * limitation `docs/board/reported/meta.json` records for the capacity metric ("two assignable accounts and
 * nine sessions") -- so `user.login` cannot name which session wrote a comment. Nor does the text: checked
 * against the live case, all three of #426's recent comments name NEITHER of its two claiming sessions.
 * So this counts any comment on the row, and the gap is filed rather than hidden. The error is toward NOT
 * releasing a claim, which is the safe direction for a release authority, and it is the reading
 * `tracker-auditor` was already applying.
 *
 * `behind` is deliberately NOT a signal here: during a drain every merge puts every branch behind, and
 * #406 sat at behind=55 while entirely healthy.
 *
 * @param {{ number: number, title: string, labels: string[] }[]} issues
 * @param {{ hasOpenPr: Map<number, boolean>, lastPushMinutes: Map<number, number>,
 *           claimedMinutes: Map<number, number>, lastCommentMinutes?: Map<number, number> }} activity
 *   the facts, which travel together. `lastCommentMinutes` is OPTIONAL so an older caller's three-fact
 *   shape still type-checks and still decides -- absent reads as "no comment seen", never as "fresh".
 * @param {number} staleAfterMinutes
 */
export function claimsNobodyIsWorking(issues, activity, staleAfterMinutes = 240) {
  const { hasOpenPr, lastPushMinutes, claimedMinutes, lastCommentMinutes } = activity;
  const stale = [];
  for (const issue of issues) {
    if (!issue.labels.includes("in-progress")) continue;
    if (hasOpenPr.get(issue.number)) continue;

    // THE CLAIM'S OWN AGE IS THE CLOCK, not the branch's. A row claimed ten minutes ago has no branch
    // because the session has not pushed yet, and a row claimed thirty hours ago has none because
    // nobody ever started -- identical evidence, opposite meanings, and only the claim time separates
    // them. MEASURED: the first live run of this check flagged five rows claimed within the hour,
    // because "no branch at all" was treated as the strongest signal regardless of when the claim was
    // made. It fired, and its first firing was five false positives, which is why it was wired before
    // it was trusted.
    const claimAge = claimedMinutes.get(issue.number);
    if (claimAge !== undefined && claimAge < staleAfterMinutes) continue;

    const age = lastPushMinutes.get(issue.number);
    if (age !== undefined && age < staleAfterMinutes) continue;

    // #723's leg, in the same window as the push. Read AFTER the push so the reported `minutes` still
    // describes the branch: a row kept alive by a comment is a different situation from one kept alive by
    // a push, and the line that names it should say which.
    const commentAge = lastCommentMinutes?.get(issue.number);
    if (commentAge !== undefined && commentAge < staleAfterMinutes) continue;

    stale.push({ number: issue.number, title: issue.title,
      sessions: issue.labels.filter((l) => l.startsWith("session:")),
      minutes: age ?? null, claimedMinutesAgo: claimAge ?? null });
  }
  return stale;
}

/**
 * One GraphQL round trip for every `ready` issue's closing PR references, via aliased sub-queries rather
 * than one call per issue -- the Ready lane is small (single digits to low tens), but N separate `gh api`
 * invocations is still N processes for one answer. Empty input makes no call at all, since an empty alias
 * list is not valid GraphQL and "nothing to ask" needs no round trip to answer.
 *
 * THROWS on any failure or unrecognised shape, same discipline as every other fetcher in this file: a
 * silently empty map would read as "no row is already merged", the opposite of an honest "could not ask".
 *
 * @param {number[]} issueNumbers
 * @param {{ run?: typeof defaultRun }} [deps]
 * @returns {Map<number, ClosingPrRef[]>}
 */
export function fetchClosingPrRefs(issueNumbers, { run = defaultRun } = {}) {
  /** @type {Map<number, ClosingPrRef[]>} */
  const map = new Map();
  if (issueNumbers.length === 0) return map;
  const [owner, name] = REPO.split("/");
  const fields = issueNumbers.map((n, i) => `i${i}: issue(number: ${n}) { number `
    + `closedByPullRequestsReferences(first: 20) { nodes { number state mergedAt } } }`).join(" ");
  const query = `{ repository(owner: "${owner}", name: "${name}") { ${fields} } }`;
  /** @type {string} */
  let raw;
  try {
    raw = run("gh", ["api", "graphql", "-f", `query=${query}`]);
  } catch (cause) {
    throw new Error(`ready-label-audit: could not resolve closing PR references -- refusing to guess. `
      + `${/** @type {Error} */ (cause).message}`, { cause });
  }
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw new Error(`ready-label-audit: gh's closing-references response was not JSON -- refusing to `
      + `guess. First 200 chars: ${raw.slice(0, 200)}`, { cause });
  }
  const repo = /** @type {any} */ (parsed)?.data?.repository;
  if (!repo || typeof repo !== "object") {
    throw new Error(`ready-label-audit: gh's closing-references response had no repository -- refusing `
      + `to guess. Got: ${JSON.stringify(parsed).slice(0, 300)}`);
  }
  return closingPrRefsFromRepoNode(repo, issueNumbers);
}

/**
 * One GraphQL round trip for every issue's LATEST `reopened` timeline event -- #550. A separate call from
 * `fetchClosingPrRefs` rather than one field folded into it: the two are independent facts (closing PR
 * state, and the issue's own reopen history) and combining them into one richer return shape would have
 * meant restructuring that function's existing `Map<number, ClosingPrRef[]>` contract for every caller
 * and test, for a Ready lane small enough (single digits to low tens) that a second round trip costs
 * nothing worth avoiding that for.
 *
 * `last: 1` on the server side, not `.pop()` on the client -- GitHub returns timeline items OLDEST
 * first, so the LAST item in an unbounded page is the most recent one, and asking the server for exactly
 * that one item is both the correct answer and the cheaper query.
 *
 * THROWS on any failure or unrecognised shape, same discipline as `fetchClosingPrRefs`: a silently empty
 * map would read as "never reopened" for every issue, which turns every ALREADY-MERGED row into a
 * guaranteed false conclusion rather than an honest refusal.
 *
 * @param {number[]} issueNumbers
 * @param {{ run?: typeof defaultRun }} [deps]
 * @returns {Map<number, string | null>} issue number -> its latest reopen's ISO timestamp, or null if
 *   the issue has never been reopened
 */
export function fetchLatestReopenedAt(issueNumbers, { run = defaultRun } = {}) {
  /** @type {Map<number, string | null>} */
  const map = new Map();
  if (issueNumbers.length === 0) return map;
  const [owner, name] = REPO.split("/");
  const fields = issueNumbers.map((n, i) => `i${i}: issue(number: ${n}) { number `
    + `timelineItems(itemTypes: [REOPENED_EVENT], last: 1) { nodes { ... on ReopenedEvent { createdAt } } } }`)
    .join(" ");
  const query = `{ repository(owner: "${owner}", name: "${name}") { ${fields} } }`;
  /** @type {string} */
  let raw;
  try {
    raw = run("gh", ["api", "graphql", "-f", `query=${query}`]);
  } catch (cause) {
    throw new Error(`ready-label-audit: could not resolve reopen history -- refusing to guess. `
      + `${/** @type {Error} */ (cause).message}`, { cause });
  }
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw new Error(`ready-label-audit: gh's reopen-history response was not JSON -- refusing to guess. `
      + `First 200 chars: ${raw.slice(0, 200)}`, { cause });
  }
  const repo = /** @type {any} */ (parsed)?.data?.repository;
  if (!repo || typeof repo !== "object") {
    throw new Error(`ready-label-audit: gh's reopen-history response had no repository -- refusing to `
      + `guess. Got: ${JSON.stringify(parsed).slice(0, 300)}`);
  }
  return latestReopenedAtFromRepoNode(repo, issueNumbers);
}

/**
 * Reads each aliased `i<N>: issue(...)` node's reopen timeline back out, keyed by the real issue number
 * rather than by alias -- split out of `fetchLatestReopenedAt` purely to keep that function's complexity
 * under gate, per this repo's Stepdown Rule and the identical split `closingPrRefsFromRepoNode` already
 * makes for `fetchClosingPrRefs`; it is the same one concept written out.
 *
 * @param {Record<string, any>} repo
 * @param {number[]} issueNumbers
 * @returns {Map<number, string | null>}
 */
function latestReopenedAtFromRepoNode(repo, issueNumbers) {
  /** @type {Map<number, string | null>} */
  const map = new Map();
  for (let i = 0; i < issueNumbers.length; i++) {
    const node = repo[`i${i}`];
    if (!node || typeof node.number !== "number") {
      throw new Error(`ready-label-audit: issue #${issueNumbers[i]} is missing from the reopen-history `
        + `response -- refusing to guess. Got: ${JSON.stringify(node ?? null).slice(0, 300)}`);
    }
    const nodes = node.timelineItems?.nodes;
    const latest = Array.isArray(nodes) && nodes.length > 0 ? nodes[nodes.length - 1]?.createdAt ?? null : null;
    map.set(node.number, latest);
  }
  return map;
}

/**
 * Reads each aliased `i<N>: issue(...)` node back out of the GraphQL response, keyed by the real issue
 * number rather than by alias -- split out of `fetchClosingPrRefs` purely to keep that function's
 * complexity under gate, per this repo's Stepdown Rule; it is the same one concept written out.
 *
 * @param {Record<string, any>} repo
 * @param {number[]} issueNumbers
 * @returns {Map<number, ClosingPrRef[]>}
 */
function closingPrRefsFromRepoNode(repo, issueNumbers) {
  /** @type {Map<number, ClosingPrRef[]>} */
  const map = new Map();
  for (let i = 0; i < issueNumbers.length; i++) {
    const node = repo[`i${i}`];
    if (!node || typeof node.number !== "number") {
      // `JSON.stringify(undefined)` returns `undefined`, not a string -- a missing alias (the exact case
      // this branch exists for) would throw INSIDE the error message rather than reporting one.
      throw new Error(`ready-label-audit: issue #${issueNumbers[i]} is missing from the closing-references `
        + `response -- refusing to guess. Got: ${JSON.stringify(node ?? null).slice(0, 300)}`);
    }
    const nodes = node.closedByPullRequestsReferences?.nodes;
    const refs = Array.isArray(nodes)
      ? nodes.map((/** @type {any} */ r) => ({ number: r.number, state: r.state, mergedAt: r.mergedAt ?? null }))
      : [];
    map.set(node.number, refs);
  }
  return map;
}

/** Report the OPEN-row mutex check exactly as before #378 -- unchanged population, unchanged wording. */
function reportMutexViolations() {
  const { issues, reportedCount } = fetchOpenIssuesChecked();
  const violations = mutexViolations(issues);
  if (violations.length === 0) {
    process.stdout.write(`OK  ${issues.length} of ${reportedCount} open issue(s) checked, none carry `
      + `\`ready\` with a not-pickable label\n`);
    return 0;
  }
  for (const { number, title, conflicting } of violations) {
    process.stdout.write(`VIOLATION  #${number} "${title}" -- ready + ${conflicting.join(", ")}\n`);
  }
  process.stderr.write(`\n${violations.length} row(s) carry \`ready\` alongside a label that already means `
    + `not pickable. Remove one or the other.\n`);
  return violations.length;
}

/**
 * #673: Report rows claimed by hand -- `ready` + `in-progress` together, which `row-claim.mjs`'s own
 * atomic label-write can never produce. Named separately from `reportMutexViolations` because the two
 * need different remedies: a hand claim's fix is to route the claim through `row-claim.mjs`, never to
 * remove one of the two labels as `mutexViolations`' generic wording would suggest.
 */
function reportHandClaims() {
  const { issues, reportedCount } = fetchOpenIssuesChecked();
  const claims = handClaims(issues);
  if (claims.length === 0) {
    process.stdout.write(`OK  ${issues.length} of ${reportedCount} open issue(s) checked, none carry `
      + `ready + in-progress together -- row-claim's own mechanism can never produce that state\n`);
    return 0;
  }
  for (const { number, title, sessions } of claims) {
    const who = sessions.length > 0 ? sessions.join(", ") : "an unknown session";
    process.stdout.write(`HAND CLAIM  #${number} "${title}" -- claimed by ${who} without row-claim.mjs, `
      + `which never leaves \`ready\` in place\n`);
  }
  process.stderr.write(`\n${claims.length} row(s) were claimed by hand rather than through row-claim.mjs. `
    + `Route the claim through it instead: \`node scripts/row-claim.mjs decline <n> `
    + `--session=<whoever holds it>\`, then claim or dispatch it properly.\n`);
  return claims.length;
}

/**
 * #788: Report open rows carrying NO labels at all -- distinct from every other check here, because
 * those all enumerate BY label and a labelless row has nothing for any of them to key on. Named
 * separately, with wording that says what absence MEANS: not merely unlabelled, but invisible to the
 * Ready lane, the backlog view, the WIP count, the dead-claim check, the hourly table and the
 * section-backfill sweep all at once -- a reader who saw only "unlabelled" could mistake it for
 * cosmetic.
 */
function reportLabelless() {
  const { issues, reportedCount } = fetchOpenIssuesChecked();
  const rows = labellessRows(issues);
  if (rows.length === 0) {
    process.stdout.write(`OK  ${issues.length} of ${reportedCount} open issue(s) checked, none carry `
      + `zero labels\n`);
    return 0;
  }
  for (const { number, title } of rows) {
    process.stdout.write(`NO LABELS  #${number} "${title}" -- carries no label at all, so it is absent `
      + `from every other check in this audit, and from the Ready lane, the backlog view, the WIP count, `
      + `the dead-claim check, the hourly table and the section-backfill sweep, all of which enumerate by `
      + `label\n`);
  }
  process.stderr.write(`\n${rows.length} row(s) carry no label at all. Add at least one -- \`backlog\` is `
    + `the safe default, and which is right is a human judgement -- so they become visible to every `
    + `check that reads this tracker.\n`);
  return rows.length;
}

/**
 * #449: A ROW THAT SHOULD BE `ready` AND IS NOT -- the population no existing check here can see, since
 * `mutexViolations` only ever compares labels the row DOES carry against each other, and an absent label
 * has nothing to conflict with. `WAS_READY_LABEL` is the marker that makes this population expressible:
 * a row carrying it while neither `ready` nor `in-progress` is exactly #171's shape -- claimed, then
 * correctly declined, and the restore that should have put `ready` back silently did not happen.
 *
 * `declineRow` is the ONLY writer of `WAS_READY_LABEL`, and it always removes it in the same edit that
 * restores `ready` (or, on a `--blocked` decline, in the same edit that adds `blocked` instead --
 * deliberately, since a blocked row is a genuine finding and must not ALSO read as stranded). So a row
 * matching this filter is either a live instance of the restore failing, or a hand-edited label; either
 * way, worth a look rather than a silent gap.
 *
 * @param {LabelledIssue[]} issues open issues
 * @returns {LabelledIssue[]}
 */
export function strandedByIncompleteDecline(issues) {
  return issues.filter((issue) =>
    issue.labels.includes(WAS_READY_LABEL)
    && !issue.labels.includes(READY_LABEL)
    && !issue.labels.includes("in-progress"));
}

/**
 * Report the CLOSED-row debris population #378 exists for -- a SEPARATE listing with separate wording, so
 * it is never read as a contradiction to resolve. Reports only; the tracker's labels are
 * `product-manager`'s to strip, deliberately.
 */
function reportClosedDebris() {
  const issues = fetchAllIssues();
  const debris = closedDebris(issues);
  if (debris.length === 0) {
    process.stdout.write(`OK  no closed issue carries \`ready\`, \`in-progress\` or a \`session:*\` label\n`);
    return 0;
  }
  for (const { number, title, debris: labels } of debris) {
    process.stdout.write(`DEBRIS  #${number} "${title}" -- closed, still carries ${labels.join(", ")}\n`);
  }
  const readyOnClosed = debris.filter((d) => d.debris.includes(READY_LABEL)).length;
  // #752: STATE-AWARE, NOT A SINGLE COMMAND FOR BOTH POPULATIONS -- `decline` needs `in-progress` (a
  // claim to release) and only then removes labels without adding `ready` back on a closed row
  // (row-claim.mjs's own fix for this exact incident: declining #721 while it was already closed had
  // restored `ready`, turning one debris finding into another). A row carrying ONLY `ready`, with no
  // claim for `decline` to act on, has nothing for it to do -- named separately so the remediation never
  // sends a reader to a command that will refuse.
  const claimedDebris = debris.filter((d) => d.debris.includes("in-progress"));
  process.stderr.write(`\n${debris.length} closed row(s) still carry a pickable/claimed label -- nobody `
    + `will act on these, but a Ready count taken by label rather than by state is wrong by `
    + `${readyOnClosed} because of them. Stale bookkeeping, not a contradiction: ${claimedDebris.length} `
    + `still carry \`in-progress\` and can be cleared with \`node scripts/row-claim.mjs decline <n> `
    + `--session=<whoever holds it>\` (safe here -- a closed row is never returned to \`ready\`); the `
    + `rest carry only \`ready\` or a stray \`session:\`/\`runner:\` label, which decline has no claim to `
    + `release and the tracker owner clears by hand.\n`);
  return debris.length;
}

/**
 * Report the #449 population: an open row a correct decline should have made `ready` again, and did not.
 */
function reportStrandedByIncompleteDecline() {
  const { issues, reportedCount } = fetchOpenIssuesChecked();
  const stranded = strandedByIncompleteDecline(issues);
  if (stranded.length === 0) {
    process.stdout.write(`OK  ${issues.length} of ${reportedCount} open issue(s) checked, none are `
      + "stranded by an incomplete decline\n");
    return 0;
  }
  for (const { number, title } of stranded) {
    process.stdout.write(`STRANDED  #${number} "${title}" -- was ready before a claim, declined, `
      + `never restored to \`ready\`\n`);
  }
  process.stderr.write(`\n${stranded.length} row(s) were ready, got claimed and correctly declined, and `
    + "the restore did not happen -- invisible to the Ready queue. See #449.\n");
  return stranded.length;
}

/**
 * Report the off-the-board population #399 exists for -- a THIRD population, separate from both label
 * checks above, since neither a label comparison nor a Status comparison alone can see a row with no
 * Project item at all.
 *
 * #788: EVERY OPEN ROW, not just `ready` -- ceo's ruling, 2026-09-09. See `openRowsAbsentFromBoard`'s own
 * doc for the 24 rows the `ready`-only version could not see.
 */
function reportAbsentFromBoard() {
  const { issues, reportedCount } = fetchOpenIssuesChecked();
  const items = fetchBoardItems();
  const boardNumbers = new Set(
    /** @type {number[]} */ (items.map((i) => i.number).filter((n) => n !== null)),
  );
  const missing = openRowsAbsentFromBoard(issues, boardNumbers);
  if (missing.length === 0) {
    process.stdout.write(`OK  ${issues.length} of ${reportedCount} open issue(s) checked, every one has `
      + `an item on Project ${PROJECT_NUMBER}\n`);
    return 0;
  }
  for (const { number, title } of missing) {
    process.stdout.write(`ABSENT  #${number} "${title}" -- open, and not on the board at all\n`);
  }
  process.stderr.write(`\n${missing.length} open row(s) have no Project item -- Project ${PROJECT_NUMBER} `
    + `is the view the chairman reads, and a row off it is invisible there.\n`);
  return missing.length;
}

/**
 * Report the `ready`-but-already-merged population #443 exists for -- a FOURTH population: the row
 * survives every earlier check (nobody holds it, no mutex label, it is on the board) and is still the
 * wrong thing to pick, because a merged PR already declares `Closes #N` on it.
 */

/**
 * The facts `claimsNobodyIsWorking` needs, read from the real repository.
 *
 * SEPARATED FROM THE DECISION so the decision can be driven by fixtures -- the live tracker is clean
 * most of the time, so a check exercised only against it is one that has never been seen to fire.
 *
 * @param {number[]} numbers
 * @param {{ run?: typeof defaultRun }} [deps]
 */
export function fetchClaimActivity(numbers, { run = defaultRun } = {}) {
  /** @type {Map<number, boolean>} */
  const hasOpenPr = new Map();
  /** @type {Map<number, number>} */
  const lastPushMinutes = new Map();
  /** @type {Map<number, number>} */
  const claimedMinutes = new Map();
  /** @type {Map<number, number>} */
  const lastCommentMinutes = new Map();
  if (numbers.length === 0) return { hasOpenPr, lastPushMinutes, claimedMinutes, lastCommentMinutes };

  const open = run("gh", ["pr", "list", "--repo", REPO, "--state", "open", "--limit", "100",
    "--json", "number,body,headRefName"]);
  /** @type {{number: number, body: string, headRefName: string}[]} */
  const prs = JSON.parse(open);
  for (const n of numbers) {
    // `Closes #N` in an OPEN PR is work in flight. Matching the row number anywhere in the body would
    // count a passing mention, which is the distinction #446 is about.
    if (prs.some((pr) => new RegExp(`[Cc]loses:?\\s+#${n}(?![0-9])`).test(pr.body ?? ""))) {
      hasOpenPr.set(n, true);
    }
  }

  for (const [n, minutes] of branchAges(numbers, run)) lastPushMinutes.set(n, minutes);
  // WHEN THE CLAIM WAS MADE, from the label event -- the only clock that separates "not started yet"
  // from "never started".
  for (const n of numbers) {
    try {
      const at = run("gh", ["api", `repos/${REPO}/issues/${n}/timeline`, "--paginate", "--jq",
        '[.[]|select(.event=="labeled" and .label.name=="in-progress")]|last|.created_at']).trim();
      if (at) claimedMinutes.set(n, Math.floor((Date.now() - Date.parse(at)) / 60000));
    } catch { /* a row whose timeline cannot be read is left absent, never assumed fresh */ }
  }
  // #723/#756: THE NEWEST COMMENT'S AGE. Comments come back oldest-first, so `last` is the newest --
  // `first` would answer "when was this row first discussed", which is a different question and would
  // make every long-lived row read as dead. See `claimsNobodyIsWorking` for why this counts ANY comment
  // rather than the claimant's: session authorship is not observable through GitHub here.
  for (const n of numbers) {
    try {
      const at = run("gh", ["api", `repos/${REPO}/issues/${n}/comments`, "--paginate", "--jq",
        "[.[].created_at]|last"]).trim();
      if (at) lastCommentMinutes.set(n, Math.floor((Date.now() - Date.parse(at)) / 60000));
    } catch { /* a row whose comments cannot be read is left absent, never assumed fresh */ }
  }
  return { hasOpenPr, lastPushMinutes, claimedMinutes, lastCommentMinutes };
}

/**
 * A branch whose name ends in the row number, newest first. ABSENT means no branch at all, and stays
 * absent rather than becoming a large age -- the caller must tell "not pushed yet" from "never existed".
 * @param {number[]} numbers
 * @param {typeof defaultRun} run
 * @returns {Map<number, number>}
 */
function branchAges(numbers, run) {
  /** @type {Map<number, number>} */
  const ages = new Map();
  const refs = run("git", ["for-each-ref", "--format=%(refname:short) %(committerdate:unix)",
    "refs/remotes/origin"]);
  const now = Math.floor(Date.now() / 1000);
  for (const line of refs.split("\n")) {
    const [name, when] = line.trim().split(/\s+/);
    if (!name || !when) continue;
    const m = /-(\d+)$/.exec(name);
    if (!m || !numbers.includes(Number(m[1]))) continue;
    const n = Number(m[1]);
    const minutes = Math.floor((now - Number(when)) / 60);
    const prev = ages.get(n);
    if (prev === undefined || minutes < prev) ages.set(n, minutes);
  }
  return ages;
}

/** Reports the claims nobody is working. Returns the count, so the caller decides severity. */
function reportDeadClaims() {
  const { issues, reportedCount } = fetchOpenIssuesChecked();
  const claimed = issues.filter((i) => i.labels.includes("in-progress"));
  const stale = claimsNobodyIsWorking(claimed, fetchClaimActivity(claimed.map((i) => i.number)));
  if (stale.length === 0) {
    process.stdout.write(`OK  ${issues.length} of ${reportedCount} open issue(s) checked; every `
      + "`in-progress` row has an open PR, a push, or a comment in the last four hours -- the same "
      + "three legs as `ceo`'s release rule (#723)\n");
    return 0;
  }
  for (const { number, title, sessions, minutes } of stale) {
    const held = sessions.length > 0 ? sessions.join(", ") : "nobody (no session label)";
    const age = minutes === null ? "no branch at all" : `last push ${minutes} min ago`;
    process.stdout.write(`DEAD-CLAIM  #${number} "${title}" -- held by ${held}, no open PR, ${age}, `
      + "no comment in the window\n");
  }
  process.stderr.write(`\n${stale.length} \`in-progress\` row(s) nobody is working. A claim with no `
    + "holder is invisible to everyone reading the board.\n");
  return stale.length;
}

function reportAlreadyMerged() {
  const { issues, reportedCount } = fetchOpenIssuesChecked();
  // EVERY ROW ADVERTISING A LIVE STATE, not just `ready`. This filtered on `ready` alone, so on
  // 2026-09-08 it reported OK while FIFTEEN `in-progress` rows were finished or dead -- eleven of them
  // closed by a merged PR that declared `Closes #N`. The check was right and its population was half the
  // question, which is the shape this file exists to catch, turned on the file itself.
  const liveRows = issues.filter((i) => livesStateLabels(i.labels));
  const numbers = liveRows.map((i) => i.number);
  const refsByIssue = fetchClosingPrRefs(numbers);
  const reopenByIssue = fetchLatestReopenedAt(numbers);
  const flagged = readyRowsAlreadyMerged(liveRows, refsByIssue, reopenByIssue);
  const alreadyMerged = flagged.filter((row) => row.state === "ALREADY-MERGED");
  const reopenedAfterMerge = flagged.filter((row) => row.state === "REOPENED-AFTER-MERGE");
  if (flagged.length === 0) {
    process.stdout.write(`OK  ${issues.length} of ${reportedCount} open issue(s) checked, no \`ready\` `
      + `or \`in-progress\` issue is already closed by a merged PR\n`);
    return 0;
  }
  for (const row of alreadyMerged) {
    process.stdout.write(`ALREADY-MERGED  #${row.number} "${row.title}" -- PR #${row.closedBy} merged and `
      + `declares \`Closes #${row.number}\`, but the row is still open and claims a live state\n`);
  }
  // #550: NOT counted toward the returned finding count -- this is not debris to close, it is a fix
  // someone deliberately put back after the merge that referenced it. "Nothing goes quiet" means it is
  // still printed on every run; it is just never the sentence that says a session should act on it.
  for (const row of reopenedAfterMerge) {
    process.stdout.write(`REOPENED-AFTER-MERGE  #${row.number} "${row.title}" -- PR #${row.closedBy} `
      + `merged ${row.mergedAt} and declared \`Closes #${row.number}\`, but the row was reopened `
      + `${row.reopenedAt}, AFTER that merge -- a refuted fix, not debris\n`);
  }
  if (alreadyMerged.length > 0) {
    process.stderr.write(`\n${alreadyMerged.length} open row(s) already shipped on main via a merged PR -- `
      + `picking one would mean discovering the fix already exists, and a claimed one is a session `
      + `credited with work that is done.\n`);
  }
  return alreadyMerged.length;
}

/**
 * Every check this audit performs, in the order it runs them. A LIST rather than six hand-written
 * `try` blocks, because those blocks each ended in `return` -- so ONE check that could not ask its
 * question silenced every check after it. Measured 2026-09-08: the board query needs a token that can
 * read Projects v2 and the workflow supplies `github.token`, which cannot, so three scheduled runs
 * reported nothing at all about closing PR references or dead claims -- questions that need no board
 * and would have answered fine.
 */

/**
 * Report #683's population: a CLOSED row whose claimant cannot be recovered.
 *
 * The label is gone by design -- `closedDebris` above fires on every closed row that still carries one --
 * but the EVENT that applied it is on the issue's own timeline forever, so a closed row still answers
 * "who worked this" and over what window. Measured 2026-09-09: 185 of 291 closed rows, and 77 of the 83
 * sitting behind a branch with no open PR.
 *
 * WHAT IS REPORTED IS THE GAP, NOT THE RECOVERY. Printing 185 provenance lines every run would bury the
 * six that need something done; the count of what WAS recovered is stated so a reader can tell an empty
 * finding list from an empty population, which is the same distinction `runCheck` draws one level up.
 *
 * A row here is UNATTRIBUTABLE, and that is a different sentence from "nobody claimed it" only because
 * the timeline was actually asked. Every one of the six is a hand claim (#673's shape) -- a row taken
 * with `gh issue edit` and no `session:` label, so there is no event to find and never was.
 */
function reportUnattributableClosedRows() {
  // THE FLOOR TRAVELS WITH THE QUESTION: the open rows' live `session:` labels are a population this
  // audit already reads, and every one of them must have the event that applied it. A short event log
  // would otherwise make this check's cleanest possible output -- "nothing unattributable" -- the thing
  // it prints when it read nothing at all.
  const rows = fetchClosedRowEvents({ openIssues: fetchOpenIssues() });
  const historical = unattributableClosedRows(rows);
  const gated = unattributableClosedRows(rows, { since: PROVENANCE_REQUIRED_FROM });
  const recovered = rows.length - historical.length;
  process.stdout.write(`${rows.length} closed row(s) read; ${recovered} name their claimant and the `
    + `window from the timeline, label or no label. ${historical.length} carry no claim event at all -- `
    + `rows claimed by hand before #673 closed that route, where no record was ever written and none can `
    + `be recovered.\n`);
  if (gated.length === 0) {
    process.stdout.write(`OK  every row closed since ${PROVENANCE_REQUIRED_FROM} names its claimant\n`);
    return 0;
  }
  for (const { number, title, closedAt, events } of gated) {
    process.stdout.write(`UNATTRIBUTABLE  #${number} "${title}" -- closed ${closedAt}, `
      + `${describeClaims(claimsFromEvents(events))}\n`);
  }
  process.stderr.write(`\n${gated.length} row(s) closed since ${PROVENANCE_REQUIRED_FROM} carry no claim `
    + `event, so nothing can say who worked them. A hand claim got past \`row-claim.mjs\` -- find who `
    + `pushed the branch named on the row and have them re-run \`row-claim.mjs claim\` against it, so the `
    + `next audit can read what this one could not.\n`);
  return gated.length;
}

/** @type {[string, () => number][]} */
export const CHECKS = [
  ["open issues", reportMutexViolations],
  ["hand claims", reportHandClaims],
  ["labelless rows", reportLabelless],
  ["declined rows", reportStrandedByIncompleteDecline],
  ["closed issues", reportClosedDebris],
  ["board membership", reportAbsentFromBoard],
  ["closing PR references", reportAlreadyMerged],
  ["claim activity", reportDeadClaims],
  ["closed-row provenance", reportUnattributableClosedRows],
];

/**
 * Runs one check. A check that THREW could not ask its question, which is a different answer from
 * "asked and found nothing" -- so it is recorded as a refusal and never counted as a clean zero.
 * @param {string} what @param {() => number} check @param {string[]} refused
 */
export function runCheck(what, check, refused) {
  try {
    return check();
  } catch (error) {
    process.stderr.write(`COULD NOT AUDIT ${what}: ${/** @type {Error} */ (error).message}\n`);
    refused.push(what);
    return 0;
  }
}

function main() {
  refuseUnknownFlags([], { entry: import.meta.url, command: "ready-label-audit" });
  /** @type {string[]} */
  const refused = [];
  let findings = 0;
  for (const [index, [what, check]] of CHECKS.entries()) {
    if (index > 0) process.stdout.write("\n");
    findings += runCheck(what, check, refused);
  }
  if (refused.length > 0) {
    process.stderr.write(`\n${refused.length} of ${CHECKS.length} check(s) could not run: `
      + `${refused.join(", ")}. The count above is a PARTIAL audit and must not be read as a clean `
      + "one -- an unasked question and a question answered `none` are different states.\n");
    process.exitCode = 2;
    return;
  }
  if (findings > 0) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) {
  main();
}
