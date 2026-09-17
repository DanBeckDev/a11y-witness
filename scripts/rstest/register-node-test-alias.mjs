// @ts-check

/**
 * #1318: WHERE `node:test` IS REDIRECTED, AND WHY HERE.
 *
 * rstest leaves Node built-ins to Node, so nothing on rstest's side can redirect `node:test` (measured on
 * #1315: `resolve.alias` and an Rspack replacement plugin both left the real module in place). Node's own
 * `module.registerHooks` does see the request, in each forked worker, for `import` and `require` alike. The
 * config loads this file into every worker with `pool.execArgv: ["--import", …]`.
 *
 * ONLY THE `import` CONDITION IS REDIRECTED. Traced on #1315: a test file's `node:test` import reaches Node with
 * the `import` condition (its parent is rstest's own runtime chunk), while `packages/guards/src/walk-scope.mjs` `require`s
 * `node:test` to WRAP the real module's functions. Redirecting that `require` too sent walk-scope a shim it
 * cannot wrap, and six files failed to load.
 *
 * ONLY `node:test`, NEVER A BARE `test` (#1383). `node:test` has no unprefixed form -- `import "test"` is an npm
 * package name -- so a bare-`test` clause could only ever capture a package called `test`, which nobody installs.
 * Left to Node, a bare `test` resolves to that package or fails to, exactly as without this hook.
 */
import { registerHooks } from "node:module";

const shimUrl = new URL("./node-test-shim.mjs", import.meta.url).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "node:test" && !context.conditions.includes("require")) {
      return { url: shimUrl, format: "module", shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
