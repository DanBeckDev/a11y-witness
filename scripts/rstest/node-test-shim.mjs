// @ts-check

/**
 * #1318: THE SUITE IMPORTS `node:test`; RSTEST HAS ITS OWN API. This module stands between them. It is sent in
 * for `node:test` by `register-node-test-alias.mjs`, in every rstest worker, so no test file is edited.
 *
 * WHAT IT MAPS, each measured on #1315 over the 550 files the config includes:
 *   test / it, and node:test's properties on `test`   -> rstest's `test`, adapting `test(name, options, fn)`
 *     (`test.after` / `.before` / `.beforeEach` / `.afterEach` are used by 4 files)
 *   describe                                          -> describe
 *   before / after, beforeEach / afterEach            -> beforeAll / afterAll, beforeEach / afterEach
 *   t.skip() inside a running test                    -> rstest's own `ctx.skip()` (12 files, 26 calls)
 *   t.diagnostic                                      -> a `# ` line on stdout
 *   mock.fn / mock.method                             -> `rs.fn` / `rs.spyOn` (`mock-functions.mdx`), with
 *     node:test's `mock.callCount()` added to the result -- the suite's only mock accessor, in 1 file
 *
 * WHAT IT REFUSES, by name: every other `mock` property, `run`, and `t.todo()`. Stubbing them would report those
 * tests as passing for a reason that has nothing to do with the runner. A SYMBOL lookup on a refused name
 * returns `undefined` rather than throwing, so code that enumerates a module is not failed by the shim itself.
 *
 * NO TOP-LEVEL AWAIT, and rstest's collecting runtime is read from `globalThis` (the config sets `globals: true`)
 * with the static import only as a fallback: a second copy of the runtime would collect nothing.
 */
import * as rstestModule from "@rstest/core";

/**
 * node:test's call shapes are loose (`test(name, fn)`, `test(name, options, fn)`, `test(fn)`), so this module
 * handles them as values it inspects rather than as fixed types.
 * @typedef {any} Loose
 */

/** @type {Loose} */
const api = /** @type {Loose} */ (globalThis).test ? globalThis : rstestModule;

/**
 * The `t` node:test hands a test function, reduced to what rstest can honour without pretending.
 * @param {string} name @param {Loose} ctx rstest's per-test context
 */
function contextFor(name, ctx) {
  return {
    name,
    signal: ctx?.signal,
    /** @param {string} message */
    diagnostic: (message) => { process.stdout.write(`# ${message}\n`); },
    /** @param {string} [reason] */
    skip: (reason) => {
      if (typeof ctx?.skip === "function") return ctx.skip(reason);
      throw new Error(`node-test-shim: t.skip() has no rstest context to call (${name})`);
    },
    todo: () => { throw new Error(`node-test-shim: t.todo() inside a running test is not mapped (${name})`); },
  };
}

/**
 * node:test's `test(name, fn)`, `test(name, options, fn)` and `test(fn)`, registered with rstest.
 * Options mapped: `skip`, `todo`, `timeout`; the suite uses no others.
 * @param {Loose} register rstest's `test` (or `test.only`)
 */
function adapt(register) {
  /** @param {Loose} nameOrFn @param {Loose} [optionsOrFn] @param {Loose} [maybeFn] */
  return (nameOrFn, optionsOrFn, maybeFn) => {
    const name = typeof nameOrFn === "string" ? nameOrFn : (nameOrFn?.name || "<anonymous>");
    const fn = [nameOrFn, optionsOrFn, maybeFn].find((part) => typeof part === "function");
    const options = typeof optionsOrFn === "object" && optionsOrFn !== null ? optionsOrFn : {};
    const body = fn ? (/** @type {Loose} */ ctx) => fn(contextFor(name, ctx)) : () => {};
    if (options.skip) return register.skip(name, body);
    if (options.todo) return register.todo(name, body);
    return register(name, body, options.timeout);
  };
}

/** @param {string} what */
const refusal = (what) => new Error(`node-test-shim: node:test's \`${what}\` is not mapped onto rstest`);

/** @param {string} what @returns {Loose} */
const refused = (what) => new Proxy(function refusedNodeTestApi() {}, {
  get: (_target, prop) => {
    if (typeof prop === "symbol") return undefined;
    if (prop === "name") return what;
    throw refusal(`${what}.${prop}`);
  },
  apply: () => { throw refusal(what); },
});

/** @param {string} name @param {Loose} optionsOrFn @param {Loose} [maybeFn] */
export const describe = (name, optionsOrFn, maybeFn) =>
  api.describe(name, typeof optionsOrFn === "function" ? optionsOrFn : maybeFn);
/** @param {() => unknown} fn */
export const before = (fn) => api.beforeAll(fn);
/** @param {() => unknown} fn */
export const after = (fn) => api.afterAll(fn);
/** @param {() => unknown} fn */
export const beforeEach = (fn) => api.beforeEach(fn);
/** @param {() => unknown} fn */
export const afterEach = (fn) => api.afterEach(fn);

/** @returns {Loose} rstest's mock utilities, global `rs` (or `rstest`) under `globals: true` */
const rs = () => api.rs ?? api.rstest;

/**
 * An rstest spy whose `mock` also answers node:test's `callCount()`.
 *
 * NOT BY ASSIGNMENT. Measured on 0.11.12: `fn.mock` is an own getter, non-configurable with no setter, that
 * returns a NEW state object on every read (`f.mock === f.mock` is false), so a `callCount` set on one read
 * is gone by the next -- which is how the first version of this shim failed `capture-client.test.ts`. The
 * property cannot be redefined either, so the spy is returned behind a Proxy: calls and every other property
 * reach the real spy untouched, and a read of `mock` gets the state with `callCount` counting the spy's own
 * calls at the moment it is asked.
 * @param {Loose} spy
 */
function withNodeTestAccessors(spy) {
  return new Proxy(spy, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target);
      if (prop !== "mock") return value;
      return Object.assign(value, { callCount: () => target.mock.calls.length });
    },
  });
}

/** @type {Record<string, (...args: Loose[]) => Loose>} */
const mapped = {
  /** @param {Loose} [impl] */
  fn: (impl) => withNodeTestAccessors(rs().fn(impl)),
  /** @param {Loose} object @param {string} methodName @param {Loose} [impl] */
  method: (object, methodName, impl) => {
    const spy = rs().spyOn(object, methodName);
    return withNodeTestAccessors(impl ? spy.mockImplementation(impl) : spy);
  },
};

/** @type {Loose} */
export const mock = new Proxy(mapped, {
  get: (target, prop) => {
    if (typeof prop === "symbol") return undefined;
    if (prop in target) return target[prop];
    throw refusal(`mock.${prop}`);
  },
});
export const run = refused("run");

const base = adapt(api.test);
/** @type {Loose} */
export const test = Object.assign(base, {
  after, afterEach, before, beforeEach, describe, mock, run,
  /** @param {string} name @param {Loose} [optionsOrFn] @param {Loose} [maybeFn] */
  skip: (name, optionsOrFn, maybeFn) => base(name, { skip: true }, [optionsOrFn, maybeFn].find((f) => typeof f === "function")),
  /** @param {string} name @param {Loose} [optionsOrFn] @param {Loose} [maybeFn] */
  todo: (name, optionsOrFn, maybeFn) => base(name, { todo: true }, [optionsOrFn, maybeFn].find((f) => typeof f === "function")),
  only: adapt(api.test.only ?? api.test),
});
export const it = test;
export default test;
