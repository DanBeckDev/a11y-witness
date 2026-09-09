#!/usr/bin/env node
// @ts-check
// command: print the pipeline's four sections -- trunk, open PRs, stalled work, and red checks on merged PRs
/**
 * THE HOURLY TABLE, AS A COMMAND RATHER THAN A HABIT -- ceo's ruling, 2026-09-08.
 *
 *   node scripts/queue-table.mjs [--json]
 *
 * ## Why this exists at all
 *
 * The table was a thing `dispatcher` typed. On 2026-09-08 the 19:17Z edition was missed, the merge of a
 * PR was not relayed for an hour, and a red `audit` check sat on seven merged PRs for ninety minutes --
 * found by the chairman, reading the PR list, before anyone in the org read the same view. Each has a
 * reason on its own; together they are a lane not being read. **A missed table produced by a habit is
 * invisible; a missed table produced by a script is a missing paste**, which is the whole of the fix.
 *
 * ## SECTION 4 IS FIRST FOR A REASON
 *
 * "Non-success checks on the last ten merged PR heads, by check name" is the view the chairman actually
 * looks at, and nothing in this org was looking at it. It is printed last, because a reader scans down --
 * but it is the section this file was written for, and a change that drops it has removed the point.
 *
 * ## Every number is COUNTED, never read off a status word
 *
 * `mergeStateStatus` reads `BLOCKED` for a stale base and for a failing required check identically --
 * measured 2026-09-09, when `dispatcher` reported a PR as BEHIND that was zero commits behind and merely
 * red. So "behind" here is `git rev-list --count <head>..<base>`, the countable fact, reusing
 * `behindByCount` from `queue-stalled.mjs` rather than spelling it a second time. The status word is
 * printed too, as a label, never as the measurement.
 *
 * ## It reports what it could not ask
 *
 * A failed lookup prints as `?` with the section marked INCOMPLETE, and the exit code says so. A table
 * that quietly omits the PR it could not read is worse than no table: the reader counts what is there.
 */
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { refuseUnknownFlags, flagValue } from "../packages/worker-fleet/src/cli-flags.mjs";
import { behindByCount } from "./queue-stalled.mjs";
import { REPO } from "./repo-identity.mjs";
import { sandboxGitEnv } from "./git-env.mjs";

export const EXIT = { EXAMINED: 0, INCOMPLETE: 2 };

/** How many merged PRs' heads section 4 examines. Ten is what the chairman's own list shows. */
export const MERGED_HEADS_EXAMINED = 10;

/** A PR whose head has not moved in this long, while it is behind, is stalled rather than waiting. */
export const STALL_MINUTES = 90;

const gh = (/** @type {string[]} */ args) =>
  execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const git = (/** @type {string[]} */ args) => {
  try {
    return { status: 0, stdout: execFileSync("git", args, { encoding: "utf8", env: sandboxGitEnv() }) };
  } catch {
    return { status: 1, stdout: "" };
  }
};

/** @template T @param {() => T} fn @returns {T | null} */
const ask = (fn) => { try { return fn(); } catch { return null; } };

/**
 * PURE. One PR's row, from facts already gathered -- so every shape is exercisable without a network.
 *
 * @param {{number: number, headRefName: string, headRefOid: string, mergeStateStatus: string,
 *   armed: boolean, updatedAt: string, redChecks: string[] | null}} pr
 * @param {number | null} behind
 * @param {Date} now
 */
export function prRow(pr, behind, now) {
  const owner = pr.headRefName.includes("/") ? pr.headRefName.split("/")[0] : "(no prefix)";
  const idleMinutes = Math.round((now.getTime() - new Date(pr.updatedAt).getTime()) / 60000);
  return {
    number: pr.number,
    owner,
    behind,
    armed: pr.armed,
    status: pr.mergeStateStatus,
    idleMinutes,
    // A PR can be stalled by being behind and untouched, which is the state `update-branch` skips
    // because it only carries GREEN PRs -- so a red PR that nobody pushes is invisible to the train.
    stalled: (behind ?? 0) > 0 && idleMinutes >= STALL_MINUTES,
    red: pr.redChecks,
  };
}

