/**
 * `report.ts` (the CLI's text report) and `action/summary.ts` (the GitHub Action's Markdown summary and
 * PR comment) are two independent renderers over the SAME verdict shape, and #796 measured them drifting:
 * `report.ts`'s own `verdictHeadline` already refused to print a bare "yes"/"no" for a backend whose
 * `taskCompletable` is not really an answer to a question about the task (the shipped `local` scorer) --
 * `action/summary.ts` did not, and posted "**No blocking findings** Yes" directly above six SERIOUS
 * findings on a real PR.
 *
 * Fixing `summary.ts` alone would leave the two renderers agreeing by coincidence, exactly as they
 * disagreed by coincidence before this row. This test feeds ONE fixture verdict to both and asserts they
 * state the same fact the same way, so a future change to either headline that stops matching the other
 * is caught here rather than on somebody's real PR.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { reportLines, type Report } from "../report.js";
import { renderSummary, type RunResult } from "./summary.js";

const NOT_A_TASK_CLAIM_FINDINGS = [
  { wcag: "2.4.7 Focus Visible (AA)", severity: "serious", confidence: 0.9,
    issue: "Focus was removed before it could be shown.", evidence: "focus held 5ms" },
  { wcag: "2.4.7 Focus Visible (AA)", severity: "serious", confidence: 0.9,
    issue: "Focus was never fully received.", evidence: "focus held 1ms" },
] as const;

test("#796: neither renderer prints a bare yes/no for the shipped local scorer -- both state the count", () => {
  const reportVerdict = {
    taskCompletable: true, confidence: 0.9, summary: "s",
    findings: NOT_A_TASK_CLAIM_FINDINGS,
  } as unknown as Report["verdict"];
  const reportOutput = reportLines({
    url: "https://example.com", task: "t", screenReader: "NVDA", announcements: 10,
    verdict: reportVerdict, axe: null,
  }).join("\n");

  const summaryVerdict: RunResult["verdict"] = {
    taskCompletable: true, confidence: 0.9, summary: "s",
    findings: NOT_A_TASK_CLAIM_FINDINGS as unknown as RunResult["verdict"]["findings"],
  };
  const summaryOutput = renderSummary({
    url: "https://example.com", task: "t", screenReader: "NVDA", transcript: [], ruleBased: [],
    verdict: summaryVerdict,
  });

  // NEITHER renderer may claim a bare yes/no -- that is the shape of #796's own defect, and asserting it
  // on both is what makes this a CONSISTENCY test rather than two copies of the summary fix above.
  for (const [name, output] of [["report.ts", reportOutput], ["summary.ts", summaryOutput]] as const) {
    assert.doesNotMatch(output, /:\s*\*?\*?yes\*?\*?\s*$/im,
      `${name} must never answer a bare yes/no for a backend whose taskCompletable is not a real answer `
      + "to a question about the task");
  }

  // BOTH must state the SAME count, in the SAME words, for the SAME verdict -- the actual agreement this
  // test exists to pin. `blockerCountLine` (summary.ts) and `verdictHeadline` (report.ts) compute this
  // suffix identically on purpose; if either drifts, this is where it is caught.
  const expectedCount = "none; 2 finding(s) below that severity";
  assert.ok(reportOutput.includes(expectedCount), `report.ts did not state the count: ${reportOutput}`);
  assert.ok(summaryOutput.includes(expectedCount), `summary.ts did not state the count: ${summaryOutput}`);
});
