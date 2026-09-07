/**
 * Does the orphaned-branch report distinguish "identical" from "nothing was compared"?
 *
 * #247. A branch pushed with no pull request gets no CI at all — `ci.yml` triggers on `pull_request` —
 * and nothing could see it: `worktrees:prune` asks "is it merged" and correctly answers no in silence,
 * `merge-guard` takes a PR number, and #152's orphaned-commit check hangs off a PR head at merge time.
 * `agent/ssh-key-defaults` sat that way for eleven hours carrying `requireControlPlaneKey()`.
 *
 * ## The failure this pins is in the CHECK, not the branches
 *
 * The investigation that filed the row ran `git diff --stat A B -- $FILES | tail -1` with
 * `${VAR:-IDENTICAL}` and printed a clean `IDENTICAL` for all eleven candidates — **including one already
 * shown by hand to differ** — because empty output and "no difference" are the same string. A check that
 * reported clean having examined nothing, produced inside the investigation of a missing check.
 *
 * So `contentVerdict` has three states and this test exists to keep them three. `NOTHING COMPARED` is a
 * refusal, not a pass.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// IMPORTED AND CALLED, which the first version of this file did not do. All three tests re-derived the
// decision in their own bodies with raw `git`, so DELETING THE ENTIRE SCRIPT left them green — verified,
// and it is why the PR claiming a mutation check was describing an inline probe rather than these tests.
// A test that verifies a re-implementation verifies nothing about the implementation.
import { contentVerdict } from "../../../../scripts/branches-without-a-pr.mjs";
// The canonical GIT_* scrubber. Setting `GIT_DIR: ""` instead is not equivalent and git rejects it
// outright ("The empty string is not a valid path") — the vars must be DELETED, which is what this does,
// and it strips by prefix so a variable introduced tomorrow is handled without this file knowing its name.
import { sandboxGitEnv } from "../../../../scripts/git-env.mjs";

/** A throwaway repo with a `main` and one branch, so the verdict is exercised against real git. */
function withRepo(build: (dir: string, git: (args: string[]) => string) => void) {
  const dir = mkdtempSync(join(tmpdir(), "a11y-nopr-"));
  const git = (args: string[]) =>
    execFileSync("git", args, { cwd: dir, encoding: "utf8", env: { ...sandboxGitEnv(), HOME: dir } }).trim();
  try {
    git(["init", "-q", "-b", "main"]);
    git(["config", "user.email", "t@example.com"]);
    git(["config", "user.name", "t"]);
    build(dir, git);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("a branch whose files still differ from main reports DIFFERS, naming them", () => {
  withRepo((dir, git) => {
    writeFileSync(join(dir, "a.txt"), "one\n");
    git(["add", "a.txt"]); git(["commit", "-qm", "base"]);
    git(["checkout", "-qb", "feature"]);
    writeFileSync(join(dir, "a.txt"), "two\n");
    git(["add", "a.txt"]); git(["commit", "-qm", "change"]);
    // THE REAL FUNCTION, pointed at this throwaway repo. `main`/`prefix`/`cwd` are injectable precisely
    // so this can be a test of the shipped decision rather than of a copy of it.
    const v = contentVerdict("feature", { main: "main", prefix: "", cwd: dir });
    assert.equal(v.verdict, "DIFFERS");
    assert.deepEqual(v.differing, ["a.txt"], "the finding must name the file, not just count it");
  });
});

test("a branch whose content already landed reports SAME, not DIFFERS", () => {
  withRepo((dir, git) => {
    writeFileSync(join(dir, "a.txt"), "one\n");
    git(["add", "a.txt"]); git(["commit", "-qm", "base"]);
    git(["checkout", "-qb", "feature"]);
    writeFileSync(join(dir, "a.txt"), "two\n");
    git(["add", "a.txt"]); git(["commit", "-qm", "change"]);
    // main acquires the identical CONTENT under a different commit -- a squash merge, which is why a
    // commit count cannot answer this and the content must.
    git(["checkout", "-q", "main"]);
    writeFileSync(join(dir, "a.txt"), "two\n");
    git(["add", "a.txt"]); git(["commit", "-qm", "squashed"]);
    const v = contentVerdict("feature", { main: "main", prefix: "", cwd: dir });
    assert.equal(v.verdict, "SAME", "identical content must read as SAME though the commits differ");
    // And the screen the verdict must never be: commits ahead is still > 0 here.
    assert.ok(Number(git(["rev-list", "--count", "main..feature"])) > 0,
      "this is the whole trap -- a squash-merged branch still reports commits main 'does not have'");
  });
});

test("NOTHING COMPARED is a refusal, and it is not the same value as SAME", () => {
  // The exact defect the row records: `git diff --name-only` returning nothing means there was nothing to
  // compare, and a report printing "identical" there is clean having examined nothing.
  withRepo((dir, git) => {
    writeFileSync(join(dir, "a.txt"), "one\n");
    git(["add", "a.txt"]); git(["commit", "-qm", "base"]);
    git(["checkout", "-qb", "feature"]);   // no commits of its own
    const v = contentVerdict("feature", { main: "main", prefix: "", cwd: dir });
    assert.equal(v.verdict, "NOTHING COMPARED",
      "an empty comparison must never be reported as agreement -- that is the false-clean this exists for");
    assert.equal(v.compared, 0);
  });
});
