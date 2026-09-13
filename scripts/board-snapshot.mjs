#!/usr/bin/env node
// @ts-check
// command: snapshot every Project item before any board-mutating call, so a bad mutation is recoverable
// EVERY BOARD MUTATION GOES THROUGH ONE WRAPPER, AND IT SNAPSHOTS FIRST -- issue #399.
//
// 2026-09-08, 00:0xZ: adding one Status option with `updateProjectV2Field` and a full
// `singleSelectOptions` list REPLACED THE WHOLE OPTION SET -- every option was re-issued with a new id and
// every one of the Project's 112 items' Status assignment was dropped in one call:
//
//   status distribution after:  {'(NONE)': 112}
//
// Recovered completely (`restored: 112, failed: 0`) and the snapshot that made that possible existed by
// LUCK -- it had been taken minutes earlier to report a before/after count, not as a backup. Run the
// mutation first and 112 Status values across four months of tracker history would have been
// unrecoverable, with nobody able to say what they had been. A mutation named `update...Field` that
// silently rewrites its siblings is this repo's own class of defect: reading an API's surface rather than
// its behaviour.
//
// So: `withBoardSnapshot(mutate)` snapshots every item's number/title/Status to
// `runs/board-snapshots/<stamp>.json` -- printing the path, since an unprinted backup is one nobody can
// find under pressure -- and REFUSES to call `mutate` at all if the snapshot did not write. `runs/` is
// gitignored on purpose: a snapshot is a recovery artefact, not history: the tracker itself is the record.
//
// #1275: A MUTATION THAT NAMES THE ITEM IT TOUCHES SNAPSHOTS THAT ITEM, NOT THE BOARD. Every board mutation in
// `scripts/` is one item's Status (`row-claim.mjs`'s `moveProjectStatus`); #399's accident was a FIELD rewrite
// that no script sends. A full sweep before each one-item edit cost 6 GraphQL pages at 555 items plus the
// ready-issue list, and the account's GraphQL budget ran out twice on 2026-09-13. The full sweep stays for an
// unscoped call, for this file's CLI and for `ready-label-audit.mjs` -- which is where #1219/#1228's census
// still prints.
import { execFileSync } from "node:child_process";
// #1219: PURE, and deliberately in its own module -- see that file's header. Importing it here costs
// nothing; importing THIS file from a test costs a `token` requirement the acceptance job cannot meet.
import { statusContradictions, statusCensus } from "./board-status-health.mjs";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { refuseUnknownFlags } from "../packages/worker-fleet/src/cli-flags.mjs";
import { REPO } from "./repo-identity.mjs";
import { READY_LABEL } from "./claim-labels.mjs";

export const PROJECT_OWNER = REPO.split("/")[0];
export const PROJECT_NUMBER = 2;
export const SNAPSHOT_DIR = "runs/board-snapshots";

/**
 * #852: ONE SWEEP PER PROCESS, AND THE BOUND IS WHAT MAKES THAT SAYABLE.
 *
 * Every Status move used to sweep the whole board first. Measured on this branch with an injected `run`,
 * against a 257-item board (3 pages at `items(first: 100)`):
 *
 *   1 move   ->  3 board pages, 1 item-edit, 5 gh calls
 *   3 moves  ->  9 board pages, 3 item-edits, 15 gh calls
 *   20 moves -> 60 board pages, 20 item-edits, 100 gh calls
 *
 * The page count grows with the board, so every row added made every future claim more expensive. On
 * 2026-09-13 the org exhausted its 5,000-point GraphQL budget while REST still had 4,641 left, and this
 * is the largest GraphQL consumer in the claim path -- the budget line the row said to wait for.
 *
 * THE TRADE, STATED RATHER THAN HIDDEN. The snapshot now describes the board before the FIRST mutation of
 * this process, not before each one, so an operator reading it as "the state immediately before THIS
 * change" is reading more than it says. **The age bound is what keeps the weaker claim precise**: after
 * five minutes the next mutation takes a fresh sweep, so the record is never more than five minutes older
 * than the change it covers, and the file and the log line both say which. #399's guarantee -- that a
 * mutation cannot proceed without a real snapshot on disk -- is untouched: a failed write still throws
 * before `mutate` is called.
 */
export const SNAPSHOT_MAX_AGE_MS = 5 * 60 * 1000;

/** @type {{ path: string, takenAt: Date } | null} The snapshot this process has already taken. */
let processSnapshot = null;

/**
 * #1275: the SCOPED snapshots this process has taken, by the issue each one covers. Kept apart from
 * `processSnapshot` because a scoped file describes its own items and must never license a mutation of another.
 * @type {Map<number, { path: string, takenAt: Date }>}
 */
const scopedSnapshots = new Map();

/** @type {(cmd: string, args: string[]) => string} */
const defaultRun = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8" });

