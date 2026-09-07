// WHICH CHANGED FILES CAN REACH A CONSUMER — asked of npm, not inferred from the path.
//
// ## Why this exists
//
// `ci.yml`'s changeset job refused any PR touching `packages/<published>/{src,python,models,bin}/`. That
// is a question about where a file LIVES. The question it means is whether the file can reach somebody who
// installs the package, and the two differ for a whole category: a `.test.ts` under `src/` that npm never
// packs.
//
// Measured on PR #114, which it blocked before a board render: four files, three in private packages, the
// fourth `packages/worker-fleet/src/lab-job.test.ts`. `npm pack --dry-run --json` on that package returns
// 153 files and **zero** tests -- its `files` list is `["dist","src/local-worker","src/provisioning",
// "README.md","LICENSE"]` and a `.test.ts` under `src/` is outside every entry. Two more PRs hit the same
// refusal the same night.
//
// **A check answering correctly about a population other than the one the reader thinks** -- this
// repository's most-recorded defect -- in the gate that guards what consumers are told.
//
// ## Why the false positive is not the real cost
//
// The prescribed escape is `npx changeset add --empty`, and the gate's own message is careful about why
// that is a real answer rather than a formality: it *"records that decision explicitly rather than leaving
// it to be inferred from silence"*. **But an empty changeset written to get past a check that should not
// have fired is exactly the silence it was built to prevent.** Do it three times in one night, as happened,
// and `--empty` becomes reflexive -- and the next one will be written over a change that really did reach a
// consumer. A gate that cries wolf does not merely waste time; it trains people out of reading it.
//
// ## Why the packed manifest, and not a `*.test.ts` exclusion
//
// A pattern exclusion is a SECOND list of what ships, to drift out of step with each package's `files`
// field -- the fact-stated-twice shape. It is also wrong on this tree today: `nvda-worker` ships `src`
// (with its own `!src/**/*.test.ts`), and `scorer` ships `python` and `bin`. Three published packages ship
// sources, so "tests live under src, sources ship from dist" is not a rule this repo follows.
//
// `npm pack --dry-run --json` is the authority, and it is the same one `scripts/isolation-gate.mjs`
// already trusts for the packaging question -- so the two gates give consistent answers rather than two
// guesses about one fact. `packedFiles` is exported from there and imported here rather than re-spelled.
//
// ## The one subtlety, and getting it wrong would be far worse than the bug
//
// **A source file is usually NOT in the tarball and is still consumer-visible**, because it compiles into
// something that is: `cli`, `judge` and `evidence` ship `dist` alone, so `judge/src/rules.ts` appears
// nowhere in the tarball while `dist/rules.js` -- built from it -- is the package. A naive "is this exact
// path packed?" would have declared every rule change invisible.
//
// So a changed file counts as visible when the file ITSELF is packed, or when its build output at the
// mirrored `dist/` path is. Verified against the real tree 2026-09-06: `dist/` mirrors `src/` path for
// path with the extension swapped, and the build emits NO tests -- `packages/{judge,evidence,cli}/dist`
// contain zero `*.test.js` against 33, 13 and 7 test files in `src`.
//
// **`npm pack` must run its `prepack`, which is `tsc --build`.** With `--ignore-scripts` the tarball is
// listed against an unbuilt `dist`, every source maps to nothing, and the gate reports a real change as
// invisible -- the one direction this must never fail in.
//
// ## Fails toward refusing
//
// A package whose manifest cannot be read is treated as fully visible, and the reason is printed. A gate
// that stops refusing is worse than one that over-refuses, so every uncertainty resolves that way.
import { execFileSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { refuseUnknownFlags, flagValue } from "../packages/worker-fleet/src/cli-flags.mjs";
// `allPackages` ALREADY excludes private ones -- its own comment says so, for this exact reason: "a
// private package is never published, so 'can a consumer install this?' has no meaning for it". A second
// published/private filter here would be a third copy of that fact.
import { packedFiles, allPackages } from "./isolation-gate.mjs";
import { sandboxGitEnv } from "./git-env.mjs";

const REPO = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

/**
 * Every path a change to `relative` could reach a consumer through: itself, and its build output.
 *
 * `src/a/b.ts` builds to `dist/a/b.js`, `.d.ts`, and their maps. The extension is left off and matched as
 * a prefix, so a build emitting a form nobody listed here still counts — the failure direction that
 * matters is missing a real output, never having one candidate too many.
 */
export function reachableOutputs(relative) {
  const candidates = [relative];
  const fromSrc = relative.match(/^src\/(.*)\.[^./]+$/);
  if (fromSrc) candidates.push(`dist/${fromSrc[1]}.`);
  return candidates;
}

/**
 * Which changed paths can reach a consumer.
 *
 * PURE, and deliberately: `manifests` is `packageDir -> packed paths | null`, so the whole decision is
 * unit-testable without a checkout, a diff, an npm invocation or a runner. `null` means the manifest could
 * not be read and every file in that package is visible.
 *
 * @param {string[]} files repo-relative changed paths
 * @param {Map<string, string[] | null>} manifests package dir (repo-relative) -> its packed paths
 * @returns {{ visible: string[], invisible: string[], unknown: string[] }}
 */
export function consumerVisible(files, manifests) {
  const visible = [];
  const invisible = [];
  const unknown = [];
  for (const file of files) {
    const owner = [...manifests.keys()].find((dir) => file.startsWith(`${dir}/`));
    // A file in no PUBLISHED package cannot reach a consumer through one. Private packages, `docs/`,
    // `scripts/` and the workflows all land here.
    if (!owner) { invisible.push(file); continue; }
    const packed = manifests.get(owner);
    if (packed === null) { unknown.push(file); visible.push(file); continue; }
    const relative = file.slice(owner.length + 1);
    const reaches = reachableOutputs(relative)
      .some((candidate) => packed.some((path) => path === candidate || path.startsWith(candidate)));
    (reaches ? visible : invisible).push(file);
  }
  return { visible, invisible, unknown };
}

/** Read each published package's packed manifest, or `null` where npm could not answer. */
function manifestsFor(dirs, root = REPO) {
  const out = new Map();
  for (const dir of dirs) {
    const relative = dir.startsWith(root) ? dir.slice(root.length + 1) : dir;
    try {
      out.set(relative, packedFiles(dir));
    } catch (cause) {
      // NAMED, never swallowed: an unreadable manifest makes this gate STRICTER, and a reader has to be
      // able to tell "npm said no files" from "npm could not be asked".
      process.stdout.write(`  could not list ${relative}: ${cause?.message ?? cause}\n`);
      out.set(relative, null);
    }
  }
  return out;
}

function changedFiles(base) {
  return execFileSync("git", ["diff", "--name-only", `${base}...HEAD`],
    { cwd: REPO, encoding: "utf8", env: sandboxGitEnv() })
    .split("\n").map((line) => line.trim()).filter(Boolean);
}

function main() {
  refuseUnknownFlags(["--base"], { entry: import.meta.url, command: "consumer-visible" });
  const base = flagValue(process.argv, "base") ?? "origin/main";
  const files = changedFiles(base);
  const { visible, invisible, unknown } = consumerVisible(files, manifestsFor(allPackages()));

  process.stdout.write(`\n# can any changed file reach somebody who INSTALLS a package?\n`);
  process.stdout.write(`  ${files.length} changed; ${visible.length} can reach a consumer, `
    + `${invisible.length} cannot.\n`);
  for (const file of visible) process.stdout.write(`    REACHES A CONSUMER  ${file}\n`);
  if (unknown.length) {
    process.stdout.write(`  ${unknown.length} of those only because npm could not list their package. `
      + `Treated as visible on purpose: a gate that stops refusing is worse than one that over-refuses.\n`);
  }
  if (visible.length) {
    process.stdout.write("  So this PR needs a changeset.\n");
    process.exit(1);
  }
  process.stdout.write("  Nothing changed here is in any published tarball, or builds into one, so no\n"
    + "  consumer can observe this PR. Asked of `npm pack --dry-run --json`, not inferred from the path.\n");
}

// RUN ONLY WHEN INVOKED, never on import -- `consumer-visible.test.ts` imports the pure half.
//
// `pathToFileURL`, never a template literal and never `endsWith`. Both wrong idioms are refused by
// `entry-points.test.ts` and both were tried here first: the suffix form fires on any path ending in this
// filename, and the concatenated form does not percent-encode, so a checkout under a path containing a
// SPACE compares false, the guard never fires, and the script exits 0 having done nothing. That second one
// I copied from a sibling script that still carries it -- a stale idiom spreads by being read.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
