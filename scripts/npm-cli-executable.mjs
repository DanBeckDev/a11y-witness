// @ts-check
// #492: NEVER SPAWN `npx`/`npm` AT ALL -- resolve npm's OWN CLI SCRIPT and run it through `process.execPath`.
//
// The first version of this file named `npx.cmd`/`npm.cmd` explicitly, on the documented premise that
// Node's `child_process` auto-detects a `.bat`/`.cmd` suffix on Windows and safely routes that one call
// through `cmd.exe`. **That premise stopped being true in April 2024.** CVE-2024-27980 ("BatBadBut")
// permanently made `spawn`/`spawnSync`/`execFileSync` REFUSE (`EINVAL`) to launch a `.bat`/`.cmd` file
// directly when `shell` is unset, on every Node release after 18.20.2/20.12.2/21.7.3 -- a deliberate
// security hardening, not a bug that gets un-fixed. `windows-2022`'s Node 22.23.2 is well past the patch,
// so the `.cmd`-suffix fix from #492's first pass turned an `ENOENT` into an `EINVAL` on the very platform
// it was written for. Found live by #494's consumer gate (a real `windows-2022` run), run `34265163648`.
//
// `ceo`'s ruling: no `shell: true`, anywhere. That option's quoting class is the same one that dispatched
// four capture shards at `--worker=http://:8765` for 29 minutes, and proving it safe would mean auditing
// every one of the 23 call sites this file's own discovery guard found. **Never spawn `.cmd` at all --
// spawn `process.execPath` with npm's own CLI script as `argv[1]`, so argv stays argv on every platform.**
//
// TWO LAYOUTS, TRIED IN ORDER, because npm's `bin/` sits in a different place relative to `node` depending
// on platform. Measured directly, not assumed from one machine:
//
//   Windows:  <node install root>/node_modules/npm/bin/<script>     -- node.exe sits at the install root
//   POSIX:    <node install root>/../lib/node_modules/npm/bin/<script>  -- node sits in bin/, npm in lib/
//
// A first draft of this ruling named only the Windows layout -- correct there, and it does not exist on
// POSIX (`require.resolve("npm/bin/...")` also fails on both: npm ships BESIDE `node`, never as a
// dependency any project's own module graph can resolve). Both are tried, in this order, because trying
// the Windows layout first costs nothing on POSIX (a single failed `existsSync`) and getting the order
// backwards costs nothing either -- but naming only one layout silently breaks whichever platform is not
// named, which is this row's own defect with the platforms swapped.
//
// THE DIVISION OF WHAT IS PROVEN, stated so a reader does not credit either check with the other's job:
// the unit test beside this file pins the RESOLVED ARGV SHAPE (which script, which arguments, in which
// order) -- it cannot prove the spawn itself succeeds, since that needs a real Node install with npm
// actually present beside it, which is exactly what a `process.platform` override would fake past. #494's
// consumer gate, on a real `windows-2022` runner, is what proves the spawn runs. A source-text walk
// structurally cannot catch an `EINVAL`; a unit guard pins the call shape, the consumer gate proves it runs.
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";

/**
 * @param {"npx" | "npm"} name
 * @returns {string}
 */
function cliScriptName(name) {
  return name === "npx" ? "npx-cli.js" : "npm-cli.js";
}

/**
 * The two candidate paths for npm's own CLI script, Windows layout first. Exported (not just used
 * internally) so the unit test can assert the exact candidates without duplicating the path-join logic.
 * @param {"npx" | "npm"} name
 * @returns {string[]}
 */
export function npmCliScriptCandidates(name) {
  const script = cliScriptName(name);
  const nodeDir = dirname(process.execPath);
  return [
    join(nodeDir, "node_modules", "npm", "bin", script),
    join(nodeDir, "..", "lib", "node_modules", "npm", "bin", script),
  ];
}

/**
 * Resolves npm's own CLI script to a real, existing path. Throws NAMING EVERY CANDIDATE TRIED -- "npm's
 * CLI was not found" sends nobody anywhere; this repo's own rule is that a guard which stops a job and
 * explains nothing gets bypassed.
 * @param {"npx" | "npm"} name
 * @returns {string}
 */
export function resolveNpmCliScript(name) {
  const candidates = npmCliScriptCandidates(name);
  const found = candidates.find((path) => existsSync(path));
  if (!found) {
    throw new Error(`could not find npm's own ${cliScriptName(name)} beside this Node install -- tried:\n`
      + candidates.map((path) => `  ${path}`).join("\n"));
  }
  return found;
}

/**
 * The full `execFileSync`/`spawnSync`/`spawn` argv for running `npx <args>`/`npm <args>` WITHOUT spawning
 * either binary at all: `process.execPath` as the command, npm's own resolved CLI script as the first
 * argument, then the caller's original arguments unchanged -- exactly what the `npx`/`npm` executables do
 * internally, one layer removed. There is no `.cmd`, no `.bat`, no shell, and therefore nothing for
 * CVE-2024-27980 to refuse, on any platform.
 * @param {"npx" | "npm"} name
 * @param {string[]} args
 * @returns {{ command: string, args: string[] }}
 */
export function npmCliInvocation(name, args) {
  return { command: process.execPath, args: [resolveNpmCliScript(name), ...args] };
}
