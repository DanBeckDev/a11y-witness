/**
 * The Action's rendering and pass/fail policy.
 *
 * Tested here rather than by pushing a commit and waiting for a Windows runner, because the Action's
 * whole job is to tell someone their page has a problem: a renderer that drops a finding, or a gate that
 * passes when it should fail, is worse than no Action at all.
 */
import { strict as assert } from "node:assert";
import test from "node:test";

import { renderSummary, shouldFail, type RunFinding, type RunResult } from "./summary.js";

const finding = (severity: RunFinding["severity"], issue = "issue"): RunFinding => ({
  issue, wcag: "4.1.2 Name, Role, Value", severity, evidence: "button", confidence: 0.9,
});

const result = (over: Partial<RunResult> = {}): RunResult => ({
  url: "https://example.com/checkout",
  task: "Complete the checkout",
  screenReader: "NVDA",
  transcript: ["heading, level 1, Checkout", "button"],
  ruleBased: [],
  verdict: { taskCompletable: true, summary: "A summary.", findings: [], confidence: 0.9 },
  ...over,
});

test("failing is OFF by default, because a tool that breaks builds on day one gets uninstalled", () => {
  assert.equal(shouldFail([finding("blocker")], "never"), false);
});

test("'any' fails on a single finding of any severity", () => {
  assert.equal(shouldFail([finding("minor")], "any"), true);
  assert.equal(shouldFail([], "any"), false);
});

test("a severity threshold means THAT severity or worse", () => {
  assert.equal(shouldFail([finding("moderate")], "serious"), false, "moderate is less severe than serious");
  assert.equal(shouldFail([finding("serious")], "serious"), true);
  assert.equal(shouldFail([finding("blocker")], "serious"), true, "blocker is worse than serious, so it must fail");
  assert.equal(shouldFail([finding("minor")], "minor"), true, "the lowest threshold catches everything");
});

test("an unknown threshold THROWS rather than defaulting to never failing", () => {
  // A typo in a workflow file must not silently produce a check that always passes. That is the failure
  // nobody notices, because green is exactly what they expected to see.
  assert.throws(() => shouldFail([finding("blocker")], "srious" as never), /unknown fail-on/);
});

test("'not run' and '0 violations' are rendered differently for the rule layer", () => {
  // The single most misleading thing this tool could do is report silence as a clean bill of health.
  const notRun = renderSummary(result({ ruleBased: null }));
  const ranClean = renderSummary(result({ ruleBased: [] }));
  // Note the emphasis: the real line reads "are *unchecked*, not clean", so the pattern has to allow
  // the asterisks. Both assertions here were first written from what I expected the renderer to say
  // rather than from what it does say, and both failed against correct output — which is the cheap
  // version of the mistake that matters, a test asserting something the code never claimed.
  assert.match(notRun, /not run.*\*unchecked\*, not clean/is);
  assert.match(ranClean, /0 violations/);
  assert.doesNotMatch(ranClean, /unchecked/);
});

test("findings are ordered worst-first and quote the announcement", () => {
  const out = renderSummary(result({
    verdict: {
      taskCompletable: false, summary: "s", confidence: 0.9,
      findings: [finding("minor", "least"), finding("blocker", "worst"), finding("moderate", "middle")],
    },
  }));
  assert.ok(out.indexOf("worst") < out.indexOf("middle"), "blocker must precede moderate");
  assert.ok(out.indexOf("middle") < out.indexOf("least"), "moderate must precede minor");
  // The evidence IS the product: a rule scanner can say a control is unnamed; only this can say what a
  // user would actually hear.
  assert.match(out, /`button`/);
});

test("truncation is STATED, never silent", () => {
  const many = Array.from({ length: 25 }, (_, i) => finding("serious", `issue ${i}`));
  const out = renderSummary(result({
    verdict: { taskCompletable: false, summary: "s", findings: many, confidence: 0.9 },
  }), { limit: 5 });
  assert.match(out, /25 lived-experience finding\(s\)/, "the true total must be reported");
  assert.match(out, /and 20 more, omitted/, "a truncated report that looks complete is how a finding gets missed");
});

test("a task the user cannot complete is stated plainly", () => {
  const out = renderSummary(result({
    verdict: { taskCompletable: false, summary: "s", findings: [], confidence: 0.9 },
  }));
  assert.match(out, /complete the task\?\*\*\s+\*\*No\*\*/);
});

test("pipes and newlines in a finding cannot break the table", () => {
  // NVDA announcements contain commas and, on some pages, characters that would end a Markdown cell.
  const out = renderSummary(result({
    verdict: {
      taskCompletable: true, summary: "s", confidence: 0.9,
      findings: [{ ...finding("serious"), issue: "a | b", evidence: "line one\nline two" }],
    },
  }));
  assert.match(out, /a \\\| b/, "a pipe must be escaped");
  assert.doesNotMatch(out.split("| 🔴")[1] ?? "", /\n.*line two/, "a newline must not split the row");
});

test("the marker is emitted so a PR comment can be UPDATED rather than duplicated", () => {
  const out = renderSummary(result(), { marker: "a11y-witness" });
  assert.ok(out.startsWith("<!-- a11y-witness -->"), "the marker must be findable at the top");
  assert.doesNotMatch(renderSummary(result()), /<!--/, "and absent when not asked for");
});

test("an empty findings list says so rather than rendering an empty table", () => {
  assert.match(renderSummary(result()), /No lived-experience findings/);
});
