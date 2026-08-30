/**
 * The report a person reads, as lines of text.
 *
 * Separated from printing it because this is the product's output — the thing a user judges their
 * site by — and it was the only part of the CLI that could not be tested at all: `cli.ts` calls
 * `main()` on import, so importing it to check a heading runs a capture.
 *
 * Building the lines here and letting the CLI do nothing but `console.log` them is the Humble Object
 * pattern: the interesting half becomes a pure function, and the half that touches the world becomes
 * too small to hold a bug.
 */
import type { Judgment } from "@a11y-witness/judge";
import { taskVerdictLabel, judgeBackend } from "@a11y-witness/judge";
import type { AxeFinding } from "./scan/axe.js";
import { layerOf, orderByLayer, LAYER_LABEL, type ExperienceLayer } from "@a11y-witness/judge/layers";
import { notAConformanceClaim, type ConformanceRequirement }
  from "@a11y-witness/evidence/conformance";
import { outcomeTally, type CriterionOutcome } from "@a11y-witness/judge/outcomes";

/** How much offending markup to quote as evidence. Enough to recognise the element, not the page. */
const EVIDENCE_CHARS = 100;

export interface Report {
  url: string;
  task: string;
  screenReader: string;
  announcements: number;
  verdict: Judgment;
  /** null when the rule-based layer did not run — distinct from "ran and found nothing". */
  axe: AxeFinding[] | null;
  /**
   * What this run establishes against WCAG's five CONFORMANCE REQUIREMENTS (§5.2), which govern whether
   * a conformance claim is valid at all and are not success criteria. Optional so an older caller still
   * renders — but when it is absent the section says so rather than being silently dropped, because a
   * missing limit is exactly what makes a findings list read as a clean bill of health.
   */
  conformance?: ConformanceRequirement[];
  /**
   * Per-criterion ACT outcomes. Optional so an older caller still renders, but its absence is stated
   * rather than skipped — see `outcomesSection`.
   */
  outcomes?: CriterionOutcome[];
}

/**
 * The rule layer's section.
 *
 * "not run" and "0 violations" must never look alike: one means the visual criteria are unchecked,
 * the other means they were checked and passed. Reporting silence as a clean bill of health is the
 * single most misleading thing this tool could do.
 */
function axeSection(axe: AxeFinding[] | null): string[] {
  const lines = [
    "-- Rule-based layer (axe-core): contrast, colour, ARIA, parsing --",
    axe === null
      ? "not run. Visual criteria are unchecked, not clean."
      : `${axe.length} violation(s):`,
  ];
  for (const finding of axe ?? []) {
    lines.push(`  [${finding.impact}] ${finding.wcag.join(", ") || "(no SC)"}  ${finding.rule}: ${finding.help}`);
    if (finding.nodes[0]) lines.push(`     evidence: ${finding.nodes[0].html.slice(0, EVIDENCE_CHARS)}`);
  }
  return lines;
}

/**
 * The judge's findings, grouped by the Perceive -> Navigate -> Interact waterfall.
 *
 * Most fundamental first, because a page you cannot perceive is not worth reporting navigation
 * problems on.
 */
/**
 * Which assessor ran, from the judge's OWN resolver so the two cannot disagree.
 *
 * The comment here already claimed that and it was not true: this read the env var itself, defaulting
 * "local" in a second place. Four copies of that expression existed and one had drifted to `??`.
 */
function judgeLabel(): string {
  const backend = judgeBackend();
  return backend === "local" ? "trained scorer" : `${backend} judge`;
}

/**
 * The five conformance requirements, each as "established / not established".
 *
 * Printed on EVERY report, including one with no findings — that is the case it exists for. Success
 * criteria tell you what was found; these tell you what the run was capable of concluding, and WCAG
 * §5.2 is explicit that a claim needs all five. Requirement 2 in particular is why a truncated sweep
 * cannot be reported as a clean page.
 */
