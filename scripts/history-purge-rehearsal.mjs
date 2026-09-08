#!/usr/bin/env node
// @ts-check
// command: rehearse deleting non-standard refs and rewriting git history ahead of the org transfer
// ONE COMMAND FOR THE REHEARSAL -- delete non-standard refs, run the `git filter-repo` rewrite, rescan.
// #310, preparation for #63's org transfer and the repository going public.
//
// WHY THE REF-DELETION STEP EXISTS, AND WHY IT IS NOT OPTIONAL. Measured directly: a single rewrite pass
// (either `--replace-text` or a custom `--blob-callback`, both tried) left 246 of 2,268 matches across
// 76 of 715 paths untouched -- REPRODUCIBLE on a fresh clone, unchanged by a second pass. The cause was
// one non-standard ref, `refs/codex/turn-diffs/checkpoints/...`, pointing directly at a TREE rather than
// a commit -- `git filter-repo` prints "Unexpected object of type tree, skipping" and leaves every blob
// reachable ONLY through it untouched, while `git rev-list --objects --all` (what the scanner walks)
// still finds them. `refs/kanban/checkpoints/*` and `refs/tmp/pr*` are the same shape: tool-generated,
// ephemeral, not real project history, and not worth keeping through a transfer either way. Deleting
// every ref outside `refs/heads`, `refs/remotes` and `refs/tags` before the rewrite closed the gap to
// zero, verified against this repository's own history.
//
// A FRESH CLONE, NEVER ORIGIN. This tool REFUSES to run against a target path that is not inside a temp
// directory -- the one property that distinguishes "a disposable rehearsal clone" from "the checkout you
// are standing in". The transfer itself and the force-push to origin are explicitly the owner's hands,
// not this tool's.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";
import { refuseUnknownFlags, flagValue } from "@a11ign/worker-fleet/cli-flags";
import { sandboxGitEnv } from "./git-env.mjs";
import { scanHistory } from "./history-secret-scan.mjs";

/** @param {string} target */
function refuseUnlessDisposable(target) {
  const real = resolve(target);
  const disposableRoots = [tmpdir(), "/tmp", "/private/tmp", "/var/folders"];
  if (!disposableRoots.some((root) => real.startsWith(resolve(root)))) {
    console.error(`REFUSING: ${real} is not inside a temp directory (${disposableRoots.join(", ")}).\n`
      + "This tool rewrites history and must run against a disposable rehearsal clone, never against a\n"
      + "real checkout or origin. Pass --clone-into=<a path under one of those roots>, or omit the flag\n"
      + "to have one created automatically.");
    process.exit(2);
  }
}

/**
 * Every ref outside `refs/heads`, `refs/remotes` and `refs/tags` -- tool-generated checkpoint and
 * temporary refs, never real project history.
 * @param {string} repoDir
 * @returns {string[]}
 */
export function nonStandardRefs(repoDir) {
  const out = execFileSync("git", ["for-each-ref", "--format=%(refname)"],
    { cwd: repoDir, env: sandboxGitEnv(), encoding: "utf8" });
  return out.split("\n").filter(Boolean)
    .filter((ref) => !/^refs\/(heads|remotes|tags)\//.test(ref));
}

/** @param {string} repoDir @param {string[]} refs */
function deleteRefs(repoDir, refs) {
  for (const ref of refs) {
    execFileSync("git", ["update-ref", "-d", ref], { cwd: repoDir, env: sandboxGitEnv() });
  }
  execFileSync("git", ["reflog", "expire", "--expire=now", "--all"], { cwd: repoDir, env: sandboxGitEnv() });
  execFileSync("git", ["gc", "--prune=now"], { cwd: repoDir, env: sandboxGitEnv() });
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) {
  refuseUnknownFlags(["--source", "--clone-into", "--replacements"],
    { entry: import.meta.url, command: "node scripts/history-purge-rehearsal.mjs" });
  const source = flagValue(process.argv, "source");
  if (!source || !existsSync(source)) {
    console.error("Usage: node scripts/history-purge-rehearsal.mjs --source=<real repo> "
      + "[--clone-into=<path>] [--replacements=<file>]\n"
      + "--source must be a real, existing local repository to mirror-clone from.");
    process.exit(2);
  }
  const cloneInto = flagValue(process.argv, "clone-into")
    ?? mkdtempSync(join(tmpdir(), "history-purge-rehearsal-"));
  refuseUnlessDisposable(cloneInto);
  const replacements = flagValue(process.argv, "replacements")
    ?? fileURLToPath(new URL("./history-purge-replacements.txt", import.meta.url));

  console.error(`Mirror-cloning ${source} into ${cloneInto} ...`);
  execFileSync("git", ["clone", "--mirror", source, cloneInto], { env: sandboxGitEnv(), stdio: "inherit" });

  const stale = nonStandardRefs(cloneInto);
  console.error(`\nDeleting ${stale.length} non-standard ref(s) (checkpoint/tmp refs, not real history):`);
  for (const ref of stale) console.error(`  ${ref}`);
  deleteRefs(cloneInto, stale);

  console.error("\nRunning git filter-repo --replace-text ...");
  execFileSync("git", ["filter-repo", "--replace-text", replacements, "--force"],
    { cwd: cloneInto, env: sandboxGitEnv(), stdio: "inherit" });

  console.error("\nRe-scanning the rewritten history ...");
  const findings = await scanHistory(cloneInto);
  if (findings.length === 0) {
    console.log(`\nCLEAN: 0 findings in ${cloneInto} after the rewrite.`);
    process.exit(0);
  }
  console.error(`\n${findings.length} finding(s) remain in ${cloneInto} -- review before trusting the `
    + "rewrite. Run scripts/history-secret-scan.mjs --all --repo=<path> for the full report.");
  process.exit(1);
}
