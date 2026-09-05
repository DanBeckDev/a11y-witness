// @ts-check
/**
 * `launchBrowser`'s fallback, tested without a real browser or even real Playwright.
 *
 * FOUND 2026-09-06: `scanWithAxe` called `chromium.launch()` with no options, which needs the BUNDLED
 * browser — and the GitHub Action deliberately skips downloading it (`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`),
 * so on the Action `launch()` threw every time, `cli.ts`'s catch turned it into `ruleBased: null`, and
 * nothing anywhere asserted that `ruleBased` was ever populated. See `axe.ts`'s own header on `launchBrowser`
 * for the full account.
 *
 * `LaunchableChromium` is the injection seam: a fake object with just a `launch()` method, so this suite
 * needs no real Playwright and runs in milliseconds. `loadAxe()` itself (the dynamic import of the real
 * packages) is untested here on purpose — it is three lines of `import()` with nothing to get wrong that a
 * fake could catch, and mocking dynamic ES module imports is not worth the fragility for that.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { launchBrowser, axeAvailable, AxeLaunchError, AxeUnavailableError } from "./axe.js";

/** A fake chromium whose `launch` behaves per a script: each call consumes the next scripted outcome. */
function fakeChromium(outcomes: ("ok" | "throw")[]) {
  const calls: (({ channel?: string } | undefined))[] = [];
  return {
    calls,
    chromium: {
      async launch(options?: { channel?: string }) {
        calls.push(options);
        const outcome = outcomes[calls.length - 1];
        if (outcome === "throw") throw new Error(`launch failed (channel=${options?.channel ?? "bundled"})`);
        return { close: async () => {}, newContext: async () => ({}) };
      },
    },
  };
}

test("the bundled browser succeeding is used directly — no fallback attempted", async () => {
  const { chromium, calls } = fakeChromium(["ok"]);
  const { channel } = await launchBrowser(chromium);
  assert.equal(channel, "chromium");
  assert.equal(calls.length, 1, "the channel fallback must not be tried when the bundled launch works");
  assert.equal(calls[0]?.channel, undefined);
});

test("the bundled browser failing falls back to the system Edge channel", async () => {
  const { chromium, calls } = fakeChromium(["throw", "ok"]);
  const { channel } = await launchBrowser(chromium);
  assert.equal(channel, "msedge");
  assert.equal(calls.length, 2);
  assert.equal(calls[1]?.channel, "msedge");
});

test("neither the bundled browser nor Edge launching throws AxeLaunchError carrying both causes", async () => {
  const { chromium } = fakeChromium(["throw", "throw"]);
  await assert.rejects(() => launchBrowser(chromium), (e: unknown) => {
    assert.ok(e instanceof AxeLaunchError);
    const cause = (e as { cause?: { bundledError?: unknown; channelError?: unknown } }).cause;
    assert.ok(cause?.bundledError instanceof Error);
    assert.ok(cause?.channelError instanceof Error);
    return true;
  });
});

/**
 * MUTATION TARGET for this whole file: reverting `launchBrowser` to a bare `chromium.launch()` (the
 * original defect) makes every test above still pass with the fallback tests simply never exercising the
 * fallback path they claim to — because the fake would need calling with the OLD signature to notice.
 * These three are what actually pin the two-argument contract; deleting the `channel` assertions in the
 * second test is what silently reintroduces the bug, which is why they assert the exact call shape rather
 * than only the returned channel.
 */

test("axeAvailable answers false when the modules import but nothing can be LAUNCHED", async () => {
  // THE GAP THIS WHOLE FIX CLOSES. The old axeAvailable resolved loadAxe()'s imports and stopped, so it
  // answered true for a browser that could never actually launch -- proving an import, not a launch. This
  // injects a loadAxe whose modules "resolve" fine but whose chromium always fails to launch, on both the
  // bundled attempt and the channel fallback -- the exact shape of the Action before this fix, where the
  // bundled download is skipped on purpose and (in this fake) Edge is unavailable too.
  const { chromium } = fakeChromium(["throw", "throw"]);
  const answer = await axeAvailable({ loadAxe: async () => ({ chromium }) });
  assert.equal(answer, false, "a browser that cannot launch must not read as 'available'");
});

test("axeAvailable answers true once launchBrowser succeeds, closing what it opened", async () => {
  let closed = false;
  const chromium = {
    async launch() { return { close: async () => { closed = true; }, newContext: async () => ({}) }; },
  };
  const answer = await axeAvailable({ loadAxe: async () => ({ chromium }) });
  assert.equal(answer, true);
  assert.equal(closed, true, "the probe browser must be closed, not left running");
});

test("axeAvailable still answers false on the ORIGINAL defect: modules missing entirely", async () => {
  const answer = await axeAvailable({ loadAxe: async () => { throw new AxeUnavailableError(new Error("no module")); } });
  assert.equal(answer, false);
});
