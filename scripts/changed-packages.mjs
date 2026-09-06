// Which `packages/<name>` directories a branch actually touched against `origin/main` -- the population
// the pre-push hook's FAST gate (agent/*, lead/* pushes) tests, so a branch that never touched `judge` does
// not pay for `judge`'s suite on every commit. `main` pushes are unaffected: they still run the full suite,
// unchanged, because the fast gate exists to speed up iteration on a branch, not to replace the real gate.
//
// DELIBERATELY BLUNT, not dependency-aware. A change to `packages/evidence` (which several other packages
// import) is scoped to `evidence`'s OWN tests here, not every package that depends on it -- building a
// reliable cross-package dependency graph from package.json files is a real project of its own, and a wrong
// graph is a guard answering about the wrong population, which is the exact class this repo spent the day
// closing (docs/backlog.md, "a check that answers correctly about the wrong population"). The chosen
// tradeoff: the fast gate may legitimately MISS a cross-package regression, and CI (widened to run on every
// `agent/**`/`lead/**` push, see .github/workflows/lint.yml) is the real, full-suite gate that catches it —
// by design, not by oversight. A push that breaks another package's test is expected to pass the fast gate
// and fail CI; that is the acceptance test this file exists to make possible, not a gap to close here.
//
// A diff touching nothing under `packages/` (docs, top-level scripts, .github/, package.json, tsconfig)
// returns an EMPTY list, and the caller's job is to treat that as "run everything", never as "run nothing" --
// see `scripts/git-hooks/pre-push`'s use of this. An empty result here is not the same claim as "nothing to
// verify".
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";
import { sandboxGitEnv } from "./git-env.mjs";

const REPO = fileURLToPath(new URL("..", import.meta.url));

/** `packages/<name>` for every changed path, deduped and sorted -- pure, given the diff's own output. */
export function changedPackages(diffOutput) {
  const names = new Set();
  for (const line of diffOutput.split("\n")) {
    const match = /^packages\/([^/]+)\//.exec(line.trim());
    if (match) names.add(match[1]);
  }
  return [...names].sort();
}

/**
 * `packages/<name>` changed against `origin/main`'s merge-base with HEAD -- the merge-base, not
 * `origin/main` itself, so a branch that started days ago is compared against where it FORKED, not
 * against everything `main` has gained since. Comparing against `origin/main` directly would report every
 * package another branch already landed as "changed here" too, which is the wrong population in the other
 * direction. Empty on any git failure (no `origin/main`, a shallow clone) -- the caller must treat that as
 * "run everything", the same as a genuinely empty diff.
 */
export function changedPackagesAgainstOrigin() {
  try {
    const base = execFileSync("git", ["merge-base", "HEAD", "origin/main"],
      { cwd: REPO, env: sandboxGitEnv(), encoding: "utf8" }).trim();
    const diff = execFileSync("git", ["diff", "--name-only", base, "HEAD"],
      { cwd: REPO, env: sandboxGitEnv(), encoding: "utf8" });
    return changedPackages(diff);
  } catch {
    return [];
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) {
  process.stdout.write(changedPackagesAgainstOrigin().join(" "));
}
