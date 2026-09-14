/**
 * The Action's rendering and pass/fail policy.
 *
 * Tested here rather than by pushing a commit and waiting for a Windows runner, because the Action's
 * whole job is to tell someone their page has a problem: a renderer that drops a finding, or a gate that
 * passes when it should fail, is worse than no Action at all.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import test from "node:test";

import { conformanceScope } from "@a11ign/evidence/conformance";
import { documentIdentity } from "@a11ign/evidence/document-identity";
import { criterionOutcomes } from "@a11ign/judge/outcomes";
import {
  logLines, partialExaminationCount, renderSummary, shouldFail, type RunFinding, type RunResult,
} from "./summary.js";

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

test("the default (isTaskClaim false) renders a COUNT, never a bare yes/no -- #796's own defect", () => {
  // report.ts's own incident, reproduced here: "**No blocking findings** Yes" printed directly above six
  // SERIOUS findings, because taskCompletable really means "no BLOCKER-severity finding" for the shipped
  // local scorer, and a bare "Yes" reads as "nothing is wrong" to anyone who does not read the table below
  // it. verdictHeadline() in report.ts already made this split; this pins summary.ts to the same one.
  const out = renderSummary(result({
    verdict: {
      taskCompletable: true, summary: "s", confidence: 0.9,
      findings: [finding("serious", "a"), finding("serious", "b")],
    },
  }));
  assert.match(out, /No blocking findings:\*\*\s+none;\s+2 finding\(s\) below that severity/);
  assert.doesNotMatch(out, /\*\*Yes\*\*|\*\*No\*\*|\*\*\s+Yes\b/,
    "a bare yes/no must never appear for a backend whose taskCompletable is not really an answer to a "
    + "question about the task");
  assert.doesNotMatch(out, /complete the task/,
    "the default renderer must not ask a task question the local scorer cannot answer");
});

test("the default (isTaskClaim false) with zero findings at all still reads as a count, not a claim", () => {
  const out = renderSummary(result({
    verdict: { taskCompletable: false, summary: "s", findings: [], confidence: 0.9 },
  }));
  assert.match(out, /No blocking findings:\*\*\s+none$/m);
});

test("an LLM backend CAN state the task verdict, so the option is not decorative", () => {
  // The anthropic/openai judges do read the task and answer it, so the wording is theirs to pass --
  // isTaskClaim: true is what tells this renderer taskCompletable really answers that question.
  const out = renderSummary(result({
    verdict: { taskCompletable: false, summary: "s", findings: [], confidence: 0.9 },
  }), { taskQuestion: "Could a screen-reader user complete the task?", isTaskClaim: true });
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
  const out = renderSummary(result(), { marker: "a11ign" });
  assert.ok(out.startsWith("<!-- a11ign -->"), "the marker must be findable at the top");
  assert.doesNotMatch(renderSummary(result()), /<!--/, "and absent when not asked for");
});

test("an empty findings list says so rather than rendering an empty table", () => {
  assert.match(renderSummary(result()), /No lived-experience findings/);
});

test("an UNVERIFIED capture reports no findings at all", () => {
  // On gov.uk the capture read Edge's image-magnifier overlay ("Image Magnify, document"), the retry fired
  // three times and warned — and the run still reported a 4.1.2 finding about the browser's own Zoom In and
  // Rotate buttons, as though the site were at fault. A stderr warning is not a signal; the verdict has to
  // travel with the result and be honoured.
  //
  // Blaming a page for its browser is worse than saying nothing, so nothing is what gets said.
  const out = renderSummary(result({
    captureVerified: false,
    verdict: {
      taskCompletable: false, summary: "s", confidence: 0.9,
      findings: [{ ...finding("serious"), issue: "Zoom In, button", evidence: "Rotate, button" }],
    },
  }));
  assert.match(out, /could not read this page/i);
  assert.match(out, /No findings are reported/i);
  assert.doesNotMatch(out, /Rotate, button/, "a chrome finding must not reach the reader");
  assert.doesNotMatch(out, /lived-experience finding\(s\)/, "no findings table at all");
});

test("a verified capture is unaffected, and so is one that never reported verification", () => {
  // `captureVerified` is optional: an older result, or a caller that does not set it, must not be treated
  // as unverified — that would suppress every finding from anything that predates the field.
  assert.match(renderSummary(result({ captureVerified: true })), /what a screen reader actually experienced/);
  assert.match(renderSummary(result()), /what a screen reader actually experienced/);
});

test("a capture held inside a consent modal is explained as such, not as browser chrome", () => {
  // theregister.com: the page exposes 463 headings and the sweep reached 1, because the consent dialog
  // traps focus. Telling that team their page "read browser chrome" sends them hunting in the wrong place
  // — the cause is a modal inside their own page, and the fix is theirs.
  const out = renderSummary(result({
    captureVerified: false,
    captureUnverifiedReason: "contained",
    verdict: { taskCompletable: false, summary: "s", confidence: 0.9, findings: [finding("serious", "Accept-additional-cookies-button-unnamed")] },
  }));
  assert.match(out, /reached almost none of this page/i);
  assert.match(out, /consent/i);
  assert.doesNotMatch(out, /did not contain the page's own title/i, "that is the OTHER failure");
  // A distinctive title, because the explanatory prose now legitimately contains the words "consent
  // dialog" — asserting on those could not tell the finding from the explanation.
  assert.doesNotMatch(out, /Accept-additional-cookies-button-unnamed/, "the finding itself must still not be shown");
  assert.doesNotMatch(out, /lived-experience finding\(s\)/, "no findings table at all");
});

test("the original wrong-content wording survives for results that carry no reason", () => {
  // Older results have no `captureUnverifiedReason`. They must keep the explanation they always had
  // rather than silently acquiring the consent-dialog one.
  const out = renderSummary(result({ captureVerified: false }));
  assert.match(out, /did not contain the page's own title/i);
});

/**
 * THE PR COMMENT COULD NOT SAY "cantTell", and it is the most public thing this tool produces.
 *
 * `cli.ts --json` has emitted `outcomes` all along; `RunResult` did not declare the field, so this
 * renderer dropped it. A page where six of the ten covered criteria came back undetermined rendered
 * identically to one where all ten passed — an empty findings table under a bold "No blocking findings".
 * The CLI report prints the tally with "Neither is clean"; this could not.
 */
