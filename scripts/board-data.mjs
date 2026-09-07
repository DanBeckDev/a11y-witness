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
// fleet-hours total cannot be read from either, so they come from `docs/board/reported/`, where the
// agent that RAN the command records its verbatim output, who ran it and when. An entry that is absent or
// older than `staleAfterHours` is printed as "not reported since <date>" — never omitted, and never
// estimated. Where the report cannot verify something it says so; that is the whole design.
//
// It writes to stdout by default. `--post` publishes it as a comment on the board-report issue, so the
// generating and the publishing are separate acts and a bad report can be seen before it is posted.
import { execFileSync } from "node:child_process";
import { sandboxGitEnv } from "./git-env.mjs";
import { readFileSync, existsSync, readdirSync} from "node:fs";
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
export const READ_SET = ["docs/board/reported", "scripts/board-report.mjs"];

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

/** A row that is not work: a container, or a process row. NOT counted, and the document says so.
 *
 * `#20` is the whole reason this exists. It is the daily board report itself -- its comments ARE the
 * editions -- so it is an open issue that will never close and can never be worked. Counted, it inflates
 * "road to version one" by one for ever and the number quietly stops meaning what a reader thinks.
 *
 * EXCLUDED BY RULE AND THE RULE IS PRINTED, which is the whole point: a count that silently drops rows is
 * worse than one that counts the wrong thing, because nobody can tell. Section 6 states the exclusion
 * beside the figure.
 */
export const META_LABEL = "meta";

/** The rows the document COUNTS. `issues()` stays complete -- a meta row still needs its state resolved. */
export function countable(list) {
  return list.filter((i) => !(i.labelNames ?? i.labels?.map((l) => l.name) ?? []).includes(META_LABEL));
}

export function milestone() {
  const all = JSON.parse(gh(["api", `repos/${REPO}/milestones?state=all`]));
  return all.find((m) => m.title === MILESTONE) ?? null;
}

/** The two numbers this report cannot compute, and how it refuses to invent them. */
/** The recorded numbers, ONE FILE PER ENTRY (#159).
 *
 * It was a single JSON file that several agents record into, so two recorders appending two entries that
 * do not disagree about anything still produced a textual conflict -- JSON is line-oriented to git and
 * semantic to a reader. `git log` on it showed six different subjects moving the same 14,924 bytes, and
 * hand-resolving a conflict there risks precisely what the file exists to prevent: a number surviving
 * into the board document from a run nobody can name.
 *
 * NAMED BY THE ENTRY'S OWN IDENTITY, NEVER BY POSITION -- `ARRAY_IDENTITY` in board-summary-check.mjs
 * already keys gates on `command` and achievements on `issue`, and this follows it rather than inventing
 * a second scheme. Position-keyed names are the defect `withRealisticScale` paid for: inserting one entry
 * re-labels every entry after it.
 */
const REPORTED_DIR = "docs/board/reported";

/** WHICH SUBDIRECTORIES HOLD ENTRIES — declared ONCE and exported.
 *
 * `board-summary-check` built the same list inline, so adding a third kind meant remembering two places
 * and the second would be forgotten silently. Found in review of #159; it is the fact-stated-twice shape
 * that this very migration's commit message cites, reintroduced by the migration itself.
 */
export const REPORTED_KINDS = ["gates", "achievements"];

function readEntries(kind) {
  const dir = path.join(ROOT, REPORTED_DIR, kind);
  if (!existsSync(dir)) return [];
  // ORDERED BY AN EXPLICIT SPARSE KEY, never by filename and never by date. The authored order is not
  // chronological -- checked, not assumed -- and the document renders in it, so filename order silently
  // reordered what the board reads. `order` is spaced by tens: inserting between two entries picks a
  // value between them and re-labels nothing, which is the property this whole change is for.
  const entries = readdirSync(dir).filter((f) => f.endsWith(".json"))
    .map((f) => ({ file: f, body: JSON.parse(readFileSync(path.join(dir, f), "utf8")) }));
  return entries
    .sort((a, b) => (a.body.order ?? Infinity) - (b.body.order ?? Infinity)
      || a.file.localeCompare(b.file))
    .map((e) => e.body);
}

export function reported() {
  const metaPath = path.join(ROOT, REPORTED_DIR, "meta.json");
  const raw = { ...(existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, "utf8")) : {}),
    gates: readEntries("gates"), achievements: readEntries("achievements") };
  const staleMs = (raw.staleAfterHours ?? 24) * HOURS_MS;
  const fresh = (entry) => Date.now() - Date.parse(entry.at) < staleMs;
  const gates = (raw.gates ?? []).filter((g) => g.at && Number.isFinite(Date.parse(g.at)));
  const latest = gates.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0] ?? null;
  return { latestGate: latest, gateIsFresh: latest ? fresh(latest) : false, fleetHours: raw.fleetHours,
    achievements: raw.achievements ?? [] };
}

