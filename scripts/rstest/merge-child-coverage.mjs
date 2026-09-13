#!/usr/bin/env node
// @ts-check
// command: run the suite under rstest with coverage, then merge in what spawned `node` children covered (#1350)

/**
 * #1350, rstest adoption F2 (BLOCKER), under #1317: COVERAGE OF SCRIPTS THE SUITE RUNS AS CHILD PROCESSES.
 *
 * WHY THEY READ 0%. `@rstest/coverage-v8` 0.11.12 collects IN-PROCESS: each rstest worker opens a `node:inspector`
 * session and calls `Profiler.startPreciseCoverage` / `takePreciseCoverage` (`dist/index.js`; `NODE_V8_COVERAGE`
 * and `child_process` appear nowhere in the package). A test that runs `node scripts/x.mjs` starts a process with no
 * session, so x.mjs is never seen. c8 sees it because c8 works through `NODE_V8_COVERAGE`, which Node honours in
 * every process that inherits it. Measured on #1315: 7 files c8 covers read 0% under rstest, 3 of them run by their
 * own tests as children.
 *
 * THE FIX, measured on #1350 before it was written:
 * - **`NODE_V8_COVERAGE` set in the environment rstest runs in** reaches every forked worker AND every child a test
 *   spawns (probe: both read it). Each child writes raw V8 coverage when it exits; the workers leave no raw file of
 *   their own, and the rstest process's own file names no repo source the report covers.
 * - **Converted by rstest's OWN converter, never c8's.** `CoverageProvider.resolveRawCoverage` turned a child's raw
 *   coverage of `capture-status.mjs` into 116 statements, 16 functions and 44 branches: exactly rstest's own report
 *   entry for that file. c8's units differ (a median 4.94x per file on #1315), so converting with c8 and merging would
 *   add numbers measured in two units.
 * - **Folded onto rstest's OWN maps by start position, never merged as a second map.** Measured on the whole suite at
 *   `0f48ac1e`: istanbul's map merge DOUBLED the statement maps of 103 of 244 files, because a file the suite also imports
 *   has an in-process entry whose end columns differ from the child's (e.g. `None` against `100`), so each statement
 *   arrived twice and every statement, function and branch denominator grew. By START position, 8,739 of 8,816 child
 *   statements, all 2,041 functions and 3,078 of 3,094 branches sit on a structure rstest already has. Child hits are
 *   added to those; the rest are COUNTED as unmatched and not added, so every denominator stays rstest's own.
 * - **Filtered by the provider's OWN include and exclude, the options that built the report.** `resolveRawCoverage`
 *   drops an entry outside them (measured: a child's coverage of a file outside `include` never reaches the map), so a
 *   child that ran a file outside `.c8rc.json`'s population adds nothing and the threshold's population holds. This
 *   file keeps no second copy of that rule: an earlier filter of its own was redundant with it, and a mutation
 *   removing that filter survived.
 * - **The population comes from `.c8rc.json`, passed on rstest's command line** (`--coverage.include` and
 *   `--coverage.exclude` repeat), so `rstest.config.mjs` is unchanged and the two tools cannot drift apart on it.
 *
 *   node scripts/rstest/merge-child-coverage.mjs
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CoverageProvider } from "@rstest/coverage-v8";
// RELATIVE, the reason every other script here gives: the flag guard and the npx resolver need no build.
import { refuseUnknownFlags } from "../../packages/worker-fleet/src/cli-flags.mjs";
// #492: a bare "npx" spawn is ENOENT on windows-2022; `npm-cli-windows-spawn.test.ts` refuses one.
import { npmCliInvocation } from "../npm-cli-executable.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const REPORTS_DIRECTORY = join(ROOT, "coverage", "rstest");

/** @typedef {ReturnType<CoverageProvider["createCoverageMap"]>} CoverageMap */
/** @typedef {{ include: string[], exclude: string[] }} C8Population */
/** @typedef {{ url: string, filePath: string, functions: unknown[], scriptId?: string }} ChildEntry */

/**
 * rstest's coverage options for `.c8rc.json`'s own population -- read, never retyped. `reportOnFailure`, because the
 * suite has a host-dependent failure (no Chrome) and a coverage report is still the answer to a coverage question.
 * @param {C8Population} c8rc @param {string} reportsDirectory
 */
