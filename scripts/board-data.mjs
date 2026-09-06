// THE DATA LAYER BOTH BOARD OUTPUTS READ, and the only place that talks to GitHub or git.
//
// Extracted from `board-report.mjs` when the weekly board document was added, rather than letting the
// document grow its own copy of `mergeState`, `issues` and `reported`. A fact stated twice is this repo's
// most-repeated defect and the two copies would have drifted the first time a field moved -- the daily
// edition and the weekly PDF disagreeing about a merge count is exactly the failure the reports exist to
// prevent, arriving in the reports themselves.
//
// The rules below travel with the data and are not the caller's to relax.
//
// The rule this file exists to enforce, and the reason it is a script rather than a habit: a report
// assembled by hand from peer messages is a report of CLAIMS. This project's own record is a catalogue of
// correct values read from the wrong place — a journal window spanning two runs, a progress file
// describing a FINISHED run while a new one was a minute old, a commit message quoted while the artefact
// was on disk. Every one of those was true of something; none was true of the thing being reported.
//
// So: issues, the milestone and merges are READ, from GitHub and from git. A gate result and the
// fleet-hours total cannot be read from either, so they come from `docs/board/reported.json`, where the
// agent that RAN the command records its verbatim output, who ran it and when. An entry that is absent or
// older than `staleAfterHours` is printed as "not reported since <date>" — never omitted, and never
// estimated. Where the report cannot verify something it says so; that is the whole design.
//
// It writes to stdout by default. `--post` publishes it as a comment on the board-report issue, so the
// generating and the publishing are separate acts and a bad report can be seen before it is posted.
import { execFileSync } from "node:child_process";
import { sandboxGitEnv } from "./git-env.mjs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { REPO } from "./repo-identity.mjs";

// RE-EXPORTED, not restated -- issue #92. Five other modules import `REPO` from here, so it stays exported
// at this path; `repo-identity.mjs` is the single declared value now, and this is one of its callers.
export { REPO };
export const MILESTONE = "v0.1.0 — first publish";
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const HOURS_MS = 3600_000;

/** THE FILES THE REPORT READS OUT OF THE WORKING TREE, and the only dirt that can change an edition.
 *
 * Deliberately NOT "refuse if `git status` is non-empty". This is a shared checkout with several agents
 * working in it at once, so a guard that fires on somebody else's unrelated edit is one people disable
 * within a day — the same reason `promote:model` checks its TARGET paths rather than the whole tree.
 * Everything else the report reads is a ref (`git log main`, `origin/main..main`) or the GitHub API, and
 * neither is affected by an uncommitted file.
 *
 * The check is against `main`, not merely against HEAD, because the scheduled job runs from whatever
 * branch this checkout happens to be sitting on. A peer's branch is not dirty and would still supply a
 * `reported.json` nobody reviewed. "Uncommitted" and "committed on another branch" are different states
 * and both change what gets published, so both refuse.
 */
export const READ_SET = ["docs/board/reported.json", "scripts/board-report.mjs"];

// EVERY SPAWN SCRUBS `GIT_*`, and this file is the one where getting it wrong is worst.
//
// git exports `GIT_DIR`/`GIT_WORK_TREE` into any hook environment, and a spawned git with an inherited
// env obeys `GIT_DIR` over `cwd` -- that is not a hypothetical, it redirected fifteen real commits in this
// repo on 2026-09-06. The board report READS LOCAL BRANCHES AND THE PUSH STATE; those are the two lines it
// exists to produce, and the two nothing else can check. Under a leaked `GIT_DIR` it would report a merge
// count and a push state from a different repository entirely, confidently and with a source line
// attached. A report that is wrong about which repository it read is worse than no report.
//
// `gh` is scrubbed too. Every call here passes `--repo` explicitly so it does not resolve from git
// remotes, but `gh` shells git internally and the scrub costs nothing -- the defence should not depend on
// knowing which subprocess reads which variable.
export function gh(args) {
  return execFileSync("gh", args,
    { encoding: "utf8", cwd: ROOT, env: sandboxGitEnv(), maxBuffer: 32 * 1024 * 1024 });
}
export function git(args) {
  return execFileSync("git", args,
    { encoding: "utf8", cwd: ROOT, env: sandboxGitEnv(), maxBuffer: 32 * 1024 * 1024 }).trim();
}

