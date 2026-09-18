#!/usr/bin/env node
// @ts-check
// command: warn which release:gate stages release:gate:ci does not run, and how many
//
// #1397: the warning this replaces said "release:gate:ci ran 4 of release:gate's 12 stages" as literal
// text typed into the workflow step -- true the day it was written, wrong once release:gate grew a
// stage (the chain is 13 long; `release:gate:ci` runs 5 of them), and nothing would have caught the
// drift because nothing read the scripts the sentence claimed to describe. Reading `package.json`'s own
// two chains every run means the count can only ever describe the chain that is actually there.
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { refuseUnknownFlags } from "../packages/worker-fleet/src/cli-flags.mjs";

const REPO = fileURLToPath(new URL("../", import.meta.url));

/** The `npm run <name>` stages a chained script invokes, in order.
 * @param {Record<string, string>} scripts
 * @param {string} name
 * @returns {string[]}
 */
function stagesOf(scripts, name) {
  return [...scripts[name].matchAll(/npm run ([\w:.-]+)/g)].map((m) => m[1]);
}

function main() {
  refuseUnknownFlags([], { entry: import.meta.url, command: "node scripts/release-gate-scope.mjs" });
  const { scripts } = JSON.parse(readFileSync(`${REPO}package.json`, "utf8"));
  const full = stagesOf(scripts, "release:gate");
  const ci = stagesOf(scripts, "release:gate:ci");
  const skipped = full.filter((stage) => !ci.includes(stage));
  if (skipped.length + ci.length !== full.length) {
    throw new Error("release:gate:ci is not a subset of release:gate -- fix the scripts, not this message");
  }
  console.log(`::warning::release:gate:ci ran ${ci.length} of release:gate's ${full.length} stages. `
    + `The other ${skipped.length} need the Python`);
  console.log(`::warning::venv or the corpus and cannot run on a runner (${skipped.join(", ")}). Run `
    + "them on the lab BEFORE");
  console.log("::warning::publishing for real:  npm run lab:job -- -e job=release-gate");
}

// REALPATH'D, per `entry-points.test.ts` (#1086): reached through a symlink, the plain form skips main() and exits 0 silently.
if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) main();