const ITEMS_QUERY = `
  query($owner: String!, $number: Int!, $cursor: String) {
    user(login: $owner) {
      projectV2(number: $number) {
        items(first: 100, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id
            content { ... on Issue { number title state } }
            fieldValues(first: 20) {
              nodes {
                ... on ProjectV2ItemFieldSingleSelectValue {
                  name
                  field { ... on ProjectV2FieldCommon { name } }
                }
              }
            }
          }
        }
      }
    }
  }
`;

/**
 * #1275: ONE ISSUE'S ITEM ON THIS PROJECT, AND THE PROJECT ITSELF, IN ONE REQUEST.
 *
 * `user.projectV2` is asked for although only its presence is read. CI's token cannot read the user-owned
 * Project (#546), and the close path classifies that refusal by GraphQL's own
 * `NOT_FOUND (user.projectV2): Could not resolve to a ProjectV2 with the number N` (`settle-closed-status.mjs`'s
 * `refusalCause`). Measured live 2026-09-13 with project 999: exit 1, `data.user.projectV2: null`, and exactly
 * that error, while `repository.issue` still answered. What a token that cannot see the Project gets back for
 * `projectItems` ALONE is not measured -- this host's token can read it -- so the Project is named in the request,
 * where its refusal is already classified, rather than inferred from an item list.
 *
 * `totalCount` is asked for so a list shorter than its own count refuses rather than reads as "not on the board".
 */
export const TOUCHED_ITEM_QUERY = `
  query($owner: String!, $name: String!, $project: Int!, $issue: Int!) {
    user(login: $owner) { projectV2(number: $project) { id } }
    repository(owner: $owner, name: $name) {
      issue(number: $issue) {
        number title state
        projectItems(first: 10) {
          totalCount
          nodes {
            id
            project { number }
            fieldValueByName(name: "Status") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
          }
        }
      }
    }
  }
`;

/**
 * @typedef {{ itemId: string, number: number | null, title: string | null, status: string | null,
 *   state: string | null }} BoardItem
 *
 * #1219: `state` was NOT fetched until this row, and that is why the health check could never have
 * asked whether a CLOSED row advertises live work. It is not that the check was one-directional --
 * the field that would answer the other direction was never requested, so the question could not be
 * asked at all. A filter on a field nobody fetched, in the instrument watching for exactly this.
 */

/**
 * @typedef {{ type: string, message: string, path: string | null }} GraphqlError
 */

/**
 * Extracts GraphQL's own `errors` array from a parsed response, if present -- #555. `type`/`message`/
 * `path` are the three fields that distinguish FOUR different causes (no permission, wrong project id,
 * user-vs-org shape, a query the schema rejects) which otherwise all read as the identical, unactionable
 * "could not read Project N items" -- #546 sat three hours on exactly that sentence.
 *
 * Returns `null` for an absent, non-array, or empty `errors` field -- so a caller can `if (errors)` rather
 * than checking `.length` itself at every call site.
 *
 * @param {unknown} parsed
 * @returns {GraphqlError[] | null}
 */
function graphqlErrors(parsed) {
  const errors = /** @type {any} */ (parsed)?.errors;
  if (!Array.isArray(errors) || errors.length === 0) return null;
  return errors.map((/** @type {any} */ e) => ({
    type: typeof e?.type === "string" ? e.type : "UNKNOWN",
    message: typeof e?.message === "string" ? e.message : JSON.stringify(e).slice(0, 200),
    path: Array.isArray(e?.path) ? e.path.join(".") : null,
  }));
}

/** One `type: message (path)` line per error, joined -- the string every refusal below actually prints. */
function describeGraphqlErrors(/** @type {GraphqlError[]} */ errors) {
  return errors.map((e) => `${e.type}${e.path ? ` (${e.path})` : ""}: ${e.message}`).join("; ");
}

/**
 * One page of `gh api graphql`'s response, parsed into `BoardItem[]` plus pagination state. THROWS on any
 * shape it does not recognise -- same discipline as `ready-label-audit.mjs`'s `fetchIssues`: a snapshot
 * that silently records fewer items than the board actually holds is worse than one that refuses outright,
 * because it looks complete.
 *
 * #555: CHECKS FOR `errors` BEFORE TRUSTING `data` AT ALL, even on the exit-0 path that reaches this
 * function -- GraphQL can return a 200 carrying `data` AND `errors` together, with `nodes` full of `null`
 * exactly where the token could count an item but not read it. A caller checking only for `data` being
 * present would read that as "N items, all empty", which is the partial-board-wearing-a-complete-one's-
 * clothes shape this whole file exists to prevent, arriving through the `errors` array instead of a
 * non-zero exit -- so this is checked whether or not `run()` itself threw.
 * @param {string} raw
 * @returns {{ items: BoardItem[], hasNextPage: boolean, endCursor: string | null }}
 */