/**
 * PURE. Section 4's tally: which check names were non-success on these merged PRs' heads.
 *
 * Counted BY NAME rather than by PR, because the question is "which check is red on the list" -- one
 * check red on ten PRs and ten checks red on one PR are different faults and must not print the same.
 *
 * @param {{number: number, checks: {name: string, conclusion: string}[] | null}[]} merged
 * @returns {{byName: Map<string, number[]>, unreadable: number[]}}
 */
export function nonSuccessByName(merged) {
  const byName = new Map();
  const unreadable = [];
  for (const pr of merged) {
    if (pr.checks === null) { unreadable.push(pr.number); continue; }
    for (const check of pr.checks) {
      // SKIPPED and NEUTRAL are not red. `gate`'s own loop treats skipped as success and so must this,
      // or every path-filtered job reads as a failure on every PR that did not touch its paths.
      if (["SUCCESS", "SKIPPED", "NEUTRAL", ""].includes((check.conclusion ?? "").toUpperCase())) continue;
      if (!byName.has(check.name)) byName.set(check.name, []);
      byName.get(check.name).push(pr.number);
    }
  }
  return { byName, unreadable };
}

/** @returns {{sha: string, runId: string, conclusion: string, status: string} | null} */
export function trunkState() {
  const sha = ask(() => gh(["api", `repos/${REPO}/commits/main`, "--jq", ".sha"]).trim());
  if (!sha) return null;
  const runs = ask(() => JSON.parse(gh(["run", "list", "--workflow=trunk-guard.yml", "--limit", "20",
    "--json", "headSha,conclusion,status,databaseId"])));
  if (!Array.isArray(runs)) return { sha, runId: "?", conclusion: "?", status: "?" };
  const mine = runs.find((/** @type {{headSha: string}} */ r) => r.headSha === sha);
  return mine
    ? { sha, runId: String(mine.databaseId), conclusion: mine.conclusion || "(none yet)", status: mine.status }
    : { sha, runId: "(no run)", conclusion: "(none)", status: "(none)" };
}

/** Every open PR, with its red check names. `null` red list means the lookup failed for that PR. */
export function openPRs() {
  const prs = ask(() => JSON.parse(gh(["pr", "list", "--state", "open", "--limit", "100", "--json",
    "number,headRefName,headRefOid,mergeStateStatus,updatedAt,autoMergeRequest,statusCheckRollup"])));
  if (!Array.isArray(prs)) return null;
  return prs.map((/** @type {any} */ pr) => ({
    number: pr.number,
    headRefName: pr.headRefName,
    headRefOid: pr.headRefOid,
    mergeStateStatus: pr.mergeStateStatus,
    updatedAt: pr.updatedAt,
    armed: Boolean(pr.autoMergeRequest),
    redChecks: newestPerName(pr.statusCheckRollup ?? [])
      .filter((c) => !["SUCCESS", "SKIPPED", "NEUTRAL", ""].includes((c.conclusion ?? "").toUpperCase()))
      .map((c) => c.name),
  }));
}

/**
 * NEWEST PER NAME, never `find`. GitHub's rollup UNIONS superseded check-runs, so the first match is the
 * OLDEST -- #498, fixed twice in `update-branch-sweep.mjs` (#500, #517) and once more in
 * `trunk-revert.mjs` (#582). A table built on `find` reports a check red that has since gone green.
 *
 * `completedAt` is compared as a string because ISO-8601 sorts lexically, and a run still in flight
 * reports the ZERO DATE rather than null, so it sorts below every real completion.
 *
 * @param {{name: string, conclusion?: string, completedAt?: string, startedAt?: string}[]} rollup
 */
export function newestPerName(rollup) {
  const best = new Map();
  for (const check of rollup) {
    if (!check?.name) continue;
    const stamp = stampOf(check);
    const seen = best.get(check.name);
    if (!seen || stamp >= stampOf(seen)) best.set(check.name, check);
  }
  return [...best.values()];
}

