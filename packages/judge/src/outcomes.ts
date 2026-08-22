/**
 * Per-criterion outcomes in the vocabulary of the W3C's ACT Rules Format.
 *
 * ACT defines FIVE outcomes — `inapplicable`, `passed`, `failed`, `cantTell`, `untested` — and this tool
 * emitted only findings, which is `failed` and nothing else. So "0 findings" silently meant any of four
 * different things:
 *
 *   passed        we checked and the page is fine
 *   inapplicable  there is nothing of that kind on the page to be right or wrong about
 *   cantTell      we could not determine it — the scorer abstained, or a sweep stopped early
 *   untested      no assessor of ours covers that criterion at all
 *
 * Collapsing those into one number is the exact defect this project fights everywhere else. `local-judge`
 * already says "unchecked, not clean" in prose and axe's absence is already distinguished from a clean
 * scan; ACT supplies the standard vocabulary to say it per criterion, machine-readably, so a CI consumer
 * can act on it.
 *
 * **Applicability is NOT redefined here.** `hasEvidenceFor` already answers "is there anything of the right
 * kind here to be right or wrong about?" for all eight criteria, and its table carries rationale measured
 * the hard way — Wikipedia navigating on submit, apache.org's search toggle that submitted nothing. A
 * second applicability table would drift from that one, and the drift would be silent.
 *
 * Specification: https://www.w3.org/TR/act-rules-format/
 */
import { WCAG_22_AA } from "@a11y-witness/evidence/wcag";

import { assessedCriteria, criterionNumber } from "./coverage.js";
import { hasEvidenceFor, type CaptureEvidence } from "./local-judge.js";
import type { RequirementMapping } from "./judge.js";

/** ACT's five outcomes. https://www.w3.org/TR/act-rules-format/#output-outcome */
export type ActOutcome = "inapplicable" | "passed" | "failed" | "cantTell" | "untested";

export interface CriterionOutcome {
  /** The criterion number, e.g. "1.1.1". */
  criterion: string;
  outcome: ActOutcome;
  /**
   * Why this outcome, in one sentence. Required for EVERY outcome including `passed`, because "passed"
   * without saying what was checked is the same unearned reassurance as a bare "0 findings".
   */
  reason: string;
}

/**
 * Which structural sweeps a criterion's evidence comes from.
 *
 * Used only to turn a TRUNCATED sweep into `cantTell`. If the link sweep stopped at its step cap, we do
 * not know whether an unclear link sits past that point — so 2.4.4 is undetermined, not passed. This is
 * WCAG Conformance Requirement 2 (Full pages) expressed per criterion: an examination that stopped before
 * the page did cannot support a claim about the whole page.
 *
 * `type` values are the sweep labels recorded in the capture's `sweep` diagnostics.
 */
/**
 * Criteria whose evidence does NOT come from a structural sweep, so a truncated sweep says nothing about
 * them. 1.4.2 is read from the DOM in one query that either ran or did not.
 *
 * Listed explicitly rather than defaulted, so that a criterion missing from BOTH tables is a mistake the
 * parity test can catch — the alternative silently disables the truncation guard for it.
 */
export const NOT_SWEEP_DERIVED: readonly string[] = ["1.4.2"];

const SWEEPS_FEEDING: Record<string, readonly string[]> = {
  "1.1.1": ["graphic"],
  // Not a quick-nav sweep, but it truncates the same way: the probe stops after a fixed number of Tab
  // presses, and a trap past that point was never looked for.
  "2.1.2": ["focusOrder"],
  // Also not a quick-nav sweep. The route probe reaches a navigation control with `moveToNextLink`, so a
  // page whose link sweep starved is one where it may never have found a link to activate — and "we did
  // not reach a link" must read as unchecked, not as a page that navigates correctly.
  // The link sweep reaches the skip link, and the focus probe supplies the ordinary tab order it is compared
  // against. Starve either and the two sequences stop describing the same page.
  "2.4.1": ["link", "focusOrder", "routeChange"],
  "2.4.2": ["link", "routeChange"],
  // Both channels it compares. A starved formField sweep means the reading order is a PREFIX, and a
  // truncated focus probe means the tab order is — either way the two sequences are no longer describing
  // the same set of controls, and a difference between them stops being evidence of anything.
  "2.4.3": ["formField", "focusOrder"],
  "1.3.1": ["heading", "landmark", "list"],
  "2.4.4": ["link"],
  "2.4.6": ["heading", "formField"],
  "3.3.2": ["formField"],
  "4.1.2": ["formField"],
  // Both interaction criteria are read from the post-submit re-read, which is the sweep that was found
  // hitting `deadline` on real pages — the case that motivated reporting `cantTell` at all.
  "3.3.1": ["postSubmit"],
  "4.1.3": ["postSubmit"],
};

export interface OutcomeInput {
  capture: CaptureEvidence;
  /**
   * Findings produced by any layer. `wcag` starts with the criterion number; `mapping` says whether a
   * failure asserts non-conformance, and absent means `secondary` — see `RequirementMapping`.
   */
  findings: readonly { wcag?: string; mapping?: RequirementMapping }[];
  /**
   * True when the trained scorer declined to score this capture because it is unlike anything it was
   * validated on. Nothing was scored, so every criterion it covers is undetermined rather than clean.
   */
  abstained?: boolean;
  /** Sweeps that stopped before the page ran out of elements. */
  truncatedSweeps?: readonly { type: string }[];
}

