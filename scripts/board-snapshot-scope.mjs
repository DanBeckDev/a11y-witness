// @ts-check
// #1275: THE SCOPED HALF OF A BOARD SNAPSHOT, PURE OF `gh` -- and that is placement rather than style.
//
// `board-snapshot.mjs` runs `gh`, so every test importing it needs a `token` that CI's acceptance job does not
// have. #1275's first Acceptance command was refused for exactly that: "board-snapshot.test.ts requires token via
// fetchBoardItems → board-snapshot.mjs:361". #1009 and #1219 (`board-status-health.mjs`) record the fix: the logic
// lives where a pure test can reach it, the request is injected, and the one `gh` call the scoped read needs is
// made in `board-snapshot.mjs`. NOTHING HERE MAY IMPORT `board-snapshot.mjs`, not even a constant, or this file
// inherits its requirement again -- so the constants both halves need live here, and that file re-exports them.
//
// What the scoped half is: a mutation that names the item it touches snapshots that item, not the board. Every
// board mutation in `scripts/` is one item's Status (`row-claim.mjs`'s `moveProjectStatus`); #399's accident was a
// FIELD rewrite that no script sends. A full sweep before each one-item edit cost 6 GraphQL pages at 555 items plus
// the ready-issue list, and the account's GraphQL budget ran out twice on 2026-09-13.
import { mkdirSync, writeFileSync } from "node:fs";
import { REPO } from "./repo-identity.mjs";

export const PROJECT_OWNER = REPO.split("/")[0];
export const PROJECT_NUMBER = 2;
export const SNAPSHOT_DIR = "runs/board-snapshots";

/**
 * One `gh` invocation without `gh` itself: its arguments in, its stdout out. `board-snapshot.mjs` supplies a request
 * that runs `gh` with these arguments. A failure throws with the failed process's stdout on `.stdout`, as
 * `execFileSync` does, so GraphQL's own error is still read (#555).
 * @typedef {(args: string[]) => string} GhRequest
 */

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
export function graphqlErrors(parsed) {
  const errors = /** @type {any} */ (parsed)?.errors;
  if (!Array.isArray(errors) || errors.length === 0) return null;
  return errors.map((/** @type {any} */ e) => ({
    type: typeof e?.type === "string" ? e.type : "UNKNOWN",
    message: typeof e?.message === "string" ? e.message : JSON.stringify(e).slice(0, 200),
    path: Array.isArray(e?.path) ? e.path.join(".") : null,
  }));
}

/** One `type: message (path)` line per error, joined -- the string every refusal below actually prints. */
export function describeGraphqlErrors(/** @type {GraphqlError[]} */ errors) {
  return errors.map((e) => `${e.type}${e.path ? ` (${e.path})` : ""}: ${e.message}`).join("; ");
}

/**
 * `execFileSync` throws on a non-zero exit, but `gh api graphql` still writes the full response body --
 * `errors` included -- to stdout first, and Node's thrown error carries it verbatim on `.stdout` (a plain
 * string, since `board-snapshot.mjs`'s `defaultRun` passes `encoding: "utf8"`). Measured directly: a request naming a repository
 * that does not resolve exits 1 with `{"data":{...},"bad":null},"errors":[{"type":"NOT_FOUND",...}]}` on
 * `.stdout`. So a non-zero exit does not mean the API's own answer is lost -- only that nobody had read it
 * yet. Returns `null` (never throws) for anything that is not a parseable GraphQL error body, so the
 * caller can fall back to the plain exit failure honestly rather than inventing a cause.
 * @param {unknown} failure the thrown value from a failed `run()` call
 * @returns {string | null}
 */
