// @ts-check
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

// #66 (the rename, 2026-09-07) SPLIT ONE FACT INTO TWO, on the CEO's ruling. Before it, "the repository's
// name" was a single question. It no longer is:
//
//   - REPO (above) answers "where does `gh`/git actually resolve TODAY" -- the operational identity every
//     live API call needs, and it is unchanged: the repository itself does not move until #63 actually
//     transfers it, so `row-claim.mjs`/`board-data.mjs` passing anything else to `--repo` would fail
//     every fleet-wide GitHub call the moment this landed.
//   - PRODUCT_REPO (below) answers "what does the product call itself NOW" -- clone instructions,
//     package.json `repository`/`homepage` fields, and every other piece of STATIC prose that #66 renamed
//     ahead of the transfer, deliberately, so the tree reads correctly before 15 September rather than
//     waiting for the day the repository itself moves.
//
// Exceptions inside PRODUCT_REPO's own territory, all live GitHub fetches or executions rather than prose
// a reader interprets: a `uses: DanBeckDev/a11y-witness@main` line still has to resolve on GitHub TODAY,
// and (#569, found by the V1 rehearsal) so does a CI badge -- it is an image fetched the instant the page
// renders, before any surrounding prose about the rename is read. `https://github.com/a11ign/a11ign` 404s
// until #63 lands, so both keep citing REPO, not PRODUCT_REPO, until #325 (the transfer rehearsal) changes
// them once #63 makes PRODUCT_REPO true operationally too. `repo-identity-consolidated.test.ts`'s SITES
// list is which sites use which constant.
//
// THESE ARE INSTANCES OF A WIDER RULE, NOT SPECIAL CASES -- #647, after `uses:` lines, badges, and
// provisioning clone targets (found wrong, #604) all needed the SAME answer independently, and auditing
// the rest of SITES against that answer found four more of the identical shape (#647): getting-started
// guides' own literal `git clone`/`curl | bash`/`irm | iex` steps. Before adding a new SITES entry, ask:
// does something -- a human copying a command verbatim, or a machine with no human in the loop -- RESOLVE
// this URL as a normal, unmediated step of using this repository TODAY? If yes, REPO. If it is prose a
// reader reads, interprets, and would naturally substitute the current name into (a mention in passing, a
// metadata field nobody automatically visits, a hyperlink a reader consciously clicks and can recover
// from), PRODUCT_REPO is correct. See `repo-identity-consolidated.test.ts`'s own header for the full
// reasoning and worked examples.
export const PRODUCT_REPO = "a11ign/a11ign";
export const PRODUCT_REPO_URL = `https://github.com/${PRODUCT_REPO}`;
export const PRODUCT_GIT_URL = `${PRODUCT_REPO_URL}.git`;