function parsePage(raw) {
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw new Error(`board-snapshot: gh's response was not JSON -- refusing to guess. `
      + `First 200 chars: ${raw.slice(0, 200)}`, { cause });
  }
  const errors = graphqlErrors(parsed);
  if (errors) {
    throw new Error(`board-snapshot: GraphQL returned an error alongside its response -- refusing to `
      + `treat a partial answer as complete, even though the request otherwise succeeded. `
      + `${describeGraphqlErrors(errors)}`);
  }
  const itemsNode = /** @type {any} */ (parsed)?.data?.user?.projectV2?.items;
  if (!itemsNode || !Array.isArray(itemsNode.nodes) || !itemsNode.pageInfo) {
    throw new Error(`board-snapshot: gh's response did not have the shape data.user.projectV2.items -- `
      + `refusing to guess. Got: ${JSON.stringify(parsed).slice(0, 300)}`);
  }
  const items = itemsNode.nodes.map((/** @type {unknown} */ node, /** @type {number} */ i) => {
    const n = /** @type {any} */ (node);
    if (typeof n?.id !== "string") {
      throw new Error(`board-snapshot: item ${i} has no id -- refusing to guess. `
        + `Got: ${JSON.stringify(node).slice(0, 300)}`);
    }
    const statusValue = Array.isArray(n.fieldValues?.nodes)
      ? n.fieldValues.nodes.find((/** @type {any} */ v) => v?.field?.name === "Status")
      : undefined;
    return {
      itemId: n.id,
      // A draft item (no linked issue) carries `content: null` -- recorded with `number: null` rather
      // than dropped, because a snapshot that silently drops rows is exactly the defect this file exists
      // to prevent.
      number: typeof n.content?.number === "number" ? n.content.number : null,
      title: typeof n.content?.title === "string" ? n.content.title : null,
      status: typeof statusValue?.name === "string" ? statusValue.name : null,
      // #1219: null for a draft item, which has no issue and therefore no state. NOT defaulted to
      // "OPEN" -- a draft and an open issue are different things, and `statusContradictions`
      // classifies an unknown state as neither offender rather than guessing.
      state: typeof n.content?.state === "string" ? n.content.state : null,
    };
  });
  return {
    items,
    hasNextPage: itemsNode.pageInfo.hasNextPage === true,
    endCursor: typeof itemsNode.pageInfo.endCursor === "string" ? itemsNode.pageInfo.endCursor : null,
  };
}

/**
 * `execFileSync` throws on a non-zero exit, but `gh api graphql` still writes the full response body --
 * `errors` included -- to stdout first, and Node's thrown error carries it verbatim on `.stdout` (a plain
 * string, since `defaultRun` passes `encoding: "utf8"`). Measured directly: a request naming a repository
 * that does not resolve exits 1 with `{"data":{...},"bad":null},"errors":[{"type":"NOT_FOUND",...}]}` on
 * `.stdout`. So a non-zero exit does not mean the API's own answer is lost -- only that nobody had read it
 * yet. Returns `null` (never throws) for anything that is not a parseable GraphQL error body, so the
 * caller can fall back to the plain exit failure honestly rather than inventing a cause.
 * @param {unknown} failure the thrown value from a failed `run()` call
 * @returns {string | null}
 */
function graphqlErrorFromFailedRun(failure) {
  const stdout = /** @type {any} */ (failure)?.stdout;
  if (typeof stdout !== "string" || stdout.length === 0) return null;
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return null;
  }
  const errors = graphqlErrors(parsed);
  return errors ? describeGraphqlErrors(errors) : null;
}

/**
 * #1275: one touched issue's raw response, parsed, with GraphQL's own `errors` refused before `data` is trusted
 * -- a 200 can carry both (#555), and so can the non-zero exit's stdout.
 * @param {string} raw @param {number} issueNumber
 * @returns {unknown}
 */
function parseTouchedResponse(raw, issueNumber) {
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw new Error(`board-snapshot: gh's response for #${issueNumber} was not JSON -- refusing to guess. `
      + `First 200 chars: ${raw.slice(0, 200)}`, { cause });
  }
  const errors = graphqlErrors(parsed);
  if (errors) {
    throw new Error(`board-snapshot: could not read Project ${PROJECT_NUMBER}'s item for #${issueNumber} -- `
      + "GraphQL returned an error alongside its response, and a partial answer is not a snapshot. "
      + describeGraphqlErrors(errors));
  }
  return parsed;
}

/**
 * #1275: the `repository.issue` node of one touched issue's response, its `projectItems` complete. THROWS on
 * anything else, with `parsePage`'s discipline (#555): `errors` beside `data` is refused before `data` is
 * trusted, and the answer must be about the issue that was asked for.
 * @param {string} raw @param {number} issueNumber
 * @returns {any}
 */
