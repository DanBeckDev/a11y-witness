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
 * AND THIS SECTION WAS ONCE BLIND TO ITS OWN SUBJECT, which is its second instance and belongs in the
 * header rather than only in a row. It answered "did each PR's CI pass before merge" for a day, under a
 * heading that asked "what is red on main" -- and it was built after the chairman's seven-red-PRs
 * complaint to see exactly that. Its rollup hung off `headRefOid`, the branch tip BEFORE the merge, so
 * every post-merge workflow, every scheduled run pinned to a sha and every non-code event was
 * structurally unreachable. On 2026-09-09 it printed NONE for three consecutive tables while
 * `ready-label-audit` had been red since 12:11Z; changing the population to main's first-parent chain
 * and rerunning on the same tree gave `audit` red on 7 of 10 -- the same number and check name as the
 * incident quoted below. **The next reader of this section needs to know its population was once wrong.**
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
import { loadavg } from "node:os";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { refuseUnknownFlags, flagValue } from "../packages/worker-fleet/src/cli-flags.mjs";
import { behindByCount } from "./queue-stalled.mjs";
import { REPO } from "./repo-identity.mjs";
import { sandboxGitEnv } from "./git-env.mjs";
import { newestPerName } from "./newest-check-run.mjs";

export const EXIT = { EXAMINED: 0, INCOMPLETE: 2 };

/** How many commits on main section 4 examines. Ten is what the chairman's own list shows. */
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
 * A commit's `number` is NULL when nothing merged it -- a direct push to main is a real thing and its red
 * check is exactly the kind this section exists to surface, so it is carried rather than dropped.
 *
 * @param {{number: number | null, sha?: string, checks: {name: string, conclusion: string}[] | null}[]} merged
 * @returns {{byName: Map<string, (number | null)[]>, unreadable: (number | null)[]}}
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
 * The last N merged PRs, each head's checks, and WHEN THE OLDEST OF THEM MERGED.
 *
 * The window is not decoration. A bare "10" tells a reader nothing about whether that is ten of ten or
 * ten of two hundred, or whether it covers an hour or a fortnight -- product-manager's requirement, and
 * they are right that a count without its denominator and its window is not a measurement. It is the
 * difference between "a check has been red all morning" and "a check was red once, months ago".
 */
export function recentlyMerged(limit = MERGED_HEADS_EXAMINED) {
  const commits = mergeCommitsOnMain(limit);
  if (commits === null) return null;
  return commits.map((commit) => ({
    number: commit.pr,
    sha: commit.sha,
    mergedAt: commit.date,
    checks: checksOnSha(commit.sha),
  }));
}

/**
 * The last N commits on `main`'s FIRST-PARENT chain, with the PR each merge names.
 *
 * THIS USED TO READ `gh pr list --state merged --json statusCheckRollup`, WHICH IS A DIFFERENT
 * POPULATION AND ANSWERS A DIFFERENT QUESTION. A merged PR's `headRefOid` is the BRANCH TIP BEFORE THE
 * MERGE; the merge commit is a different sha. So the section reported "did this PR's own CI pass before
 * it merged" while its heading -- and the chairman reading it -- asked "what is red on main".
 *
 * Measured 2026-09-09: `ready-label-audit` failed on five merged heads from 12:11Z and section 4 printed
 * NONE for three consecutive tables. It runs on the `issues` event against main's tip, so its check-runs
 * attach to MERGE COMMITS (861ffbb7, bdf9c0ba) -- and `gh pr list --json headRefOid` matches neither.
 * **It was not missed; it was structurally unreachable.** Every post-merge workflow, every scheduled run
 * pinned to a sha, and every non-code event was equally invisible, which is the entire class of check
 * that CAN be red on main without blocking anything -- the class this section exists to surface.
 *
 * @param {number} limit
 * @returns {{sha: string, pr: number | null, date: string | null}[] | null}
 */
