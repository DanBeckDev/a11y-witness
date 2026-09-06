/**
 * EVERY ORACLE `oracleCounts` PRODUCES MUST BE READABLE BY THE RULES.
 *
 * The oracle set is declared once, as `OracleCounts` in `@a11y-witness/evidence/verify`, and two
 * interfaces used to restate parts of it: `JudgeInput` listed `census` and `dom`, and `RuleInput` lists
 * each field with its own rationale.
 *
 * `JudgeInput`'s comment said "spread from `oracleCounts` at every construction site" — naming the
 * requirement while the type enforced none of it. By 2026-08-29 `oracleCounts` also returned
 * `completeness`, `truncated`, `supports` and `banner`, and `JudgeInput` mentioned none: they reached the
 * rules only because object spread preserves what a type does not mention. A caller building the literal
 * by hand would have compiled cleanly and silently disabled C2's guard, which is this repo's most
 * expensive shape — a remedy that is reachable, commented, and inert.
 *
 * `JudgeInput` now EXTENDS the type. This pins the other half: every key the function actually returns is
 * one a rule can read.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { oracleCounts } from "@a11y-witness/evidence/verify";
import type { RuleInput } from "./rules.js";
import type { JudgeInput } from "./judge.js";

/** A capture rich enough that `oracleCounts` populates every field it knows how to. */
const CAPTURE = {
  transcript: ["Home, document", "Welcome, heading, level 1"],
  structure: { headings: ["Welcome, heading, level 1"], landmarks: [], links: [], graphics: [],
    formFields: [], tableCells: [] },
  interaction: {},
  diagnostics: [
    { event: "structureCensus", heading: 1, link: 0, graphic: 0, landmark: 0,
      distinct: { heading: 1, link: 0, graphic: 0, landmark: 0, formControl: 0 } },
    { event: "truncatedAnnouncements", truncated: [], checked: true },
  ],
} as never;

test("every key oracleCounts returns is declared on RuleInput", () => {
  // The failure this catches: a new oracle added to `oracleCounts` that no rule can see, which would look
  // exactly like a rule choosing not to use it.
  const produced = Object.keys(oracleCounts(CAPTURE));
  assert.ok(produced.length >= 4, `oracleCounts produced only ${produced.length} keys; the fixture is thin`);
  // Compile-time: naming each key on a RuleInput proves it is declared. A key absent from the interface
  // makes this object literal a type error, which is the assertion — `tsc` is the test here.
  const readable: Required<Pick<RuleInput,
    "census" | "dom" | "probes" | "completeness" | "truncated" | "media">> = {
      census: {}, dom: {} as never, probes: {} as never, completeness: {}, truncated: [],
      // `media` joined the oracle set with 1.4.2 (`ruleEvidence carries media`), and this list is the
      // half that does not derive itself -- so the guard fired by NAME on the merge rather than at the
      // commit, which is the guard working. Declared on `RuleInput` at its own definition; naming it
      // here is what proves that, since `tsc` is the assertion.
      media: [],
    };
  const declared = new Set(Object.keys(readable));
  const unreadable = produced.filter((key) => !declared.has(key)
    // `supports` and `banner` are REPORTING oracles, read by `capture:explain` and the CLI rather than by
    // a rule. Listed here rather than silently passed, so adding a third does not slip through.
    && !["supports", "banner"].includes(key));
  assert.deepEqual(unreadable, [],
    "an oracle the rules cannot read is one that looks like a rule declining to use it");
});

test("JudgeInput carries the oracle set by EXTENDING it, not by restating two fields", () => {
  // Compile-time again: this only builds if `JudgeInput` really does accept the whole shape.
  const input: JudgeInput = {
    url: "https://example.com", task: "t", screenReader: "NVDA", transcript: [],
    ...oracleCounts(CAPTURE),
  };
  assert.equal(typeof input.completeness, "object",
    "completeness must survive onto a JudgeInput, or C2's guard is inert on the judge path");
});
