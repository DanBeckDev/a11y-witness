#!/usr/bin/env node
// @ts-check
// command: print the nightly doc cross-reference report -- every doc-to-doc and doc-to-tree check, as markdown
//
// #905: FOURTEEN checks that ask whether one document still agrees with another, or with the tree, used to run
// only as pull-request tests -- so a doc could drift out from under them between PRs and nobody heard until the
// next unrelated PR went red for it. Each check now lives ONCE, in `scripts/doc-checks/<name>.mjs`: the test
// that used to hold it asserts on that module, and this report runs the same module. There is no second copy
// to drift from the first.
//
// A REPORT, NOT A GATE. It always exits 0, whatever it finds: the nightly workflow (#948) posts what this
// prints, and a doc disagreement is information for a person, never a reason for a job to go red. It never
// calls `gh` either -- posting is the workflow's job.
//
// IT NEVER SAYS "NO PROBLEMS". A check that examined nothing is printed as "examined 0", and a check that could
// not run at all (no git remote, no network) is named with the reason -- a report that read nothing and
// reported clean is the exact failure this repo keeps paying for.
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { flagValue, refuseUnknownFlags } from "../packages/worker-fleet/src/cli-flags.mjs";
import { sandboxGitEnv } from "./git-env.mjs";
import * as actionReference from "./doc-checks/action-reference.mjs";
import * as adrIndex from "./doc-checks/adr-index.mjs";
import * as adrStatus from "./doc-checks/adr-status.mjs";
import * as checkTransferUrls from "./doc-checks/check-transfer-urls.mjs";
import * as claudeMdLinks from "./doc-checks/claude-md-links.mjs";
import * as commandsDocumented from "./doc-checks/commands-documented.mjs";
import * as docCitationIntegrity from "./doc-checks/doc-citation-integrity.mjs";
import * as docReferences from "./doc-checks/doc-references.mjs";
import * as envDocCoverage from "./doc-checks/env-doc-coverage.mjs";
import * as knownGapsIndex from "./doc-checks/known-gaps-index.mjs";
import * as notWorkingNumbering from "./doc-checks/not-working-numbering.mjs";
import * as rolesMemory from "./doc-checks/roles-memory.mjs";
import * as rolesReadme from "./doc-checks/roles-readme.mjs";
import * as schemaMigrationCitations from "./doc-checks/schema-migration-citations.mjs";

const REPO = fileURLToPath(new URL("..", import.meta.url));
const TESTS = "packages/lab/src/packaging";

/**
 * @typedef {import("./doc-checks/check-result.mjs").CheckResult} CheckResult
 * @typedef {{ name: string, test: string | null, check: (root: string) => CheckResult | Promise<CheckResult> }} DocCheck
 * @typedef {{ name: string, test: string | null } & ({ result: CheckResult } | { error: string })} Outcome
 */

/**
 * The fourteen. `test` is the pull-request test that asserts the same thing, so a reader of a disagreement
 * knows what will say it again on the next PR -- and `null` for the six #954 took OFF the pull-request path,
 * where this report is the only thing that still reads the rule. Those six are not less checked than they
 * were; they are checked once a night instead of on every diff, which is the trade #905 argued and #928's
 * rule made safe by making this report post first. `doc-cross-reference-report.test.ts` holds the list of
 * nulls to exactly the files that no longer exist, so a resurrected guard cannot sit here unnoticed.
 * @type {DocCheck[]}
 */
export const CHECKS = [
  { name: "action-reference", test: null, check: actionReference.check },
  { name: "adr-index", test: `${TESTS}/adr-index.test.ts`, check: adrIndex.check },
  { name: "adr-status", test: null, check: adrStatus.check },
  { name: "check-transfer-urls", test: `${TESTS}/check-transfer-urls.test.ts`, check: (root) => checkTransferUrls.check(root) },
  { name: "claude-md-links", test: `${TESTS}/claude-md-links.test.ts`, check: claudeMdLinks.check },
  { name: "commands-documented", test: `${TESTS}/commands-documented.test.ts`, check: commandsDocumented.check },
  { name: "doc-citation-integrity", test: null, check: docCitationIntegrity.check },
  { name: "doc-references", test: null, check: docReferences.check },
  { name: "env-doc-coverage", test: null, check: envDocCoverage.check },
  { name: "known-gaps-index", test: `${TESTS}/known-gaps-index.test.ts`, check: knownGapsIndex.check },
  { name: "not-working-numbering", test: null, check: notWorkingNumbering.check },
  { name: "roles-memory", test: `${TESTS}/roles-memory.test.ts`, check: rolesMemory.check },
  { name: "roles-readme", test: `${TESTS}/roles-readme.test.ts`, check: rolesReadme.check },
  { name: "schema-migration-citations", test: `${TESTS}/schema-migration-citations.test.ts`, check: schemaMigrationCitations.check },
];

