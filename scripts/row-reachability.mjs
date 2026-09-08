// @ts-check
// IS THIS ROW STARTABLE? -- computed from the tree, never from a label.
//
// Ready showed four unclaimed rows, none `fleet-gated`, so by every label the lane read fully pickable.
// It was not. Measured 2026-09-07: the honest pickable count was 3 where the label count said 4, and on
// one earlier evening the true count was 1.
//
//   #143  held by an unmerged `lead/*` branch
//   #171  its step 1 is unreproducible on `main` -- the fixture is another row's unmerged groundwork
//   #186  `dirOnOriginMain` EXISTS ON NO REF BUT ONE, and that one is an open, conflicting PR
//
// **Every one of those rows is correctly classified.** They are `ready`, they are not `fleet-gated`, and
// nothing about their labels is wrong. The classification simply cannot express the fact, so the lane
// count is right about its labels and wrong about the work.
//
// NOT A LABEL, AND THAT IS THE WHOLE DESIGN. A hand-applied `blocked-behind-branch` is a fact stated
// twice and drifts the moment the branch merges, leaving a row marked blocked by something that landed --
// worse than no label, because it reads as current. This computes the answer at the moment it is asked.
//
// THE CHECK IS "DOES THIS ROW'S SUBJECT EXIST ON `main` YET", NOT "IS ANYONE ELSE IN THESE FILES".
// #186 is the case that forces the distinction and a naive implementation scores it CLEAR: nobody is
// editing `board-summary-check.mjs`, and the row is unstartable anyway because the function it is about
// is not in it. Region contention is the easier half and falls out of the same walk.
//
//   node scripts/row-reachability.mjs <issue-number>
//   node scripts/row-reachability.mjs --row=<issue-number>
//
// IT REPORTS; IT NEVER REFUSES A CLAIM. A row can be worth starting for reasons this cannot see -- the
// blocking PR may land in ten minutes, or the worker may intend to build on that branch deliberately.
// Exit codes say what was found, and `row-claim` prints it as a warning rather than acting on it: a check
// that blocks on an inference this coarse gets bypassed, and then it is not consulted at all.
//
// Exit codes are the contract:
//   0  STARTABLE   -- the subject is on `main` and no unmerged branch is in its region
//   1  BLOCKED     -- and it NAMES what on, because "wait" and "wait for X" are different instructions
//   2  CANNOT ASK  -- a lookup failed. INCONCLUSIVE, never "startable": reporting an unaskable question
//                     as clear is how a worker loses an evening at step 1
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { refuseUnknownFlags } from "@a11ign/worker-fleet/cli-flags";
import { REPO } from "./repo-identity.mjs";
import { sandboxGitEnv } from "./git-env.mjs";

const EXIT = { STARTABLE: 0, BLOCKED: 1, CANNOT_ASK: 2 };

/** @type {(args: string[]) => string} */
const git = (args) => execFileSync("git", args,
  { encoding: "utf8", env: sandboxGitEnv(), stdio: ["ignore", "pipe", "pipe"] });
/** @type {(args: string[]) => string} */
const gh = (args) => execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

