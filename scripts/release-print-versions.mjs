#!/usr/bin/env node
// @ts-check
// command: print the version each published package's manifest now holds
//
// #1466: the release dry run's log named no version anywhere -- `npx changeset status` prints bump
// LEVELS ("minor"), `npm run release:version` prints "All files have been updated", the diff-stat that
// followed it prints file names, and `npm run gate:isolation` prints package names. Every reading of the
// six shipped versions came from arithmetic on the bump levels, not from anything the log actually said
// (measured by `ceo` on run 34785498618, 2026-09-13).
//
// Run AFTER `npm run release:version` -- that is when the six manifests hold the version this run would
// publish. `publishedManifests` is the same "which packages does Changesets actually publish" rule
// `manifest-repository-check.mjs` and `release-safety.test.ts` already use, so this names exactly the
// packages the pending reading (`changeset status --verbose`, before `release:version`) names too.
import { readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { publishedManifests } from "./manifest-repository-check.mjs";
import { refuseUnknownFlags } from "../packages/worker-fleet/src/cli-flags.mjs";

const REPO = fileURLToPath(new URL("../", import.meta.url));

function main() {
  refuseUnknownFlags([], { entry: import.meta.url, command: "node scripts/release-print-versions.mjs" });
  for (const { path, name } of publishedManifests(REPO)) {
    const { version } = JSON.parse(readFileSync(join(REPO, path), "utf8"));
    console.log(`${name}@${version}`);
  }
}

// REALPATH'D, per `entry-points.test.ts` (#1086): reached through a symlink, the plain form skips main() and exits 0 silently.
if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) main();
