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
  return Object.entries(CENSUS_KEY)
    .filter(([type, key]) => typeof census[key] === "number" && typeof swept[type] === "number")
    .map(([type, key]) => ({
      type,
      reached: swept[type] as number,
      present: census[key] as number,
      complete: (swept[type] as number) >= (census[key] as number),
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
  const parts = coverage.map((c) => c.examined === "not-examined"
    ? `${c.type} NOT EXAMINED (of ${c.present})`
    : `${c.type} ${c.reached}/${c.present}${c.examined === "partial" ? " (partial)" : ""}`);
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
export function sweepOutcomes(diagnostics: readonly unknown[] = []): SweepOutcome[] {
  const out: SweepOutcome[] = [];
  for (const mark of diagnostics) {
    const m = mark as {
      event?: string; type?: string; prevStop?: string; nextStop?: string; truncated?: boolean;
    };
    // The focus probe is not a quick-nav sweep, but it truncates the same way — it stops after a fixed
    // number of Tab presses — and the consequence is identical: content past that point was never
    // examined. Reported as a sweep outcome so 2.1.2 gets the same `cantTell` treatment as every other
    // criterion whose evidence collection stopped early, instead of a `passed` it did not earn.
    if (m?.event === "focusOrder") {
      if (m.truncated === true) out.push({ type: "focusOrder", stop: "cap" });
      continue;
    }
    if (m?.event !== "sweep") continue;
    for (const stop of [m.prevStop, m.nextStop]) {
      if (stop !== undefined) out.push({ type: String(m.type ?? "unknown"), stop });
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

function fullPages(input: ConformanceScopeInput): ConformanceRequirement {
  const truncated = truncatedSweeps(input.sweeps);
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
        + renderSentence(input),
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
      + renderSentence(input),
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
