#!/usr/bin/env node
// @ts-check
// command: the one sanctioned way to move the primary checkout: fetch, detach at origin/main, rebuild
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
import { refuseUnknownFlags } from "@a11ign/worker-fleet/cli-flags";
import { npmCliInvocation } from "./npm-cli-executable.mjs";

const REPO = fileURLToPath(new URL("..", import.meta.url));

/**
 * FAST-FORWARD THE LOCAL `main` BRANCH TOO, because every worktree shares it and this is the only
 * command that moves anything.
 *
 * The primary is DETACHED at `origin/main`, deliberately -- that is what makes it read-only except
 * fast-forward. But `main` is a branch in the same `.git`, checked out nowhere, and nothing has ever
 * moved it. Measured 2026-09-09: it sat at `11d77ade` from 07 Sep while `origin/main` was `cb9dfbce` --
 * 1405 commits behind -- and all 76 worktrees resolve that one ref.
 *
 * SO A RANGE AGAINST BARE `main` ANSWERS A TWO-DAY-OLD QUESTION, and the answer looks exactly like an
 * answer. `git rev-list --count main..<branch>` reported 502 where `origin/main..<branch>` reported 1,
 * and a session used that to call a one-commit `wip` branch an old divergent rewrite -- the opposite
 * decision from the true one. A ref is a value read at a time, and `main` does not say when.
 *
 * FAST-FORWARD ONLY, VIA `update-ref` WITH THE EXPECTED OLD VALUE. `main` must be an ancestor of
 * `origin/main` or this leaves it alone and says so: a local `main` carrying commits `origin` lacks is
 * somebody's unpushed work, and this script's contract is that it destroys nothing. Passing the old
 * value makes the write refuse rather than race if another session moves the ref first.
 *
 * NOT `git branch -f`, which would move a diverged branch without complaint -- the one thing this must
 * not do.
 *
 * @param {(args: string[]) => string} run @param {string} sha
 */
function moveLocalMain(run, sha) {
  /** @type {string} */
  let before;
  try {
    before = run(["rev-parse", "refs/heads/main"]).trim();
  } catch {
    return; // no local `main` at all -- nothing to move, and creating one is not this command's job
  }
  if (before === sha) return;
  try {
    run(["merge-base", "--is-ancestor", "refs/heads/main", sha]);
  } catch {
    process.stderr.write("local `main` is NOT an ancestor of origin/main -- it carries commits origin "
      + "does not have, so it is somebody's unpushed work and this command will not move it. Ranges "
      + "against bare `main` in any worktree answer a different question until that is resolved; use "
      + "`origin/main`.\n");
    return;
  }
  run(["update-ref", "refs/heads/main", sha, before]);
}

/**
 * @param {string} [root]
 * @param {(args: string[]) => string} [run]
 * @param {(root: string) => void} [buildAt]
 */
export function updatePrimary(root = REPO, run = (args) =>
  execFileSync("git", args, { cwd: root, env: sandboxGitEnv(), encoding: "utf8" }), buildAt = build) {
  if (!isPrimaryWorktree(root)) {
    throw new Error(`${root} is not the primary checkout (its .git is a linked worktree's, not a real `
      + "directory) — this script only ever updates the primary. Use plain `git pull`/`git fetch` here.");
  }
  run(["fetch", "origin"]);
  run(["checkout", "--detach", "origin/main", "--quiet"]);
  const sha = run(["rev-parse", "HEAD"]).trim();
  moveLocalMain(run, sha);
  // THE WRAPPING LIVES HERE, NOT IN `build`, because what a failed build MEANS is a fact about this
  // checkout's relationship to every worktree -- true whichever build function ran, and the reason a
  // caller needs the message at all.
  try {
    buildAt(root);
  } catch (error) {
    const status = /** @type {{ status?: number }} */ (error).status;
    throw new Error("the primary moved, but `npm run build` failed (exit "
      + `${status ?? "?"}). Every worktree resolves THIS checkout's dist, so they are now compiling `
      + "against a source this dist does not match. Fix the build here before trusting a cross-package "
      + "import anywhere.", { cause: error });
  }
  return sha;
}

/**
 * REBUILD, BECAUSE MOVING THE PRIMARY MOVES EVERY WORKTREE'S `dist` AND NOTHING ELSE DOES.
 *
 * Every linked worktree shares this checkout's `node_modules`, so a cross-package import from any of them
 * resolves to THE PRIMARY'S `dist` -- CLAUDE.md states it, and `docs/operational-lessons.md` records the
 * afternoon spent discovering that "resolves to dist" does not say whose. Fast-forwarding the primary
 * therefore advances the SOURCE that nine worktrees compile against while leaving the COMPILED OUTPUT at
 * whatever commit it was last built at.
 *
 * Measured 2026-09-09: the orchestrator's docs-only push was refused by the pre-push hook on a module
 * that `main` has and the primary's `dist` did not. A docs change, refused by a resolution failure, in a
 * worktree that had never been anything but current -- and nothing in the message could point at the
 * primary, because the primary was not what they had touched.
 *
 * THE BUILD IS PART OF THE UPDATE, not a thing to remember afterwards. That is this repository's own
 * rule: anything a human has to remember is something that does not happen. `primary:update` is already
 * the ONE sanctioned way to move this checkout (#126), which makes it the only place this can live and
 * be reached every time.
 *
 * A FAILED BUILD IS REPORTED, NEVER SWALLOWED, and never rolls the checkout back: the fast-forward has
 * already happened and is correct, and leaving a stale `dist` beside a moved source with a loud error is
 * strictly better than silently reverting a checkout somebody else may already be reading.
 *
 * @param {string} root
 */
function build(root) {
  // `npmCliInvocation`, never a bare `npm` -- #? : a bare npm/npx spawn is unsafe on Windows and this
  // repository's own guard refuses one anywhere in the tree. Same call shape as every other site.
  const npm = npmCliInvocation("npm", ["run", "build"]);
  execFileSync(npm.command, npm.args, { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) {
  // Guarded per #164: takes no flags; --detach/--quiet go to git.
  refuseUnknownFlags([], { entry: import.meta.url, command: "node scripts/update-primary.mjs" });
  const sha = updatePrimary();
  console.log(`primary checkout detached at origin/main (${sha})`);
}