function touchedIssue(raw, issueNumber) {
  const parsed = parseTouchedResponse(raw, issueNumber);
  const data = /** @type {any} */ (parsed)?.data;
  const issue = data?.repository?.issue;
  const itemsNode = issue?.projectItems;
  if (typeof data?.user?.projectV2?.id !== "string" || issue?.number !== issueNumber
    || !Array.isArray(itemsNode?.nodes) || typeof itemsNode.totalCount !== "number") {
    throw new Error(`board-snapshot: gh's response for #${issueNumber} did not have the shape `
      + "data.user.projectV2 + data.repository.issue.projectItems for that issue -- refusing to guess. "
      + `Got: ${JSON.stringify(parsed).slice(0, 300)}`);
  }
  if (itemsNode.nodes.length < itemsNode.totalCount) {
    throw new Error(`board-snapshot: #${issueNumber}'s project items came back ${itemsNode.nodes.length} of `
      + `${itemsNode.totalCount} -- refusing to read a partial list as "not on the board".`);
  }
  return issue;
}

/**
 * #1275: one touched issue's item on this Project, or `null` when the issue is not on it. `null` is a recorded
 * outcome, not a refusal: the mutation still runs, and `gh` names the row as not on the board, which
 * `moveProjectStatus` already reads as `notOnBoard`.
 * @param {string} raw @param {number} issueNumber
 * @returns {BoardItem | null}
 */
function parseTouchedItem(raw, issueNumber) {
  const issue = touchedIssue(raw, issueNumber);
  const node = issue.projectItems.nodes.find((/** @type {any} */ n) => n?.project?.number === PROJECT_NUMBER);
  if (node === undefined) return null;
  if (typeof node?.id !== "string") {
    throw new Error(`board-snapshot: #${issueNumber}'s item has no id -- refusing to guess. `
      + `Got: ${JSON.stringify(node).slice(0, 300)}`);
  }
  return {
    itemId: node.id,
    number: issue.number,
    title: typeof issue.title === "string" ? issue.title : null,
    status: typeof node.fieldValueByName?.name === "string" ? node.fieldValueByName.name : null,
    state: typeof issue.state === "string" ? issue.state : null,
  };
}

/**
 * #1275: THE ITEMS A MUTATION TOUCHES, ONE REQUEST EACH, AND NOTHING ELSE ON THE BOARD. No #747 floor here: that
 * floor exists because `fieldValues` is narrowed to a budget shared with the other items in a 100-item page, and
 * a single issue's `fieldValueByName` shares its request with nothing. `gh` failing THROWS, quoting GraphQL's own
 * error when the failed process printed one (#555).
 * @param {number[]} issueNumbers
 * @param {{ run?: typeof defaultRun }} [deps]
 * @returns {{ items: BoardItem[], notOnBoard: number[] }}
 */
export function fetchTouchedItems(issueNumbers, { run = defaultRun } = {}) {
  const name = REPO.split("/")[1];
  /** @type {BoardItem[]} */
  const items = [];
  /** @type {number[]} */
  const notOnBoard = [];
  for (const issue of issueNumbers) {
    /** @type {string} */
    let raw;
    try {
      raw = run("gh", ["api", "graphql", "-f", `query=${TOUCHED_ITEM_QUERY}`, "-f", `owner=${PROJECT_OWNER}`,
        "-f", `name=${name}`, "-F", `project=${PROJECT_NUMBER}`, "-F", `issue=${issue}`]);
    } catch (cause) {
      const graphqlDetail = graphqlErrorFromFailedRun(cause);
      throw new Error(`board-snapshot: could not read Project ${PROJECT_NUMBER}'s item for #${issue} -- refusing `
        + `to mutate without a snapshot. ${graphqlDetail ?? /** @type {Error} */ (cause).message}`, { cause });
    }
    const item = parseTouchedItem(raw, issue);
    if (item) items.push(item);
    else notOnBoard.push(issue);
  }
  return { items, notOnBoard };
}

/**
 * Every OPEN issue carrying `ready` -- the independent population #747's floor checks the snapshot
 * against. Read with a PLAIN top-level `gh issue list`, deliberately never nested inside another
 * connection: the narrowing measured on `fieldValues` (and on `claim-provenance.mjs`'s own #683
 * measurement of a nested `timelineItems`) only happens to a connection sharing a budget with sibling
 * rows in the SAME request, and a bare `issues(first: N)` at the top level is not that shape.
 *
 * Same truncation discipline as `ready-label-audit.mjs`'s `fetchIssues`: returning exactly `limit` rows
 * is indistinguishable from a truncated result, so that is refused rather than reported as complete.
 *
 * @param {{ run?: typeof defaultRun, limit?: number }} [deps]
 * @returns {number[]}
 */
