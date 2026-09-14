// #1438 ACCEPTANCE: rehearsal 3's real result, whose rule layer found three things INSIDE an iframe, through the CLI's
// own conformance builder.
//
// Rehearsals 4 and 5 read Requirement 2's "content inside iframes is not entered" beside three axe findings addressed
// `["iframe", …]` in the YouTube player, and a transcript that went into that frame ("Video, frame, clickable" at line
// 101) and came "out of frame" at line 110. `@a11ign/evidence`'s `conformanceScope` never sees a finding -- only
// whether the rule layer ran -- so the only place a result CARRYING an iframe-addressed finding meets the sentence is
// here, in `conformanceFor`, over the committed artifact (`fixtures/rehearsal3-34774183433-a11ign-result.json`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { conformanceFor, type CaptureResponse } from "./cli.js";

type RuleFinding = { rule: string; nodes?: { target?: unknown[] }[] };

/** Rehearsal 3's rule layer reported exactly this many findings, every one inside the YouTube player's iframe. */
const REHEARSAL_3_RULE_FINDINGS = 3;

const rehearsal3 = JSON.parse(readFileSync(
  new URL("./fixtures/rehearsal3-34774183433-a11ign-result.json", import.meta.url), "utf8")) as {
  url: string; screenReader: string; transcript?: string[]; structure: unknown; interaction: unknown;
  environment: unknown; ruleBased: RuleFinding[] | null;
};

/** The capture half of the Action result: exactly the fields the CLI copied out of the capture. */
const capture = {
  url: rehearsal3.url, screenReader: rehearsal3.screenReader, transcript: rehearsal3.transcript ?? [],
  structure: rehearsal3.structure, interaction: rehearsal3.interaction, environment: rehearsal3.environment,
} as CaptureResponse;

const fullPagesOf = (axe: Parameters<typeof conformanceFor>[1]) =>
  conformanceFor(capture, axe).find((r) => r.number === 2)!;
const textOf = (r: { establishes: string; limitation: string }) => `${r.establishes} ${r.limitation}`;

test("#1438 ACCEPTANCE: the fixture really carries rule-layer findings addressed inside an iframe", () => {
  // THE POSITIVE CONTROL for everything below: without it, a fixture whose findings were top-document would make the
  // assertions about iframe wording pass for a reason the row is not about.
  const findings = rehearsal3.ruleBased ?? [];
  assert.equal(findings.length, REHEARSAL_3_RULE_FINDINGS, "rehearsal 3's rule layer reported three findings");
  for (const finding of findings) {
    const targets = (finding.nodes ?? []).map((node) => node.target ?? []);
    assert.ok(targets.length > 0 && targets.every((target) => target[0] === "iframe"),
      `${finding.rule}: every node's target starts inside an iframe (${JSON.stringify(targets)})`);
  }
  assert.ok((rehearsal3.transcript ?? []).some((line) => /\bframe\b/.test(line) && /You Tube Video Player/.test(line)),
    "and the screen reader's own transcript went into that frame");
});

test("#1438 ACCEPTANCE: with those findings, Requirement 2 names what EACH layer examines inside iframes", () => {
  const text = textOf(fullPagesOf(rehearsal3.ruleBased as Parameters<typeof conformanceFor>[1]));
  assert.doesNotMatch(text, /iframes?\s+(?:is\s+|are\s+)?not\s+entered/i,
    "\"not entered\" beside three findings from inside an iframe is the contradiction the rehearsals read");
  assert.match(text, /rule layer \(axe-core\) examines iframe documents too/i, "the layer that found them");
  assert.match(text, /screen reader\x27s read-through and sweeps can pass into a frame/i, "the layer that read into it");
  assert.match(text, /nothing inside a frame or embedded object is operated/i);
});

test("#1438 CONTROL: with no rule layer, the same capture still states the screen-reader scope and claims nothing for axe", () => {
  const text = textOf(fullPagesOf(null));
  assert.match(text, /screen reader\x27s read-through and sweeps can pass into a frame/i);
  assert.match(text, /the rule layer did not run/i);
  assert.doesNotMatch(text, /axe-core\) examines iframe/i);
});