const withOutcomes = (outcomes: { criterion: string; outcome: string; reason: string }[]) => ({
  url: "https://example.com", task: "Book a ticket", screenReader: "NVDA 2026.1",
  ruleBased: [], verdict: { taskCompletable: true, summary: "", findings: [], confidence: 1 },
  outcomes,
}) as never;

test("UNDETERMINED CRITERIA ARE STATED, not left to an empty findings table", () => {
  const md = renderSummary(withOutcomes([
    { criterion: "1.3.1", outcome: "cantTell", reason: "the landmark sweep was short" },
    { criterion: "2.4.4", outcome: "cantTell", reason: "the link sweep was short" },
    { criterion: "1.4.3", outcome: "untested", reason: "no assessor covers it" },
    { criterion: "4.1.2", outcome: "passed", reason: "examined in full" },
  ]));
  assert.match(md, /Not determined/);
  assert.match(md, /2 criteria we cover were referred/);
  assert.match(md, /1 are not covered/);
  assert.match(md, /Neither is a pass/, "the caveat is the point, not the numbers");
});

/**
 * #254: `summary.ts` renders on a STRANGER'S pull request -- no legend, no chance to ask, and worse than
 * #242's `report.ts` instance (which at least reaches someone who ran the CLI and can scroll up to one).
 * `cantTell` is ACT's own vocabulary term; a reviewer who has never read the ACT spec reads it as a typo
 * or an accusation. Uses #242's own wording (`ceo`'s ruling, PR #252) -- "referred" -- and unlike
 * report.ts's legend, the ACT term does not appear at all here, since there is no legend to house even
 * one parenthetical mention.
 */
