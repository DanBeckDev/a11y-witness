#!/usr/bin/env node
// @ts-check
// command: refuse to file a backlog row via `gh issue create` when its body is missing a required
// section, or board/label it wrong -- see #844's own addition below for the second half
// #735: THE SAME GATE #707 PUT ON THE CLAIM SIDE, CALLED FROM THE FILING SIDE INSTEAD.
//
// #844: THE TEMPLATE CHECK ALONE STILL LET A FILED ROW LAND OFF THE BOARD. Measured by `product-manager`:
// five rows filed through this tool in one night were not on Project 2, and one carried no labels at all
// -- `gh issue create` needs neither, and this file checked only the body. So filing now also boards the
// new issue on Project 2 and moves its Status to match a label (`backlog` unless `--ready` is given, in
// which case `ready` -- never both), and REFUSES to report success until a fresh read-back confirms the
// label, the `Filed-by:` line and the Status all actually landed -- a row this cannot board is refused,
// not reported filed halfway.
//
// THE LABEL LANDS LAST, NOT AT `gh issue create` TIME, AND THAT ORDER IS LOAD-BEARING. Found by
// dogfooding this exact fix (#867, filed live with `--ready` while building it): a `ready` label present
// before the item has a Status makes the row itself the exact shape #747's own board-safety floor exists
// to catch (an OPEN `ready` issue with no Status), so `moveProjectStatus`'s own pre-write snapshot
// refused every `--ready` filing on itself, always. See `boardAndVerify`'s own header for the full
// account and why labelling last is safe.
//
// #883, dispatcher's ruling: A ROW ALSO GETS A `lane:<owner>` LABEL, DERIVED FROM ITS OWN `## Region`,
// SO READY IS READABLE BY LANE. Before this, a session watching Ready for its own lane could not tell an
// unlabelled row apart from one nobody had assigned -- `worker-config` held idle twice in one evening
// rather than self-select from an unlabelled column (the row's own filing cites both). The part that is
// the ruling rather than an implementation choice: the derivation reads `docs/lane-ownership.json`
// through `loadLanes`/`inLane`, THE SAME FUNCTIONS the merge guard (`workflow-lane-check.mjs`) reads --
// never a second, hand-typed spelling of the same rule that could drift from the guard that actually
// refuses the branch. A Region touching two lanes gets BOTH labels, never one picked silently (see
// `laneLabelsFor`); a Region touching none gets `lane:any`, a real answer, not a fallback. A missing or
// malformed lane file is CANNOT_ASK -- refused before `gh issue create` even runs, identically to the
// merge guard's own `laneVerdict` refusing rather than reading silence as "no path has a lane". The
// lane label(s) travel through the same "label lands last" step as the board label above, for the
// identical reason: the pre-write board snapshot must never see `ready` on a row with no Status, lane
// label or not. Backfilling pre-existing rows is deliberately out of scope here (dispatcher's own
// instruction) -- this only reaches rows filed from here on.
//
// #771: NOTHING RECORDS WHO FILED A ROW, SO A BACKFILL LIST CANNOT BE ADDRESSED. GitHub's `author` is the
// one fleet account for every row, and a `session:` label means CLAIMED, not filed (the 2026-09-09
// ruling) -- so for 25 of 27 rows measured missing a required section, nothing named who filed it, and an
// instruction to "send each filer its incomplete rows" could not be carried out. The two that COULD be
// attributed were attributed by accident: two from a session's own memory of filing them, one because
// `orchestrator` happened to write "Filed by `orchestrator`" in prose. That last one is the whole
// argument -- the information is useful, somebody wrote it by hand once, and nothing asked for it.
//
// So this writes `Filed-by: <session>` into the body -- a body LINE, never a label. A label means
// CLAIMED (the same ruling), and a `filed-by:*` label would put two different meanings in one namespace,
// exactly the collision #683 records: `session:` was asked to be both a claim about the present and a
// record of the past, and removing it on close (#754) destroyed the second. A body line has the property
// the label lacked: it is a record, so nothing later ever needs to remove it.
//
// `--session=<name>`, REQUIRED, the identical flag `row-claim.mjs` already uses for the same fact --
// never a separately-named flag (`--filed-by=`) a caller could set to anything unrelated to who is
// actually running this. One place a session states its identity, not two that could disagree.
//
// `.github/ISSUE_TEMPLATE/backlog-row.yml` marks Region, Acceptance and Open-check `required` -- but that
// is a GitHub issue FORM, and forms apply only in the web UI. Every row this fleet files goes through
// `gh issue create --body`, which bypasses the form entirely, and nobody discovered a row was incomplete
// until someone tried to claim it (#707). Measured 2026-09-09 (worker-capture, #735):
//
//   open rows examined: 76
//   missing at least one required section: 36
//     missing Region: 25 | Acceptance: 5 | Open-check: 28
//
//   #0-399    8 of 36 (22%)
//   #400-599  9 of 11 (82%)
//   #600-699  10 of 18 (56%)
//   #700+     9 of 11 (82%)   <- of the eleven newest, exactly two carried all three
//
// The rate rises with recency because the more the org files its own work with `gh issue create`, the
// more of the backlog becomes un-claimable -- the web form's enforcement never runs against that path.
//
// ceo's ruling: refuse at FILING, not only at claiming, so the cost lands on whoever holds the context,
// not on whoever picks the row up later. In worker-capture's own words, filing #677 without this:
//
//   "I wrote #677's Open-check myself and I am not confident it is the one `orchestrator` would have
//   written."
//
// NOT A SECOND IMPLEMENTATION. `missingTemplateFields` is #707's own pure function, imported from
// `row-claim/template-fields-rule.mjs` unchanged -- the identical rule row-claim already enforces at
// claim time, asked here one step earlier. A body that would pass this refuses nothing later, and a body
// that would fail `row-claim claim` cannot be filed in the first place.
//
// `cli-flags.test.ts`'s discovery guard requires EVERY argv-reading file here to call
// `refuseUnknownFlags`, on a small, CLOSED, shrink-only exemption list this file does not qualify for --
// so `KNOWN_GH_ISSUE_CREATE_FLAGS` below is `gh issue create --help`'s own flag surface (read 2026-09-09,
// gh's current stable release), not a subset this wrapper invented. A flag it does not yet know is
// refused with the near miss named, same as any other guarded CLI here -- the cost of a genuinely new
// `gh` flag arriving is a refusal naming it, not a silent pass-through. Every argument that IS known still
// passes through to `gh` unexamined -- this file checks nothing about VALUES, only that the flag NAME is
// one `gh issue create` actually reads, which is `refuseUnknownFlags`'s whole job everywhere else in this
// tree, applied to a wrapped external tool instead of to this file's own flags.
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { refuseUnknownFlags } from "../packages/worker-fleet/src/cli-flags.mjs";
import { missingTemplateFields } from "./row-claim/template-fields-rule.mjs";
import { moveProjectStatus, filedByLine, fetchLabels as fetchIssueLabels, ensureLabelsExist } from "./row-claim.mjs";
import { PROJECT_OWNER, PROJECT_NUMBER } from "./board-snapshot.mjs";
import { REPO } from "./repo-identity.mjs";
import { declaredRegionFiles } from "./region-paths.mjs";
import { loadLanes, inLane } from "./workflow-lane-check.mjs";

