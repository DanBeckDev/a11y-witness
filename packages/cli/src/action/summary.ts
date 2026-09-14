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
  ruleBased: { impact: string; wcag: string[]; rule: string; help: string; nodes?: { target?: unknown[] }[] }[] | null;
  verdict: {
    taskCompletable: boolean;
    summary: string;
    findings: RunFinding[];
    confidence: number;
  };
  /**
   * Per-criterion ACT outcomes, when the result carries them.
   *
   * `cli.ts --json` has emitted these all along and this renderer dropped them, so the most PUBLIC output
   * this tool produces — a comment on somebody's pull request, in bold — could not say `cantTell`. A page
   * where six of the ten covered criteria came back undetermined rendered identically to one where all ten
   * passed. The CLI prints the tally with "Neither is clean"; the PR comment could not.
   *
   * Optional because an older result JSON has none, and absent must render as SILENCE rather than as a
   * tally of zeroes — a fabricated "0 untested" would be worse than the omission it replaced.
   */
  outcomes?: { criterion: string; outcome: string; reason: string }[];
  /**
   * Where the examination ENDED because an activation took the browser off the page's site (#1363). Nothing
   * after it was examined and no finding describes it. Absent on results whose activations stayed on the
   * page, and on results written before the check existed.
   */
  leftSite?: { control: string; to: string | null; source: "recorded" | "derived" } | null;
  /**
   * WCAG §5.2's five conformance requirements, as `cli.ts --json` emits them (`@a11ign/evidence/conformance`).
   * Declared for one sentence only (#1387): Requirement 2 names a capture that spanned more than one document,
   * and until this field was declared the summary could not show it. Absent on older results, which say nothing.
   */
  conformance?: { number: number; name: string; establishes: string; limitation: string }[];
}

/**
 * The conformance scope's own sentence for a capture whose marks named more than one document -- #1387.
 *
 * READ, never rephrased: `@a11ign/evidence`'s `document-identity.ts` writes it into Requirement 2, and the
 * JSON already carries it, so the summary quotes what the evidence layer concluded rather than deciding again.
 * Rehearsals 3 and 5 each named two documents, and only a reader who opened the artifact could find out.
 * `summary.test.ts` takes the wording from the real producer, so a change to it fails there rather than here
 * going quiet. Null when no requirement carries it, including a result with no conformance at all.
 */
const DOCUMENTS_SPANNED = /THIS CAPTURE NAMED MORE THAN ONE DOCUMENT.*?more than one page\./;

export function documentsSpannedSentence(conformance: RunResult["conformance"]): string | null {
  for (const requirement of conformance ?? []) {
    const found = requirement.limitation?.match(DOCUMENTS_SPANNED);
    if (found) return found[0];
  }
  return null;
}

/**
 * The producer's own sentences for a criterion resting on an examination that stopped short -- #1563.
 *
 * READ, never rephrased, like `DOCUMENTS_SPANNED` above: `@a11ign/judge`'s `outcomes.ts` ends a `cantTell` reason
 * with one of these when a sweep feeding the criterion stopped before the page did, or ended having reached less
 * than the browser exposes. Rehearsal 2's result carried eight, and its log read `1 finding(s)` with no word of
 * them. `summary.test.ts` drives the real producer for both sentences, so a change to its wording fails there
 * rather than this count going quietly to zero. Left out: the left-site reason, which #1363's own line states.
 */
const PARTIAL_EXAMINATION = new RegExp("(?:so this criterion rests on an examination known to be partial"
  + "|sweep stopped before the page did, so content past that point was never examined for this criterion)\\.$");

