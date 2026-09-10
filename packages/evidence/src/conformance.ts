/**
 * WCAG's five CONFORMANCE REQUIREMENTS, and what one run of this tool can honestly say about each.
 *
 * Every automated accessibility tool reports against success criteria — 1.1.1, 2.4.6, and so on. But
 * WCAG 2.x §5.2 puts five further requirements on any conformance claim, and they are the part that
 * decides whether a claim is valid at all:
 *
 *   1. Conformance Level    — every criterion at the claimed level is satisfied
 *   2. Full pages           — conformance is for a WHOLE page; you may not exclude part of it
 *   3. Complete processes    — every page in a process must conform
 *   4. Accessibility-supported ways of using technologies
 *   5. Non-Interference      — 1.4.2, 2.1.2, 2.2.2 and 2.3.1 apply to ALL content on the page, even
 *                              content not relied upon to meet any other criterion
 *
 * A tool cannot make a page conform. What it can do is never imply conformance it has not established,
 * and that is what this module is for: it turns each requirement into a pair of statements — what this
 * run DID establish, and what it did not. Both are always present. `everyRequirementStatesALimit` in the
 * tests enforces that, because the failure mode is not a wrong sentence, it is a missing one: a report
 * that lists findings and stops invites the reader to conclude the rest of the page is fine.
 *
 * This is the same rule the rest of the codebase already applies to a skipped axe run and to an
 * abstaining scorer — "UNCHECKED, not clean" — raised from individual criteria to the requirements that
 * govern the whole claim.
 */
import { WCAG_22_AA } from "./wcag.js";

/** WCAG 2.x §5.2.5. These four apply to ALL content, whether or not it is relied upon. */
import type { DocumentIdentity } from "./document-identity.js";
import { identitySentence } from "./document-identity.js";

export const NON_INTERFERENCE_CRITERIA = ["1.4.2", "2.1.2", "2.2.2", "2.3.1"] as const;

/**
 * Why one direction of a quick-navigation sweep stopped.
 *
 * `exhausted` ("no next heading") and `repeat` (the cursor did not move) are the sweep running out of
 * elements — the page ended first. Everything else is US stopping first, which is the distinction
 * Requirement 2 turns on: a sweep that hit its step cap examined PART of a page, and a report that does
 * not say so is claiming full-page coverage it does not have.
 */
export type SweepStop =
  | "exhausted" | "repeat"
  | "cap" | "deadline" | "error" | "silent" | "channelReset" | "focusModeStuck";

const SWEEP_RAN_OUT: readonly SweepStop[] = ["exhausted", "repeat"];

export interface SweepOutcome {
  /** The element type swept: "heading", "link", "landmark", ... */
  type: string;
  stop?: SweepStop | string;
  /**
   * How many quick-navigation trips THIS DIRECTION made, and how many distinct items the whole sweep
   * reached — #887. Optional, because a capture taken before they were read carries neither and must not
   * be told what it did not record.
   *
   * They are here because `stop` alone cannot answer whether a sweep that ran out ran out OF THE PAGE.
   * `exhausted` is NVDA's own "no next link", which is true about the caret's current scope — and on
   * `781-r1-hubspot/capture-1` that scope was an open chat dialog. A sweep cannot have visited more
   * elements than it made trips, so trips are the number that can contradict the claim.
   */
  trips?: number;
  found?: number;
  /**
   * WHAT THIS SWEEP WAS SEALED INSIDE — #897. `null` means the page was read and there was no modal;
   * `undefined` means nobody asked, which is every capture taken before the field existed.
   *
   * A screen reader's quick navigation is confined to an open modal, so `exhausted` inside one is true
   * about the dialog and not about the page. That is a stronger reason to withhold the full-page claim
   * than #887's trips-short arithmetic, and a different one — it says WHICH scope was examined.
   */
  openDialog?: string | null;
}

export interface ConformanceRequirement {
  number: 1 | 2 | 3 | 4 | 5;
  name: string;
  /** What this run did establish. Never empty. */
  establishes: string;
  /** What it did NOT establish. Never empty — see the module comment. */
  limitation: string;
}

export interface ConformanceScopeInput {
  /** Criteria this run was capable of producing a finding for. */
  assessedCriteria: readonly string[];
  /** One entry per swept element type per direction, from the capture's `sweep` diagnostics. */
  sweeps?: readonly SweepOutcome[];
  /** The screen reader that produced the evidence, with its version. */
  screenReader: string;
  /** The browser it drove, with its version, when known. */
  browser?: string | null;
  /** Did the rule-based (axe) layer run? It owns the visual criteria this one cannot perceive. */
  ruleLayerRan: boolean;
  /** Whether `census` counts distinct NAMES (comparable with the deduplicated sweep) or raw elements. */
  censusCountsDistinctNames?: boolean;
  /**
   * The browser's own count of elements per type, from the AX tree over CDP — the GROUND TRUTH.
   *
   * Without it, "examination was INCOMPLETE" is the strongest statement available, and that is a word where a
   * number belongs: a reader cannot tell whether a sweep missed two links or two hundred. `null` when the
   * census could not be taken, which must read as "coverage unknown" rather than as full coverage.
   */
  census?: Readonly<Record<string, number>> | null;
  /** How many DISTINCT items each sweep actually reached, from the capture's structure fields. */
  swept?: Readonly<Record<string, number>>;
  /**
   * The census's RAW element counts, before `distinct` is laid over them — and the per-type unnamed
   * counts that come with them (`graphicUnnamed`). See `censusElementCounts`.
   *
   * `census` above is the distinct-overlaid map and stays the basis for REACH. This is the basis for
   * NOT EXAMINED, and they are different questions: absent, both fall back to `census` exactly as before.
   */
  censusElements?: Readonly<Record<string, number>> | null;
  /**
   * THE PER-FIELD ACTIVATION'S OWN BUDGET, from the capture's `activationBudget` mark — #677 part 2.
   *
   * The activation is the only `onItem` any sweep carries and it costs 86-88% of the `formField` sweep,
   * so it gets a bounded share of the capture. When that share runs out the remaining controls are NOT
   * ACTIVATED, and the evidence they would have produced (`formChanges`, `stateChanges`) is absent for a
   * reason that has nothing to do with the page. `null`/absent means no budget was consulted — a page
   * with no form controls, or a configured form, which activates exactly what the author named.
   */
  activationBudget?: { fields: number, allowed: number, skipped: number, exhausted: boolean } | null;
  /**
   * WHICH DOCUMENT THIS RUN WAS SERVED — #687.
   *
   * Requirement 2's limitation has always said "one viewport, one state, one document" without ever
   * saying WHICH document, and two captures of one URL can describe different ones: measured on
   * `https://calendly.com/`, one capture was served Google's sign-in wall and the other
   * `calendly.com/scheduling`, both recorded under the requested URL. A reader told how many criteria
   * this run assessed deserves to know WHICH RENDER it assessed them against — a page with eleven
   * tabbable elements is a different subject from the one with ninety-eight, and the criteria count says
   * nothing about which was seen.
   *
   * Omitted (or `null`) leaves the sentence out entirely rather than asserting an identity nobody read.
   */
  documentIdentity?: DocumentIdentity | null;
  /**
   * `censusTargetMismatchReason`'s own sentence, when the census's CDP target could not be confirmed —
   * see that function's header. When set, the coverage sentence states this INSTEAD of computing
   * `sweepCoverage`, because the census it would compare against most likely describes a different
   * document. `null`/absent means the census (if any) is trusted.
   */
  censusMismatchReason?: string | null;
}

