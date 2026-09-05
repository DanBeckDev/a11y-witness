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
 * kind here to be right or wrong about?" for every criterion we cover, and its table carries rationale measured
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
   * WHICH assessor produced this, when it was not the screen-reader layer.
   *
   * ADR 0021's subject is that the layer which DECIDES must be the layer allowed to CLAIM, and this is
   * that distinction reaching the report. A criterion answered by a rule engine reading the DOM and one
   * answered by driving a real screen reader are different claims resting on different evidence, and
   * merging them into an undifferentiated "assessed" would undo the separation this project exists to
   * make. Absent means the screen-reader layer, which is the default assessor here.
   *
   * It is also what EARL wants: `earl:assertedBy` names an assertor per assertion, so a report with two
   * assessors is already expressible and was being flattened to one.
   */
  assessor?: string;
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
// 3.3.3 joined 1.4.2 on 2026-09-02. Its evidence is `formChanges` and `postSubmitFields` — the form
// probe's own output, not a quick-nav sweep — so no sweep can truncate it and there is no completeness
// caveat to raise. DECLARED rather than left out of `SWEEPS_FEEDING`, because this repo's rule is that
// "nothing needs this" and "somebody forgot" must stay different states: an omission reads as the second.
// 3.2.1 and 3.2.2 joined on 2026-09-02. Both read a probe's own before/after title pair, not a quick-nav
// sweep, so no sweep can truncate them and there is no completeness caveat to raise.
// 1.4.13 joined on 2026-09-05. Its evidence is `focusRevealVerdict`'s own verdict -- three censuses and
// two focus reads the worker already computed -- not a quick-nav sweep, so the same reasoning applies.
export const NOT_SWEEP_DERIVED: readonly string[] = ["1.4.2", "3.2.1", "3.2.2", "3.3.3", "1.4.13"];