test("#254: the rendered comment never contains the raw ACT token `cantTell`", () => {
  const md = renderSummary(withOutcomes([
    { criterion: "1.3.1", outcome: "cantTell", reason: "the landmark sweep was short" },
    { criterion: "1.4.3", outcome: "untested", reason: "no assessor covers it" },
  ]));
  assert.doesNotMatch(md, /\bcantTell\b/,
    "a stranger with no legend must never meet ACT's own machine vocabulary term");
  assert.match(md, /referred/, "the count must still be stated in words a reviewer can read -- silence "
    + "is not the fix, per this row's own acceptance");
});

test("AN OLDER RESULT WITH NO OUTCOMES SAYS NOTHING, rather than a tally of zeroes", () => {
  // Absent must not render as "0 undetermined". That would turn "we did not record this" into "nothing
  // was undetermined" — the substitution this entire file exists to prevent.
  const md = renderSummary({
    url: "https://example.com", task: "t", screenReader: "NVDA", ruleBased: [],
    verdict: { taskCompletable: true, summary: "", findings: [], confidence: 1 },
  } as never);
  assert.doesNotMatch(md, /Not determined/);
});

/**
 * #1387: A CAPTURE THAT SPANS MORE THAN ONE DOCUMENT SAYS SO ON THE REPORT, not only in the JSON.
 *
 * Rehearsals 3 and 5 ran the documented page and task. The probe submitted W3C's search form and followed a
 * link, and the result's conformance Requirement 2 said "THIS CAPTURE NAMED MORE THAN ONE DOCUMENT" -- which
 * the job summary never showed, so the outside user found it only by opening the artifact.
 *
 * The sentence is taken from `@a11ign/evidence`'s real `conformanceScope`, never retyped: if its wording
 * changes, the positive control below goes red here rather than the summary quietly going silent.
 */
const SENTENCE = /THIS CAPTURE NAMED MORE THAN ONE DOCUMENT.*?more than one page\./;

/** Conformance as the producer writes it, for a capture whose title marks read `titles` in order. */
function conformanceFor(titles: string[]): NonNullable<RunResult["conformance"]> {
  const diagnostics = titles.map((title) => ({ event: "titleSource", title, source: "document" }));
  return conformanceScope({
    assessedCriteria: [], screenReader: "NVDA", ruleLayerRan: true,
    documentIdentity: documentIdentity({ diagnostics } as never),
  });
}

const producerSentence = (conformance: NonNullable<RunResult["conformance"]>) =>
  conformance.map((requirement) => requirement.limitation.match(SENTENCE)?.[0]).find(Boolean);

test("#1387: a capture that named two documents LEADS the summary with the producer's own sentence", () => {
  const conformance = conformanceFor(["Search | WAI", "How to Change Text Size | WAI"]);
  const sentence = producerSentence(conformance);
  assert.ok(sentence, "the positive control: the producer writes the sentence for two titles");
  const out = renderSummary(result({ conformance }));
  assert.ok(out.includes(sentence), `the summary must carry the sentence: ${out}`);
  assert.ok(out.indexOf(sentence) < out.indexOf("## a11ign"), "near the top: before the summary's own heading");
});

test("#1387: one stable document renders no such lead -- the control for the absence", () => {
  const conformance = conformanceFor(["Search | WAI", "Search | WAI"]);
  assert.equal(producerSentence(conformance), undefined, "one title is one document, so the producer is silent");
  assert.doesNotMatch(renderSummary(result({ conformance })), /more than one document/i);
  assert.doesNotMatch(renderSummary(result()), /more than one document/i, "and a result with no conformance says nothing");
});