/** One element type's reach: how many the screen reader got to, against how many exist. */
export interface TypeCoverage {
  type: string;
  reached: number;
  present: number;
  /**
   * The denominator REACH is measured against: distinct names the sweep could ever have announced.
   *
   * Differs from `present` on any type with unnamed members — see `sweepCoverage` for the derivation and
   * why the two questions must not share a number. Equal to `present` when nothing says otherwise.
   */
  reachable: number;
  /** Did the sweep reach as many as the census counted? A COVERAGE question. */
  complete: boolean;
  /**
   * Did the sweep EXAMINE the page at all? A different question from `complete`, and #677 is the
   * distance between them: a sweep that never ran reports `reached: 0`, which reads as a coverage
   * shortfall on a page with none. Absent on captures predating the stop marks.
   */
  examined?: ExaminationState;
}

/**
 * Census key for each swept type. The two vocabularies differ, and mapping them wrongly would compare a
 * count to an unrelated one — which is worse than reporting nothing, because it looks authoritative.
 */
const CENSUS_KEY: Readonly<Record<string, string>> = {
  heading: "heading", landmark: "landmark", link: "link", graphic: "graphic",
};

/**
 * The RAW element count for a type, or `null` when the raw census was not supplied.
 *
 * `null` rather than a fallback, because the caller's fallback is a DIFFERENT number and saying so at the
 * call site is what stops the two being confused a year from now.
 */
function elementCountOf(
  elements: Readonly<Record<string, number>> | null, key: string,
): number | null {
  return typeof elements?.[key] === "number" ? elements[key] : null;
}

/**
 * WHAT THE SWEEP COULD EVER HAVE ANNOUNCED — the denominator for REACH, and not the same number as
 * `present`.
 *
 * `coverageSentence` promises "distinct announcements the screen reader produced against DISTINCT NAMES
 * the browser reports — like compared with like". On a page with unnamed elements it was not keeping that
 * promise, and the direction of the error invents a coverage shortfall in our own report.
 *
 * **`distinct` collapses by NAME, and an element with no name counts as its own.** Measured 2026-09-09:
 *
 *     calendly   graphic=63  graphicUnnamed=38  distinct.graphic=61   <- only two collapsed
 *     ikea       graphic=205 graphicUnnamed=0   distinct.graphic=165  <- forty collapsed, correctly
 *
 * So `distinct` is not wrong in general — it is exact where every element has a name, and inflated in
 * proportion to how many do not. Subtracting the unnamed count removes exactly that inflation and leaves
 * distinct names among NAMED elements: calendly's graphics become `61 - 38 = 23`, IKEA's stay at 165.
 *
 * **A NAMELESS ELEMENT IS EXCLUDED FROM REACH AND NEVER FROM ASSESSMENT, and the two live one line
 * apart.** 1.1.1 is one of the four subtypes this project may ASSERT, and its evidence is
 * `census.graphicUnnamed` — reached without the sweep at all. Dropping unnamed graphics from a coverage
 * denominator is honest, because a sweep structurally cannot announce them; dropping them from the
 * finding would delete the finding.
 *
 * Falls back to `distinct` when the raw census is absent, so a capture predating it reports exactly what
 * it always did, and `coverageSentence` says which basis it used.
 */
function reachableCountOf(
  distinctCount: number, elements: Readonly<Record<string, number>> | null, key: string,
): number {
  const unnamed = elementCountOf(elements, `${key}Unnamed`);
  // NEVER BELOW ZERO. The two numbers come from one mark and cannot disagree today, but a denominator of
  // -3 would render as a reach of "10/-3" rather than failing, and a nonsense number in a report is worse
  // than a conservative one.
  return unnamed === null ? distinctCount : Math.max(0, distinctCount - unnamed);
}

/**
 * What fraction of the page each sweep reached, for the types where ground truth exists.
 *
 * Only types present in BOTH vocabularies are reported. `formField`, `list` and `tableCell` have no census
 * entry, so nothing is claimed about them — an omission is honest, an invented denominator is not.
 *
 * `reached > present` is possible and is NOT treated as an error: a sweep walks what the screen reader
 * exposes, the census walks the AX tree, and the two disagree legitimately (a link inside a list may be
 * announced twice). It is reported as complete, because reaching more than the census counted is not a
 * coverage gap.
 */
