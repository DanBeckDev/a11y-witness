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
    // ABSORBED (#600) IS A DIFFERENT STATE AND THE PREDICATE ABOVE CANNOT SEE IT. `update-branch` carries
    // only GREEN PRs, so a PR that is behind AND red cannot be carried at all -- it falls further behind
    // while its owner fixes the red, and the train will not touch it BECAUSE it is red. An owner actively
    // pushing fixes keeps `updatedAt` fresh, so such a PR is never "untouched" and never reads as stalled,
    // while being the one that can least escape. Measured 2026-09-09: #564 was carried to zero behind at
    // 07:30:30Z and read 14 behind eight minutes and seven merges later.
    //
    // AND THE OLD PREDICATE'S FALSE NEGATIVES WERE CONCENTRATED WHERE THE EFFORT WAS -- product-manager's
    // sentence, and it is the reason this is a defect rather than a gap: "behind AND untouched for 90
    // minutes" encodes an assumption that an unattended PR is the one in trouble. An absorbed PR is the
    // opposite; its owner is attending to it constantly, which is exactly what keeps it out of the table.
    // A predicate whose false negatives sit in the cases with the most human effort behind them is worse
    // than no predicate, because it converts effort into invisibility.
    absorbed: (behind ?? 0) > 0 && (pr.redChecks?.length ?? 0) > 0,
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

/**
 * The last N merged PRs, each head's checks, and WHEN THE OLDEST OF THEM MERGED.
 *
 * The window is not decoration. A bare "10" tells a reader nothing about whether that is ten of ten or
 * ten of two hundred, or whether it covers an hour or a fortnight -- product-manager's requirement, and
 * they are right that a count without its denominator and its window is not a measurement. It is the
 * difference between "a check has been red all morning" and "a check was red once, months ago".
 */
export function recentlyMerged(limit = MERGED_HEADS_EXAMINED) {
  const prs = ask(() => JSON.parse(gh(["pr", "list", "--state", "merged", "--limit", String(limit),
    "--json", "number,statusCheckRollup,mergedAt"])));
  if (!Array.isArray(prs)) return null;
  return prs.map((/** @type {any} */ pr) => ({
    number: pr.number,
    mergedAt: pr.mergedAt ?? null,
    checks: newestPerName(pr.statusCheckRollup ?? [])
      .map((c) => ({ name: c.name, conclusion: c.conclusion ?? "" })),
  }));
}

/**
 * The required status-check contexts on `main`, or `null` if the lookup failed.
 *
 * A check that is NOT in this list blocks nothing, and that is the whole reason a red one is tolerable
 * and therefore the reason it goes unread for ninety minutes. Saying so on the line turns "a red check on
 * every merge" into "one specific NON-BLOCKING check on every merge" -- different sentences, and only the
 * second is true. `null` prints as unknown rather than as "not required", because guessing in that
 * direction understates the problem.
 */
export function requiredContexts() {
  return ask(() => {
    const contexts = JSON.parse(gh(["api", `repos/${REPO}/branches/main/protection`,
      "--jq", ".required_status_checks.contexts"]));
    return Array.isArray(contexts) ? contexts : null;
  });
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
  const lines = [
    ...prs.filter((r) => r.absorbed).map((r) =>
      `   #${r.number}  ${r.owner}  behind=${r.behind}  ABSORBED (behind AND red -- the train will not `
      + `carry it, #600). red: ${r.red.join(" ")}`),
    ...prs.filter((r) => r.stalled && !r.absorbed).map((r) =>
      `   #${r.number}  ${r.owner}  behind=${r.behind}  idle ${r.idleMinutes}m`),
  ];
  return lines.length ? lines : ["   none"];
}

/**
 * The window these merged PRs span: the oldest merge time among them.
 * @param {{mergedAt?: string | null}[]} merged
 */
export function windowOf(merged) {
  const stamps = merged.map((pr) => pr.mergedAt).filter((/** @type {any} */ t) => typeof t === "string");
  return stamps.length === 0 ? null : stamps.sort()[0];
}

/**
 * @param {any[] | null} merged @param {string[] | null} required
 * @returns {{lines: string[], incomplete: boolean}}
 */