/** Merges are read from git, and the PUSH STATE is read with them.
 *
 * Reporting merges from GitHub alone would have been wrong on the first day this ran: pushes were held
 * while a git-identity defect was fixed, so `origin/main` sat still while real work merged locally. A
 * report saying "0 merges" would have been a correct reading of the wrong ref. So the count comes from
 * local `main` and the divergence is stated rather than hidden — a flat origin/main is a hold, not a stall,
 * and the two look identical from GitHub.
 */
export function mergeState(since) {
  const log = git(["log", "main", "--merges", `--since=${since}`, "--format=%h\t%aI\t%s"]);
  const merges = log ? log.split("\n").map((l) => {
    const [sha, at, ...rest] = l.split("\t");
    return { sha, at, subject: rest.join("\t") };
  }) : [];
  let unpushed;
  try {
    unpushed = Number(git(["rev-list", "--count", "origin/main..main"]));
  } catch {
    // No origin/main to compare against (a fresh clone, a detached mirror). Reported as unknown rather
    // than as zero: "nothing is waiting to push" and "we could not ask" must never be the same line.
    unpushed = null;
  }
  return { merges, unpushed };
}

/** Commits whose author is not the repository owner — a KNOWN DEFECT, printed so the board reads it as
 * one rather than discovering it. Issue #7 carries the cause and the decision (history stays). */
export function misAuthored(since) {
  const log = git(["log", "main", `--since=${since}`, "--format=%h\t%ae"]);
  if (!log) return [];
  return log.split("\n").map((l) => l.split("\t"))
    .filter(([, email]) => !email.endsWith("@users.noreply.github.com") && email !== "")
    .map(([sha, email]) => ({ sha, email }));
}

export function issues() {
  const fields = "number,title,state,labels,closedAt,milestone,url";
  const all = JSON.parse(gh(["issue", "list", "--repo", REPO, "--state", "all",
    "--limit", "200", "--json", fields]));
  return all.map((i) => ({ ...i, labelNames: i.labels.map((l) => l.name) }));
}

export function milestone() {
  const all = JSON.parse(gh(["api", `repos/${REPO}/milestones?state=all`]));
  return all.find((m) => m.title === MILESTONE) ?? null;
}

/** The two numbers this report cannot compute, and how it refuses to invent them. */
export function reported() {
  const raw = JSON.parse(readFileSync(path.join(ROOT, "docs/board/reported.json"), "utf8"));
  const staleMs = (raw.staleAfterHours ?? 24) * HOURS_MS;
  const fresh = (entry) => Date.now() - Date.parse(entry.at) < staleMs;
  const gates = (raw.gates ?? []).filter((g) => g.at && Number.isFinite(Date.parse(g.at)));
  const latest = gates.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0] ?? null;
  return { latestGate: latest, gateIsFresh: latest ? fresh(latest) : false, fleetHours: raw.fleetHours,
    achievements: raw.achievements ?? [] };
}

export function daysUntil(iso) {
  return Math.ceil((Date.parse(iso) - Date.now()) / (24 * HOURS_MS));
}


/** Refuse to publish anything assembled from a read set that is not `main`'s.
 *
 * Refusing rather than publishing a partial edition, and SAYING SO in the log: a board output that
 * silently quotes an unreviewed gate entry is worse than a missing one, because a missing edition is
 * visible and a wrong number is not. Returns the reason, or null when it is safe.
 */
export function readSetIsNotMain() {
  const uncommitted = git(["status", "--porcelain", "--", ...READ_SET]);
  const offMain = git(["diff", "--name-only", "main", "--", ...READ_SET]);
  if (!uncommitted && !offMain) return null;
  const lines = [];
  if (uncommitted) lines.push(`uncommitted changes:\n${uncommitted}`);
  if (offMain) lines.push(`differs from \`main\` (this checkout is on `
    + `\`${git(["rev-parse", "--abbrev-ref", "HEAD"])}\`):\n${offMain}`);
  return lines.join("\n");
}

/** Everything both outputs need, read once. */
export function collect(since) {
  const all = issues();
  const open = all.filter((i) => i.state === "OPEN");
  return {
    since,
    all,
    open,
    closed: all.filter((i) => i.state === "CLOSED" && i.closedAt
      && Date.parse(i.closedAt) >= Date.parse(since)),
    milestones: JSON.parse(gh(["api", `repos/${REPO}/milestones?state=all`])),
    release: milestone(),
    ...mergeState(since),
    strays: misAuthored(since),
    ...reported(),
  };
}