export function sweepCoverage(input: ConformanceScopeInput): TypeCoverage[] {
  const census = input.census;
  if (!census) return [];
  const swept = input.swept ?? {};
  const elements = input.censusElements ?? null;
  return Object.entries(CENSUS_KEY)
    .filter(([type, key]) => typeof census[key] === "number" && typeof swept[type] === "number")
    .map(([type, key]) => ({
      type,
      reached: swept[type] as number,
      // THE RAW ELEMENT COUNT when it is available. "NOT EXAMINED (of N)" answers *how much of the page
      // went unlooked-at*, and an unnamed graphic that was never examined is unexamined — so every
      // element counts, whether or not a sweep could have announced it.
      present: elementCountOf(elements, key) ?? (census[key] as number),
      reachable: reachableCountOf(census[key] as number, elements, key),
      complete: (swept[type] as number) >= reachableCountOf(census[key] as number, elements, key),
      // BOTH DIRECTIONS of this type's sweep. A sweep walks backwards and forwards and either can
      // truncate independently, so a type is only fully examined when neither direction stopped first.
      examined: examinationState(
        (input.sweeps ?? []).filter((sweep) => sweep.type === type).map((sweep) => sweep.stop),
        swept[type] as number),
    }));
}

/**
 * The AX-tree element census, pulled out of a capture's diagnostics.
 *
 * It lives in a diagnostic rather than an evidence field because `capture-core` bars the accessibility tree
 * from becoming a model feature, and that boundary is worth keeping: a scorer that can read the DOM stops
 * being a screen-reader scorer. Reporting is a different consumer from scoring, so it reads the mark.
 *
 * Returns `null` when the census was attempted and failed (the mark carries an `error`), and `null` when there
 * is no mark at all — both mean "coverage unknown", which must never render as full coverage.
 */
export function censusFromDiagnostics(diagnostics: readonly unknown[]): Record<string, number> | null {
  const mark = diagnostics.find(
    (d): d is Record<string, unknown> =>
      typeof d === "object" && d !== null && (d as { event?: unknown }).event === "structureCensus");
  if (!mark || typeof mark.error === "string") return null;
  // #685/#691: a FALLBACK target is not a smaller page, it is an UNCONFIRMED one — the calendly incident
  // that forced this is `censusTargetMismatchReason`'s own header. Refused here too, not only there, so
  // every reader of this function (not just the coverage sentence) gets "coverage unknown" rather than a
  // real-looking number describing a document nobody asked to examine.
  if (mark.targetMatch === "fallback") return null;
  const counts: Record<string, number> = {};
  for (const [key, value] of Object.entries(mark)) {
    if (key !== "event" && key !== "atMs" && typeof value === "number") counts[key] = value;
  }
  // DISTINCT NAMES WHEN THE CENSUS HAS THEM, because the sweep this is compared against DEDUPLICATES.
  // The comment on `coverageSentence` has named this mismatch since the sentence was written — 66 images
  // with 47 distinct alt values reported as "5 of 66" — and called it "still wrong" while having no better
  // number to use. `census.distinct` is that number, added 2026-08-29; it is absent on older captures, and
  // `censusCountsDistinctNames` says which basis a given capture supports so the sentence can too.
  const distinct = (mark as { distinct?: Record<string, unknown> }).distinct;
  if (distinct && typeof distinct === "object") {
    for (const [key, value] of Object.entries(distinct)) {
      if (typeof value === "number") counts[key] = value;
    }
  }
  return Object.keys(counts).length > 0 ? counts : null;
}

/**
 * Names why a sweep-versus-census comparison would be meaningless on THIS capture — a calendly homepage
 * capture whose form probe activated "Continue with Google" and navigated to `accounts.google.com`
 * BEFORE the census ran: the sweep read 44 real headings, the census read Google's sign-in screen (1),
 * and `conformanceFor` (`cli.ts`) printed "reach 44/1... reached in full" as though 1 were calendly's real
 * heading count. #685, #691.
 *
 * **A `fallback` target match is refused outright here, regardless of `candidates`.** `pageCensus`'s own
 * `censusTargetIsSuspect` (`verify.ts`) trusts a `candidates <= 1` fallback as a likely genuine redirect —
 * right for the "contained" doubt it guards, where trusting a bad census wrongly just misses a real
 * finding. Here the consequence of trusting it wrongly is a NUMBER that looks like real evidence and gets
 * quoted as one — calendly's own `candidates: 1` fallback is exactly what produced "44/1" today — so this
 * reader is deliberately the stricter of the two, by design rather than by drift: they answer different
 * questions and are allowed to disagree on the same input.
 *
 * States what was OBSERVED, never what caused it: the actual mechanism (a probe navigating the page) is
 * named in `capture-probes.mjs`'s own fix, not asserted here from a report reader that cannot see which
 * probe ran. When `routeChange` carries a title transition, it is quoted as a fact this capture recorded
 * around the same time — evidence the census's target is questionable, not a diagnosis of why.
 *
 * @param diagnostics a capture's diagnostic marks
 * @param swept how many of each type the sweep actually reached (`conformanceFor`'s own `swept` shape)
 * @param routeChange the capture's `interaction.routeChange`, if a route-change probe ran
 * @returns a sentence, or `null` when the census's target was confirmed (or there is no census at all —
 *   that absence is `censusFromDiagnostics` returning `null`, a different and already-handled silence)
 */
export function censusTargetMismatchReason(
  diagnostics: readonly unknown[],
  swept: Readonly<Record<string, number>>,
  routeChange?: { titleBefore?: unknown; titleAfter?: unknown } | null,
): string | null {
  const mark = diagnostics.find(
    (d): d is Record<string, unknown> =>
      typeof d === "object" && d !== null && (d as { event?: unknown }).event === "structureCensus");
  if (!mark || mark.targetMatch !== "fallback") return null;
  const candidates = typeof mark.candidates === "number" ? String(mark.candidates) : "an unknown number of";
  const compared = Object.entries(CENSUS_KEY)
    .filter(([type, key]) => typeof mark[key] === "number" && typeof swept[type] === "number")
    .map(([type, key]) => `${type} ${swept[type]} swept against ${mark[key]} the census claims`);
  const numbers = compared.length > 0 ? ` (${compared.join("; ")})` : "";
  const titleNote = typeof routeChange?.titleBefore === "string" && typeof routeChange?.titleAfter === "string"
    ? ` A title change this capture recorded around the same time — "${routeChange.titleBefore}" to `
      + `"${routeChange.titleAfter}" — is consistent with the browser having already left the requested `
      + "page."
    : "";
  return ` The browser's element census could not confirm it was reading the requested page — its CDP `
    + `target fell back among ${candidates} candidate page(s)${numbers}. Treat this capture's coverage as `
    + `UNKNOWN, not as the numbers above: the census most likely describes a different document, and `
    + `reading its small count as this page's real total is how "reached in full" gets printed over a `
    + `page that was never examined.${titleNote}`;
}

