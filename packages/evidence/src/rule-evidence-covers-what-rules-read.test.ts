import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { oracleCounts } from "./verify.js";

const REPO = join(import.meta.dirname, "../../..");
const RULES = join(REPO, "packages/judge/src/rules.ts");

/**
 * EVERY `input.<key>` THE RULES READ MUST BE REACHABLE IN AN EXPORTED RECORD — derived from the rules, not
 * from anyone's memory of them.
 *
 * A hand-written list of evidence fields has now been wrong FOUR times in this repo, and each time it was
 * silent: the rule simply never fired, and a gate reported clean having examined a record that could not
 * carry the answer.
 *
 *   `census`  1.3.1:no-headings read `census.heading === 0` and the exporter stripped it. `rules:coverage`
 *             said "NEVER FIRED ANYWHERE — the claim rests on nothing" for as long as the rule existed.
 *   `media`   1.4.2:autoplay-uncontrollable, 2026-09-06: "rule-decided on 7 record(s) and caught only 0".
 *             Seven records whose whole purpose is that subtype.
 *   twice more in `evidence:check`'s own field list, where a field on disk was neither compared nor excluded.
 *
 * So the LIST is the defect, not any of the fields. This derives the requirement instead: scrape `rules.ts`
 * for every `input.<key>` it reads, and require each to arrive by one of the two legitimate routes.
 *
 * TWO ROUTES, and keeping them distinct is the point of `ruleEvidence` existing at all:
 *   - the model's `input`, an allowlist the featurizer also sees; or
 *   - `ruleEvidence` (`oracleCounts`), the SIBLING channel built so a rule may use evidence the model is
 *     deliberately denied — which is why `dom` can be in FORBIDDEN_INPUT_KEYS and 1.4.2 still work.
 *
 * A key in neither is unreachable, and the rule reading it cannot fire in `rules:gate` however correct it is.
 */

/** Keys the rules read straight off the capture, which every exported record carries verbatim. */
const FROM_THE_CAPTURE = new Set(["transcript", "structure", "interaction"]);

function keysRulesRead(): string[] {
  const src = readFileSync(RULES, "utf8");
  const found = new Set<string>();
  for (const m of src.matchAll(/\binput\??\.([a-zA-Z][a-zA-Z0-9]*)/g)) found.add(m[1]);
  return [...found].sort();
}

test("every input.<key> the rules read arrives by input or by ruleEvidence", () => {
  const read = keysRulesRead();
  // ANTI-VACUITY: a rename of `input`, or a refactor to destructuring, would make this examine nothing and
  // pass — which is the exact shape of the defect it exists for, one level up.
  assert.ok(read.length >= 5,
    `only ${read.length} input.<key> reads found in rules.ts (${read.join(", ")}). The scrape has gone `
    + "blind — check whether the parameter was renamed or destructured before trusting this pass.");

  // `oracleCounts` on an empty capture names the ruleEvidence channel's own keys.
  const carried = new Set(Object.keys(oracleCounts({ transcript: [], structure: {}, interaction: {} } as never)));
  const unreachable = read.filter((k) => !FROM_THE_CAPTURE.has(k) && !carried.has(k)).sort();

  assert.deepEqual(unreachable, [],
    "these keys are read by a rule and arrive in an exported record by NEITHER route, so the rule cannot "
    + "fire in `rules:gate` no matter how correct it is. Add each to `oracleCounts` (ruleEvidence) if the "
    + "model must not see it, or to the model's input allowlist if it may:\n  " + unreachable.join("\n  "));
});

/**
 * THE REVERSE DIRECTION IS DELIBERATELY NOT TESTED HERE, and saying why is worth more than a weak guard.
 *
 * "Does `ruleEvidence` carry a key nothing reads?" looks like the natural other half, and it is the wrong
 * question as posed: `oracleCounts` serves several consumers, not just `rules.ts` — `outcomes.ts` reads
 * `completeness`, `channel-comparison.ts` reads `probes`, and `check-real-page-findings.ts` imports
 * `domCensus` and the suspect-census helpers directly. A scrape narrow enough to be reliable (`input.<key>`
 * in one file) cannot see any of them, and a scrape wide enough to try (`\.<key>\b` across three packages)
 * reported `dom` as read by NOTHING, which is plainly false.
 *
 * So I could not establish the population, and a guard over a population you cannot establish is the exact
 * defect this file exists to close — asserted confidently over the wrong set. `banner`, `dom` and
 * `supports` may well be dead weight; that is a question for whoever owns those consumers, with a reader
 * index rather than a regex, and it is a Ready row rather than something to approximate here.
 */
