// @ts-check
// Does this diff touch a file `npm pack` actually SHIPS for a PUBLISHED package? — #261.
//
// The pre-push hook's FAST gate needed this precise a question, not `changed-packages.mjs`'s blunt "any
// file under `packages/<name>/`": paying `changeset status --since=origin/main` (measured 3.8-7.8s,
// direct binary vs `npx`) on every push touching a package directory would more than double the hook's
// whole budget, on pushes that are mostly test files, docs under a package, or a private package nothing
// ever installs.
//
// REUSES `classify()`, never re-derives it. `ci-changed.mjs`'s `changeset` output already answers this
// exact question, real `npm pack`-backed by default (`getPackedFiles` defaults to the real `packedFiles`,
// not the CI-only `everythingIsPacked` over-approximation) -- CI's own `changeset` job computes the
// identical thing after its `npm ci`. A second regex or a second `npm pack` call here would be the
// fact-stated-twice shape this repo keeps finding in its own tooling.
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { classify, knownPackages } from "./ci-changed.mjs";
import { sandboxGitEnv } from "./git-env.mjs";
import { refuseUnknownFlags } from "@a11ign/worker-fleet/cli-flags";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

/**
 * @param {string[]} files repo-relative paths, as `git diff --name-only` prints them
 * @param {string} [repoRoot]
 * @returns {boolean}
 */
export function touchesPublishedPackedFile(files, repoRoot = REPO_ROOT) {
  return classify(files, knownPackages(repoRoot), {}, { repoRoot }).changeset;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  // GUARDED WITH AN EMPTY LIST, which is the point rather than an omission (#164): this takes its base
  // ref POSITIONALLY and reads no flags, so a mistyped one would otherwise be dropped while the
  // positional is read from the wrong slot -- and this command's answer decides whether the pre-push
  // fast gate demands a changeset at all. Same shape and same reason as `merge-guard.mjs`.
  refuseUnknownFlags([], { entry: import.meta.url, command: "node scripts/changeset-precise.mjs" });
  const base = process.argv[2];
  if (!base) {
    console.error("Usage: node scripts/changeset-precise.mjs <base-ref>   e.g. origin/main");
    process.exit(2);
  }
  const files = execFileSync("git", ["diff", "--name-only", `${base}...HEAD`],
    { cwd: REPO_ROOT, env: sandboxGitEnv(), encoding: "utf8" }).split("\n").filter(Boolean);
  process.stdout.write(touchesPublishedPackedFile(files, REPO_ROOT) ? "true" : "false");
}