/**
 * The capture's `activationBudget` mark, or `null`. Same contract as the census readers.
 *
 * The worker RECORDS the counts and this decides what they mean — ADR 0021's "captures record, rules
 * decide". The `examined | partial | not-examined` vocabulary lives here and must not be spelled a second
 * time in `.mjs` the worker ships without a build step.
 */
export function activationBudgetFromDiagnostics(
  diagnostics: readonly unknown[],
): ConformanceScopeInput["activationBudget"] {
  const mark = (diagnostics ?? []).find(
    (d): d is Record<string, unknown> =>
      typeof d === "object" && d !== null && (d as { event?: unknown }).event === "activationBudget");
  if (!mark || typeof mark.fields !== "number") return null;
  return {
    fields: mark.fields as number,
    allowed: typeof mark.allowed === "number" ? mark.allowed : 0,
    skipped: typeof mark.skipped === "number" ? mark.skipped : 0,
    exhausted: mark.exhausted === true,
  };
}

/**
 * WHICH CONTROLS WERE NEVER ACTIVATED, AND WHY — #677 part 2, the same rule as part 1 one level in.
 *
 * A control the budget refused produces no `formChanges` entry and no `stateChanges` entry, which is
 * byte-for-byte what a control that announces nothing produces. Those need opposite responses: the first
 * is a truncated capture, the second is a finding about the page. Silent about the first is exactly the
 * conflation this row exists to end.
 *
 * Says NOTHING when nothing was skipped — including when no budget was consulted at all. A sentence
 * appearing only when something happened cannot tell "nothing happened" from "nobody looked", so the
 * counts are stated whenever a budget ran, and only the refusal is conditional.
 */
function activationSentence(input: ConformanceScopeInput): string {
  const budget = input.activationBudget;
  if (!budget || budget.fields === 0) return "";
  if (!budget.exhausted) {
    return ` Every one of the ${budget.fields} form control(s) found was offered to the activation probe.`;
  }
  return ` ${budget.skipped} of ${budget.fields} form control(s) were NOT ACTIVATED — the per-field`
    + " activation probe's budget ran out, so any absence of interaction evidence among them is a"
    + " statement about this capture and not about the page.";
}

/** The coverage sentence, or "" when there is no ground truth to state it against. */
function coverageSentence(input: ConformanceScopeInput): string {
  if (input.censusMismatchReason) return input.censusMismatchReason;
  const coverage = sweepCoverage(input);
  if (coverage.length === 0) {
    return input.census === null
      ? " Coverage could not be measured: the browser's element census was unavailable, so how much of the "
        + "page the sweeps reached is unknown."
      : "";
  }
  // NOT EXAMINED IS NOT ZERO (#677). `link 0/340` on a page whose link sweep never ran is a true number
  // answering a question nobody asked -- it reads as a coverage shortfall and means the capture is
  // truncated. The three states are rendered differently because they need different responses.
  // TWO DENOMINATORS, TWO QUESTIONS. NOT EXAMINED counts every element on the page, because "we did not
  // look" is answered by how much there was to look at. Reach counts only what a sweep could ever have
  // announced. On a page with unnamed graphics they differ, and they SHOULD -- see `reachableCountOf`.
  const parts = coverage.map((c) => c.examined === "not-examined"
    ? `${c.type} NOT EXAMINED (of ${c.present})`
    : `${c.type} ${c.reached}/${c.reachable}`
      + (c.reachable === c.present ? "" : ` of ${c.present} on the page`)
      + (c.examined === "partial" ? " (partial)" : ""));
  const unexamined = coverage.filter((c) => c.examined === "not-examined");
  const gaps = coverage.filter((c) => !c.complete && c.examined !== "not-examined");
  // Say WHAT the numerator is. The sweep de-duplicates by announcement (`seenKeys`), so two images with the
  // same alt text collapse to one entry, while the census counts elements. On a page with 66 images and 47
  // distinct alt values those are different denominators, and reporting "5 of 66" as though it were elements
  // reached overstates the gap — understating our own coverage is the safe direction to be wrong in, but it is
  // still wrong, and a reader acting on the number deserves to know which number it is.
  return (input.censusCountsDistinctNames
    ? " Reach, as distinct announcements the screen reader produced against DISTINCT NAMES the browser"
      + ` reports — like compared with like: ${parts.join(", ")}.`
    : " Reach, as DISTINCT announcements the screen reader produced against elements the browser reports"
      + ` (the two differ where identical announcements collapse): ${parts.join(", ")}.`)
    + (unexamined.length
      ? ` ${unexamined.length} type(s) were NOT EXAMINED AT ALL -- their sweeps stopped before running, so`
        + " this capture is TRUNCATED and every conclusion drawn from it is bounded by the same budget."
        + " That is not a statement about the page."
      : "")
    + (gaps.length
      ? " A shortfall here is a coverage question about this tool, not a finding about the page."
      : unexamined.length ? "" : " Every type with ground truth was reached in full.");
}

/**
 * Does this capture's census count DISTINCT NAMES, or raw elements?
 *
 * The sweep deduplicates by announcement, so only the first is comparable with it. Older captures have
 * only the element count, and a sentence quoting one as though it were the other overstates the gap —
 * which is the whole reason this is asked rather than assumed.
 *
 * @param diagnostics a capture's diagnostic marks
 * @returns true when the census carries `distinct`
 */
export function censusCountsDistinctNames(diagnostics: readonly unknown[]): boolean {
  const mark = (diagnostics ?? []).find(
    (d): d is Record<string, unknown> =>
      typeof d === "object" && d !== null && (d as { event?: unknown }).event === "structureCensus");
  const distinct = (mark as { distinct?: unknown } | undefined)?.distinct;
  return typeof distinct === "object" && distinct !== null;
}

