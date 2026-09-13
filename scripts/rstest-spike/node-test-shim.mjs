// @ts-check
// command: (not a command) #1315 spike only: node:test's names over @rstest/core, so the suite runs unedited.

/**
 * #1315: THE SUITE IMPORTS `node:test`; RSTEST EXPORTS ITS OWN API. This module stands between them, sent in
 * for `node:test` by `register-node-test-alias.mjs` in each forked worker, so no test file is edited.
 *
 * WHAT IT MAPS, measured at `0e809d13` over the 550 files the config includes:
 *   test / it, and node:test's properties on `test`  -> rstest's test, adapting `test(name, options, fn)`
 *     (`test.after` / `.before` / `.beforeEach` / `.afterEach` are used by 4 files -- first run's cause A1)
 *   describe                                         -> describe
 *   before / after, beforeEach / afterEach           -> beforeAll / afterAll, beforeEach / afterEach
 *   t.skip() inside a running test                   -> rstest's own `ctx.skip()` (12 files, 26 calls -- A2)
 *   t.diagnostic                                     -> a `# ` line on stdout
 *
 * WHAT IT REFUSES, loudly: `mock` (1 file) and `run`, and `t.todo()` (0 files). A spike that stubbed them
 * silently would report those files as passing for a reason that has nothing to do with rstest.
 *
 * NO TOP-LEVEL AWAIT. With `globals: true` the collecting runtime is on globalThis, and that is preferred; the
 * static import is only the fallback.
 */
import * as rstestModule from "@rstest/core";

const api = /** @type {any} */ (globalThis).test ? /** @type {any} */ (globalThis) : /** @type {any} */ (rstestModule);
if (process.env.RSTEST_SPIKE_TRACE) {
  process.stderr.write(`SPIKE-TRACE shim loaded (pid ${process.pid}, api from ${api === rstestModule ? "module" : "globals"})\n`);
}

/** The `t` node:test hands a test function, reduced to what rstest can honour without pretending. */
function contextFor(name, ctx) {
  return {
    name,
    signal: ctx?.signal,
    diagnostic: (message) => { process.stdout.write(`# ${message}\n`); },
    skip: (reason) => {
      if (typeof ctx?.skip === "function") return ctx.skip(reason);
      throw new Error(`#1315 shim: t.skip() has no rstest context to call (${name})`);
    },
    todo: () => { throw new Error(`#1315 shim: t.todo() inside a running test is not mapped (${name})`); },
  };
}

/** node:test accepts `test(name, fn)`, `test(name, options, fn)` and `test(fn)`; options mapped: skip, todo, timeout. */
function adapt(register) {
  return (nameOrFn, optionsOrFn, maybeFn) => {
    const name = typeof nameOrFn === "string" ? nameOrFn : (nameOrFn?.name || "<anonymous>");
    const fn = [nameOrFn, optionsOrFn, maybeFn].find((part) => typeof part === "function");
    const options = typeof optionsOrFn === "object" && optionsOrFn !== null ? optionsOrFn : {};
    const body = fn ? (ctx) => fn(contextFor(name, ctx)) : () => {};
    if (options.skip) return register.skip(name, body);
    if (options.todo) return register.todo(name, body);
    return register(name, body, options.timeout);
  };
}

const refused = (what) => new Proxy(function refusedNodeTestApi() {}, {
  get: (_target, prop) => {
    if (prop === "name") return what;
    throw new Error(`#1315 shim: node:test's \`${what}.${String(prop)}\` is not mapped onto rstest`);
  },
  apply: () => { throw new Error(`#1315 shim: node:test's \`${what}\` is not mapped onto rstest`); },
});

export const describe = (name, optionsOrFn, maybeFn) =>
  api.describe(name, typeof optionsOrFn === "function" ? optionsOrFn : maybeFn);
export const before = (fn) => api.beforeAll(fn);
export const after = (fn) => api.afterAll(fn);
export const beforeEach = (fn) => api.beforeEach(fn);
export const afterEach = (fn) => api.afterEach(fn);
// node:test `mock.fn` / `mock.method` map onto rstest `rs.fn` / `rs.spyOn` (api/runtime-api/rstest/mock-functions.mdx).
// Any other `mock` property is still refused by name; a SYMBOL lookup returns undefined rather than throwing, so
// code that enumerates a module (walk-scope's own coverage test) is not failed by the shim itself.
const rs = () => /** @type {any} */ (api).rs ?? /** @type {any} */ (api).rstest;
const mapped = {
  fn: (impl) => rs().fn(impl),
  method: (object, methodName, impl) => {
    const spy = rs().spyOn(object, methodName);
    return impl ? spy.mockImplementation(impl) : spy;
  },
};
export const mock = new Proxy(mapped, {
  get: (target, prop) => {
    if (typeof prop === "symbol") return undefined;
    if (prop in target) return target[prop];
    throw new Error(`#1315 shim: node:test's \`mock.${String(prop)}\` is not mapped onto rstest`);
  },
});
export const run = refused("run");

const base = adapt(api.test);
export const test = Object.assign(base, {
  after, afterEach, before, beforeEach, describe, mock, run,
  skip: (name, optionsOrFn, maybeFn) => base(name, { skip: true }, [optionsOrFn, maybeFn].find((f) => typeof f === "function")),
  todo: (name, optionsOrFn, maybeFn) => base(name, { todo: true }, [optionsOrFn, maybeFn].find((f) => typeof f === "function")),
  only: adapt(api.test.only ?? api.test),
});
export const it = test;
export default test;
