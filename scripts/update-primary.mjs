#!/usr/bin/env node
// THE ONE WAY TO UPDATE THE PRIMARY CHECKOUT — issue #126. Fetch, then detach at `origin/main`. Nothing
// else: no merge, no rebase, no branch, because the primary is read-only except fast-forward and the
// `post-checkout` hook will otherwise immediately undo anything this script leaves it on.
//
//   npm run primary:update
//
// Refuses outside the primary — running this in a worktree would detach it from whatever branch it holds,
// which is never what a worktree is for. `isPrimaryWorktree` is the same `.git`-is-a-directory check
// `pre-commit`/`post-checkout` already use, imported rather than restated.
import { execFileSync } from "node:child_process";
import { isPrimaryWorktree } from "./prune-worktrees.mjs";
import { sandboxGitEnv } from "./git-env.mjs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";
import { refuseUnknownFlags } from "@a11y-witness/worker-fleet/cli-flags";

const REPO = fileURLToPath(new URL("..", import.meta.url));

export function updatePrimary(root = REPO, run = (args) =>
  execFileSync("git", args, { cwd: root, env: sandboxGitEnv(), encoding: "utf8" })) {
  if (!isPrimaryWorktree(root)) {
    throw new Error(`${root} is not the primary checkout (its .git is a linked worktree's, not a real `
      + "directory) — this script only ever updates the primary. Use plain `git pull`/`git fetch` here.");
  }
  run(["fetch", "origin"]);
  run(["checkout", "--detach", "origin/main", "--quiet"]);
  return run(["rev-parse", "HEAD"]).trim();
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) {
  // Guarded per #164: takes no flags; --detach/--quiet go to git.
  refuseUnknownFlags([], { entry: import.meta.url, command: "node scripts/update-primary.mjs" });
  const sha = updatePrimary();
  console.log(`primary checkout detached at origin/main (${sha})`);
}