export function fetchReadyIssueNumbers({ run = defaultRun, limit = 500 } = {}) {
  /** @type {string} */
  let raw;
  try {
    raw = run("gh", ["issue", "list", "--repo", REPO, "--state", "open", "--label", READY_LABEL,
      "--limit", String(limit), "--json", "number"]);
  } catch (cause) {
    throw new Error(`board-snapshot: could not list open ${READY_LABEL} issues from ${REPO} -- refusing `
      + `to guess whether the snapshot's Status coverage is complete. `
      + `${/** @type {Error} */ (cause).message}`, { cause });
  }
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw new Error(`board-snapshot: gh's ${READY_LABEL}-issue list was not JSON -- refusing to guess. `
      + `First 200 chars: ${raw.slice(0, 200)}`, { cause });
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`board-snapshot: gh's ${READY_LABEL}-issue list was not a list -- refusing to guess. `
      + `Got: ${JSON.stringify(parsed).slice(0, 300)}`);
  }
  if (parsed.length === limit) {
    throw new Error(`board-snapshot: gh returned exactly the requested limit (${limit}) of open `
      + `${READY_LABEL} issues -- indistinguishable from a truncated result, refusing to check the `
      + `snapshot's Status coverage against a partial population. Raise the limit.`);
  }
  return parsed.map((/** @type {unknown} */ entry, /** @type {number} */ i) => {
    const number = /** @type {{ number?: unknown }} */ (entry)?.number;
    if (typeof number !== "number") {
      throw new Error(`board-snapshot: ${READY_LABEL}-issue list entry ${i} has no number -- refusing `
        + `to guess. Got: ${JSON.stringify(entry).slice(0, 300)}`);
    }
    return number;
  });
}

/**
 * THE FLOOR #747 ADDS. `fieldValues` carries no `totalCount` at all, so nothing inside a single
 * response can ever prove GitHub did not narrow it to fit a budget shared with the OTHER items in the
 * same page -- exactly the shape `claim-provenance.mjs` measured on #683's nested `timelineItems`
 * (nodes agreeing with totalCount while both were narrowed together). An independently-derived
 * population -- every open `ready` issue, read by a query that is not nested -- is the only thing that
 * can catch it: pure, so it is driven with real shapes rather than asserted against this file's text.
 *
 * `excludeIssueNumber`, ADDED AFTER A LIVE SELF-TRIP (#891, filed live 2026-09-09, ceo's diagnosis):
 * this floor exists to catch a `ready` row that has silently LOST its Status somewhere -- neglect. It is
 * not that when the row's own filer passed a real `gh issue create -l ready` flag straight through
 * (row-file's own `--ready` sentinel is a SEPARATE, later convention -- see row-file.mjs's own #844/#883
 * comments -- and nothing stops a caller using gh's real flag instead), the issue already carried `ready`
 * by the time `gh project item-add` ran, so THIS call's own pre-write snapshot caught the very row it was
 * about to fix and refused, always, on itself -- the #872/#867 self-trip shape recurring through a second
 * door "label lands last" never closed, because it only ever controlled row-file's OWN label-add call.
 * The row currently having its Status set by the call this floor is protecting is not evidence of
 * neglect; it is the reason the call exists. Every OTHER ready row missing its Status is unaffected --
 * this excludes at most the one issue number the caller names, never a class.
 *
 * @param {BoardItem[]} items
 * @param {number[]} readyIssueNumbers
 * @param {number | null} [excludeIssueNumber] a row's own Status-setting call must not be refused by the
 *   very absence of Status it is about to fix -- `null` (the default) excludes nothing, for every other
 *   caller (a plain snapshot, an audit) that must still see every row honestly
 * @returns {number[]} the ready issue numbers with no Status in `items` (including one missing entirely)
 */
export function readyRowsMissingStatus(items, readyIssueNumbers, excludeIssueNumber = null) {
  const statusByNumber = new Map(
    items.filter((i) => i.number !== null).map((i) => [i.number, i.status]));
  return readyIssueNumbers.filter((n) => n !== excludeIssueNumber && statusByNumber.get(n) == null);
}

/**
 * Every item currently on the board. Paginated -- #399 measured 117 items on Project 2, comfortably past
 * one page of 100. `gh` failing, or answering with a shape this function does not recognise, THROWS: it
 * never falls through to a partial or empty list, which would let a snapshot claim completeness having
 * examined only some of the board.
 *
 * #747: ALSO REFUSES if any open `ready` row comes back with no Status -- `fieldValues(first: 20)` is
 * nested inside `items(first: 100)` above, the one shape GitHub narrows to a shared budget without ever
 * reporting it (no `totalCount` on `fieldValues` to compare against `nodes.length`, unlike the items
 * connection itself). This is the check that makes a truncated read refuse rather than look complete;
 * every caller of this function -- `writeBoardSnapshot`, and `ready-label-audit.mjs`'s own
 * board-membership check, which reads through this exact query -- inherits it for free.
 *
 * `excludeIssueNumber` -- see `readyRowsMissingStatus`'s own header (#891) -- passed through unchanged so
 * a caller boarding ONE specific issue can exempt only that issue from the floor while it is mid-fix.
 *
 * @param {{ run?: typeof defaultRun, fetchReady?: typeof fetchReadyIssueNumbers,
 *   excludeIssueNumber?: number | null }} [deps]
 * @returns {BoardItem[]}
 */
