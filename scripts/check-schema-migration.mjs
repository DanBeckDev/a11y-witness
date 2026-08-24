/**
 * A declared schema migration may exist on a branch. It may never be released.
 *
 * `scorer-artifact.test.ts` asserts the committed weights carry the schema the committed feature pipeline
 * computes, because a consumer cloning a ref where they disagree cannot score anything at all. That is the
 * right invariant for what SHIPS, and the wrong one for a branch that is deliberately changing the schema
 * ahead of a retrain: there, the two disagree for hours by design.
 *
 * The old way through was `A11Y_SKIP_VERIFY=1`, and the cost of that is not the one guard it was aimed at —
 * it disables the ENTIRE pre-push hook, so lint, typecheck, 949 tests, check-signals and rules:gate all stop
 * running too. A skip used on every push is a hook nobody has.
 *
 * So the divergence is DECLARED in the tree instead, in `models/schema-migration.json`, naming both versions.
 * The test then accepts a divergence that the declaration describes exactly, and still fails an undeclared one
 * or a declaration that does not match reality. This script is the other half: release refuses while the
 * declaration exists, so the state cannot reach a consumer.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";

export const MIGRATION_FILE = "packages/scorer/models/schema-migration.json";

/** Pure so the test can drive it; `present` is the caller's business, not the filesystem's. */
export function migrationVerdict(declaration) {
  if (!declaration) return { ok: true, message: "no schema migration is open" };
  return {
    ok: false,
    message:
      `a schema migration is open: ${declaration.shippedSchema} -> ${declaration.pendingSchema}, `
      + `declared ${declaration.openedAt}.\n`
      + `  ${declaration.why}\n`
      + `  The shipped weights cannot score under the pipeline in this tree, so nothing here may be released.\n`
      + `  Close it by promoting weights stamped ${declaration.pendingSchema} and deleting ${MIGRATION_FILE}.`,
  };
}

function readDeclaration(repoRoot) {
  const path = join(repoRoot, MIGRATION_FILE);
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
}

function main() {
  const repoRoot = fileURLToPath(new URL("../", import.meta.url));
  const verdict = migrationVerdict(readDeclaration(repoRoot));
  console.log(verdict.ok ? `OK  ${verdict.message}` : `BLOCKED  ${verdict.message}`);
  process.exit(verdict.ok ? 0 : 1);
}

// `?? ""` because `node -e "import(...)"` — this repo's prescribed check for an .mjs file — runs with no
// argv[1] at all, and a guard that throws on import defeats the one verification that catches an import-time
// ReferenceError. Same form as every other entry point here.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
