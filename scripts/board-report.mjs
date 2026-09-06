#!/usr/bin/env node
// The daily board report, GENERATED FROM GITHUB AND GIT — never from what an agent said.
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
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { refuseUnknownFlags } from "@a11y-witness/worker-fleet/cli-flags";

const REPO = "DanBeckDev/a11y-witness";
const MILESTONE = "v0.1.0 — first publish";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOURS_MS = 3600_000;

refuseUnknownFlags(["--post", "--issue", "--since", "--allow-dirty-read-set"],
  { entry: import.meta.url, command: "npm run board:report" });

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
const READ_SET = ["docs/board/reported.json", "scripts/board-report.mjs"];

const argv = process.argv.slice(2);
const flag = (name) => argv.find((a) => a.startsWith(`${name}=`))?.split("=").slice(1).join("=");
const post = argv.includes("--post");

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
}
function git(args) {
  return execFileSync("git", args, { encoding: "utf8", cwd: ROOT, maxBuffer: 32 * 1024 * 1024 }).trim();
}

/** Merges are read from git, and the PUSH STATE is read with them.
 *
 * Reporting merges from GitHub alone would have been wrong on the first day this ran: pushes were held
 * while a git-identity defect was fixed, so `origin/main` sat still while real work merged locally. A
 * report saying "0 merges" would have been a correct reading of the wrong ref. So the count comes from
 * local `main` and the divergence is stated rather than hidden — a flat origin/main is a hold, not a stall,
 * and the two look identical from GitHub.
 */
function mergeState(since) {
  const log = git(["log", "main", "--merges", `--since=${since}`, "--format=%h\t%aI\t%s"]);
  const merges = log ? log.split("\n").map((l) => {
    const [sha, at, ...rest] = l.split("\t");
    return { sha, at, subject: rest.join("\t") };
  }) : [];
  let unpushed = 0;
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
function misAuthored(since) {
  const log = git(["log", "main", `--since=${since}`, "--format=%h\t%ae"]);
  if (!log) return [];
  return log.split("\n").map((l) => l.split("\t"))
    .filter(([, email]) => !email.endsWith("@users.noreply.github.com") && email !== "")
    .map(([sha, email]) => ({ sha, email }));
}

function issues() {
  const fields = "number,title,state,labels,closedAt,milestone,url";
  const all = JSON.parse(gh(["issue", "list", "--repo", REPO, "--state", "all",
    "--limit", "200", "--json", fields]));
  return all.map((i) => ({ ...i, labelNames: i.labels.map((l) => l.name) }));
}

function milestone() {
  const all = JSON.parse(gh(["api", `repos/${REPO}/milestones?state=all`]));
  return all.find((m) => m.title === MILESTONE) ?? null;
}

/** The two numbers this report cannot compute, and how it refuses to invent them. */
function reported() {
  const raw = JSON.parse(readFileSync(path.join(ROOT, "docs/board/reported.json"), "utf8"));
  const staleMs = (raw.staleAfterHours ?? 24) * HOURS_MS;
  const fresh = (entry) => Date.now() - Date.parse(entry.at) < staleMs;
  const gates = (raw.gates ?? []).filter((g) => g.at && Number.isFinite(Date.parse(g.at)));
  const latest = gates.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0] ?? null;
  return { latestGate: latest, gateIsFresh: latest ? fresh(latest) : false, fleetHours: raw.fleetHours };
}

function daysUntil(iso) {
  return Math.ceil((Date.parse(iso) - Date.now()) / (24 * HOURS_MS));
}

