/**
 * Did we actually LOOK at the thing we are about to accuse?
 *
 * ## The failure this exists for
 *
 * A scorer trained on this corpus reported `1.3.1:unassociated-table` at 0.946 on
 * `w3.org/WAI/demos/bad/after/survey.html` — a page W3C publishes as the FIXED version of its own bad
 * demo. The evidence it fired on:
 *
 *     transcript:  "table, with 3 rows and 7 columns, caption, What is your favorite …"
 *     transcript:  "row 2, , column 1, hate it"
 *     structure.tableCells:  []            <- the cell sweep recorded NOTHING
 *
 * So the page announced 21 cells, the capture examined two of them, and both were row-header cells that
 * have no header to announce. The model saw "cells announced by position with no header name" and called
 * the table unassociated. It was reading UNEXAMINED as FAILING.
 *
 * Two fixes were tried and MEASUREMENT rejected both, which is why this is not a regex change:
 *
 *   - Guarding column 1 the way `TABLE_DATA_ROW` already guards row 1: position-only evidence on corpus
 *     failures fell from 122 to 0. It would have silently destroyed the signal.
 *   - Requiring "no associated rows anywhere": the conformant page and all 61 corpus failures score
 *     identically, because neither shows an associated row when only column 1 was read.
 *
 * They are indistinguishable from the evidence. The difference is not in the page, it is in how much of
 * the page we managed to examine.
 *
 * ## Why this cannot live in the model
 *
 * The corpus cannot express incomplete evidence: 122 of 122 table captures announce their dimensions and
 * all 122 have complete sweeps, because corpus pages are small. An "evidence incomplete" feature would be
 * constant zero across every training record — a starved feature, which is ADR 0015's free veto, and which
 * `npm run corpus:starvation` would flag immediately. A head cannot learn to withhold on a condition it
 * has never once seen. So this is deterministic, outside the model, and no retrain can regress it.
 *
 * ## Why the abstention floor does not cover it
 *
 * The floor asks "is this page like my training data?" — that page scored 0.83, comfortably in support.
 * This asks "did the capture examine the thing being accused?". Two different questions, and only the
 * first was ever being asked.
 *
 * ## Where the numbers come from
 *
 * NVDA's own words, never an inference. It announces a table's dimensions ("with 3 rows and 7 columns")
 * and the worker already records a `structureCensus` from NVDA's Elements List — present in 200 of 200
 * corpus captures sampled. Both were computed every run and consumed by nothing, which is this repo's most
 * familiar shape: `crossCheckStructure` had been comparing exactly these numbers into an unread diagnostic.
 */

/** How much of one evidence channel the capture managed to examine. */
export interface ChannelCompleteness {
  /** What the page said was there, from NVDA's own announcement or census. `null` when unknowable. */
  expected: number | null;
  /** What the sweep actually recorded. */
  seen: number;
  /**
   * False only when we can SHOW we missed some. Unknowable expectation is not incompleteness — treating it
   * as such would suppress findings on every page whose census is silent, which is the opposite failure.
   */
  complete: boolean;
}

export type Completeness = Record<string, ChannelCompleteness>;

/** NVDA states a table's size when the caret enters it. This is ground truth for how many cells exist. */
const TABLE_DIMENSIONS = /\btable,?\s+with\s+(\d+)\s+rows?\s+and\s+(\d+)\s+columns?/i;

/**
 * A sweep that saw at least this fraction of what was announced counts as complete.
 *
 * Not 1.0. A sweep legitimately reports fewer cells than rows×columns — merged cells, a caption row, cells
 * NVDA groups — so demanding exactness would mark healthy captures incomplete and suppress real findings.
 * Measured: at this threshold, 122 of 122 corpus table captures are complete and the real page that caused
 * this file is 0 of 21, which is the separation the threshold has to make.
 */
const ENOUGH = 0.5;

interface DiagnosticEvent { event?: string; [key: string]: unknown }

function census(capture: Record<string, unknown>): Record<string, unknown> | null {
  const diagnostics = capture.diagnostics;
  if (!Array.isArray(diagnostics)) return null;
  const found = (diagnostics as DiagnosticEvent[])
    .find((entry) => entry && typeof entry === "object" && entry.event === "structureCensus");
  return found ?? null;
}

