// @ts-check
// DOC CROSS-REFERENCE CHECK (#905): every documented `uses:` line names THIS repository and a ref the remote
// actually has. Moved out of `action-reference.test.ts`, which now asserts on these same functions; read its
// header for the `a11ign/a11ign@v1` line a stranger copied and got `Unable to resolve action` from.
// #954: `action-reference.test.ts` IS GONE. The sentences above describing what it asserts are the record of where this
// rule came from, not a claim about today: this module is now the only copy, and the nightly doc
// cross-reference report is where it runs. A pull request no longer fails on it.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sandboxGitEnv } from "../git-env.mjs";

export const USES_DOCS = ["README.md", "docs/github-action.md", "examples/workflow.yml"];

/** @typedef {{ file: string, owner: string, ref: string }} UsesLine */

/**
 * This repository's `owner/repo`, from git rather than from a constant that would be the fourth place to
 * disagree. Null with no git remote (a packed tarball, a fixture directory) -- the caller decides whether that
 * is a skip or a "could not run".
 * @param {string} root @returns {string | null}
 */
export function ownerRepo(root) {
  try {
    const url = execFileSync("git", ["config", "--get", "remote.origin.url"],
      { cwd: root, env: sandboxGitEnv(), encoding: "utf8", stdio: "pipe" }).trim();
    return /[:/]([^/:]+\/[^/]+?)(?:\.git)?$/.exec(url)?.[1] ?? null;
  } catch {
    return null; // no git remote here; see the doc comment for who decides what that means
  }
}

/** Every `uses:` line in the consumer-facing docs that names this action. @param {string} root @returns {UsesLine[]} */
export function usesLines(root) {
  /** @type {UsesLine[]} */
  const found = [];
  for (const file of USES_DOCS) {
    const path = resolve(root, file);
    if (!existsSync(path)) continue;
    for (const m of readFileSync(path, "utf8").matchAll(/uses:\s*([\w.-]+\/[\w.-]+)@([\w.-]+)/g)) {
      // BOTH names, deliberately, during the #66/#325 transition: the Action reference itself still
      // says `DanBeckDev/a11y-witness` (kept that way until #325 actually moves the repository), while
      // everything else in these docs now says `a11ign`.
      if (!/a11ign|a11y-witness/i.test(m[1])) continue; // third-party actions are not ours to validate
      found.push({ file, owner: m[1], ref: m[2] });
    }
  }
  return found;
}

/** @param {UsesLine[]} lines @param {string} repo @returns {string[]} */
export function wrongOwner(lines, repo) {
  return lines.filter((u) => u.owner.toLowerCase() !== repo.toLowerCase())
    .map((u) => `${u.file}: ${u.owner} (this repo is ${repo})`);
}

/**
 * Every tag and branch name the REMOTE has. ASK THE REMOTE, not this checkout: `git tag` and `git branch -r`
 * answer "what did THIS CLONE happen to fetch", and a `pull_request` checkout fetches one merge ref and nothing
 * else (the test's comment has the whole history). Null when origin cannot be reached.
 * @param {string} root @returns {Set<string> | null}
 */
export function remoteRefs(root) {
  const refs = new Set();
  try {
    for (const line of execFileSync("git", ["ls-remote", "--tags", "--heads", "origin"],
      { cwd: root, env: sandboxGitEnv(), encoding: "utf8", stdio: "pipe" }).split("\n")) {
      const match = /refs\/(?:tags|heads)\/(.+)$/.exec(line);
      if (match) refs.add(match[1]);
    }
  } catch {
    return null; // no network reach to origin -- "could not ask", which is not "no refs"
  }
  return refs;
}

/** @param {UsesLine[]} lines @param {Set<string>} refs @returns {string[]} */
export function missingRefs(lines, refs) {
  return lines.filter((u) => !refs.has(u.ref))
    .map((u) => `${u.file}: @${u.ref} does not exist (have: ${[...refs].sort().join(", ")})`);
}

/** @param {string} root @returns {import("./check-result.mjs").CheckResult} */
export function check(root) {
  const repo = ownerRepo(root);
  if (!repo) throw new Error(`no git remote at ${root}, so there is no repository to compare \`uses:\` lines against`);
  const refs = remoteRefs(root);
  if (!refs || refs.size === 0) throw new Error("`git ls-remote origin` returned no refs, so no ref could be checked");
  const lines = usesLines(root);
  const where = (/** @type {string} */ line) => line.split(": ")[0];
  return {
    examined: lines.length,
    unit: `\`uses:\` lines in ${USES_DOCS.join(", ")}`,
    disagreements: [
      ...(lines.length < USES_DOCS.length ? [{ where: USES_DOCS.join(", "), reference: `${lines.length} \`uses:\` line(s)`,
        why: "expected one in each consumer-facing doc -- the scan or the docs lost one" }] : []),
      ...wrongOwner(lines, repo).map((line) => ({ where: where(line), reference: line.slice(where(line).length + 2),
        why: "names another repository -- a consumer copying it gets `Unable to resolve action`" })),
      ...missingRefs(lines, refs).map((line) => ({ where: where(line), reference: line.slice(where(line).length + 2),
        why: "a tag nobody cut resolves for nobody" })),
    ],
  };
}
