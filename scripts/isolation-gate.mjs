// Can a consumer install this package and use it? Answered by doing it.
//
//   node scripts/isolation-gate.mjs packages/evidence [more...]
//   npm run gate:isolation
//
// ## Why a workspace cannot answer this
//
// A workspace install resolves everything by symlink, with the repo root as the cwd, so it is
// STRUCTURALLY INCAPABLE of detecting the failures that matter to a consumer (ADR 0007):
//
// - **phantom dependencies** — npm's hoisting makes an undeclared import resolve anyway;
// - **cwd-relative resolution** — `local-judge.ts` resolved the scorer as `".venv/bin/python"` and
//   `"scripts/score-screenreader-model.py"`, which work only when the cwd is the repo root;
// - **files dropped by `"files"`** — `.ps1`, `.cmd` and `.safetensors` payloads are exactly what an
//   allow-list loses silently;
// - **`"exports"` subpaths that do not resolve** the paths the README tells people to import.
//
// So the gate packs the package, installs the tarball into a fresh directory OUTSIDE the repository, and
// runs the package's own smoke test there. Continuous Delivery's smoke-test-the-deployed-artefact
// discipline, applied to a tarball.
//
// ## One trap, learned the hard way
//
// **`npm pack` includes untracked files.** A tarball built on a machine that happens to hold a missing file
// contains it, which is exactly how `scripts/score-screenreader-model.py` — the default judge backend —
// went missing from the repo for the project's whole life while every local run succeeded. This gate
// therefore proves *installability*, not completeness of the repo; `src/referenced-scripts.test.ts` covers
// the other half by asserting tracked-ness.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, copyFileSync, readFileSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

const SMOKE = "isolation-smoke.mjs";

/** Somewhere that is definitively not inside the repo, so nothing can resolve by accident. */
const consumerDir = () => mkdtempSync(join(tmpdir(), "a11y-isolation-"));

function run(command, args, cwd) {
  return execFileSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

/**
 * Pack, install outside the repo, run the smoke test. Returns a verdict rather than throwing, because the
 * caller needs to report every package rather than stop at the first bad one.
 */
export function checkIsolation(packageDir) {
  const dir = resolve(packageDir);
  const smoke = join(dir, SMOKE);
  if (!existsSync(join(dir, "package.json"))) return { ok: false, stage: "setup", detail: `no package.json in ${dir}` };
  // A package with no smoke test cannot be gated, and silently passing it would make the gate a decoration.
  if (!existsSync(smoke)) return { ok: false, stage: "setup", detail: `no ${SMOKE} — the gate cannot verify this package` };

  const name = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).name;
  const consumer = consumerDir();
  try {
    const packed = run("npm", ["pack", "--silent", "--pack-destination", consumer], dir).trim().split("\n").pop();
    run("npm", ["init", "-y"], consumer);
    // `--no-workspaces` and an absolute tarball path: without them npm can walk UP from the temp directory
    // and re-attach to a workspace root, which would reintroduce exactly the symlink resolution the gate
    // exists to avoid.
    run("npm", ["install", "--silent", "--no-workspaces", join(consumer, basename(packed))], consumer);
    copyFileSync(smoke, join(consumer, SMOKE));
    const output = run("node", [SMOKE], consumer);
    return { ok: true, stage: "smoke", name, detail: output.trim().split("\n").slice(-1)[0] ?? "" };
  } catch (error) {
    const stderr = String(error.stderr ?? error.stdout ?? error.message);
    // The first line that looks like a cause, not the whole npm essay.
    const cause = stderr.split("\n").find((l) => /Error|error|Cannot find|ERR_/.test(l))?.trim();
    return { ok: false, stage: "smoke", name, detail: cause ?? stderr.trim().split("\n")[0] ?? "failed" };
  } finally {
    rmSync(consumer, { recursive: true, force: true });
  }
}

/** Every real package, so neither the gate nor the build can run against a stale hand-written list. */
export function allPackages() {
  const root = fileURLToPath(new URL("../packages/", import.meta.url));
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(root, entry.name, "package.json")))
    .map((entry) => join(root, entry.name));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const targets = args.length === 0 || args[0] === "--all" ? allPackages() : args;
  if (args.length > 0 && args[0] !== "--all" && targets.length === 0) {
    process.stderr.write("usage: node scripts/isolation-gate.mjs [--all | <package-dir>...]\n");
    process.exit(2);
  }
  if (targets.length === 0) {
    // Says so rather than reporting success over nothing. The gate's own correctness is asserted separately
    // by `src/packaging/isolation-gate.test.ts` against three fixtures, so an empty run here is honest
    // rather than unverified: there is genuinely nothing published yet (PLAN.md M1, zero moves).
    process.stdout.write("no packages under packages/ yet — nothing to gate (PLAN.md M1 is scaffolding only)\n");
    process.stdout.write("the gate itself is verified by src/packaging/isolation-gate.test.ts\n");
    process.exit(0);
  }
  let failed = 0;
  for (const target of targets) {
    const verdict = checkIsolation(target);
    if (!verdict.ok) failed += 1;
    process.stdout.write(`  ${verdict.ok ? "ok  " : "FAIL"}  ${verdict.name ?? target}  ${verdict.detail}\n`);
  }
  process.stdout.write(`\n${targets.length - failed}/${targets.length} package(s) usable when installed\n`);
  process.exit(failed ? 1 : 0);
}
