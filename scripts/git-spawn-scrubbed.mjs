// command: (not a command) the ESLint rule for #1185, imported by eslint.config.js
/**
 * #1185: A `git` SPAWN MUST GO THROUGH A GIT_* SCRUBBING HELPER, REPORTED AT THE SPAWN.
 *
 * git EXPORTS `GIT_DIR`/`GIT_WORK_TREE`/`GIT_INDEX_FILE` into every hook environment. On 2026-09-06 the
 * pre-push hook ran `npm test` with `GIT_DIR` set, and a test that spawned git with `cwd` alone and an
 * inherited `env` operated on the REAL repository: `core.bare` flipped twice, stray commits landed on real
 * refs, and a test's own `git config user.name` was reused as author on 15 commits, six already on
 * `origin/main`.
 *
 * CONVERTED FROM `git-spawn-classification.test.ts` (#908), and the measurement is why a rule rather than
 * a sweep: **79 of 79 files spawning git already import a canonical helper.** The guard has no findings to
 * make and only a line to hold, which is exactly where a sweep earns least -- it runs once in the PR suite
 * and fails far from the call -- and a rule earns most: every `npm run lint`, at the spawn's own line,
 * refusing a new file as it is written rather than on the next run.
 *
 * THE AST IS WHY COMMENTS CANNOT COUNT. The sweep strips comments to avoid matching prose that quotes
 * `execFileSync("git", ...)`; three such comments exist in this tree and a regex over raw source reads all
 * three as spawns -- measured while scoping this row, which is the defect the sweep's own header warns of.
 * A rule asking the syntax cannot make that mistake at all.
 *
 * WHAT DELETES THIS RULE, which #908 requires naming: one helper that spawns git with the environment
 * sandboxed inside it, so a raw spawn has no caller. With adoption already complete that is a refactor of
 * call sites rather than a rescue, and this rule is what keeps the number at 79 until someone does it.
 */

/** The helpers a spawn may go through, by basename -- real imports are relative, so the path varies. */
const CANONICAL_HELPER_BASENAMES = ["git-env.mjs", "git-safe-env.mjs", "git-sandbox.ts"];

/** Calling one of these is what makes the import USED rather than merely present. */
const HELPER_CALLS = new Set(["sandboxGitEnv", "withGitSandbox"]);

/** The child_process spawners, by the name at the call site -- bare or as a member. */
const SPAWNERS = new Set(["execFileSync", "spawnSync", "execFile", "spawn"]);

const calleeName = (node) =>
  node.callee?.type === "Identifier" ? node.callee.name
    : node.callee?.type === "MemberExpression" && node.callee.property?.type === "Identifier"
      ? node.callee.property.name : null;

/** @type {import("eslint").Rule.RuleModule} */
export const gitSpawnScrubbed = {
  meta: {
    type: "problem",
    schema: [{ type: "object", properties: { dataNotASpawn: { type: "array", items: { type: "string" } } },
      additionalProperties: false }],
    messages: {
      unscrubbed: "this spawns `git` and nothing in this file uses a GIT_* scrubbing helper. git exports "
        + "`GIT_DIR` into every hook environment, so a spawn with an inherited env operates on whatever "
        + "repository the caller was in -- on 2026-09-06 that put stray commits on real refs and reused a "
        + "test's `git config user.name` as author on 15 commits. Import one of: {{helpers}}, and CALL "
        + "`sandboxGitEnv()` or `withGitSandbox()` -- importing without calling is not scrubbing. If this "
        + "file cannot spawn (the literal is data), add it to the rule's `dataNotASpawn` option.",
    },
  },
  create(context) {
    const here = context.filename.replace(`${process.cwd()}/`, "");
    if ((context.options?.[0]?.dataNotASpawn ?? []).includes(here)) return {};
    const source = context.sourceCode;
    // IMPORTED **AND** CALLED, which is the distinction the sweep drew and the one worth keeping: a file
    // that imports a helper and never calls it is exactly as unscrubbed as one that never imported it,
    // and reads as safe to anyone grepping for the import.
    const imported = source.ast.body.some((n) => n.type === "ImportDeclaration"
      && CANONICAL_HELPER_BASENAMES.some((b) => String(n.source.value).endsWith(b)));
    let called = false;
    const spawns = [];
    return {
      CallExpression(node) {
        const name = calleeName(node);
        if (name && HELPER_CALLS.has(name)) called = true;
        if (!name || !SPAWNERS.has(name)) return;
        const first = node.arguments[0];
        if (first?.type === "Literal" && first.value === "git") spawns.push(node);
      },
      "Program:exit"() {
        if (imported && called) return;
        for (const node of spawns) {
          context.report({ node, messageId: "unscrubbed",
            data: { helpers: CANONICAL_HELPER_BASENAMES.join(", ") } });
        }
      },
    };
  },
};