/** @type {(cmd: string, args: string[]) => string} */
const defaultRun = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8" });

/** `gh issue create --help`'s complete flag surface, long and short forms, plus its two inherited flags. */
const KNOWN_GH_ISSUE_CREATE_FLAGS = [
  "--assignee=", "-a",
  "--attach=",
  "--blocked-by=",
  "--blocking=",
  "--body=", "-b",
  "--body-file=", "-F",
  "--editor", "-e",
  "--label=", "-l",
  "--milestone=", "-m",
  "--parent=",
  "--project=", "-p",
  "--recover=",
  "--template=", "-T",
  "--title=", "-t",
  "--type=",
  "--web", "-w",
  "--help",
  "--repo=", "-R",
];

/**
 * The body text THIS invocation would file, read from its own argv exactly the way `gh issue create`
 * itself would: `--body <text>`, `--body=<text>`, `--body-file <path>`, or `--body-file=<path>`. `null`
 * when none of the four forms is present -- this tool has nothing to check, and says so rather than
 * guessing or letting `gh` file an unchecked body.
 *
 * A `--body-file` value of `-` (gh's own convention for "read stdin") is read as `null` rather than as a
 * literal filename: this wrapper runs synchronously and has no stdin capture of its own, and misreading
 * `-` as a path would throw `ENOENT` on a caller doing exactly what `gh`'s own docs describe.
 *
 * @param {string[]} argv
 * @returns {string | null}
 */