/**
 * The census's RAW element counts — every numeric key on the mark, with NO `distinct` laid over them.
 *
 * `censusFromDiagnostics` deliberately overwrites the raw counts from `distinct`, because the sweep it is
 * compared against deduplicates by announcement. That is right for REACH and wrong for "how much of the
 * page went unlooked-at", which is why both readers now exist. Includes `graphicUnnamed` and any other
 * numeric key the mark carries, since those are what `reachableCountOf` subtracts.
 *
 * Same `null` contract as `censusFromDiagnostics`: a failed census and an absent one both mean "coverage
 * unknown", never full coverage.
 */
export function censusElementCounts(diagnostics: readonly unknown[]): Record<string, number> | null {
  const mark = (diagnostics ?? []).find(
    (d): d is Record<string, unknown> =>
      typeof d === "object" && d !== null && (d as { event?: unknown }).event === "structureCensus");
  if (!mark || typeof mark.error === "string") return null;
  const counts: Record<string, number> = {};
  for (const [key, value] of Object.entries(mark)) {
    if (key !== "event" && key !== "atMs" && typeof value === "number") counts[key] = value;
  }
  return Object.keys(counts).length > 0 ? counts : null;
}

/**
 * THE ABSENCE OF A MEASUREMENT IS NOT THE MEASUREMENT ZERO — #677, a publish blocker.
 *
 * On `2026-09-09T08-20-19-020Z-www-ikea-com.json` the per-field activation probe spent the whole
 * 471-second budget on `formField`, and **five of eight structural sweeps never ran**. Their entries read
 * `found: 0, 0 ms, 2 trips, deadline` — and against a census of **340 links and 165 graphics**, the
 * report said `link 0/340`. A completed walk that found nothing and a walk that never started were the
 * same sentence, and they need opposite responses: the first is a page fact or a sweep defect, the second
 * means the capture is TRUNCATED and every conclusion drawn from it is bounded by the same budget.
 *
 * **The information was already on every capture and nothing read it.** `observed.<type>.stop` carries
 * `deadline`, and has since the mark was added. This repository's most-recorded shape is a diagnostic
 * written and never consumed — `sweepLog`'s 604 silent crashes are the same sentence.
 *
 * ## THREE states, not two, and the third one matters
 *
 * The row asked for NOT EXAMINED distinct from `found: 0`. Reading the capture showed a middle state that
 * a binary would report wrongly: **`formField` also stopped on `deadline`, and it found 100.** Calling
 * that "not examined" would be false in the other direction — it examined a great deal and then ran out.
 *
 *   `examined`     the sweep ran out of ELEMENTS (`exhausted`/`repeat`) -- the page ended first
 *   `partial`      it stopped first, having found some -- a floor on the page, not a count of it
 *   `not-examined` it stopped first, having found NOTHING -- this number is about the tool, not the page
 *
 * Only the third is the defect this row names; the second is the one a binary would have got wrong.
 */
export type ExaminationState = "examined" | "partial" | "not-examined";

/**
 * How completely one type was examined, from the stop reasons the capture already carries.
 *
 * `undefined` stop is `examined`, and that default is a decision rather than a fallback. Captures
 * predating the mark have no stop reason, so reading their silence as truncation would relabel the whole
 * corpus on a field that did not exist when the evidence was taken. **Inventing a defect in old evidence
 * is the wrong direction to be wrong in** — the same rule as a record of the past never being renamed
 * (#534's ten rewritten capture URLs, #531's rewritten ansible transcript). A capture says what it said;
 * a field added later cannot make it say something new about itself.
 *
 * @param stops every direction's stop reason for one type
 * @param found how many entries that type's sweep produced
 */
export function examinationState(stops: readonly (string | undefined)[], found: number): ExaminationState {
  const stoppedEarly = stops.some((stop) => stop !== undefined && !SWEEP_RAN_OUT.includes(stop as SweepStop));
  if (!stoppedEarly) return "examined";
  return found > 0 ? "partial" : "not-examined";
}

/** Sweeps that stopped before the page did, i.e. examined only part of it. */
export function truncatedSweeps(sweeps: readonly SweepOutcome[] = []): SweepOutcome[] {
  return sweeps.filter((sweep) =>
    sweep.stop !== undefined && !SWEEP_RAN_OUT.includes(sweep.stop as SweepStop));
}

/**
 * Pull sweep outcomes out of a capture's diagnostic marks.
 *
 * Both directions are recorded on one mark (`prevStop`/`nextStop`) because a sweep walks backwards and
 * forwards from the cursor, and either can truncate independently.
 */
/** The `sweep` mark's shape, named once because two functions here read it. */
type SweepMark = {
  event?: string; type?: string; prevStop?: string; nextStop?: string; truncated?: boolean;
  stop?: string; prevTrips?: number; nextTrips?: number; found?: number;
  scope?: { openDialog?: string | null };
};

/**
 * ONE DIRECTION OF ONE SWEEP, as an outcome.
 *
 * Split out of `sweepOutcomes` when #897's `scope` took it one branch over ESLint's complexity budget.
 * That budget was telling the truth: the parent decides which KIND of mark it is looking at, and this
 * decides what one direction of a sweep mark carries. Two things.
 *
 * Every field is carried only when the capture actually recorded it. A missing key and a `null` are
 * different answers — `openDialog: null` is "read, and there was no modal", where absence is "nobody
 * asked" — and collapsing them is the distinction the field exists for.
 */
function directionOutcome(m: SweepMark, stop: string, trips: number | undefined): SweepOutcome {
  return {
    type: String(m.type ?? "unknown"), stop,
    ...(typeof trips === "number" ? { trips } : {}),
    ...(typeof m.found === "number" ? { found: m.found } : {}),
    ...(m.scope ? { openDialog: m.scope.openDialog ?? null } : {}),
  };
}

