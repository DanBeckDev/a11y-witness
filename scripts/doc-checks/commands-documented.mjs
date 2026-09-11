// @ts-check
// DOC CROSS-REFERENCE CHECK (#905): every npm script is named somewhere a human looks (or is declared internal
// with a reason), and `docs/commands.md` matches the tree's own `// command:` headers. Moved out of
// `commands-documented.test.ts`, which now asserts on these same functions; its header has the two populations
// and why each is held to a different standard. The rule that every command script CARRIES a header is a rule
// about the shape of code, not a cross-reference, and stays in the test (product-manager's ruling on #905).
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildPage, commandScripts } from "../generate-commands-doc.mjs";

export const COMMANDS_PAGE = "docs/commands.md";

/**
 * npm scripts nobody is expected to type, with the reason each is exempt.
 *
 * A reason rather than a bare name: "why is this one allowed to be undocumented" is exactly the question
 * a future reader will have, and an unexplained allowlist is a hole nobody can audit.
 * @type {Record<string, string>}
 */
export const INTERNAL = {
  build: "invoked by npm lifecycle and by run-job.yml; not something an operator chooses to run",
  test: "the universal convention; documenting `npm test` would be noise",
  lint: "the universal convention",
  typecheck: "the universal convention",
  pretest: "an npm lifecycle hook — npm runs it, nobody types it",
  pretypecheck: "an npm lifecycle hook — npm runs it, nobody types it",
  "test:python": "one half of `npm test`, which runs it; not chosen separately",
  "test:ts": "one half of `npm test`, which runs it; not chosen separately",
};

/**
 * Where a human would look for a HAND-WRITTEN command's prose. CLAUDE.md is for working ON the repo; docs/ is
 * for using it. Deliberately does NOT include `docs/commands.md` as a search target for THIS population -- npm
 * scripts are still documented in prose, and `docs/commands.md` covers `scripts/*.mjs` only; conflating the
 * two would let an npm script satisfy this check by accidentally sharing a substring with a scripts/ header
 * instead of actually being written about.
 * @param {string} root @returns {string}
 */
export function documentation(root) {
  const page = resolve(root, COMMANDS_PAGE);
  /** @type {string[]} */
  const parts = [];
  for (const name of ["CLAUDE.md", "README.md", "CONTRIBUTING.md"]) {
    if (existsSync(join(root, name))) parts.push(readFileSync(join(root, name), "utf8"));
  }
  const walk = (/** @type {string} */ dir) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (full === page) continue;
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".md")) parts.push(readFileSync(full, "utf8"));
    }
  };
  walk(resolve(root, "docs"));
  // The ansible playbooks are where the lab jobs are defined, and their headers are real documentation —
  // `lab-job.yml`'s catalogue explains every job it can run, with the reason each exists.
  walk(resolve(root, "packages/control/ansible"));
  return parts.join("\n");
}

/** @param {string} root @returns {string[]} */
export function npmScripts(root) {
  const path = join(root, "package.json");
  if (!existsSync(path)) return [];
  return Object.keys(/** @type {{ scripts?: Record<string, string> }} */ (JSON.parse(readFileSync(path, "utf8"))).scripts ?? {}).sort();
}

/** npm scripts neither declared internal nor named anywhere in `documentation(root)`. @param {string} root @returns {string[]} */
export function undocumentedNpmScripts(root) {
  const docs = documentation(root);
  return npmScripts(root).filter((name) => !Object.hasOwn(INTERNAL, name)).filter((name) => !docs.includes(name));
}

/** @param {string} root @returns {string[]} */
const commandScriptsIn = (root) => (existsSync(join(root, "scripts")) ? commandScripts(root) : []);

/**
 * The committed commands page (null when there is none) and the page the tree's headers build today.
 * @param {string} root @returns {{ committed: string | null, fresh: string }}
 */
export function commandsPage(root) {
  const path = join(root, COMMANDS_PAGE);
  return { committed: existsSync(path) ? readFileSync(path, "utf8") : null, fresh: buildPage(commandScriptsIn(root), root) };
}

/**
 * The page's lines that disagree with the tree: each only-committed line is stale, each only-fresh line is
 * missing. A page that differs outside its lines (whitespace, order) is named as one disagreement.
 * @param {string} root @returns {{ line: string, side: "stale" | "missing" }[]}
 */
export function commandsPageDrift(root) {
  const { committed, fresh } = commandsPage(root);
  if (committed === null || committed === fresh) return [];
  const had = new Set(committed.split("\n"));
  const want = new Set(fresh.split("\n"));
  const drift = [
    ...[...had].filter((line) => line && !want.has(line)).map((line) => ({ line, side: /** @type {const} */ ("stale") })),
    ...[...want].filter((line) => line && !had.has(line)).map((line) => ({ line, side: /** @type {const} */ ("missing") })),
  ];
  return drift.length ? drift : [{ line: "(order or blank lines)", side: "stale" }];
}

/** @param {string} root @returns {import("./check-result.mjs").CheckResult} */
export function check(root) {
  const commands = commandScriptsIn(root);
  const { committed } = commandsPage(root);
  return {
    examined: npmScripts(root).length + commands.length,
    unit: `npm scripts and command scripts under scripts/, against the prose and ${COMMANDS_PAGE}`,
    disagreements: [
      ...undocumentedNpmScripts(root).map((name) => ({ where: "package.json", reference: name,
        why: "discoverable only by reading source -- named nowhere a human looks, and not declared internal" })),
      ...(committed === null && commands.length ? [{ where: COMMANDS_PAGE, reference: COMMANDS_PAGE,
        why: "the generated commands page does not exist -- run `node scripts/run.mjs docs-commands`" }] : []),
      ...commandsPageDrift(root).map(({ line, side }) => ({ where: COMMANDS_PAGE, reference: line,
        why: side === "stale" ? "on the page, but no longer what the tree's headers say"
          : "what the tree's headers say, but not on the page -- run `node scripts/run.mjs docs-commands`" })),
    ],
  };
}
