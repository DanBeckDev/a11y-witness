#!/usr/bin/env node
// @ts-check
// command: carry a stalled agent/* branch from a DETACHED checkout -- merge origin/main in and push,
// without ever checking the branch out locally, so it cannot collide with wherever its owner already
// has it (#656)
//
// THE GAP THIS CLOSES: the dispatcher offered to carry #614 -- 97 commits behind, past its escalation
// window -- and could not:
//
//     $ git worktree add /private/tmp/wt-614 agent/pre-push-delete-583
//     fatal: 'agent/pre-push-delete-583' is already used by worktree at
//            '.../a11y-wt-pushdel-583'
//
// The `session:` label records who holds a ROW; `git worktree list` records who holds a BRANCH. Neither
// record knows about the other, so a row could be escalated and reassigned while its branch stayed
// checked out somewhere the new owner could not reach -- an offer made in good faith and found
// impossible. `row-claim.mjs`'s claim now RECORDS the branch (`branch:<name>`), so a session can tell a
// portable row from a held one before offering; this file is the mechanism that makes the offer real
// once made.
//
// ceo's own mechanism, quoted on #656:
//
//     git worktree add --detach <dir> origin/agent/<branch>
//     git merge origin/main
//     git push origin HEAD:refs/heads/agent/<branch>
//
// The branch is never checked out BY NAME in the carrying worktree -- `--detach` lands on the commit,
// not the ref -- so `git worktree add` cannot collide with the owner's own checkout of the same branch.
//
// THREE LIMITS THAT ARE THE POINT, NOT CAVEATS (ceo's own framing, #656):
//   - Not a licence to write into somebody's branch generally. The ESCALATION WINDOW authorises a carry;
//     the ref-lock below is what keeps it safe regardless of who invokes this.
//   - The ref-lock is READ, never forced past. `git push` with no `--force`/`--force-with-lease` refuses
//     non-fast-forward outright, so a simultaneous push from the owner's own worktree still wins the
//     race -- this reports that refusal rather than reaching past it. A routine reflex to retry with
//     `--force-with-lease` here would discard the owner's live work silently; this file never does that
//     and never exposes a flag that would let a caller do it either.
//   - The ordinary case is untouched. An owner who is mid-flight keeps their branch -- nothing here
//     checks a branch out or touches a worktree other than the throwaway one this carry creates and
//     removes.
import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { sandboxGitEnv } from "./git-env.mjs";
import { REPO } from "./repo-identity.mjs";
import { parseWorktreeList } from "./prune-worktrees.mjs";
// RELATIVE, not the `@a11ign/worker-fleet/cli-flags` package specifier -- see `row-claim.mjs`'s own
// header for why: this needs `node_modules` and a completed build, and this file has neither guarantee.
import { refuseUnknownFlags } from "../packages/worker-fleet/src/cli-flags.mjs";
import { assertNoLeakInArgv } from "../packages/lab/src/packaging/leak-patterns.mjs";

/** @type {(cmd: string, args: string[], opts?: { cwd?: string }) => string} */
const defaultRun = (cmd, args, opts = {}) => {
  assertNoLeakInArgv(cmd, args); // #1053: guarded in the SPAWN HELPER, not per call site
  return execFileSync(cmd, args, { ...opts, env: sandboxGitEnv(), encoding: "utf8" });
};

/** @param {unknown} error @returns {string} */
function errMsg(error) {
  return /** @type {Error} */ (error).message;
}

/**
 * Is `branch` checked out in ANY worktree of this repository, right now? Reuses `prune-worktrees.mjs`'s
 * own `parseWorktreeList` rather than a second reading of `git worktree list --porcelain` -- two
 * independent parsers of the identical output is the drift this repo pays for most, and #621 already
 * refused to repeat it one layer over for local-import closures.
 *
 * INFORMATIONAL, not a gate on `carryBranch` below -- the detached technique works whether the branch is
 * held or not, so this exists for a caller (a human, or `row-claim.mjs check`'s own branch-naming) to
 * decide WHETHER a carry is even the right move, not to be consulted by the carry itself.
 *
 * @param {string} branch
 * @param {string} repoRoot
 * @param {{ run?: typeof defaultRun }} [deps]
 * @returns {boolean}
 */
export function branchCheckedOutLocally(branch, repoRoot, { run = defaultRun } = {}) {
  const porcelain = run("git", ["worktree", "list", "--porcelain"], { cwd: repoRoot });
  return parseWorktreeList(porcelain).some((entry) => entry.branch === branch);
}

/**
 * THE #656 CARRY. Opens a DETACHED worktree at `origin/<branch>`'s current tip (never the branch name
 * itself, so it cannot collide with a worktree that already has that branch checked out), merges
 * `origin/main` into it, and pushes the result straight back to `refs/heads/<branch>`.
 *
 * READS THE DIFFSTAT, NOT JUST THE EXIT CODE -- #656's own stated demonstration requirement, and this
 * repo's own recorded reason why: a merge resolution that keeps its own side and silently drops the
 * other's is a CLEAN exit with every file it dropped invisible to anyone trusting the exit code alone
 * (#232 -- four merged units removed by a resolution with every check green). The diffstat is computed
 * between the branch's OWN pre-merge tip and the merged result, so it names exactly what `origin/main`
 * contributed, not the whole branch's history.
 *
 * NEVER `--force`/`--force-with-lease`, anywhere in this function, on purpose. A plain `git push` is
 * git's own compare-and-swap on the remote ref: it refuses non-fast-forward, so a push landing from the
 * owner's own worktree while this carry is running still wins outright, and `carried: false` reports
 * that refusal rather than this function reaching past it.
 *
 * @param {string} repoRoot a real checkout of this repository to run `git worktree add` FROM
 * @param {string} branch bare branch name, e.g. "agent/pre-push-delete-583" -- no `origin/` prefix
 * @param {{ run?: typeof defaultRun, workDir?: string }} [deps] `workDir`: an existing directory to use
 *   instead of a fresh temp one, and skip the automatic cleanup of it -- for tests that want to inspect
 *   the carrying worktree afterward.
 * @returns {{ carried: true, diffstat: string } | { carried: false, reason: string, diffstat?: string }}
 */
