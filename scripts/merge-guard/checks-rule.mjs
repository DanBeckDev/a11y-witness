#!/usr/bin/env node
// @ts-check
// RULE: DID EVERY REQUIRED CONTEXT ACTUALLY RUN AND CONCLUDE? -- the #148 case's other half. An empty
// check-run list, a required context that never ran, one still in flight, and one that failed are FOUR
// different states this repo has repeatedly conflated into one bare "not green"; each needs its own
// sentence because each sends the reader to a different fix.
//
// Also the lookup `armed-race-rule.mjs`'s `lookupArmedPrStatus` reuses to decide GREEN, rather than
// inventing a second reading of "is this PR green" off `statusCheckRollup` -- see that module's own
// comment for the incident that made a second reading dangerous.

/** A concluded context that does not block a merge. `skipped` is a path filter declining, not a failure. */
export const SATISFIED = new Set(["success", "skipped", "neutral"]);

/**
 * @param {{headRefOid: string}} pr
 * @param {string[]} required
 * @param {{name: string, status: string, conclusion: string | null}[]} runs
 * @returns {string[]}
 */
export function checkReasons(pr, required, runs) {
  if (runs.length === 0) {
    return [`NO CHECK RUNS EXIST for head ${pr.headRefOid.slice(0, 10)} — not one, ever.\n`
      + "  Nothing has tested this code. This is the state that reads as `CLEAN`, because a required\n"
      + "  context that never ran is not a failing check; it is the absence of one."];
  }
  const byName = new Map(runs.map((run) => [run.name, run]));
  const missing = required.filter((context) => !byName.has(context));
  const unfinished = runs.filter((run) => run.status !== "completed").map((run) => run.name);
  const failing = runs.filter((run) => run.status === "completed" && !SATISFIED.has(run.conclusion ?? ""))
    .map((run) => `${run.name} (${run.conclusion})`);

  // `.filter(Boolean)` does not narrow `(string | false)[]` to `string[]` -- a well-known TS gap, not a
  // behaviour bug -- so the predicate says so explicitly.
  return [
    missing.length > 0 && `REQUIRED CONTEXT NEVER RAN: ${missing.join(", ")}.\n`
      + "  Present-and-failing and never-ran are different states; this is the second.",
    unfinished.length > 0 && `STILL RUNNING: ${unfinished.join(", ")}. Not a refusal forever — ask again.`,
    failing.length > 0 && `FAILING: ${failing.join(", ")}.`,
  ].filter(/** @returns {reason is string} */ (reason) => Boolean(reason));
}
