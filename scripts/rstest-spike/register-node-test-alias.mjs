// @ts-check
// command: (not a command) #1315 spike only: a Node resolve hook sending `node:test` to the shim, in each fork.

/**
 * FINDING 2 (trial, 15:2xZ): neither rstest-side route reached `node:test`. `resolve.alias` did not, and an
 * Rspack `NormalModuleReplacementPlugin` added through `tools.rspack` did not either -- the hook ran (traced),
 * the shim was never loaded, and the real node:test ran every test and printed its own TAP. So the request is
 * redirected where Node resolves it, in each forked worker: `module.registerHooks` covers `import` and
 * `require` alike on this Node (v22.22). Passed to the forks through `pool.execArgv`.
 */
import { registerHooks } from "node:module";

const shimUrl = new URL("./node-test-shim.mjs", import.meta.url).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    // FINDING 3 (traced): test files reach `node:test` through rstest runtime with the `import` condition, while
    // `scripts/walk-scope.mjs` `require`s it to WRAP the real module. Redirecting that require broke six files.
    if ((specifier === "node:test" || specifier === "test") && !context.conditions.includes("require")) {
      if (process.env.RSTEST_SPIKE_TRACE) process.stderr.write(`SPIKE-TRACE resolve hook redirected ${specifier} conditions=${JSON.stringify(context.conditions)} parent=${String(context.parentURL).replace(/^.*wt-1315\//, "")} (pid ${process.pid})\n`);
      return { url: shimUrl, format: "module", shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
