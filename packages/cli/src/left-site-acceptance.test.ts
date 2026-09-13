// #1363 ACCEPTANCE: rehearsal 2's two real artifacts, driven through the real producer.
//
// Runs 34767932873 and 34768529975 in DanBeckDev/a11ign-v1-rehearsal ran the documented page and task,
// `https://www.w3.org/WAI` with "Learn about web accessibility". The probe opened the W3C's embedded YouTube
// player, the tab became youtube.com, and the report attributed what it then found to w3.org. Both
// `a11ign-result.json` files are committed verbatim under `fixtures/`.
//
// WHAT CAN BE DRIVEN FROM AN ARTIFACT, and what cannot: the Action's JSON carries the capture's transcript,
// structure and interaction, so the CLI's own cut (`examineWithinTheSite`), the rules layer (`ruleFindings`),
// the conformance scope (`conformanceFor`), the log line and the summary run on it for real. The trained
// scorer's half of the verdict needs its model runtime, and the capture's diagnostics were never uploaded, so
// neither is re-run here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { leftSite, withinTheSite } from "@a11ign/evidence";
import { stripComments } from "@a11ign/evidence/source-text";
import { oracleCounts } from "@a11ign/evidence/verify";
import { ruleFindings } from "@a11ign/judge/rules";
import { conformanceFor, examineWithinTheSite, type CaptureResponse } from "./cli.js";
import { logLines, renderSummary, type RunResult } from "./action/summary.js";

const RUNS = ["34767932873", "34768529975"] as const;
const EMBED = "main landmark, Web Accessibility Perspectives: Video Captions, region, Video, frame, clickable, "
  + "thumbnail-image, graphic, button";

function resultOf(run: string): RunResult & { structure: unknown; interaction: unknown; environment: unknown } {
  const file = new URL(`./fixtures/rehearsal2-${run}-a11ign-result.json`, import.meta.url);
  return JSON.parse(readFileSync(file, "utf8"));
}

/** The capture half of an Action result: exactly the fields the CLI copied out of the capture. */
function captureOf(result: ReturnType<typeof resultOf>): CaptureResponse {
  return {
    url: result.url, screenReader: result.screenReader, transcript: result.transcript ?? [],
    structure: result.structure, interaction: result.interaction, environment: result.environment,
  } as CaptureResponse;
}

/** The rules layer, given exactly what `cli.ts` gives `judge()`. */
function rulesOn(capture: CaptureResponse) {
  return ruleFindings({
    url: capture.url, screenReader: capture.screenReader, transcript: capture.transcript,
    structure: capture.structure, interaction: capture.interaction, ...oracleCounts(capture),
  } as Parameters<typeof ruleFindings>[0]);
}

const mentionsYouTube = (finding: unknown): boolean => /you ?tube/i.test(JSON.stringify(finding));

