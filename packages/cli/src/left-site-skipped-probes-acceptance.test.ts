// #1377 ACCEPTANCE: a LIVE sweep excursion's skipped probes read NOT EXAMINED, never "the page exposed nothing".
//
// Rehearsal 2's run 34767932873 (committed under `fixtures/`) left the site at the W3C's embedded YouTube player
// during the form-field sweep. That artifact predates the recorded excursion, so here it is given the shape a LIVE
// capture has: `interaction.leftSite` recorded in the sweep, and the keys the worker's `interactionEvidence` omits
// when the focus pass is skipped (it writes `routeChange`, `typedFeedback`, `focusContext`, `focusReveal` and
// `focusEvents` only when truthy) removed. That is worker-judge's reproduction on #1376 (5655101732), where 1.4.13,
// 3.2.1 and 3.2.2 read `inapplicable`.
//
// The outcome is judge's `criterionOutcomes`, which `@a11ign/evidence` cannot import -- so this lives in the CLI, over
// the real cut (`withinTheSite`) and the real outcomes, the `left-site-acceptance.test.ts` pattern.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { leftSite, withinTheSite } from "@a11ign/evidence";
import { oracleCounts } from "@a11ign/evidence/verify";
import { sweepOutcomes, truncatedSweeps } from "@a11ign/evidence/conformance";
import { ruleFindings } from "@a11ign/judge/rules";
import { criterionOutcomes } from "@a11ign/judge/outcomes";
import type { CaptureResponse } from "./cli.js";

const RUN = "34767932873";
const EMBED = "main landmark, Web Accessibility Perspectives: Video Captions, region, Video, frame, clickable, "
  + "thumbnail-image, graphic, button";
/** What `interactionEvidence` leaves out when the focus pass and the route probe never ran. */
const OMITTED_WHEN_SKIPPED = ["routeChange", "typedFeedback", "focusContext", "focusReveal", "focusEvents"] as const;

/** The artifact as a LIVE sweep excursion: recorded in the sweep, with the skipped probes' keys absent. */
function liveExcursion(): CaptureResponse {
  const result = JSON.parse(readFileSync(new URL(`./fixtures/rehearsal2-${RUN}-a11ign-result.json`, import.meta.url), "utf8"));
  const interaction: Record<string, unknown> = { ...result.interaction };
  for (const key of OMITTED_WHEN_SKIPPED) delete interaction[key];
  interaction.leftSite = { control: EMBED, kind: "taskButton", phase: "sweep", from: result.url,
    to: "https://www.youtube.com", evidence: "Opening new window" };
  return {
    url: result.url, screenReader: result.screenReader, transcript: result.transcript ?? [],
    structure: result.structure, interaction, environment: result.environment,
  } as CaptureResponse;
}

/** The per-criterion outcomes as the CLI computes them, with the rules layer's findings standing in for the verdict. */
function outcomesOn(capture: CaptureResponse, notExamined: { control: string; channels: readonly string[] }) {
  const findings = ruleFindings({
    url: capture.url, screenReader: capture.screenReader, transcript: capture.transcript,
    structure: capture.structure, interaction: capture.interaction, ...oracleCounts(capture),
  } as Parameters<typeof ruleFindings>[0]);
  return criterionOutcomes({
    capture, findings, abstained: false,
    truncatedSweeps: truncatedSweeps(sweepOutcomes((capture as { diagnostics?: unknown[] }).diagnostics ?? [])),
    completeness: oracleCounts(capture).completeness, notExamined,
  } as Parameters<typeof criterionOutcomes>[0]);
}

function examined() {
  const capture = liveExcursion();
  const left = leftSite(capture as never)!;
  const { capture: within, notExamined } = withinTheSite(capture as never, left);
  const outcomes = outcomesOn(within as CaptureResponse, { control: left.control, channels: notExamined });
  const outcomeOf = (criterion: string) => outcomes.find((o: { criterion: string }) => o.criterion === criterion)!;
  return { capture, left, notExamined, outcomeOf };
}

test("#1377 ACCEPTANCE: the live shape really lacks the skipped probes' keys, and the excursion is RECORDED", () => {
  // THE POSITIVE CONTROL: without it, an artifact still carrying those keys would pass for the old reason.
  const { capture, left } = examined();
  const interaction = (capture.interaction ?? {}) as Record<string, unknown>;
  assert.deepEqual(OMITTED_WHEN_SKIPPED.filter((key) => key in interaction), [], "none of the omitted keys is present");
  assert.equal(left.source, "recorded");
  assert.equal(left.control, EMBED);
});

test("#1377 ACCEPTANCE: 1.4.13, 3.2.1 and 3.2.2 read cantTell naming where the examination ended", () => {
  const { notExamined, outcomeOf } = examined();
  for (const channel of ["focusReveal", "focusContext", "typedFeedback"]) {
    assert.ok(notExamined.includes(channel), `${channel} is NOT EXAMINED: ${notExamined.join(",")}`);
  }
  for (const criterion of ["1.4.13", "3.2.1", "3.2.2"]) {
    const outcome = outcomeOf(criterion);
    assert.equal(outcome.outcome, "cantTell", `${criterion}: ${outcome.reason}`);
    assert.ok(outcome.reason.includes(`left the site at ${JSON.stringify(EMBED)}`), `${criterion} names the embed`);
    assert.doesNotMatch(outcome.reason, /exposed nothing of the kind/i, `${criterion} is not read as an empty page`);
  }
});

test("#1377 CONTROL: 2.1.2, 2.4.2, 2.4.4, 2.4.7 and 3.3.3 still read cantTell, left the site", () => {
  const { outcomeOf } = examined();
  for (const criterion of ["2.1.2", "2.4.2", "2.4.4", "2.4.7", "3.3.3"]) {
    const outcome = outcomeOf(criterion);
    assert.equal(outcome.outcome, "cantTell", `${criterion}: ${outcome.reason}`);
    assert.ok(outcome.reason.includes("left the site"), `${criterion}: ${outcome.reason}`);
  }
});
