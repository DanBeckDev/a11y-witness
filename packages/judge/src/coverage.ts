/**
 * WHICH WCAG criteria the shipped assessors can return a finding for.
 *
 * Needed because WCAG Conformance Requirement 1 is about a LEVEL: to say anything about Level AA you must
 * have assessed every AA criterion. We assess eight of fifty-five, so the only honest statement is the
 * count plus "the rest are unchecked, not clean" — and that statement is worthless if this list drifts
 * from what actually ships.
 *
 * So it is pinned by `coverage.test.ts` against two things at once: the trained model's own
 * `training-report.json`, and the criteria the deterministic rules can emit. Retrain with a new head and
 * the test fails until this list is updated. That is the point — a coverage claim maintained by hand is a
 * coverage claim that goes stale, and this one is load-bearing for every conformance statement we print.
 *
 * Deliberately NOT derived at runtime from the scorer's output: the scorer abstains on pages unlike its
 * training data and returns nothing at all, and the criteria it COULD have scored must still be reported
 * on such a page. Coverage is a property of the shipped model, not of one run.
 */

/**
 * Criteria the trained scorer has a head for. Must equal the keys of `criteria` in the shipped
 * `training-report.json`.
 */
export const SCORED_CRITERIA = [
  "1.1.1", "1.3.1", "2.4.4", "2.4.6", "3.3.1", "3.3.2", "4.1.2", "4.1.3",
] as const;

/**
 * Criteria the deterministic rule layer can emit, which is a strict subset of the above.
 *
 * NOT a subset of `SCORED_CRITERIA` any more. 1.4.2 Audio Control is rule-only: it is read from the DOM
 * (`autoplay` and `muted` are attributes with no accessibility-tree equivalent) and the trained scorer has
 * no head for it. That is why `assessedCriteria()` is a UNION rather than the scorer's list — a criterion
 * covered by a rule alone is still covered, and reporting it as untested would be the mirror of the
 * over-claim this file exists to prevent.
 */
export const RULE_CRITERIA = ["1.1.1", "1.3.1", "1.4.2", "2.1.2", "2.4.2", "2.4.4", "4.1.2"] as const;

/** Everything the shipped judge can return a finding for, deduplicated and sorted. */
export function assessedCriteria(): string[] {
  return [...new Set([...SCORED_CRITERIA, ...RULE_CRITERIA])].sort();
}

/**
 * The criterion NUMBER from a finding's WCAG label: "1.1.1 Non-text Content" -> "1.1.1".
 *
 * Here, and exported, because three call sites had grown three spellings — `split(" ")[0]`,
 * `split(/\s+/)[0]` and a `startsWith` prefix test — which disagree the moment a label contains a tab or
 * a double space. Divergence would not fail loudly: a finding that stops matching its criterion silently
 * downgrades that criterion from `failed` to `passed`, which is the one direction this project cannot
 * afford to be wrong in.
 */
export function criterionNumber(wcag: string | undefined): string {
  return String(wcag ?? "").trim().split(/\s+/)[0];
}
