// @ts-check
/**
 * THE NEWEST RUN OF EACH CHECK NAME. ONE PLACE, BECAUSE FIXING IT AT ONE CALL SITE IS HOW IT SPREAD.
 *
 * #634. GitHub's `statusCheckRollup` UNIONS superseded check-runs, so a cancelled or replaced run's
 * verdict survives on the head for ever. A predicate that asks *"does any run of this head report
 * failure"* answers truthfully about a window nobody chose — every attempt ever made — while the caller
 * meant *"what does this check say now"*. The two read identically and diverge silently.
 *
 * **The root: the sha is not a run identifier.** `pull_request: edited` re-runs CI without moving the
 * commit, so every predicate keyed on "the sha" quietly assumes one run per sha. A sha identifies a tree;
 * it does not identify an attempt to test one.
 *
 * ## It has been fixed FOUR TIMES at four call sites
 *
 * `update-branch-sweep.mjs` (#500, then again at #517), `trunk-revert.mjs` (#582), `queue-table.mjs`
 * (which is where this function was, with a header naming the other three). **That is this repository's
 * most expensive recurring shape — a remedy applied where the fault was noticed rather than everywhere
 * the behaviour reaches — and a fifth call site had never had it**: `merge-queue.mjs`'s
 * `checksBlocking`, which decides whether a PR is mergeable, filtered the RAW rollup and would report
 * `checks failing` for a PR whose current runs are all green.
 *
 * On 2026-09-09 the same shape produced two OPPOSITE wrong verdicts on #619 within an hour: `gh pr
 * checks` said `fail` where the truth was **pending**, and a waiter keyed on the sha said `fail` where
 * the truth was **pass**. Neither source is safe alone and they fail at different moments, so "use the
 * other one" was never the fix. **Newest-per-NAME survives both**, because it asks about a name's
 * current answer rather than about a run's existence.
 */

/** A run still in flight reports this rather than null, so it must not be read as a completion time. */
export const ZERO_DATE = "0001-01-01T00:00:00Z";

const real = (/** @type {string | undefined} */ v) => (v && v !== ZERO_DATE ? v : "");

/**
 * When a run last said anything. `completedAt` if it has finished, else `startedAt`.
 * ISO-8601 sorts lexically, so string comparison is a real ordering here rather than a shortcut.
 * @param {{completedAt?: string, startedAt?: string}} check
 */
const stampOf = (check) => real(check.completedAt) || real(check.startedAt) || "";

/**
 * The newest run of each check NAME — never `find`, which returns the OLDEST because the rollup is a
 * union in insertion order.
 *
 * The RETURN type has a required `name`, and that is not a convenience: the loop skips any entry
 * without one, so every value that comes back has been through that filter. Typing it as optional made
 * `queue-table.mjs`'s `.map((c) => c.name)` produce `(string | undefined)[]` where a `string[]` was
 * wanted -- a type describing what the input might be rather than what the output IS.
 *
 * @param {{name?: string, conclusion?: string, completedAt?: string, startedAt?: string}[]} rollup
 * @returns {{name: string, conclusion?: string, completedAt?: string, startedAt?: string}[]}
 */
export function newestPerName(rollup) {
  const best = new Map();
  for (const check of rollup ?? []) {
    if (!check?.name) continue;
    const stamp = stampOf(check);
    const seen = best.get(check.name);
    if (!seen || stamp >= stampOf(seen)) best.set(check.name, check);
  }
  return [...best.values()];
}

/**
 * The newest run of ONE name's conclusion, or null when that name has no run at all.
 *
 * **NO RUN MEANS PENDING, NEVER FAILURE.** `gh pr checks` reports `fail` for a name the current run has
 * not reached yet, because a superseded run of that name is still on the head. Returning null here — and
 * making the caller decide what an absent answer means — is what keeps "has not answered" and "answered
 * badly" from being the same word.
 *
 * @param {{name?: string, conclusion?: string, completedAt?: string, startedAt?: string}[]} rollup
 * @param {string} name
 * @returns {string | null}
 */
export function newestConclusionOf(rollup, name) {
  const newest = newestPerName(rollup).find((c) => c.name === name);
  return newest ? (newest.conclusion || null) : null;
}
