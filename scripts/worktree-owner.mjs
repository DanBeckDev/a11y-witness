// #1128: WHOSE WORKTREE IS THIS? The question the incident needed answered and nothing could.
//
// A reviewer moved HEAD inside two worktrees another session was working in, 46 seconds after that
// session's own merge commit. Nothing was lost -- every tree was clean -- but they then counted in what
// they believed was their branch and got 16/21/8 against their tree's 21/22/9, and were minutes from
// filing a row on it. **The cost was a wrong measurement that looked exactly like a right one.**
//
// `git worktree list` shows the worktree, never who is using it. A detached checkout leaves the other
// session's files intact and correct for a DIFFERENT commit, so their next command answers honestly
// about the wrong tree, and `21` and `16` are both plausible counts.
//
// ADVISORY, NOT ENFORCING, and that is the choice rather than the cheap option. A stamp answers "whose
// tree is this"; it does not answer "is anyone using it", and those are different questions -- the
// lesson the prune report's ACTIVE column taught this repo twice in one morning. A hook that refused on
// this would be answering the second with the first.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/** The stamp's filename, inside the worktree it names. */
export const OWNER_FILE = ".a11y-owner";

/**
 * What a scratchpad worktree gets from its PATH, supplied for `wt-*` trees that get nothing.
 *
 * A scratchpad tree's path carries the owning session's uuid, which is why the transcript-mtime check
 * works there -- and why it covers none of this population: `/private/tmp/wt-1009` is named for the ROW,
 * not the session, which is exactly why it was reached for.
 *
 * @param {string} worktree @param {string} session @param {{ write?: typeof writeFileSync }} [deps]
 */
export function stampWorktree(worktree, session, { write = writeFileSync } = {}) {
  write(join(worktree, OWNER_FILE), `${session}\n`);
}

/**
 * The session that stamped `worktree`, or null when nobody did.
 *
 * NULL IS NOT "nobody is using it" -- it is "nobody said". Every tree made before this shipped answers
 * null, and a caller that reads that as "free" has made the same substitution this row is about.
 *
 * @param {string} worktree @param {{ exists?: typeof existsSync, read?: typeof readFileSync }} [deps]
 * @returns {string | null}
 */
export function worktreeOwner(worktree, { exists = existsSync, read = (/** @type {string} */ p) => readFileSync(p, "utf8") } = {}) {
  const path = join(worktree, OWNER_FILE);
  if (!exists(path)) return null;
  const owner = String(read(path)).trim();
  return owner === "" ? null : owner;
}

/**
 * What `worktree:whose` prints. Three answers, never two.
 *
 * @param {string} worktree @param {string} asking the session running the command
 * @param {{ owner?: typeof worktreeOwner }} [deps] @returns {string}
 */
export function whoseWorktree(worktree, asking, { owner = worktreeOwner } = {}) {
  const who = owner(worktree);
  if (who === null) {
    return `${worktree}: UNSTAMPED -- nobody recorded an owner. That is not "free": every worktree made `
      + "before #1128 answers this, and reading it as unowned is the substitution this stamp exists to stop.";
  }
  if (who === asking) return `${worktree}: yours (${who}).`;
  return `${worktree}: ${who}'s -- NOT yours. Moving HEAD here leaves their files correct for a different `
    + "commit, and their next command answers honestly about the wrong tree.";
}

/** `npm run worktree:whose [-- <path>]` -- defaults to the tree you are standing in. */
function main() {
  const target = process.argv[2] ?? process.cwd();
  const asking = process.env.A11Y_SESSION ?? "(no A11Y_SESSION set)";
  process.stdout.write(`${whoseWorktree(target, asking)}\n`);
}
if (import.meta.url === `file://${process.argv[1]}`) main();
