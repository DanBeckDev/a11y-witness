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
  assert.match(output, /Task completable: yes/);
  assert.match(output, /0 finding\(s\)/);
});