function transcriptLines(capture: Record<string, unknown>): string[] {
  const transcript = capture.transcript;
  return Array.isArray(transcript) ? transcript.filter((l): l is string => typeof l === "string") : [];
}

const countOf = (value: unknown): number => (Array.isArray(value) ? value.length : 0);

/** `expected` from the census, which counts elements NVDA's own Elements List reports. */
function fromCensus(counts: Record<string, unknown> | null, key: string, seen: number): ChannelCompleteness {
  const expected = typeof counts?.[key] === "number" ? (counts[key] as number) : null;
  return { expected, seen, complete: expected === null || seen >= expected * ENOUGH };
}

/**
 * How much of each channel this capture examined.
 *
 * Pure, and reads only what is already on disk — so it applies to the 2,122 existing captures with no
 * recapture and no `CAPTURE_PROTOCOL_VERSION` bump.
 */
export function evidenceCompleteness(capture: Record<string, unknown>): Completeness {
  const structure = (capture.structure ?? {}) as Record<string, unknown>;
  const counts = census(capture);

  const dimensions = transcriptLines(capture)
    .map((line) => TABLE_DIMENSIONS.exec(line))
    .find((match): match is RegExpExecArray => match !== null);
  const cellsExpected = dimensions ? Number(dimensions[1]) * Number(dimensions[2]) : null;
  const cellsSeen = countOf(structure.tableCells);

  return {
    // Tables are NOT in the census — it covers landmark, heading, link and graphic — so their expectation
    // comes from NVDA announcing the table's own dimensions. Adding tables to the census would be a better
    // source and is worth doing; this needs no capture change to work today.
    tableCells: {
      expected: cellsExpected,
      seen: cellsSeen,
      complete: cellsExpected === null || cellsSeen >= cellsExpected * ENOUGH,
    },
    links: fromCensus(counts, "link", countOf(structure.links)),
    headings: fromCensus(counts, "heading", countOf(structure.headings)),
    graphics: fromCensus(counts, "graphic", countOf(structure.graphics)),
    landmarks: fromCensus(counts, "landmark", countOf(structure.landmarks)),
  };
}

/**
 * Which channel a criterion's finding rests on.
 *
 * Declared per CRITERION rather than inferred, for the reason `rule-ownership.json` is declared: a mapping
 * nothing can contradict is a comment, and one derived from the feature list would silently follow the
 * features wherever they drifted.
 *
 * Only criteria whose evidence comes from a sweep that can TRUNCATE appear here. 3.3.1 and 4.1.3 rest on
 * interaction evidence, which is not a sweep and cannot be half-done — it either happened or the capture
 * says it did not.
 */
export const CRITERION_EVIDENCE: Readonly<Record<string, readonly string[]>> = Object.freeze({
  "1.3.1": ["tableCells", "headings"],
  "1.1.1": ["graphics"],
  "2.4.4": ["links"],
  "2.4.6": ["headings"],
});

/**
 * Split findings into those the capture can support and those it cannot.
 *
 * INCONCLUSIVE is a third answer and must never collapse into either of the others. Reported as a pass it
 * hides a real failure on exactly the large pages most worth auditing; reported as a failure it accuses a
 * publisher of something we did not look at, which is the worst error this tool can make.
 */
export function withheldForIncompleteEvidence(
  criteria: readonly string[], completeness: Completeness,
): { supported: string[]; inconclusive: { criterion: string; channel: string; seen: number; expected: number | null }[] } {
  const supported: string[] = [];
  const inconclusive: { criterion: string; channel: string; seen: number; expected: number | null }[] = [];
  for (const criterion of criteria) {
    const required = CRITERION_EVIDENCE[criterion] ?? [];
    const missing = required
      .map((channel) => ({ channel, state: completeness[channel] }))
      .find(({ state }) => state && !state.complete);
    if (missing?.state) {
      inconclusive.push({
        criterion, channel: missing.channel, seen: missing.state.seen, expected: missing.state.expected,
      });
    } else {
      supported.push(criterion);
    }
  }
  return { supported, inconclusive };
}