export function renderMergedChecks(merged, required) {
  if (!merged) return { lines: ["   ? could not list merged PRs"], incomplete: true };
  // AN EMPTY LIST AND UNREADABLE TIMES ARE DIFFERENT ANSWERS. Nothing merged is a legitimate state on a
  // quiet repository and needs no window; PRs that merged whose times could not be read is a lookup that
  // failed, and only the second may make the table INCOMPLETE. Collapsing them would report a quiet hour
  // as a broken one, which is the "could not ask" versus "asked and got nothing" distinction this
  // repository treats as its oldest defect.
  const since = windowOf(merged);
  const timesMissing = merged.length > 0 && since === null;
  const header = merged.length === 0
    ? "   (no merged PRs in range)"
    : `   since ${since ?? "(merge times unreadable)"}`;
  const { byName, unreadable } = nonSuccessByName(merged);
  const blocking = (/** @type {string} */ name) => (required === null
    ? "  (required? unknown)"
    : required.includes(name) ? "  ** REQUIRED -- this one blocks **" : "  (non-blocking)");
  const lines = [header, ...(byName.size === 0 ? ["   none"] : [...byName.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([name, prsWith]) => `   ${name.padEnd(18)} ${prsWith.length} of ${merged.length}  `
      + `(#${prsWith.slice(0, 6).join(", #")}${prsWith.length > 6 ? ", ..." : ""})${blocking(name)}`))];
  if (unreadable.length > 0) lines.push(`   ? checks unreadable on #${unreadable.join(", #")}`);
  return { lines, incomplete: unreadable.length > 0 || timesMissing || required === null };
}

/**
 * THE HOST ITSELF, because on 2026-09-09 it was the bottleneck and nothing said so.
 *
 * At 08:57Z this machine had four PRs reading as "not carried by their owners" for twenty minutes. Every
 * one of those carries is a `git merge` plus a pre-push gate running lint and typecheck, and there were
 * 58 concurrent git processes on one repository and 164 worktrees for Spotlight to index. The table named
 * four idle owners and the truth was one contended machine -- **attributing a machine fault to people,
 * which is the worst thing a status table can do.**
 *
 * WHICH NUMBER, AND THIS TOOK TWO WRONG ANSWERS TO SETTLE.
 *
 * NOT `free`. macOS keeps it small by design and inactive pages are reclaimable, so a low free figure is
 * the normal state of a working machine. The first version of this section keyed its threshold on free --
 * quoting CLAUDE.md's warning not to trust it, in the same comment.
 *
 * AND `Pages occupied by compressor` IS FOUR WORDS BEFORE ITS NUMBER. An awk taking `$3` gets the word
 * "by" and prints 0, which reads as "no memory pressure at all" on a host holding 12 GB compressed. Two
 * sessions measured this host minutes apart and got 0 MB and 12,344 MB; the difference was the field
 * index. **A parse error in a metric is indistinguishable from good news** -- so this counts pages by a
 * labelled regex and multiplies by the page size `vm_stat` itself reports, never by a hard-coded 4096 or
 * a positional field.
 *
 * THE THRESHOLD KEYS ON LOAD AND THE GIT COUNT, not on memory. Both are unambiguous, neither needs a
 * baseline, and they are what actually made the carries slow: git contention on one repository, and a
 * load average of 15 on 14 cores. The compressor is REPORTED beside them because 12 GB of it is a real
 * finding, and it becomes a threshold only once its delta has a baseline -- CLAUDE.md's own rule that
 * paging must be read as a delta, since the counters are since-boot and 6.6 GB left from an incident
 * hours ago is indistinguishable from a host swapping right now.
 *
 * @returns {{compressedMb: number, inactiveMb: number, freeMb: number, pageouts: number,
 *   load: number | null, gitProcesses: number | null, worktrees: number} | null}
 */