export function mergeCommitsOnMain(limit, { run = defaultGitLog } = {}) {
  const log = ask(() => run(limit));
  if (log === null) return null;
  return log.trim().split("\n").filter(Boolean).map((line) => {
    const [sha, date, subject] = line.split("\t");
    const named = /Merge pull request #(\d+)/.exec(subject ?? "");
    return { sha, date: date ?? null, pr: named ? Number(named[1]) : null };
  });
}

/** @param {number} limit */
function defaultGitLog(limit) {
  return execFileSync("git",
    ["log", "--first-parent", "-n", String(limit), "--format=%H%x09%cI%x09%s", "origin/main"],
    { encoding: "utf8", env: sandboxGitEnv() });
}

/**
 * Every check-run on one sha, newest per name. `null` when the lookup fails, never an empty list -- an
 * unreadable sha and a sha with no checks are different facts and the caller reports them differently.
 *
 * @param {string} sha
 * @returns {{name: string, conclusion: string}[] | null}
 */
export function checksOnSha(sha) {
  const raw = ask(() => gh(["api", `repos/${REPO}/commits/${sha}/check-runs`, "--paginate",
    "--jq", ".check_runs[] | {name, conclusion, completedAt: .completed_at}"]));
  if (raw === null) return null;
  const runs = raw.trim().split("\n").filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
  return newestPerName(runs).map((c) => ({ name: c.name, conclusion: c.conclusion ?? "" }));
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
 * @typedef {{compressedMb: number, inactiveMb: number, freeMb: number, pageouts: number,
 *   load: number | null, gitProcesses: number | null, worktrees: number,
 *   topConsumers?: {pid: string, cpu: number, command: string}[] | null}} HostState
 *
 * `load` and `gitProcesses` are declared NULLABLE even though `os.loadavg()` cannot fail today. The
 * type is what stops the next reader writing `host.load > LOAD_CEILING` and getting `false` from a
 * missing reading -- the exact expression this commit removes. A type that forbids the absent case is
 * how the absent case stops being handled.
 *
 * @returns {HostState | null}
 */
/**
 * Concurrent `git` processes, or null when `pgrep` could not be ASKED -- and the two are told apart by
 * pgrep's own exit status rather than by a second probe.
 *
 * `pgrep` exits 1 for "no process matched" and 2+ (or ENOENT) for "I could not look", so a plain
 * try/catch folds a real count of none into a failure, and `?? 0` folds a failure into a count of none.
 * The first draft of this asked a control question instead -- `pgrep -x <a name nothing has>` -- which
 * has the identical exit status as the real query and so answered nothing at all. **A control that
 * shares the failure mode of the thing it controls for is not a control**, which is the same shape as a
 * verification sharing a failure mode with its action (#645).
 *
 * @returns {number | null}
 */
function gitProcessCount() {
  try {
    return execFileSync("pgrep", ["-x", "git"], { encoding: "utf8" })
      .trim().split("\n").filter(Boolean).length;
  } catch (err) {
    // Exit 1 is pgrep's documented "nothing matched" -- a real measurement of zero.
    return /** @type {{status?: number}} */ (err).status === 1 ? 0 : null;
  }
}

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
    // NO SUBPROCESS FOR THE LOAD. This asked `sysctl`, which lives in /usr/sbin -- not on the PATH a
    // node script inherits from a shell that exported a minimal one. It returned null for ninety
    // minutes on a host whose real load was 15.08 against a ceiling of 12, and the table printed
    // `load ?` beside "the host is fine". `os.loadavg()` is the same number from the same kernel with
    // nothing between, so there is no failure mode left to swallow.
    load: loadavg()[0],
    // UNREADABLE IS NOT ZERO. `pgrep` exits 1 when nothing matches AND when it cannot run, so `?? 0`
    // folded "I could not ask" into "there are none" -- and none is the reassuring answer. Kept
    // separate, and `hostContention` below refuses to call a host uncontended on a count it does not
    // have.
    gitProcesses: gitProcessCount(),
    worktrees: ask(() => execFileSync("git", ["worktree", "list"],
      { encoding: "utf8", env: sandboxGitEnv() }).trim().split("\n").length) ?? 0,
    topConsumers: topConsumers(),
  };
}