/** Repo-relative source paths named anywhere in the row — its region, and whatever else it cites. */
const PATH_IN_PROSE = /(?:^|[\s`"'(])((?:packages|scripts|docs|\.github)\/[A-Za-z0-9/_.-]+\.[A-Za-z]{2,4})/g;

/**
 * IDENTIFIERS THE ROW IS ABOUT — the subject, as opposed to the region.
 *
 * A row names its subject in backticks: `dirOnOriginMain`, `RULE_CRITERIA`, `stalenessReason`. Only
 * multi-word-cased tokens are taken (camelCase or SCREAMING_SNAKE), because a lowercase backticked word
 * is far more often prose (`ready`, `main`, `git show`) than a symbol, and a check that treats every
 * quoted word as a subject reports every row blocked and is then ignored.
 */
const SYMBOL_IN_PROSE = /`([a-z][A-Za-z0-9]*[A-Z][A-Za-z0-9]*|[A-Z][A-Z0-9]+_[A-Z0-9_]+)`/g;

/** @type {(values: string[]) => string[]} */
const unique = (values) => [...new Set(values)];

/**
 * NOTHING TO CHECK — and "named nothing" and "named PROSE" are two different sentences (#228).
 *
 * The `.md` filter is correct: there is no symbol to verify in a README, and pretending to check one
 * would be worse than saying nothing. But dropping prose paths silently made this tell a docs row it
 * "names no source path" when it named one, in a Region field filled in correctly -- sending its author
 * to fix something that is not broken.
 *
 * Extracted from `startability` because adding the second branch took that function past the complexity
 * ceiling, which is the lint rule doing its job rather than an obstacle to route around.
 *
 * @param {number} row
 * @param {{paths: number, symbols: number, prose?: number}} examined
 * @returns {{code: number, lines: string[]} | null} null when there IS something to check.
 */
function examinedNothing(row, examined) {
  if (examined.paths > 0 || examined.symbols > 0) return null;
  if ((examined.prose ?? 0) > 0) {
    return { code: EXIT.CANNOT_ASK, lines: [
      `CANNOT SAY whether #${row} is startable: it names ${examined.prose} document(s) and no source `
      + "path or symbol.",
      "  Its Region is prose, and this checks code: there is no symbol to look for in a README, and",
      "  pretending to verify one would be worse than saying nothing.",
      "  NOT a missing Region: do not add one. Judge a docs row by reading it.",
    ] };
  }
  return { code: EXIT.CANNOT_ASK, lines: [
    `CANNOT SAY whether #${row} is startable: it names no source path and no symbol this can check.`,
    "  A row with no Region and no backticked identifier gives this nothing to examine, and reporting",
    "  STARTABLE having examined nothing is the defect this repo records most.",
  ] };
}

/**
 * THE VERDICT, PURE — so every state is reachable without a network or a checkout.
 *
 * `null` for a lookup means it failed and is never read as an empty answer, the distinction this whole
 * tool exists to preserve one level up.
 *
 * @param {{row: number,
 *          subjectsMissing: {name: string, refs: string[]}[] | null,
 *          heldRegions: {path: string, refs: string[]}[] | null,
 *          blockedLabel?: boolean,
 *          state?: string | null,
 *          closedAt?: string | null,
 *          examined: {paths: number, symbols: number, prose?: number}}} facts
 * @returns {{code: number, lines: string[]}}
 */

export function startability({ row, subjectsMissing, heldRegions, examined, blockedLabel,
  state, closedAt }) {
  // A CLOSED ROW GETS NO VERDICT AT ALL, not a verdict with a note attached (#218).
  //
  // Measured 2026-09-07: #83 read `STARTABLE: no unmerged branch is in its region`, and BOTH sentences
  // were true -- nothing held the region and every symbol was on `main`, BECAUSE THE WORK WAS DONE AND
  // MERGED twenty-five minutes earlier. A worker was dispatched on that reading and it cost nothing only
  // because they checked GitHub themselves.
  //
  // This returns EARLY rather than appending a caveat: a green light with a note beside it is still a
  // green light, and the role file's target for units dispatched at closed rows is zero. The state was in
  // the query being made for the labels the whole time -- one field away, which is what makes it the
  // #208 limit reached one field earlier than the limit that sentence describes.
  if (state && state !== "OPEN") {
    return { code: EXIT.BLOCKED, lines: [
      `#${row} IS ${state}${closedAt ? ` (${closedAt})` : ""} — there is nothing to start.`,
      "  Region and symbol checks say nothing here: a finished row's region is clear and its symbols are",
      "  on `main` BECAUSE the work landed. That reads exactly like a green light, and is why this",
      "  refuses to print one.",
    ] };
  }
  if (subjectsMissing === null || heldRegions === null) {
    return { code: EXIT.CANNOT_ASK, lines: [
      `CANNOT SAY whether #${row} is startable: a lookup failed.`,
      "  INCONCLUSIVE, not clear. Reporting an unaskable question as startable is how somebody loses an",
      "  evening discovering it at step 1, which is the whole reason this check exists.",
    ] };
  }
  const nothingToCheck = examinedNothing(row, examined);
  if (nothingToCheck) return nothingToCheck;

  const lines = [];
  if (blockedLabel) {
    lines.push(`CARRIES THE \`blocked\` LABEL: somebody has recorded that this row waits on something.`,
      "  This tool checks regions and symbols; a row blocked by another ROW is invisible to both, which is",
      "  why the label is read rather than inferred from the prose that states it.");
  }
  for (const { name, refs } of subjectsMissing) {
    lines.push(`SUBJECT NOT ON main: \`${name}\` exists only on ${refs.join(", ")}.`,
      "  The row is about code that has not landed. Building on `main` finds nothing to change; building",
      "  on that branch means editing somebody's open work. Wait for it, or take the row WITH its branch.");
  }
  for (const { path, refs } of heldRegions) {
    lines.push(`REGION HELD: \`${path}\` has unmerged changes on ${refs.join(", ")}.`,
      "  Startable, but you will merge against them. Worth knowing before you begin, not at review.");
  }
  if (subjectsMissing.length > 0 || blockedLabel) return { code: EXIT.BLOCKED, lines };
  if (heldRegions.length > 0) {
    return { code: EXIT.STARTABLE,
      lines: [...lines,
        `#${row} is STARTABLE — its subject is on \`main\`.`,
        "  The contention above is a merge cost, not a blocker."] };
  }
  return { code: EXIT.STARTABLE,
    lines: [`#${row} is STARTABLE: every symbol it names is on \`main\`, and no unmerged branch is in its `
      + `region (${examined.paths} path(s), ${examined.symbols} symbol(s) examined).`,
    "  This checks REGIONS, SYMBOLS and the `blocked` label. A row can still be blocked by something none",
    "  of those express -- an unstated dependency, a decision nobody has taken -- so STARTABLE means "
      + "\"nothing I can see\", never \"nothing blocks this\"."] };
}

