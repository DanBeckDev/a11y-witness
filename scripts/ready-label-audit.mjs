#!/usr/bin/env node
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
//   npm run ready:audit           print every violation and exit 1, or exit 0 with the count
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";
// RELATIVE, NOT the `@a11y-witness/worker-fleet/cli-flags` package specifier: that export map
// points at `dist/`, so it needs both `node_modules` AND a completed build. This file is reachable
// from a pre-install entry (see `pre-install-import-graph.test.ts`, which derives that population
// rather than naming it), and there it dies on startup with ERR_MODULE_NOT_FOUND.
import { refuseUnknownFlags } from "../packages/worker-fleet/src/cli-flags.mjs";
import { REPO } from "./repo-identity.mjs";

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
  /** @type {string} */
  let raw;
  try {
    raw = run("gh", ["issue", "list", "--repo", REPO, "--state", "open", "--limit", "200",
      "--json", "number,title,labels"]);
  } catch (cause) {
    throw new Error(`ready-label-audit: could not list open issues from ${REPO} -- refusing to guess. `
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
  return parsed.map((/** @type {unknown} */ entry, /** @type {number} */ i) => {
    const obj = /** @type {{ number?: unknown, title?: unknown, labels?: unknown }} */ (entry);
    if (typeof obj?.number !== "number" || typeof obj?.title !== "string" || !Array.isArray(obj?.labels)) {
      throw new Error(`ready-label-audit: entry ${i} is missing number/title/labels -- refusing to guess. `
        + `Got: ${JSON.stringify(entry).slice(0, 300)}`);
    }
    const names = obj.labels.map((/** @type {unknown} */ l) => {
      const name = /** @type {{ name?: unknown }} */ (l)?.name;
      if (typeof name !== "string") {
        throw new Error(`ready-label-audit: issue #${obj.number} has a label with no name -- refusing to `
          + `guess. Got: ${JSON.stringify(l)}`);
      }
      return name;
    });
    return { number: obj.number, title: obj.title, labels: names };
  });
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

function main() {
  refuseUnknownFlags([], { entry: import.meta.url, command: "ready-label-audit" });
  let issues;
  try {
    issues = fetchOpenIssues();
  } catch (error) {
    process.stderr.write(`COULD NOT AUDIT: ${/** @type {Error} */ (error).message}\n`);
    process.exitCode = 2;
    return;
  }
  const violations = mutexViolations(issues);
  if (violations.length === 0) {
    process.stdout.write(`OK  ${issues.length} open issue(s) checked, none carry \`ready\` `
      + `with a not-pickable label\n`);
    return;
  }
  for (const { number, title, conflicting } of violations) {
    process.stdout.write(`VIOLATION  #${number} "${title}" -- ready + ${conflicting.join(", ")}\n`);
  }
  process.stderr.write(`\n${violations.length} row(s) carry \`ready\` alongside a label that already means `
    + `not pickable. Remove one or the other.\n`);
  process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) {
  main();
}