export function bodyFromArgv(argv) {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--body") return argv[i + 1] ?? null;
    if (arg.startsWith("--body=")) return arg.slice("--body=".length);
    if (arg === "--body-file") {
      const path = argv[i + 1];
      if (!path || path === "-") return null;
      return readFileSync(path, "utf8");
    }
    if (arg.startsWith("--body-file=")) {
      const path = arg.slice("--body-file=".length);
      if (path === "-") return null;
      return readFileSync(path, "utf8");
    }
  }
  return null;
}

/**
 * THE VERDICT, PURE -- `null` means proceed. Reuses #707's `missingTemplateFields` outright rather than
 * re-deriving it; see this file's header for why that matters here specifically.
 * @param {string | null} body
 * @returns {string | null}
 */
export function fileRefusalReason(body) {
  if (body === null) {
    return "row-file: no --body or --body-file (or --body-file -) found in these arguments -- this tool "
      + "cannot check a body it cannot read, so it refuses rather than filing one unchecked. Pass one of "
      + "them so the three required sections (Region, Acceptance, Open-check) can be checked before this "
      + "reaches GitHub.";
  }
  const missing = missingTemplateFields(body);
  if (missing.length === 0) return null;
  return `row-file: REFUSING to file -- missing ${missing.join(", ")}. The issue template requires all `
    + "three (Region, Acceptance, Open-check) but the web form that enforces that does not apply to "
    + "`gh issue create`. Add the missing section(s) as a `## <Field>` heading with real content under "
    + "it, then file again -- whoever claims this row later has less context than you have right now.";
}

/**
 * The `--session=<name>` value, or `null` when absent -- the same convention `row-claim.mjs` requires for
 * dispatch/claim/decline, reused rather than a second, independently-typed flag.
 * @param {string[]} argv
 * @returns {string | null}
 */
export function sessionFromArgv(argv) {
  const flag = argv.find((a) => a.startsWith("--session="));
  return flag ? flag.slice("--session=".length) : null;
}

/**
 * `body` with a trailing `Filed-by: <session>` line -- the whole of #771's record. Appended after the
 * body's own trailing whitespace is trimmed, so it always lands on its own line regardless of whether the
 * caller's body already ended with one.
 * @param {string} body @param {string} session
 * @returns {string}
 */
export function appendFiledBy(body, session) {
  return `${body.replace(/\s+$/, "")}\n\nFiled-by: ${session}\n`;
}

/**
 * `argv` with any `--body`/`--body-file` form removed and replaced by a single `--body <augmentedBody>`,
 * and `--session=`/`--ready` removed entirely -- `gh issue create` knows neither and would refuse them
 * as unknown flags. Every other argument (title, labels, ...) passes through in its original position,
 * unchanged.
 * @param {string[]} argv @param {string} session @param {string} body the body BEFORE augmentation
 * @returns {string[]}
 */
export function withFiledBy(argv, session, body) {
  const kept = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--body" || arg === "--body-file" || arg === "--session") { i += 1; continue; }
    if (arg.startsWith("--body=") || arg.startsWith("--body-file=") || arg.startsWith("--session=")
      || arg === READY_FLAG) continue;
    kept.push(arg);
  }
  kept.push("--body", appendFiledBy(body, session));
  return kept;
}

// #844: THE ONE FLAG THIS FILE OWNS, NOT `gh`'s -- stripped by `withFiledBy` above the same way
// `--session=` is, so `refuseUnknownFlags`'s own gh-facing list never needs to know it.
const READY_FLAG = "--ready";

/**
 * #844: which label -- and which Project 2 Status option, by the SAME name -- this filing gets.
 * `backlog` unless `--ready` is explicitly given: a row filed with everything a claimant needs (Region,
 * Acceptance, Open-check already checked above) can go straight to the Ready lane; every other row
 * starts in Backlog, matching this repo's own convention that `ready` is a judgement about pickability
 * a filer states on purpose, never a default.
 * @param {string[]} argv
 * @returns {{ label: "backlog" | "ready", status: "Backlog" | "Ready" }}
 */
