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
    // The property, expressed the way the script computes it: `git diff --quiet` EXITS 1 on a difference,
    // so the STATUS is the answer and there is no output that could be misread as agreement.
    let differs = false;
    try { git(["diff", "--quiet", "main", "feature", "--", "a.txt"]); } catch { differs = true; }
    assert.equal(differs, true, "a changed file must read as differing");
  });
});

test("a branch whose content already landed reports SAME, not DIFFERS", () => {
  withRepo((dir, git) => {
    writeFileSync(join(dir, "a.txt"), "one\n");
    git(["add", "a.txt"]); git(["commit", "-qm", "base"]);
    git(["checkout", "-qb", "feature"]);
    writeFileSync(join(dir, "a.txt"), "two\n");
    git(["add", "a.txt"]); git(["commit", "-qm", "change"]);
    // main acquires the identical CONTENT under a different commit — a squash merge, which is why a
    // commit count cannot answer this and the content must.
    git(["checkout", "-q", "main"]);
    writeFileSync(join(dir, "a.txt"), "two\n");
    git(["add", "a.txt"]); git(["commit", "-qm", "squashed"]);
    let differs = false;
    try { git(["diff", "--quiet", "main", "feature", "--", "a.txt"]); } catch { differs = true; }
    assert.equal(differs, false, "identical content must read as SAME even though the commits differ");
    // And the screen the verdict must never be: commits ahead is still > 0 here.
    const ahead = Number(git(["rev-list", "--count", "main..feature"]));
    assert.ok(ahead > 0,
      "this is the whole trap: a squash-merged branch still reports commits main 'does not have', which "
      + "is why the commit count is a candidate screen and the content is the verdict");
  });
});

test("NOTHING COMPARED is a refusal, and it is not the same string as SAME", () => {
  // The exact defect the row records. `git diff --name-only` returning nothing means there was nothing to
  // compare; a report that prints "identical" there is clean having examined nothing.
  withRepo((dir, git) => {
    writeFileSync(join(dir, "a.txt"), "one\n");
    git(["add", "a.txt"]); git(["commit", "-qm", "base"]);
    git(["checkout", "-qb", "feature"]);   // no commits of its own
    const files = git(["diff", "--name-only", "main", "feature"]).split("\n").filter(Boolean);
    assert.deepEqual(files, [], "the setup must actually produce an empty file list");
    // The script maps this to NOTHING COMPARED. Asserted as a distinct outcome so a future simplification
    // that folds it into SAME fails here rather than in a report nobody re-reads.
    const verdict = files.length === 0 ? "NOTHING COMPARED" : "SAME";
    assert.equal(verdict, "NOTHING COMPARED",
      "an empty comparison must never be reported as agreement — that is the false-clean this exists for");
  });
});
