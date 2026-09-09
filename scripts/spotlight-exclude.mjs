// @ts-check
// command: stop Spotlight indexing every git worktree on this machine
//
// `mds_stores` was the top CPU consumer on this host for most of 2026-09-09 -- 70-94%, for hours, with
// zero git processes running -- and `syspolicyd`, `trustd` and `diagnosticd` filled the rest of the top
// five. That is Spotlight indexing and Gatekeeper scanning 119 worktrees, each one a full copy of the
// source tree. `queue:table`'s section 5 reported it as contention with no cause until the consumers were
// named; naming them is what turned "the host is slow" into a thing with a remedy.
//
// THE PRUNE IS THE FIRST HALF AND THIS IS THE SECOND. Removing a merged worktree removes what Spotlight
// walks; this stops it walking the ones that must stay -- 54 dirty and 9 cherry-picked at the time of
// writing, none of them removable, all of them indexed.
//
// A MARKER IS PLACED, NEVER A VOLUME DISABLED. `mdutil -i off` acts on a whole volume and is the
// chairman's machine to decide about; `.metadata_never_index` is a per-directory opt-out that affects
// exactly the directories this repository created. Reversible with `rm`, and this script reports what it
// would do unless told to act -- #669's lesson, in the file written the same day: a command whose name
// reads as a report is one somebody runs to look.
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";
import { refuseUnknownFlags } from "../packages/worker-fleet/src/cli-flags.mjs";
import { sandboxGitEnv } from "./git-env.mjs";

const MARKER = ".metadata_never_index";

/**
 * Every worktree git knows about, primary included -- the primary is a checkout of this repository too,
 * and it is the largest one.
 * @param {{ run?: (args: string[]) => string }} [deps]
 * @returns {string[]}
 */
export function worktreePaths({ run = defaultRun } = {}) {
  return run(["worktree", "list", "--porcelain"]).split("\n")
    .filter((line) => line.startsWith("worktree "))
    .map((line) => line.slice("worktree ".length));
}

/**
 * Which paths still need a marker. Separated from placing it so the report and the action cannot disagree
 * about what the action would do -- the same split `prune-worktrees.mjs` carries for the same reason.
 * @param {string[]} paths
 * @param {{ exists?: (p: string) => boolean }} [deps]
 * @returns {{ needing: string[], already: string[] }}
 */
export function markerPlan(paths, { exists = existsSync } = {}) {
  /** @type {string[]} */ const needing = [];
  /** @type {string[]} */ const already = [];
  for (const path of paths) (exists(join(path, MARKER)) ? already : needing).push(path);
  return { needing, already };
}

/** @param {string[]} args */
function defaultRun(args) {
  return execFileSync("git", args, { env: sandboxGitEnv(), encoding: "utf8" });
}

async function main() {
  refuseUnknownFlags(["--apply"],
    { entry: import.meta.url, command: "node scripts/spotlight-exclude.mjs" });
  const apply = process.argv.includes("--apply");
  const { needing, already } = markerPlan(worktreePaths());
  const verb = apply ? "marked" : "WOULD MARK";
  process.stdout.write(`${verb} ${needing.length} worktree(s); ${already.length} already excluded\n`);
  for (const path of needing) {
    if (apply) writeFileSync(join(path, MARKER), "");
    process.stdout.write(`  ${path}\n`);
  }
  if (!apply && needing.length > 0) {
    process.stdout.write("nothing was written; pass --apply to place the markers\n");
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) {
  main();
}
