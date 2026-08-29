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
import type { CaptureStructure } from "@a11y-witness/evidence";
import { annotateCapture } from "@a11y-witness/evidence";

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
  /**
   * The NAMED fields derived from the wire type — known-gaps §15 — with the index signature kept.
   *
   * This is an allowlist of what the model READS, not a description of what a capture carries, which is
   * why it keeps `[other: string]: unknown`: anything else on a capture passes through untyped and
   * unread. Deriving the three that ARE read means they cannot drift from the wire, while the exclusion
   * of `landmarks` stays visible as the decision this file argues for at length — the encoder's text
   * units exclude it because the same unchanged page gave `[]` in one capture and `["Cycling guide"]` in
   * the next, swinging a conformant page's 3.3.2 score across the threshold.
   */
  structure?: (Partial<Pick<CaptureStructure, "headings" | "formFields" | "tableCells">>
    & { [other: string]: unknown }) | null;
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

/**
 * Which capture PRODUCER populates each channel — the sweep type, or the read-through.
 *
 * Needed to answer "was the evidence the model sees complete?". `captureWasTruncated`
 * (`@a11y-witness/evidence/verify`) reports incomplete channels by sweep type, and most of what it reports
 * never reaches a model: of 26 real-page captures ALL 26 were truncated somewhere, but only 16 on a channel
 * the model reads. `link`, `list`, `graphic` and `landmark` sweeps starve first on a big page and none of
 * them is an input, so gating on them would discard the whole corpus for evidence nobody consumes.
 *
 * Keyed by producer rather than by channel because that is the direction a caller needs: it holds a
 * truncation report keyed on sweep type and has to decide whether to care.
 */
export const CHANNEL_BY_PRODUCER: Readonly<Record<string, string>> = Object.freeze({
  "read-through": "transcript",
  heading: "heading-navigation",
  formField: "form-navigation",
  tableCell: "table-cell-navigation",
});

/** True when this producer's truncation would leave a gap in what the model reads. */
export const producerFeedsModel = (producer: string): boolean =>
  Object.hasOwn(CHANNEL_BY_PRODUCER, producer);

/**
 * THE MODEL'S INPUT, built in ONE place.
 *
 * It was built twice — once in `export-screenreader-dataset.mjs` for corpus records and once in
 * `build-realism-tier.mjs` for real-page records — with no relationship between the copies. So when the
 * featurizer started reading a `parsed` block, wiring it into three callers still missed the fourth, and
 * training died on a real-page record. The duplication is what made the miss possible; the fix is not to
 * remember the fourth site but to have one.
 *
 * `annotateCapture` is called HERE rather than by each caller, for the same reason.
 */
/**
 * The shape of `modelInput`'s output. Bumped when a consumer would MISREAD an older record.
 *
 * Both dataset failures on 2026-08-24 were contract staleness, not content staleness: a `with-realism.jsonl`
 * and an acceptance dataset built before `parsed` existed. Each died deep in the featurizer with a stack
 * trace, one job at a time, and each cost a full train or evaluate cycle to discover.
 *
 * Recorded per record so any consumer can refuse at LOAD, naming the dataset and the command that rebuilds
 * it. A hash of the source would not have caught either: the sources had not changed, the CONTRACT had.
 */
export const MODEL_INPUT_VERSION = 2;

export function modelInput(capture: ScorableCapture): Record<string, unknown> {
  const annotated = annotateCapture(capture as unknown as Record<string, unknown>);
  return {
    screenReader: (capture as { screenReader?: string }).screenReader ?? "unknown",
    transcript: capture.transcript ?? [],
    structure: capture.structure ?? null,
    interaction: capture.interaction ?? null,
    evidenceUnits: evidenceUnits(capture),
    evidenceText: captureEvidenceText(capture),
    parsed: (annotated as { parsed: unknown }).parsed,
    inputVersion: MODEL_INPUT_VERSION,
  };
}
