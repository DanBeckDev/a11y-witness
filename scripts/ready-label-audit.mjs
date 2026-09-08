#!/usr/bin/env node
// @ts-check
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

export const READY_LABEL = "ready";

/**
 * Every label that already means "not actually pickable", independent of `ready`.
 *
 * `in-progress` belongs here for the reason `row-claim.mjs:161-170` names: `dispatchRow`/`claimRow` only
 * ever ADD labels, so a row still carrying `ready` at the moment it was dispatched comes out the other
 * side as `ready` + `in-progress` + `session:*` -- claimed and started, while still advertising itself as
 * pickable. #246: three real rows sat in exactly that state and this list could not see any of them,
 * because the string `in-progress` was never in it -- a correct predicate fed a list that cannot express
 * the fault, the `fleet-consistency`/`browserVersion` shape (CLAUDE.md).
 */
export const MUTEX_LABELS =
  ["fleet-gated", "disputed", "decision", "awaiting-merge", "blocked", "review-only", "in-progress"];

/**
 * @typedef {{ number: number, title: string, labels: string[] }} LabelledIssue
 */

/** @type {(cmd: string, args: string[]) => string} */
const defaultRun = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8" });

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
 * A label on a CLOSED row that means "pickable" or "claimed" -- not a contradiction to resolve, DEBRIS
 * nobody is going to act on. `ready`, `in-progress`, or any `session:*` label: a `session:` label on a
 * closed row is a claim with no holder, the exact state `decline` (#266/#268) exists for and which
 * nothing here prompts.
 * @param {string} label
 * @returns {boolean}
 */
export function isClosedDebrisLabel(label) {
  return label === READY_LABEL || label === "in-progress" || label.startsWith("session:");
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
 * Pure: which OPEN issues carrying `ready` have NO item on the Project board at all? Neither a label check
 * (the label is correct) nor a Status check (there is no item to read a Status from) can see this on its
 * own -- it is visible only as a comparison between the two populations. Measured 2026-09-08: four such
 * rows existed while the Ready lane read empty and idled a worker.
 * @param {LabelledIssue[]} openIssues
 * @param {Set<number>} boardNumbers issue numbers that have an item on the Project
 * @returns {LabelledIssue[]}
 */
export function readyRowsAbsentFromBoard(openIssues, boardNumbers) {
  return openIssues.filter((i) => i.labels.includes(READY_LABEL) && !boardNumbers.has(i.number));
}

/** Report the OPEN-row mutex check exactly as before #378 -- unchanged population, unchanged wording. */
function reportMutexViolations() {
  const issues = fetchOpenIssues();
  const violations = mutexViolations(issues);
  if (violations.length === 0) {
    process.stdout.write(`OK  ${issues.length} open issue(s) checked, none carry \`ready\` `
      + `with a not-pickable label\n`);
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
  process.stderr.write(`\n${debris.length} closed row(s) still carry a pickable/claimed label -- nobody `
    + `will act on these, but a Ready count taken by label rather than by state is wrong by `
    + `${readyOnClosed} because of them. Not a contradiction to resolve: stale bookkeeping for the `
    + `tracker owner to clear.\n`);
  return debris.length;
}

/**
 * Report the `ready`-labelled-but-off-the-board population #399 exists for -- a THIRD population,
 * separate from both label checks above, since neither a label comparison nor a Status comparison alone
 * can see a row with no Project item at all.
 */
function reportAbsentFromBoard() {
  const issues = fetchOpenIssues();
  const items = fetchBoardItems();
  const boardNumbers = new Set(
    /** @type {number[]} */ (items.map((i) => i.number).filter((n) => n !== null)),
  );
  const missing = readyRowsAbsentFromBoard(issues, boardNumbers);
  if (missing.length === 0) {
    process.stdout.write(`OK  every open \`ready\` issue has an item on Project ${PROJECT_NUMBER}\n`);
    return 0;
  }
  for (const { number, title } of missing) {
    process.stdout.write(`ABSENT  #${number} "${title}" -- carries \`ready\` and is not on the board at all\n`);
  }
  process.stderr.write(`\n${missing.length} \`ready\` row(s) have no Project item -- the Ready lane cannot `
    + `show these even though they are pickable.\n`);
  return missing.length;
}

function main() {
  refuseUnknownFlags([], { entry: import.meta.url, command: "ready-label-audit" });
  let mutexCount, debrisCount, absentCount;
  try {
    mutexCount = reportMutexViolations();
  } catch (error) {
    process.stderr.write(`COULD NOT AUDIT open issues: ${/** @type {Error} */ (error).message}\n`);
    process.exitCode = 2;
    return;
  }
  process.stdout.write("\n");
  try {
    debrisCount = reportClosedDebris();
  } catch (error) {
    process.stderr.write(`COULD NOT AUDIT closed issues: ${/** @type {Error} */ (error).message}\n`);
    process.exitCode = 2;
    return;
  }
  process.stdout.write("\n");
  try {
    absentCount = reportAbsentFromBoard();
  } catch (error) {
    process.stderr.write(`COULD NOT AUDIT board membership: ${/** @type {Error} */ (error).message}\n`);
    process.exitCode = 2;
    return;
  }
  if (mutexCount > 0 || debrisCount > 0 || absentCount > 0) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) {
  main();
}