export function boardingFor(argv) {
  return argv.includes(READY_FLAG) ? { label: "ready", status: "Ready" } : { label: "backlog", status: "Backlog" };
}

/**
 * #883: which `lane:<owner>` label(s) this row's Region section touches -- derived from the SAME
 * `docs/lane-ownership.json` `workflow-lane-check.mjs`'s merge guard reads, via that file's own exported
 * `inLane` predicate, never a second, hand-typed opinion. That is the whole point rather than an
 * implementation choice: a hand-typed lane label can disagree with the guard that refuses the branch,
 * and then the row is worse than unlabelled -- it tells a lane it may take work the guard will reject
 * after the work is done. One source, and the label cannot disagree with the refusal.
 *
 * A REGION TOUCHING MULTIPLE LANES NAMES ALL OF THEM -- #883's own acceptance: "a Region touching two
 * lanes is a fact, not a coin toss... silently picking one is how a row ends up in a lane that cannot
 * merge it." A Region touching no lane's paths at all gets `lane:any`, a real answer (most tooling rows
 * are genuinely anybody's own), never a fallback standing in for "could not tell."
 *
 * `except` is subtracted the identical way `laneVerdict` subtracts it: a path excepted from a lane (a
 * generated file whose source lives elsewhere) must not pull that lane's label onto a row just because
 * the file happens to sit under the lane's directory.
 * @param {string[]} regionFiles
 * @param {{ lanes: import("./workflow-lane-check.mjs").Lane[] }} lanes
 * @returns {string[]}
 */
export function laneLabelsFor(regionFiles, lanes) {
  const owners = lanes.lanes
    .filter((lane) => regionFiles.some((f) => inLane(f, lane.paths) && !inLane(f, lane.except ?? [])))
    .map((lane) => lane.owner);
  return owners.length > 0 ? owners.map((owner) => `lane:${owner}`) : ["lane:any"];
}

/**
 * The issue number from `gh issue create`'s own stdout -- a bare URL, nothing else, on success. `null`
 * for anything that does not end in `/issues/<digits>`, so a caller can tell "filed, but I could not
 * read back what number it got" from a genuine number, rather than guessing.
 * @param {string} output
 * @returns {number | null}
 */
export function issueNumberFromUrl(output) {
  const match = /\/issues\/(\d+)\s*$/.exec(output.trim());
  return match ? Number(match[1]) : null;
}

/**
 * #844/#883: does a FRESH read-back confirm every record this filing wrote -- the board label, the
 * `lane:<owner>` label(s), the Filed-by line, and the Project Status? Named, not just a boolean: a
 * reader fixing a half-boarded row needs to know WHICH did not stick, not merely that something did not.
 * @param {{ labels: string[], body: string | null, boardStatus: string | null }} after
 * @param {{ session: string, label: string, status: string, laneLabels: string[] }} expected
 * @returns {string[]} empty when everything is confirmed
 */
export function unverifiedFilingFields(after, expected) {
  const missing = [];
  if (!after.labels.includes(expected.label)) missing.push(`the \`${expected.label}\` label`);
  const missingLanes = expected.laneLabels.filter((l) => !after.labels.includes(l));
  if (missingLanes.length > 0) missing.push(`${missingLanes.map((l) => `\`${l}\``).join("/")} label(s)`);
  if (after.body === null || filedByLine(after.body) !== expected.session) missing.push("the Filed-by line");
  if (after.boardStatus !== expected.status) {
    missing.push(after.boardStatus === null
      ? `Project ${PROJECT_NUMBER} membership`
      : `Project ${PROJECT_NUMBER} Status (reads "${after.boardStatus}", not "${expected.status}")`);
  }
  return missing;
}

/**
 * #844: is issue `issueNumber` on Project `PROJECT_NUMBER`, and what Status does it carry? A single
 * targeted GraphQL read of the one issue this filing just created -- never `board-snapshot.mjs`'s whole
 * `fetchBoardItems()` walk, which answers a different, much larger question (every item on the board) at
 * a cost this one-row check does not need to pay.
 * @param {number} issueNumber
 * @param {{ run?: typeof defaultRun }} [deps]
 * @returns {string | null} the Status option name, or `null` if the issue is not on this Project at all
 */
export function fetchIssueBoardStatus(issueNumber, { run = defaultRun } = {}) {
  const [owner, name] = REPO.split("/");
  const query = `query { repository(owner: "${owner}", name: "${name}") { issue(number: ${issueNumber}) `
    + `{ projectItems(first: 10) { nodes { project { number } fieldValueByName(name: "Status") `
    + `{ ... on ProjectV2ItemFieldSingleSelectValue { name } } } } } } }`;
  /** @type {string} */
  let raw;
  try {
    raw = run("gh", ["api", "graphql", "-f", `query=${query}`]);
  } catch (cause) {
    throw new Error(`row-file: could not read #${issueNumber}'s Project membership -- refusing to guess `
      + `whether it boarded. ${/** @type {Error} */ (cause).message}`, { cause });
  }
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw new Error(`row-file: gh's Project-membership response for #${issueNumber} was not JSON -- `
      + `refusing to guess. First 200 chars: ${raw.slice(0, 200)}`, { cause });
  }
  const nodes = /** @type {any} */ (parsed)?.data?.repository?.issue?.projectItems?.nodes;
  if (!Array.isArray(nodes)) {
    throw new Error(`row-file: gh's Project-membership response for #${issueNumber} did not have the `
      + `expected shape -- refusing to guess. Got: ${JSON.stringify(parsed).slice(0, 300)}`);
  }
  const onThisProject = nodes.find((/** @type {any} */ n) => n?.project?.number === PROJECT_NUMBER);
  return onThisProject?.fieldValueByName?.name ?? null;
}

