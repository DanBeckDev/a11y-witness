/**
 * Does a changed file reach somebody who INSTALLS the package — asked of npm, not inferred from the path?
 *
 * `scripts/consumer-visible.mjs`'s header carries the incident. This file pins the decision, and pins the
 * one case that would be catastrophic to get wrong.
 *
 * **A source file is usually NOT in the tarball and is still consumer-visible.** `cli`, `judge` and
 * `evidence` ship `dist` alone, so `judge/src/rules.ts` appears nowhere in the tarball while `dist/rules.js`
 * — built from it — is the package. A naive "is this exact path packed?" would declare every rule change
 * invisible, and a changeset gate that stops refusing is far worse than one that over-refuses. That
 * direction is asserted first and by name.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { consumerVisible, reachableOutputs } from "../../../../scripts/consumer-visible.mjs";

/** `judge`'s real shape: ships `dist` only, tests excluded from the build entirely. */
const JUDGE = ["package.json", "README.md", "LICENSE", "dist/index.js", "dist/index.d.ts",
  "dist/rules.js", "dist/rules.d.ts", "dist/rules.js.map"];
/** `worker-fleet`'s real shape: `dist` plus two source subdirectories, and no tests anywhere. */
const FLEET = ["package.json", "README.md", "dist/cli-flags.mjs", "dist/lab-job.js",
  "src/local-worker/clone-worker.sh", "src/provisioning/provision-nvda-worker.ps1"];

test("a source that COMPILES INTO the tarball is visible, though it is not in it", () => {
  // The assertion that matters most. `judge` ships no `src/` at all, and a change to `rules.ts` is the
  // most consumer-visible change this repository can make.
  const { visible, invisible } = consumerVisible(
    ["packages/judge/src/rules.ts"], new Map([["packages/judge", JUDGE]]));
  assert.deepEqual(visible, ["packages/judge/src/rules.ts"],
    "judge ships `dist` only, so `src/rules.ts` is not packed — and it BUILDS `dist/rules.js`, which is "
    + "the package. Reading only the literal path would make every rule change invisible.");
  assert.deepEqual(invisible, []);
});

test("a test file in a published package is not visible, because npm packs nothing built from it", () => {
  // The false positive that blocked three PRs in one night. `dist` carries no `*.test.js`: verified on the
  // real tree, 0 test outputs against 33, 13 and 7 test sources in judge, evidence and cli.
  const { visible, invisible } = consumerVisible(
    ["packages/worker-fleet/src/lab-job.test.ts"], new Map([["packages/worker-fleet", FLEET]]));
  assert.deepEqual(visible, []);
  assert.deepEqual(invisible, ["packages/worker-fleet/src/lab-job.test.ts"]);
});

test("a source shipped LITERALLY is visible, so this cannot be a `dist`-only rule", () => {
  // `worker-fleet` ships `src/local-worker` and `src/provisioning`; `nvda-worker` ships `src` outright and
  // `scorer` ships `python` and `bin`. Three published packages ship sources, which is exactly why a
  // `*.test.ts` pattern exclusion was rejected in favour of the packed manifest.
  const { visible } = consumerVisible(
    ["packages/worker-fleet/src/provisioning/provision-nvda-worker.ps1"],
    new Map([["packages/worker-fleet", FLEET]]));
  assert.deepEqual(visible, ["packages/worker-fleet/src/provisioning/provision-nvda-worker.ps1"]);
});

test("a file in no published package is invisible, and that includes every private one", () => {
  // `allPackages()` already excludes private packages, so they never appear as manifest keys and every
  // file under them falls through here — the same answer, reached without a second private/published list.
  const { visible, invisible } = consumerVisible(
    ["packages/lab/scripts/fleet-hours.mjs", "docs/board/reported.json", "scripts/ci-changed.mjs"],
    new Map([["packages/judge", JUDGE]]));
  assert.deepEqual(visible, []);
  assert.equal(invisible.length, 3);
});

test("a package npm could not list is treated as fully visible, and says so", () => {
  // FAILS TOWARD REFUSING. `null` means the manifest could not be read; every file in that package is then
  // visible, and reported as unknown so a reader can tell "npm said no files" from "npm could not be
  // asked". A gate that stops refusing is worse than one that over-refuses.
  const { visible, unknown } = consumerVisible(
    ["packages/judge/src/rules.test.ts"], new Map([["packages/judge", null]]));
  assert.deepEqual(visible, ["packages/judge/src/rules.test.ts"]);
  assert.deepEqual(unknown, ["packages/judge/src/rules.test.ts"]);
});

test("the build-output candidates cover the emitted forms, not one exact filename", () => {
  // Matched as a PREFIX with the extension dropped, so `.js`, `.d.ts`, `.js.map` and anything a future
  // build emits all count. Having one candidate too many costs an over-refusal; missing a real output
  // costs a consumer-visible change slipping through, and only the second is unacceptable.
  assert.deepEqual(reachableOutputs("src/a/b.ts"), ["src/a/b.ts", "dist/a/b."]);
  assert.deepEqual(reachableOutputs("dist/a/b.js"), ["dist/a/b.js"],
    "a path already outside `src/` maps to itself; there is nothing to build it from");
  assert.deepEqual(reachableOutputs("README.md"), ["README.md"]);
});