/** How many undetermined criteria rest on an examination known to be partial. Zero with no outcomes at all. */
export function partialExaminationCount(outcomes: RunResult["outcomes"]): number {
  return (outcomes ?? []).filter((o) => o.outcome === "cantTell" && PARTIAL_EXAMINATION.test(o.reason)).length;
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
 * What was NOT determined, as a count — the half a findings list cannot express.
 *
 * A findings table answers "what did you find". It cannot answer "what could you not tell", and on a PR
 * comment those read the same: an empty table looks like a clean page. `criterionOutcomes` has computed
 * the difference all along and this renderer discarded it.
 *
 * Silent when the result carries no outcomes: an older run cannot say, and inventing a tally of zeroes
 * would turn "we did not record this" into "nothing was undetermined", which is the exact substitution
 * this whole file is written against.
 */
function outcomeSection(outcomes: RunResult["outcomes"]): string[] {
  if (!outcomes) return [];
  const tally = (name: string) => outcomes.filter((o) => o.outcome === name).length;
  const undetermined = tally("cantTell");
  const untested = tally("untested");
  if (undetermined === 0 && untested === 0) return [];
  const partial = partialExaminationCount(outcomes);
  // #1563: the one reason among the referrals that is about this tool rather than the page, so it is counted apart.
  const cutShort = partial
    ? ` **${partial} of the referred criteria rest on an examination known to be partial:** a sweep stopped short `
      + "of the page, so they were not examined in full."
    : "";
  // #254: this renders on a STRANGER'S pull request, with no legend and no chance to ask -- worse than
  // #242's `report.ts` instance, which at least reaches someone who ran the CLI and can scroll up to one.
  // `cantTell` is ACT's own vocabulary term (still what `--json`/`ActOutcome` emit, untouched); a reviewer
  // who has never read the ACT spec reads it as a typo or an accusation. Uses #242's own wording, `ceo`'s
  // ruling on PR #252 -- "referred" (worth a person's eyes, the tool cannot decide it) rather than a third
  // spelling of the same distinction. UNLIKE report.ts, no legend exists here to house even one
  // parenthetical ACT mention, so the term does not appear at all -- the acceptance for this row forbids
  // it outright, correctly: a reader with no legend gets no term to misread.
  return ["", `**Not determined:** ${undetermined} criteria we cover were referred — worth a person's `
    + `eyes, the tool cannot decide these on its own — and ${untested} are not covered by any assessor `
    + `of ours. Neither is a pass — see the run artifact for the per-criterion reasons.${cutShort}`];
}

/**
 * #1388: IS THIS RULE-LAYER ROW ABOUT CONTENT INSIDE A FRAME?
 *
 * axe's `target` holds one selector per frame boundary it crossed, so a target of more than one entry points inside an
 * iframe. It says the node is in A frame, never WHOSE: a same-origin frame is the author's own, and the result records no
 * frame origin, so the marker claims no more than that. A single entry that is itself an array is a shadow-DOM path, not
 * a frame. A row with no nodes (an older result) cannot be told, so it is not marked.
 */
export function insideFrame(row: NonNullable<RunResult["ruleBased"]>[number]): boolean {
  return (row.nodes ?? []).some((node) => Array.isArray(node.target) && node.target.length > 1);
}

/**
 * #1388: the caveat the run artifact already carries (Conformance Requirement 3's limitation: "Third-party content …
 * is also not distinguished from the author's own"), stated beside the table it concerns, and only when a row is inside a
 * frame. Rehearsal 3 read "Rule layer (axe-core): 3 violation(s)" on w3.org/WAI, all three inside the embedded YouTube
 * player, with the caveat two layers down in the JSON.
 */
const FRAME_CAVEAT = "_A row marked **in a frame** concerns content inside an embedded frame. This run did not examine "
  + "whose frame it is, so it may be third-party content (an embed, advert or widget) the page's author cannot control._";

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
  // #1388: the count line does not silently absorb rows about content inside a frame. A split count, not a bare total.
  const framed = ruleBased.filter(insideFrame).length;
  const split = framed > 0 ? `, ${framed} inside a frame` : "";
  const lines = [`**Rule layer (axe-core): ${ruleBased.length} violation(s)${split}**`, "", "| Impact | WCAG | Rule |", "|---|---|---|"];
  for (const v of ruleBased.slice(0, limit)) {
    const marker = insideFrame(v) ? " _(in a frame; origin not examined)_" : "";
    lines.push(`| ${cell(v.impact)} | ${cell((v.wcag ?? []).join(", ")) || "—"} | ${cell(v.rule)}: ${cell(v.help)}${marker} |`);
  }
  if (ruleBased.length > limit) lines.push("", `_… and ${ruleBased.length - limit} more._`);
  if (framed > 0) lines.push("", FRAME_CAVEAT);
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
  /**
   * `taskVerdictLabel().isTaskClaim` (`@a11ign/judge`), passed in for the identical reason `taskQuestion`
   * is: this renderer is pure. `report.ts`'s own `verdictHeadline` already makes this split -- a bare
   * "Yes"/"No" only when `taskCompletable` really answers a question about the task (the LLM backends).
   * For the shipped `local` scorer it is `!findings.some(f => f.severity === "blocker")`, so a report of
   * six SERIOUS findings answered "**No blocking findings** Yes" until this flag existed: true, and
   * indistinguishable from a clean page to anyone who did not read past the first line. Defaults to
   * `false`, the honest default for the backend that ships.
   */
  isTaskClaim?: boolean;
}

const DEFAULT_LIMIT = 20;
/** See SummaryOptions.taskQuestion: true for the shipped local scorer, which never sees the task. No
 *  trailing colon -- `blockerCountLine` adds its own, matching `taskVerdictLabel().question`'s own text
 *  (`@a11ign/judge`) exactly, so this default is not a second, independently-punctuated copy of it. */
const DEFAULT_TASK_QUESTION = "No blocking findings";

/**
 * The line `taskQuestion` renders as, when `taskCompletable` is not really an answer to a question --
 * the SAME split `report.ts`'s `verdictHeadline` makes, so the two consumers cannot answer the same
 * verdict two different ways. A count, never a bare yes/no: a number cannot contradict a list of the
 * same things the way "No" can when the list right below it is all findings.
 */