/**
 * THE STATE OF THE PR ON A BLOCKING REF, because "wait" and "nobody is coming" are different instructions.
 *
 * Measured 2026-09-07: #171's subject lives on `agent/identify-input-purpose-79`, whose PR **#89 is
 * CLOSED** — the work moved elsewhere and that branch will never merge. #186's lives on
 * `pm/reported-directory-159`, whose **PR #172 is OPEN**. Reported identically before this, and they are
 * not the same situation: a row blocked behind an abandoned branch is arguably not blocked at all, it is
 * a row whose subject nobody is currently building, which is a decision for a person rather than a wait.
 *
 * IT DOES NOT CHASE THE SUCCESSOR. Nothing links that branch to the row that replaced it except prose,
 * and inferring it would be the coarse guess this tool deliberately keeps away from its own verdict.
 * Report the state; let the reader draw the line.
 *
 * A ref with no PR at all is not an error — plenty of branches never open one — so it reports `no PR`
 * rather than failing, and an unreadable answer says so instead of implying `none`.
 */
/**
 * ONE LISTING, NOT ONE CALL PER REF — with a per-ref fallback so a truncated page cannot lie.
 *
 * The region half can name a dozen branches for one file (`ci.yml` currently has six), and a `gh` call
 * each would make the tool slow enough that people stop running it before dispatching, which is the
 * failure `row-claim` exists to prevent. So the map is built once.
 *
 * BUT A BOUNDED LISTING IS THE DEFECT THIS SESSION HAS CORRECTED MOST: a page that stops short would
 * report a real PR as `no PR`, which is the *worse* direction here — it turns "wait for it" into
 * "nobody is coming". So a ref MISSING from the map is not answered from the map; it falls through to
 * the authoritative per-ref query. Truncation then costs an extra call and never a wrong answer.
 */
/** @type {Map<string, string[]> | undefined} */
let prMap;
function prStateMap() {
  if (prMap) return prMap;
  prMap = new Map();
  try {
    for (const pr of JSON.parse(gh(["pr", "list", "--repo", REPO, "--state", "all",
      "--limit", "400", "--json", "number,state,headRefName"]))) {
      const key = /** @type {{ headRefName: string }} */ (pr).headRefName;
      prMap.set(key, [...(prMap.get(key) ?? []), `PR #${pr.number} ${pr.state}`]);
    }
  } catch {
    // An unreadable listing leaves the map EMPTY, so every ref falls through to its own query rather
    // than being reported as `no PR` on the strength of a call that failed.
  }
  return prMap;
}