/**
 * Every argument, unchanged, straight to the real `gh issue create`. Captures stdout (the created issue's
 * URL) instead of inheriting the terminal -- #844: this file now reports its OWN verdict after boarding
 * and reading it back, not `gh`'s raw output, and needs the URL to do either.
 * @param {string[]} argv
 * @returns {string} gh's own stdout, trimmed
 */
function spawnGhIssueCreate(argv) {
  return execFileSync("gh", ["issue", "create", ...argv], { encoding: "utf8" }).trim();
}

/**
 * #883: the lane label(s) for this row, or the refusal to print -- pulled out of `createIssue` to keep
 * that function's own complexity under this repo's gate, same shape as `boardAndVerify`'s own extraction:
 * one concept (derive from the file the merge guard reads, or refuse rather than guess) written out
 * rather than a genuinely separate responsibility. A missing or malformed `docs/lane-ownership.json` is
 * CANNOT_ASK, never "nothing has a lane" (the identical rule `workflow-lane-check.mjs`'s own `laneVerdict`
 * applies to the merge guard's side of the same file) -- refused BEFORE `gh issue create` runs, so
 * nothing is filed on a guess. `body` is assumed to already carry a `## Region` section: the only caller,
 * `createIssue`, checks that via `fileRefusalReason` first, so `declaredRegionFiles` cannot return `null`
 * here.
 * @param {string} body @param {typeof loadLanes} loadLanesConfig
 * @returns {{ ok: true, laneLabels: string[] } | { ok: false, message: string }}
 */
function laneLabelsOrRefusal(body, loadLanesConfig) {
  const lanes = loadLanesConfig();
  if (lanes === null) {
    return { ok: false, message: "row-file: could not read docs/lane-ownership.json (absent, empty or "
      + "malformed) -- refusing to guess which lane this row belongs to. Nothing was filed." };
  }
  const regionFiles = /** @type {string[]} */ (declaredRegionFiles(body));
  return { ok: true, laneLabels: laneLabelsFor(regionFiles, lanes) };
}

/**
 * Checks, then (only if it passes) files, with `Filed-by:` and a board label appended into the body/argv
 * that actually reach `gh`, adds the new issue to Project 2 with a matching Status, and REFUSES to
 * report success until a fresh read-back confirms all three landed -- #844: `row-file` used to hand a
 * created issue straight to `gh` with nothing else, so the filer had to remember the board and the
 * labels by hand, and five rows filed one night landed off Project 2, one (#844's own measurement) with
 * no labels at all. A row this cannot board is refused, not reported filed halfway: it prints exactly
 * which of the three did not stick and a distinct exit code, never a plain success for a row nothing
 * else can find.
 *
 * Injectable `spawnGh`/`run`/`fetchBoardStatus`/`loadLanesConfig` so a test can prove every step -- the
 * label composed into argv, the lane derivation, the board-add call, the Status move, and the read-back
 * -- without spawning a real `gh`, reaching GitHub, or reading a real `docs/lane-ownership.json`.
 * @param {string[]} argv
 * @param {{ spawnGh?: (argv: string[]) => string, run?: typeof defaultRun,
 *   fetchBoardStatus?: typeof fetchIssueBoardStatus, fetchLabels?: typeof fetchIssueLabels,
 *   moveStatus?: typeof moveProjectStatus, ensureLabels?: typeof ensureLabelsExist,
 *   loadLanesConfig?: typeof loadLanes }} deps
 * @returns {number} the process exit code
 */
