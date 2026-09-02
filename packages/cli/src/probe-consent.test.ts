// WHAT WE ASK OF A PAGE WE DO NOT OWN IS WRITTEN DOWN TWICE, AND THE COPIES DRIFTED FOR NINE DAYS.
//
// `capture-real-pages.mjs` sends a probe set to the worker for the 86 conformant real pages that every
// real-page claim in this repo rests on. `cli.ts` sends one for the pages a USER points the tool at.
// They answer the same question -- what is it acceptable to do to somebody else's live site? -- and
// nothing compared them.
//
// Measured 2026-09-02: the lab had set `probeNavigation` since 2026-08-24 and `probeFocusContext` since
// that morning; the CLI could not send either, and had no flag for them at all. So `addInertSkipLink`
// (2.4.1), `addStaleRouteTitle` (2.4.2) and 3.2.1 were validated on real pages THROUGH A PATH THE
// PRODUCT DOES NOT TAKE. Three criteria this project headlines as unreachable by a static analyser were
// unreachable by its own CLI, and the failure is this repo's quietest shape: an un-asked probe returns an
// empty channel, and an empty channel is what a conformant page looks like.
//
// `probe-chain.test.ts` could not catch it. It walks five hops and every one is the LAB's -- case
// definitions, manifest, dataset runner, request boundary, capture. The CLI is a sixth hop outside that
// chain, so the guard written for a dropped probe flag did not cover the path a user runs. That is
// "a gate that does not exercise what ships", which this repo has now paid for five times.
//
// Source-level on both sides deliberately: `capture-real-pages.mjs` reaches the fleet at import.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

/** Probe flags and their boolean values, read out of a source region. Derived -- a hand-kept list here
 *  would be a third copy of the very fact this test exists to stop duplicating. */
function probeDefaults(source: string): Map<string, boolean> {
  const found = new Map<string, boolean>();
  for (const [, flag, value] of source.matchAll(/\b(probe[A-Z]\w*)\s*:\s*(true|false)\b/g)) {
    found.set(flag, value === "true");
  }
  return found;
}

/** `defaultArgs()`'s body -- the CLI's answer, before any user flag overrides it. */
function cliDefaults(): Map<string, boolean> {
  const source = read("packages/cli/src/cli.ts");
  const start = source.indexOf("function defaultArgs(): Args {");
  assert.notEqual(start, -1, "defaultArgs() not found -- this test is reading the wrong shape");
  const end = source.indexOf("\n}", start);
  return probeDefaults(source.slice(start, end));
}

/** The `body:` the lab sends for a real page -- the same question, asked on the other path. */
function realPageFlags(): Map<string, boolean> {
  const source = read("packages/lab/src/training/capture-real-pages.mjs");
  const start = source.indexOf("url: workerReachable(page.url, workerUrl)");
  assert.notEqual(start, -1, "the real-page request body not found -- this test is reading the wrong shape");
  const end = source.indexOf("},", start);
  return probeDefaults(source.slice(start, end));
}

test("the guard can see something, or it proves nothing", () => {
  // Both defects this file exists for present as an ABSENT flag, so a reader that silently found none
  // would pass while examining nothing -- the count-based check this repo keeps rediscovering.
  assert.ok(realPageFlags().size >= 4,
    `expected several probe flags on the real-page request, found ${[...realPageFlags().keys()].join(", ")}`);
  assert.ok(cliDefaults().size >= 4,
    `expected several probe defaults in the CLI, found ${[...cliDefaults().keys()].join(", ")}`);
});

test("the CLI asks of a stranger's page exactly what the real-page corpus asks of one", () => {
  const cli = cliDefaults();
  const lab = realPageFlags();

  const disagreements = [...lab].filter(([flag, value]) => cli.get(flag) !== value)
    .map(([flag, value]) => {
      const mine = cli.has(flag) ? String(cli.get(flag)) : "ABSENT -- the CLI cannot send it at all";
      return `  ${flag}: real-page corpus ${value}, CLI ${mine}`;
    });

  assert.deepEqual(disagreements, [],
    "The real-page corpus and the CLI disagree about what may be done to a page we do not own.\n"
    + disagreements.join("\n")
    + "\n\nThese two must match. Every real-page validation in this repo is captured through the corpus"
    + "\npath, so a probe the CLI does not send is a criterion validated on evidence the product never"
    + "\ngathers -- and it fails SILENTLY, because an un-asked probe leaves an empty channel and an empty"
    + "\nchannel is what a clean page looks like. If the consent judgement has genuinely changed, change"
    + "\nit in BOTH places and say why in each.");
});
