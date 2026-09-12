#!/usr/bin/env node
// @ts-check
// command: check a PR body's Acceptance/Closes with the tree's own parser before gh pr create/edit sends it
//
// pr:open / pr:edit -- refusing with the parser's own message (#746).
//
// FOUR PRS WENT RED ON THE BODY IN ONE DAY, four authors, four different modes, none of them a defect in
// the change: #708 a DUPLICATE Acceptance section, #723 prose in the Acceptance section (then Closes
// missing), #727 a pipe the file pre-check cannot parse, #736 the section under a `## Verified` heading
// instead of `## Acceptance`. Every one cost a CI round. The parser (`scripts/acceptance-commands.mjs`)
// was right in all four cases -- the defect is only that its answer arrives four minutes and one CI round
// after the mistake, instead of at the moment `gh pr create`/`gh pr edit` is about to send the body.
//
// NO SECOND PARSER. `checkBody` below calls `acceptanceReport`/`closesDeclarationReport` -- the exact
// functions `scripts/acceptance-commands.mjs`'s own CLI entry (the "acceptance / run" CI job) calls --
// never a local regex re-deriving "is this body valid". A second implementation of that question would
// drift from the first, which is this repository's most-repeated defect and would produce the worst
// possible outcome here: a body that passes this wrapper and fails in CI, exactly the situation being
// fixed. `scripts/acceptance-commands.mjs` is therefore NOT touched by this file -- it is imported, not
// duplicated.
//
// WHAT THIS DOES NOT DO: a PR body edited in the web UI -- where a `## Verified` heading is most likely to
// be typed -- is not checked. This closes the path the fleet actually uses (`gh pr create`/`gh pr edit`
// from a script); the web form remains unguarded, the mirror of #735 (the row template's own web-form-vs-
// `gh issue create` gap).
import { execFileSync, execSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { acceptanceReport, closesDeclarationReport } from "./acceptance-commands.mjs";
import { leakRefusalReason } from "../packages/lab/src/packaging/leak-patterns.mjs";

/**
 * Runs a command FOR REAL, exactly as `acceptance-commands.mjs`'s own (unexported) `runForReal` does --
 * this is the injectable execution seam `acceptanceReport` was built to take, not a second parser: nothing
 * here interprets the body or classifies a command, it only runs the ones the real parser already decided
 * are runnable.
 * @param {string} command
 * @returns {number}
 */
function runForReal(command) {
  try {
    execSync(command, { stdio: "inherit", shell: "/bin/bash" });
    return 0;
  } catch (error) {
    const status = /** @type {{ status?: number }} */ (error).status;
    return typeof status === "number" ? status : 1;
  }
}

/**
 * THE CHECK -- the tree's own `acceptanceReport` (Acceptance/Refutation) plus `closesDeclarationReport`
 * (Closes), composed exactly as `acceptance-commands.mjs`'s own CLI entry composes them. `ok: false` means
 * refuse; `lines` is exactly what the CI acceptance job itself would print for this body.
 * @param {string} body
 * @param {{ run?: (command: string) => number }} [deps]
 * @returns {{ ok: boolean, lines: string[] }}
 */
export function checkBody(body, { run = runForReal } = {}) {
  // #891: checked BEFORE anything else, and returned on its own -- `acceptanceReport` actually RUNS the
  // body's Acceptance command for real, and a body worth refusing for a leak is not worth running
  // anything from first. The same `allLeaksIn` predicate the tree-wide guards already drive, never
  // restated.
  const leak = leakRefusalReason(body);
  if (leak) return { ok: false, lines: [leak] };
  const report = acceptanceReport(body, run);
  const closes = closesDeclarationReport(body);
  return { ok: report.ok && closes.ok, lines: [...report.lines, closes.line] };
}

/**
 * The body to check, read from the SAME flags `gh pr create`/`gh pr edit` themselves read -- never a
 * shape this wrapper invents. `null` when neither is given, which `main` treats as a hard refusal: a body
 * typed into `gh`'s own interactive editor cannot be checked synchronously before it is sent.
 * @param {readonly string[]} args
 * @returns {string | null}
 */
export function bodyFromArgs(args) {
  const bodyIndex = args.indexOf("--body");
  if (bodyIndex !== -1 && args[bodyIndex + 1] !== undefined) return args[bodyIndex + 1];
  const bodyFileIndex = args.indexOf("--body-file");
  if (bodyFileIndex !== -1 && args[bodyFileIndex + 1] !== undefined) {
    return readFileSync(args[bodyFileIndex + 1], "utf8");
  }
  return null;
}

function usage() {
  return "Usage:\n"
    + "  node scripts/pr-open.mjs create <gh pr create args...>   (checks --body/--body-file first)\n"
    + "  node scripts/pr-open.mjs edit <pr-number> <gh pr edit args...>   (same check, same refusal)\n";
}

function main() {
  const argv = process.argv.slice(2);
  const [mode, ...rest] = argv;
  if (mode !== "create" && mode !== "edit") {
    process.stderr.write(usage());
    process.exitCode = 2;
    return;
  }
  const body = bodyFromArgs(rest);
  if (body === null) {
    process.stderr.write(`pr-open ${mode}: --body or --body-file is required -- this wrapper checks the `
      + "body before gh sends it, and cannot check a body it was never given. Use `gh pr " + mode
      + "` directly, unguarded, for an interactive editor session.\n");
    process.exitCode = 2;
    return;
  }
  const result = checkBody(body);
  for (const line of result.lines) process.stdout.write(`${line}\n`);
  if (!result.ok) {
    process.stderr.write(`pr-open: REFUSED -- this body would fail CI's own acceptance job; fix it before `
      + `gh pr ${mode} runs (nothing was sent to GitHub).\n`);
    process.exitCode = 1;
    return;
  }
  execFileSync("gh", ["pr", mode, ...rest], { stdio: "inherit" });
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) {
  main();
}
