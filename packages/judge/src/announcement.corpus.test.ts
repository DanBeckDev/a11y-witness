/**
 * The corpus is free ground truth, and this is the check that could not be written before.
 *
 * The two evidence channels are INDEPENDENT renderings of the same page, in opposite announcement orders.
 * So a correct parser must reconcile them: a link the quick-nav sweep names "Details" must be the same link
 * the arrow read-through announces as "link, Details". No labels are needed — the invariant is internal to
 * every capture already on disk, of which there are thousands.
 *
 * That is worth more than any fixture set. Six regexes each passed their own tests while encoding a
 * different wrong grammar, because every one of those tests was written in the shape its author already
 * believed. This one cannot be, because the data was captured before the parser existed.
 *
 * Skips honestly without `runs/`, like `verify.corpus.test.ts` — CI cannot see the corpus, and a check that
 * reports success having examined nothing is the defect this repo keeps finding in its own tooling.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { nameOf, parseAnnouncement } from "./announcement.js";

const CAPTURES = fileURLToPath(
  new URL("../../../runs/screenreader-dataset/captures/", import.meta.url));

type Capture = { transcript?: unknown[]; structure?: Record<string, unknown[]> };

function captures(limit: number): Capture[] {
  if (!existsSync(CAPTURES)) return [];
  return readdirSync(CAPTURES)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .slice(0, limit)
    .map((f) => JSON.parse(readFileSync(join(CAPTURES, f), "utf8")) as Capture);
}

const lines = (values: unknown[] | undefined): string[] =>
  (values ?? []).filter((v): v is string => typeof v === "string");

test("a link named in one channel is named the same in the other", { skip: !existsSync(CAPTURES) }, () => {
  const disagreements: string[] = [];
  let compared = 0;

  for (const capture of captures(600)) {
    const fromSweep = new Set(
      lines(capture.structure?.links).map((l) => nameOf(l, "link", "sweep")).filter(Boolean));
    const fromTranscript = new Set(
      lines(capture.transcript).map((l) => nameOf(l, "link", "transcript")).filter(Boolean));
    if (!fromSweep.size || !fromTranscript.size) continue;

    // The sweep is exhaustive and the read-through is not, so the transcript's names must be a SUBSET.
    // Comparing the other way would fail on links the read-through never reached, which is a property of
    // reading order rather than of parsing.
    for (const name of fromTranscript) {
      compared += 1;
      if (!fromSweep.has(name)) disagreements.push(`transcript "${name}" is in no sweep entry`);
    }
  }

  assert.ok(compared > 200,
    `only ${compared} link names compared; this guard needs a real corpus to mean anything`);
  const rate = disagreements.length / compared;
  assert.ok(rate < 0.05,
    `${disagreements.length} of ${compared} link names (${(rate * 100).toFixed(1)}%) differ between the two `
    + `channels, so the parser reads at least one of them wrong. First few:\n  `
    + disagreements.slice(0, 5).join("\n  "));
});

test("every announcement that mentions a role yields an object for it", { skip: !existsSync(CAPTURES) }, () => {
  // Coverage, not correctness — the question `test_extractor_coverage.py` asks of the Python side. A parser
  // that silently returns nothing looks exactly like a page with nothing to report, which is the
  // indistinguishability this repo pays for most often.
  const missed: string[] = [];
  let seen = 0;
  for (const capture of captures(400)) {
    for (const line of lines(capture.structure?.links)) {
      if (!/\blink\b/i.test(line)) continue;
      seen += 1;
      if (!parseAnnouncement(line, "sweep").objects.some((o) => o.role === "link")) missed.push(line);
    }
  }
  assert.ok(seen > 200, `only ${seen} link announcements seen; the corpus is too small to conclude from`);
  const rate = missed.length / seen;
  assert.ok(rate < 0.02,
    `${missed.length} of ${seen} announcements naming a link produced no link object (${(rate * 100).toFixed(1)}%). `
    + `A blind extractor is indistinguishable from a page with no links. First few:\n  `
    + missed.slice(0, 5).join("\n  "));
});

test("parsing is total: no announcement on disk throws", { skip: !existsSync(CAPTURES) }, () => {
  let parsed = 0;
  for (const capture of captures(300)) {
    for (const channel of ["sweep", "transcript"] as const) {
      const source = channel === "sweep"
        ? Object.values(capture.structure ?? {}).flatMap((v) => lines(v as unknown[]))
        : lines(capture.transcript);
      for (const line of source) {
        parseAnnouncement(line, channel);
        parsed += 1;
      }
    }
  }
  assert.ok(parsed > 1000, `only ${parsed} announcements parsed; not enough to call this total`);
});
