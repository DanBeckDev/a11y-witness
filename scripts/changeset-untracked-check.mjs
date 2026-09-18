#!/usr/bin/env node
// command: refuse with the RIGHT message when the tree carries an untracked changeset
//
// #1127: `npx changeset status --since=<base>` reads the changeset directory through git, so a
// changeset file that has not been `git add`ed does not exist to it -- and it prints the message for
// having written NONE at all ("Some packages have been changed but no changesets were found. Run
// changeset add to resolve this error."). That is the message for the wrong state: the file is there,
// correct, and one `git add` away from working. An author who has just written a changeset and is told
// none was found concludes the gate is broken, which is a night spent on `ci.yml` rather than on `git
// add .changeset/whatever.md`.
//
// PURE PARSE, THEN A THIN CLI -- `untrackedChangesetReason` takes `git status --porcelain`'s own text and
// returns a message or `null`, so it is tested directly against a fixture string with no git process
// involved, the shape this repo already favours (`parseWorktreeList`, `worktreeStatus` in
// `packages/agent-org/src/prune-worktrees.mjs` / `row-claim.mjs`).
//
// RETURNS `null` RATHER THAN THROWING WHEN NOTHING IS UNTRACKED, and that is load-bearing: the caller
// (`ci.yml`'s `changeset` job) must fall through to the EXISTING `npx changeset status` step unchanged in
// that case, so the genuine-absence message ("no changesets were found", when none was written at all)
// is untouched. Making the untracked case loud by making the genuine-absence case quiet would move the
// defect rather than fix it.
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";
import { sandboxGitEnv } from "../packages/guards/src/git-env.mjs";
// RELATIVE, NOT `@a11ign/worker-fleet/cli-flags` -- this script is a root script, matching
// `ci-changed.mjs`'s own rule: the package specifier resolves to `dist/`, which a fresh checkout
// does not have built yet.
import { refuseUnknownFlags } from "../packages/worker-fleet/src/cli-flags.mjs";

/**
 * Untracked `.changeset/*.md` paths from `git status --porcelain -- .changeset`'s own text.
 * `README.md` is never a changeset entry (it is the directory's own doc) and is excluded by name,
 * matching every other reader of this directory in this repo.
 * @param {string} porcelain
 * @returns {string[]}
 */
export function untrackedChangesetPaths(porcelain) {
  return porcelain
    .split("\n")
    .filter((line) => line.startsWith("??"))
    .map((line) => line.slice(3).trim())
    .filter((path) => path.endsWith(".md") && !path.endsWith("/README.md") && path !== "README.md");
}

/**
 * The message for the state `changeset status` cannot see, or `null` when there is nothing untracked.
 * @param {string} porcelain
 * @returns {string | null}
 */
export function untrackedChangesetReason(porcelain) {
  const paths = untrackedChangesetPaths(porcelain);
  if (paths.length === 0) return null;
  return "An untracked changeset exists and is invisible to `changeset status`, which reads the "
    + `changeset directory through git: ${paths.join(", ")}. Run \`git add ${paths.join(" ")}\` and `
    + "re-run this check -- this is NOT the same state as having written no changeset at all.";
}

function main() {
  refuseUnknownFlags([], { entry: import.meta.url, command: "node scripts/changeset-untracked-check.mjs" });
  const porcelain = execFileSync("git", ["status", "--porcelain", "--", ".changeset"],
    { encoding: "utf8", env: sandboxGitEnv() });
  const reason = untrackedChangesetReason(porcelain);
  if (reason) {
    process.stderr.write(`::error::${reason}\n`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) {
  main();
}
