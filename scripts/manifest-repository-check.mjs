#!/usr/bin/env node
// @ts-check
// command: refuse a publish whose manifests name a different repository than the run publishing them
/**
 * EVERY PUBLISHED MANIFEST NAMES THE REPOSITORY THE PUBLISH RUNS FROM -- #1536.
 *
 * The first real publish (run 34816466408, 2026-09-14) passed every guard job and every gate step, then npm
 * refused it on PUT: `E422 ... Error verifying sigstore provenance bundle: Failed to validate repository
 * information: package.json: "repository.url" is "git+https://github.com/a11ign/a11ign.git", expected to match
 * "https://github.com/<the repository the run came from>"` (#915 5660524401). Provenance (ADR 0006,
 * `NPM_CONFIG_PROVENANCE`) binds each tarball to the repository whose workflow built it, so a manifest naming
 * any other repository cannot publish -- and nothing before the registry asked. A dry run never reaches the
 * registry, so every dry run had passed.
 *
 * So `release.yml` runs this before `changeset publish`, on the dry run as well as the real run, and the
 * refusal is ours: it names each manifest, what it says, and what the run needs.
 *
 *   GITHUB_REPOSITORY=owner/name node scripts/manifest-repository-check.mjs
 *
 * Exit 0: every published manifest names `https://github.com/$GITHUB_REPOSITORY`. Exit 1: at least one does not,
 * each named. Exit 2: `GITHUB_REPOSITORY` is unset, so there is nothing to compare against -- never a pass.
 */
import { readdirSync, readFileSync, existsSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { refuseUnknownFlags } from "../packages/worker-fleet/src/cli-flags.mjs";

const REPO = fileURLToPath(new URL("../", import.meta.url));

/**
 * `owner/name`, lower-cased, from a GitHub repository URL in either spelling npm writes -- `git+https://…/x.git`
 * or `https://…/x` -- or null for anything else. GitHub treats owner and name case-insensitively, and so does the
 * provenance check.
 * @param {string} url
 * @returns {string | null}
 */
export function repositorySlugOf(url) {
  const match = /^(?:git\+)?https:\/\/github\.com\/([^/\s]+\/[^/\s]+?)(?:\.git)?\/?$/i.exec(url.trim());
  return match ? match[1].toLowerCase() : null;
}

/**
 * THE DECISION, pure: which manifests do not name the running repository.
 *
 * `repository` is what the manifest holds: npm allows a bare string or `{ type, url, directory }`. A manifest
 * with no URL, or one this cannot read as a GitHub URL, is a mismatch -- the registry would refuse it too, and
 * "could not tell" is never a pass here.
 * @param {{ manifests: Array<{ path: string, name: string, repository: unknown }>, repository: string }} input
 *   `repository` is `GITHUB_REPOSITORY`, `owner/name`.
 * @returns {Array<{ path: string, name: string, found: string, expected: string }>}
 */
export function manifestRepositoryMismatches({ manifests, repository }) {
  const expected = `https://github.com/${repository}`;
  const want = repository.toLowerCase();
  return manifests.flatMap((manifest) => {
    const found = repositoryUrlOf(manifest.repository);
    return found !== null && repositorySlugOf(found) === want
      ? []
      : [{ path: manifest.path, name: manifest.name, found: found ?? "(no repository.url)", expected }];
  });
}

/** @param {unknown} repository @returns {string | null} */
function repositoryUrlOf(repository) {
  if (typeof repository === "string") return repository;
  const url = repository && typeof repository === "object" ? /** @type {{ url?: unknown }} */ (repository).url : undefined;
  return typeof url === "string" ? url : null;
}

/**
 * Every manifest Changesets would publish: each `packages/<dir>/package.json` that is not `private`, the same rule
 * `release-safety.test.ts` pins for which packages publish.
 * @param {string} repoRoot
 * @returns {Array<{ path: string, name: string, repository: unknown }>}
 */
export function publishedManifests(repoRoot) {
  const packagesDir = join(repoRoot, "packages");
  return readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(packagesDir, entry.name, "package.json")))
    .map((entry) => {
      const path = `packages/${entry.name}/package.json`;
      const manifest = JSON.parse(readFileSync(join(repoRoot, path), "utf8"));
      return { path, name: manifest.name, repository: manifest.repository, private: manifest.private === true };
    })
    .filter((manifest) => !manifest.private)
    .map(({ path, name, repository }) => ({ path, name, repository }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

function main() {
  refuseUnknownFlags([], { entry: import.meta.url, command: "node scripts/manifest-repository-check.mjs" });
  const repository = process.env.GITHUB_REPOSITORY ?? "";
  if (!/^[^/\s]+\/[^/\s]+$/.test(repository)) {
    console.error(`::error::manifest-repository-check: GITHUB_REPOSITORY is ${JSON.stringify(repository)}, not owner/name, `
      + "so there is no repository to compare the manifests against. Nothing was checked; this is not a pass.");
    process.exitCode = 2;
    return;
  }
  const manifests = publishedManifests(REPO);
  const mismatches = manifestRepositoryMismatches({ manifests, repository });
  if (mismatches.length === 0) {
    console.log(`manifest-repository-check: all ${manifests.length} published manifest(s) name https://github.com/${repository}.`);
    return;
  }
  for (const m of mismatches) {
    console.error(`::error file=${m.path}::${m.name}: repository.url is ${JSON.stringify(m.found)}, but this run publishes from `
      + `${m.expected}. npm's provenance check refuses that on PUT (run 34816466408, #1536).`);
  }
  console.error(`manifest-repository-check: ${mismatches.length} of ${manifests.length} published manifest(s) name a different `
    + "repository. Nothing is published from here until they match the repository this workflow runs in.");
  process.exitCode = 1;
}

// REALPATH'D, per `entry-points.test.ts` (#1086): reached through a symlink, the plain form skips main() and exits 0 silently.
if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) main();