const SWEEPS_FEEDING: Record<string, readonly string[]> = {
  "1.1.1": ["graphic"],
  // Not a quick-nav sweep, but it truncates the same way: the probe stops after a fixed number of Tab
  // presses, and a trap past that point was never looked for.
  "2.1.2": ["focusOrder"],
  // Both sequences it compares. A starved formField sweep shortens the reading order and a truncated focus
  // probe shortens the tab order; either way "never reached" stops meaning "unreachable".
  "2.1.1": ["formField", "focusOrder"],
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

/**
 * What a rule engine concluded about one criterion.
 *
 * These are axe's OWN buckets rather than a confidence we invented, which matters: axe already separates
 * what it is sure of (`violations`) from what it wants a human to look at (`incomplete`), so the dividing
 * line between "assert" and "refer" is the engine's own judgement and not ours.
 */
export type RuleLayerVerdict = "violated" | "needsReview" | "clean";

/**
 * Criterion -> what the rule layer found. ONLY criteria it actually ran a rule for appear.
 *
 * Absence is the whole point and it is load-bearing twice over. A criterion missing from this map was
 * never examined by the rule layer, which is a different fact from one it examined and found clean — the
 * distinction this repo has paid for a dozen times, arriving at the report boundary. And it is genuinely
 * unknowable on one supported path: an imported `--axe-results` file frequently carries `violations` and
 * nothing else, so a criterion with no violation in such a file may have been checked and passed, or never
 * checked at all. On that path only violated criteria are recorded, and the rest stay untested — which is
 * the honest answer rather than the flattering one.
 */
export type RuleLayerCoverage = Readonly<Record<string, RuleLayerVerdict>>;

export interface OutcomeInput {
  capture: CaptureEvidence;
  /**
   * The SECOND assessor. Criteria the rule layer (axe-core) examined, and what it concluded.
   *
   * Without this the report told a provable untruth: `criterionOutcomes` built its covered-set from
   * `assessedCriteria()`, which is pinned to the trained model plus our own deterministic rules — the
   * screen-reader layer only — so every criterion outside it printed "No assessor in this tool covers
   * this criterion" even in a run where axe had just checked it. The CLI runs axe BY DEFAULT and prints
   * "rule-based axe-core + real screen reader" as it starts, so the tool was contradicting itself within
   * one run. A missing capability is a gap; a false claim about our own coverage is worse.
   */
  ruleLayer?: RuleLayerCoverage;
  /**
   * Per-type sweep completeness from `oracleCounts`, the SECOND way a sweep can be short.
   *
   * `truncatedSweeps` reads a sweep's own STOP REASON: it says "I gave up". Completeness compares what the
   * sweep announced against what the browser exposes, and catches the case where the sweep stopped
   * cleanly and still missed something — which is the norm, not the exception. Quick navigation cannot
   * reach a landmark containing the caret, so `structure.landmarks` misses a page-wrapping `<main>` on
   * 2,063 of 2,064 corpus captures, every one of which reported "examined in full".
   */
  completeness?: Readonly<Record<string, string>>;
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

/**
 * Sweep label -> the census type its completeness is measured against.
 *
 * `formField` maps to `formControl` because the census counts the roles NVDA's form-field quick-nav
 * actually visits — buttons included — which the DOM's narrower `formField` does not. `list`,
 * `routeChange` and `focusOrder` have no census type, so nothing is claimed about them here; that is the
 * same honesty `sweepCoverage` applies, and an invented denominator would be worse than an omission.
 */
const COMPLETENESS_OF: Readonly<Record<string, string>> = {
  heading: "heading", link: "link", landmark: "landmark", graphic: "graphic", formField: "formControl",
};

/**
 * Which of this criterion's sweeps DISAGREE with the browser's own count?
 *
 * `unknown` is deliberately not incomplete — every capture predating the counter reports it, and treating
 * it as incompleteness would turn the whole corpus `cantTell` overnight. The same trade C2 makes, for the
 * same reason.
 *
 * @param criterion the WCAG criterion number
 * @param completeness per-type verdicts from `oracleCounts`
 * @returns the sweep names whose completeness is `truncated` or `phantom`
 */
function incompleteFeeds(criterion: string, completeness: Readonly<Record<string, string>>): string[] {
  return (SWEEPS_FEEDING[criterion] ?? []).filter((sweep) => {
    const verdict = completeness[COMPLETENESS_OF[sweep] ?? ""];
    return verdict === "truncated" || verdict === "phantom";
  });
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
  // THE SECOND TRUNCATION SOURCE, and the one that fires on a healthy-looking capture. A sweep that ended
  // cleanly can still have missed elements — the caret rule alone costs one per type, per position — and
  // before this, such a capture reported "examined in full".
  const short = incompleteFeeds(criterion, input.completeness ?? {});
  if (short.length) {
    return {
      criterion, outcome: "cantTell",
      reason: `The ${short.join(" and ")} sweep announced a different number of elements than the browser `
        + "exposes, so this criterion rests on an examination known to be partial.",
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
 * ALL of them are returned, not just the ones we cover. The rest come back as `untested`,
 * which is the point: a consumer reading a list of eight and inferring the rest are fine is the failure
 * this exists to prevent, and ACT has a word for it.
 */
export function criterionOutcomes(input: OutcomeInput): CriterionOutcome[] {
  const covered = new Set(assessedCriteria());
  return WCAG_22_AA.map(({ num }) => covered.has(num)
    ? outcomeFor(num, input)
    : ruleLayerOutcome(num, input.ruleLayer?.[num]));
}

/**
 * The outcome for a criterion the screen-reader layer does not cover.
 *
 * A CLEAN rule result is deliberately `cantTell` and never `passed`, and that is the one judgement in
 * this function worth defending. Reporting `passed` because a rule engine found no violation is the
 * "false assurance" the accessibility literature names directly — *Inclusive Design for Accessibility*
 * puts it as an automated tool confirming that alt text is PRESENT while saying nothing about whether it
 * is meaningful. The numbers say the same: Deque's study across 13,000+ pages measures automated coverage
 * at 57% of ISSUES, and separately notes that only 16 of the 50 WCAG 2.1 AA criteria are machine-evaluable
 * at all. So "axe found nothing" supports "not shown to fail", never "satisfied".
 *
 * That is not a downgrade from what this reported before. `untested` said the tool had not looked; the
 * tool HAD looked. `cantTell` with the reason attached says what was actually done, which is strictly
 * more information and — unlike the sentence it replaces — true.
 */
function ruleLayerOutcome(criterion: string, verdict: RuleLayerVerdict | undefined): CriterionOutcome {
  if (verdict === "violated") {
    return {
      criterion, outcome: "failed", assessor: RULE_LAYER,
      reason: "The rule layer (axe-core) reported a violation of this criterion. It is a DOM-level rule "
        + "result, not a screen-reader observation.",
    };
  }
  if (verdict === "needsReview") {
    return {
      criterion, outcome: "cantTell", assessor: RULE_LAYER,
      reason: "The rule layer (axe-core) could not decide this criterion and flagged it for review, "
        + "which is axe's own signal that a human should look.",
    };
  }
  if (verdict === "clean") {
    return {
      criterion, outcome: "cantTell", assessor: RULE_LAYER,
      reason: "The rule layer (axe-core) ran its rules for this criterion and found no violation. "
        + "Automated rules cover only part of any criterion, so this is not shown to fail — which is not "
        + "the same as satisfied.",
    };
  }
  return {
    criterion, outcome: "untested",
    reason: "No assessor in this tool covers this criterion. It is unchecked, not clean.",
  };
}

/** Named once. It appears in three outcomes and in the EARL assertor, and a retyped string drifts. */
const RULE_LAYER = "axe-core";

/** How many criteria landed on each outcome, for a one-line summary. */
export function outcomeTally(outcomes: readonly CriterionOutcome[]): Record<ActOutcome, number> {
  const tally: Record<ActOutcome, number> = {
    failed: 0, cantTell: 0, passed: 0, inapplicable: 0, untested: 0,
  };
  for (const { outcome } of outcomes) tally[outcome] += 1;
  return tally;
}