/**
 * #1387 ACCEPTANCE: rehearsal 3's real `a11ign-result.json` (run 34774183433, committed verbatim under `fixtures/`),
 * which named "Search Web Accessibility Initiative (WAI) W 3C" then "How to Change Text Size or Colors …".
 */
test("#1387: rehearsal 3's real result leads its summary AND its log with the two documents", () => {
  const file = new URL("../fixtures/rehearsal3-34774183433-a11ign-result.json", import.meta.url);
  const rehearsal3 = JSON.parse(readFileSync(file, "utf8")) as RunResult;
  const out = renderSummary(rehearsal3);
  const heading = out.indexOf("## a11ign");
  for (const title of ["Search Web Accessibility Initiative (WAI) W 3C", "How to Change Text Size or Colors"]) {
    assert.ok(out.indexOf(title) !== -1 && out.indexOf(title) < heading, `${title} must be named above the heading`);
  }
  const [first] = logLines(rehearsal3, "never");
  assert.match(first, /more than one document/i, "the log is what a reader sees without opening the summary");
});

/**
 * #1563: AN EXAMINATION KNOWN TO BE PARTIAL IS COUNTED IN THE LOG AND THE SUMMARY, not only in the JSON.
 *
 * Rehearsal 2's real result carries eight `cantTell` reasons saying the examination was partial, and its log read
 * `a11ign: 1 finding(s) (1 serious)` with no word of them. The sentences come from `@a11ign/judge`'s real
 * `criterionOutcomes`, never retyped: if the producer's wording changes, the positive control goes red here rather
 * than the count going quietly to zero.
 */
const outcomesFrom = (over: Partial<Parameters<typeof criterionOutcomes>[0]>) =>
  criterionOutcomes({ capture: {} as never, findings: [], ...over });

test("#1563: both of the producer's partial-examination sentences are counted", () => {
  // A link sweep that ended having reached less than the census, and a formField sweep that stopped before the page.
  const outcomes = outcomesFrom({ completeness: { link: "elsewhere" }, truncatedSweeps: [{ type: "formField" }] });
  const held = outcomes.find((o) => o.criterion === "2.4.4")!;
  const stopped = outcomes.find((o) => o.criterion === "3.3.2")!;
  assert.equal(held.outcome, "cantTell", held.reason);
  assert.equal(stopped.outcome, "cantTell", stopped.reason);
  assert.notEqual(held.reason, stopped.reason, "the two producer sentences, not one of them twice");
  assert.equal(partialExaminationCount([held]), 1, `the held sweep's sentence: ${held.reason}`);
  assert.equal(partialExaminationCount([stopped]), 1, `the stopped sweep's sentence: ${stopped.reason}`);
});

test("#1563: the producer's OTHER undetermined reasons are not counted -- the control for the absence", () => {
  const outcomes = outcomesFrom({
    ruleLayer: { "1.4.3": "clean" }, abstained: false,
    notExamined: { control: "YouTube Home, link", channels: ["link"] },
  });
  const undetermined = outcomes.filter((o) => o.outcome === "cantTell");
  assert.ok(undetermined.length >= 2, "the population is not empty: the rule layer's and the left-site reasons");
  assert.equal(partialExaminationCount(outcomes), 0, undetermined.map((o) => o.reason).join("\n"));
  const result = withOutcomes(outcomes);
  assert.equal(logLines(result, "never").length, 1, "no partial line in the log");
  assert.doesNotMatch(renderSummary(result), /known to be partial/);
  assert.equal(partialExaminationCount(undefined), 0, "and a result with no outcomes counts nothing");
});

/**
 * #1563 ACCEPTANCE: rehearsal 2's real `a11ign-result.json` (run 34767932873, committed verbatim under `fixtures/`):
 * 55 outcomes, 19 referred, 8 of them resting on an examination known to be partial.
 */
/** Every WCAG 2.2 A/AA success criterion gets an outcome, so a whole result carries this many. */
const WCAG_22_AA_CRITERIA = 55;