export function coverageOptionsFromC8rc(c8rc, reportsDirectory) {
  return {
    enabled: true, provider: /** @type {"v8"} */ ("v8"), include: [...c8rc.include], exclude: [...c8rc.exclude],
    reporters: ["json"], reportsDirectory, clean: true, allowExternal: false, reportOnFailure: true,
  };
}

/**
 * The same options as `rstest run` flags. Include and exclude REPEAT, one flag per pattern.
 * @param {ReturnType<typeof coverageOptionsFromC8rc>} options
 * @returns {string[]}
 */
export function rstestCoverageArgs(options) {
  return [
    "--coverage", "--coverage.provider", options.provider,
    ...options.include.flatMap((pattern) => ["--coverage.include", pattern]),
    ...options.exclude.flatMap((pattern) => ["--coverage.exclude", pattern]),
    ...options.reporters.flatMap((reporter) => ["--coverage.reporters", reporter]),
    "--coverage.reportsDirectory", options.reportsDirectory,
    "--coverage.reportOnFailure",
  ];
}

/**
 * Every repo script a child ran, from `NODE_V8_COVERAGE`'s raw files, as the provider's entries. Only `file:` URLs
 * under `root` and outside `node_modules`; a query string (`?fresh-import=...`) is not part of the path.
 * @param {string} rawDir @param {string} root
 * @returns {ChildEntry[]}
 */
export function childCoverageEntries(rawDir, root) {
  /** @type {ChildEntry[]} */
  const entries = [];
  for (const name of readdirSync(rawDir).filter((file) => file.endsWith(".json"))) {
    const { result = [] } = JSON.parse(readFileSync(join(rawDir, name), "utf8"));
    for (const script of /** @type {{ url: string, functions: unknown[] }[]} */ (result)) {
      if (!script.url.startsWith("file:")) continue;
      const filePath = fileURLToPath(script.url.split("?")[0]);
      if (!filePath.startsWith(root) || filePath.includes(`${sep}node_modules${sep}`)) continue;
      entries.push({ ...script, url: pathToFileURL(filePath).href, filePath });
    }
  }
  return entries;
}

/**
/** @typedef {{ start: { line: number, column: number | null } }} Located */
/**
 * @typedef {{ statementMap: Record<string, Located>, s: Record<string, number>,
 *             fnMap: Record<string, { decl: Located, loc: Located }>, f: Record<string, number>,
 *             branchMap: Record<string, { loc: Located, locations: unknown[] }>, b: Record<string, number[]> }} FileData
 */

/** A structure's start, as a key. @param {Located} located */
const startOf = (located) => `${located.start.line}:${located.start.column}`;

/** The first id at each start. @param {Record<string, Located>} map */
function idsByStart(map) {
  /** @type {Map<string, string>} */
  const byStart = new Map();
  for (const [id, located] of Object.entries(map)) if (!byStart.has(startOf(located))) byStart.set(startOf(located), id);
  return byStart;
}

/**
 * ONE FILE: the child's hits added onto rstest's OWN statement, function and branch maps, matched by START position.
 * The base's maps are kept whole, so no denominator moves; a child structure with no base structure at its start
 * (or a branch with a different arm count) is counted in `unmatched`, not added. Pure: neither input is modified.
 * @param {FileData} base rstest's entry @param {FileData} child the converted child coverage of the same file
 * @returns {{ data: FileData, unmatched: { statements: number, functions: number, branches: number } }}
 */
export function foldByStart(base, child) {
  const data = /** @type {FileData} */ (structuredClone(base));
  const unmatched = { statements: 0, functions: 0, branches: 0 };
  const statementAt = idsByStart(data.statementMap);
  for (const [id, located] of Object.entries(child.statementMap)) {
    const target = statementAt.get(startOf(located));
    if (target === undefined) unmatched.statements += 1; else data.s[target] += child.s[id];
  }
  const functionAt = idsByStart(Object.fromEntries(Object.entries(data.fnMap).map(([id, fn]) => [id, fn.decl])));
  for (const [id, fn] of Object.entries(child.fnMap)) {
    const target = functionAt.get(startOf(fn.decl));
    if (target === undefined) unmatched.functions += 1; else data.f[target] += child.f[id];
  }
  const branchAt = idsByStart(Object.fromEntries(Object.entries(data.branchMap).map(([id, br]) => [id, br.loc])));
  for (const [id, branch] of Object.entries(child.branchMap)) {
    const target = branchAt.get(startOf(branch.loc));
    if (target === undefined || data.b[target].length !== child.b[id].length) { unmatched.branches += 1; continue; }
    data.b[target] = data.b[target].map((hits, arm) => hits + child.b[id][arm]);
  }
  return { data, unmatched };
}

