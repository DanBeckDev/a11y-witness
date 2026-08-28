import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

/**
 * EVERY module that runs the rules against a capture must extract the oracle counts with `oracleCounts`.
 *
 * This is a DISCOVERY test, not a list, for the reason `worker-code-check.test.ts` gives: a list records
 * the callers that existed when somebody last looked. The census defect has now been found three separate
 * times in this repo — two audits (2026-08-26), then `calibrate-abstention` and `rules-check` (2026-08-28)
 * — and each time the fix reached the callers in front of whoever was looking and no others. A seventh
 * caller fails this test until somebody classifies it.
 *
 * Both directions are failures, and the second is worse:
 *
 *   - A caller that SKIPS the extraction runs census-reading rules against a capture that records the
 *     census as a diagnostic, so those rules return on their first line. `calibrate-abstention` did this
 *     in the one sweep that scores real pages through the product path.
 *   - A caller that has evidence the PRODUCT does not build makes a rule that is exercised by a gate and
 *     silent for users. `dom` was exported and nowhere else, so the first rule to read it would have
 *     scored perfectly on 1,183 conformant records and never once fired. Nothing would have said so.
 */
const ROOT = resolve(import.meta.dirname, "../../..");

/** Modules that mention `ruleFindings` but do not run it against a capture, each with the reason. */
const NOT_CAPTURE_CALLERS: Record<string, string> = {
  "packages/judge/src/rules.ts": "defines ruleFindings",
  "packages/judge/src/judge.ts": "receives a JudgeInput its caller already built",
  "packages/lab/src/eval/fitness.ts": "names it in a comment only",
  "packages/judge/isolation-smoke.mjs": "builds a literal input to prove the bundle loads",
  "packages/lab/scripts/score-rules.ts": "scores EXPORTED records, which carry ruleEvidence from oracleCounts",
};

function discoverCallers(): string[] {
  const out = execFileSync("git", ["grep", "-l", "ruleFindings", "--", "packages"], {
    cwd: ROOT, encoding: "utf8",
  });
  // Executable modules only. Prose that MENTIONS the rules is not a caller, and the first run of this
  // test proved the point by demanding that `packages/judge/README.md` call a function.
  return out.split("\n")
    .filter((f) => /\.(ts|mjs)$/.test(f) && !f.includes(".test.") && !f.includes("/dist/"))
    .sort();
}

const callers = discoverCallers();

test("the callers are DISCOVERED rather than trusted from a list", () => {
  // Guards the discovery itself. A rename of `ruleFindings` would otherwise leave every assertion below
  // iterating an empty array and passing — the exact way the signal-type scrape passed having examined
  // nothing, which this repo records as a rule: a test must not derive its expectations from source TEXT
  // without first proving the text was found.
  assert.ok(callers.length >= 8, `discovered only ${callers.length} rule callers: ${callers.join(", ")}`);
  assert.ok(callers.includes("packages/cli/src/cli.ts"), "the product path must be among them");
});

for (const file of callers) {
  const reason = NOT_CAPTURE_CALLERS[file];
  test(reason ? `${file} is exempt: ${reason}` : `${file} extracts the oracle counts`, () => {
    const source = readFileSync(resolve(ROOT, file), "utf8");
    const extracts = /\boracleCounts\(/.test(source);
    if (reason) {
      // The other direction, and the worse one: a caller holding evidence the PRODUCT does not build
      // makes a rule that a gate exercises and a user never sees.
      assert.equal(extracts, false, `${file} is exempt as "${reason}" but calls oracleCounts`);
      return;
    }
    assert.ok(extracts, `${file} runs the rules against a capture without extracting the oracle counts`);
  });
}