function render({ since, sinceLabel }) {
  const all = issues();
  const ms = milestone();
  const { merges, unpushed } = mergeState(since);
  const strays = misAuthored(since);
  const { latestGate, gateIsFresh, fleetHours } = reported();

  const closed = all.filter((i) => i.state === "CLOSED" && i.closedAt && Date.parse(i.closedAt) >= Date.parse(since));
  const open = all.filter((i) => i.state === "OPEN");
  const blockers = open.filter((i) => i.milestone?.title === MILESTONE);
  const ready = open.filter((i) => i.labelNames.includes("ready"));
  const awaiting = open.filter((i) => i.labelNames.includes("awaiting-merge"));

  const L = [];
  L.push(`# Board report — ${new Date().toISOString().slice(0, 10)}`);
  L.push("");
  L.push(`Generated from GitHub and git by \`npm run board:report\`. Nothing here is taken from what an `
    + `agent said: issues and the milestone are read from the API, merges from \`git log main\`, and the `
    + `two figures neither can supply are quoted from \`docs/board/reported.json\` with their measurer `
    + `named — or declared unreported. Window: ${sinceLabel}.`);
  L.push("");

  L.push("## Release");
  if (!ms) {
    L.push(`No milestone titled \`${MILESTONE}\` exists. That is a tracker fault, not a schedule one.`);
  } else {
    const d = ms.due_on ? daysUntil(ms.due_on) : null;
    L.push(`**${ms.title}** — due ${ms.due_on ? ms.due_on.slice(0, 10) : "no date set"}`
      + `${d === null ? "" : ` (${d} day${d === 1 ? "" : "s"} out)`}, `
      + `**${ms.open_issues} open**, ${ms.closed_issues} closed.`);
    L.push("");
    L.push("Every move of that date is recorded on the milestone itself, naming what moved it and which "
      + "gate found it. If the date below has changed since the last report and the milestone carries no "
      + "reason, that is the defect — not the slip.");
  }
  L.push("");

  L.push("## Blockers");
  if (blockers.length === 0) {
    L.push("None open on the milestone.");
  } else {
    L.push("| # | blocker | found by |");
    L.push("|---|---|---|");
    for (const b of blockers) {
      const by = b.labelNames.includes("gate-found") ? "a gate" : "inspection";
      L.push(`| [#${b.number}](${b.url}) | ${b.title.replace(/\|/g, "\\|")} | ${by} |`);
    }
  }
  L.push("");

  L.push("## Issues closed");
  if (closed.length === 0) {
    L.push(`None in this window. **That is a fact about the window, not about the work** — `
      + `${merges.length} merge${merges.length === 1 ? "" : "s"} landed in it.`);
  } else {
    for (const c of closed) L.push(`- [#${c.number}](${c.url}) ${c.title}`);
  }
  L.push("");

  L.push("## What merged");
  L.push(`**${merges.length}** merge${merges.length === 1 ? "" : "s"} to \`main\` since \`${since}\`, read `
    + "from `git log main --merges`, not from GitHub. **The window is stated because two correct counts "
    + "over different windows read as a disagreement** — measured on this report's first edition, where a "
    + "peer's 17 (since 09:00) and this script's 42 (since midnight) were both right.");
  L.push("");
  // ALWAYS PRINTED, INCLUDING WHEN IT IS ZERO. A push state that appears only when it is interesting is
  // one the reader cannot tell from a check that did not run — the `unchecked is not clean` rule, on the
  // one number that decides whether anything read from GitHub's default branch is current.
  if (unpushed === null) {
    L.push("**`origin/main` could not be compared** — no such ref in this checkout. Reported as unknown "
      + "rather than as zero: \"nothing is waiting to push\" and \"we could not ask\" are different answers.");
  } else if (unpushed === 0) {
    L.push(`\`main\` and \`origin/main\` are level (\`${git(["rev-parse", "--short", "main"])}\`), checked, `
      + "not assumed. So GitHub's default branch is current for this window. If a push hold has been "
      + "declared and this reads 0, the hold has not yet produced divergence — the two look identical "
      + "from here and only this line distinguishes them.");
  } else {
    L.push(`**${unpushed} commit${unpushed === 1 ? "" : "s"} are on local \`main\` and not on `
      + `\`origin/main\`.** A flat \`origin/main\` on GitHub is therefore a HOLD, not a stall — anything `
      + "read from GitHub's default branch today is behind the work.");
  }
  L.push("");

  if (strays.length > 0) {
    L.push("## Commit authorship — a known defect, not a discovery");
    L.push(`${strays.length} commit${strays.length === 1 ? "" : "s"} in this window are authored by an `
      + `address that is not the repository owner's: ${[...new Set(strays.map((s) => s.email))].join(", ")}.`);
    L.push("");
    L.push("Cause, measured: a test spawned git with `cwd: tmpdir` but no sanitised `env`, and under the "
      + "pre-push hook `GIT_DIR` beats `cwd`, so it wrote its identity into the real config. **cwd is not "
      + "isolation for a git subprocess.** Decision on record: history stays — no force-push while agents "
      + "hold branches off `main`. Tracked as an issue; the fix that matters is the discovery test over "
      + "every git-shelling test, not the config unset.");
    L.push("");
  }

  L.push("## Last gate result");
  if (!latestGate) {
    L.push("**Not reported.** No gate output has been recorded in `docs/board/reported.json`. This report "
      + "does not read gates itself and must not: a checkout's `runs/` is only as fresh as its last sync "
      + "— one measured here was 89 hours old and answered cleanly having examined a corpus that no "
      + "longer existed.");
  } else {
    L.push(`\`${latestGate.command}\` — run by **${latestGate.reportedBy}** at ${latestGate.at}`
      + `${gateIsFresh ? "" : " — **STALE**, older than this report's freshness window, so it describes an "
        + "earlier state of the corpus and not necessarily the current one"}.`);
    L.push("");
    L.push("```");
    L.push(String(latestGate.output).trimEnd());
    L.push("```");
  }
  L.push("");

  L.push("## Fleet hours");
  if (!fleetHours || fleetHours.status === "not instrumented") {
    L.push("**not instrumented.** " + (fleetHours?.note ?? ""));
  } else if (!fleetHours.run) {
    // A TOTAL WITH NO RUN BEHIND IT IS REFUSED, not printed with a caveat.
    //
    // "Fleet hours: 214" is a number whose whole meaning is which runs it summed, and this project's
    // record is precisely the failure of numbers that were correct about something other than the thing
    // being reported. So the report will not carry the figure at all until the entry names its source.
    // Refusing is cheaper than a footnote nobody reads, and it cannot be satisfied by remembering.
    L.push(`**REFUSED — a fleet-hours total was recorded without naming the run it was computed from.** `
      + `The entry reads \`${fleetHours.total}\`, measured by ${fleetHours.reportedBy ?? "nobody named"}. `
      + "A total whose runs are unstated cannot be checked, re-derived, or compared with the next one, so "
      + "it is not printed. Add a `run` field naming the job and its invocation, and it appears.");
  } else {
    L.push(`**${fleetHours.total}**, computed from **${fleetHours.run}** — measured by `
      + `${fleetHours.reportedBy} at ${fleetHours.at}.`);
    L.push("");
    L.push(`Method: ${fleetHours.method}`);
  }
  L.push("");

  L.push("## Queue");
  L.push(`**Ready ${ready.length}** · **Awaiting merge ${awaiting.length}** · **Open ${open.length}**`);
  if (ready.length === 0) {
    L.push("");
    L.push("An empty Ready column is a legitimate end state, not a broken filter — the other columns "
      + `still hold ${open.length - ready.length} row(s), which is what tells the two apart.`);
  }

  return L.join("\n");
}

