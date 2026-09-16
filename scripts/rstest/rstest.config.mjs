// @ts-check

/**
 * #1318, STEP 2 OF THE RSTEST ADOPTION (#1317): THE SAME FILES `npm run test:ts` RUNS, WITH NONE OF THEM EDITED.
 *
 * Every setting below was measured on #1315's spike before it was kept, and the ones that were tried and
 * rejected are recorded here so nobody re-adds them:
 *
 * - **`node:test` reaches the shim through a Node resolve hook, not through rstest.** rstest does not bundle
 *   Node built-ins; it leaves them to Node ("Rstest currently preserves Node.js native semantics",
 *   `guide/debug/troubleshooting.mdx`). So `resolve.alias: { "node:test": … }` never saw the import (the real
 *   node:test ran every test and rstest reported "No test suites found"), and neither did an Rspack
 *   `NormalModuleReplacementPlugin` added through `tools.rspack` (the hook ran; the shim never loaded). The
 *   hook in `register-node-test-alias.mjs` is passed to every worker through the documented `pool.execArgv`.
 * - **`forks`, and isolated.** `isolate: false` shares module evaluation and process state across files, and
 *   `threads` has no `process.chdir` and a thread-local `process.exit`. In this suite 92 test files spawn
 *   processes (50 of them git or gh), 24 write `process.env`, and 11 use `process.exit` or signals.
 * - **A build cache in CI only (#1319).** Locally `performance.buildCache` measured 64.0 s cold and 63.9 s warm
 *   against 63.9 s without it, because the build is under 1% of the run (#1315), so it stays off here. The chairman
 *   asked for it in CI, where `reusable-build-test.yml` persists it with `actions/cache`, prints HIT or MISS, and fails
 *   the job when a run leaves it empty. rstest writes it under `node_modules/.cache/rstest-<project-name>`.
 *   `buildCache: false` writes nothing: in @rstest/core 0.11.12, `normalizeBuildCache` returns false for a falsy value
 *   and the adapter maps `false` to `false`. The one local cache seen while building #1319 came from a MUTATION that forced
 *   it on, which wrote into the primary checkout's shared node_modules. So `A11Y_RSTEST_CACHE_DIR`, when set, moves an
 *   enabled cache to that directory (rstest's documented `cacheDirectory`), and a test that runs rstest sets it to a
 *   temporary root. CI does not set it, so CI's cache stays where `reusable-build-test.yml` persists it.
 * - **Workers capped at half the host's cores locally, rstest's default in CI (#1319, ceo's ruling).** The `agents` host
 *   runs eight sessions and two reviewers, and a whole-suite run at one worker per core is a write to a shared resource.
 *   Measured 2026-09-13 22:49Z: a mutation handed rstest an empty include, it ran the whole suite with 92 worker
 *   processes, and the load average reached 64.65. A GitHub runner is not shared, so CI keeps rstest's own default.
 * - **No coverage block here.** Coverage is step 4 of the adoption, not this one.
 */
import { defineConfig } from "@rstest/core";
import { fileURLToPath } from "node:url";
import { availableParallelism } from "node:os";

const root = fileURLToPath(new URL("../../", import.meta.url));
const registerHook = fileURLToPath(new URL("./register-node-test-alias.mjs", import.meta.url));
const walkScope = fileURLToPath(new URL("../../packages/guards/src/walk-scope.mjs", import.meta.url));

/**
 * #1319: whether `CI` names a CI run. GitHub Actions sets `CI=true`. An unset, empty or `false` value is a local run.
 * It decides two settings below: the build cache (on in CI, where #1315 measured no benefit locally) and the worker cap
 * (off in CI, on locally, where the host is shared).
 * @param {Record<string, string | undefined>} env
 * @returns {boolean}
 */
function isCi(env) {
  return env.CI !== undefined && env.CI !== "" && env.CI !== "false";
}

/**
 * #1319: the build cache setting. Off unless CI. When on, `A11Y_RSTEST_CACHE_DIR` moves it out of node_modules.
 * @param {Record<string, string | undefined>} env
 * @returns {false | true | { cacheDirectory: string }}
 */
function buildCacheFor(env) {
  if (!isCi(env)) return false;
  return env.A11Y_RSTEST_CACHE_DIR ? { cacheDirectory: env.A11Y_RSTEST_CACHE_DIR } : true;
}

/** #1319: half the host's cores, at least one -- the most a local run may take of a host other sessions share. */
const LOCAL_WORKER_CAP = Math.max(1, Math.floor(availableParallelism() / 2));

export default defineConfig({
  root,
  // The glob `npm run test:ts` hands to node:test, so "the same number of test files run" is checkable.
  include: ["packages/*/src/**/*.test.ts"],
  testEnvironment: "node",
  // `walk-scope.mjs` is PRELOADED into every worker as well, for #1349. It installs its observer on import,
  // and rstest bundles a second copy into each test that imports it. Measured by worker-judge on #1349: named
  // imports such as `readFile` from `node:fs/promises`, `openSync`, `readdir` and `spawnSync` are seen only
  // when a copy loaded before rstest's module graph shares one per-process state with the bundled copies.
  // The shared state is #1349's; this line is the half that lives here. Measured across all 550 files at
  // 021563f6, before #1349: the preload changed no result. The only differences were three live GitHub tests
  // refused by an exhausted GraphQL budget during that run.
  pool: { type: "forks", execArgv: ["--import", registerHook, "--import", walkScope],
    ...(isCi(process.env) ? {} : { maxWorkers: LOCAL_WORKER_CAP }) },
  // The shim reads rstest's collecting runtime from globalThis rather than importing a second copy of it.
  globals: true,
  // node:test has no default timeout. rstest defaults `testTimeout` to 5_000 and `hookTimeout` to 10_000, and
  // documents `0` as disabling each (`config/test/test-timeout.mdx`, `hook-timeout.mdx`). Under the defaults
  // three tests timed out on the spike's first run.
  testTimeout: 0,
  hookTimeout: 0,
  performance: { buildCache: buildCacheFor(process.env) },
});
