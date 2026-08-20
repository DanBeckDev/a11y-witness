/**
 * THE MODEL'S INPUT CONTRACT: which capture fields become evidence, and under which channel name.
 *
 * It lives in this package, beside the weights, because **if it changes the weights break.** The featurizer
 * embeds `f"{channel}: {text}"` for every unit (`python/screenreader_features.py`), so a channel name is
 * tokens in every feature vector, versioned by `FEATURE_SCHEMA_VERSION`. ADR 0004 puts the model in its own
 * package for exactly this reason — "the weights are the API; a retrain is a breaking change to scores" —
 * and a contract that decides feature values has to version with them or the two can drift apart while both
 * look current.
 *
 * ## It was in `case-matrix.mjs`, and that is why it got duplicated
 *
 * The channel table sat inside a 1,700-line generator of SYNTHETIC test cases. So when a consumer needed
 * evidence units for REAL pages, it wrote its own table rather than importing from a file about synthetic
 * cases — and the two disagreed: `form-navigation` against `form-field-navigation`, `transcript` and
 * `control-navigation` and `post-submit-navigation` missing entirely, and four channels
 * (`landmark`/`link`/`list`/`graphic-navigation`) that existed only on the real-page side.
 *
 * The consequence was not a cosmetic mismatch. Four channel tokens appeared only on real records and three
 * only on synthetic ones, so a linear head could separate the two populations on channel names alone — the
 * strongest possible shortcut feature, and a systematic one. `build-realism-tier.mjs` even carried a comment
 * stating the hazard ("the channel names must match the generator's exactly ... and nothing would report
 * that") directly above the table that had it.
 *
 * The misplacement caused the duplication, so the fix is the move, not a second round of care.
 *
 * ## The parameter type is deliberately narrow
 *
 * It declares the fields the featurizer reads rather than importing `CaptureResult`, for two reasons. This
 * package has ZERO dependencies and that is worth keeping. And a capture also carries `url`, `html` and
 * `diagnostics`, which `assertModelBoundary` forbids the model from ever seeing — so naming only the
 * readable fields makes the model-input boundary explicit in the type system instead of in a lint rule.
 * TypeScript is structural, so a real `CaptureResult` satisfies this without a cast.
 */

/** One channel-tagged piece of evidence. The featurizer's unit of input. */
export interface EvidenceUnit {
  channel: string;
  text: string;
}

/** A before/after pair as the capture records it. */
interface AnnouncedChange {
  control?: string;
  after?: string | null;
}

/** Exactly the capture fields the model is allowed to see. See the note above on why this is not `CaptureResult`. */
export interface ScorableCapture {
  transcript?: string[];
  structure?: {
    headings?: string[];
    formFields?: string[];
    tableCells?: string[];
    [other: string]: unknown;
  } | null;
  interaction?: {
    controls?: string[];
    stateChanges?: AnnouncedChange[];
    formChanges?: AnnouncedChange[];
    postSubmitFields?: string[];
    [other: string]: unknown;
  } | null;
}

function appendTextUnits(units: EvidenceUnit[], channel: string, values: string[] | undefined): void {
  for (const text of values || []) {
    if (typeof text === "string" && text.length > 0) units.push({ channel, text });
  }
}

function appendChangeUnits(units: EvidenceUnit[], channel: string, changes: AnnouncedChange[] | undefined): void {
  for (const { control, after } of changes || []) {
    const text = control + " -> " + after;
    if (text.length > 0) units.push({ channel, text });
  }
}

/**
 * The capture, as channel-tagged evidence units.
 *
 * ONE definition, for every producer — synthetic cases, real pages, and anything added later. A second
 * table is the defect; see the module comment.
 */
export function evidenceUnits(capture: ScorableCapture): EvidenceUnit[] {
  const units: EvidenceUnit[] = [];
  appendTextUnits(units, "transcript", capture.transcript);
  appendTextUnits(units, "heading-navigation", capture.structure?.headings);
  // `landmarks` is deliberately NOT a model feature.
  //
  // Whether the landmark sweep reaches a landmark that ENCLOSES the caret depends on where the previous
  // sweep left it, and that varies. Measured on the same unchanged page: `[]` in one capture and
  // `["Cycling guide"]` (the h1, which is what NVDA announces on entering `main`) in the next. Fed to
  // the encoder, that swung a CONFORMANT page's 3.3.2 score from 0.004 to 0.39 across a 0.35 threshold,
  // so the same page was judged clean once and failing once -- on two acceptance cases.
  //
  // Anchoring does not rescue it: measured over three runs per page it left one page still varying
  // (1 of 3) and made another LOSE a landmark it had previously found. The field cannot currently be
  // both deterministic and complete, so it must not be an input to a scorer.
  //
  // This is the same call the exporter already makes in excluding `1.3.1:missing-landmark`, for the same
  // stated reason -- "not a reliably inferable screen-reader announcement". The field stays in the
  // capture and stays available to the dataset signals, which read `capture.structure.landmarks`
  // directly (`structureIsEmpty`) and are unaffected; and `structureCrossCheck` now reports, per
  // capture, whether the sweep was complete.
  //
  // `links`, `lists` and `graphics` are absent for a DIFFERENT and equally deliberate reason: they are the
  // channels the sweeps truncate first on a large page. Of 26 real-page captures, 9 reported `lists: 0`
  // and every one of those had a list sweep that stopped on `deadline` -- so the field would carry "this
  // page has no lists" as evidence when the truth is "we ran out of budget before asking". A real-page
  // consumer added all four of these channels; that is what this comment exists to stop happening again.
  appendTextUnits(units, "form-navigation", capture.structure?.formFields);
  appendTextUnits(units, "table-cell-navigation", capture.structure?.tableCells);
  appendTextUnits(units, "control-navigation", capture.interaction?.controls);
  appendChangeUnits(units, "state-change", capture.interaction?.stateChanges);
  appendChangeUnits(units, "form-change", capture.interaction?.formChanges);
  appendTextUnits(units, "post-submit-navigation", capture.interaction?.postSubmitFields);
  return units;
}

/** The same evidence as one blob, for consumers that want text rather than units. */
export function captureEvidenceText(capture: ScorableCapture): string {
  return evidenceUnits(capture).map(({ text }) => text).join("\n");
}