/** Refuse to publish an edition assembled from a read set that is not `main`'s.
 *
 * Refusing rather than posting a partial edition, and SAYING SO in the log: a board report that silently
 * quotes an unreviewed gate entry is worse than a missing one, because a missing edition is visible and a
 * wrong number is not. Returns the reason, or null when it is safe.
 */
function readSetIsNotMain() {
  const uncommitted = git(["status", "--porcelain", "--", ...READ_SET]);
  const offMain = git(["diff", "--name-only", "main", "--", ...READ_SET]);
  if (!uncommitted && !offMain) return null;
  const lines = [];
  if (uncommitted) lines.push(`uncommitted changes:\n${uncommitted}`);
  if (offMain) lines.push(`differs from \`main\` (this checkout is on `
    + `\`${git(["rev-parse", "--abbrev-ref", "HEAD"])}\`):\n${offMain}`);
  return lines.join("\n");
}

const since = flag("--since") ?? new Date(Date.now() - 24 * HOURS_MS).toISOString();
const body = render({ since, sinceLabel: `commits and closures since ${since}` });

if (!post) {
  process.stdout.write(body + "\n");
} else {
  const dirt = argv.includes("--allow-dirty-read-set") ? null : readSetIsNotMain();
  if (dirt) {
    console.error("REFUSING to post: the files this report reads out of the working tree are not "
      + "`main`'s, so the edition would quote something nobody has reviewed.\n\n" + dirt
      + "\n\nThe report was NOT posted and no partial edition was published. Commit and merge the read "
      + "set, or pass --allow-dirty-read-set, which posts and says so in the edition itself.\n"
      + "Read set: " + READ_SET.join(", "));
    process.exit(3);
  }
  const issue = flag("--issue");
  if (!issue) {
    console.error("--post needs --issue=<number>, the board-report issue to comment on. Refusing rather "
      + "than opening a new issue per report: a report per issue is how a board stops being read.");
    process.exit(2);
  }
  const published = argv.includes("--allow-dirty-read-set") && readSetIsNotMain()
    ? body + "\n\n---\n\n**Posted with `--allow-dirty-read-set`.** The files this edition reads out of "
      + "the working tree are not `main`'s, so the gate line and the fleet-hours line above may quote "
      + "something unreviewed. Stated here rather than left for a reader to discover."
    : body;
  gh(["issue", "comment", issue, "--repo", REPO, "--body", published]);
  process.stdout.write(`posted to https://github.com/${REPO}/issues/${issue}\n`);
}