export function hostState() {
  const stat = ask(() => execFileSync("vm_stat", [], { encoding: "utf8" }));
  if (stat === null) return null;
  const pageSize = Number((/page size of (\d+)/.exec(stat) ?? [])[1] ?? 16384);
  // LABELLED, never positional: the compressor's label is four words long and a positional read of it
  // returns the word "by" as a number, which is 0, which reads as good news.
  const mb = (/** @type {string} */ label) => {
    const m = new RegExp(`${label}:\\s+(\\d+)`).exec(stat);
    return m ? Math.round((Number(m[1]) * pageSize) / 1048576) : 0;
  };
  const count = (/** @type {string} */ label) => {
    const m = new RegExp(`${label}:\\s+(\\d+)`).exec(stat);
    return m ? Number(m[1]) : 0;
  };
  return {
    compressedMb: mb("Pages occupied by compressor"),
    inactiveMb: mb("Pages inactive"),
    freeMb: mb("Pages free"),
    pageouts: count("Pageouts"),
    load: ask(() => Number(execFileSync("sysctl", ["-n", "vm.loadavg"], { encoding: "utf8" })
      .replace(/[{}]/g, "").trim().split(/\s+/)[0])),
    gitProcesses: ask(() => execFileSync("pgrep", ["-x", "git"], { encoding: "utf8" })
      .trim().split("\n").filter(Boolean).length) ?? 0,
    worktrees: ask(() => execFileSync("git", ["worktree", "list"],
      { encoding: "utf8", env: sandboxGitEnv() }).trim().split("\n").length) ?? 0,
  };
}

/** Concurrent git processes above which a carry is contending rather than working. */
export const GIT_PROCESS_CEILING = 10;

/** Load average above which the gate is slow because the host is, not because anything is wrong. */
export const LOAD_CEILING = 12;

/**
 * @param {ReturnType<typeof hostState>} host
 * @param {number | null} previousPageouts a prior table's reading, so paging reads as a DELTA
 * @returns {{lines: string[], incomplete: boolean}}
 */
export function renderHost(host, previousPageouts = null) {
  if (!host) return { lines: ["   ? could not read the host"], incomplete: true };
  const delta = previousPageouts === null
    ? "(no baseline yet)"
    : `+${host.pageouts - previousPageouts} since the last table`;
  const lines = [
    `   compressed ${host.compressedMb} MB   inactive ${host.inactiveMb} MB   free ${host.freeMb} MB`,
    `   pageouts ${delta}   load ${host.load ?? "?"}   git ${host.gitProcesses}   `
      + `worktrees ${host.worktrees}`,
  ];
  const contended = (host.load ?? 0) > LOAD_CEILING
    || (host.gitProcesses ?? 0) > GIT_PROCESS_CEILING;
  if (contended) {
    lines.push("   ^ THE HOST IS CONTENDED. A carry is a merge plus a pre-push gate running lint and",
      "     typecheck; at this load those are minutes rather than seconds. A PR that is not carried",
      "     right now is a busy machine, NOT an idle owner -- do not name people for it.",
      "     Cheapest relief, in order: remove every worktree whose PR has merged (Spotlight indexes",
      "     every one of them), and stop running `npm test` locally -- the pre-push gate is enough.");
  }
  return { lines, incomplete: false };
}

/** @param {{trunk: any, prs: any[] | null, merged: any[] | null, now: Date, fetched?: boolean,
 *   required?: string[] | null, host?: ReturnType<typeof hostState> | null}} data */
export function render({ trunk, prs, merged, now, fetched = true, required = null, host = null }) {
  const sections = [
    { heading: "1. TRUNK", body: renderTrunk(trunk) },
    { heading: "2. OPEN PRs  (behind is COUNTED, never read off mergeStateStatus)", body: renderOpenPRs(prs) },
    {
      heading: `3. STALLED OR ABSORBED  (behind and untouched for ${STALL_MINUTES}+ minutes, OR behind`
        + " and red -- the train carries only green PRs, so a red one can never catch up however hard its"
        + " owner pushes, #600)",
      body: { lines: renderStalled(prs ?? []), incomplete: false },
    },
    {
      heading: [`4. NON-SUCCESS CHECKS ON THE LAST ${MERGED_HEADS_EXAMINED} MERGED PR HEADS, BY NAME`,
        "   (the view the chairman reads. A check red here blocks nothing and is therefore the red people",
        "    stop reading -- which is exactly how one sat on seven merged PRs for ninety minutes.)"].join("\n"),
      body: renderMergedChecks(merged, required),
    },
    {
      heading: "5. THIS HOST  (it was the bottleneck on 2026-09-09 and nothing said so)",
      body: renderHost(host),
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
  return { trunk, prs, merged: recentlyMerged(), now, fetched, required: requiredContexts(),
    host: hostState() };
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
