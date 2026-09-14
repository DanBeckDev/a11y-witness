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
import { conformanceScope } from "@a11ign/evidence/conformance";
import { documentIdentity } from "@a11ign/evidence/document-identity";
import { reportLines, type Report } from "../report.js";
import { readFileSync } from "node:fs";
import { logLines, renderSummary, type RunFinding, type RunResult } from "./summary.js";

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

/**
 * #1387: BOTH renderers lead with the multi-document sentence, from ONE conformance the real producer wrote.
 *
 * `report.ts` already printed it -- inside §5.2's Requirement 2 `limit:` line, the last section a reader meets.
 * `summary.ts` did not print it at all. Fixing one consumer is #801/#808's shape, so both are pinned here: the
 * sentence sits directly under the report's URL/Task lines, and above the summary's heading.
 */
test("#1387: both renderers lead with the same 'more than one document' sentence", () => {
  const documentsFrom = (titles: string[]) => conformanceScope({
    assessedCriteria: [], screenReader: "NVDA", ruleLayerRan: true,
    documentIdentity: documentIdentity({
      diagnostics: titles.map((title) => ({ event: "titleSource", title, source: "document" })),
    } as never),
  });
  const verdict = { taskCompletable: true, confidence: 0.9, summary: "s", findings: [] };
  const render = (conformance: ReturnType<typeof documentsFrom>) => ({
    report: reportLines({ url: "https://example.com", task: "t", screenReader: "NVDA", announcements: 10,
      verdict: verdict as unknown as Report["verdict"], axe: null, conformance }),
    summary: renderSummary({ url: "https://example.com", task: "t", screenReader: "NVDA", transcript: [],
      ruleBased: [], verdict, conformance }),
  });

  const conformance = documentsFrom(["Search | WAI", "How to Change Text Size | WAI"]);
  const sentence = conformance.map((r) => r.limitation.match(/THIS CAPTURE NAMED MORE THAN ONE DOCUMENT.*?more than one page\./)?.[0])
    .find(Boolean);
  assert.ok(sentence, "the positive control: the producer writes the sentence for two titles");
  const { report, summary } = render(conformance);
  const lead = report.findIndex((line) => line.includes(sentence));
  assert.equal(lead, report.indexOf("Task:  t") + 2, `report.ts must lead with it under URL/Task: ${report.join("\n")}`);
  assert.ok(summary.indexOf(sentence) !== -1 && summary.indexOf(sentence) < summary.indexOf("## a11ign"),
    `summary.ts must lead with it above its heading: ${summary}`);

  const single = render(documentsFrom(["Search | WAI", "Search | WAI"]));
  assert.doesNotMatch(single.report.join("\n"), /more than one document/i, "one document: report.ts says nothing");
  assert.doesNotMatch(single.summary, /more than one document/i, "one document: summary.ts says nothing");
});

/**
 * #1366: A REFERRAL IS NOT A SEVERITY, IN EITHER RENDERER. Rehearsal 2's reader (#915, 5654599870) met
 * `a11ign: 1 finding(s) (1 serious); fail-on=never` and a declaratively worded finding at `confidence: 1`, and had
 * "no signal that this was a referral until I dug into `.outcomes` in the JSON". The finding's `mapping` is
 * `secondary`, so the judge refers it (`cantTell`) rather than asserting it. `report.ts` already prints that per
 * finding (`INDICATOR`); the Action's log line and summary table did not.
 *
 * THE SPLIT KEY IS EACH FINDING'S `mapping` (`product-manager`'s ruling, 14:5xZ): `conformance` asserts, and absent
 * or `secondary` refers -- `RequirementMapping`'s own definition, and the key `outcomes.ts` counts assertions by.
 */