export function graphqlErrorFromFailedRun(failure) {
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
 * A filesystem-safe stamp for a snapshot filename, derived from a real timestamp so two snapshots taken
 * seconds apart never collide and a reader can sort them by name.
 * @param {Date} date
 * @returns {string}
 */
export function snapshotStamp(date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

/**
 * Writes a snapshot, or THROWS the refusal every caller relies on: no snapshot on disk, no mutation (#399).
 * @param {string} path @param {object} snapshot
 * @param {{ writeFile: (path: string, data: string) => void, mkdir: (path: string) => void }} io
 */
export function persistSnapshot(path, snapshot, { writeFile, mkdir }) {
  try {
    mkdir(SNAPSHOT_DIR);
    writeFile(path, JSON.stringify(snapshot, null, 2));
  } catch (cause) {
    throw new Error(`board-snapshot: could not write the snapshot to ${path} -- refusing to proceed with `
      + `an unsnapshotted board mutation. ${/** @type {Error} */ (cause).message}`, { cause });
  }
}

/**
 * #1275: the SCOPED snapshots this process has taken, by the issue each one covers. Kept apart from
 * `processSnapshot` because a scoped file describes its own items and must never license a mutation of another.
 * @type {Map<number, { path: string, takenAt: Date }>}
 */
const scopedSnapshots = new Map();

/**
 * #1275: the arguments for one touched issue's read. The caller adds `gh`: this file never names it, because the
 * closure walk charges a `token` to any file that spawns `gh`, and this file must not carry one.
 * @param {number} issueNumber
 * @returns {string[]}
 */
export function touchedItemRequest(issueNumber) {
  return ["api", "graphql", "-f", `query=${TOUCHED_ITEM_QUERY}`, "-f", `owner=${PROJECT_OWNER}`,
    "-f", `name=${REPO.split("/")[1]}`, "-F", `project=${PROJECT_NUMBER}`, "-F", `issue=${issueNumber}`];
}

/**
 * #1275: THE ITEMS A MUTATION TOUCHES, ONE REQUEST EACH, AND NOTHING ELSE ON THE BOARD. No #747 floor here: that
 * floor exists because `fieldValues` is narrowed to a budget shared with the other items in a 100-item page, and a
 * single issue's `fieldValueByName` shares its request with nothing. A failed request THROWS, quoting GraphQL's own
 * error when the failed process printed one (#555).
 * @param {number[]} issueNumbers
 * @param {{ request: GhRequest }} deps
 * @returns {{ items: BoardItem[], notOnBoard: number[] }}
 */
export function readTouchedItems(issueNumbers, { request }) {
  /** @type {BoardItem[]} */
  const items = [];
  /** @type {number[]} */
  const notOnBoard = [];
  for (const issue of issueNumbers) {
    /** @type {string} */
    let raw;
    try {
      raw = request(touchedItemRequest(issue));
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
 * #1275: the items `issueNumbers` name, written to `runs/board-snapshots/<stamp>-issue-<n>.json` -- the issue in the
 * name so two moves a millisecond apart never overwrite each other. THROWS if the read or the write fails, exactly as
 * the full snapshot does: the guarantee is #399's, scoped to the write it covers.
 * @param {number[]} issueNumbers
 * @param {{ request: GhRequest, maxAgeMs: number, writeFile?: (path: string, data: string) => void,
 *   mkdir?: (path: string) => void, now?: () => Date }} deps
 * @returns {string} the path written
 */
export function writeScopedSnapshot(issueNumbers, {
  request,
  maxAgeMs,
  writeFile = (path, data) => writeFileSync(path, data, "utf8"),
  mkdir = (path) => mkdirSync(path, { recursive: true }),
  now = () => new Date(),
}) {
  const { items, notOnBoard } = readTouchedItems(issueNumbers, { request });
  const takenAt = now();
  const path = `${SNAPSHOT_DIR}/${snapshotStamp(takenAt)}-issue-${issueNumbers.join("-")}.json`;
  persistSnapshot(path, {
    takenAt: takenAt.toISOString(),
    // SAYS WHAT IT IS, as #852's file does: a reader must not take a scoped file for the board.
    takenBefore: `the board mutation of #${issueNumbers.join(", #")} -- SCOPED to the item(s) that mutation `
      + "touches, not the whole board (#1275). A later mutation of the same item(s) in this process within "
      + `${maxAgeMs / 1000}s reuses it; a mutation of any other item takes its own`,
    scope: { issues: issueNumbers },
    project: { owner: PROJECT_OWNER, number: PROJECT_NUMBER },
    items,
    notOnBoard,
  }, { writeFile, mkdir });
  return path;
}

/**
 * #1275: the issues a mutation names in `touches`, or `null` when it names none. Anything else REFUSES: a mutation
 * cannot touch nothing, and a reuse check over no issues is vacuously "every one held" -- a mutation with no
 * snapshot behind it.
 * @param {unknown} touches
 * @returns {number[] | null}
 */
export function touchedIssues(touches) {
  if (touches === undefined) return null;
  const issues = [touches].flat();
  if (issues.length === 0 || !issues.every((issue) => Number.isInteger(issue))) {
    throw new Error("board-snapshot: `touches` must name the issue(s) this mutation changes, got "
      + `${JSON.stringify(touches)} -- refusing to guess what it touches. Nothing was mutated.`);
  }
  return /** @type {number[]} */ (issues);
}

/**
 * #1275: WHICH SNAPSHOT A MUTATION GETS -- the decision `withBoardSnapshot` follows, pure so the row's own acceptance
 * can hold it. A full snapshot this process still holds covers every item (#852's reuse). A mutation that names its
 * items gets just those. One that names none gets the full sweep, as every mutation did before this row.
 * @param {{ touchedIssues: number[] | null, fullSnapshotValid: boolean }} state
 * @returns {"reuse-full" | "scoped" | "full"}
 */
export function snapshotRoute({ touchedIssues: issues, fullSnapshotValid }) {
  if (fullSnapshotValid) return "reuse-full";
  return issues === null ? "full" : "scoped";
}

/**
 * #1275: THE SCOPED SNAPSHOT, THEN THE MUTATION. Reuses this process's snapshot of EVERY touched issue while each is
 * still valid, and otherwise reads and writes just those items. `stillValid` is the caller's, so the disk re-read and
 * the age bound are the ones #852 applies to the full snapshot -- here per item.
 * @template T
 * @param {() => T} mutate @param {number[]} issues
 * @param {{ request: GhRequest, log: (line: string) => void, at: Date, now: () => Date, maxAgeMs: number,
 *   stillValid: (snapshot: { path: string, takenAt: Date } | undefined) => boolean,
 *   writeFile?: (path: string, data: string) => void, mkdir?: (path: string) => void }} context
 * @returns {T}
 */
export function withScopedSnapshot(mutate, issues, { request, log, at, now, maxAgeMs, stillValid, writeFile, mkdir }) {
  const touched = /** @type {number[]} */ (touchedIssues(issues));
  const held = touched.map((issue) => scopedSnapshots.get(issue));
  if (held.every((snapshot) => stillValid(snapshot))) {
    const paths = [...new Set(held.map((snapshot) => /** @type {{ path: string }} */ (snapshot).path))];
    log(`board-snapshot: reusing ${paths.join(", ")} for #${touched.join(", #")}, taken before an earlier `
      + "mutation of the same item(s) in this process (#1275)");
    return mutate();
  }
  const path = writeScopedSnapshot(touched, { request, maxAgeMs, writeFile, mkdir, now });
  for (const issue of touched) scopedSnapshots.set(issue, { path, takenAt: at });
  log(`board-snapshot: wrote ${path} before mutating #${touched.join(", #")} -- scoped to the item(s) this `
    + "mutation touches, not the whole board (#1275)");
  return mutate();
}

/**
 * FORGET THE SCOPED SNAPSHOTS. For tests, and `board-snapshot.mjs`'s `forgetProcessSnapshot` calls it: a scoped file
 * one case took must not become another case's silent precondition.
 */
export function forgetScopedSnapshots() {
  scopedSnapshots.clear();
}
