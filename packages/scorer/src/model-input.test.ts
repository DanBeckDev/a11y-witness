/**
 * The model's input is built in ONE place, and every record-producing path uses it.
 *
 * It was built twice — once for corpus records in `export-screenreader-dataset.mjs`, once for real-page
 * records in `build-realism-tier.mjs` — with nothing relating the copies. The moment the contract gained a
 * field (`parsed`, so the featurizer stops re-deriving NVDA's grammar in Python), wiring three callers still
 * missed the fourth, and training died on a real-page record.
 *
 * That failure was LOUD, which was luck plus a deliberate refusal to fall back. The same drift in a field
 * the featurizer merely reads as zero would have trained a model on real pages that silently lacked it —
 * and a difference that exists only on real-page records is a shortcut a linear head can use, which
 * `evidence-units.ts`'s own header records happening once already with channel names.
 *
 * So: one builder, and a test that the builder produces the whole contract rather than a subset.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { modelInput } from "./evidence-units.js";

const CAPTURE = {
  screenReader: "NVDA",
  transcript: ["heading, level 1, Booking", "link, Check availability"],
  structure: {
    headings: ["Booking, heading, level 1"],
    formFields: ["Departure date, edit"],
    links: ["Check availability, link"],
    graphics: [], tableCells: [], landmarks: [], lists: [],
  },
  interaction: { controls: [], stateChanges: [], formChanges: [], postSubmitFields: [] },
};

test("the input carries the parse, which the featurizer now requires", () => {
  const input = modelInput(CAPTURE as never) as { parsed?: Record<string, unknown[]> };
  assert.ok(input.parsed, "no `parsed` block: the Python featurizer refuses this record outright");
  assert.ok(Array.isArray(input.parsed.formFields));
  assert.equal((input.parsed.formFields[0] as { objects: { name: string }[] }).objects[0].name,
    "Departure date", "the sweep channel is name-first; parsing it role-first loses the name");
});

test("the transcript is parsed role-first and the sweep name-first, in the same record", () => {
  // The two channels carry OPPOSITE orders — 884/0 and 0/880 across 300 captures. A builder that passed one
  // channel constant for both would silently mis-parse half of every record.
  const input = modelInput(CAPTURE as never) as { parsed: Record<string, { objects: { name: string }[] }[]> };
  assert.equal(input.parsed.transcript[1].objects[0].name, "Check availability");
  assert.equal(input.parsed.links[0].objects[0].name, "Check availability");
});

test("the contract keeps everything the featurizer and the dataset already read", () => {
  const input = modelInput(CAPTURE as never) as Record<string, unknown>;
  for (const key of ["screenReader", "transcript", "structure", "interaction", "evidenceUnits",
    "evidenceText", "parsed"]) {
    assert.ok(key in input, `${key} vanished from the model input contract`);
  }
});

test("NOBODY builds the model's input except this module", () => {
  // The guard that would have caught the original drift. Two files constructed `input: { screenReader,
  // transcript, structure, interaction, evidenceUnits, ... }` by hand; a third would drift the same way.
  const suspects = [
    "../../lab/src/training/export-screenreader-dataset.mjs",
    "../../lab/scripts/build-realism-tier.mjs",
  ];
  for (const relative of suspects) {
    const source = readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
    assert.ok(source.includes("modelInput("),
      `${relative} does not use the shared modelInput builder`);
    assert.ok(!/evidenceUnits:\s*evidenceUnits\(/.test(source),
      `${relative} assembles the model input by hand again — that duplication is what let the contract `
      + "drift when it gained a field, and the copies cannot be kept in step by remembering");
  }
});
