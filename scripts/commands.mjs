// @ts-check
/**
 * THE COMMAND CATALOGUE — A3, so a new command does not mean editing `package.json`.
 *
 * `package.json` was edited by 19 PRs for unrelated reasons: a changeset, a dependency bump and a new npm
 * script all land in one file, so two of them collide for no reason connected to either. B4 (no two open
 * PRs touch the same file) is impractical while that is true, which is why this row comes before it.
 *
 * A command declared here is invoked as `node scripts/run.mjs <name>` and needs no `package.json` entry at
 * all. Versions and dependencies keep that file; commands leave it.
 *
 * ## WHY A DATA FILE RATHER THAN A DIRECTORY SCAN
 *
 * A scan would make every `scripts/*.mjs` a command, and 4 of the 28 without an npm entry today are
 * MODULES that are imported and never run (`board-data.mjs`, `board-markdown.mjs`, `git-env.mjs`,
 * `repo-identity.mjs`). "Runnable" is not the same as "a command somebody types", and only a person can
 * say which. The same reason `commands-documented.test.ts` keeps `INTERNAL` as a decision rather than
 * inferring it from a shape.
 *
 * ## EVERY ENTRY IS HELD TO THE DOCUMENTATION RULE
 *
 * `commands-documented.test.ts` now reads this catalogue as well as `package.json`, so moving a command
 * here does not move it out of that guard's reach. That mattered: the guard reads `package.json` and
 * nothing else, so the 24 runnable scripts with no npm entry are invisible to it TODAY, 20 of them
 * undocumented. This row does not close that gap -- see the PR body -- but it must not widen it.
 *
 * @typedef {{ argv: string[], internal?: string }} Command
 */

/**
 * SEEDED WITH COMMANDS THAT HAVE NO `package.json` ENTRY TODAY, deliberately.
 *
 * Moving a command that HAS an npm entry would mean deleting that entry, and `npm run <it>` would stop
 * working for every caller, playbook and document that names it -- a breaking change wearing a tidy-up's
 * clothes. These four are invoked by path today, so nothing changes for anyone: they gain a name and a
 * place, and lose nothing. They are also the four of the twenty-four path-invoked commands that are
 * already documented, so the guard below is satisfied by fact rather than by an exemption written to
 * make it pass.
 */
/** @type {Record<string, Command>} */
export const COMMANDS = {
  "merge-guard": { argv: ["node", "scripts/merge-guard.mjs"] },
  "auto-arm-sweep": { argv: ["node", "scripts/auto-arm-sweep.mjs"] },
  "close-rows-for-merged-pr": { argv: ["node", "scripts/close-rows-for-merged-pr.mjs"] },
  "reconstitution-drill": { argv: ["node", "scripts/reconstitution-drill.mjs"] },
  "select-changed-tests": { argv: ["node", "scripts/select-changed-tests.mjs"] },
  // #478 (A6b): registered here rather than as a new `package.json` script, on purpose -- this file
  // exists so a new command does not mean editing that one. `docs/commands.md` is committed and checked
  // deliberately (see generate-commands-doc.mjs's own header, and generated-paths.test.ts's
  // TRACKED_EXEMPT), so regenerating it after a header changes is itself a command a person types.
  "docs-commands": { argv: ["node", "scripts/generate-commands-doc.mjs"] },
  // #494: regenerates .github/workflows/consumer-gate.yml from README.md's own Quickstart fence, pinned
  // to the current HEAD sha. Run this as the last step before a release, the same discipline
  // docs-commands already established for a generated-and-tracked file.
  "consumer-gate": { argv: ["node", "scripts/generate-consumer-gate.mjs"] },
};
