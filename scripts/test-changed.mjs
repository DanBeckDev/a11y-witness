#!/usr/bin/env node
// @ts-check
// command: run only the tests a change can reach -- the local half of CI's scoped selection
//
// WHY THIS EXISTS. `select-changed-tests.mjs` has picked the reachable tests since #1160, and `ci.yml`'s
// `ts` job uses it -- but there was no npm entry, so locally the only choices were `npm run test:org`
// (8m57s, measured on a 14-core Mac) or nothing. That is why a development loop reached for the
// nine-minute command: it was the only one there.
//
// WHAT IT CAN AND CANNOT DO, stated because the number surprises people. On a one-file change it selects
// 17 tests PRECISELY and then adds ~173 always-run guards, because -- in the selector's own words -- "a
// guard whose population is the tree imports nothing from the file it governs, so no selection can reach
// it". So this is roughly half the suite, not a handful: about 190 files of 373. It is a real halving of
// the loop and it is NOT a path to seconds; the tree-walking guards are always-run by design and their
// cost is a separate piece of work.
//
// BROAD FALLS BACK TO EVERYTHING, never to a narrow run. When the diff touches ci.yml or a root config the
// selector reports BROAD and names no files, because a change there can reach anything. Answering that
// with a small set would be the "empty must read as run everything" defect the selector itself names.
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";
import { refuseUnknownFlags, flagValue } from "../packages/worker-fleet/src/cli-flags.mjs";
// NEVER a bare `npm`/`npx` spawn -- unsafe on Windows (CVE-2024-27980), and this repo's own
// guard refuses one anywhere in the tree. Same call shape as every other site.
import { npmCliInvocation } from "./npm-cli-executable.mjs";

const REPO = fileURLToPath(new URL("..", import.meta.url));

/** The selector's `key=value` report, as a map. @param {string} out */
export function parseSelection(out) {
  /** @type {Record<string, string>} */
  const fields = {};
  for (const line of out.split("\n")) {
    const at = line.indexOf("=");
    if (at > 0 && !line.slice(0, at).includes(" ")) fields[line.slice(0, at)] = line.slice(at + 1);
  }
  return fields;
}

function main() {
  refuseUnknownFlags(["--base"], { entry: import.meta.url, command: "npm run test:changed" });
  const base = flagValue(process.argv, "base") ?? process.env.A11Y_TEST_BASE ?? "origin/main";

  const selected = spawnSync("node", [`${REPO}scripts/select-changed-tests.mjs`, `--base=${base}`],
    { encoding: "utf8", cwd: REPO });
  if (selected.status !== 0 && selected.status !== null) {
    process.stderr.write(`test:changed: the selector could not answer against ${base} — running nothing `
      + "would be a claim about a population it never examined, so this falls back to the whole suite.\n"
      + `${selected.stderr ?? ""}`);
    process.exit(runAll());
  }
  const fields = parseSelection(selected.stdout ?? "");
  const files = (fields.testFiles ?? "").trim();
  if (fields.broad === "true" || files === "") {
    process.stdout.write("test:changed: BROAD — this diff can reach anything (ci.yml or a root config), "
      + "so the whole suite runs. A narrow answer here would be a guess.\n");
    process.exit(runAll());
  }
  const list = files.split(/\s+/).filter(Boolean);
  process.stdout.write(`test:changed: ${list.length} file(s) — ${fields.selectedCount} selected by `
    + `reference, ${fields.alwaysRunCount} always-run tree guards.\n`);
  // `--drop-empty`, the same flag `reusable-build-test.yml`'s broad-glob branch passes and for the same
  // reason: the selector's list can carry PACKAGE-LEVEL globs, and a package with no tests of its own
  // (guards, whose tests live in lab) matches none. Without it the floor refuses a zero-match glob -- which
  // is right when a human typed the glob and wrong when a generator produced it from the package list.
  process.exit(run(["--min=1", "--drop-empty", "--run", "--runner=rstest", ...list]));
}

/** @param {string[]} args */
function run(args) {
  const r = spawnSync("node", [`${REPO}packages/guards/src/assert-glob-not-empty.mjs`, ...args],
    { stdio: "inherit", cwd: REPO });
  return r.status ?? 1;
}

function runAll() {
  const { command, args } = npmCliInvocation("npm", ["run", "test:all"]);
  const r = spawnSync(command, args, { stdio: "inherit", cwd: REPO });
  return r.status ?? 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) main();