export function sweepOutcomes(diagnostics: readonly unknown[] = []): SweepOutcome[] {
  const out: SweepOutcome[] = [];
  for (const mark of diagnostics) {
    const m = mark as SweepMark;
    // The focus probe is not a quick-nav sweep, but it truncates the same way — it stops after a fixed
    // number of Tab presses — and the consequence is identical: content past that point was never
    // examined. Reported as a sweep outcome so 2.1.2 gets the same `cantTell` treatment as every other
    // criterion whose evidence collection stopped early, instead of a `passed` it did not earn.
    if (m?.event === "focusOrder") {
      if (m.truncated === true) out.push({ type: "focusOrder", stop: "cap" });
      // A WALK THAT READ NOTHING IS NOT A PAGE WITH NO TAB STOPS — #863. `stops: 0` leaves `truncated`
      // false, so a zero-stop walk pushed no outcome at all and 2.1.2/2.4.3 got a clean channel from a
      // probe that never read one. Measured on five IKEA captures: `stops: 0` beside the same capture's
      // `focusConfinement` mark reporting `controlsOnPage: 265`.
      //
      // Gated on the PRESENCE of `stop`, which #863 adds: a capture taken before it has no way to say
      // which ending it had, and inventing truncation in old evidence is the wrong direction to be wrong
      // in — the same rule `examinationState` states for an absent stop reason.
      else if (m.stop === "silent") out.push({ type: "focusOrder", stop: "silent" });
      continue;
    }
    if (m?.event !== "sweep") continue;
    // Carried through rather than recomputed downstream: this is the one place that reads the sweep
    // mark, and a second reader of the same fields is how two answers to one question start.
    for (const [stop, trips] of [[m.prevStop, m.prevTrips], [m.nextStop, m.nextTrips]] as const) {
      if (stop !== undefined) out.push(directionOutcome(m, stop, trips));
    }
  }
  return out;
}

function conformanceLevel(input: ConformanceScopeInput): ConformanceRequirement {
  const assessed = new Set(input.assessedCriteria);
  const missing = WCAG_22_AA.filter((c) => !assessed.has(c.num));
  return {
    number: 1,
    name: "Conformance Level",
    establishes: `Assessed ${assessed.size} of ${WCAG_22_AA.length} WCAG 2.2 A/AA success criteria.`,
    // Deliberately blunt. A report that names a level is the single most damaging thing this tool could
    // do, because "no findings" plus a level reads as certification.
    limitation: `No conformance level is claimed or established. ${missing.length} criteria were NOT `
      + "assessed and are unchecked, not clean. A conforming alternate version, if this page has one, "
      + "is not detected.",
  };
}

/**
 * WHICH document, appended to Requirement 2's "one viewport, one state, one document".
 *
 * Empty when no identity was passed. A report that invented "the page you asked for" from an absent
 * reading would be exactly the claim #687 exists to stop something making.
 */
function renderSentence(input: ConformanceScopeInput): string {
  return input.documentIdentity ? ` ${identitySentence(input.documentIdentity)}` : "";
}

/**
 * A SWEEP THAT RAN OUT AFTER FEWER TRIPS THAN THE CENSUS COUNTS — #887.
 *
 * **`exhausted` is the one stop reason this codebase treats as authoritative rather than inferred**, and
 * it is NVDA's own "no next link". That answer is true about the caret's CURRENT SCOPE, which is not
 * always the page.
 *
 * Measured on `runs/781-r1-hubspot.json/capture-1`: the `landmark` sweep's last stop was literally
 * `"Hub Bot, dialog"` — it walked into HubSpot's chat widget and left the caret inside an open dialog.
 * The three sweeps that ran while it was open each truthfully exhausted that dialog:
 *
 *     formField  found 12, and every one of them is a chat-widget control
 *     graphic    found 2   ("Avatar of Hub Bot", "Message History ... Avatar of Hub Bot")
 *     link       found 1   ("privacy policy, link")   against a census of 79
 *
 * The `list` sweep, after the dialog closed, found the real page's 22 lists, and the `frame` sweep saw
 * the widget as `"... Open live chat, button, opens dialog"` — closed again. **Nothing was wrong with the
 * page, the worker or the build.** The report then rendered "every structural sweep ran until the page
 * ran out of elements" over a capture that had examined a chat dialog.
 *
 * ## THE NUMBER THIS COMPARES, AND WHAT IT DOES NOT PROVE
 *
 * **A sweep cannot have visited more elements than it made trips.** 8 trips against a census of 79 links
 * is arithmetic, not a threshold somebody chose, and it needs no constant.
 *
 * It does NOT prove the sweep was scoped wrongly. The census counts AX nodes in roles the quick-navigation
 * key may not reach at all — #800's finding, and the reason `formControl` and `f` disagree — so a sweep
 * can legitimately make fewer trips than the census has elements.
 *
 * **Which is why this WITHHOLDS a claim rather than making one. Withholding needs doubt; asserting needs
 * proof.** Requirement 2's full-page sentence is an affirmative assertion that the page ran out, and that
 * asymmetry is the whole reason this direction is safe: being wrong here costs a claim nobody was owed,
 * while being wrong the other way puts a completeness sentence over a page that was never read. The
 * numbers are named so a reader can weigh them rather than take the verdict.
 *
 * Only sweeps where BOTH directions ran out are considered — a half-exhausted sweep is already truncated
 * and `truncatedSweeps` reports it.
 */
export function ranOutShortOfTheCensus(input: ConformanceScopeInput): {
  type: string, found: number, census: number, trips: number
}[] {
  const census = input.census;
  if (!census) return [];
  const byType = new Map<string, { ranOut: boolean, bothSeen: number, trips: number, found: number }>();
  for (const sweep of input.sweeps ?? []) {
    // No trips recorded means a capture from before #887, and it cannot answer this question. Absent is
    // not zero -- reading it as zero would refuse the claim on every capture ever taken.
    if (typeof sweep.trips !== "number" || typeof sweep.found !== "number") continue;
    const seen = byType.get(sweep.type)
      ?? { ranOut: true, bothSeen: 0, trips: 0, found: sweep.found };
    seen.ranOut = seen.ranOut && SWEEP_RAN_OUT.includes(sweep.stop as SweepStop);
    seen.bothSeen += 1;
    seen.trips += sweep.trips;
    byType.set(sweep.type, seen);
  }
  const out: { type: string, found: number, census: number, trips: number }[] = [];
  for (const [type, seen] of byType) {
    // BOTH directions, or the sweep is truncated rather than short — a different finding, reported
    // elsewhere, and reporting it twice would double-count the same capture's incompleteness.
    if (!seen.ranOut || seen.bothSeen < 2) continue;
    const key = CENSUS_KEY[type as keyof typeof CENSUS_KEY];
    const present = key ? census[key] : undefined;
    // NO CENSUS ENTRY, NO COMPARISON. `list` and `frame` have no census key, and inventing a denominator
    // is worse than having none -- `sweepCoverage` makes the same choice for the same reason.
    if (typeof present !== "number" || seen.trips >= present) continue;
    out.push({ type, found: seen.found, census: present, trips: seen.trips });
  }
  return out;
}

