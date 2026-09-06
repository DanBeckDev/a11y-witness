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
  /**
   * The capture's own `environment` block, from the RUNNING WORKER, never from a pin or a manifest —
   * publish blocker B4. `screenReaderVersion` and `guidepupVersion` matter most: the shipped scorer was
   * trained on evidence from the fleet's NVDA, so a consumer's report has to say which NVDA build (and
   * which client drove it) actually produced these announcements, not which one a lockfile or an
   * installer manifest merely NAMES. The `browserVersion` memo defect, precisely: a pin says what was
   * asked for, and only the instrument can say what was there. Optional so an older caller still renders.
   */
  environment?: Record<string, string>;
}

/**
 * The vocabulary this report uses, explained ONCE, in reading order, before any of it appears.
 *
 * #40's acceptance test is a stranger reading one report end to end and being able to say which findings
 * are claims and which need a human, and what to do about each. Before this, that answer was assembled
 * from three separate places — an ASSERTED/INDICATOR legend printed only when a non-conformance finding
 * existed (so a report of ONLY rule-asserted findings never explained the tag at all), a `cantTell`/
 * `untested` gloss inside `outcomesSection`, and nothing anywhere for `passed`/`inapplicable`. A reader
 * who reached the findings first, with no legend above them (the ASSERTED-only case), had no way to know
 * what the tag meant.
 *
 * ONE explanation, always printed, in the order the terms are used below it. This is also this repo's
 * own rule about a fact stated twice applied to prose rather than to code: the two other explanations
 * this replaced were correct on their own and would have drifted from this one the first time either was
 * edited alone.
 */
function howToReadThisSection(): string[] {
  return [
    "-- How to read this report --",
    "Findings below are tagged with what kind of claim they are:",
    "  ASSERTED    a confirmed problem -- the evidence establishes it directly. Fix it.",
    "  INDICATOR   a likely problem, but this check is looser than the criterion itself.",
    "              Have a person confirm it before treating it as a failure.",
    "Per-criterion outcomes (further down) use a wider vocabulary than \"finding\":",
    "  passed        checked, and this criterion is fine",
    "  failed        checked, and it is not -- this is where ASSERTED/INDICATOR findings above come from",
    "  cantTell      we could not determine this one -- NOT the same as passed",
    "  inapplicable  nothing of this kind is on the page to be right or wrong about",
    "  untested      nothing here checks this criterion yet",
  ];
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
    // Vocabulary explained once, in `howToReadThisSection`, before this section is ever reached.
    "-- Per-criterion outcomes (W3C ACT vocabulary) --",
    `  failed ${tally.failed}   cantTell ${tally.cantTell}   passed ${tally.passed}   `
      + `inapplicable ${tally.inapplicable}   untested ${tally.untested}`,
  ];
  // The ASSESSOR is in the tag, not left to be read out of the prose. ADR 0021 turns on which layer is
  // entitled to claim what, so a reader deciding how much weight to give a `failed` needs to know whether
  // it came from a DOM rule or from driving a real screen reader — and a consumer parsing these lines
  // should not have to regex a sentence to find out. Absent means the screen-reader layer, which is the
  // default assessor and does not earn a tag on every line.
  for (const outcome of outcomes.filter((o) => o.outcome === "failed" || o.outcome === "cantTell")) {
    const by = outcome.assessor ? ` · ${outcome.assessor}` : "";
    lines.push(`    [${outcome.outcome}${by}] ${outcome.criterion} — ${outcome.reason}`);
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

/**
 * The scorer's own Python inference-runtime versions, so a disputed finding is traceable to what it was
 * scored under as well as to the weights (publish blocker B2). Silent when absent — an LLM backend, or a
 * local-scorer artifact that predates this field.
 */
function runtimeLine(verdict: Judgment): string[] {
  const runtime = verdict.runtime;
  if (!runtime) return [];
  const parts = Object.entries(runtime).map(([name, version]) => `${name} ${version ?? "absent"}`);
  return [`Scorer runtime: ${parts.join(", ")}.`];
}

/**
 * The screen reader and client versions the CAPTURE actually ran under, read from `environment` — the
 * running instance, never a pin. Publish blocker B4: the shipped scorer was trained on the fleet's NVDA,
 * so a consumer needs to know which build produced the evidence in front of them, not which one a
 * lockfile or an installer manifest names. Silent when `environment` (or the fields inside it) is
 * missing — an older capture that predates this block, or a non-NVDA backend with nothing to report.
 */
function screenReaderRuntimeLine(environment?: Record<string, string>): string[] {
  const screenReaderVersion = environment?.screenReaderVersion;
  const guidepupVersion = environment?.guidepupVersion;
  if (!screenReaderVersion && !guidepupVersion) return [];
  const parts = [
    screenReaderVersion ? `${environment?.screenReader ?? "screen reader"} ${screenReaderVersion}` : null,
    guidepupVersion ? `guidepup ${guidepupVersion}` : null,
  ].filter((part): part is string => part !== null);
  return [`Screen reader runtime: ${parts.join(", ")}.`];
}

function findingsSection(
  verdict: Judgment, screenReader: string, announcements: number, environment?: Record<string, string>,
): string[] {
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
    ...screenReaderRuntimeLine(environment),
    ...runtimeLine(verdict),
    `${verdict.findings.length} finding(s):`,
    // ASSERTED/INDICATOR is explained once, in `howToReadThisSection`, before any finding appears --
    // see that function's header for why repeating it here (conditionally, and in different words) was
    // itself a defect: a report with no INDICATOR findings never explained the tag at all.
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
  { url, task, screenReader, announcements, verdict, axe, conformance, outcomes, environment }: Report,
): string[] {
  return [
    "",
    "a11y-witness report",
    "===================",
    `URL:   ${url}`,
    `Task:  ${task}`,
    "",
    ...howToReadThisSection(),
    "",
    ...axeSection(axe),
    "",
    ...findingsSection(verdict, screenReader, announcements, environment),
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
