// The report is what a person judges their site by, so its wording is behaviour, not decoration.
import { test } from "node:test";
import assert from "node:assert/strict";
import { reportLines, type Report } from "./report.js";

const verdict = {
  taskCompletable: false,
  confidence: 0.8,
  summary: "The form cannot be completed without sight.",
  findings: [
    {
      wcag: "4.1.2 Name, Role, Value (A)", severity: "serious", confidence: 0.9,
      issue: "The submit control is announced as a bare role.", evidence: "\"button\"",
    },
    {
      wcag: "1.1.1 Non-text Content (A)", severity: "critical", confidence: 1,
      issue: "The illustration has no alternative text.", evidence: "\"graphic\"",
    },
  ],
} as unknown as Report["verdict"];

const base: Report = {
  url: "https://example.com/booking",
  task: "Book a table",
  screenReader: "NVDA",
  announcements: 12,
  verdict,
  axe: null,
};

const render = (over: Partial<Report> = {}) => reportLines({ ...base, ...over }).join("\n");

test("a report that did not run axe says the visual criteria are unchecked, not clean", () => {
  // The most dangerous thing this tool could do is let silence read as a pass.
  assert.match(render({ axe: null }), /not run\. Visual criteria are unchecked, not clean\./);
});

test("axe running and finding nothing is stated as zero violations, not as 'not run'", () => {
  const output = render({ axe: [] });
  assert.match(output, /0 violation\(s\)/);
  assert.doesNotMatch(output, /not run/);
});

test("an axe finding with no success criterion still renders", () => {
  const axe = [{
    impact: "serious", wcag: [], rule: "region", help: "All content should be in landmarks",
    nodes: [{ html: "<div>orphan</div>" }],
  }] as unknown as Report["axe"];
  assert.match(render({ axe }), /\(no SC\)\s+region: All content should be in landmarks/);
});

test("findings are grouped Perceive before Interact, however they arrive", () => {
  // 1.1.1 is perceive, 4.1.2 is interact; the input above lists 4.1.2 first on purpose.
  const output = render();
  assert.ok(output.indexOf("1.1.1") < output.indexOf("4.1.2"), "perceive must come before interact");
});

test("every finding carries its severity, criterion, confidence and evidence", () => {
  const output = render();
  assert.match(output, /\[CRITICAL\] 1\.1\.1 Non-text Content \(A\)\s+\(confidence 1\)/);
  assert.match(output, /evidence: "graphic"/);
});

test("the report always warns that a screen reader cannot see visual issues", () => {
  // Present whether or not axe ran, because the reader's wrong conclusion is the same either way.
  for (const axe of [null, [] as unknown as Report["axe"]]) {
    assert.match(render({ axe }), /a screen reader cannot perceive them/);
  }
});

test("a clean verdict reports no findings without inventing a section", () => {
  const clean = { ...verdict, findings: [], taskCompletable: true } as Report["verdict"];
  const output = render({ verdict: clean });
  // The DEFAULT local scorer has no head for task completion and never sees the task, so the report
  // must not claim one. This test used to assert "Task completable: yes" — it was pinning the
  // overclaim in place. Now it pins the honest label, and refuses the claim, so reintroducing it fails.
  // The headline states a COUNT, not a yes/no. `No blocking findings: yes` printed directly above three
  // `[SERIOUS]` findings on the first real page this was pointed at — accurate (serious is a rung below
  // blocker) and unreadable, because nothing on the page said what "blocking" meant.
  assert.match(output, /Findings at BLOCKER severity: none/);
  assert.doesNotMatch(output, /Task completable/,
    "the local scorer must not claim task completion — it never sees the task");
  assert.match(output, /0 finding\(s\)/);
});

test("the headline cannot contradict the findings listed under it", () => {
  // The MDN shape: findings present, none at blocker severity. The old line said "yes" over them.
  const serious = {
    ...verdict,
    taskCompletable: true,
    findings: [
      { ...verdict.findings[0], severity: "serious", wcag: "2.4.3 Focus Order" },
      { ...verdict.findings[0], severity: "serious", wcag: "1.1.1 Non-text Content" },
    ],
  } as Report["verdict"];
  const output = render({ verdict: serious });
  assert.match(output, /Findings at BLOCKER severity: none; 2 finding\(s\) below that severity/,
    "the headline must account for findings it is not counting, or it reads as a clean bill of health");
  assert.doesNotMatch(output, /No blocking findings: yes/, "the wording that caused the contradiction");
});

