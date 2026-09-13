// @ts-check
// command: (not a command) #1315 spike only: runs the unedited node:test suite under rstest, forks pool.

/**
 * #1315: THE SAME 552 FILES `npm run test:ts` RUNS, under rstest, with nothing in them edited.
 *
 * `node:test` is aliased to `node-test-shim.mjs`, which maps node:test's names onto rstest's API. The pool is
 * `forks`, as the row asks (it is also rstest's default, stated here so the run cannot silently differ).
 * Nothing in this directory merges: adopting rstest would be a separate row decided on the numbers.
 */
import { defineConfig } from "@rstest/core";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const c8 = JSON.parse(readFileSync(new URL("../../.c8rc.json", import.meta.url), "utf8"));
const shim = fileURLToPath(new URL("./node-test-shim.mjs", import.meta.url));
const registerHook = fileURLToPath(new URL("./register-node-test-alias.mjs", import.meta.url));
const trace = (line) => { if (process.env.RSTEST_SPIKE_TRACE) process.stderr.write(`SPIKE-TRACE ${line}\n`); };
trace(`config loaded (pid ${process.pid})`);

export default defineConfig({
  root,
  include: ["packages/*/src/**/*.test.ts"],
  testEnvironment: "node",
  pool: { type: "forks", execArgv: ["--import", registerHook] },
  globals: true,
  // node:test has no default timeout. rstest defaults `testTimeout` to 5_000 and `hookTimeout` to 10_000, and
  // documents `0` as disabling each (config/test/test-timeout.mdx, hook-timeout.mdx) -- three tests timed out on
  // the first run under the default.
  testTimeout: 0,
  hookTimeout: 0,
  // Coverage mirrors `.c8rc.json` (the `npm run coverage` baseline): the same include and exclude lists, v8.
  coverage: {
    provider: "v8",
    include: c8.include,
    exclude: ["**/node_modules/**", ...c8.exclude],
    reporters: ["text-summary", ["json-summary", { file: "rstest-coverage-summary.json" }]],
    reportsDirectory: process.env.RSTEST_SPIKE_COVERAGE_DIR ?? "./coverage-rstest-spike",
    reportOnFailure: true,
  },
  resolve: { alias: { "node:test": shim } },
  // FINDING 1 (trial, 15:16Z): `resolve.alias` alone did NOT reach `node:test`. The real node:test ran all
  // five tests of review-verdict.test.ts inside the worker, printing its own TAP, and rstest reported "No test
  // suites found". A `node:` builtin is decided external before an alias is consulted, so the request is
  // rewritten earlier, at `beforeResolve`, where the replacement plugin runs.
  tools: {
    rspack: (config, { rspack }) => {
      trace(`tools.rspack hook ran; plugins before: ${(config.plugins ?? []).length}; target: ${JSON.stringify(config.target)}; externalsPresets: ${JSON.stringify(config.externalsPresets)}`);
      config.plugins = [...(config.plugins ?? []), new rspack.NormalModuleReplacementPlugin(/^node:test$/, shim)];
    },
  },
});
