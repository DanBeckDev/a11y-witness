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
 * THE NEWEST RUN PER NAME -- #902, and it is a correctness fix rather than tidying.
 *
 * GitHub keeps every check run for a head, so one name appears once per workflow run: a cancelled or
 * superseded attempt sits in the list beside the one that actually decided. This module read EVERY entry
 * (`unfinished` and `failing` swept the whole array, and `new Map` kept whichever came last in it), so a
 * single cancelled run made a green pull request read red. **Measured on 2026-09-11: two different
 * sessions read #996 as red within twenty minutes, from a `gate` job in a run that had been cancelled
 * 22 seconds after it started.**
 *
 * BY ID, NOT BY `completedAt`: an id is monotonic and always present, while a run still in flight has no
 * completion time at all -- ordering on that would drop exactly the in-flight run the STILL RUNNING
 * sentence exists to report. A run carrying no id sorts oldest and ties go to array order, so a caller
 * that does not supply ids keeps precisely its previous behaviour rather than silently losing runs.
 *
 * @param {{id?: number, name: string, status: string, conclusion: string | null}[]} runs
 * @returns {{id?: number, name: string, status: string, conclusion: string | null}[]}
 */
export function newestPerName(runs) {
  /** @type {Map<string, {id?: number, name: string, status: string, conclusion: string | null}>} */
  const byName = new Map();
  for (const run of runs) {
    const seen = byName.get(run.name);
    if (!seen || (run.id ?? 0) >= (seen.id ?? 0)) byName.set(run.name, run);
  }
  return [...byName.values()];
}

/**
 * @param {{headRefOid: string}} pr
 * @param {string[]} required
 * @param {{id?: number, name: string, status: string, conclusion: string | null}[]} runs
 * @returns {string[]}
 */
export function checkReasons(pr, required, runs) {
  if (runs.length === 0) {
    return [`NO CHECK RUNS EXIST for head ${pr.headRefOid.slice(0, 10)} — not one, ever.\n`
      + "  Nothing has tested this code. This is the state that reads as `CLEAN`, because a required\n"
      + "  context that never ran is not a failing check; it is the absence of one."];
  }
  // #902: every sentence below is about the NEWEST run of each name. Reading all of them let a superseded
  // attempt speak for a context that has since concluded differently.
  const latest = newestPerName(runs);
  const byName = new Map(latest.map((run) => [run.name, run]));
  const missing = required.filter((context) => !byName.has(context));
  const unfinished = latest.filter((run) => run.status !== "completed").map((run) => run.name);
  const failing = latest.filter((run) => run.status === "completed" && !SATISFIED.has(run.conclusion ?? ""))
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