const ZERO_DATE = "0001-01-01T00:00:00Z";
const real = (/** @type {string | undefined} */ v) => (v && v !== ZERO_DATE ? v : "");
const stampOf = (/** @type {{completedAt?: string, startedAt?: string}} */ c) =>
  real(c.completedAt) || real(c.startedAt) || "";

/** The last N merged PRs and each head's checks. */
export function recentlyMerged(limit = MERGED_HEADS_EXAMINED) {
  const prs = ask(() => JSON.parse(gh(["pr", "list", "--state", "merged", "--limit", String(limit),
    "--json", "number,statusCheckRollup"])));
  if (!Array.isArray(prs)) return null;
  return prs.map((/** @type {any} */ pr) => ({
    number: pr.number,
    checks: newestPerName(pr.statusCheckRollup ?? [])
      .map((c) => ({ name: c.name, conclusion: c.conclusion ?? "" })),
  }));
}

/**
 * ONE RENDERER PER SECTION, and not for tidiness -- `render` reached a complexity of 18 against this
 * repository's limit of 15, which is the Stepdown Rule's own signal that it had stopped doing one thing.
 * Each returns its lines and whether it had to report an unknown, so "could not ask" propagates to the
 * exit code from wherever it happened rather than being remembered by the caller.
 *
 * @param {any} trunk @returns {{lines: string[], incomplete: boolean}}
 */
export function renderTrunk(trunk) {
  if (!trunk) return { lines: ["   ? could not read main's tip"], incomplete: true };
  const lines = [`   main ${trunk.sha.slice(0, 8)}  run ${trunk.runId}  ${trunk.status}/${trunk.conclusion}`];
  // STILL RUNNING IS NOT RED, and collapsing them is this repository's oldest defect wearing a table's
  // clothes -- "nothing has said it is green yet" and "it said it is not" need opposite responses, and a
  // table that shouts on every in-flight run is one people stop reading by lunchtime.
  if (trunk.status !== "completed") lines.push("   (still running -- not a verdict either way yet)");
  else if (trunk.conclusion !== "success") lines.push("   ^ NOT GREEN -- this is the first line to act on");
  return { lines, incomplete: false };
}

/** @param {any[] | null} prs @returns {{lines: string[], incomplete: boolean}} */
export function renderOpenPRs(prs) {
  if (!prs) return { lines: ["   ? could not list open PRs"], incomplete: true };
  if (prs.length === 0) return { lines: ["   none open"], incomplete: false };
  const lines = prs.map((row) => {
    const behind = row.behind === null ? "?" : String(row.behind);
    const red = row.red === null ? " red:?" : row.red.length ? ` red: ${row.red.join(" ")}` : "";
    return `   #${row.number}  ${row.owner.padEnd(11)} behind=${behind.padEnd(3)} `
      + `${row.armed ? "armed  " : "UNARMED"} ${row.status.padEnd(9)}${red}`;
  });
  return { lines, incomplete: prs.some((r) => r.behind === null || r.red === null) };
}

/** @param {any[]} prs @returns {string[]} */
export function renderStalled(prs) {
  const stalled = prs.filter((r) => r.stalled);
  return stalled.length
    ? stalled.map((r) => `   #${r.number}  ${r.owner}  behind=${r.behind}  idle ${r.idleMinutes}m`)
    : ["   none"];
}

/** @param {any[] | null} merged @returns {{lines: string[], incomplete: boolean}} */
export function renderMergedChecks(merged) {
  if (!merged) return { lines: ["   ? could not list merged PRs"], incomplete: true };
  const { byName, unreadable } = nonSuccessByName(merged);
  const lines = byName.size === 0 ? ["   none"] : [...byName.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([name, prsWith]) => `   ${name.padEnd(18)} ${prsWith.length} of ${merged.length}  `
      + `(#${prsWith.slice(0, 6).join(", #")}${prsWith.length > 6 ? ", ..." : ""})`);
  if (unreadable.length > 0) lines.push(`   ? checks unreadable on #${unreadable.join(", #")}`);
  return { lines, incomplete: unreadable.length > 0 };
}

