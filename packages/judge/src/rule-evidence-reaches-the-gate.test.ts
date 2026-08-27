/**
 * Evidence the RULES are allowed to see must actually reach them where they are CHECKED.
 *
 * `rules:gate` scored `record.input` — the MODEL's allowlist — so any rule reading a field the model is
 * deliberately not given could never fire there. Two do. The AX-tree census is recorded by every capture
 * as a `structureCensus` diagnostic, and `diagnostics` is correctly on the exporter's
 * FORBIDDEN_INPUT_KEYS, so `input.census` was `undefined` on all 3,790 exported records.
 *
 * The product path was fine the whole time — the CLI builds `census: pageCensus(cap)` itself — so these
 * rules worked where it mattered and were unexercised where they were checked. That is this repo's
 * most-recorded defect, "a gate that does not exercise what ships is not a gate", and the split it needed
 * was already DESIGNED in the exporter's own comments ("a rule may use evidence the model never sees").
 * It had never been implemented.
 *
 * Only one of the two was visible. `1.3.1` reported `NEVER FIRED ANYWHERE — the claim rests on nothing`.
 * The `1.1.1` unnamed-graphics rule hid completely, because sibling 1.1.1 rules DO fire and the criterion
 * therefore read as "validated on real evidence".
 *
 * These assertions are BEHAVIOURAL — they drive the real rules and check what fires. A test that instead
 * compared the field names in `RuleInput` against the exporter's source text would be deriving its
 * expectations from source, which this repo has shipped three passing-while-examining-nothing guards by
 * doing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ruleFindings } from "./rules.js";
import { pageCensus, domCensus as evidenceDomCensus } from "@a11y-witness/evidence/verify";

/** Enough announcements to clear MIN_CONTENT_LINES, so "no headings" is a finding and not a fragment. */
const CONTENT = Array.from({ length: 20 }, (_unused, index) => `Paragraph ${index + 1} of body copy.`);

function withCensus(census: Record<string, number> | undefined) {
  return {
    transcript: CONTENT,
    structure: { headings: [], links: [], graphics: [], formFields: [], lists: [] },
    interaction: {},
    census,
  } as never;
}

test("a page the tree confirms has NO headings is a 1.3.1 finding", () => {
  const found = ruleFindings(withCensus({ heading: 0, link: 3, graphic: 0, graphicUnnamed: 0 }));
  assert.ok(found.some((finding) => finding.wcag.startsWith("1.3.1")),
    "the rule that owns 1.3.1 must fire when the census confirms zero headings — if this fails, the "
    + "criterion's only rule is unreachable and `rules:coverage` will say the claim rests on nothing");
});

test("without a census the rule stays silent, because it cannot tell 'none' from 'we could not ask'", () => {
  // The other half, and the reason the rule is written this way. A sweep finding no headings is
  // ambiguous; only the tree can say the page has none. Silence here is CORRECT, and it is exactly what
  // every exported record produced — which is why the gap looked like a quiet rule rather than a broken
  // pipeline.
  const found = ruleFindings(withCensus(undefined));
  assert.ok(!found.some((finding) => finding.wcag.startsWith("1.3.1")),
    "with no census the rule must NOT claim the page has no headings");
});

test("images the tree exposes with no accessible name are a 1.1.1 finding", () => {
  // The rule that was invisible. Its criterion read as covered because OTHER 1.1.1 rules fire on
  // announcements; this one needs the tree, and the tree never arrived.
  const found = ruleFindings(withCensus({ heading: 2, link: 1, graphic: 4, graphicUnnamed: 2 }));
  assert.ok(found.some((finding) => finding.wcag.startsWith("1.1.1")),
    "the census-based 1.1.1 rule must fire when the tree exposes unnamed graphics");
});