export function createIssue(argv, deps = {}) {
  // A single spread merge, not seven per-property default values -- each `x = defaultX` in a destructured
  // parameter is its own branch for this repo's complexity gate, and `createIssue` already carries the
  // real decision points (session/template/lane refusals, the `gh` try/catch, the two post-file checks).
  // Injectable so a test can prove every step -- the label composed into argv, the lane derivation, the
  // board-add call, the Status move, and the read-back -- without spawning a real `gh`, reaching GitHub,
  // or reading a real `docs/lane-ownership.json`.
  const { spawnGh, run, fetchBoardStatus, fetchLabels, moveStatus, ensureLabels, loadLanesConfig } = {
    spawnGh: spawnGhIssueCreate, run: defaultRun, fetchBoardStatus: fetchIssueBoardStatus,
    fetchLabels: fetchIssueLabels, moveStatus: moveProjectStatus, ensureLabels: ensureLabelsExist,
    loadLanesConfig: loadLanes, ...deps,
  };
  const session = sessionFromArgv(argv);
  if (!session) {
    process.stderr.write("row-file: --session=<name> is required -- Filed-by: is taken from the session "
      + "filing the row, never guessed and never left blank.\n");
    return 1;
  }
  const body = bodyFromArgv(argv);
  const reason = fileRefusalReason(body);
  if (reason) {
    process.stderr.write(`${reason}\n`);
    return 1;
  }
  // #883: THE LANE(S), DERIVED BEFORE ANYTHING IS FILED -- see `laneLabelsOrRefusal`'s own header for why
  // a missing/malformed `docs/lane-ownership.json` refuses here rather than guessing.
  const laneResult = laneLabelsOrRefusal(/** @type {string} */ (body), loadLanesConfig);
  if (!laneResult.ok) {
    process.stderr.write(`${laneResult.message}\n`);
    return 1;
  }
  const laneLabels = laneResult.laneLabels;
  const boarding = boardingFor(argv);
  // #844: THE BOARD LABEL IS NOT ADDED HERE -- see `boardAndVerify`'s own header for why it has to wait
  // until AFTER the Project Status is set, not merely after the issue exists. The lane label(s) travel
  // with it for the identical reason and the same simplicity: one label-add step, not two.
  const filedArgv = withFiledBy(argv, session, /** @type {string} */ (body));

  /** @type {string} */
  let url;
  try {
    url = spawnGh(filedArgv);
  } catch (error) {
    process.stderr.write(`row-file: gh issue create failed -- nothing was filed. `
      + `${/** @type {Error} */ (error).message}\n`);
    return /** @type {{ status?: number }} */ (error).status ?? 1;
  }
  const issueNumber = issueNumberFromUrl(url);
  if (issueNumber === null) {
    process.stderr.write(`row-file: FILED, but could not read an issue number back from gh's own output `
      + `-- cannot board it or verify it. gh printed: ${url}\n`);
    return 2;
  }

  const result = boardAndVerify({ issueNumber, url, boarding, session, laneLabels },
    { run, fetchBoardStatus, fetchLabels, moveStatus, ensureLabels });
  if (!result.ok) {
    process.stderr.write(`row-file: ${result.message}\n`);
    return 2;
  }
  process.stdout.write(`https://github.com/${REPO}/issues/${issueNumber}\n`);
  return 0;
}