/** @param {{trunk: any, prs: any[] | null, merged: any[] | null, now: Date, fetched?: boolean}} data */
export function render({ trunk, prs, merged, now, fetched = true }) {
  const sections = [
    { heading: "1. TRUNK", body: renderTrunk(trunk) },
    { heading: "2. OPEN PRs  (behind is COUNTED, never read off mergeStateStatus)", body: renderOpenPRs(prs) },
    {
      heading: `3. STALLED  (behind and untouched for ${STALL_MINUTES}+ minutes -- the train carries only`
        + " green PRs, so a red one nobody pushes is invisible to it)",
      body: { lines: renderStalled(prs ?? []), incomplete: false },
    },
    {
      heading: [`4. NON-SUCCESS CHECKS ON THE LAST ${MERGED_HEADS_EXAMINED} MERGED PR HEADS, BY NAME`,
        "   (the view the chairman reads. A check red here blocks nothing and is therefore the red people",
        "    stop reading -- which is exactly how one sat on seven merged PRs for ninety minutes.)"].join("\n"),
      body: renderMergedChecks(merged),
    },
  ];
  // EVERY SECTION IS PRINTED, including the empty ones. A section that vanishes when it has nothing to
  // say is indistinguishable from one that was dropped, and this table exists because a missing thing was
  // invisible.
  const header = [`QUEUE TABLE  ${now.toISOString()}`];
  if (!fetched) header.push("   ! git fetch FAILED -- every 'behind' below is unknown, not zero");
  const text = [...header, "",
    ...sections.flatMap((s) => [s.heading, ...s.body.lines, ""])].join("\n").trimEnd();
  const incomplete = !fetched || sections.some((s) => s.body.incomplete);
  return { text, code: incomplete ? EXIT.INCOMPLETE : EXIT.EXAMINED };
}

/**
 * FETCH FIRST, or every count is `?`. Found by running it: the checkout this command happens to be in has
 * no objects for a sha pushed one minute ago, so `git rev-list --count <head>..<base>` exits 128 with
 * `Invalid revision range` and every row reports unknown. The API knows what the shas ARE; only the local
 * repository can say how far apart they are, and it can only do that for objects it holds.
 *
 * It is the local repository as a source bounded to a window nobody chose -- the same shape as reading a
 * journal with no bound, or a check-run rollup that unions superseded runs. Ask the source, and first
 * make sure it has been told.
 *
 * @param {(args: string[]) => {status: number, stdout: string}} runGit
 * @returns {boolean} whether the fetch succeeded; a failed fetch is reported, never silently tolerated
 */
export function fetchRefs(runGit) {
  return runGit(["fetch", "--quiet", "origin", "+refs/heads/*:refs/remotes/origin/*"]).status === 0;
}

export function collect(now = new Date()) {
  const fetched = fetchRefs(git);
  const trunk = trunkState();
  const raw = openPRs();
  const base = trunk?.sha ?? "origin/main";
  const prs = raw === null ? null : raw.map((pr) => {
    const behind = git(["rev-list", "--count", `${pr.headRefOid}..${base}`]).status === 0
      ? behindByCount(base, pr.headRefOid, git)
      : null;
    return prRow(pr, behind, now);
  });
  return { trunk, prs, merged: recentlyMerged(), now, fetched };
}

function main() {
  refuseUnknownFlags(["--json"], { entry: import.meta.url, command: "node scripts/queue-table.mjs" });
  const data = collect();
  if (flagValue(process.argv, "json") !== undefined || process.argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify({
      trunk: data.trunk, prs: data.prs,
      merged: data.merged && [...nonSuccessByName(data.merged).byName.entries()]
        .map(([name, prs]) => ({ name, prs })),
    }, null, 2)}\n`);
    process.exit(data.prs && data.merged && data.trunk ? EXIT.EXAMINED : EXIT.INCOMPLETE);
  }
  const { text, code } = render(data);
  process.stdout.write(`${text}\n`);
  process.exit(code);
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) main();