export function carryBranch(repoRoot, branch, { run = defaultRun, workDir } = {}) {
  const dir = workDir ?? realpathSync(mkdtempSync(join(tmpdir(), "carry-branch-")));
  try {
    try {
      run("git", ["worktree", "add", "--detach", dir, `origin/${branch}`], { cwd: repoRoot });
    } catch (error) {
      return { carried: false,
        reason: `could not open a detached checkout of origin/${branch} -- ${errMsg(error)}` };
    }
    try {
      run("git", ["fetch", "origin", "main"], { cwd: dir });
    } catch (error) {
      return { carried: false, reason: `could not fetch origin/main -- ${errMsg(error)}` };
    }
    const beforeTip = run("git", ["rev-parse", "HEAD"], { cwd: dir }).trim();
    try {
      // Identity PER COMMAND, never `git config` -- the same discipline `test-support/git-sandbox.ts`
      // documents at length for the identical reason: a config WRITE lands wherever GIT_DIR currently
      // resolves to, and a per-command `-c` cannot write config anywhere by construction.
      run("git", ["-c", "user.name=row-carry", "-c", "user.email=row-carry@a11y-witness.invalid",
        "merge", "origin/main", "--no-edit"], { cwd: dir });
    } catch (error) {
      return { carried: false, reason: `merge failed -- ${errMsg(error)}` };
    }
    const diffstat = run("git", ["diff", "--stat", `${beforeTip}..HEAD`], { cwd: dir });
    try {
      run("git", ["push", "origin", `HEAD:refs/heads/${branch}`], { cwd: dir });
    } catch (error) {
      return { carried: false, diffstat,
        reason: `push refused -- this is the ref-lock working as intended: the branch moved under this `
          + `carry, so the owner's own push (or another carry) won the race. Read it, never force past `
          + `it. ${errMsg(error)}` };
    }
    return { carried: true, diffstat };
  } finally {
    if (!workDir) {
      try {
        run("git", ["worktree", "remove", "--force", dir], { cwd: repoRoot });
      } catch {
        // Best-effort cleanup of a throwaway detached worktree -- nothing of value survives only in it,
        // since a successful carry has already pushed everything that mattered.
      }
    }
  }
}

/**
 * Finds the open PR for `branch` and leaves a comment naming who carried it and why -- #656's own stated
 * point: the owner learns from the OBJECT (the PR), not only from a message that may go unread or arrive
 * to a session that has since ended.
 *
 * @param {string} branch
 * @param {string} carrier this session's own name
 * @param {string} reason why the carry happened -- the escalation window, named
 * @param {{ run?: typeof defaultRun }} [deps]
 * @returns {{ commented: true, prNumber: number } | { commented: false, reason: string }}
 */
export function noteCarryOnPr(branch, carrier, reason, { run = defaultRun } = {}) {
  /** @type {unknown} */
  let found;
  try {
    found = JSON.parse(run("gh", ["pr", "list", "--repo", REPO, "--head", branch, "--state", "open",
      "--json", "number"]));
  } catch (error) {
    return { commented: false, reason: `could not look up the open PR for ${branch} -- ${errMsg(error)}` };
  }
  if (!Array.isArray(found) || found.length === 0) {
    return { commented: false, reason: `no open PR found for ${branch} -- nothing to comment on` };
  }
  const prNumber = /** @type {{ number: number }} */ (found[0]).number;
  run("gh", ["pr", "comment", String(prNumber), "--repo", REPO, "--body",
    `Carried by \`${carrier}\` from a detached checkout: ${reason}`]);
  return { commented: true, prNumber };
}

function usage() {
  return "Usage:\n"
    + "  node scripts/carry-branch.mjs <branch> --carrier=<session> --reason=<text> [--repo-root=<dir>]\n";
}

async function main() {
  refuseUnknownFlags(["--carrier=", "--reason=", "--repo-root="],
    { entry: import.meta.url, command: "node scripts/carry-branch.mjs" });
  const argv = process.argv.slice(2);
  const branch = argv[0];
  const carrier = argv.find((a) => a.startsWith("--carrier="))?.slice("--carrier=".length);
  const reason = argv.find((a) => a.startsWith("--reason="))?.slice("--reason=".length);
  const repoRootFlag = argv.find((a) => a.startsWith("--repo-root="))?.slice("--repo-root=".length);
  if (!branch || branch.startsWith("--") || !carrier || !reason) {
    process.stderr.write(usage());
    process.exitCode = 2;
    return;
  }
  const repoRoot = repoRootFlag ?? process.cwd();
  const result = carryBranch(repoRoot, branch);
  if (!result.carried) {
    process.stderr.write(`NOT CARRIED: ${result.reason}\n`);
    if (result.diffstat) process.stderr.write(`(the merge itself had already produced:\n${result.diffstat})\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`CARRIED -- ${branch} merged with origin/main and pushed.\n${result.diffstat}\n`);
  const note = noteCarryOnPr(branch, carrier, reason);
  if (note.commented) {
    process.stdout.write(`Noted on PR #${note.prNumber}.\n`);
  } else {
    process.stderr.write(`Carried, but could not leave a note on the PR: ${note.reason}\n`);
    process.exitCode = 3;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
