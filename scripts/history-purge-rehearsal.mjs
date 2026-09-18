#!/usr/bin/env node
// @ts-check
// command: rehearse deleting non-standard refs and rewriting git history ahead of the org transfer
// ONE COMMAND FOR THE REHEARSAL -- delete non-standard refs, run the `git filter-repo` rewrite, rescan.
// #310, preparation for #63's org transfer and the repository going public.
//
// WHY THE REF-DELETION STEP EXISTS, AND WHY IT IS NOT OPTIONAL. Measured directly: a single rewrite pass
// (either `--replace-text` or a custom `--blob-callback`, both tried) left 246 of 2,268 matches across
// 76 of 715 paths untouched -- REPRODUCIBLE on a fresh clone, unchanged by a second pass. The cause was
// one non-standard ref, `refs/codex/turn-diffs/checkpoints/...`, pointing directly at a TREE rather than
// a commit -- `git filter-repo` prints "Unexpected object of type tree, skipping" and leaves every blob
// reachable ONLY through it untouched, while `git rev-list --objects --all` (what the scanner walks)
// still finds them. `refs/kanban/checkpoints/*` and `refs/tmp/pr*` are the same shape: tool-generated,
// ephemeral, not real project history, and not worth keeping through a transfer either way. Deleting
// every ref outside `refs/heads`, `refs/remotes` and `refs/tags` before the rewrite closed the gap to
// zero, verified against this repository's own history.
//
// A FRESH CLONE, NEVER ORIGIN. This tool REFUSES to run against a target path that is not inside a temp
// directory -- the one property that distinguishes "a disposable rehearsal clone" from "the checkout you
// are standing in". The transfer itself and the force-push to origin are explicitly the owner's hands,
// not this tool's.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";
import { refuseUnknownFlags, flagValue } from "@a11ign/worker-fleet/cli-flags";
import { sandboxGitEnv } from "../packages/guards/src/git-env.mjs";
import { scanHistory } from "./history-secret-scan.mjs";

/** @param {string} target */
function refuseUnlessDisposable(target) {
  const real = resolve(target);
  const disposableRoots = [tmpdir(), "/tmp", "/private/tmp", "/var/folders"];
  if (!disposableRoots.some((root) => real.startsWith(resolve(root)))) {
    console.error(`REFUSING: ${real} is not inside a temp directory (${disposableRoots.join(", ")}).\n`
      + "This tool rewrites history and must run against a disposable rehearsal clone, never against a\n"
      + "real checkout or origin. Pass --clone-into=<a path under one of those roots>, or omit the flag\n"
      + "to have one created automatically.");
    process.exit(2);
  }
}

/**
 * Every ref outside `refs/heads`, `refs/remotes` and `refs/tags` -- tool-generated checkpoint and
 * temporary refs, never real project history.
 * @param {string} repoDir
 * @returns {string[]}
 */
