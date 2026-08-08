/**
 * Render a witness run as Markdown for a GitHub job summary or PR comment, and decide pass/fail.
 *
 * Kept pure and separate from the Action's YAML so the output is testable without pushing a commit and
 * waiting for a Windows runner. That matters more here than usual: the whole point of the Action is to
 * tell someone their page has an accessibility problem, so a renderer that drops a finding, or a gate
 * that passes when it should fail, is worse than no Action at all.
 */

export type Severity = "blocker" | "serious" | "moderate" | "minor";

export interface RunFinding {
  issue: string;
  wcag: string;
  severity: Severity;
  evidence: string;
  confidence: number;
}

export interface RunResult {
  /**
   * False when the capture could not be confirmed to have read the requested page.
   *
   * Not cosmetic. On gov.uk the capture read Edge's image-magnifier overlay, the retry fired three times
   * and warned, and the run still reported a 4.1.2 finding about the browser's own Zoom In / Rotate
   * buttons as if the site were at fault. Findings from an unverified capture are not merely unreliable,
   * they can blame a page for its browser — so they are not shown at all.
   */
  captureVerified?: boolean;
  /**
   * Why the capture is unverified: `"wrong-content"` (it read something else) or `"contained"` (it read
   * only part of the right page, almost always a consent or cookie modal holding the screen reader).
   * Absent on older results, which are explained with the original wrong-content wording.
   */
  captureUnverifiedReason?: "wrong-content" | "contained";
  url: string;
  task: string;
  screenReader: string;
  transcript?: string[];
  /** null when the rule layer did not run — NOT the same as running and finding nothing. */
  ruleBased: { impact: string; wcag: string[]; rule: string; help: string }[] | null;
  verdict: {
    taskCompletable: boolean;
    summary: string;
    findings: RunFinding[];
    confidence: number;
  };
}

/** Ordered worst-first, so a threshold can be "this severity or worse". */
const SEVERITY_ORDER: Severity[] = ["blocker", "serious", "moderate", "minor"];

export type FailOn = "never" | "any" | Severity;

/**
 * Should this run fail the check?
 *
 * `never` is the default deliberately. A tool that starts failing builds the day it is installed gets
 * uninstalled; one that reports first, and fails when the team asks it to, gets adopted. The same
 * reasoning is why the rule layer is opt-out rather than mandatory.
 */
export function shouldFail(findings: RunFinding[], failOn: FailOn): boolean {
  if (failOn === "never") return false;
  if (failOn === "any") return findings.length > 0;
  const threshold = SEVERITY_ORDER.indexOf(failOn);
  // An unrecognised threshold must not silently mean "never fail" -- that would turn a typo in a
  // workflow file into a check that always passes, which is the failure mode nobody notices.
  if (threshold === -1) throw new Error(`unknown fail-on value ${JSON.stringify(failOn)}`);
  return findings.some((f) => {
    const rank = SEVERITY_ORDER.indexOf(f.severity);
    return rank !== -1 && rank <= threshold;
  });
}

const ICON: Record<Severity, string> = {
  blocker: "🛑", serious: "🔴", moderate: "🟠", minor: "🟡",
};

/** Sort worst-first so the most important finding is the one a reader sees without scrolling. */
function bySeverity(findings: RunFinding[]): RunFinding[] {
  return [...findings].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
  );
}