test("the gate's merge gives the rules the model's input PLUS the rule-only evidence", () => {
  // The shape `score-rules.ts` builds, asserted here rather than there because this is where the
  // consequence lives: merge them and the rule fires, score `input` alone and it cannot.
  const exported = {
    input: { transcript: CONTENT, structure: { headings: [] }, interaction: {} },
    ruleEvidence: { census: { heading: 0, link: 2, graphic: 0, graphicUnnamed: 0 } },
  };
  const merged = { ...exported.input, ...exported.ruleEvidence } as never;
  assert.ok(ruleFindings(merged).some((finding) => finding.wcag.startsWith("1.3.1")),
    "merged, the census reaches the rule");
  assert.ok(!ruleFindings(exported.input as never).some((finding) => finding.wcag.startsWith("1.3.1")),
    "unmerged — which is what the gate did for the whole life of these rules — it cannot");
});

test("a RAW capture needs pageCensus; the census is a diagnostic, not a field", () => {
  // THE SAME DEFECT IN A SECOND GATE, and it is why two gates disagreed about one corpus:
  // `rules:gate` reported `1.3.1:no-headings 29/29 EXACT` while `rules:coverage` reported the same
  // criterion as having fired `0x`.
  //
  // `score-rules.ts` scores exported RECORDS and was fixed hours earlier. `audit-rule-coverage.ts` and
  // `check-real-page-findings.ts` score raw CAPTURES, where the census is a `structureCensus` DIAGNOSTIC
  // and only `pageCensus` lifts it into the `census` field the rules read. The CLI has always done that
  // (`census: pageCensus(cap)`); those two passed the capture straight through.
  //
  // A fix reaching one of several paths — this repo's most expensive recurring shape — committed while
  // fixing that exact shape somewhere else.
  const raw = {
    transcript: CONTENT,
    structure: { headings: [], links: [], graphics: [], formFields: [], lists: [] },
    interaction: {},
    diagnostics: [{ event: "structureCensus", heading: 0, link: 2, graphic: 0, graphicUnnamed: 0 }],
  };
  assert.ok(!("census" in raw), "a raw capture has no census FIELD — that is the whole trap");
  assert.ok(!ruleFindings(raw as never).some((f) => f.wcag.startsWith("1.3.1")),
    "passed raw, the census-reading rule cannot fire — which is what both audits were doing");
  const lifted = { ...raw, census: { heading: 0, link: 2, graphic: 0, graphicUnnamed: 0 } };
  assert.ok(ruleFindings(lifted as never).some((f) => f.wcag.startsWith("1.3.1")),
    "with the census lifted out of diagnostics, it fires");
});

test("the DOM count and the tree count answer different questions", () => {
  // THE MEASUREMENT THIS PROJECT DID NOT HAVE, and its absence cost a corpus page.
  //
  // Both existing structure sources are accessibility-layer: the sweep is what NVDA REACHED, the census
  // is what Chromium EXPOSES. `crossCheckStructure` compares those two, so it can catch a sweep that
  // stopped early and can say nothing at all about markup the tree never exposed.
  //
  // The Met Office warnings page captured as 27 announcements with `census.heading = 0` while its
  // published HTML carries forty headings, and it was IMPOSSIBLE to say whether this tool failed to
  // render it or the page fails to expose it. Those are opposite verdicts — one our defect, one a severe
  // genuine finding — so the page had to leave the corpus unattributed.
  const withDom = (tree: number, dom: number) => ({
    diagnostics: [
      { event: "structureCensus", heading: tree, link: 6, graphic: 4, graphicUnnamed: 1 },
      { event: "domCensus", heading: dom, link: 62, graphic: 9, landmark: 5, formField: 2 },
    ],
  });
  assert.equal(pageCensus(withDom(0, 40) as never)?.heading, 0);
  assert.equal(evidenceDomCensus(withDom(0, 40) as never)?.heading, 40,
    "40 in the DOM and 0 in the tree is a finding ABOUT THE PAGE");
  assert.equal(evidenceDomCensus(withDom(0, 0) as never)?.heading, 0,
    "0 in both is a page that never rendered — our defect");
});

test("a capture without the DOM count says so, rather than reporting none", () => {
  // `undefined` and `0` must never collapse. A capture taken before the counter existed cannot say what
  // the DOM held, and reading that as "no headings" would turn every old capture into a finding.
  const older = { diagnostics: [{ event: "structureCensus", heading: 3, link: 1, graphic: 0 }] };
  assert.equal(evidenceDomCensus(older as never), null,
    "no domCensus mark means CANNOT SAY, never zero");
});