/** @param {string} ref */
function prState(ref) {
  const branch = ref.replace(/^origin\//, "");
  const known = prStateMap().get(branch);
  if (known) return known.join(", ");
  try {
    const found = JSON.parse(gh(["pr", "list", "--repo", REPO, "--head", branch, "--state", "all",
      "--json", "number,state"]));
    if (!Array.isArray(found) || found.length === 0) return "no PR";
    return found.map((pr) => `PR #${pr.number} ${pr.state}`).join(", ");
  } catch {
    return "PR state unreadable";
  }
}

/** Every remote branch except `main` — the population an unmerged claim is measured against. */
function unmergedRefs() {
  return git(["for-each-ref", "--format=%(refname:short)", "refs/remotes/origin"]).split("\n")
    .map((r) => r.trim()).filter((r) => r && r !== "origin/main" && !r.startsWith("origin/HEAD"));
}

/** @param {string} path */
const onMain = (path) => {
  try {
    git(["cat-file", "-e", `origin/main:${path}`]);
    return true;
  } catch {
    return false;
  }
};

/**
 * Which refs carry this symbol in this file? Read from the BLOB, never from a branch name.
 * @param {string} path
 * @param {string} symbol
 * @param {string[]} refs
 */
function refsCarrying(path, symbol, refs) {
  /** @type {string[]} */
  const carrying = [];
  for (const ref of refs) {
    try {
      if (git(["show", `${ref}:${path}`]).includes(symbol)) carrying.push(ref);
    } catch { /* the file does not exist on that ref */ }
  }
  return carrying;
}

/** @param {number} row */
function facts(row) {
  const issue = JSON.parse(gh(["issue", "view", String(row), "--repo", REPO,
    "--json", "body,labels,state,closedAt"]));
  const body = issue.body ?? "";
  // THE BOARD'S OWN RECORD, not prose. A row can be blocked by another ROW -- #77 is "blocked behind
  // #35's schema migration" and carries the `blocked` label -- and neither its region nor its symbols say
  // so. Reading the LABEL is not the prose-parsing this tool refuses elsewhere: it is the same
  // authoritative record `row-claim` already trusts for `in-progress`.
  const blockedLabel = (issue.labels ?? []).some((/** @type {any} */ l) => l?.name === "blocked");
  // THE ROW'S OWN STATE, and it was in this query's reach the whole time. See `startability`.
  const state = typeof issue.state === "string" ? issue.state : null;
  const closedAt = typeof issue.closedAt === "string" ? issue.closedAt : null;
  // PROSE PATHS ARE COUNTED, NOT DISCARDED. The `.md` filter is correct -- there is no symbol to verify
  // in a README, and pretending to check one would be worse than saying nothing. But dropping them
  // SILENTLY made the verdict say a docs row "names no source path" when it named one, which sent the
  // reader to add a Region that was already there.
  const named = unique([...body.matchAll(PATH_IN_PROSE)].map((m) => m[1]));
  const paths = named.filter((path) => !path.endsWith(".md"));
  const prose = named.filter((path) => path.endsWith(".md"));
  const symbols = unique([...body.matchAll(SYMBOL_IN_PROSE)].map((m) => m[1]));
  const refs = unmergedRefs();

  // THE #186 CASE FIRST. A symbol the row is about, absent from every file the row names on `main` and
  // present on some other ref, means the row's subject has not landed -- which no region check can see,
  // because nobody is editing the file it is missing from.
  const present = paths.filter(onMain);
  const mainText = present.map((p) => git(["show", `origin/main:${p}`])).join("\n");
  const subjectsMissing = [];
  for (const name of symbols) {
    if (mainText.includes(name)) continue;
    const carriers = unique(present.flatMap((p) => refsCarrying(p, name, refs)));
    if (carriers.length > 0) {
      subjectsMissing.push({ name, refs: carriers.map((ref) => `${ref} (${prState(ref)})`) });
    }
  }

  // BOTH DIFFS, AND EACH ALONE GIVES A WRONG ANSWER. This tool produced both wrong answers in turn, on
  // its first two runs, which is why the conjunction is spelled out rather than assumed.
  //
  //   THREE-DOT `origin/main...<ref>` -- what the ref changed since the MERGE BASE. Stays non-empty for
  //     work already on `main` under a different sha (a squash, a cherry-pick, a re-resolved merge), so
  //     it reported a branch that merged hours earlier as holding a region. That is the fourth state --
  //     content-merged is neither "unmerged" nor "absent" -- which this session corrected in three other
  //     people's claims tonight and then committed here, in the tool written to compute it.
  //
  //   TWO-DOT `origin/main <ref>` -- how the blobs DIFFER, in either direction. Non-empty for any branch
  //     merely BEHIND `main`, because `main` has moved on. That reported EIGHTY-FIVE branches as holding
  //     one file, which is not a report anyone reads.
  //
  // A ref genuinely holds a path when it has changed that path since the merge base AND the result still
  // differs from `main`: its own work, not yet landed. Neither condition is sufficient; the pair is.
  /** @type {{ path: string, refs: string[] }[]} */
  const heldRegions = [];
  /** @param {string[]} range @param {string} path */
  const changed = (range, path) => {
    try {
      return git(["diff", "--numstat", ...range, "--", path]).trim().length > 0;
    } catch { return false; }
  };
  for (const path of present) {
    const holders = refs.filter((ref) => changed([`origin/main...${ref}`], path)
      && changed(["origin/main", ref], path));
    // THE SAME FACT THE SUBJECT HALF ALREADY REPORTS. `(PR #89 CLOSED)`, `(PR #172 OPEN)` and `(no PR)`
    // are three different messages: nobody is coming, wait for it, and somebody's unproposed work. The
    // fifth state was solved for the subject half in #208 and not carried across, so the two halves of
    // one tool said different amounts about the same branch -- and a reader takes an undecorated
    // `REGION HELD` as "wait for that to land" even when the branch is dead.
    // A MERGED BRANCH CANNOT HOLD A REGION AGAINST YOU, and neither git diff can tell that on its own.
    // A SQUASH merge leaves the branch's commits off `main`, so three-dot stays non-empty, and `main`
    // has moved on, so two-dot does too -- the pair I added to defeat the fourth state does not defeat
    // this form of it. Measured: `agent/changeset-packed-check-132 (PR #151 MERGED)` was reported as
    // holding `ci.yml`. The PR state is the authoritative record git cannot reconstruct.
    //
    // THE FAILURE MODE THIS ACCEPTS, named rather than hidden: a branch that was merged and then REUSED
    // for new commits is dropped here, and it does genuinely hold. That is rare, and the alternative --
    // listing every squash-merged branch for ever -- is the eighty-five-branch report nobody reads.
    const live = holders.map((ref) => ({ ref, state: prState(ref) }))
      .filter(({ state }) => !/\bMERGED\b/.test(state));
    if (live.length > 0) {
      heldRegions.push({ path, refs: live.map(({ ref, state }) => `${ref} (${state})`) });
    }
  }
  return { row, subjectsMissing, heldRegions, blockedLabel, state, closedAt,
    examined: { paths: paths.length, symbols: symbols.length, prose: prose.length } };
}

function main() {
  // GUARDED THOUGH NOTHING CURRENTLY REQUIRES IT. `cli-flags.test.ts`'s census walks
  // `packages/{lab,worker-fleet}/{src,scripts}` and cannot see top-level `scripts/` -- which is #164, and
  // is why this file could have shipped unguarded without a single test objecting. Guarding it because it
  // is right, not because something asked.
  refuseUnknownFlags(["--row"], { entry: import.meta.url, command: "node scripts/row-reachability.mjs" });
  const argv = process.argv.slice(2);
  const row = Number(argv.map((a) => a.replace(/^--row=/, "")).find((a) => /^\d+$/.test(a)));
  if (!row) {
    console.error("Usage: node scripts/row-reachability.mjs <issue-number>\n"
      + "Answers whether a row can be STARTED today, computed from the tree rather than from its labels.");
    process.exit(EXIT.CANNOT_ASK);
  }
  let verdict;
  try {
    verdict = startability(facts(row));
  } catch (error) {
    verdict = startability({ row, subjectsMissing: null, heldRegions: null,
      examined: { paths: 0, symbols: 0 } });
    verdict.lines.push(`  ${String(error).slice(0, 200)}`);
  }
  const write = verdict.code === EXIT.STARTABLE ? console.log : console.error;
  for (const line of verdict.lines) write(line);
  process.exit(verdict.code);
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) main();