function conformanceSection(requirements: ConformanceRequirement[] | undefined): string[] {
  if (!requirements?.length) {
    return ["-- WCAG conformance requirements --",
      "  NOT REPORTED for this run, so nothing here should be read as full-page or full-process coverage."];
  }
  const lines = ["-- WCAG conformance requirements (§5.2) — what this run can and cannot conclude --"];
  for (const requirement of requirements) {
    lines.push(`  ${requirement.number}. ${requirement.name}`);
    lines.push(`     established: ${requirement.establishes}`);
    lines.push(`     limit:       ${requirement.limitation}`);
  }
  // Last, and unconditional. A document listing WCAG criteria, evidence and a date looks exactly like a
  // conformance claim to a reader who has not read §5.3 — and being mistaken for a certificate is the most
  // damaging way this output could be misread.
  const disclaimer = notAConformanceClaim();
  lines.push(`  ${disclaimer.name}`);
  lines.push(`     ${disclaimer.limitation}`);
  return lines;
}

/**
 * Per-criterion outcomes in the W3C ACT vocabulary.
 *
 * The reason this is worth printing next to the findings: a findings list answers "what is wrong", and
 * says nothing about the difference between checked-and-fine, nothing-of-that-kind-here, could-not-
 * determine, and never-evaluated. Four states, previously all rendered as the absence of a line.
 *
 * `passed` criteria are counted but not listed — the tally carries them, and listing 8 passes invites
 * exactly the "so the page is fine" reading the rest of this section exists to prevent. Everything that
 * is NOT a pass is named, because those are the ones a reader has to act on or account for.
 */
function outcomesSection(outcomes: CriterionOutcome[] | undefined): string[] {
  if (!outcomes?.length) {
    return ["-- Per-criterion outcomes (W3C ACT) --",
      "  NOT REPORTED for this run, so an absence of findings below distinguishes nothing."];
  }
  const tally = outcomeTally(outcomes);
  const lines = [
    "-- Per-criterion outcomes (W3C ACT vocabulary) --",
    `  failed ${tally.failed}   cantTell ${tally.cantTell}   passed ${tally.passed}   `
      + `inapplicable ${tally.inapplicable}   untested ${tally.untested}`,
    "  (cantTell = we could not determine it. untested = no assessor of ours covers it. Neither is clean.)",
  ];
  for (const outcome of outcomes.filter((o) => o.outcome === "failed" || o.outcome === "cantTell")) {
    lines.push(`    [${outcome.outcome}] ${outcome.criterion} — ${outcome.reason}`);
  }
  return lines;
}

/**
 * The one-line verdict, which must not appear to contradict the list underneath it.
 *
 * It printed `No blocking findings: yes` directly above three findings marked `[SERIOUS]`. Both were
 * accurate — `taskCompletable` is `!findings.some(f => f.severity === "blocker")`, and `serious` is a rung
 * below `blocker` — but nothing on the page said so, and a reader seeing "yes" over three SERIOUS lines has
 * to decide which of them is lying. Observed on the first real page this was ever pointed at.
 *
 * So the line states the count it is actually about. A number cannot contradict a list of the same things
 * the way a bare "yes" can.
 *
 * The LLM backends are untouched: there `taskCompletable` really does answer "could a screen-reader user
 * complete the task?", which is a yes/no question and reads correctly as one.
 */
function verdictHeadline(verdict: Judgment): string {
  const label = taskVerdictLabel();
  // CONFIDENCE DESCRIBES THE FINDINGS, so with none there is nothing for it to describe.
  //
  // `local-judge` defines it as `Math.min(...findings.map(f => f.confidence))` — "a report is only as good
  // as its shakiest claim" — and returns 1 when the list is empty. Printed, that became
  // `Findings at BLOCKER severity: none (overall confidence 1)`, which reads as certainty about the
  // ABSENCE. It is the same unearned reassurance as a bare "0 findings", in the line this function was
  // rewritten to stop making. The ACT tally below says what was and was not determined; this line should
  // not appear to answer it first.
  //
  // Abstention is unaffected: it returns 0 findings AND confidence 0, and its own sentence says nothing
  // was scored.
  const confidence = verdict.findings.length === 0 ? "" : ` (overall confidence ${verdict.confidence})`;
  if (label.isTaskClaim) {
    return `${label.question}: ${verdict.taskCompletable ? "yes" : "no"}${confidence}`;
  }
  const blockers = verdict.findings.filter((f) => f.severity === "blocker").length;
  const rest = verdict.findings.length - blockers;
  const others = rest ? `; ${rest} finding(s) below that severity` : "";
  return `Findings at BLOCKER severity: ${blockers === 0 ? "none" : blockers}${others}${confidence}`;
}