/** Markdown table cells cannot contain a raw pipe or newline. */
function cell(text: string): string {
  return String(text ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

/**
 * The screen-reader layer's section.
 *
 * Every finding quotes the announcement it came from, because that is the entire value proposition: a
 * rule scanner can say "this control has no accessible name", and only this can say "a screen reader
 * announced it as `button` and a user would hear nothing else".
 */
function findingsSection(findings: RunFinding[], limit: number): string[] {
  if (findings.length === 0) {
    return ["**No lived-experience findings.** The screen-reader layer found nothing it could evidence."];
  }
  const shown = bySeverity(findings).slice(0, limit);
  const lines = [
    `**${findings.length} lived-experience finding(s)**`,
    "",
    "| | WCAG | Issue | What the screen reader announced |",
    "|---|---|---|---|",
  ];
  for (const f of shown) {
    lines.push(`| ${ICON[f.severity] ?? "•"} ${cell(f.severity)} | ${cell(f.wcag)} | ${cell(f.issue)} | \`${cell(f.evidence)}\` |`);
  }
  // Never a silent cap. A truncated report that looks complete is how a real finding gets missed, and
  // this project has the scars: a run once reported success while a probe had crashed 604 times.
  if (findings.length > shown.length) {
    lines.push("", `_… and ${findings.length - shown.length} more, omitted to keep this summary within GitHub's size limit. The full JSON is in the workflow artifacts._`);
  }
  return lines;
}

/**
 * The rule layer's section.
 *
 * "not run" and "0 violations" must never look alike: one means the visual criteria are unchecked, the
 * other means they were checked and passed. Reporting silence as a clean bill of health is the single
 * most misleading thing this tool could do — the same rule `src/report.ts` states for the CLI.
 */
function ruleSection(ruleBased: RunResult["ruleBased"], limit: number): string[] {
  if (ruleBased === null) {
    return ["**Rule layer (axe-core): not run.** Visual criteria such as contrast are *unchecked*, not clean."];
  }
  if (ruleBased.length === 0) return ["**Rule layer (axe-core): 0 violations.**"];
  const lines = [`**Rule layer (axe-core): ${ruleBased.length} violation(s)**`, "", "| Impact | WCAG | Rule |", "|---|---|---|"];
  for (const v of ruleBased.slice(0, limit)) {
    lines.push(`| ${cell(v.impact)} | ${cell((v.wcag ?? []).join(", ")) || "—"} | ${cell(v.rule)}: ${cell(v.help)} |`);
  }
  if (ruleBased.length > limit) lines.push("", `_… and ${ruleBased.length - limit} more._`);
  return lines;
}

export interface SummaryOptions {
  /** Rows per table. Bounded because a job summary has a hard size limit and truncation must be stated. */
  limit?: number;
  /** Included as an HTML comment so a PR comment can be found and UPDATED rather than duplicated. */
  marker?: string;
  /**
   * What `taskCompletable` should be LABELLED as, because it means different things per backend.
   *
   * Passed in rather than read from the environment here: this renderer is deliberately pure so the
   * output is testable without a Windows runner, and reading process.env would end that.
   *
   * The default is the honest one for the shipped `local` scorer, which has no head for task completion
   * and never sees the task — local-judge.ts computes `!findings.some(f => f.severity === "blocker")`
   * and its own comment says claiming a task answer would be inventing one. This comment is posted on
   * someone's PULL REQUEST in bold, so inventing it there is the worst place to do it. The LLM backends
   * do read the task, and pass their own wording.
   */
  taskQuestion?: string;
}

const DEFAULT_LIMIT = 20;
/** See SummaryOptions.taskQuestion: true for the shipped local scorer, which never sees the task. */
const DEFAULT_TASK_QUESTION = "No blocking findings:";

export function renderSummary(result: RunResult, options: SummaryOptions = {}): string {
  const taskQuestion = options.taskQuestion ?? DEFAULT_TASK_QUESTION;
  const limit = options.limit ?? DEFAULT_LIMIT;
  const { verdict } = result;
  const lines: string[] = [];
  if (options.marker) lines.push(`<!-- ${options.marker} -->`);
  // Lead with it, and show nothing else. A reader who skims must not come away with a finding that was
  // never about their page.
  if (result.captureVerified === false) {
    lines.push(
      "## a11y-witness — **could not read this page**",
      "",
      `**Page:** ${result.url}`,
      "",
      result.captureUnverifiedReason === "contained"
        ? "The screen reader reached almost none of this page. The page itself exposes many headings and "
          + "landmarks, and quick navigation could not get to them — the signature of a modal dialog holding "
          + "the screen reader in place, most often a cookie or consent banner. A keyboard user meets the "
          + "same wall, but what we captured describes the dialog, not your content."
        : "The capture could not be confirmed to have read the requested page: what the screen reader "
          + "announced did not contain the page's own title, after three attempts. That usually means it read "
          + "browser chrome — an interstitial, a consent dialog, an image or PDF viewer — rather than your "
          + "content.",
      "",
      result.captureUnverifiedReason === "contained"
        ? "**No findings are reported.** Any that were produced would describe the consent dialog rather "
          + "than your page, and a report about somebody else's cookie banner is worse than saying nothing."
        : "**No findings are reported.** Any that were produced would describe the browser, not this page, "
          + "and blaming a site for its browser is worse than saying nothing.",
      "",
      "<sub>The full capture is in the run artifact if you want to see what it did read.</sub>",
    );
    return lines.join("\n");
  }
  lines.push(
    "## a11y-witness — what a screen reader actually experienced",
    "",
    `**Page:** ${result.url}`,
    `**Task:** ${result.task}`,
    `**Screen reader:** ${result.screenReader}${result.transcript ? ` · ${result.transcript.length} announcements` : ""}`,
    "",
    // See SummaryOptions.taskQuestion. This is posted on a PULL REQUEST in bold, and with the shipped
    // local scorer it asked "could a screen-reader user complete the task?" and answered from a signal
    // that never saw the task.
    `**${taskQuestion}** ${verdict.taskCompletable ? "Yes" : "**No**"}`,
    "",
    verdict.summary,
    "",
    ...findingsSection(verdict.findings, limit),
    "",
    ...ruleSection(result.ruleBased, limit),
    "",
    "<sub>Two layers, deliberately. The screen-reader layer judges the lived experience; axe-core covers "
      + "the visual and rule-based criteria a screen reader cannot perceive. Neither replaces the other, "
      + "and neither replaces a human.</sub>",
  );
  return lines.join("\n");
}