/** How many processes to name. Enough to see a pattern, few enough to read in a table. */
const CONSUMERS_SHOWN = 5;

/**
 * The five processes actually using the CPU, because **"contended" without the consumer is a verdict
 * without a cause** -- and the remedy differs completely depending on the answer. Nine sessions running
 * `npm test` at once is fixed by serialising pushes; Spotlight indexing 107 worktrees is fixed by pruning
 * and an exclusion file, and serialising pushes would do nothing at all.
 *
 * `ps -r`, NOT `top -l 1`. A single `top` sample has no interval to measure a percentage against, so it
 * reports `0.0` for every process on a host at load 35 -- measured 2026-09-09T11:07Z, five processes all
 * reading 0.0% while `ps` put `mds_stores` at 52%. That is this file's own defect class arriving through
 * a sampling window instead of a missing PATH: **an unmeasurable value printed as a small number reads as
 * good news.** `top -l 2` and discarding the first sample works, and costs a second of wall clock for a
 * number `ps` already has.
 *
 * @returns {{pid: string, cpu: number, command: string}[] | null}
 */
export function topConsumers() {
  const out = ask(() => execFileSync("ps", ["-Ao", "pid,pcpu,comm", "-r"], { encoding: "utf8" }));
  if (out === null) return null;
  return out.split("\n").slice(1, CONSUMERS_SHOWN + 1).flatMap((line) => {
    const m = /^\s*(\d+)\s+([\d.]+)\s+(.+)$/.exec(line);
    // The command is a full path; the basename is what a reader recognises, and `mds_stores` says more
    // than the 96 characters of framework path in front of it.
    return m ? [{ pid: m[1], cpu: Number(m[2]), command: m[3].split("/").pop() ?? m[3] }] : [];
  });
}

/** Concurrent git processes above which a carry is contending rather than working. */
export const GIT_PROCESS_CEILING = 10;

/** Load average above which the gate is slow because the host is, not because anything is wrong. */
export const LOAD_CEILING = 12;

/** Processes that are this org's own work, so the relief advice can tell ours from everyone else's. */
const OURS = /^(node|npm|git|tsc|tsx|esbuild|Claude|claude)/;

/** A user application whose presence means a person is USING this machine, not just sharing it. */
const A_PERSON_IS_USING_THIS_MACHINE = /^(zoom\.us|Google Chrome|Safari|Firefox|Slack|Teams|obs|QuickTime)/i;

/**
 * WHAT TO ACTUALLY DO, derived from WHO IS USING THE CPU -- because the remedies are disjoint and
 * picking the wrong one costs the whole cycle. Nine sessions running `npm test` at once is fixed by
 * serialising pushes. `mds_stores` indexing 106 worktrees is fixed by pruning, and serialising pushes
 * would do nothing whatever. A virtual machine somebody else started is not ours to fix at all.
 *
 * Measured 2026-09-09T11:30Z, which is why this stopped being one fixed paragraph: the table said
 * "stop running `npm test` locally" while the top five were Docker's VM at 134%, Spotlight at 61%,
 * WindowServer at 51% and Zoom at 39% -- **not one of them ours**. Advice that names the wrong cause is
 * worse than none, because sessions act on it and the load does not move.
 *
 * @param {{command: string, cpu: number}[] | null} consumers
 * @returns {string[]}
 */