/**
 * How far this page sat from the evidence the scorer was validated on.
 *
 * Printed whether or not the scorer declined, because those are the two answers a support region exists to
 * separate and only one of them used to be visible. A page scored at the very edge of the distribution and
 * one comfortably inside it produced identical reports.
 *
 * Silent for the LLM backends, which have no support region, and it says so when an artifact ships no
 * reference — unknown must not read as safe.
 */
function noveltyLine(verdict: Judgment): string[] {
  const novelty = verdict.novelty;
  if (!novelty) return [];
  if (novelty.inSupport === null || novelty.nearestTrainingCosine == null) {
    return ["Support: NOT MEASURED — this scorer artifact ships no reference distribution, so nothing "
      + "checked whether the page resembles what it was validated on."];
  }
  const verdictWord = novelty.inSupport ? "within" : "OUTSIDE";
  return [`Support: ${verdictWord} the scorer's validated range `
    + `(nearest training similarity ${novelty.nearestTrainingCosine}, floor ${novelty.floor ?? "?"}).`];
}

function findingsSection(verdict: Judgment, screenReader: string, announcements: number): string[] {
  const lines = [
    // Names what actually assessed the page rather than claiming "AI judge". The shipped default is
    // this project's own trained scorer, not an LLM — and when that scorer abstains on a page unlike
    // its training data, nothing judged anything at all. A report that overstates its own assessor is
    // the same defect as reporting "not run" as a pass.
    `-- Lived-experience layer (${screenReader} + ${judgeLabel()}): ${announcements} announcements --`,
    // See taskVerdictLabel: with the default local scorer this is "no finding was a blocker", not a
    // task verdict — that scorer never sees the task. Only the LLM backends actually answer it.
    verdictHeadline(verdict),
    verdict.summary,
    ...noveltyLine(verdict),
    `${verdict.findings.length} finding(s):`,
    // Stated once, above the list, rather than repeated per finding. Without it "INDICATOR" is jargon; with
    // it, a reader knows exactly which lines they can quote as a failure and which need a human.
    ...(verdict.findings.some((f) => f.mapping !== "conformance")
      ? ["  ASSERTED = the evidence establishes the criterion is not satisfied.",
        "  INDICATOR = a likely failure, but this check is stricter or looser than the criterion itself,",
        "              so it needs human confirmation before it is quoted as non-conformance."]
      : []),
  ];
  let currentLayer: ExperienceLayer | "" = "";
  for (const finding of orderByLayer(verdict.findings)) {
    const layer = layerOf(finding.wcag);
    if (layer !== currentLayer) {
      currentLayer = layer;
      lines.push(`  ${LAYER_LABEL[layer]}`);
    }
    // ASSERTED vs INDICATOR is the ACT requirement mapping, and it is the most consequential thing on the
    // line: it tells the reader whether they may act on this as a failure or must confirm it by hand.
    // Absent means secondary, so an unmapped finding never reads as an assertion.
    const claim = finding.mapping === "conformance" ? "ASSERTED" : "INDICATOR";
    lines.push(
      `    [${finding.severity.toUpperCase()}] ${finding.wcag}  (confidence ${finding.confidence}) ${claim}`);
    lines.push(`       ${finding.issue}`);
    lines.push(`       evidence: ${finding.evidence}`);
  }
  return lines;
}

/** The whole report, ready to print. */
export function reportLines(
  { url, task, screenReader, announcements, verdict, axe, conformance, outcomes }: Report,
): string[] {
  return [
    "",
    "a11y-witness report",
    "===================",
    `URL:   ${url}`,
    `Task:  ${task}`,
    "",
    ...axeSection(axe),
    "",
    ...findingsSection(verdict, screenReader, announcements),
    "",
    ...outcomesSection(outcomes),
    "",
    ...conformanceSection(conformance),
    "",
    // Kept in the output on purpose: a report that lists only what a screen reader can hear invites
    // the reader to conclude the rest is fine.
    "Note: visual issues (contrast, colour, target size) come from the rule-based layer;",
    "a screen reader cannot perceive them. Some criteria still need human review.",
    "",
  ];
}
