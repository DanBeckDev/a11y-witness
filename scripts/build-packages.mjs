// Build every package under `packages/` — `npm run build`.
//
// `tsc --build` is given all the package directories at once, so it resolves their `references` itself and
// builds in dependency order. That is the whole reason there is no hand-written solution file: a list of
// projects in a `tsconfig.build.json` is one more thing that can go stale against `packages/`, and this repo
// has already paid for that class of mistake (a fix applied at one call site when the behaviour reached
// several). Discovery cannot drift.
//
// `tsconfig.json` at the root is untouched and stays `noEmit: true`: it type-checks `src/` as one program for
// `npm run typecheck` and the editor, and must keep working unchanged while packages are extracted one at a
// time (PLAN.md M2-M8).
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { allPackages } from "./isolation-gate.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const buildable = allPackages().filter((dir) => existsSync(join(dir, "tsconfig.json")));

if (buildable.length === 0) {
  // Reported rather than passed silently. There is genuinely nothing to build yet (M1 is scaffolding, zero
  // moves), and the enforcement `composite: true` buys is verified separately by
  // `packages/lab/src/packaging/project-references.test.ts` — so an empty build here is honest, not unverified.
  process.stdout.write("no buildable packages under packages/ yet (PLAN.md M1 is scaffolding only)\n");
  process.exit(0);
}

process.stdout.write(`building ${buildable.length} package(s)\n`);
execFileSync("npx", ["tsc", "--build", ...buildable], { cwd: root, stdio: "inherit" });
