// @ts-check
/**
 * WHERE THIS REPO'S TOOLING LIVES -- one list, because a census that names only some of it reports a
 * clean population having never looked at the rest.
 *
 * It used to be one directory. `scripts/` held the product's build tooling, the repo-hygiene guards and
 * the whole AI agent organisation together, and every census in the tree spelled `"scripts"` inline.
 * When the org moved to `@a11ign/agent-org` and the guards to `@a11ign/guards`, each of those censuses
 * kept walking the 27 files left behind and PASSED -- `commands-documented` found 21 command scripts
 * against a known census of ~51, `merge-method-is-one-fact` found zero `gh pr merge` call sites where it
 * expects at least four, and `tracker-writer-population` walked 63 files instead of 153. An emptiness
 * assertion over a population that moved is not a clean result; it is a check that stopped looking.
 *
 * So the roots are named ONCE and imported. The next move edits this line, not twenty-three test files
 * -- and a root added here is a root every census gains, which is the property the inline copies could
 * never have.
 *
 * ORDER IS DELIBERATE: `scripts/` first, because a few writers (npm-token-liveness) stayed behind and a
 * reader resolving a bare basename against these in order should find the product's copy before the
 * org's if both ever exist.
 * @type {Readonly<string[]>}
 */
export const TOOLING_ROOTS = Object.freeze(["scripts", "packages/agent-org/src", "packages/guards/src"]);
