// @ts-check
// Run by `scripts/isolation-gate.mjs` from a throwaway directory OUTSIDE this repository, against the
// installed tarball.
//
// It cannot drive a capture — that needs a Windows worker with NVDA. What it proves is that the bin
// actually RUNS, and that the RENDERER works, because the renderer is the whole public API and the one
// place where a wrong report shape would be silently wrong rather than loudly broken.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import { reportLines } from "a11y-witness";

const require = createRequire(import.meta.url);
const manifest = JSON.parse(readFileSync(require.resolve("a11y-witness/package.json"), "utf8"));
const root = dirname(require.resolve("a11y-witness/package.json"));

const bin = join(root, manifest.bin["a11y-witness"]);
assert.ok(existsSync(bin), `the bin is missing from the tarball: ${bin}`);
assert.ok(statSync(bin).size > 0, "the bin is empty");

/**
 * ACTUALLY RUN IT, THROUGH THE SAME SYMLINK A REAL CALLER USES — architecture-audit.md §7.2: "the
 * published dist/cli.js bin is executed by nothing". Existence and a non-zero size are exactly what this
 * file asserted before, and neither would have caught the bug that shipped: `isProgram` compared
 * `import.meta.url` (which Node's ESM loader resolves through symlinks) against a NON-resolved
 * `process.argv[1]`. `os.tmpdir()` — where this gate itself runs, and where `npx` stages a package before
 * running it — is `/var/folders/...` on macOS, and `/var` is itself a symlink to `/private/var`. So the
 * installed bin ran, matched nothing, skipped `main()` entirely, and exited 0 with no output at all.
 *
 * `bin` above is built from `require.resolve()`, which — like `process.cwd()` after this process's own
 * `cwd` was set — is ALREADY realpath'd, so spawning it sidesteps the exact mismatch that broke a real
 * invocation and passes either way. `A11Y_ISOLATION_CONSUMER_DIR` is the one surviving copy of the RAW,
 * un-resolved consumer path (`isolation-gate.mjs` captured it before anything could canonicalise it), so
 * the bin is reached the same way a real `.bin` shim or `npx` cache entry would reach it. Falls back to
 * the resolved `bin` when run outside the gate (still proves execution, just not the symlink case).
 */
const rawConsumerDir = process.env.A11Y_ISOLATION_CONSUMER_DIR;
const invokedBin = rawConsumerDir ? join(rawConsumerDir, "node_modules", ".bin", "a11y-witness") : bin;
assert.ok(existsSync(invokedBin), `the .bin shim is missing from the tarball: ${invokedBin}`);
const invocation = spawnSync(invokedBin, [], { encoding: "utf8" });
assert.equal(invocation.error, undefined,
  `the bin could not be executed at all: ${invocation.error}. On a POSIX host this is what a missing or ` +
  "wrong shebang line looks like.");
assert.equal(invocation.status, 1, `running the bin with no args should print usage and exit 1, got status `
  + `${invocation.status} (stdout: ${JSON.stringify(invocation.stdout)}, stderr: ${JSON.stringify(invocation.stderr)})`);
assert.match(invocation.stderr, /usage/i, "running the bin with no args must explain how to use it");

// A report with findings from two layers. `reportLines` must order them the way a user meets them — perceive
// before navigate before interact — whatever order they arrive in.
const lines = reportLines({
  url: "https://example.com",
  task: "Find the opening hours",
  screenReader: "NVDA",
  announcements: 42,
  // The judge's verdict is nested, not spread — guessing otherwise is what this smoke test caught.
  verdict: {
    taskCompletable: false,
    summary: "The menu button announces no name.",
    confidence: 0.8,
    findings: [
      { wcag: "4.1.2 Name, Role, Value", issue: "Unnamed control", evidence: "button", severity: "serious", confidence: 0.9 },
      { wcag: "1.1.1 Non-text Content", issue: "Unnamed graphic", evidence: "unlabeled graphic", severity: "serious", confidence: 0.9 },
    ],
  },
  // null, NOT [] — "the rule layer did not run" and "it ran and found nothing" must never look alike.
  axe: null,
});
assert.ok(Array.isArray(lines) && lines.length > 0, "reportLines must return lines");
const text = lines.join("\n");
assert.ok(text.includes("1.1.1"), "the report should name the criteria it found");
assert.ok(text.indexOf("1.1.1") < text.indexOf("4.1.2"),
  "perceive findings must be rendered before interact findings, whatever order they arrive in");

// The report must SAY that the visual criteria were not checked when axe did not run. A report that omits them
// silently reads as a clean bill of health, which is this project's one unforgivable output.
assert.match(text, /axe|visual|not (?:been )?checked|unchecked/i,
  "a report with no axe run must state that the visual criteria are unchecked");

// The visual layer is an optional dependency on purpose: someone who only wants the screen-reader layer should
// not download a browser engine for it.
assert.ok(manifest.optionalDependencies?.playwright, "playwright must stay optional");
assert.ok(!manifest.dependencies?.["@a11y-witness/nvda-worker"],
  "the CLI speaks HTTP to a worker; it must not depend on the Windows package");

console.log(`a11y-witness works when installed: bin RUNS (exit 1, usage printed), ${lines.length} report `
  + "lines, layers ordered");