for (const run of RUNS) {
  test(`#1363 ACCEPTANCE (run ${run}): the excursion is found, at the embedded player`, () => {
    const left = leftSite(captureOf(resultOf(run)));
    assert.ok(left, "an activation that opened a new window must end the examination");
    assert.equal(left.control, EMBED);
    assert.equal(left.source, "derived");
    assert.equal(left.to, "https://www.youtube.com");
  });

  test(`#1363 ACCEPTANCE (run ${run}): nothing observed after the excursion is attributed to w3.org`, () => {
    const capture = captureOf(resultOf(run));
    // POSITIVE CONTROL: on the whole capture the rules layer reproduces the rehearsal's attribution, so the
    // absence below is the cut's doing and not a rules layer that simply never fires on this page.
    const uncut = rulesOn(capture);
    assert.ok(uncut.some(mentionsYouTube),
      `the uncut capture must reproduce a finding about youtube.com; got ${JSON.stringify(uncut.map((f) => f.wcag))}`);

    const { capture: within, notExamined } = withinTheSite(capture, leftSite(capture)!);
    const cut = rulesOn(within);
    assert.deepEqual(cut.filter(mentionsYouTube), [], "no finding after the cut is about youtube.com");
    for (const channel of ["links", "focusOrder", "routeChange", "postSubmitFields"]) {
      assert.ok(notExamined.includes(channel), `${channel} ran after the excursion and must be NOT EXAMINED`);
    }
    assert.deepEqual(within.structure?.formFields, [EMBED], "w3.org's census counts one form field: this one");
  });

  test(`#1363 ACCEPTANCE (run ${run}): the CLI's own cut is the one it builds the report from`, () => {
    const { left, notExamined, examined } = examineWithinTheSite(captureOf(resultOf(run)));
    assert.equal(left?.control, EMBED);
    assert.deepEqual(rulesOn(examined).filter(mentionsYouTube), [], "the CLI's examined capture carries no youtube.com");
    assert.ok(notExamined.includes("links"));
  });

  test(`#1363 ACCEPTANCE (run ${run}): Requirement 2 says where the examination ended`, () => {
    const capture = captureOf(resultOf(run));
    const left = leftSite(capture)!;
    const { capture: within, notExamined } = withinTheSite(capture, left);
    const fullPages = conformanceFor(within, null, { control: left.control, notExamined })
      .find((r) => r.number === 2)!;
    assert.match(fullPages.limitation, /The examination ENDED when activating/);
    assert.ok(fullPages.limitation.includes(EMBED), "the control is named");
    assert.match(fullPages.limitation, /NOT EXAMINED, because they would have run afterwards: [^.]*\blinks\b/);
    assert.doesNotMatch(fullPages.establishes, /examined in full/);
  });

  test(`#1363 ACCEPTANCE (run ${run}): the one-line log and the summary say so`, () => {
    const result = resultOf(run);
    // TODAY'S LINE, from the artifact as it was published: the control for the wording below.
    assert.deepEqual(logLines(result, "never"), ["a11ign: 1 finding(s) (1 serious); fail-on=never"]);

    const capture = captureOf(result);
    const left = leftSite(capture)!;
    const fixed: RunResult = {
      ...result,
      verdict: { ...result.verdict, findings: result.verdict.findings.filter((f) => !mentionsYouTube(f)) },
      leftSite: { control: left.control, to: left.to, source: left.source },
    };
    const [first, second] = logLines(fixed, "never");
    assert.equal(first, `a11ign: examination ENDED -- left the site at ${JSON.stringify(EMBED)} `
      + "(to https://www.youtube.com); everything after it was NOT EXAMINED");
    assert.equal(second, "a11ign: 0 finding(s) (none) in what was examined; fail-on=never");
    assert.match(renderSummary(fixed), /\*\*The examination ended early\.\*\* Activating/);
  });
}

/**
 * THE CLI'S WIRING, READ FROM THE SOURCE with comments stripped. `runWitness` needs a live capture worker, so no
 * test can call it; what this pins is the one fact that decides the defect -- every consumer after the cut is
 * handed `examined`, never the whole capture. Reverting any one of them to `cap` reattributes youtube.com.
 */
test("#1363 WIRING: runWitness judges, scopes, scores and reports the CUT capture, never the whole one", () => {
  const source = stripComments(readFileSync(new URL("./cli.ts", import.meta.url), "utf8"));
  const start = source.indexOf("async function runWitness(");
  assert.ok(start >= 0, "cli.ts no longer declares runWitness");
  const body = source.slice(start, source.indexOf("\n}\n", start));
  assert.match(body, /const \{ left, notExamined, examined \} = examineWithinTheSite\(cap\);/);
  assert.match(body, /await judge\(\{\s*url: examined\.url,[\s\S]*?structure: examined\.structure,\s*interaction: examined\.interaction,/);
  assert.match(body, /\.\.\.oracleCounts\(examined\),\s*\}\);/);
  assert.match(body, /conformanceFor\(examined, ruleFindings, left && \{/);
  assert.match(body, /criterionOutcomes\(\{\s*capture: examined,/);
  assert.match(body, /printJson\(\{[^}]*cap: examined,[^}]*leftSite: left,/);
});