function blockerCountLine(label: string, findings: readonly RunFinding[]): string {
  const blockers = findings.filter((f) => f.severity === "blocker").length;
  const rest = findings.length - blockers;
  const others = rest ? `; ${rest} finding(s) below that severity` : "";
  return `**${label}:** ${blockers === 0 ? "none" : blockers}${others}`;
}

/**
 * The Action's log lines -- EXPORTED so a test drives the real wording (#1363).
 *
 * When the examination ended because an activation left the site, that is said FIRST. Rehearsal 2's log read
 * `a11ign: 1 finding(s) (1 serious)` about a finding observed on youtube.com, and a reader of that line alone
 * would have filed a 2.4.2 bug against the W3C.
 */
export function logLines(result: RunResult, failOn: FailOn): string[] {
  const { findings } = result.verdict;
  const counts = findings.reduce<Record<string, number>>((acc, f) => {
    acc[f.severity] = (acc[f.severity] ?? 0) + 1;
    return acc;
  }, {});
  const breakdown = Object.entries(counts).map(([s, n]) => `${n} ${s}`).join(", ") || "none";
  const left = result.leftSite;
  const lines: string[] = [];
  if (left) {
    lines.push(`a11ign: examination ENDED -- left the site at ${JSON.stringify(left.control)}`
      + `${left.to ? ` (to ${left.to})` : ""}; everything after it was NOT EXAMINED`);
  }
  // #1387: rehearsal 5's reader found nothing about it "in the log, the count, or the three documents".
  if (documentsSpannedSentence(result.conformance)) {
    lines.push("a11ign: this capture named MORE THAN ONE DOCUMENT -- its evidence was gathered across more "
      + "than one page (see the summary)");
  }
  const partial = partialExaminationCount(result.outcomes);
  if (partial) {
    lines.push(`a11ign: ${partial} criteria rest on an examination known to be partial -- see the artifact`);
  }
  lines.push(`a11ign: ${findings.length} finding(s) (${breakdown})${left ? " in what was examined" : ""}; `
    + `fail-on=${failOn}`);
  return lines;
}

/** The summary's warning when the examination ended early (#1363), above everything it did find. */
function leftSiteLead(left: NonNullable<RunResult["leftSite"]>): string[] {
  return [
    `> **The examination ended early.** Activating ${JSON.stringify(left.control)} took the browser off this `
      + `site${left.to ? ` (to ${left.to})` : ""}. Nothing observed after that point is reported as this page's, `
      + "and the sweeps and probes that would have run after it were not examined.",
    "",
  ];
}

export function renderSummary(result: RunResult, options: SummaryOptions = {}): string {
  const taskQuestion = options.taskQuestion ?? DEFAULT_TASK_QUESTION;
  const isTaskClaim = options.isTaskClaim ?? false;
  const limit = options.limit ?? DEFAULT_LIMIT;
  const { verdict } = result;
  const lines: string[] = [];
  if (options.marker) lines.push(`<!-- ${options.marker} -->`);
  // Lead with it, and show nothing else. A reader who skims must not come away with a finding that was
  // never about their page.
  if (result.captureVerified === false) {
    lines.push(
      "## a11ign — **could not read this page**",
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
  if (result.leftSite) lines.push(...leftSiteLead(result.leftSite));
  const spanned = documentsSpannedSentence(result.conformance);
  // #1387: said above the heading, like the early end above, because every finding below may describe either page.
  if (spanned) {
    lines.push(`> **This capture's evidence spans more than one document.** ${spanned} So what follows is not `
      + "only about the page requested.", "");
  }
  lines.push(
    "## a11ign — what a screen reader actually experienced",
    "",
    `**Page:** ${result.url}`,
    `**Task:** ${result.task}`,
    `**Screen reader:** ${result.screenReader}${result.transcript ? ` · ${result.transcript.length} announcements` : ""}`,
    "",
    // See SummaryOptions.taskQuestion/isTaskClaim. This is posted on a PULL REQUEST in bold, and with
    // the shipped local scorer it used to ask "could a screen-reader user complete the task?" (or claim
    // "No blocking findings") and answer from a signal that never saw the task -- a report of six SERIOUS
    // findings once read "**No blocking findings** Yes" above the very table listing them.
    isTaskClaim
      ? `**${taskQuestion}** ${verdict.taskCompletable ? "Yes" : "**No**"}`
      : blockerCountLine(taskQuestion, verdict.findings),
    "",
    verdict.summary,
    "",
    ...findingsSection(verdict.findings, limit),
    ...outcomeSection(result.outcomes),
    "",
    ...ruleSection(result.ruleBased, limit),
    "",
    "<sub>Two layers, deliberately. The screen-reader layer judges the lived experience; axe-core covers "
      + "the visual and rule-based criteria a screen reader cannot perceive. Neither replaces the other, "
      + "and neither replaces a human.</sub>",
  );
  return lines.join("\n");
}