/**
 * The capture age a real-page gate printed, pulled from its own verbatim output rather than retyped by a
 * human -- issue #128. `rules:real-pages` computes and prints this line itself
 * (`*** 298 hour(s) between the oldest and newest, so this compares a MIXED population against one
 * baseline`); the defect was that everything downstream of the recorded entry re-typed a bare figure and
 * dropped it. The board document quotes a gate's output verbatim already, so once the recording keeps the
 * line this needs only to find it, never to compute it -- a second computation of the same spread is
 * exactly the fact-stated-twice shape this file's own header warns about.
 *
 * @param {string | undefined} gateOutput
 * @returns {string | null} the gate's own spread sentence, or null when it printed none (not a real-page
 *   result, or an older recording taken before the gate stated its spread)
 */
export function realPageCaptureAge(gateOutput) {
  if (!gateOutput) return null;
  const spread = gateOutput.match(/\*{0,3}\s*\d+\s*hour\(s\)\s*between the oldest and newest[^\n]*/i);
  return spread ? spread[0].replace(/^\*+\s*/, "").trim() : null;
}

/**
 * HAS THE WORLD MOVED UNDER AN AUTHORED ACHIEVEMENT? — the one section of the board document no gate
 * computes, and therefore the one nothing ever re-checks.
 *
 * Section 3 is authored on purpose: what the product can now DO is not derivable from an API. The cost is
 * that an entry is true when written and nothing asks again. Measured 2026-09-06 (#90), entry [2] read
 * *"a rule that had never been demonstrated on a real page now has a page to demonstrate it on — written,
 * not yet captured"*. Every clause was true when written; by the time it would have reached the board
 * three were false, including a citation of an issue that had been closed as superseded. **It was caught
 * by a person happening to re-read it. Nothing in the pipeline could have.**
 *
 * THIS DOES NOT JUDGE THE CLAIM, which is unanswerable. It asks the cheap question the data already
 * supports: the entry cites an issue and carries a timestamp, so *did the world move under this
 * sentence?* A machine can ask GitHub whether that issue is still open without understanding a word.
 *
 * A CLOSED ISSUE IS NOT THE FINDING, and the first version of this got that wrong. An achievement is by
 * definition something FINISHED, so the issue that tracked it closes — refusing every entry citing a
 * closed issue means the board can only ever be told about UNFINISHED work, and each entry decays into
 * unrenderable the moment its own row closes. `product-manager` caught it: the implementation took the
 * row's wording more literally than it meant.
 *
 * **What the row asks is weaker and sufficient: the world moved under this sentence, so somebody look.**
 * The satisfying act is RE-AFFIRMATION, not a live reference, and `at` is what records it. So:
 *
 *   closed reference + `at` LATER than the closure   -> a good entry: somebody looked after it moved
 *   closed reference + `at` OLDER than the closure   -> the one to refuse: nobody has looked since
 *
 * A strictly smaller population than "cites a closed issue", and the one the row was written about.
 *
 * `affirmed` remains the explicit escape, and it is a field rather than a flag: it carries WHY the claim
 * still stands. A bare boolean would let the guard be cleared by a keystroke with no thought, which is
 * how a refusal becomes a formality — the reason every EXEMPT table here demands a reason, not a name.
 *
 * @param {{achievements: any[], issueState: Record<string, {state: string, closedAt?: string|null}>,
 *          now?: number, staleAfterHours?: number}} input
 * @returns {{index: number, claim: string, why: string}[]}
 */
export function achievementsWhoseWorldMoved({ achievements, issueState, now = Date.now(),
  staleAfterHours = 24 }) {
  const findings = [];
  achievements.forEach((entry, index) => {
    const claim = String(entry.boardClaim ?? entry.claim ?? "(no claim text)").slice(0, 90);
    const affirmed = typeof entry.affirmed === "string" && entry.affirmed.trim().length > 20;
    const state = issueState[String(entry.issue)];
    // UNKNOWN IS NOT OPEN. An issue the listing did not carry is a question that could not be asked --
    // reporting it as fine is the "unchecked is not clean" defect, and reporting it as CLOSED would
    // refuse an edition over a paging limit. It gets its own sentence.
    if (entry.issue !== undefined && state === undefined) {
      findings.push({ index, claim,
        why: `cites issue #${entry.issue}, which the issue listing did not carry -- so whether it is `
          + "still open COULD NOT BE ASKED. Widen the listing or check by hand; do not assume." });
    } else if (state?.state === "CLOSED" && !affirmed
      && Date.parse(entry.at) < Date.parse(state.closedAt ?? "")) {
      findings.push({ index, claim,
        why: `cites issue #${entry.issue}, which closed at ${state.closedAt} -- AFTER this entry was last `
          + `affirmed (${entry.at}). The claim may still be true, and a closed issue is the normal end of `
          + "a finished achievement: this does not judge either. What it says is that the world moved "
          + "under the sentence and nobody has looked since. Re-affirm it by updating `at`, or add an "
          + "`affirmed` field saying why it still stands, or retire the entry." });
    }
    const ageHours = (now - Date.parse(entry.at)) / HOURS_MS;
    if (Number.isFinite(ageHours) && ageHours > staleAfterHours && !affirmed) {
      findings.push({ index, claim,
        why: `was reported ${ageHours.toFixed(0)}h ago, past the ${staleAfterHours}h freshness this file `
          + "already declares for a gate result. Same rule, same reason: a number nobody has re-read is "
          + "not a current one." });
    }
  });
  return findings;
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
  // Counted rows only. `all` stays complete for state lookups; `open` is what the document reports.
  const open = countable(all.filter((i) => i.state === "OPEN"));
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