/**
 * #844: board the freshly-created issue, set its Status, ONLY THEN add the board label, and finally
 * read all three records back -- pulled out of `createIssue` to keep that function's own complexity
 * under this repo's gate; it is the same one concept (board it, then prove it) written out, rather than
 * a genuinely separate responsibility.
 *
 * THE LABEL GOES ON LAST, AND THAT ORDER IS LOAD-BEARING, FOUND BY DOGFOODING THIS EXACT FIX (#867,
 * filed live with `--ready` while building this row): `moveStatus` snapshots the WHOLE board first
 * (#399's own rule), and #747's own floor inside that snapshot refuses if any OPEN `ready`-labelled
 * issue has no Status. A `ready` label added at CREATION time -- before the item is even on the board,
 * let alone has a Status -- makes the freshly-filed row itself the exact row that floor exists to catch,
 * refusing every `--ready` filing, always, on its own snapshot. Labelling AFTER the Status is set means
 * no reader (including this filing's own next step) ever sees `ready` without a Status: the row is
 * either not yet labelled `ready` at all (invisible to that floor, same as an ordinary unlabelled issue)
 * or fully consistent (labelled AND Statused) by the time anything could ask.
 * @param {{ issueNumber: number, url: string, boarding: { label: string, status: string },
 *   session: string, laneLabels: string[] }} filed
 * @param {{ run: typeof defaultRun, fetchBoardStatus: typeof fetchIssueBoardStatus,
 *   fetchLabels: typeof fetchIssueLabels, moveStatus: typeof moveProjectStatus,
 *   ensureLabels: typeof ensureLabelsExist }} deps
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
function boardAndVerify({ issueNumber, url, boarding, session, laneLabels },
  { run, fetchBoardStatus, fetchLabels, moveStatus, ensureLabels }) {
  try {
    run("gh", ["project", "item-add", String(PROJECT_NUMBER), "--owner", PROJECT_OWNER, "--url", url]);
  } catch (error) {
    return { ok: false, message: `FILED as #${issueNumber}, but could NOT add it to Project `
      + `${PROJECT_NUMBER} -- refusing to report success for a row nothing else can find. `
      + `${/** @type {Error} */ (error).message}\n  Add it by hand: gh project item-add ${PROJECT_NUMBER} `
      + `--owner ${PROJECT_OWNER} --url ${url}` };
  }
  const statusResult = moveStatus(issueNumber, boarding.status, { run });
  if (!statusResult.moved) {
    return { ok: false, message: `FILED as #${issueNumber} and added to Project ${PROJECT_NUMBER}, but `
      + `its Status could not be set to "${boarding.status}" -- ${statusResult.reason}` };
  }
  const allLabels = [boarding.label, ...laneLabels];
  try {
    // #883: `lane:<owner>` is a PER-DERIVATION label -- `lane:dispatcher`, `lane:any`, whatever the
    // Region maps to -- and #749's own lesson applies identically here: `gh issue edit --add-label`
    // refuses a label that does not already exist in the repository. `ensureLabels` (row-claim.mjs's own
    // `ensureLabelsExist`, reused rather than a second copy) creates it idempotently first.
    ensureLabels(allLabels, { run });
    run("gh", ["issue", "edit", String(issueNumber), "--repo", REPO,
      ...allLabels.flatMap((l) => ["--add-label", l])]);
  } catch (error) {
    return { ok: false, message: `FILED as #${issueNumber}, boarded with Status "${boarding.status}", `
      + `but ${allLabels.map((l) => `\`${l}\``).join("/")} could not be added -- `
      + `${/** @type {Error} */ (error).message}` };
  }

  /** @type {string | null} */
  let bodyAfter;
  try {
    bodyAfter = run("gh", ["issue", "view", String(issueNumber), "--repo", REPO, "--json", "body",
      "--jq", ".body"]);
  } catch {
    bodyAfter = null; // read-back failure reads as "cannot confirm the Filed-by line", not a crash
  }
  const after = {
    labels: fetchLabels(issueNumber, { run }).labels,
    body: bodyAfter,
    boardStatus: fetchBoardStatus(issueNumber, { run }),
  };
  const missing = unverifiedFilingFields(after,
    { session, label: boarding.label, status: boarding.status, laneLabels });
  if (missing.length > 0) {
    return { ok: false, message: `FILED as #${issueNumber}, but the read-back does not confirm it -- `
      + `missing: ${missing.join(", ")}. Refusing to report success for a row it could not fully board.` };
  }
  return { ok: true };
}

function main() {
  refuseUnknownFlags([...KNOWN_GH_ISSUE_CREATE_FLAGS, "--session=", READY_FLAG],
    { entry: import.meta.url, command: "npm run row-file --" });
  process.exitCode = createIssue(process.argv.slice(2));
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) main();
