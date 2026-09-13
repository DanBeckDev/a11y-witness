// #1227: PURE OF `gh`, and that is placement rather than style.
//
// `moveProjectStatus` lives in `row-claim.mjs`, whose closure carries a `token`. Importing it here would
// give every test that reaches this file a token requirement -- and `close-rows-on-merge.test.ts`
// already has one, so the row's named acceptance command could never run in the job that runs acceptance
// commands. #1009 records the rule: the fix is PLACEMENT, not weakening. `moveStatus` is injected and
// the entry points supply it.

/**
 * #1227: MOVES A CLOSED ROW'S PROJECT STATUS TO `Done`, IN THE SAME ACT AS THE CLOSE.
 *
 * `row-claim` writes `In progress` on claim and nothing wrote the resting state, so the board refilled
 * with closed rows at a live Status **at the rate the org closes rows** -- measured during #1223/#1224 at
 * roughly one per twenty minutes. Two backfills cleared 316; neither closed the loop, because **a guard
 * that detects and a write that prevents are different things.**
 *
 * NEVER THROWS and never affects the close's outcome, the same trade `stripClaimLabels` makes: a row that
 * closed with a stale Status is strictly better than one left open because a board write failed.
 *
 * THE THREE OUTCOMES ARE DISTINCT, per ceo's 2026-09-08 ruling on `moveProjectStatus` itself: "'could not
 * ask' and 'asked and wrote' must not look the same, and a half-applied claim is worse than none."
 *
 * @param {number} n
 * @param {{ moveStatus: (n: number, status: string) =>
 *   ({ moved: true } | { moved: false, reason: string, notOnBoard: boolean }),
 *   log?: (line: string) => void }} deps
 */
export function settleClosedStatus(n, { moveStatus, log = console.log }) {
  const result = moveStatus(n, "Done");
  if (result.moved) {
    log(`CLOSE-ROWS: #${n} Status -> Done.`);
  } else if (result.notOnBoard) {
    log(`CLOSE-ROWS: #${n} is not on the Project -- no Status to move.`);
  } else {
    log(`CLOSE-ROWS: #${n} CLOSED but Status NOT moved -- ${result.reason}`);
  }
}
