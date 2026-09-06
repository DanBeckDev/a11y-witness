/**
 * A NUMBER IN PROSE IS A NUMBER THAT STOPS BEING TRUE.
 *
 * `local-judge.ts` states the rule, having been bitten by it: `layerSummary` hardcoded "eight" and went
 * stale "the day 1.4.2 and 2.1.2 arrived", so it now COUNTS instead. The lesson did not reach the
 * comments, and by 2026-08-29 eight of them were wrong at once — including `coverage.ts`'s own header,
 * the file whose entire job is to stop coverage claims drifting, which said "We assess eight of
 * fifty-five" while `assessedCriteria()` returned FOURTEEN.
 *
 * The numbers were: 55 total, 14 assessed, 41 untested. The prose said eight assessed and 45 or 47
 * untested, in different files, none agreeing with another.
 *
 * None of it had a runtime effect — `conformanceScope` computes from the list it is handed, and its test
 * uses an 8-criterion FIXTURE, which is why "Assessed 8 of 55" is correct there and stale everywhere else.
 * A reader has no way to tell those apart, which is the harm.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { sandboxGitEnv } from "../../../scripts/git-env.mjs";

import { assessedCriteria, SCORED_CRITERIA } from "./coverage.js";

const ROOT = resolve(import.meta.dirname, "../../..");

/** Written-out or numeric counts attached to "criteria" — the shape that goes stale. */
const SPELLED_OUT =
  /\b(?:eight|nine|ten|eleven|twelve|thirteen|fourteen|forty-\w+|\d{1,2})\s+(?:of\s+(?:55|fifty-five)|criteria\b)/gi;

/** Only the COMMENTS. An assertion carrying a number is checked by running it; a comment is not. */
function commentsIn(source: string): string {
  return [...source.matchAll(/\/\*[\s\S]*?\*\/|\/\/.*$/gm)].map((m) => m[0]).join("\n");
}

test("NO COMMENT spells out how many criteria are assessed", () => {
  // Comments only, and that distinction is the whole rule. `conformance.test.ts` asserts
  // `/Assessed 8 of 55/` against an explicit 8-criterion FIXTURE — correct, self-evident, and checked
  // every time the suite runs. The same numeral in a comment is a claim nothing verifies.
  const files = execFileSync("git", ["ls-files", "packages/judge/src", "packages/evidence/src"],
    { cwd: ROOT, env: sandboxGitEnv(), encoding: "utf8" }).split("\n").filter((f) => /\.ts$/.test(f));
  // A wrong ROOT or a renamed package makes `git ls-files` return nothing, and an empty `files` reports
  // zero offenders having examined nothing -- the exact "check answers correctly about the wrong
  // population" shape (docs/backlog.md). ~62 at the time this guard was added; a floor, not a pin.
  assert.ok(files.length >= 40,
    `only found ${files.length} .ts file(s) under packages/judge/src and packages/evidence/src -- the `
    + "scan is broken (wrong ROOT, or the packages moved), not the population shrinking");
  const offenders: string[] = [];
  for (const file of files) {
    if (file.endsWith("criteria-counts-are-not-spelled-out.test.ts")) continue;
    const source = commentsIn(readFileSync(resolve(ROOT, file), "utf8"));
    for (const [match] of source.matchAll(SPELLED_OUT)) {
      // "55 criteria" is the WCAG 2.2 AA total and cannot go stale — the standard is fixed.
      if (/^(55|fifty-five)\b/i.test(match)) continue;
      offenders.push(`${file}: "${match}"`);
    }
  }
  assert.deepEqual(offenders, [],
    "state the mechanism, not the count — `assessedCriteria().length` is the number, and every numeral "
    + "written beside the word 'criteria' in this repo has gone stale at least once");
});

test("the counts the code computes are internally consistent", () => {
  // The positive half: whatever the number IS, the union must contain the scorer's heads.
  const assessed = new Set(assessedCriteria());
  const missing = SCORED_CRITERIA.filter((c) => !assessed.has(c));
  assert.deepEqual(missing, [], "a criterion with a trained head must be reported as assessed");
});