export function reliefFor(consumers) {
  if (consumers === null) return ["     No CPU reading, so no cause -- do not guess at a remedy."];
  const ours = consumers.filter((c) => OURS.test(c.command));
  const person = consumers.filter((c) => A_PERSON_IS_USING_THIS_MACHINE.test(c.command));
  const spotlight = consumers.filter((c) => c.command.startsWith("mds"));
  const lines = [];
  if (person.length > 0) {
    lines.push(`     SOMEBODY IS USING THIS MACHINE (${person.map((c) => c.command).join(", ")}). Our`,
      "     load is competing with their session, not just with itself: one push at a time across all",
      "     sessions, no local suites, sweeps paused, until the next table shows it gone.");
  }
  if (spotlight.length > 0) {
    lines.push("     Spotlight is indexing the worktrees. Prune every one whose PR has merged; a",
      "     `.metadata_never_index` in a worktree root stops it being indexed at all.");
  }
  if (ours.length > 0) {
    lines.push(`     Ours, and stoppable now: ${ours.map((c) => `${c.command} ${c.cpu.toFixed(0)}%`)
      .join(", ")}. A full local suite belongs in CI -- the pre-push gate is enough.`);
  } else {
    lines.push("     NONE of the top five is ours. Serialising our own work will not move this load;",
      "     the cost is being paid by something we do not control, so wait rather than throttle harder.");
  }
  return lines;
}

/**
 * Whether the host is contended, and -- the part a boolean alone destroys -- WHICH readings are missing.
 *
 * THE ABSENCE OF A MEASUREMENT IS NOT THE MEASUREMENT ZERO. This was `(host.load ?? 0) > LOAD_CEILING`,
 * which answers "is the load above 12" with "no" when the load could not be read at all -- and `no`
 * here means "the host is fine", printed under a heading that exists because this host was the
 * bottleneck and nothing said so. A metric that fails into the reassuring answer is worse than no
 * metric, because it is believed.
 *
 * @param {{load: number | null, gitProcesses: number | null}} host
 * @returns {{contended: boolean, unknown: string[]}}
 */
export function hostContention(host) {
  const unknown = [];
  if (host.load === null || Number.isNaN(host.load)) unknown.push("load");
  if (host.gitProcesses === null) unknown.push("git process count");
  const contended = (host.load !== null && !Number.isNaN(host.load) && host.load > LOAD_CEILING)
    || (host.gitProcesses !== null && host.gitProcesses > GIT_PROCESS_CEILING);
  return { contended, unknown };
}

/**
 * @param {HostState | null} host
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
    `   pageouts ${delta}   load ${host.load === null ? "?" : host.load.toFixed(2)}   `
      + `git ${host.gitProcesses ?? "?"}   `
      + `worktrees ${host.worktrees}`,
  ];
  const consumers = host.topConsumers ?? null;
  if (consumers === null) {
    lines.push("   ? could not read the CPU consumers -- contention below is a verdict without a cause");
  } else if (consumers.length > 0) {
    lines.push("   using the CPU: "
      + consumers.map((c) => `${c.command} ${c.cpu.toFixed(0)}%`).join("   "));
  }
  const { contended, unknown } = hostContention(host);
  if (unknown.length > 0) {
    lines.push(`   ^ COULD NOT READ: ${unknown.join(", ")} -- not a reading of zero, and not a`,
      "     verdict that the host is fine. Every threshold below is answered on what was read.");
  }
  if (contended) {
    lines.push("   ^ THE HOST IS CONTENDED. A carry is a merge plus a pre-push gate running lint and",
      "     typecheck; at this load those are minutes rather than seconds. A PR that is not carried",
      "     right now is a busy machine, NOT an idle owner -- do not name people for it.");
    lines.push(...reliefFor(consumers));
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
      heading: [`4. NON-SUCCESS CHECKS ON THE LAST ${MERGED_HEADS_EXAMINED} COMMITS ON MAIN, BY NAME`,
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

/** Re-exported so `queue-table.test.ts` keeps its import; the definition lives in one place (#634). */
export { newestPerName };
