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
 * Sibling packages this one depends on, as directories, transitively.
 *
 * Only `@a11y-witness/*` — everything else comes from the registry, which is the point of the gate: a
 * dependency npm can actually resolve is not the failure mode being tested.
 */
export function internalDependencies(packageDir, seen = new Set()) {
  const manifest = JSON.parse(readFileSync(join(resolve(packageDir), "package.json"), "utf8"));
  const wanted = { ...manifest.dependencies, ...manifest.peerDependencies };
  const optional = manifest.peerDependenciesMeta ?? {};
  const dirs = [];
  for (const dependency of Object.keys(wanted)) {
    if (!dependency.startsWith("@a11y-witness/") || seen.has(dependency)) continue;
    if (optional[dependency]?.optional && !existsSync(siblingDir(packageDir, dependency))) continue;
    seen.add(dependency);
    const dir = siblingDir(packageDir, dependency);
    if (!existsSync(join(dir, "package.json"))) {
      throw new Error(`${manifest.name} depends on ${dependency}, which is not a package in this repo`);
    }
    dirs.push(dir, ...internalDependencies(dir, seen));
  }
  return dirs;
}

/** `@a11y-witness/foo` lives at `packages/foo`, beside the package asking for it. */
const siblingDir = (packageDir, dependency) =>
  join(resolve(packageDir), "..", dependency.slice("@a11y-witness/".length));

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

  const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const name = manifest.name;
  const consumer = consumerDir();
  try {
    // Every sibling this package needs, packed too.
    //
    // Nothing is published, so npm cannot fetch `@a11y-witness/evidence` from the registry — it would fail
    // the install with E404 and the gate would report a broken package that is fine. npm 7+ also
    // auto-installs PEER dependencies, so a peer on an unpublished sibling fails the same way; that is why
    // peers are collected here as well.
    //
    // This is not a workaround, it is the composition the gate should have been testing all along: a
    // consumer installs `judge` AND the `scorer` it peers on, and the two have to work together outside the
    // workspace. `evidence` and `scorer` are leaves, so the omission was invisible until `judge` arrived.
    const tarballs = [dir, ...internalDependencies(dir)].map((source) =>
      join(consumer, basename(run("npm", ["pack", "--silent", "--pack-destination", consumer], source).trim().split("\n").pop())));
    run("npm", ["init", "-y"], consumer);
    // `--no-workspaces` and absolute tarball paths: without them npm can walk UP from the temp directory
    // and re-attach to a workspace root, which would reintroduce exactly the symlink resolution the gate
    // exists to avoid.
    // `--omit=optional` because an OPTIONAL dependency is by definition not required to install and use the
    // package. The CLI declares `playwright` and `@axe-core/playwright` optional — the visual layer is opt-in
    // and loaded with a dynamic `import()` behind an availability check — so installing them here fetched
    // 25 MB of browser engine from the registry to run a renderer assertion that never opens a browser.
    // Measured: 7.1 s for the CLI against 2.2 s for a leaf package, and the gate could not run offline at all,
    // which is a Fast/Repeatable failure for no coverage in return. A package that genuinely NEEDS a dependency
    // must declare it as a dependency, and this gate exists to catch exactly that mistake.
    run("npm", ["install", "--silent", "--no-workspaces", "--omit=optional", ...tarballs], consumer);
    copyFileSync(smoke, join(consumer, SMOKE));
    const output = run("node", [SMOKE], consumer);
    return { ok: true, stage: "smoke", name, detail: output.trim().split("\n").slice(-1)[0] ?? "" };
  } catch (error) {
    const stderr = String(error.stderr ?? error.stdout ?? error.message);
    // Exit 3 is the smoke test DECLINING a check this machine cannot make: guidepup refusing to import where
    // there is no screen reader, a macOS-only host-capacity read on Linux. That is a platform limit, not a
    // packaging defect, and it gets the same treatment private packages already get here — announced, not
    // counted as a pass, and not a failure.
    //
    // It was a failure until 2026-08-21, and the cost was not cosmetic: `gate:isolation` is the FIRST leg of
    // `release:gate`, so on the Linux control plane — the only machine with the Python venv the judge needs —
    // its failure stopped the chain and every model-quality gate behind it silently never ran.
    if (error.status === 3) {
      return { skipped: true, stage: "smoke", name, detail: stderr.trim().split("\n").slice(-1)[0] ?? "declined" };
    }
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
    .map((entry) => join(root, entry.name))
    // A `private` package is never published, so "can a consumer install this?" has no meaning for it and a
    // missing smoke test is not a defect. `@a11y-witness/lab` is private on purpose (ADR 0008): the corpus is
    // not distributable and the trainer would imply a reproducibility promise this project cannot make.
    // Skipping is announced by the caller rather than silent — a gate that quietly covers less than you think
    // is the failure mode this whole file exists to prevent.
    .filter((dir) => !JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).private);
}

/** How many packages were skipped for being private — reported, so the gate's coverage is never overstated. */
function countPrivatePackages() {
  const root = fileURLToPath(new URL("../packages/", import.meta.url));
  if (!existsSync(root)) return 0;
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(root, entry.name, "package.json")))
    .filter((entry) => JSON.parse(readFileSync(join(root, entry.name, "package.json"), "utf8")).private)
    .length;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const targets = args.length === 0 || args[0] === "--all" ? allPackages() : args;
  if (args.length > 0 && args[0] !== "--all" && targets.length === 0) {
    process.stderr.write("usage: node scripts/isolation-gate.mjs [--all | <package-dir>...]\n");
    process.exit(2);
  }
  const privateCount = args.length === 0 || args[0] === "--all" ? countPrivatePackages() : 0;
  if (privateCount) {
    process.stdout.write(`skipping ${privateCount} private package(s): never published, so nothing installs them\n`);
  }
  if (targets.length === 0) {
    // Says so rather than reporting success over nothing. The gate's own correctness is asserted separately
    // by `packages/lab/src/packaging/isolation-gate.test.ts` against three fixtures, so an empty run here is honest
    // rather than unverified: there is genuinely nothing published yet (PLAN.md M1, zero moves).
    process.stdout.write("no packages under packages/ yet — nothing to gate (PLAN.md M1 is scaffolding only)\n");
    process.stdout.write("the gate itself is verified by packages/lab/src/packaging/isolation-gate.test.ts\n");
    process.exit(0);
  }
  let failed = 0;
  let declined = 0;
  for (const target of targets) {
    const verdict = checkIsolation(target);
    if (verdict.skipped) declined += 1;
    else if (!verdict.ok) failed += 1;
    const tag = verdict.skipped ? "SKIP" : verdict.ok ? "ok  " : "FAIL";
    process.stdout.write(`  ${tag}  ${verdict.name ?? target}  ${verdict.detail}\n`);
  }
  // A declined package is NOT in the numerator. Counting it as usable is exactly the "reports success having
  // examined nothing" failure this file exists to prevent, so the coverage is stated rather than rounded up.
  process.stdout.write(`\n${targets.length - failed - declined}/${targets.length} package(s) usable when installed`
    + (declined ? `, ${declined} declined on ${process.platform} — run the gate on macOS for those\n` : "\n"));
  process.exit(failed ? 1 : 0);
}
