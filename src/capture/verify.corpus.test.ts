// Every verification predicate, against every capture in the corpus.
//
// This is the test that would have caught the worst mistake of this project's week. A guard was added
// that rejects a capture when a requested probe produced nothing, validated on six hand-picked cases,
// and shipped. It then failed 44 cases in a live run and added hours to it, because for the
// `custom-control` family an empty probe IS the finding: those bad pages are div-based fake buttons,
// so NVDA finds no controls, and that absence is the 4.1.2 failure being demonstrated.
//
// The corpus is the ground truth available for free. `npm run training:check-signals` scores it 1061
// discriminating / 0 blind / 0 contaminated, which means every pair in it distinguishes its good page
// from its bad one. So a predicate that rejects any capture in it is rejecting evidence known to be
// good — a false positive, by construction, with no judgement required.
//
// Six cases is an anecdote. 2,122 is a test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CapturedAnnouncements } from "./verify.js";
import { captureHasSubstance, captureIsSelfConsistent, captureMentionsTitle, titleOf } from "./verify.js";

const ROOT = resolve(process.cwd(), process.env.DATASET_ROOT ?? "runs/screenreader-dataset");
const MANIFEST = resolve(ROOT, "manifest.json");
const CAPTURES = resolve(ROOT, "captures");
const PAGES = resolve(ROOT, "pages");

/** Only the predicates that GATE a capture. A diagnostic that rejects nothing cannot cost evidence. */
const GATES: { name: string; rejects: (capture: CapturedAnnouncements, title: string) => boolean }[] = [
  { name: "captureMentionsTitle", rejects: (c, title) => !captureMentionsTitle(c, title) },
  { name: "captureHasSubstance", rejects: (c, title) => !captureHasSubstance(c, title) },
  { name: "captureIsSelfConsistent", rejects: (c) => !captureIsSelfConsistent(c) },
];

interface Sample { id: string; variant: string; capture: CapturedAnnouncements; title: string }

/**
 * Every capture on disk, paired with the title of the page it was taken from.
 *
 * Returns empty when the corpus is absent — `runs/` is gitignored, so CI cannot run this and must not
 * fail because of it. The same honest limitation `npm run eval` has: a local gate, not a CI one.
 */
function corpus(): Sample[] {
  if (!existsSync(MANIFEST)) return [];
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8")) as { cases: { id: string }[] };
  const samples: Sample[] = [];
  for (const { id } of manifest.cases) {
    for (const variant of ["good", "bad"]) {
      const capturePath = resolve(CAPTURES, `${id}.${variant}.json`);
      const pagePath = resolve(PAGES, id, `${variant}.html`);
      if (!existsSync(capturePath) || !existsSync(pagePath)) continue;
      const capture = JSON.parse(readFileSync(capturePath, "utf8")) as CapturedAnnouncements;
      if (!Array.isArray(capture.transcript)) continue;
      samples.push({ id, variant, capture, title: titleOf(readFileSync(pagePath, "utf8")) });
    }
  }
  return samples;
}

const samples = corpus();

test("the corpus is present, or this test is honestly skipped", () => {
  if (samples.length === 0) {
    console.log("    no corpus under runs/ — skipping the gate sweep (expected in CI)");
  }
  assert.ok(true);
});

for (const gate of GATES) {
  test(`${gate.name} rejects no capture in the corpus`, () => {
    if (samples.length === 0) return;
    const rejected = samples.filter((s) => gate.rejects(s.capture, s.title)).map((s) => `${s.id}.${s.variant}`);
    assert.deepEqual(
      rejected,
      [],
      `${gate.name} rejected ${rejected.length} of ${samples.length} captures that check-signals ` +
        `scores as discriminating. Either the gate is wrong, or those captures are. Check ` +
        `check-signals before changing the gate.\nFirst few: ${rejected.slice(0, 5).join(", ")}`,
    );
  });
}