test("#1563: rehearsal 2's real result counts its eight partial criteria in the log AND the summary", () => {
  const file = new URL("../fixtures/rehearsal2-34767932873-a11ign-result.json", import.meta.url);
  const rehearsal2 = JSON.parse(readFileSync(file, "utf8")) as RunResult;
  assert.equal(rehearsal2.outcomes?.length, WCAG_22_AA_CRITERIA, "the fixture as committed");
  // #1366 MOVED THE SECOND LINE: rehearsal 2's one finding is mapped `secondary` (its 2.4.2 outcome is `cantTell`),
  // so it is counted as a referral, never as "1 serious" -- the reading the rehearsal's reader took as a failure.
  assert.deepEqual(logLines(rehearsal2, "never"), [
    "a11ign: 8 criteria rest on an examination known to be partial -- see the artifact",
    "a11ign: 1 finding(s) (1 referred); fail-on=never",
  ]);
  const md = renderSummary(rehearsal2);
  assert.match(md, /\*\*Not determined:\*\* 19 criteria we cover were referred/);
  assert.match(md, /\*\*8 of the referred criteria rest on an examination known to be partial:\*\*/);
});

test("a run where everything WAS determined adds no noise", () => {
  const md = renderSummary(withOutcomes([
    { criterion: "4.1.2", outcome: "passed", reason: "examined in full" },
    { criterion: "1.1.1", outcome: "inapplicable", reason: "no images" },
  ]));
  assert.doesNotMatch(md, /Not determined/);
});

// #1388: rehearsal 3's committed artifact, read in place: its three axe findings all sit inside the embedded YouTube player
// on w3.org/WAI (targets ["iframe", …]), and the result records no frame origin.
const rehearsal3Rules = (): RunResult => JSON.parse(readFileSync(
  new URL("../fixtures/rehearsal3-34774183433-a11ign-result.json", import.meta.url), "utf8")) as RunResult;
const ruleRow = (rule: string, target: unknown[]) =>
  ({ impact: "serious", wcag: ["4.1.2"], rule, help: `${rule} help`, nodes: [{ target }] });
const ruleLayer = (out: string): string => out.slice(out.indexOf("**Rule layer (axe-core)"));
/** The three axe findings on rehearsal 3's committed artifact, every one inside the YouTube player's frame (measured). */
const REHEARSAL3_FRAME_ROWS = 3;

test("#1388: rehearsal 3's frame-hosted axe findings are counted, marked and caveated as inside a frame", () => {
  const out = ruleLayer(renderSummary(rehearsal3Rules()));
  const n = REHEARSAL3_FRAME_ROWS;
  assert.match(out, new RegExp(`^\\*\\*Rule layer \\(axe-core\\): ${n} violation\\(s\\), ${n} inside a frame\\*\\*`));
  assert.equal(out.split("\n").filter((line) => line.includes("_(in a frame; origin not examined)_")).length, n,
    "every frame row is marked");
  assert.match(out, /A row marked \*\*in a frame\*\* concerns content inside an embedded frame/);
  assert.match(out, /may be third-party content/, "it says MAY be: the result records a frame, never whose");
});

test("#1388: a top-level axe finding renders unmarked, with no split count and no caveat", () => {
  const out = ruleLayer(renderSummary(result({ ruleBased: [ruleRow("color-contrast", ["#main > p"])] })));
  assert.match(out, /^\*\*Rule layer \(axe-core\): 1 violation\(s\)\*\*/);
  assert.doesNotMatch(out, /in a frame/);
});

test("#1388: a mixed table splits the count and marks only the frame row", () => {
  const out = ruleLayer(renderSummary(result({ ruleBased: [
    ruleRow("button-name", ["iframe", ".player"]), ruleRow("color-contrast", ["#main > p"]),
  ] })));
  assert.match(out, /^\*\*Rule layer \(axe-core\): 2 violation\(s\), 1 inside a frame\*\*/);
  const rows = out.split("\n").filter((line) => line.startsWith("| serious"));
  assert.deepEqual(rows.map((line) => line.includes("in a frame")), [true, false]);
  assert.match(out, /A row marked \*\*in a frame\*\*/);
});