const REHEARSAL2 = new URL("../fixtures/rehearsal2-34767932873-a11ign-result.json", import.meta.url);
const rehearsal2 = (): RunResult => JSON.parse(readFileSync(REHEARSAL2, "utf8")) as RunResult;
const criterionOf = (wcag: string) => /^\d+\.\d+\.\d+/.exec(wcag)?.[0] ?? "";
const lastLogLine = (result: RunResult) => logLines(result, "never").at(-1);
const summaryRows = (md: string) => md.split("\n").filter((line) => /^\| (?:🛑|🔴|🟠|🟡|•) /.test(line));
const reportFindingLines = (result: RunResult) => reportLines({
  url: result.url, task: result.task, screenReader: result.screenReader, announcements: 1,
  verdict: result.verdict as unknown as Report["verdict"], axe: null,
}).filter((line) => /^\s+\[[A-Z]+\] \d/.test(line));
const withFindings = (findings: RunFinding[]): RunResult => ({
  url: "https://example.com", task: "t", screenReader: "NVDA", transcript: [], ruleBased: [],
  verdict: { taskCompletable: true, summary: "s", confidence: 0.9, findings },
});
const aFinding = (severity: RunFinding["severity"], mapping?: "conformance" | "secondary"): RunFinding => ({
  issue: `${severity} ${mapping ?? "unmapped"} issue`, wcag: "4.1.2 Name, Role, Value", severity, evidence: "button",
  confidence: 1, ...(mapping ? { mapping } : {}),
});

test("#1366: rehearsal 2's one finding is a referral, and the log line and the summary say so, never '1 serious'", () => {
  const result = rehearsal2();
  const [only] = result.verdict.findings;
  // THE POSITIVE CONTROL: the committed artifact really is the reader's case -- a secondary finding, rated serious at
  // confidence 1, on a criterion the judge's own outcomes read as undetermined.
  assert.equal(result.verdict.findings.length, 1);
  assert.equal(only.mapping, "secondary");
  assert.equal(only.severity, "serious");
  assert.equal(only.confidence, 1);
  assert.equal(result.outcomes?.find((o) => o.criterion === criterionOf(only.wcag))?.outcome, "cantTell");
  assert.equal(lastLogLine(result), "a11ign: 1 finding(s) (1 referred); fail-on=never");
  const md = renderSummary(result);
  const rows = summaryRows(md);
  assert.equal(rows.length, 1);
  assert.match(rows[0], /referred/, "the summary's table row says it is a referral");
  assert.match(md, /A finding marked \*\*referred\*\* is worth a person's eyes/, "and says once what referred means");
  assert.match(reportFindingLines(result)[0], /INDICATOR$/, "and report.ts, over the same verdict, does not assert it");
});

test("#1366 CONTROL: an asserted failure still prints its severity, in the log and the table", () => {
  const result = withFindings([aFinding("serious", "conformance")]);
  assert.equal(lastLogLine(result), "a11ign: 1 finding(s) (1 asserted: 1 serious); fail-on=never");
  const md = renderSummary(result);
  assert.doesNotMatch(summaryRows(md)[0], /referred/);
  assert.doesNotMatch(md, /A finding marked \*\*referred\*\*/, "no referral shown, so no note about referrals");
  assert.match(reportFindingLines(result)[0], /ASSERTED$/);
});

test("#1366: a mixed verdict breaks down only the asserted findings by severity, and counts the referrals apart", () => {
  const result = withFindings([aFinding("serious", "conformance"), aFinding("moderate", "conformance"), aFinding("serious", "secondary")]);
  assert.equal(lastLogLine(result), "a11ign: 3 finding(s) (2 asserted: 1 serious, 1 moderate; 1 referred); fail-on=never");
});

test("#1366: a finding with NO mapping is a referral -- absent means secondary, so an unmapped finding never asserts", () => {
  const result = withFindings([aFinding("blocker")]);
  assert.equal(lastLogLine(result), "a11ign: 1 finding(s) (1 referred); fail-on=never");
  assert.match(summaryRows(renderSummary(result))[0], /referred/);
});

test("#1366: the two renderers agree finding by finding -- the summary marks referred exactly where report.ts prints INDICATOR", () => {
  const result = withFindings([aFinding("serious", "conformance"), aFinding("minor"), aFinding("moderate", "secondary")]);
  const report = reportFindingLines(result).map((line) => line.endsWith("INDICATOR"));
  const summary = summaryRows(renderSummary(result)).map((row) => /referred/.test(row));
  assert.equal(report.filter(Boolean).length, 2, "the population: two referrals and one assertion");
  // Both renderers order by their own rule (layer, severity), so compare the counts of each kind rather than positions.
  assert.deepEqual([summary.filter(Boolean).length, summary.length], [report.filter(Boolean).length, report.length]);
});
