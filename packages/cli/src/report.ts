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
import type { AxeFinding } from "./scan/axe.js";
import { layerOf, orderByLayer, LAYER_LABEL, type ExperienceLayer } from "@a11y-witness/judge/layers";

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
/** Which assessor ran, read from the same env var the judge selects on, so the two cannot disagree. */
function judgeLabel(): string {
  const backend = (process.env.JUDGE_BACKEND || "local").toLowerCase();
  return backend === "local" ? "trained scorer" : `${backend} judge`;
}

function findingsSection(verdict: Judgment, screenReader: string, announcements: number): string[] {
  const lines = [
    // Names what actually assessed the page rather than claiming "AI judge". The shipped default is
    // this project's own trained scorer, not an LLM — and when that scorer abstains on a page unlike
    // its training data, nothing judged anything at all. A report that overstates its own assessor is
    // the same defect as reporting "not run" as a pass.
    `-- Lived-experience layer (${screenReader} + ${judgeLabel()}): ${announcements} announcements --`,
    `Task completable: ${verdict.taskCompletable ? "yes" : "no"} (overall confidence ${verdict.confidence})`,
    verdict.summary,
    `${verdict.findings.length} finding(s):`,
  ];
  let currentLayer: ExperienceLayer | "" = "";
  for (const finding of orderByLayer(verdict.findings)) {
    const layer = layerOf(finding.wcag);
    if (layer !== currentLayer) {
      currentLayer = layer;
      lines.push(`  ${LAYER_LABEL[layer]}`);
    }
    lines.push(`    [${finding.severity.toUpperCase()}] ${finding.wcag}  (confidence ${finding.confidence})`);
    lines.push(`       ${finding.issue}`);
    lines.push(`       evidence: ${finding.evidence}`);
  }
  return lines;
}

/** The whole report, ready to print. */
export function reportLines({ url, task, screenReader, announcements, verdict, axe }: Report): string[] {
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
    // Kept in the output on purpose: a report that lists only what a screen reader can hear invites
    // the reader to conclude the rest is fine.
    "Note: visual issues (contrast, colour, target size) come from the rule-based layer;",
    "a screen reader cannot perceive them. Some criteria still need human review.",
    "",
  ];
}
