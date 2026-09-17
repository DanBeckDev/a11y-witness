// @ts-check
// DOC CROSS-REFERENCE CHECK (#1602): every in-page anchor link -- `](#anchor)` -- in a tracked markdown file names
// a heading in THAT file. `claude-md-links` reads only CLAUDE.md's links into other files, so a typo'd fragment
// inside README (worker-capture's `…-measurd-on`, tried on #1600) stayed green under every doc check.
//
// THE POPULATION IS GIT'S, never a typed list: every tracked `*.md`, so a document is covered the day it is added.
// Untracked files are out by construction -- the nightly report reads a clean checkout, which has none -- and a
// directory that is not a git work tree is refused rather than read as zero files.
//
// Heading anchors come from `claude-md-links`' own `headingAnchors` (one copy; its slugger's parity with the
// known-gaps index is pinned there), so this check inherits that module's limits: an approximation of GitHub's
// renderer, not a reimplementation. A `#` line inside a fenced code block also reads as a heading, and a `](#…)`
// inside one reads as a link -- measured 2026-09-14 at `ccd111c2`, stripping fences changed neither count.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sandboxGitEnv } from "../../packages/guards/src/git-env.mjs";
import { headingAnchors } from "./claude-md-links.mjs";

/**
 * Every tracked markdown file under `root`, as git lists it.
 * @param {string} root @returns {string[]} paths relative to `root`
 */
export function trackedMarkdown(root) {
  let listed;
  try {
    // `-z`: git quotes a path with non-ASCII bytes unless told not to, and a quoted path does not open.
    listed = execFileSync("git", ["ls-files", "-z", "--", "*.md"],
      { cwd: root, env: sandboxGitEnv(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    throw new Error(`not a git work tree at ${root}, so there is no tracked markdown to read`, { cause: error });
  }
  return listed.split("\0").filter(Boolean);
}

/**
 * Every in-page anchor link in a markdown text, with the 1-indexed line it is written on.
 * @param {string} text @returns {{ anchor: string, line: number }[]}
 */
export function inPageAnchorLinks(text) {
  return [...text.matchAll(/\]\(#([^)\s]+)\)/g)]
    .map((match) => ({ anchor: match[1], line: text.slice(0, match.index ?? 0).split("\n").length }));
}

/** @param {string} root @returns {import("./check-result.mjs").CheckResult} */
export function check(root) {
  const files = trackedMarkdown(root);
  let examined = 0;
  /** @type {import("./check-result.mjs").Disagreement[]} */
  const disagreements = [];
  for (const file of files) {
    const text = readFileSync(join(root, file), "utf8");
    const links = inPageAnchorLinks(text);
    examined += links.length;
    const anchors = headingAnchors(text);
    for (const { anchor, line } of links.filter((link) => !anchors.has(link.anchor))) {
      disagreements.push({ where: `${file}:${line}`, reference: `#${anchor}`,
        why: "names no heading in its own file -- a mistyped or renamed section link goes nowhere" });
    }
  }
  return { examined, unit: `in-page anchor links in ${files.length} tracked markdown files`, disagreements };
}
