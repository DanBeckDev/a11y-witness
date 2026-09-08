// @ts-check
// #492: `spawnSync`/`execFileSync` GIVEN A BARE `npx`/`npm` IS ENOENT ON WINDOWS, WITHOUT A SHELL.
//
// npm ships `npx`/`npm` on Windows as `.cmd` batch-file shims, not `.exe` binaries. Windows' CreateProcess
// can only launch a real executable image directly, and without `shell: true` neither `spawnSync` nor
// `execFileSync` consults `PATHEXT` to try appending an extension -- so the bare name resolves fine on
// Linux and macOS (where `npx`/`npm` are real files) and is `ENOENT` on Windows. Caught by the V1
// rehearsal (#324): three real `windows-2022` Action runs, none of which reached NVDA or the page, because
// `npm ci`'s own `prepare` step crashed in `build-packages.mjs` before anything else ran. Invisible until
// then because every CI job in this repository runs on Linux -- the one platform the public docs require
// is the one the build was never exercised on.
//
// RESOLVE THE EXTENSION, NEVER ADD A SHELL. `shell: true` re-interprets the WHOLE command line as one
// string, reintroducing the quoting hazard this repository has already paid for once -- four capture
// shards dispatched at `--worker=http://:8765` for 29 minutes because a command went through a shell (see
// CLAUDE.md's `ansible/lab-job.yml` history). Node's own `child_process` implementation auto-detects a
// `.bat`/`.cmd` suffix on Windows and safely routes that one call through `cmd.exe` with its argument list
// still passed as a real array -- naming the executable `npx.cmd` (or `npm.cmd`) explicitly is what makes
// that documented mechanism fire, without shelling every other argument on the line.
/**
 * @param {string} name
 * @returns {string}
 */
export function npmCliExecutable(name) {
  return process.platform === "win32" ? `${name}.cmd` : name;
}
