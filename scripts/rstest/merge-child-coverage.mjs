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
 * THE MERGE: rstest's report, plus what children covered, converted by rstest's own provider under the same options
 * that built the report, so only the report's own population is added to. Hit counts ADD (istanbul's merge), so a
 * file both imported and spawned counts both.
 * @param {{ report: Record<string, unknown>, entries: ChildEntry[], options: ReturnType<typeof coverageOptionsFromC8rc>,
 *           root: string }} input
 * @returns {Promise<{ merged: CoverageMap, childFiles: string[] }>}
 */
export async function mergeChildCoverage({ report, entries, options, root }) {
  const provider = new CoverageProvider(/** @type {any} */ (options), root);
  const merged = provider.createCoverageMap();
  merged.merge(/** @type {any} */ (report));
  const children = entries.length > 0 ? await provider.resolveRawCoverage([{ entries, root }]) : null;
  const childFiles = children?.files() ?? [];
  for (const file of childFiles) merged.merge({ [file]: /** @type {any} */ (children).fileCoverageFor(file).toJSON() });
  return { merged, childFiles };
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
  const c8rc = JSON.parse(readFileSync(join(ROOT, ".c8rc.json"), "utf8"));
  const options = coverageOptionsFromC8rc(c8rc, REPORTS_DIRECTORY);
  const rawDir = realpathSync(mkdtempSync(join(tmpdir(), "rstest-child-coverage-")));
  const run = spawnSync("npx", ["rstest", "run", "--config", "scripts/rstest/rstest.config.mjs", ...rstestCoverageArgs(options)],
    { cwd: ROOT, stdio: "inherit", env: { ...process.env, NODE_V8_COVERAGE: rawDir } });
  const reportPath = join(REPORTS_DIRECTORY, "coverage-final.json");
  if (!existsSync(reportPath)) {
    process.stderr.write(`merge-child-coverage: rstest wrote no ${reportPath} (exit ${run.status}) -- nothing to merge.\n`);
    process.exit(2);
  }
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  const alone = new CoverageProvider(/** @type {any} */ (options), ROOT).createCoverageMap();
  alone.merge(report);
  const before = coverageTotals(alone);
  const { merged, childFiles } = await mergeChildCoverage({ report, entries: childCoverageEntries(rawDir, ROOT), options, root: ROOT });
  writeFileSync(join(REPORTS_DIRECTORY, "coverage-final.merged.json"), JSON.stringify(merged.toJSON()));
  process.stdout.write(`merge-child-coverage: ${childFiles.length} file(s) gained child-process coverage.\n`
    + `  rstest alone: ${JSON.stringify(before)}\n  merged:       ${JSON.stringify(coverageTotals(merged))}\n`);
  rmSync(rawDir, { recursive: true, force: true });
  process.exit(run.status ?? 1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) await main();
