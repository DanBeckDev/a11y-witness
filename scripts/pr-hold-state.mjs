// @ts-check
/**
 * A HOLD MEANS "CANNOT MERGE", AND ONE PLACE DECIDES WHETHER A PR IS HELD.
 *
 * #645. On 2026-09-09 a ruling changed an open PR's required shape at 09:05Z and `auto-arm` merged the
 * pre-correction commit at 09:16Z. The proposed remedy was `pr:hold`, on the stated ground that the queue
 * already refuses a held PR. **Demonstrating that instead of citing it is what found the hole**, and
 * there were three:
 *
 *   1. `auto-arm-sweep.mjs` refuses to ARM a held PR. True — and it is the only place that does.
 *   2. `auto-arm.yml`'s per-PR `arm` job gates on `draft == false && base.ref == 'main'` and NOTHING
 *      else, then runs `gh pr merge --auto` unconditionally. It re-arms a held PR on its next event.
 *   3. **Nothing disarms.** `git grep "disable-auto"` over the whole tree was EMPTY. Once auto-merge is
 *      enabled GitHub completes it the moment the required checks go green, and no label is consulted at
 *      that point — by GitHub or by us.
 *
 * So a hold taken at 09:05 on a PR armed at 09:00 changes a label and nothing else. **The hold stopped
 * ARMING; the actor to stop was MERGING-ONCE-ARMED.** The mechanism would have been ruled, built,
 * believed, and silent on the exact incident it was written for.
 *
 * ## Why this module exists rather than a second `if`
 *
 * The hole opened because *"is this PR held"* was written twice and only one copy was correct. Adding the
 * missing check to the `arm` job would make it two correct copies, which is the same shape with a longer
 * fuse — this repository's own most-recorded defect, and `sweepDecision`'s own header already says why a
 * predicate must not live in `run:` bash. So both callers read this.
 */

/** The label prefix that IS a hold on a PR — `merge-guard`, `row-claim` and the sweep all read it. */
const HOLD_PREFIX = "session:";

/**
 * Who is holding this PR, if anybody.
 * @param {string[]} labels
 * @returns {string[]}
 */
export function holdersOf(labels) {
  return labels.filter((l) => l.startsWith(HOLD_PREFIX));
}

/**
 * May anything ARM this PR? One answer for the sweep and for the per-PR job.
 *
 * `reason` NAMES THE RULING, NOT THE STATE, when one was recorded. "Held" sends a reader to the label;
 * "held by ceo's ruling of 09:05Z — the guard keys on the field name, not the path" sends them to the
 * thing they must do. Two different faults must not print the same word, and two different REASONS for
 * one state must not either.
 *
 * @param {{ labels: string[], holdReason?: string | null }} pr
 * @returns {{ arm: boolean, reason: string }}
 */
export function armabilityOf({ labels, holdReason = null }) {
  const holders = holdersOf(labels);
  if (holders.length === 0) return { arm: true, reason: "not held" };
  return {
    arm: false,
    reason: holdReason
      ? `held by ${holders.join(", ")}: ${holdReason}`
      : `held by ${holders.join(", ")} -- on a PR the \`${HOLD_PREFIX}\` label IS the hold (#266), and no `
        + "reason was recorded with it. A hold whose reason nobody wrote down is one the next person "
        + "carrying this PR current will drop in good faith",
  };
}

/**
 * THE LABEL THAT SAYS THE HOLD IS WHAT DISARMED THIS PR.
 *
 * `takeHold` disarms unconditionally, so on release the two states it must tell apart -- "this PR was
 * armed and I turned it off" and "this PR was never armed" -- have the same end state and are gone by
 * the time anyone releases. The take records which one it found, because the release cannot recover it,
 * and re-arming a PR nobody armed would be arming in the dangerous direction.
 *
 * A LABEL rather than anything in this process, because the take and the release are different
 * processes, often different sessions, often hours apart. The PR is the only thing both can read.
 */
export const REARM_LABEL = "rearm-on-release";

/**
 * ARM IS VERIFIED FROM THE STATE, NEVER THE EXIT CODE -- the mirror of `disarmVerdict` below, and it
 * exists because arming has the SAME asymmetry pointed the other way.
 *
 * `gh pr merge --auto --squash` returned `Merge method squash merging is not allowed on this repository`
 * on 2026-09-09 and the caller saw only a non-zero exit, because stderr was redirected; the PR sat
 * UNARMED with nothing in the log, and an unarmed PR is indistinguishable from an armed one until the
 * queue fails to take it. Reading `autoMergeRequest` back is what caught it.
 *
 * @param {{ autoMergeRequest?: unknown } | null} prAfterArm
 * @returns {{ armed: boolean, reason: string }}
 */
export function armVerdict(prAfterArm) {
  if (prAfterArm?.autoMergeRequest != null) {
    return { armed: true, reason: "auto-merge is back on: `autoMergeRequest` reads non-null" };
  }
  return {
    armed: false,
    reason: "THE HOLD IS OFF AND THE PR IS STILL UNARMED. The hold disarmed it and the release did not "
      + "put it back, so it will sit green and unmerged with nothing marking it as waiting -- a hold "
      + "that outlived its reason, and invisible, which is the pair this file exists to prevent. Re-arm "
      + "by hand with `gh pr merge --auto --merge <n>` and read `autoMergeRequest` back.",
  };
}

/**
 * Did the disarm actually take? **READ THE STATE, NEVER THE EXIT CODE.**
 *
 * `gh pr merge --disable-auto` returns success on a PR that is already merging, having changed nothing —
 * a verification sharing a failure mode with the action, which this repository has paid for before:
 * reading a guest's hash through the same `exec` channel that was broken returned EMPTY rather than
 * MISMATCHED, and empty read as a flaky tool rather than a failed deploy.
 *
 * A hold that labelled and failed to disarm is the most dangerous of the three states, because it LOOKS
 * held.
 *
 * @param {{ autoMergeRequest: unknown }} prAfterDisarm as read back from the API
 * @returns {{ disarmed: boolean, reason: string }}
 */
export function disarmVerdict(prAfterDisarm) {
  if (prAfterDisarm?.autoMergeRequest == null) {
    return { disarmed: true, reason: "auto-merge is off: `autoMergeRequest` is null" };
  }
  return {
    disarmed: false,
    reason: "THE LABEL IS ON AND AUTO-MERGE IS STILL ARMED. This PR will merge the moment its checks go "
      + "green, and it now LOOKS held to anyone reading the label. Disarm it by hand with "
      + "`gh pr merge --disable-auto <n>` and read `autoMergeRequest` back, or remove the label so the "
      + "state is at least honest.",
  };
}