test("#1388: a shadow-DOM target is one element, not a frame, and is not marked", () => {
  const out = ruleLayer(renderSummary(result({ ruleBased: [ruleRow("label", [["#host", "input"]])] })));
  assert.match(out, /^\*\*Rule layer \(axe-core\): 1 violation\(s\)\*\*/);
  assert.doesNotMatch(out, /in a frame/);
});

test("#1388: a row with no nodes (an older result) cannot be told, and is not marked", () => {
  const out = ruleLayer(renderSummary(result({ ruleBased: [{ impact: "minor", wcag: [], rule: "region", help: "h" }] })));
  assert.doesNotMatch(out, /in a frame/);
});

// --- #1391: a state change announced correctly is shown as evidence observed, never as a pass ---

/** A real capture's pair: the tutorial disclosure the lab's eval corpus records as GOOD. */
const DISCLOSURE_GOOD = (() => {
  const file = new URL("../../../lab/src/eval/fixtures/tutorials/disclosure-good.json", import.meta.url);
  const [pair] = (JSON.parse(readFileSync(file, "utf8")) as { interaction: { stateChanges: { control: string; after: string }[] } })
    .interaction.stateChanges;
  return pair;
})();

test("#1391: an observed state change is shown with BOTH announcements quoted verbatim", () => {
  assert.equal(DISCLOSURE_GOOD.control, "How do I reset my password?, button, collapsed", "the fixture as committed");
  const md = renderSummary(result(), { stateChangesObserved: [{ ...DISCLOSURE_GOOD, from: "collapsed", to: "expanded" }] });
  assert.match(md, /\*\*Evidence observed: 1 state change\(s\) the screen reader announced after activation\*\*/);
  assert.ok(md.includes(`\`${DISCLOSURE_GOOD.control}\` → \`${DISCLOSURE_GOOD.after}\` (collapsed → expanded)`), md);
});

test("#1391: the section is EVIDENCE, never a pass -- no criterion is named and nothing is said to pass", () => {
  const md = renderSummary(result(), { stateChangesObserved: [{ ...DISCLOSURE_GOOD, from: "collapsed", to: "expanded" }] });
  const section = md.slice(md.indexOf("**Evidence observed"), md.indexOf("</sub>", md.indexOf("**Evidence observed")));
  assert.ok(section.length > 0, "the positive control: the section is there to read");
  assert.doesNotMatch(section, /\b\d\.\d\.\d{1,2}\b|\bpass(ed|es)?\b|conform/i,
    "ADR 0021 gives the rule the right to conclude; one clean control is not a result for the page");
});

test("#1391: no list and an EMPTY list render exactly today's report -- the control for the absence", () => {
  const today = renderSummary(result());
  assert.equal(renderSummary(result(), { stateChangesObserved: [] }), today);
  assert.equal(renderSummary(result(), { stateChangesObserved: undefined }), today);
  assert.doesNotMatch(today, /Evidence observed/);
});

/** Two code spans open and close with four backticks, which split a line into five pieces. */
const PIECES_AROUND_TWO_CODE_SPANS = 5;

test("#1391: a pipe, a newline or a backtick in an announcement cannot break the markdown", () => {
  const md = renderSummary(result(), { stateChangesObserved: [
    { control: "A | B, button,\ncollapsed", after: "A `x` B, button, focused, expanded", from: "collapsed", to: "expanded" },
  ] });
  const line = md.split("\n").find((l) => l.startsWith("- `A")) ?? "";
  assert.ok(line.includes("A \\| B, button, collapsed"), line);
  assert.ok(line.includes("A 'x' B, button, focused, expanded"), line);
  assert.equal(line.split("`").length, PIECES_AROUND_TWO_CODE_SPANS, `exactly two code spans on the line: ${line}`);
});
