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
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { refuseUnknownFlags } from "../packages/worker-fleet/src/cli-flags.mjs";
import { REPO } from "./repo-identity.mjs";

export const PROJECT_OWNER = REPO.split("/")[0];
export const PROJECT_NUMBER = 2;
export const SNAPSHOT_DIR = "runs/board-snapshots";

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
            content { ... on Issue { number title } }
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
 * @typedef {{ itemId: string, number: number | null, title: string | null, status: string | null }} BoardItem
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
 * Every item currently on the board. Paginated -- #399 measured 117 items on Project 2, comfortably past
 * one page of 100. `gh` failing, or answering with a shape this function does not recognise, THROWS: it
 * never falls through to a partial or empty list, which would let a snapshot claim completeness having
 * examined only some of the board.
 *
 * @param {{ run?: typeof defaultRun }} [deps]
 * @returns {BoardItem[]}
 */
export function fetchBoardItems({ run = defaultRun } = {}) {
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
 * @param {{ run?: typeof defaultRun, writeFile?: (path: string, data: string) => void,
 *   mkdir?: (path: string) => void, now?: () => Date }} [deps]
 * @returns {string} the path written
 */
export function writeBoardSnapshot({
  run = defaultRun,
  writeFile = (path, data) => writeFileSync(path, data, "utf8"),
  mkdir = (path) => mkdirSync(path, { recursive: true }),
  now = () => new Date(),
} = {}) {
  const items = fetchBoardItems({ run });
  const takenAt = now();
  const path = `${SNAPSHOT_DIR}/${snapshotStamp(takenAt)}.json`;
  const snapshot = {
    takenAt: takenAt.toISOString(),
    project: { owner: PROJECT_OWNER, number: PROJECT_NUMBER },
    items,
  };
  try {
    mkdir(SNAPSHOT_DIR);
    writeFile(path, JSON.stringify(snapshot, null, 2));
  } catch (cause) {
    throw new Error(`board-snapshot: could not write the snapshot to ${path} -- refusing to proceed with `
      + `an unsnapshotted board mutation. ${/** @type {Error} */ (cause).message}`, { cause });
  }
  return path;
}

/**
 * Wrap a board-mutating call so it can only run once a real snapshot has been written. `mutate` is never
 * invoked if `writeBoardSnapshot` throws -- that is the whole guarantee this file exists to give, and
 * `board-snapshot.test.ts`'s mutation check proves it by making the write fail and asserting `mutate` was
 * never called.
 *
 * @template T
 * @param {() => T} mutate the actual board-mutating call
 * @param {{ run?: typeof defaultRun, writeFile?: (path: string, data: string) => void,
 *   mkdir?: (path: string) => void, now?: () => Date, log?: (line: string) => void }} [deps]
 * @returns {T}
 */
export function withBoardSnapshot(mutate, deps = {}) {
  const { log = (line) => process.stdout.write(`${line}\n`), ...snapshotDeps } = deps;
  const path = writeBoardSnapshot(snapshotDeps);
  log(`board-snapshot: wrote ${path} before mutating`);
  return mutate();
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