test("the report never prints a score, grade or percentage", () => {
  // A STANDING commitment, asserted rather than remembered. WCAG-EM warns that aggregated scores "can be
  // misleading", and the reason is specific: a single number absorbs exactly the criteria we could not
  // check. `cantTell` and `untested` are the honest answer, and they cannot survive being averaged.
  //
  // Asserted over a report carrying findings, outcomes and conformance statements, because a score would
  // most plausibly be added next to one of those.
  const lines = reportLines({
    url: "https://example.com/page",
    task: "Complete the checkout",
    screenReader: "NVDA 2026.1.1",
    announcements: 42,
    verdict: {
      taskCompletable: false,
      summary: "Confirmed failures below.",
      confidence: 1,
      findings: [{
        issue: "Control announced with a role but no accessible name",
        wcag: "4.1.2 Name, Role, Value",
        severity: "serious",
        evidence: "combo box, collapsed",
        confidence: 1,
        mapping: "conformance",
      }],
    },
    axe: null,
  }).join("\n");

  assert.doesNotMatch(lines, /\b\d{1,3}\s?%/, "no percentage");
  assert.doesNotMatch(lines, /\bscore\b/i, "no score");
  assert.doesNotMatch(lines, /\bgrade\b|\brating\b/i, "no grade or rating");
  // The confidence numbers ARE allowed and are not a score: they are per-finding, never aggregated into
  // one figure for the page. Asserting their presence keeps this test honest about what it forbids.
  assert.match(lines, /confidence 1/);
});

test("no line above the findings makes a claim the findings contradict", () => {
  // Two lines did, one after the other. The headline said "No blocking findings: yes" over three [SERIOUS]
  // items; the summary underneath said "No failures were confirmed" over `1 finding(s)`, because it counted
  // the SCORER's findings while the deterministic rules' are merged into the same layer afterwards.
  //
  // Both were accurate about the quantity they measured and wrong about the section they headed. The rule
  // that falls out: only the line that LISTS the findings states how many there are.
  const withFinding = {
    ...verdict,
    taskCompletable: true,
    findings: [{ ...verdict.findings[0], severity: "serious", wcag: "1.1.1 Non-text Content" }],
  } as Report["verdict"];
  const output = render({ verdict: withFinding });
  const header = output.slice(0, output.indexOf("1 finding(s):"));
  assert.doesNotMatch(header, /No failures were confirmed/,
    "the summary must state scope, not a count it does not own");
  assert.doesNotMatch(header, /No blocking findings: yes/);
  // The scope sentence itself is the JUDGE's, not the renderer's — `verdict.summary` is passed through.
  // Asserted where it is produced, in local-judge's own test, so this one does not pin fixture data.
});

test("the report says how far the page sat from what the scorer was validated on", () => {
  // The number that decides whether the scorer was ENTITLED to an opinion was reported only when it
  // declined. So "I looked and found nothing" and "I was never validated on anything like this" produced
  // identical output — measured on developer.mozilla.org, whose report showed no abstention, no scorer
  // findings, and nothing saying which of the two had happened.
  //
  // It is also the measurement the realism tier needs: widening the corpus means knowing which real pages
  // sit near the boundary, and this was computed on every run and thrown away.
  const scored = {
    ...verdict,
    findings: [],
    novelty: { nearestTrainingCosine: 0.82, inSupport: true, floor: 0.7 },
  } as Report["verdict"];
  assert.match(render({ verdict: scored }), /Support: within the scorer's validated range \(nearest training similarity 0\.82, floor 0\.7\)/);

  const outside = {
    ...verdict,
    findings: [],
    novelty: { nearestTrainingCosine: 0.61, inSupport: false, floor: 0.7 },
  } as Report["verdict"];
  assert.match(render({ verdict: outside }), /Support: OUTSIDE the scorer's validated range/);

  // An artifact with no reference must not read as safe.
  const unmeasured = {
    ...verdict,
    findings: [],
    novelty: { nearestTrainingCosine: null, inSupport: null },
  } as Report["verdict"];
  assert.match(render({ verdict: unmeasured }), /Support: NOT MEASURED/);

  // And the LLM backends, which have no support region, must not grow a line about one.
  assert.doesNotMatch(render({ verdict: { ...verdict, findings: [] } as Report["verdict"] }), /Support:/);
});
