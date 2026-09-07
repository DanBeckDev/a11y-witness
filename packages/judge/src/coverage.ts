/**
 * WHICH WCAG criteria the shipped assessors can return a finding for.
 *
 * Needed because WCAG Conformance Requirement 1 is about a LEVEL: to say anything about Level AA you must
 * have assessed every AA criterion. We assess a MINORITY of them, so the only honest statement is the
 * count plus "the rest are unchecked, not clean" — and that statement is worthless if this list drifts
 * from what actually ships.
 *
 * The count is deliberately not written here. `assessedCriteria().length` is the number, and the last
 * numeral in this header said EIGHT while the answer was fourteen — in the file whose entire job is to
 * stop coverage claims going stale. `local-judge.ts` states the rule this violated: "a number in prose is
 * a number that stops being true". `criteria-counts-are-not-spelled-out.test.ts` now refuses one.
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
 *
 * A HEAD EXISTING IS NOT THE SAME AS THE MODEL DECIDING. The five added on 2026-08-25 —
 * 2.1.1, 2.1.2, 2.4.1, 2.4.2, 2.4.3 — are all `decisionOwner: deterministic-rules` in the shipped report:
 * the rules layer owns the verdict and the head is trained alongside it, scored but not authoritative.
 * They belong here because this list answers "is there a head", which `generate-coverage-doc.ts` uses to
 * distinguish "a rule decides all of it" from "there is no head at all" — opposite answers.
 *
 * No coverage claim widens as a result: `RULE_CRITERIA` below already lists four of the five, and
 * `assessedCriteria()` is the UNION, so what the tool reports it can assess is unchanged.
 */
export const SCORED_CRITERIA = [
  "1.1.1", "1.3.1", "2.1.1", "2.1.2", "2.4.1", "2.4.2", "2.4.3",
  // 3.3.3 has a head from 2026-09-02 and the RULE decides it. Both are true and the list means the first:
  // its records stay in the model (they are `decidedBy: "rules"`, not `unavailable`), so the trainer fits
  // a head, and `RULE_SUBSTITUTED_SUBTYPES` makes that head non-blocking because the rule is exact.
  // Listing it answers "is there a head" honestly; `RULE_CRITERIA` below answers who decides.
  // 3.2.1 and 3.2.2 joined on 2026-09-02, once the protocol-14 retrain had actually produced their heads
  // — this list must equal the SHIPPED model's own criteria and a test asserts it against
  // training-report.json, so adding them earlier would have failed for the right reason. Both are ALSO in
  // `RULE_CRITERIA`: the rules decide them and the heads are substituted, which is the same shape as
  // 3.3.3 and answers a different question than this list does.
  // v19, 2026-09-06: 3.3.2 OUT, 1.4.13 and 2.4.7 IN — and this list must move WITH the weights, in the
  // same commit, or whichever lands first breaks `main`. That is what `coverage.test.ts` enforces
  // ("SCORED_CRITERIA must match training-report.json — retraining changed what ships"), and it is the
  // head-set gate this project spent an evening wishing it had: it already existed and had simply not yet
  // run against v19.
  //
  // 3.3.2's head went because the SUBTYPE went. `3.3.2:unnamed-form-field` was retired on 2026-09-05 —
  // W3C does not require a label to be ASSOCIATED for 3.3.2, that is 1.3.1 — and those cases had always
  // declared 4.1.2 as well, so no records moved and none were lost (1,613 v18 positives excluding the
  // retired head against 1,616 in v19). v18 went on fitting a head for a subtype nothing else recognised,
  // which is why the loss reads as a regression and is the opposite: **the head was the stale copy.**
  //
  // THE CRITERION IS NOT UNCOVERED. `RULE_CRITERIA` below still carries 3.3.2 — the rule reports an
  // unnamed field under both 3.3.2 and 4.1.2 since ADR 0017 — so `assessedCriteria()`, which is the UNION,
  // is unchanged for it. This list answers "is there a head"; that one answers "who decides".
  "2.4.4", "2.4.6", "1.4.13", "2.4.7", "3.2.1", "3.2.2", "3.3.1", "3.3.3", "4.1.2", "4.1.3",
] as const;

/**
 * Criteria the deterministic rule layer can emit, which is a strict subset of the above.
 *
 * NOT a subset of `SCORED_CRITERIA` any more. 1.4.2 Audio Control is rule-only: it is read from the DOM
 * (`autoplay` and `muted` are attributes with no accessibility-tree equivalent) and the trained scorer has
 * no head for it. That is why `assessedCriteria()` is a UNION rather than the scorer's list — a criterion
 * covered by a rule alone is still covered, and reporting it as untested would be the mirror of the
 * over-claim this file exists to prevent.
 *
 * 1.4.13 joined 1.4.2 here on 2026-09-05, and deliberately not `SCORED_CRITERIA`: the corpus's single
 * subtype (`focus-panel-undismissable`) is a direct read off `focusRevealVerdict`, not an inference, so it
 * moved to the rules on ADR 0021's own precedent rather than waiting on a head that 12 positives could
 * never calibrate. No shipped `training-report.json` has a "1.4.13" key yet; adding it here would fail
 * `coverage.test.ts`'s parity check for a head that has never shipped.
 *
 * 2.4.7 joined 2026-09-06, rules-owned but `secondary`/`cantTell`, never `SCORED_CRITERIA` — no corpus case
 * exists to train a head on and `focusEventVerdict`'s pair-timing observation (`rules.ts`'s
 * `addFocusEventFindings`) is an INFERENCE about a visible indicator, not a read of one, which is exactly
 * the shape `mapping` exists to mark as correlated-but-not-proving.
 *
 * **3.3.2 was missing from this list until 2026-08-24**, while `addUnnamedFormFields` was firing on 265
 * corpus captures and 6 real ones. Nothing caught it because the only consumer was `assessedCriteria()`,
 * which UNIONS this with `SCORED_CRITERIA` — and 3.3.2 is in that — so the union stayed correct and the
 * error had no visible consequence. It acquired one the moment `audit-rule-coverage.ts` began asking
 * "which of these has never fired?", because a criterion absent from the list is one the audit never asks
 * about. `add()` in `rules.ts` now throws on an unlisted criterion, so this cannot go stale silently again.
 */
export const RULE_CRITERIA = ["1.1.1", "1.3.1", "1.4.2", "1.4.13", "2.1.1", "2.1.2", "2.4.1", "2.4.2",
  "2.4.3", "2.4.4", "2.4.7", "3.2.1", "3.2.2", "3.3.2", "3.3.3", "4.1.2"] as const;

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