export function nonStandardRefs(repoDir) {
  const out = execFileSync("git", ["for-each-ref", "--format=%(refname)"],
    { cwd: repoDir, env: sandboxGitEnv(), encoding: "utf8" });
  return out.split("\n").filter(Boolean)
    .filter((ref) => !/^refs\/(heads|remotes|tags)\//.test(ref));
}

/** @param {string} repoDir @param {string[]} refs */
function deleteRefs(repoDir, refs) {
  for (const ref of refs) {
    execFileSync("git", ["update-ref", "-d", ref], { cwd: repoDir, env: sandboxGitEnv() });
  }
  execFileSync("git", ["reflog", "expire", "--expire=now", "--all"], { cwd: repoDir, env: sandboxGitEnv() });
  execFileSync("git", ["gc", "--prune=now"], { cwd: repoDir, env: sandboxGitEnv() });
}


/**
 * The replacement rules a `--replace-text` file declares, and a REFUSAL for anything that is not one.
 *
 * **`git filter-repo --replace-text` HAS NO COMMENT SYNTAX, AND THAT COST THIS REPOSITORY ITS HISTORY.**
 * Every non-empty line is a rule: one containing `==>` replaces the left with the right, and one WITHOUT
 * replaces that literal text with filter-repo's default, `***REMOVED***`. The file used to open with
 * twelve lines of explanation each beginning with `#`, two of them a bare `#`. Run for real on
 * 2026-09-18, that rewrote EVERY `#` IN EVERY FILE ACROSS 6,108 COMMITS -- `***REMOVED***!/bin/sh`, so
 * the repo's own hooks stopped being shell, which is how it surfaced. Full account:
 * `docs/history-purge-replacements.md`.
 *
 * So prose cannot live in that file any more, and this refuses it rather than trusting that nobody adds
 * any: a comment there is not a comment, it is an instruction to destroy every occurrence of itself.
 *
 * @param {string} text @returns {{ rules: { pattern: RegExp, replacement: string }[], refusals: string[] }}
 */
export function parseReplacementRules(text) {
  const rules = [];
  const refusals = [];
  for (const [i, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (line === "") continue;
    if (!line.includes("==>")) {
      refusals.push(`line ${i + 1}: ${JSON.stringify(line)} has no \`==>\`, so filter-repo would replace `
        + "every occurrence of that literal text with \"***REMOVED***\". If it is a comment, it belongs in "
        + "docs/history-purge-replacements.md -- this file holds rules only.");
      continue;
    }
    const [left, ...rest] = line.split("==>");
    const replacement = rest.join("==>");
    rules.push(left.startsWith("regex:")
      ? { pattern: new RegExp(left.slice("regex:".length), "g"), replacement }
      : { pattern: new RegExp(left.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), replacement });
  }
  return { rules, refusals };
}

/**
 * What the declared rules SHOULD turn this content into. Pure, and the whole basis of `verifyRewrite`.
 * @param {string} content @param {{ pattern: RegExp, replacement: string }[]} rules
 */
export function applyReplacementRules(content, rules) {
  let out = content;
  for (const rule of rules) out = out.replace(new RegExp(rule.pattern.source, "g"), rule.replacement);
  return out;
}

/**
 * Every path in a ref's tree and the blob it points at -- SHAs only, so finding what changed costs one
 * `ls-tree` per side rather than reading a thousand files.
 * @param {string} repoDir @param {string} ref @returns {Map<string, string>}
 */
function treeBlobs(repoDir, ref) {
  const out = execFileSync("git", ["ls-tree", "-r", ref], { cwd: repoDir, env: sandboxGitEnv(),
    encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  const blobs = new Map();
  for (const line of out.split("\n")) {
    const match = /^\d+ blob ([0-9a-f]+)\t(.*)$/.exec(line);
    if (match) blobs.set(match[2], match[1]);
  }
  return blobs;
}

/** @param {string} repoDir @param {string} sha */
const blobText = (repoDir, sha) => execFileSync("git", ["cat-file", "blob", sha],
  { cwd: repoDir, env: sandboxGitEnv(), encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

/**
 * DOES THE REWRITE DO ONLY WHAT THE RULES SAY? The check that was missing, and whose absence let a rewrite
 * that changed every file in the repository read as a clean one.
 *
 * `history-secret-scan.mjs` looks for SECRET PATTERNS. A rewrite that mangles every `#` still scores zero,
 * because `#` is not a secret -- so `CLEAN: 0 findings` meant "the target pattern is gone", never
 * "nothing else changed", and it was read as the latter. This asks the other question: for every path
 * whose blob MOVED, is the new content exactly `applyReplacementRules(old)`? A file the rules cannot
 * explain is a refusal, named, and the rewrite is not to be pushed.
 *
 * THE TIP, NOT ALL OF HISTORY, and that is a deliberate limit rather than an oversight: filter-repo
 * applies one blob transform uniformly, so a rule that misbehaves misbehaves at the tip too -- under the
 * 2026-09-18 defect this refuses on the FIRST file it reads. Verifying every blob in 6,108 commits would
 * cost hours to catch a class this catches in seconds.
 *
 * @param {{ sourceRepo: string, rewrittenRepo: string, ref?: string,
 *           rules: { pattern: RegExp, replacement: string }[] }} args
 * @returns {{ changed: number, unexplained: string[] }}
 */
export function verifyRewrite({ sourceRepo, rewrittenRepo, ref = "refs/heads/main", rules }) {
  const before = treeBlobs(sourceRepo, ref);
  const after = treeBlobs(rewrittenRepo, ref);
  const unexplained = [];
  for (const [path, sha] of before) {
    const now = after.get(path);
    if (now === undefined) { unexplained.push(`${path}: present before the rewrite, gone after`); continue; }
    if (now === sha) continue;
    const expected = applyReplacementRules(blobText(sourceRepo, sha), rules);
    if (blobText(rewrittenRepo, now) !== expected) {
      unexplained.push(`${path}: changed, and NOT by the declared rules`);
    }
  }
  for (const path of after.keys()) {
    if (!before.has(path)) unexplained.push(`${path}: absent before the rewrite, present after`);
  }
  const changed = [...before].filter(([p, sha]) => after.get(p) !== sha).length;
  return { changed, unexplained };
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) {
  refuseUnknownFlags(["--source", "--clone-into", "--replacements"],
    { entry: import.meta.url, command: "node scripts/history-purge-rehearsal.mjs" });
  const source = flagValue(process.argv, "source");
  if (!source || !existsSync(source)) {
    console.error("Usage: node scripts/history-purge-rehearsal.mjs --source=<real repo> "
      + "[--clone-into=<path>] [--replacements=<file>]\n"
      + "--source must be a real, existing local repository to mirror-clone from.");
    process.exit(2);
  }
  const cloneInto = flagValue(process.argv, "clone-into")
    ?? mkdtempSync(join(tmpdir(), "history-purge-rehearsal-"));
  refuseUnlessDisposable(cloneInto);
  const replacements = flagValue(process.argv, "replacements")
    ?? fileURLToPath(new URL("./history-purge-replacements.txt", import.meta.url));

  // READ AND REFUSE BEFORE ANYTHING IS CLONED, let alone rewritten. A file carrying a line without
  // `==>` is a file that will destroy every occurrence of that text, and the only safe moment to say
  // so is before the rewrite -- not after, when the damage is already in a mirror somebody may push.
  const { rules, refusals } = parseReplacementRules(readFileSync(replacements, "utf8"));
  if (refusals.length > 0) {
    console.error(`REFUSING: ${replacements} is not rules-only.\n  ${refusals.join("\n  ")}`);
    process.exit(2);
  }
  if (rules.length === 0) {
    console.error(`REFUSING: ${replacements} declares no rules, so the rewrite would change nothing `
      + "and a CLEAN reading afterwards would mean nothing.");
    process.exit(2);
  }
  console.error(`${rules.length} replacement rule(s) declared.`);

  console.error(`Mirror-cloning ${source} into ${cloneInto} ...`);
  execFileSync("git", ["clone", "--mirror", source, cloneInto], { env: sandboxGitEnv(), stdio: "inherit" });

  const stale = nonStandardRefs(cloneInto);
  console.error(`\nDeleting ${stale.length} non-standard ref(s) (checkpoint/tmp refs, not real history):`);
  for (const ref of stale) console.error(`  ${ref}`);
  deleteRefs(cloneInto, stale);

  console.error("\nRunning git filter-repo --replace-text ...");
  execFileSync("git", ["filter-repo", "--replace-text", replacements, "--force"],
    { cwd: cloneInto, env: sandboxGitEnv(), stdio: "inherit" });

  // THE REWRITE IS CHECKED FOR WHAT IT DID, BEFORE IT IS CHECKED FOR WHAT IT REMOVED. This order is
  // the lesson of 2026-09-18: the secret scan read CLEAN on a rewrite that had changed every file in
  // the repository, because `#` is not a secret. A rewrite that does something the rules do not
  // explain is not a rewrite worth scanning.
  console.error("\nVerifying the rewrite did ONLY what the rules declare ...");
  const { changed, unexplained } = verifyRewrite({ sourceRepo: source, rewrittenRepo: cloneInto, rules });
  if (unexplained.length > 0) {
    console.error(`\nREFUSING: ${unexplained.length} path(s) at the tip changed in a way the declared `
      + `rules do not explain (${changed} changed in total). DO NOT PUSH THIS REWRITE.\n  `
      + unexplained.slice(0, 20).join("\n  "));
    process.exit(3);
  }
  console.error(`Verified: ${changed} file(s) changed at the tip, every one of them exactly what the `
    + "declared rules produce.");

  console.error("\nRe-scanning the rewritten history ...");
  const findings = await scanHistory(cloneInto);
  if (findings.length === 0) {
    console.log(`\nCLEAN: 0 findings in ${cloneInto} after the rewrite.`);
    process.exit(0);
  }
  console.error(`\n${findings.length} finding(s) remain in ${cloneInto} -- review before trusting the `
    + "rewrite. Run scripts/history-secret-scan.mjs --all --repo=<path> for the full report.");
  process.exit(1);
}