/**
 * SWEEPS THAT RAN OUT INSIDE AN OPEN MODAL — #897, and the cause behind #887's consequence.
 *
 * A screen reader's quick navigation is confined to an open modal dialog, so NVDA's "no next link" is
 * true about the DIALOG rather than about the page. Measured on `runs/781-r1-hubspot.json/capture-1`: the
 * `landmark` sweep's last stop was `"Hub Bot, dialog"`, and the three sweeps that ran while HubSpot's
 * chat widget was open found 12 chat-widget controls, 2 Hub Bot avatars and 1 link against a census of
 * 79 — every one reporting `exhausted`, every one correct about where it was.
 *
 * **This is a stronger reason to withhold the full-page claim than #887's, and a different one.**
 * #887 compares trips against a census and can only say the arithmetic does not support the claim;
 * this says WHICH scope was examined, by name, and it is what a reader needs to go and look.
 *
 * Both directions only, for the same reason as `ranOutShortOfTheCensus`: a half-exhausted sweep is
 * already truncated and `truncatedSweeps` reports it.
 */
export function ranOutInsideADialog(input: ConformanceScopeInput): { type: string, dialog: string }[] {
  const byType = new Map<string, {
    ranOut: boolean, directions: number, dialog: string | null | undefined,
  }>();
  for (const sweep of input.sweeps ?? []) {
    // NO EARLY RETURN FOR AN ABSENT SCOPE, and the absence of one is deliberate. A guard here was written
    // first and then removed: mutation showed it could not fail, because the `seen.dialog` filter below
    // already rejects both `undefined` (a capture from before the field) and `null` (read, no modal).
    // A guard that cannot fail is not a guard, and leaving it in invites a test that cannot fail either.
    //
    // The distinction still matters and is kept where it is OBSERVABLE — `sweepOutcomes` omits the key
    // entirely for a capture that recorded no scope, rather than reporting `null`, so a reader can tell
    // "nobody asked" from "asked, no dialog". That is asserted in `dialog-scope.test.ts`.
    const seen = byType.get(sweep.type)
      ?? { ranOut: true, directions: 0, dialog: sweep.openDialog };
    seen.ranOut = seen.ranOut && SWEEP_RAN_OUT.includes(sweep.stop as SweepStop);
    seen.directions += 1;
    byType.set(sweep.type, seen);
  }
  return [...byType]
    .filter(([, seen]) => seen.ranOut && seen.directions >= 2 && seen.dialog)
    .map(([type, seen]) => ({ type, dialog: seen.dialog as string }));
}

function fullPages(input: ConformanceScopeInput): ConformanceRequirement {
  const truncated = truncatedSweeps(input.sweeps);
  const short = ranOutShortOfTheCensus(input);
  const sealed = ranOutInsideADialog(input);
  // SEALED INSIDE A DIALOG IS CHECKED FIRST, because it is the CAUSE and #887's arithmetic is the
  // symptom: a sweep confined to a modal is usually also trips-short, and reporting the arithmetic when
  // the capture can name the dialog would bury the answer under the evidence for it.
  if (truncated.length === 0 && sealed.length > 0) {
    const detail = sealed.map((s) => `${s.type} (inside "${s.dialog}")`).join(", ");
    return {
      number: 2,
      name: "Full pages",
      establishes: "Part of the page was examined.",
      limitation: "A modal dialog was open, and a screen reader's quick navigation is confined to one — "
        + `so these sweeps ran out of the DIALOG rather than of the page: ${detail}. Their `
        + "`exhausted` is the screen reader's own answer and it is correct; it is correct about the "
        + "dialog. What the page holds outside it was not examined." + coverageSentence(input)
        + " Separately: one viewport only, iframes not entered, and any state reachable without a URL "
        + "change is part of this same page and was not examined."
        + renderSentence(input) + activationSentence(input),
    };
  }
  // A SWEEP THAT SAID IT RAN OUT, HAVING MADE FEWER TRIPS THAN THE CENSUS COUNTS, CANNOT SUPPORT THE
  // FULL-PAGE SENTENCE — #887. Checked before the truncation branch because a capture can have both, and
  // the affirmative claim must be withheld if EITHER is true. Reported in its own words rather than
  // folded into "truncated": a truncated sweep is honest about stopping early, and this one is not.
  if (truncated.length === 0 && short.length > 0) {
    const detail = short
      .map((s) => `${s.type} (${s.found} found in ${s.trips} trips, census ${s.census})`).join(", ");
    return {
      number: 2,
      name: "Full pages",
      establishes: "Part of the page was examined.",
      limitation: "A sweep reported that the page RAN OUT of elements after fewer trips than the page's "
        + `own accessibility census counts: ${detail}. A sweep cannot have visited more elements than it `
        + "made trips, so the run cannot claim it examined them. `exhausted` is the screen reader's own "
        + "\"no next link\", which is true about wherever its cursor was — on the capture this check was "
        + "written from, that was an open chat dialog, and every sweep inside it ran out honestly while "
        + "the page went unexamined. This does not establish that anything was missed: the census counts "
        + "elements a quick-navigation key may not reach at all. It establishes that the full-page claim "
        + "is not supported." + coverageSentence(input)
        + " Separately: one viewport only, iframes not entered, and any state reachable without a URL "
        + "change is part of this same page and was not examined."
        + renderSentence(input) + activationSentence(input),
    };
  }
  if (truncated.length === 0) {
    return {
      number: 2,
      name: "Full pages",
      establishes: "Every structural sweep ran until the page ran out of elements, so the parts of the "
        + "page a screen reader can reach were examined in full." + coverageSentence(input),
      limitation: "One viewport, one state, one document. Responsive VARIATIONS each have to conform "
        + "separately and only one was rendered; content inside iframes is not entered; and WCAG counts "
        + "an application at a single URI as ONE page, so every state reachable without a URL change — "
        + "menus, dialogs, steps of a wizard — is part of this page and was not examined."
        + renderSentence(input) + activationSentence(input),
    };
  }
  const detail = truncated.map((s) => `${s.type} (${s.stop})`).join(", ");
  return {
    number: 2,
    name: "Full pages",
    establishes: "Part of the page was examined.",
    // The whole point of Requirement 2: partial examination cannot support a full-page claim, and
    // "we stopped early" must never be reported as "there was nothing more".
    limitation: `Examination was INCOMPLETE — these sweeps stopped before the page did: ${detail}. `
      + "Elements beyond that point were never reached, so an absence of findings among them is not "
      + "evidence they are correct." + coverageSentence(input)
      + " Separately: one viewport only, iframes not entered, and any state "
      + "reachable without a URL change is part of this same page and was not examined."
      + renderSentence(input) + activationSentence(input),
  };
}

