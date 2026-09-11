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
 * @typedef {{ name: string, test: string, check: (root: string) => CheckResult | Promise<CheckResult> }} DocCheck
 * @typedef {{ name: string, test: string } & ({ result: CheckResult } | { error: string })} Outcome
 */

/**
 * The fourteen, each with the test file that asserts on the same module -- so a reader of a disagreement
 * knows which test will say the same thing on the next pull request.
 * @type {DocCheck[]}
 */
export const CHECKS = [
  { name: "action-reference", test: `${TESTS}/action-reference.test.ts`, check: actionReference.check },
  { name: "adr-index", test: `${TESTS}/adr-index.test.ts`, check: adrIndex.check },
  { name: "adr-status", test: `${TESTS}/adr-status.test.ts`, check: adrStatus.check },
  { name: "check-transfer-urls", test: `${TESTS}/check-transfer-urls.test.ts`, check: (root) => checkTransferUrls.check(root) },
  { name: "claude-md-links", test: `${TESTS}/claude-md-links.test.ts`, check: claudeMdLinks.check },
  { name: "commands-documented", test: `${TESTS}/commands-documented.test.ts`, check: commandsDocumented.check },
  { name: "doc-citation-integrity", test: `${TESTS}/doc-citation-integrity.test.ts`, check: docCitationIntegrity.check },
  { name: "doc-references", test: `${TESTS}/doc-references.test.ts`, check: docReferences.check },
  { name: "env-doc-coverage", test: `${TESTS}/env-doc-coverage.test.ts`, check: envDocCoverage.check },
  { name: "known-gaps-index", test: `${TESTS}/known-gaps-index.test.ts`, check: knownGapsIndex.check },
  { name: "not-working-numbering", test: `${TESTS}/not-working-numbering.test.ts`, check: notWorkingNumbering.check },
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

/** @param {Outcome} o @returns {string} */
function summaryRow(o) {
  if (!("result" in o)) return `| ${o.name} | could not run | -- | \`${o.test}\` |`;
  const { examined, unit, disagreements } = o.result;
  // "No verdict" only when it also named nothing: a missing top-level doc is a disagreement found by reading 0.
  const read = examined > 0 ? `${examined} ${cell(unit)}`
    : `**examined 0** ${cell(unit)}${disagreements.length ? "" : " -- nothing to check, so no verdict"}`;
  return `| ${o.name} | ${read} | ${disagreements.length} | \`${o.test}\` |`;
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
 * The report's markdown. Pure, so the test reads exactly what the workflow would post.
 * @param {Outcome[]} outcomes @param {{ root: string, commit?: string | null }} context @returns {string}
 */
export function renderReport(outcomes, { root, commit = null }) {
  const failed = outcomes.flatMap((o) => ("error" in o ? [o] : []));
  return [
    "## Doc cross-reference report", "",
    `${headline(outcomes)} Read against \`${root}\`${commit ? ` at \`${commit}\`` : ""}.`, "",
    "| check | examined | disagreements | the test that asserts the same |", "|---|---|---|---|",
    ...outcomes.map(summaryRow),
    ...outcomes.flatMap(disagreementSection),
    ...(failed.length ? ["", "### Could not run", "", ...failed.map((o) => `- **${o.name}**: ${cell(o.error)}`)] : []),
    "",
  ].join("\n");
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
    process.stdout.write(renderReport(await runChecks(root), { root, commit: commitAt(root) }));
  } catch (error) {
    // Even the report itself failing is printed, not thrown: exit 0 is this command's contract (see header).
    process.stdout.write(`## Doc cross-reference report\n\n**The report itself failed:** ${error instanceof Error ? error.stack : String(error)}\n`);
  }
  process.exitCode = 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) main();