/** Did a truncated sweep feed this criterion? Returns the sweep names, so the reason can name them. */
function truncatedFeeds(criterion: string, truncated: readonly { type: string }[]): string[] {
  const feeding = SWEEPS_FEEDING[criterion] ?? [];
  return [...new Set(truncated.map((s) => s.type).filter((type) => feeding.includes(type)))];
}

/**
 * Is there anything on this page for the criterion to be about?
 *
 * Mostly delegates to `hasEvidenceFor`, which is the applicability table the scorer already uses. The
 * exception is 1.4.2, which is rule-only: its evidence is a DOM query, and a capture taken before that
 * probe existed carries no `media` field at all. "The probe did not run" and "there is no media" must not
 * collapse into one answer — the first is `cantTell` and the second is `inapplicable`.
 */
function applicabilityOf(criterion: string, capture: CaptureEvidence): "applicable" | "empty" | "notProbed" {
  if (criterion === "1.4.2") {
    if (capture.media === undefined) return "notProbed";
    return capture.media.length > 0 ? "applicable" : "empty";
  }
  // 2.1.2 needs the focus probe. It was reachable from nothing at all until recently, so most captures
  // carry no `focusOrder` — and "we never tabbed" must not read as "there is no trap".
  if (criterion === "2.1.2") {
    const stops = capture.interaction?.focusOrder;
    if (stops === undefined) return "notProbed";
    return stops.length > 0 ? "applicable" : "empty";
  }
  return hasEvidenceFor(criterion, capture) ? "applicable" : "empty";
}

/**
 * The outcome for ONE criterion we cover, in precedence order.
 *
 * The order is the whole design, so each step says why it beats the next:
 *
 * 1. A finding outranks everything. Evidence of a failure stands even if the sweep that found it was
 *    later truncated — there may be more, but what we found is real.
 * 2. Abstention beats applicability. When the scorer declines, nothing was scored, and that includes the
 *    criteria a deterministic rule also touches: a rule covers part of a criterion, so a silent rule plus
 *    an absent scorer is not a pass.
 * 3. Truncation beats applicability. "We stopped early and saw none" must never become "there are none".
 * 4. Only then may an empty channel mean `inapplicable`, which is ACT's "nothing here to judge".
 */
function outcomeFor(criterion: string, input: OutcomeInput): CriterionOutcome {
  const failed = input.findings.filter((f) => criterionNumber(f.wcag) === criterion);
  // Only a CONFORMANCE-mapped failure may say the criterion is not satisfied. ACT is explicit that a
  // secondary-mapped rule "could" indicate non-conformance, which is `cantTell` — the finding is real and
  // still reported, but the rule is stricter or looser than the criterion, so asserting from it would be
  // an accusation the standard itself does not support. "click here" is the case that proves it: 2.4.4
  // permits the purpose to come from surrounding context we cannot see.
  const asserted = failed.filter((f) => f.mapping === "conformance");
  if (asserted.length) {
    return {
      criterion, outcome: "failed",
      reason: `${asserted.length} finding(s) whose evidence establishes this criterion is not satisfied.`,
    };
  }
  if (failed.length) {
    return {
      criterion, outcome: "cantTell",
      reason: `${failed.length} finding(s) indicate a possible failure, but the rules that produced them `
        + "are stricter or looser than the criterion, so this needs human confirmation.",
    };
  }
  if (input.abstained) {
    return {
      criterion, outcome: "cantTell",
      reason: "The trained scorer abstained: this page is unlike the evidence it was validated on, so "
        + "nothing was scored for this criterion.",
    };
  }
  const stalled = truncatedFeeds(criterion, input.truncatedSweeps ?? []);
  if (stalled.length) {
    return {
      criterion, outcome: "cantTell",
      reason: `The ${stalled.join(" and ")} sweep stopped before the page did, so content past that point `
        + "was never examined for this criterion.",
    };
  }
  const applies = applicabilityOf(criterion, input.capture);
  if (applies === "notProbed") {
    return {
      criterion, outcome: "cantTell",
      reason: "The evidence this criterion needs was not collected on this capture, so it is undetermined "
        + "rather than clean.",
    };
  }
  if (applies === "empty") {
    return {
      criterion, outcome: "inapplicable",
      reason: "The page exposed nothing of the kind this criterion is about, so there is nothing to be "
        + "right or wrong about.",
    };
  }
  return {
    criterion, outcome: "passed",
    reason: "Content of the relevant kind was examined in full and no failure was found.",
  };
}

/**
 * Every WCAG 2.2 A/AA criterion with its ACT outcome for this run.
 *
 * All 55 are returned, not just the eight we cover. The 47 we cannot assess come back as `untested`,
 * which is the point: a consumer reading a list of eight and inferring the rest are fine is the failure
 * this exists to prevent, and ACT has a word for it.
 */
export function criterionOutcomes(input: OutcomeInput): CriterionOutcome[] {
  const covered = new Set(assessedCriteria());
  return WCAG_22_AA.map(({ num }) => covered.has(num)
    ? outcomeFor(num, input)
    : {
      criterion: num, outcome: "untested" as const,
      reason: "No assessor in this tool covers this criterion. It is unchecked, not clean.",
    });
}

/** How many criteria landed on each outcome, for a one-line summary. */
export function outcomeTally(outcomes: readonly CriterionOutcome[]): Record<ActOutcome, number> {
  const tally: Record<ActOutcome, number> = {
    failed: 0, cantTell: 0, passed: 0, inapplicable: 0, untested: 0,
  };
  for (const { outcome } of outcomes) tally[outcome] += 1;
  return tally;
}