/**
 * Runs every check against `root`. A check that throws is an outcome -- "could not run, because" -- never a
 * crash that loses the other thirteen, and never a silent zero.
 * @param {string} root @param {DocCheck[]} [checks] @returns {Promise<Outcome[]>}
 */
export async function runChecks(root, checks = CHECKS) {
  /** @type {Outcome[]} */
  const outcomes = [];
  for (const { name, test, check } of checks) {
    try {
      outcomes.push({ name, test, result: await check(root) });
    } catch (error) {
      outcomes.push({ name, test, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return outcomes;
}

/** A markdown table cell: pipes escaped, newlines flattened. @param {string | number} value */
const cell = (value) => String(value).replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");

/**
 * An inline-code cell that survives backticks in its value -- a cited path or URL can carry one (a URL quoted
 * inside backticks in source): the fence is one backtick longer than the longest run inside.
 * @param {string} value
 */
function code(value) {
  const text = cell(value);
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(longest + 1);
  return longest ? `${fence} ${text} ${fence}` : `${fence}${text}${fence}`;
}

/** @param {Outcome[]} outcomes */
function tally(outcomes) {
  const ran = outcomes.flatMap((o) => ("result" in o ? [o.result] : []));
  return {
    disagreements: ran.reduce((sum, r) => sum + r.disagreements.length, 0),
    examinedNothing: ran.filter((r) => r.examined === 0).length,
    couldNotRun: outcomes.length - ran.length,
  };
}

/**
 * The one-line verdict. Zero disagreements is stated as a count, and it is qualified whenever any check read
 * nothing or could not run -- "0 of what" is the question the line must answer by itself.
 * @param {Outcome[]} outcomes @returns {string}
 */
export function headline(outcomes) {
  const { disagreements, examinedNothing, couldNotRun } = tally(outcomes);
  const ran = outcomes.length - couldNotRun;
  const parts = [`**${disagreements} disagreement(s)** across the ${ran} of ${outcomes.length} checks that ran`];
  if (examinedNothing) parts.push(`${examinedNothing} of them examined 0 -- a zero from those says nothing`);
  if (couldNotRun) parts.push(`**${couldNotRun} could not run** (named below)`);
  return `${parts.join("; ")}.`;
}

/**
 * Where the same thing is asserted again: the pull-request test, or -- for the six #954 retired -- this
 * report, named as such rather than as an empty cell. A blank there reads as "nobody checks this".
 * @param {Outcome} o @returns {string}
 */
const assertedBy = (o) => (o.test ? `\`${o.test}\`` : "this report, nightly (#954)");

/** @param {Outcome} o @returns {string} */
function summaryRow(o) {
  if (!("result" in o)) return `| ${o.name} | could not run | -- | ${assertedBy(o)} |`;
  const { examined, unit, disagreements } = o.result;
  // "No verdict" only when it also named nothing: a missing top-level doc is a disagreement found by reading 0.
  const read = examined > 0 ? `${examined} ${cell(unit)}`
    : `**examined 0** ${cell(unit)}${disagreements.length ? "" : " -- nothing to check, so no verdict"}`;
  return `| ${o.name} | ${read} | ${disagreements.length} | ${assertedBy(o)} |`;
}

/** @param {Outcome} o @returns {string[]} */
function disagreementSection(o) {
  if (!("result" in o) || o.result.disagreements.length === 0) return [];
  return [
    "", `### ${o.name} -- ${o.result.disagreements.length} disagreement(s)`, "",
    "| where | reference | why |", "|---|---|---|",
    ...o.result.disagreements.map((d) => `| ${code(d.where)} | ${code(d.reference)} | ${cell(d.why)} |`),
  ];
}

/**
 * WHAT WAS READ, in terms a reader can act on -- #954.
 *
 * This said `Read against /home/runner/work/a11y-witness/a11y-witness`, which is where the nightly job's
 * checkout happened to sit and tells a reader nothing they can check out. A commit alone is not enough
 * either: `at 464edf9c` does not say whether that was `main` or somebody's branch. So it names the REF and
 * the commit when the root is a git work tree, and falls back to the path only for a fixture tree, which is
 * the one case where the path IS the identity.
 * @param {{ root: string, commit?: string | null, ref?: string | null }} context @returns {string}
 */
function readAgainst({ root, commit = null, ref = null }) {
  if (!commit) return `Read against \`${root}\`.`;
  return `Read against \`${ref ?? "a detached HEAD"}\` at \`${commit}\`.`;
}

/**
 * The report's markdown. Pure, so the test reads exactly what the workflow would post.
 * @param {Outcome[]} outcomes
 * @param {{ root: string, commit?: string | null, ref?: string | null }} context @returns {string}
 */
export function renderReport(outcomes, { root, commit = null, ref = null }) {
  const failed = outcomes.flatMap((o) => ("error" in o ? [o] : []));
  return [
    "## Doc cross-reference report", "",
    `${headline(outcomes)} ${readAgainst({ root, commit, ref })}`, "",
    "| check | examined | disagreements | the test that asserts the same |", "|---|---|---|---|",
    ...outcomes.map(summaryRow),
    ...outcomes.flatMap(disagreementSection),
    ...(failed.length ? ["", "### Could not run", "", ...failed.map((o) => `- **${o.name}**: ${cell(o.error)}`)] : []),
    "",
  ].join("\n");
}

/**
 * WHAT GITHUB WILL ACCEPT IN ONE COMMENT -- #954, and it is a REFUSAL, not a trim.
 *
 * `gh issue comment` over this many characters answers HTTP 422 and posts NOTHING, so the night the report
 * finally has a lot to say is the night it says nothing at all -- the failure mode this whole report exists
 * to avoid, arriving through the door nobody watched. The 21 `a11ign/a11ign` URLs already make it 4,774
 * characters; one bad rename across the docs would clear 65,536 without difficulty.
 */
export const COMMENT_LIMIT = 65_536;

/**
 * The report cut to `limit`, losing DETAIL ROWS and never the summary.
 *
 * WHAT SURVIVES IS CHOSEN, not whatever the first N characters happen to be: the headline, the per-check
 * table (every check, its examined count and its disagreement COUNT) and the "could not run" section, which
 * is the one part that says a check did not happen at all. A `slice(0, limit)` would have cut exactly those
 * loose, since they are the parts a long report pushes off the end.
 *
 * The notice says how many rows went, so a reader is never told a smaller number than the report found.
 * @param {string} report @param {number} [limit] @returns {string}
 */
export function fitToComment(report, limit = COMMENT_LIMIT) {
  if (report.length <= limit) return report;
  const failedAt = report.indexOf("\n### Could not run\n");
  const tail = failedAt === -1 ? "" : report.slice(failedAt);
  const lines = (failedAt === -1 ? report : report.slice(0, failedAt)).split("\n");
  const firstDetail = lines.findIndex((line) => line.startsWith("### "));
  const kept = firstDetail === -1 ? lines.slice() : lines.slice(0, firstDetail);
  const detail = firstDetail === -1 ? [] : lines.slice(firstDetail);
  const rows = detail.filter((line) => line.startsWith("| `")).length;
  const notice = (/** @type {number} */ dropped) =>
    `\n_TRUNCATED: ${dropped} of ${rows} disagreement row(s) are not shown -- the whole report would be `
    + `${report.length} characters and GitHub refuses a comment over ${limit}. The counts above are complete; `
    + "run `node scripts/doc-cross-reference-report.mjs` for every row._\n";
  const budget = limit - tail.length - notice(rows).length;
  let shown = 0;
  for (const line of detail) {
    if (kept.join("\n").length + line.length + 1 > budget) break;
    kept.push(line);
    if (line.startsWith("| `")) shown += 1;
  }
  return `${kept.join("\n")}${notice(rows - shown)}${tail}`;
}

/**
 * The ref `root`'s HEAD is on, named the way a reader would check it out -- the tracking branch
 * (`origin/main`) where there is one, else the local branch, else null for a detached HEAD. #954: the
 * nightly job checks out `main`, so this is what turns a bare commit into an answerable claim.
 * @param {string} root @returns {string | null}
 */
function refAt(root) {
  const git = (/** @type {string[]} */ args) =>
    execFileSync("git", args, { cwd: root, env: sandboxGitEnv(), encoding: "utf8", stdio: "pipe" }).trim();
  for (const args of [["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], ["rev-parse", "--abbrev-ref", "HEAD"]]) {
    try {
      const ref = git(args);
      // A detached HEAD answers the second call with the word HEAD, which names nothing a reader can fetch.
      if (ref && ref !== "HEAD") return ref;
    } catch {
      continue; // no upstream configured, or not a work tree: try the next spelling, then give up
    }
  }
  return null;
}

/** The commit `root` is at, or null outside a git work tree; the report names what it read. @param {string} root */
function commitAt(root) {
  try {
    return execFileSync("git", ["rev-parse", "--short=12", "HEAD"], { cwd: root, env: sandboxGitEnv(), encoding: "utf8", stdio: "pipe" }).trim();
  } catch {
    return null; // not a git work tree (a fixture, a tarball): the report says which root, just not which commit
  }
}

async function main() {
  refuseUnknownFlags(["--root"], { entry: import.meta.url, command: "node scripts/doc-cross-reference-report.mjs" });
  const root = resolve(flagValue(process.argv, "root") ?? REPO);
  try {
    const report = renderReport(await runChecks(root), { root, commit: commitAt(root), ref: refAt(root) });
    process.stdout.write(fitToComment(report));
  } catch (error) {
    // Even the report itself failing is printed, not thrown: exit 0 is this command's contract (see header).
    process.stdout.write(`## Doc cross-reference report\n\n**The report itself failed:** ${error instanceof Error ? error.stack : String(error)}\n`);
  }
  process.exitCode = 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) main();
