// THE ONE DECLARED VALUE for this repository's own name — issue #92.
//
// Written out by hand in 38 places across 25 files before this existed, because GitHub's redirect from an
// old URL makes every wrong reference keep working silently: nothing breaks the day the org moves, and a
// missed site is found weeks later by someone wondering why a link is dead or a deploy pulled nothing.
// #63 (the actual org transfer) is what changes this value; this file exists so that day is one edit here
// plus a failing test naming every site that still disagrees, rather than a hunt through 25 files under
// time pressure.
//
// NOT a claim about where the repository lives after any future transfer — it is what the name IS today.
// `scripts/board-data.mjs` and `scripts/row-claim.mjs` import `REPO` from here rather than declaring their
// own copy; every other reference is a literal (a `package.json` field, a workflow string, prose) that
// cannot import anything, and `repo-identity-consolidated.test.ts` pins each one against these constants
// instead.
export const REPO = "DanBeckDev/a11y-witness";
export const REPO_URL = `https://github.com/${REPO}`;
export const REPO_GIT_URL = `${REPO_URL}.git`;