function completeProcesses(): ConformanceRequirement {
  return {
    number: 3,
    name: "Complete processes",
    establishes: "Findings are scoped to this single page.",
    limitation: "If this page is one step of a process — signing in, checking out, completing a "
      + "multi-step form — the other steps were not assessed, and WCAG conformance for the process "
      + "cannot be claimed from this run. See docs/adr/0011-task-journeys.md. Third-party content "
      + "(embeds, adverts, widgets) is also not distinguished from the author's own, so a finding may "
      + "concern content they cannot control — the case WCAG §5.4 covers with a statement of partial "
      + "conformance.",
  };
}

function accessibilitySupported(input: ConformanceScopeInput): ConformanceRequirement {
  const stack = input.browser ? `${input.screenReader} driving ${input.browser}` : input.screenReader;
  return {
    number: 4,
    name: "Only Accessibility-Supported Ways of Using Technologies",
    // This requirement is where driving a real screen reader is worth the whole cost of doing so: what
    // was announced IS the evidence of support, rather than an inference from the markup.
    establishes: `Evidence is what ${stack} actually announced, so support is demonstrated rather than `
      + "inferred from markup.",
    limitation: "Accessibility support was demonstrated for that one combination only. Other screen "
      + "readers, browsers and platforms behave differently and were not assessed, and one language "
      + "version was read with one synthesiser — §5.5 requires each language offered to conform on its "
      + "own. Nor was this page checked with the technology it relies on turned OFF or unsupported, "
      + "which §5.2.5 also requires.",
  };
}

function nonInterference(input: ConformanceScopeInput): ConformanceRequirement {
  const assessed = new Set(input.assessedCriteria);
  // Coverage is `assessedCriteria` and nothing else, deliberately. An earlier draft of this counted
  // "the focus-order probe ran" as covering 2.1.2 — which would have been the project's own overclaim
  // encoded in the module that exists to prevent overclaims. Capturing evidence is not assessing it:
  // `interaction.focusOrder` is produced by the worker and read by no rule and no scorer head, so a
  // keyboard trap sitting in that array would be reported to nobody. A criterion counts here only when
  // something can actually return a finding for it.
  const covered = NON_INTERFERENCE_CRITERIA.filter((num) => assessed.has(num));
  const uncovered = NON_INTERFERENCE_CRITERIA.filter((num) => !covered.includes(num));
  const visualNote = input.ruleLayerRan
    ? "2.3.1 Three Flashes is visual and belongs to the rule-based layer, which ran."
    : "2.3.1 Three Flashes is visual and belongs to the rule-based layer, which did NOT run.";
  return {
    number: 5,
    name: "Non-Interference",
    establishes: covered.length
      ? `Of the four criteria that apply to ALL content, assessed: ${covered.join(", ")}.`
      : "None of the four criteria that apply to all content were assessed by this layer.",
    limitation: uncovered.length
      ? `NOT assessed: ${uncovered.join(", ")}. These apply to all content on the page whether or not `
        + `it is relied upon, so they cannot be assumed satisfied. ${visualNote}`
      : `All four were assessed. ${visualNote}`,
  };
}

/**
 * Why this report is NOT a conformance claim, and what a claim would additionally need.
 *
 * WCAG §5.3 makes claims optional but specifies exactly what one must carry: the date, the URIs covered,
 * the version and level claimed, the accessibility-supported technologies RELIED UPON, and the technologies
 * used but not relied upon. We hold the first three; the last two are the author's determination about
 * their own site, not an observation a tool can make — "relied upon" means the content would not conform
 * with that technology turned off, which only the author knows they intended.
 *
 * Stated out loud because a document listing WCAG criteria, evidence and a date looks exactly like a claim
 * to a reader who has not read §5.3, and a report mistaken for a certificate is the most damaging way this
 * output could be misread.
 */
export function notAConformanceClaim(): ConformanceRequirement {
  return {
    number: 1,
    name: "This report is not a conformance claim (§5.3)",
    establishes: "It records what a screen reader announced, on one page, on one date, with the tool and "
      + "browser versions named above.",
    limitation: "A WCAG conformance claim additionally requires the technologies RELIED UPON and those "
      + "used but not relied upon, which only the site's author can determine. Nothing here should be "
      + "quoted as a claim, and no level is asserted.",
  };
}

/**
 * What this run establishes against each of WCAG's five conformance requirements.
 *
 * Always returns all five, in order, whatever the input — a requirement omitted because it was
 * inconvenient to compute is the silent gap this exists to prevent.
 */
export function conformanceScope(input: ConformanceScopeInput): ConformanceRequirement[] {
  return [
    conformanceLevel(input),
    fullPages(input),
    completeProcesses(),
    accessibilitySupported(input),
    nonInterference(input),
  ];
}