export function fetchBoardItems({ run = defaultRun, fetchReady = fetchReadyIssueNumbers,
  excludeIssueNumber = null } = {}) {
  /** @type {BoardItem[]} */
  const items = [];
  /** @type {string | null} */
  let cursor = null;
  for (;;) {
    const args = ["api", "graphql", "-f", `query=${ITEMS_QUERY}`, "-f", `owner=${PROJECT_OWNER}`,
      "-F", `number=${PROJECT_NUMBER}`];
    if (cursor) args.push("-f", `cursor=${cursor}`);
    let raw;
    try {
      raw = run("gh", args);
    } catch (cause) {
      // #555: THE GRAPHQL ERROR, WHEN ONE EXISTS, NOT JUST THE COMMAND'S EXIT MESSAGE -- "could not read
      // Project 2 items" is compatible with no permission, a wrong project number, a user-vs-org shape
      // mismatch, or a query the schema rejects, and #546 sat three hours on that ambiguity. `gh`'s own
      // exit message never carries the API's answer; the FAILED PROCESS's stdout does.
      const graphqlDetail = graphqlErrorFromFailedRun(cause);
      throw new Error(`board-snapshot: could not read Project ${PROJECT_NUMBER} items -- refusing to `
        + `snapshot a partial board. ${graphqlDetail ?? /** @type {Error} */ (cause).message}`, { cause });
    }
    const page = parsePage(raw);
    items.push(...page.items);
    if (!page.hasNextPage) break;
    cursor = page.endCursor;
  }
  const readyNumbers = fetchReady({ run });
  const missing = readyRowsMissingStatus(items, readyNumbers, excludeIssueNumber);
  if (missing.length > 0) {
    throw new Error(`board-snapshot: ${missing.length} open ${READY_LABEL} row(s) came back with no `
      + `Status -- refusing to report this snapshot as complete. This is the snapshot reading short, `
      + `not the board being wrong (#747: fieldValues has no totalCount to check itself, so this is `
      + `read against an independent population instead): #${missing.join(", #")}`);
  }
  // #1219: THE CONTRADICTIONS ARE REPORTED, NOT REFUSED -- and that is a decision, not a softer guard.
  //
  // Measured when this landed: 311 closed rows at a live Status, 220 of them at `In progress`. A throw
  // would brick every snapshot and every row-filing that takes one, until somebody moved 311 rows by
  // hand -- so the guard would be removed within the hour rather than obeyed. The same trade #1158 made
  // for directory Regions and `buildAssertion` makes for an undeclared pin: a refusal that blocks the
  // repair path is not a stricter guard, it is an absent one.
  //
  // It is LOUD on every snapshot instead, and it names the count. The row's own ordering is guard first,
  // then the move -- moving them before this existed would mean doing it twice.
  const contradictions = statusContradictions(items);
  const { closedButLive, openButDone, closedUnboarded } = contradictions;
  if (closedButLive.length > 0 || openButDone.length > 0 || closedUnboarded.length > 0) {
    process.stderr.write(`board-snapshot: ${closedButLive.length} CLOSED row(s) advertise `
      + `a live Status, ${openButDone.length} OPEN row(s) advertise Done, and ${closedUnboarded.length} `
      + `CLOSED row(s) carry NO Status at all. A closed row at a live column is finished work a session `
      + `reading the board will take as available; a closed row with no Status is invisible to a check `
      + `that reads Statuses, which is why it is counted separately (#1228).\n`
      + `${statusCensus(items)}\n`);
  }
  return items;
}

/**
 * A filesystem-safe stamp for a snapshot filename, derived from a real timestamp so two snapshots taken
 * seconds apart never collide and a reader can sort them by name.
 * @param {Date} date
 * @returns {string}
 */