/**
 * THE MERGE: rstest's report, with what children covered converted by rstest's own provider (under the options that
 * built the report) and FOLDED onto each file's existing entry by `foldByStart`. A child file the report does not list
 * has no entry to fold onto and adds nothing, so the report's population and every denominator are unchanged.
 * @param {{ report: Record<string, FileData>, entries: ChildEntry[], options: ReturnType<typeof coverageOptionsFromC8rc>,
 *           root: string }} input
 * @returns {Promise<{ merged: CoverageMap, childFiles: string[], unmatched: { statements: number, functions: number,
 *           branches: number } }>}
 */
export async function mergeChildCoverage({ report, entries, options, root }) {
  const provider = new CoverageProvider(/** @type {any} */ (options), root);
  const children = entries.length > 0 ? await provider.resolveRawCoverage([{ entries, root }]) : null;
  const folded = { ...report };
  const childFiles = [];
  const unmatched = { statements: 0, functions: 0, branches: 0 };
  for (const file of children?.files() ?? []) {
    if (!(file in report)) continue;
    const result = foldByStart(report[file], /** @type {any} */ (children).fileCoverageFor(file).toJSON());
    folded[file] = result.data;
    childFiles.push(file);
    for (const kind of /** @type {const} */ (["statements", "functions", "branches"])) unmatched[kind] += result.unmatched[kind];
  }
  const merged = provider.createCoverageMap();
  merged.merge(/** @type {any} */ (folded));
  return { merged, childFiles, unmatched };
}

/** Lines, statements, functions and branches for a map, in rstest's units. @param {CoverageMap} map */
export function coverageTotals(map) {
  const summary = map.getCoverageSummary().toJSON();
  /** @param {{ covered: number, total: number, pct: number }} metric */
  const pick = ({ covered, total, pct }) => ({ covered, total, pct });
  return { lines: pick(summary.lines), statements: pick(summary.statements), functions: pick(summary.functions),
    branches: pick(summary.branches) };
}

async function main() {
  refuseUnknownFlags([], { entry: import.meta.url, command: "node scripts/rstest/merge-child-coverage.mjs" });
  const c8rc = JSON.parse(readFileSync(join(ROOT, ".c8rc.json"), "utf8"));
  const options = coverageOptionsFromC8rc(c8rc, REPORTS_DIRECTORY);
  const rawDir = realpathSync(mkdtempSync(join(tmpdir(), "rstest-child-coverage-")));
  const rstest = npmCliInvocation("npx",
    ["rstest", "run", "--config", "scripts/rstest/rstest.config.mjs", ...rstestCoverageArgs(options)]);
  const run = spawnSync(rstest.command, rstest.args, { cwd: ROOT, stdio: "inherit", env: { ...process.env, NODE_V8_COVERAGE: rawDir } });
  const reportPath = join(REPORTS_DIRECTORY, "coverage-final.json");
  if (!existsSync(reportPath)) {
    process.stderr.write(`merge-child-coverage: rstest wrote no ${reportPath} (exit ${run.status}) -- nothing to merge.\n`);
    process.exit(2);
  }
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  const alone = new CoverageProvider(/** @type {any} */ (options), ROOT).createCoverageMap();
  alone.merge(report);
  const before = coverageTotals(alone);
  const { merged, childFiles, unmatched } = await mergeChildCoverage(
    { report, entries: childCoverageEntries(rawDir, ROOT), options, root: ROOT });
  writeFileSync(join(REPORTS_DIRECTORY, "coverage-final.merged.json"), JSON.stringify(merged.toJSON()));
  process.stdout.write(`merge-child-coverage: ${childFiles.length} file(s) gained child-process coverage; `
    + `not folded (no base structure at the start): ${JSON.stringify(unmatched)}.\n`
    + `  rstest alone: ${JSON.stringify(before)}\n  merged:       ${JSON.stringify(coverageTotals(merged))}\n`);
  rmSync(rawDir, { recursive: true, force: true });
  process.exit(run.status ?? 1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) await main();