export function snapshotStamp(date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

/**
 * Fetches every board item and writes it to `runs/board-snapshots/<stamp>.json`, PRINTING the path --
 * whether via the returned value (callers) or `console.log` (the CLI below) -- because an unprinted backup
 * is one nobody can find under pressure. THROWS, rather than swallowing, if the fetch or the write fails:
 * the whole point of this function is that a caller who cannot get a real snapshot must not proceed to the
 * mutation it was meant to protect.
 *
 * @param {{ run?: typeof defaultRun, fetchReady?: typeof fetchReadyIssueNumbers,
 *   writeFile?: (path: string, data: string) => void,
 *   mkdir?: (path: string) => void, now?: () => Date, excludeIssueNumber?: number | null }} [deps]
 * @returns {string} the path written
 */
export function writeBoardSnapshot({
  run = defaultRun,
  fetchReady = fetchReadyIssueNumbers,
  writeFile = (path, data) => writeFileSync(path, data, "utf8"),
  mkdir = (path) => mkdirSync(path, { recursive: true }),
  now = () => new Date(),
  excludeIssueNumber = null,
} = {}) {
  const items = fetchBoardItems({ run, fetchReady, excludeIssueNumber });
  const takenAt = now();
  const path = `${SNAPSHOT_DIR}/${snapshotStamp(takenAt)}.json`;
  const snapshot = {
    takenAt: takenAt.toISOString(),
    // #852: SAYS WHAT IT IS, so a reader cannot infer the stronger guarantee from its presence. One
    // sweep per process now covers every board mutation that process makes within SNAPSHOT_MAX_AGE_MS,
    // so this file is the board before the FIRST of them -- not before each.
    takenBefore: "the first board mutation of this process; later mutations within "
      + `${SNAPSHOT_MAX_AGE_MS / 1000}s reuse this snapshot rather than taking their own (#852)`,
    project: { owner: PROJECT_OWNER, number: PROJECT_NUMBER },
    items,
  };
  persistSnapshot(path, snapshot, { writeFile, mkdir });
  return path;
}

/**
 * Writes a snapshot, or THROWS the refusal every caller relies on: no snapshot on disk, no mutation (#399).
 * @param {string} path @param {object} snapshot
 * @param {{ writeFile: (path: string, data: string) => void, mkdir: (path: string) => void }} io
 */
function persistSnapshot(path, snapshot, { writeFile, mkdir }) {
  try {
    mkdir(SNAPSHOT_DIR);
    writeFile(path, JSON.stringify(snapshot, null, 2));
  } catch (cause) {
    throw new Error(`board-snapshot: could not write the snapshot to ${path} -- refusing to proceed with `
      + `an unsnapshotted board mutation. ${/** @type {Error} */ (cause).message}`, { cause });
  }
}

/**
 * #1275: the items `issueNumbers` name, written to `runs/board-snapshots/<stamp>-issue-<n>.json` -- the issue in
 * the name so two moves a millisecond apart never overwrite each other. THROWS if the read or the write fails,
 * exactly as `writeBoardSnapshot` does: the guarantee is #399's, scoped to the write it covers.
 * @param {number[]} issueNumbers
 * @param {{ run?: typeof defaultRun, writeFile?: (path: string, data: string) => void,
 *   mkdir?: (path: string) => void, now?: () => Date }} [deps]
 * @returns {string} the path written
 */
export function writeScopedSnapshot(issueNumbers, {
  run = defaultRun,
  writeFile = (path, data) => writeFileSync(path, data, "utf8"),
  mkdir = (path) => mkdirSync(path, { recursive: true }),
  now = () => new Date(),
} = {}) {
  const { items, notOnBoard } = fetchTouchedItems(issueNumbers, { run });
  const takenAt = now();
  const path = `${SNAPSHOT_DIR}/${snapshotStamp(takenAt)}-issue-${issueNumbers.join("-")}.json`;
  persistSnapshot(path, {
    takenAt: takenAt.toISOString(),
    // SAYS WHAT IT IS, as #852's file does: a reader must not take a scoped file for the board.
    takenBefore: `the board mutation of #${issueNumbers.join(", #")} -- SCOPED to the item(s) that mutation `
      + "touches, not the whole board (#1275). A later mutation of the same item(s) in this process within "
      + `${SNAPSHOT_MAX_AGE_MS / 1000}s reuses it; a mutation of any other item takes its own`,
    scope: { issues: issueNumbers },
    project: { owner: PROJECT_OWNER, number: PROJECT_NUMBER },
    items,
    notOnBoard,
  }, { writeFile, mkdir });
  return path;
}

/**
 * Wrap a board-mutating call so it can only run once a real snapshot has been written. `mutate` is never
 * invoked if `writeBoardSnapshot` throws -- that is the whole guarantee this file exists to give, and
 * `board-snapshot.test.ts`'s mutation check proves it by making the write fail and asserting `mutate` was
 * never called.
 *
 * @template T
 * `excludeIssueNumber` passes straight through to `writeBoardSnapshot` (see `readyRowsMissingStatus`'s
 * own header, #891) -- deliberately NOT destructured out alongside `log` above: this function has no
 * opinion on it, it is `moveProjectStatus`'s to set when `mutate` is specifically fixing that one issue's
 * own Status.
 *
 * #1275: `touches` names the issue(s) `mutate` changes. Given, the snapshot is SCOPED to those items -- one
 * request each -- unless a full snapshot this process already holds is still valid (#852's reuse). Absent, the
 * full sweep runs as before. An empty or non-integer `touches` refuses: a mutation cannot touch nothing.
 *
 * @param {() => T} mutate the actual board-mutating call
 * @param {{ run?: typeof defaultRun, fetchReady?: typeof fetchReadyIssueNumbers,
 *   writeFile?: (path: string, data: string) => void, mkdir?: (path: string) => void, now?: () => Date,
 *   log?: (line: string) => void, exists?: (path: string) => boolean,
 *   excludeIssueNumber?: number | null, touches?: number | number[] }} [deps]
 * @returns {T}
 */
export function withBoardSnapshot(mutate, deps = {}) {
  const { log = (line) => process.stdout.write(`${line}\n`), exists = existsSync, touches, ...snapshotDeps } = deps;
  const issues = touches === undefined ? null : [touches].flat();
  if (issues !== null && (issues.length === 0 || !issues.every((issue) => Number.isInteger(issue)))) {
    throw new Error(`board-snapshot: \`touches\` must name the issue(s) this mutation changes, got `
      + `${JSON.stringify(touches)} -- refusing to guess what it touches. Nothing was mutated.`);
  }
  const now = snapshotDeps.now ?? (() => new Date());
  const at = now();
  /** @param {{ path: string, takenAt: Date } | null | undefined} snapshot */
  const stillValid = (snapshot) => snapshot != null && exists(snapshot.path)
    && at.getTime() - snapshot.takenAt.getTime() < SNAPSHOT_MAX_AGE_MS;
  const held = processSnapshot;
  // #852 REUSE RE-READS THE DISK RATHER THAN TRUSTING A REMEMBERED PATH.
  //
  // worker-judge's blocker on #1281, driven: the snapshot was written, `rm -rf runs/` took it, and the
  // next mutation proceeded with nothing behind it. `runs/` is gitignored, so `git clean -xdf` removes
  // it too, and `rm -rf runs/` appears three times in this repo's own comments as a scenario worth
  // defending a corpus from. WITHOUT THIS CHECK THE GUARANTEE MOVES FROM MUTATION TIME TO SWEEP TIME --
  // true of a process's first mutation and false of every reused one, which is not what #399 promises.
  if (held !== null && stillValid(held)) {
    log(`board-snapshot: reusing ${held.path}, taken ${describeAge(at, held.takenAt)} before this `
      + "mutation -- one sweep per process (#852)");
    return mutate();
  }
  if (issues !== null) {
    const { run, writeFile, mkdir } = snapshotDeps;
    return withScopedSnapshot(mutate, issues, { log, stillValid, at, now, run, writeFile, mkdir });
  }
  const path = writeBoardSnapshot({ ...snapshotDeps, now });
  processSnapshot = { path, takenAt: at };
  log(`board-snapshot: wrote ${path} before mutating`);
  return mutate();
}

/**
 * #1275: the scoped half of `withBoardSnapshot`. Reuses this process's snapshot of EVERY touched issue while each
 * is on disk and inside the bound -- the #852 disk re-read, applied per item -- and otherwise reads and writes
 * just those items.
 * @template T
 * @param {() => T} mutate @param {number[]} issues
 * @param {{ log: (line: string) => void, at: Date, now: () => Date,
 *   stillValid: (snapshot: { path: string, takenAt: Date } | undefined) => boolean, run?: typeof defaultRun,
 *   writeFile?: (path: string, data: string) => void, mkdir?: (path: string) => void }} context
 * @returns {T}
 */
function withScopedSnapshot(mutate, issues, { log, at, now, stillValid, run, writeFile, mkdir }) {
  const held = issues.map((issue) => scopedSnapshots.get(issue));
  if (held.every((snapshot) => stillValid(snapshot))) {
    const paths = [...new Set(held.map((snapshot) => /** @type {{ path: string }} */ (snapshot).path))];
    log(`board-snapshot: reusing ${paths.join(", ")} for #${issues.join(", #")}, taken before an earlier `
      + "mutation of the same item(s) in this process (#1275)");
    return mutate();
  }
  const path = writeScopedSnapshot(issues, { run, writeFile, mkdir, now });
  for (const issue of issues) scopedSnapshots.set(issue, { path, takenAt: at });
  log(`board-snapshot: wrote ${path} before mutating #${issues.join(", #")} -- scoped to the item(s) this `
    + "mutation touches, not the whole board (#1275)");
  return mutate();
}

/**
 * How long ago, in the words the log line needs. Whole seconds: a snapshot's age is never sub-second.
 * @param {Date} at @param {Date} takenAt
 */
function describeAge(at, takenAt) {
  // SUB-SECOND AGES IN MILLISECONDS: rounding two quick mutations to `0s` reads as "no time passed"
  // rather than "under a second", and the age is the field a reader checks against the change it covers.
  const ms = at.getTime() - takenAt.getTime();
  return ms < 1000 ? `${ms}ms` : `${Math.round(ms / 1000)}s`;
}

/**
 * FORGET THE PROCESS'S SNAPSHOT. For tests, and named as such: module state that survives between cases
 * is how one test's arrangement becomes another's silent precondition, and every assertion about "the
 * first mutation" here depends on which mutation was first.
 */
export function forgetProcessSnapshot() {
  processSnapshot = null;
  scopedSnapshots.clear();
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) {
  // Guarded per #164, and takes no flags at all -- this entry point only ever takes a snapshot, it never
  // mutates, so there is nothing for a flag to configure.
  refuseUnknownFlags([], { entry: import.meta.url, command: "node scripts/board-snapshot.mjs" });
  try {
    const path = writeBoardSnapshot();
    process.stdout.write(`wrote ${path}\n`);
  } catch (error) {
    process.stderr.write(`${/** @type {Error} */ (error).message}\n`);
    process.exitCode = 1;
  }
}
