/**
 * Did the screen reader actually read the page we asked for?
 *
 * This is not a nicety. A capture can succeed at every level the worker can see -- Edge
 * launched, NVDA connected, phrases came back -- while announcing something else entirely:
 * browser chrome, a start page, or a web server's 404. Nothing in the transport reports a
 * problem, so the transcript looks like evidence and is not.
 *
 * The check is deliberately weak: one significant word from the page title appearing
 * anywhere in what was announced. A strict check would reject legitimate captures of pages
 * whose title is never spoken; this one only catches the egregious wrong-content case,
 * which is the one that silently poisons results.
 */
import type { CaptureStructure } from "./index.js";
import { parseAnnouncement, isLandmarkRole } from "./announcement.js";

/** Whatever a capture backend returned; only the announcement fields matter here. */
export interface CapturedAnnouncements {
  transcript: string[];
  /**
   * A SUBSET OF THE WIRE TYPE, derived — known-gaps §15. `Pick` keeps the omission meaningful: nothing in
   * this file reads `links`, `lists` or `graphics` off `structure` (the census supplies those counts),
   * and declaring them would claim a read that does not happen.
   */
  structure?: Pick<CaptureStructure, "headings" | "landmarks" | "formFields" | "tableCells">;
  interaction?: {
    controls: string[];
    stateChanges: { control: string; after: string }[];
    postSubmitFields?: string[];
  };
  /**
   * The capture's diagnostic marks. Only the CDP census's accessible names are read here — they are the
   * page's OWN names as the browser renders them, which is the one thing that can prove NVDA read this
   * page rather than something on top of it.
   *
   * Deliberately `unknown[]`: the marks are heterogeneous by design (each phase records its own shape)
   * and they arrive over HTTP from the worker, so this is a boundary and gets a runtime check rather
   * than a declared shape it cannot enforce.
   */
  diagnostics?: unknown[];
}

/** Words shorter than this are too common to be evidence of anything. */
const SIGNIFICANT_WORD_LENGTH = 4;

/**
 * Length is not significance. This check once passed a browser error page as a match for
 * "Project update with an informative illustration", because the error page contains
 * "list, with 3 items" and `with` is four characters long. Two error-page captures reached a
 * 1,467-capture dataset that way -- exactly the mislabelled evidence this function exists to
 * prevent.
 *
 * Common words carry no evidence of WHICH page was read, so they cannot vote. The list
 * includes the vocabulary of browser error pages on purpose (`page`, `site`, `connect`,
 * `refused`, `reach`), since that is the wrong-content case most likely to be hit.
 */
const STOPWORDS = new Set([
  "with", "this", "that", "from", "your", "have", "will", "been", "were", "they", "them",
  "their", "what", "when", "where", "which", "would", "could", "should", "there", "here",
  "into", "over", "under", "after", "before", "other", "some", "only", "also", "just",
  "than", "then", "these", "those", "about", "more", "most", "such", "each", "both",
  "page", "site", "home", "connect", "refused", "reach", "error", "cannot",
]);

const isSignificant = (word: string): boolean => !STOPWORDS.has(word);

/**
 * Everything the screen reader said, as one lowercased string.
 *
 * "Everything" is not literal: `links`, `graphics`, `lists` and `tableCells` are absent, so this is the
 * transcript plus three of the seven sweeps. Left that way DELIBERATELY, and measured before deciding —
 * across 106 real captures with a title, ZERO fail `captureMentionsTitle`, and zero of those would be
 * rescued by widening the haystack. The two-route design already catches them: title words first, the
 * page's own accessible names second.
 *
 * Widening would be safe in principle — this feeds an OR, so more text can only ACCEPT captures that were
 * rejected, never reject one that passed. It is not done because it would change a gate pinned across the
 * whole corpus for no measurable gain, which is how an inert remedy gets shipped with a confident comment.
 * If a false refusal ever shows up on a page whose distinctive text lives in link names, this is the first
 * place to look.
 */
function announced(capture: CapturedAnnouncements): string {
  const s = capture.structure;
  const it = capture.interaction;
  return [
    ...capture.transcript,
    ...(s?.headings ?? []), ...(s?.landmarks ?? []), ...(s?.formFields ?? []),
    ...(it?.controls ?? []),
    ...(it?.stateChanges ?? []).map((x) => `${x.control} ${x.after}`),
    ...(it?.postSubmitFields ?? []),
  ].join(" ").toLowerCase();
}

/**
 * Punctuation-insensitive, because NVDA does not read punctuation literally: it speaks `GOV.UK` as
 * "GOV dot UK" and `eVisas` as "e Visas". Comparing raw strings across that boundary fails on exactly
 * the names most worth matching.
 */
const normalise = (text: string): string =>
  text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Long enough that appearing by chance is implausible. A short name like "Search" or "Home" sits in
 * browser chrome as readily as in a page, and this check exists precisely to tell those apart.
 */
const DISTINCTIVE_NAME_LENGTH = 12;

/** How many of the page's own names must be heard. Two independent long names is not a coincidence. */
const NAMES_NEEDED = 2;

/**
 * The page's own accessible names, from the CDP census mark the capture already records.
 *
 * Every field is checked rather than asserted. These marks come off the wire from a worker that may be
 * running older code — `names` was added to the census after the field it feeds — and a capture whose
 * census predates it must fall through to "no names", not throw inside a gate.
 */
function pageNames(capture: CapturedAnnouncements): string[] {
  const marks = Array.isArray(capture.diagnostics) ? capture.diagnostics : [];
  for (const mark of marks) {
    if (typeof mark !== "object" || mark === null) continue;
    const { event, names } = mark as { event?: unknown; names?: unknown };
    if (event !== "structureCensus" || !Array.isArray(names)) continue;
    return names.filter((name): name is string => typeof name === "string");
  }
  return [];
}

/**
 * Did the screen reader announce the page's OWN content?
 *
 * Direct evidence, where the title check is a proxy. The accessible names come from the page target's
 * accessibility tree, so browser chrome is not in them: when the capture read Edge's image-magnifier
 * overlay it announced "Image Magnify, document", "Zoom In, button" and "Rotate, button", none of which
 * is a gov.uk name — so overlap is zero and the capture is still correctly rejected.
 *
 * Names carrying punctuation NVDA expands are simply not matched rather than worked around: `Cookies on
 * GOV.UK` is heard as "cookies on gov dot uk", and there is no need to recover it when a page has plenty
 * of plain ones. Only the count has to clear the bar.
 */
function announcedPageContent(capture: CapturedAnnouncements): boolean {
  const heard = normalise(announced(capture));
  if (!heard) return false;
  const matched = new Set<string>();
  for (const name of pageNames(capture)) {
    const candidate = normalise(name);
    if (candidate.length < DISTINCTIVE_NAME_LENGTH) continue;
    if (heard.includes(candidate)) matched.add(candidate);
    if (matched.size >= NAMES_NEEDED) return true;
  }
  return false;
}

/**
 * True when the capture plausibly read the page with this title -- including when the title
 * gives us nothing to check, since absence of a usable title is not evidence of failure.
 *
 * ## Why a title word is not enough on its own
 *
 * The word check assumes a page's title words appear in its body, which is true of this project's
 * synthetic pages and often false in the wild. gov.uk is titled "Welcome to GOV.UK": `gov` and `uk` fall
 * under the significant-word length, leaving `welcome` as the only word that can vote — and `welcome`
 * appears nowhere in the page, whose h1 reads "The best place to find government services and
 * information". So a capture that read gov.uk perfectly was reported as **"could not read this page"**,
 * and the run refused to report findings about a page it had read.
 *
 * A false refusal is not the safe direction. It looks like caution while quietly making the tool
 * unusable on real sites, and the fix must not be to lower the word length: `with` is four characters
 * and once passed a browser error page as a match for "Project update with an informative illustration",
 * putting two error-page captures into a 1,467-capture dataset. Three-character words would be worse.
 *
 * So the second route is ADDITIVE and made of direct evidence — the page's own accessible names. It can
 * only accept captures this function previously rejected, never reject one it accepted, which is what
 * keeps `verify.corpus.test.ts` honest across 2,122 captures on disk.
 */
export function captureMentionsTitle(capture: CapturedAnnouncements, title: string): boolean {
  const words = (title.toLowerCase().match(new RegExp(`[a-z0-9]{${SIGNIFICANT_WORD_LENGTH},}`, "g")) ?? [])
    .filter(isSignificant);
  // A title made entirely of common words gives us nothing to check, which is not the same as
  // a match. Returning true here keeps the check lenient by design -- it only ever catches the
  // egregious wrong-content case -- but the words that do the catching must be distinctive.
  if (words.length === 0) return true;
  const haystack = announced(capture);
  if (words.some((w) => haystack.includes(w))) return true;
  // The title told us nothing, so ask the page directly.
  return announcedPageContent(capture);
}

/**
 * The census mark itself, for the counts rather than the names.
 *
 * Exported because the deterministic rules need it too: two of them assert something is ABSENT, and a
 * sweep alone cannot tell "the page has none" from "we could not ask".
 */
/**
 * What the DOM contains, as counted in the DOM rather than in the accessibility tree.
 *
 * Its whole value is the COMPARISON with `pageCensus`. Both alone are ambiguous; together they separate
 * two verdicts that had been indistinguishable and need opposite responses:
 *
 *     dom.heading 0   census.heading 0    the page never rendered — our defect
 *     dom.heading 40  census.heading 0    forty headings the tree cannot see — a severe finding
 *
 * A capture taken before this existed returns null, which reads as "cannot say" and never as "none".
 */
export function domCensus(capture: CapturedAnnouncements):
  {
    heading?: number; link?: number; graphic?: number; landmark?: number; formField?: number;
    /**
     * How many TAB STOPS the page has — the only truthful denominator for "did focus reach everything".
     *
     * Absent on every capture taken before the census learned to count them, which reads as "cannot say"
     * and never as "none". 2.1.2 makes no claim without it.
     */
    tabbable?: number;
    /**
     * WHICH graphics carry no accessible name, capped, with the full count beside them.
     *
     * The count alone sent a reader to fetch cqc.org.uk by hand and tally `<svg>` elements without a
     * `<title>`. Both travel together because a truncated list that reads as complete is the defect one
     * layer along — the sample says which, the count says how many.
     *
     * Absent on every capture taken before the census learned to name them, which reads as "cannot say"
     * and never as "none".
     */
    unnamedGraphics?: string[]; unnamedGraphicCount?: number;
    /**
     * The document's declared language, and the languages of any PARTS that override it.
     *
     * COMPUTED SINCE THE LANGUAGE CENSUS LANDED AND DROPPED HERE UNTIL 2026-09-05, which is the same
     * defect this repo has already paid for once. `addMissingHeadings` needs `census.heading === 0`, the
     * worker recorded it on every capture, and `domCensus` did not carry it — so the rule read `undefined`
     * and `rules:coverage` said "NEVER FIRED ANYWHERE — the claim rests on nothing" for as long as it had
     * existed. Same shape, different fields: a real capture read `documentLang: "en", partLangs: ["fr"],
     * partLangCount: 1` while every rule saw nothing.
     *
     * It matters now because 3.1.2's marked-but-silent rule is specified as `partLangCount > 0 AND no
     * language announced` (known-gaps §36). Building that rule against a census the layer cannot see would
     * have produced a rule that never fires, which is indistinguishable from a conformant corpus.
     *
     * PRIMARY SUBTAGS are the comparison the rule must make, and the reason is a default: NVDA's
     * `autoDialectSwitching` is false, so `lang="en-GB"` inside an `en` page announces NOTHING and a rule
     * comparing full tags would accuse it. The raw values are carried here and the narrowing belongs to
     * the rule, so this stays a reading rather than an interpretation.
     *
     * Absent on every capture taken before the census learned to read them, which reads as "cannot say"
     * and never as "no language declared".
     */
    documentLang?: string; partLangs?: string[]; partLangCount?: number;
  } | null {
  const marks = Array.isArray(capture.diagnostics) ? capture.diagnostics : [];
  for (const mark of marks) {
    if (typeof mark !== "object" || mark === null) continue;
    const record = mark as Record<string, unknown>;
    if (record.event !== "domCensus" || record.error) continue;
    // See `censusTargetIsSuspect` above `pageCensus`: a census whose CDP target was never confirmed reads
    // as absent, never as its own (possibly alien) numbers.
    if (censusTargetIsSuspect(record)) return null;
    const num = (value: unknown) => (typeof value === "number" ? value : undefined);
    return {
      heading: num(record.heading), link: num(record.link), graphic: num(record.graphic),
      landmark: num(record.landmark), formField: num(record.formField), tabbable: num(record.tabbable),
      unnamedGraphics: Array.isArray(record.unnamedGraphics)
        ? record.unnamedGraphics.filter((n): n is string => typeof n === "string")
        : undefined,
      unnamedGraphicCount: num(record.unnamedGraphicCount),
      documentLang: typeof record.documentLang === "string" ? record.documentLang : undefined,
      partLangs: Array.isArray(record.partLangs)
        ? record.partLangs.filter((n): n is string => typeof n === "string")
        : undefined,
      partLangCount: num(record.partLangCount),
    };
  }
  return null;
}

/**
 * The two ORACLE COUNTS the deterministic rules may read, attached in ONE place.
 *
 * Both are recorded as DIAGNOSTICS (`structureCensus`, `domCensus`), and `diagnostics` is on the
 * exporter's `FORBIDDEN_INPUT_KEYS` so the model never sees them — that separation is deliberate and
 * documented. Extracting them is therefore a step every rule caller must take, and until 2026-08-28 six
 * callers took it six ways: the CLI inline, two audits with byte-identical private `withCensus` helpers,
 * the exporter inline, the eval runner inline, and `score-rules` by spreading `ruleEvidence`.
 *
 * That is not a tidiness complaint, and the evidence is in the repo twice, pointing in OPPOSITE directions:
 *
 *   - The AX census reached the CLI and NOT the two audits, so every census-reading rule was unreachable
 *     exactly where it was being CHECKED while working in the product. Caught only by two gates
 *     disagreeing about one corpus (`1.3.1:no-headings`: `29/29 EXACT` from one, `fired 0x` from the other).
 *   - The DOM census reached the EXPORTER and nothing else — so the first rule to read it would have passed
 *     `rules:gate` on 1,183 conformant records and never once fired for a user. Nothing would have said so:
 *     a rule that is silent in the product looks exactly like a page with nothing to report.
 *
 * The second is the worse half and it was already loaded. A gate that does not exercise what ships is this
 * repo's most-recorded defect; a gate that exercises what does NOT ship is the same defect with the alarm
 * disconnected, because the green result actively vouches for the silence.
 *
 * So there is ONE step, and `rule-oracles.test.ts` DISCOVERS every module that builds a rule input and
 * requires it to call this. Adding an oracle is then one line here rather than six edits and a hope.
 *
 * ABSENT STAYS ABSENT. A capture predating either census yields `undefined`, which every rule must read as
 * "cannot say" and none as "none" — the distinction the whole census exists to preserve. `undefined` also
 * disappears through `JSON.stringify`, so an exported record carries the key only when the count is real.
 */
export type PageCensus = NonNullable<ReturnType<typeof pageCensus>>;
export type DomCensus = NonNullable<ReturnType<typeof domCensus>>;

/**
 * What a rule may read BESIDE the announcements. One type, because there were three and they had drifted:
 * `{heading, link}` in `judge.ts`, `{heading, link, graphic, graphicUnnamed}` in `rules.ts`, and
 * `Record<string, number>` in `conformance.ts`. The narrowest won wherever a value crossed a boundary, so
 * `graphicUnnamed` — which the 1.1.1 rule asserts on — could not be passed through the judge's own input
 * type at all. Widening one of three is how the next reader gets a field the writer already sends.
 */
export interface OracleCounts {
  /** Per-type: whether the sweep announced everything the page exposes. `unknown` is a real answer. */
  completeness?: Record<string, Completeness>;
  census?: PageCensus;
  dom?: DomCensus;
  probes?: ProbeStates;
  /** Announcements heard in truncated form. A truncated name matches nothing and must not be compared. */
  truncated?: string[];
  /** What this capture can bear a claim about, per claim, with the reason. */
  supports?: CaptureSupports;
  /** Whether the page opened on a consent banner, and whether focus ever escaped it. */
  banner?: ConsentBanner;
}

export function oracleCounts(capture: CapturedAnnouncements): OracleCounts {
  return {
    census: pageCensus(capture) ?? undefined,
    dom: domCensus(capture) ?? undefined,
    probes: probeStates(capture) ?? undefined,
    completeness: sweepCompleteness(capture),
    truncated: truncatedAnnouncements(capture),
    supports: captureSupports(capture),
    banner: consentBanner(capture),
  };
}

/** The structural counts a page-state fingerprint compares. Named once; the order is the report order. */
const FINGERPRINT_KEYS = ["tabbable", "formField", "link", "landmark", "heading", "graphic"] as const;

export interface ProbeStates {
  /** The fingerprint taken immediately BEFORE each probe, keyed by that probe's name. */
  states: Record<string, Record<string, number>>;
  /**
   * Did the two probes observe the same page?
   *
   * `undefined` IS A THIRD ANSWER and must never be read as `true`. Fewer than two usable fingerprints
   * means nobody asked — a capture predating the mark, or a census that failed — and a rule that treats
   * that as agreement is asserting on a comparison it never made.
   */
  sameState?: boolean;
  /** WHICH counts moved, so a rule can say what changed rather than only that something did. */
  changed?: string[];
}

/**
 * DID THE TWO CHANNELS SEE THE SAME PAGE? — determinism-plan D7.
 *
 * A capture is not an instant. The sweep's disclosure probe ACTIVATES a control, so a page whose search
 * panel opens is a different page by the time the focus walk runs — measured on `nls.uk/join/`, where the
 * tab ring is 10 stops under one probe order and 150 under the other. No amount of restoring the SCREEN
 * READER's state undoes a click, which is why D3 was necessary and not sufficient.
 *
 * Until now the rules INFERRED this from overlap: `channelRelation.disjoint` reasons that two channels
 * sharing no control names probably saw different pages. That inference is load-bearing for 2.1.1 and it
 * is a guess — it cannot distinguish "the page moved" from "the sweep found nothing", and it is silent
 * whenever the two channels overlap a little. The capture has recorded the answer per probe since D7's
 * first half; this makes it READABLE instead of re-derived.
 *
 * Compared on structural COUNTS rather than content, deliberately. A page whose clock ticks or whose link
 * turns `visited` has not changed shape, and a fingerprint that flagged it would refuse every real site —
 * exactly the ticking-clock trap `gate:probe-order` already had to learn on `tfl.gov.uk`.
 */
export function probeStates(capture: CapturedAnnouncements): ProbeStates | null {
  const marks = Array.isArray(capture.diagnostics) ? capture.diagnostics : [];
  const states: Record<string, Record<string, number>> = {};
  for (const mark of marks) {
    if (typeof mark !== "object" || mark === null) continue;
    const record = mark as Record<string, unknown>;
    // A FAILED CENSUS IS NOT A READING. `markPageState` marks even when the count failed, precisely so
    // "not counted" stays distinguishable from "none" — so it must be skipped here, not read as zeroes.
    if (record.event !== "pageState" || record.error) continue;
    const probe = typeof record.beforeProbe === "string" ? record.beforeProbe : null;
    if (!probe) continue;
    const counts: Record<string, number> = {};
    for (const key of FINGERPRINT_KEYS) {
      if (typeof record[key] === "number") counts[key] = record[key] as number;
    }
    if (Object.keys(counts).length > 0) states[probe] = counts;
  }
  if (Object.keys(states).length === 0) return null;
  return { states, ...compareStates(states) };
}

/** @returns `sameState`/`changed`, or NEITHER when there is not enough to compare — see `sameState`. */
function compareStates(states: Record<string, Record<string, number>>):
  { sameState?: boolean; changed?: string[] } {
  const taken = Object.values(states);
  if (taken.length < 2) return {};
  const changed = FINGERPRINT_KEYS.filter((key) => {
    // Only keys EVERY fingerprint carries can be compared. One probe counting `tabbable` and another not
    // is a capture straddling a census change, not a page that moved.
    const values = taken.map((state) => state[key]);
    return values.every((value) => typeof value === "number") && new Set(values).size > 1;
  });
  return { sameState: changed.length === 0, changed: changed.length ? [...changed] : undefined };
}

/**
 * IS THE SWEEP COMPLETE? — capture-integrity-plan C1, computed HOST-SIDE and here is why.
 *
 * The sweep is a SAMPLE that everything downstream reads as a CENSUS. `structure.headings` is what NVDA
 * announced during a quick-nav walk; rules read it as what the page HAS. When those differ, an absence
 * claim is a claim about the walk rather than about the page — which is how `1.3.1:no-headings` and every
 * other absence rule can be wrong without anything noticing.
 *
 * ## Comparing like with like took two corrections
 *
 * The worker's `structureCrossCheck` compared the sweep's length against the ELEMENT count, and
 * `collectPhrase` dedupes — so it compared a deduplicated list against a raw count. Measured 2026-08-29
 * across 106 real captures: 75% of named elements share a name with another, every page has duplicates,
 * and the median sweep/element ratio was 0.24. That produced "97% of pages disagree", about half of it
 * definitional.
 *
 * Counting DISTINCT NAMES in the census fixed most of it — tfl's graphics went from `20 vs 34` to
 * `20 vs 19` — and exposed a finer gap: the sweep dedupes on the ANNOUNCEMENT, so two headings both named
 * "Contact" at different levels are two announcements and one name. This resolves it by extracting the
 * NAME from each announcement, which is why it lives here and not in the worker: `parseAnnouncement` is
 * the single grammar for that, validated on 6,555 cross-channel comparisons, and it is TypeScript the
 * plain-node worker cannot import.
 *
 * ## `unknown` is a verdict
 *
 * A capture whose census predates `distinct` cannot answer, and that must never read as `exact`. Absence
 * treated as agreement is the defect this project pays for most often — `census.heading` absent read as
 * zero, `sameState: undefined` read as false, a recovery metric read with `?? 0`.
 */
export type Completeness = "exact" | "truncated" | "phantom" | "unknown";

/**
 * WHAT THE CAPTURE ITSELF SAYS IT ASKED — capture-protocol 9, preferred over inferring it.
 *
 * Everything else in this file is archaeology: it reconstructs, from a census and a scatter of diagnostic
 * marks, what the capture should have recorded at the time. That works and it degrades with age, which is
 * why `unknown` had to be invented as a fourth verdict. Protocol 9 records the fact first-hand, so where
 * `observed` is present it is the answer and no inference is needed.
 *
 * ABSENT means a capture older than protocol 9, and absent must not read as `asked: true` — a pre-9
 * capture cannot say, and saying it can is the exact defect this field was added to remove. So the caller
 * falls back to its inference rather than to an assumption.
 *
 * @returns the recorded observation, or `undefined` when this capture predates the field
 */
function observationOf(capture: CapturedAnnouncements, channel: string):
  { asked?: unknown; complete?: unknown } | undefined {
  const observed = (capture as { observed?: unknown }).observed;
  if (typeof observed !== "object" || observed === null) return undefined;
  const seen = (observed as Record<string, unknown>)[channel];
  return typeof seen === "object" && seen !== null ? seen as { asked?: unknown } : undefined;
}

/**
 * The sweep field each census type is counted from. Named once; the two must not drift.
 *
 * EXPORTED so `audit-observation-ambiguity.mjs` reads this list rather than restating it. A second
 * hand-written copy is this repo's most expensive recurring shape -- the signal-type regex that
 * scraped its subject and then asserted over an empty set is the worked example -- and the remedy
 * the record prefers is the first one: delete a copy.
 */
export const SWEEP_OF: Record<string, "headings" | "links" | "landmarks" | "graphics" | "formFields"> = {
  heading: "headings", link: "links", landmark: "landmarks", graphic: "graphics",
  // `formControl` and not `formField`: the census counts the roles NVDA's `f` quick-nav actually visits,
  // which includes buttons. `dom.formField` is a narrower set and is 2.1.2's denominator; comparing the
  // sweep against THAT would report a phantom on every page with a button. See `FORM_CONTROL_ROLES`.
  formControl: "formFields",
};

/**
 * Per-type: did the sweep announce as many distinct names as the page exposes?
 *
 * @param capture a capture, unwrapped
 * @returns one verdict per type the census counts, or `unknown` where it cannot say
 */
/**
 * WHAT THE SWEEP FOUND, counted the way the census counts it.
 *
 * The census counts distinct NAMES for named elements and each UNNAMED element individually, so the sweep
 * has to be reduced the same way or the two are not comparable — which is the definitional error that made
 * "97% of pages disagree" half arithmetic.
 *
 * A LANDMARK'S NAME IS IN `containers`, NOT `objects`, and reading `objects` for every type is what made
 * 100 of 267 real landmark announcements yield nothing. `announcement.ts` treats a landmark as CONTEXT by
 * deliberate design — reading one as the object's role once reported three conformant W3C pages as 4.1.2
 * failures — so `objects[0]` is correctly undefined there and the question had to be asked of the other
 * channel.
 *
 * @param announced the sweep's announcements for one type
 * @param type the census type, which decides WHICH channel carries the name
 * @returns distinct names, and how many unnamed elements were announced
 */
function sweptElements(announced: string[], type: string): { names: Set<string>; unnamed: number } {
  const clean = (name: string) => name.replace(/[\s,]+/g, " ").trim();
  const parsed = announced.map((a) => parseAnnouncement(String(a), "sweep"));
  // EVERY landmark container, not just the first: 5% of real entries carry more than one, because NVDA
  // announces the containers it passed through on the way in.
  const found = type === "landmark"
    ? parsed.flatMap((p) => p.containers.filter((c) => isLandmarkRole(c.role)).map((c) => c.name))
    : parsed.map((p) => p.objects[0]?.name ?? "");
  return {
    names: new Set(found.map(clean).filter(Boolean)),
    // UNNAMED ELEMENTS ARE COUNTED, FOR EVERY TYPE, because that is what the census does.
    //
    // This counted them for landmarks only, reasoning that elsewhere an unnamed element is
    // indistinguishable from an announcement the grammar could not read. The consequence was the opposite
    // of the one intended: dropping them manufactured a capture defect out of the page's own markup.
    //
    // `browser-session.mjs` is explicit about the other side — "An UNNAMED element has no name to be
    // distinct from, and the sweep still announces it — so it counts once per element rather than being
    // collapsed. Treating unnamed elements as one would under-count the very thing 1.1.1 and 4.1.2 are
    // about." So `census.distinct` includes them and this did not, and the two could never agree on a page
    // carrying one.
    //
    // Measured on `keyboard-unreachable-native-button+also-filename-alt-bare-edit-inert.bad`: the sweep
    // announced `["Full name, edit", "Delete draft, button", "Email, edit", "edit"]` and the census said
    // `distinct.formControl = 4`. Dropping the bare `"edit"` gave 3 against 4 — TRUNCATED — on a sweep that
    // was exact. `assertableSweep` then refused 2.1.1's absence claim, and `rules:gate` failed the record.
    //
    // AND THE PAGES IT FIRES ON ARE EXACTLY THE ONES THAT MATTER: an unnamed control IS the 4.1.2 and
    // 3.3.2 finding, so this marked the formControl sweep truncated on precisely the captures whose
    // finding is an unnamed control. "A check must never reject evidence whose absence is the finding" is
    // this repo's most expensive rule, and this was that rule inverted — rejecting evidence because the
    // finding was PRESENT.
    unnamed: found.filter((name) => !clean(name)).length,
  };
}

/**
 * Per-type: did the sweep announce as many distinct names as the page exposes?
 *
 * @param capture a capture, unwrapped
 * @returns one verdict per type the census counts, or `unknown` where it cannot say
 */
/**
 * NVDA states a table's size when the caret enters it: "table, with 3 rows and 7 columns".
 *
 * The census cannot answer this — it counts landmarks, headings, links, graphics and form controls, not
 * cells — so the screen reader's OWN WORDS are the only ground truth available, which arguably makes this
 * the better oracle of the two. Carried over from `completeness.ts`, which computed it correctly on
 * 2026-08-24 and was never wired to anything.
 *
 * A FRACTION, not equality, and that is not laziness. A sweep legitimately reports fewer cells than
 * rows x columns — merged cells, a caption row, cells NVDA groups — so demanding exactness would mark
 * healthy captures incomplete and suppress real findings. Measured at this threshold: 122 of 122 corpus
 * table captures complete, and the real page that prompted it 0 of 21, which is the separation it has to
 * make.
 */
const TABLE_DIMENSIONS = /\btable,?\s+with\s+(\d+)\s+rows?\s+and\s+(\d+)\s+columns?/i;

/** A cell sweep reaching at least this fraction of rows x columns counts as complete. */
const CELLS_ENOUGH = 0.5;

/**
 * Did the cell sweep reach enough of the table NVDA announced?
 *
 * @param capture a capture, unwrapped
 * @returns a verdict, or `unknown` when no table announced its dimensions
 */
function tableCompleteness(capture: CapturedAnnouncements): Completeness {
  const transcript = Array.isArray(capture.transcript) ? capture.transcript : [];
  const dimensions = transcript
    .map((line) => TABLE_DIMENSIONS.exec(String(line)))
    .find((match): match is RegExpExecArray => match !== null);
  if (!dimensions) return "unknown";
  // A PROBE THAT NEVER RAN IS NOT A SWEEP THAT CAME UP SHORT. `probeTables` is opt-in, so a page with a
  // table captured without it has `tableCells: []` — and this read that as TRUNCATED, which says the
  // sweep tried and missed. `assertableSweep` then refused 1.3.1's claim on a capture that had simply
  // never been asked.
  //
  // Measured on `keyboard-unreachable-action+also-position-only-table-bare-edit-inert.bad`: a multi-defect
  // case whose ACCOMPANYING defect adds a table, on a host whose options carry `probeTables: false`. The
  // page announces its dimensions in the transcript, so the branch above is reached, and the verdict was
  // truncated for a probe nobody ran.
  //
  // The probe marks `tableCells` whenever it runs, including when it finds none — which is exactly the
  // distinction `markPageState` draws twenty lines below, and the reason that mark exists.
  //
  // PROTOCOL 9 SAYS SO DIRECTLY, and this now asks before inferring. Hunting for the mark still works and
  // stays as the fallback for older captures — deleting it would make every pre-9 capture unreadable to
  // answer a question they can answer.
  const recorded = observationOf(capture, "tableCells");
  if (recorded && recorded.asked === false) return "unknown";
  const marks = Array.isArray(capture.diagnostics) ? capture.diagnostics : [];
  const probeRan = marks.some((m) => typeof m === "object" && m !== null
    && (m as { event?: unknown }).event === "tableCells");
  if (!recorded && !probeRan) return "unknown";
  const expected = Number(dimensions[1]) * Number(dimensions[2]);
  const seen = (capture.structure as { tableCells?: unknown[] } | undefined)?.tableCells?.length ?? 0;
  return seen >= expected * CELLS_ENOUGH ? "exact" : "truncated";
}

export function sweepCompleteness(capture: CapturedAnnouncements): Record<string, Completeness> {
  const marks = Array.isArray(capture.diagnostics) ? capture.diagnostics : [];
  const census = marks.find((m) => typeof m === "object" && m !== null
    && (m as { event?: unknown }).event === "structureCensus") as
    { distinct?: Record<string, number> } | undefined;
  const out: Record<string, Completeness> = {};
  for (const [type, field] of Object.entries(SWEEP_OF)) {
    // A CHANNEL NOBODY ASKED ABOUT CANNOT BE COMPARED, and under protocol 9 the capture says so itself
    // rather than being inferred from a census that may simply be absent. Checked BEFORE the census, so
    // "we never asked" is never reported as "the sweep came up short".
    if (observationOf(capture, field)?.asked === false) { out[type] = "unknown"; continue; }
    const expected = census?.distinct?.[type];
    const announced = (capture.structure as Record<string, string[]> | undefined)?.[field];
    if (typeof expected !== "number" || !Array.isArray(announced)) { out[type] = "unknown"; continue; }
    const { names, unnamed } = sweptElements(announced, type);
    // A SWEEP THAT YIELDED NO ELEMENT AT ALL CANNOT SAY.
    //
    // Reachable for LANDMARKS only, now that unnamed elements are counted for every type: the other types
    // take one entry per announcement, so anything announced contributes either a name or an unnamed
    // count. Landmarks flatMap over CONTAINERS, and an announcement carrying no landmark container
    // contributes nothing — so a landmark sweep can announce lines and yield zero elements.
    //
    // Declining is the honest answer and not a pass. This guard previously also caught pages of unnamed
    // controls, because they were dropped rather than counted; that was the bug, not the protection.
    if (names.size === 0 && unnamed === 0 && announced.length > 0) { out[type] = "unknown"; continue; }
    const found = names.size + unnamed;
    out[type] = found === expected ? "exact" : found < expected ? "truncated" : "phantom";
  }
  out.tableCells = tableCompleteness(capture);
  return out;
}


/**
 * The announcements this capture believes are TRUNCATED — capture-integrity-plan C5.
 *
 * A truncated announcement is not a shorter announcement, it is a DIFFERENT STRING. `"o, button"` for a
 * control really named "Open account search" matches nothing, so every name comparison in this codebase
 * silently drops it: `comparableNames` produces "o", the tab order produces "Open account search", and
 * 2.1.1 reads the difference as a control the keyboard never reached.
 *
 * That is the U+FFFC and U+E604 class exactly — a name that cannot match itself because a second alphabet
 * got into it — and it is at 40% of real captures rather than 3%. The capture has detected this since
 * `truncatedAnnouncements` was written; it lands as a DIAGNOSTIC, and `diagnostics` is on the exporter's
 * `FORBIDDEN_INPUT_KEYS`, so no rule could ever reach it. The same shape as the census before C1.
 *
 * @param capture a capture, unwrapped
 * @returns the announcements heard in truncated form, verbatim, or `[]`
 */
export function truncatedAnnouncements(capture: CapturedAnnouncements): string[] {
  const marks = Array.isArray(capture.diagnostics) ? capture.diagnostics : [];
  const mark = marks.find((m) => typeof m === "object" && m !== null
    && (m as { event?: unknown }).event === "truncatedAnnouncements") as
    { truncated?: { heard?: unknown }[] } | undefined;
  return (mark?.truncated ?? [])
    .map((t) => typeof t?.heard === "string" ? t.heard : "")
    .filter(Boolean);
}

/** A claim a capture can or cannot bear, with the reason — never a bare boolean. */
export interface Support { ok: boolean; why: string }

/** What a capture can support. `absence` is per element type; the other two are whole-capture. */
export interface CaptureSupports {
  absence: Record<string, Support>;
  ordering: Support;
  naming: Support;
}

/** Read-through stop reasons that mean the read REACHED THE END, rather than ran out of budget. */
const REACHED_THE_END = new Set(["exhausted", "repeatBottom", "wrap"]);

/**
 * WHAT CAN THIS CAPTURE SUPPORT? — capture-integrity-plan C6.
 *
 * The property that makes the rest of the plan checkable, and the reason it lives HERE rather than in the
 * three tools that each derived it: `capture:explain` computed it by reading marks after the fact, the
 * rules inferred it per-rule, and a CLI finding could not cite it at all. Three re-derivations of one
 * fact is the shape this repo pays for most often — the probe order was written down in six places and
 * they drifted.
 *
 * Deliberately host-side rather than on the worker, for C1's reason: `parseAnnouncement` is the single
 * announcement grammar and it is TypeScript the plain-node worker cannot import. The worker records
 * evidence; the host interprets it.
 *
 * Every answer carries its reason, because `ok: false` alone sends a reader back to the capture to find
 * out which of four things went wrong.
 *
 * @param capture a capture, unwrapped
 * @returns per-type absence support, plus ordering and naming
 */
export function captureSupports(capture: CapturedAnnouncements): CaptureSupports {
  const marks = Array.isArray(capture.diagnostics) ? capture.diagnostics : [];
  const mark = (event: string) => marks.find((m) => typeof m === "object" && m !== null
    && (m as { event?: unknown }).event === event) as Record<string, unknown> | undefined;

  const completeness = sweepCompleteness(capture);
  // A BLOCKING BANNER OUTRANKS EVERY PER-TYPE VERDICT. If focus never left the consent dialog, the sweep
  // is a complete and accurate account of the BANNER, and "this page has no headings" is a statement
  // about a dialog. An exact sweep of the wrong thing is the most confident way to be wrong.
  const banner = consentBanner(capture);
  const absence: Record<string, Support> = {};
  for (const [type, verdict] of Object.entries(completeness)) {
    if (banner.blocking) { absence[type] = { ok: false, why: banner.why }; continue; }
    absence[type] = verdict === "exact"
      ? { ok: true, why: "the sweep announced exactly what the tree exposes" }
      : verdict === "unknown"
        ? { ok: false, why: "this capture cannot say whether the sweep was complete" }
        : { ok: false, why: `the sweep is ${verdict} against the tree` };
  }

  // ORDERING rests on the READ-THROUGH, which is the only ordered channel this tool has: the sweep is a
  // count walk and its order is an artefact of where the caret was. A read that ran out of budget saw a
  // PREFIX of the page, so an ordering claim about what it saw is sound and one about the page is not.
  const read = mark("readThrough");
  const stop = read?.stopReason;
  const ordering: Support = !read
    ? { ok: false, why: "no read-through was recorded" }
    : REACHED_THE_END.has(String(stop))
      ? { ok: true, why: `the read reached the end of the page (${String(stop)})` }
      : { ok: false, why: `the read stopped at ${JSON.stringify(stop)}, so it saw a prefix of the page` };

  // NAMING rests on names being comparable at all. A truncated announcement is a different string, not a
  // shorter one, so it matches nothing — see C5.
  // AN ABSENT MARK IS NOT A CLEAN ONE. The capture used to write this mark only when it FOUND a
  // truncation, so "none" and "never checked" were one silence — and the first version of this function
  // read that as `ok: true`, handing a confident clean answer to every capture predating the detector.
  // Caught by `explain-capture.test.ts`, whose whole subject is absent-read-as-zero.
  const truncationMark = mark("truncatedAnnouncements");
  const cut = truncatedAnnouncements(capture);
  const naming: Support = !truncationMark
    ? { ok: false, why: "this capture cannot say whether any announcement was truncated" }
    : cut.length === 0
      ? { ok: true, why: "no announcement arrived truncated" }
      : { ok: false, why: `${cut.length} announcement(s) arrived truncated and cannot be matched by name` };

  return { absence, ordering, naming };
}

/** Words that open a consent banner. Matched against the OPENING announcements only. */
const CONSENT_WORDS = /cookie|consent|accept all|privacy settings|manage preferences/i;

/** How many opening announcements can be a banner before the page itself must have started. */
const OPENING_ANNOUNCEMENTS = 3;

/** Whether a consent banner was present, and — a DIFFERENT question — whether it blocked the capture. */
export interface ConsentBanner { present: boolean; blocking: boolean; why: string }

/**
 * WAS THERE A CONSENT BANNER, AND DID IT STOP US? — capture-integrity-plan C4.
 *
 * Over half the real-page corpus opens behind one, and the decision recorded in ADR 0023 is to CAPTURE
 * THE PAGE AS IT IS and say so, rather than to click somebody's "Accept all". The tool's own rule about
 * `probeForms` settles it: pressing a stranger's button is not a review, and consenting to tracking on a
 * visitor's behalf is a stronger act than pressing *Book*. A first-time visitor genuinely meets the
 * banner, so the capture is honest; what was missing is that findings did not SAY which page they
 * describe.
 *
 * TWO QUESTIONS, DELIBERATELY SEPARATE, and merging them is a mistake already made here: a metric once
 * reported "50 of 86 captures read the site's furniture" by combining "has a cookie banner" — which is
 * nearly every UK government site and costs nothing — with "never got past one", which was a single page
 * and invalidates everything downstream. `present` is context; `blocking` is a defect.
 *
 * @param capture a capture, unwrapped
 * @returns whether a banner opened the capture, and whether focus never escaped it
 */
export function consentBanner(capture: CapturedAnnouncements): ConsentBanner {
  const transcript = Array.isArray(capture.transcript) ? capture.transcript : [];
  const opening = transcript.slice(0, OPENING_ANNOUNCEMENTS).join(" ");
  const present = CONSENT_WORDS.test(opening);
  const marks = Array.isArray(capture.diagnostics) ? capture.diagnostics : [];
  const confinement = marks.find((m) => typeof m === "object" && m !== null
    && (m as { event?: unknown }).event === "focusConfinement") as
    { confined?: boolean; ring?: number } | undefined;
  const blocking = present && confinement?.confined === true;
  if (!present) return { present, blocking, why: "no consent banner in the opening announcements" };
  return {
    present,
    blocking,
    why: blocking
      ? `focus never left the banner (ring of ${confinement?.ring ?? "?"}), so this capture describes the `
        + "banner and not the page behind it"
      : "the page opens on a consent banner, so this evidence describes the page WITH it present — which "
        + "is what a first-time visitor meets",
  };
}

/**
 * Was the CDP target a census mark came from ever confirmed to be the page this capture navigated to?
 *
 * `docs/backlog.md`'s furniture-census row is the reason this exists: `bathingwaters.sepa.org.uk` and
 * `lbhf.gov.uk/council-tax` returned a byte-identical census because `choosePageTarget` took a Cookiebot
 * widget's own CDP target, and nothing downstream could tell — a wrong-document census is not ABSENT
 * evidence, the way a genuinely headless page's `heading: 0` is; it is evidence of a DIFFERENT page wearing
 * this one's name, which every consumer of `census`/`dom` was trusting unconditionally.
 *
 * `targetMatch: "matched"` is the only outcome that PROVES the target: `choosePageTarget` confirmed its
 * path and query against the URL this capture navigated to. Both other outcomes need `candidates` to be
 * read at all — `targetMatch` alone conflates two situations that need opposite verdicts:
 *
 *   candidates <= 1   nothing else this fallback COULD have picked; the only target is the right one
 *   candidates  > 1   a real second page-type target existed and neither one was confirmed -- the exact
 *                     shape of the bathingwaters/lbhf contamination
 *
 * `candidates` absent while `targetMatch` is present is a capture taken in the gap between the two
 * shipping — this function cannot vouch for it, so it reads the SAME as `> 1`: suspect. `targetMatch`
 * absent entirely means this capture predates `choosePageTarget`'s fix altogether, and is read as before
 * this existed -- not suspect -- because there is nothing here to doubt it WITH; every historical capture
 * was already being trusted, and this field cannot retroactively accuse one it was never computed for.
 *
 * EXPORTED so `check-real-page-findings.ts`'s human-facing report can ask the identical question of the
 * RAW mark -- the one place that must see a suspect census even though `pageCensus`/`domCensus` correctly
 * hide its numbers. One rule, not two: a second copy here is exactly the "fact stated twice" shape this
 * repo keeps paying for.
 */
export function censusTargetIsSuspect(record: { targetMatch?: unknown; candidates?: unknown }): boolean {
  if (record.targetMatch === undefined) return false;
  if (record.targetMatch === "matched") return false;
  return typeof record.candidates !== "number" || record.candidates > 1;
}

export function pageCensus(capture: CapturedAnnouncements):
  { heading?: number; link?: number; graphic?: number; graphicUnnamed?: number } | null {
  const marks = Array.isArray(capture.diagnostics) ? capture.diagnostics : [];
  for (const mark of marks) {
    if (typeof mark !== "object" || mark === null) continue;
    const record = mark as {
      event?: unknown; heading?: unknown; link?: unknown; graphic?: unknown;
      graphicUnnamed?: unknown; error?: unknown; targetMatch?: unknown; candidates?: unknown;
    };
    if (record.event !== "structureCensus" || record.error) continue;
    // A SUSPECT CENSUS READS AS ABSENT, never as its own wrong numbers. `null` is what every existing
    // reader already treats as "cannot say" -- `addMissingHeadings`, `crossCheckStructure`, this file's
    // own `domCensus` pairing -- so this reuses machinery already proven conservative rather than adding a
    // third state nothing downstream knows how to interpret. The raw counts stay on the diagnostic mark
    // itself for a human to read; only the RULE-FACING reader refuses to vouch for them.
    if (censusTargetIsSuspect(record)) return null;
    return {
      heading: typeof record.heading === "number" ? record.heading : undefined,
      link: typeof record.link === "number" ? record.link : undefined,
      graphic: typeof record.graphic === "number" ? record.graphic : undefined,
      // Absent on captures made before the counter existed, and `undefined` must stay distinguishable
      // from 0: 0 means "the page exposes no unnamed images", undefined means "this capture cannot say".
      graphicUnnamed: typeof record.graphicUnnamed === "number" ? record.graphicUnnamed : undefined,
    };
  }
  return null;
}

/**
 * A page big enough that reaching almost none of it cannot be explained by the page being small.
 * Below this the comparison is noise: a page with three headings tells you nothing by missing two.
 */
const CENSUS_HEADINGS_TO_JUDGE = 20;

/** Reaching under this share of a substantial page's headings means the screen reader was contained. */
const MIN_HEADINGS_REACHED = 0.1;

/**
 * Was the screen reader able to REACH the page, or was it held somewhere inside it?
 *
 * The failure this exists for is a consent wall, and it is not a wrong-page failure — the URL is right,
 * the title is right, and a title word appears in the dialog's own text, so every other gate passes. On
 * theregister.com the modal traps focus and quick navigation cannot leave it:
 *
 *     census (the real page)   793 links   463 headings   13 landmarks
 *     sweep  (what was reached)  0 links     1 heading     0 landmarks
 *
 * The run then reported "No lived-experience findings" for a page it had never seen, which is this
 * project's one unforgivable output: silence rendered as a clean bill of health.
 *
 * **Headings only, deliberately.** The other three counts cannot carry a gate. Quick navigation cannot
 * reach a landmark that CONTAINS the caret, so a `<main>` wrapping the page is missing from 2,063 of 2,064
 * corpus captures. And `links` and `graphics` came back empty on a perfectly good gov.uk capture — 0 of a
 * real 79 — for a reason that turned out to be a bug in this pipeline rather than anything about the page.
 * A gate built on either would have fired constantly on healthy captures and been switched off. Headings
 * are the one comparator measured as sound: 37 of 38 on that same capture.
 */
export function captureReachedThePage(capture: CapturedAnnouncements): boolean {
  const census = pageCensus(capture);
  const exposed = census?.heading;
  // No census means no oracle, and no oracle means no verdict. Every capture taken before the census
  // existed lands here and must be unaffected.
  if (typeof exposed !== "number" || exposed < CENSUS_HEADINGS_TO_JUDGE) return true;
  const reached = capture.structure?.headings.length ?? 0;
  return reached >= exposed * MIN_HEADINGS_REACHED;
}

/**
 * Did we hear the PAGE, or only its title?
 *
 * `captureMentionsTitle` asks "is this the right page" and cannot answer this one -- worse, it is
 * satisfied by exactly the artefact that means failure. A degenerate capture's whole transcript is
 * the document title, so the title check passes trivially and the capture is accepted as evidence.
 * Measured on a real worker: 2 of 5 captures of one page returned transcript
 * `["Aquarium 001 schedule"]`, no headings and no table cells, and would have been written to the
 * dataset as though NVDA had read the page.
 *
 * The cause is known and documented in capture-core: `waitForDocument` asks NVDA to report the
 * document title, which leaves the title as the last spoken phrase, and a read-through that begins
 * before the anchor takes effect records that instead of the page's first line.
 *
 * Substance means anything beyond the title: a second announced phrase, or a single structural or
 * interaction element. A page whose only evidence is its own title has not been read.
 */
export function captureHasSubstance(capture: CapturedAnnouncements, title: string): boolean {
  const s = capture.structure;
  const it = capture.interaction;
  const structural = [
    s?.headings, s?.landmarks, s?.formFields, it?.controls, it?.stateChanges, it?.postSubmitFields,
  ].some((list) => (list?.length ?? 0) > 0);
  if (structural) return true;

  const normalise = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();
  const wanted = normalise(title);
  // "blank" is NVDA's word for an empty line, so a transcript of nothing but "blank" means it read an
  // empty document. Measured: a capture returned `["blank","blank"]`.
  //
  // captureMentionsTitle already rejects that one -- no significant title word appears in it -- so this
  // is belt and braces rather than a hole being closed. It matters for a page whose title happens to be
  // a common word, where the title check is deliberately lenient and would let it through.
  const isNothing = (phrase: string) => {
    const text = normalise(phrase);
    return text === "" || text === wanted || text === "blank";
  };
  return capture.transcript.some((phrase) => !isNothing(phrase));
}

/**
 * Does the capture contradict itself?
 *
 * The strongest check available, because it needs no knowledge of the page. If the read-through
 * announced a heading, then the page HAS a heading, so a heading sweep that found none did not run
 * properly -- the two halves of the same capture disagree, and one of them is wrong.
 *
 * This catches a degenerate shape that both other checks miss. Measured:
 *
 *   transcript: ["heading, level 1, Aquarium 001 schedule"]   headings: []   tableCells: []
 *
 * `captureMentionsTitle` passes (the title is in there), and `captureHasSubstance` passes too (the
 * phrase is not merely the title) -- yet the page was never traversed. That shape is worse than an
 * empty capture, because a role-bearing phrase looks like real evidence.
 *
 * Deliberately one-directional: headings in the sweep with none in the transcript is NORMAL, since
 * the read-through is capped by `steps` and may stop before reaching them.
 */
export function captureIsSelfConsistent(capture: CapturedAnnouncements): boolean {
  const heardAHeading = capture.transcript.some((phrase) => /\bheading, level \d/i.test(phrase));
  const sweptAHeading = (capture.structure?.headings.length ?? 0) > 0;
  return (!heardAHeading || sweptAHeading) && !sweepWentSilentOnAPopulatedPage(capture);
}

/**
 * Did a sweep go SILENT on a page the accessibility tree says has that element?
 *
 * The heading check above is vacuous on a page with no headings, and that is exactly where it was needed.
 * Measured 2026-09-01 on `headings-none-refunds+also-filename-alt`, which is a no-headings case:
 *
 *     readThrough  330 s / 12 lines (maxSteps)      -- against ~20 s / 30 for the same base page
 *     links        swept 0, census 6                -- observed.complete false, stop {prev,next} silent
 *     graphics     swept 0, census 1                -- likewise; the tree even names it, "DSC_0421.jpg"
 *
 * `heardAHeading` was false, so the capture passed, went into the corpus, and surfaced hours later as a
 * `grants-audit` failure — a record labelled for a defect its capture did not carry. A fresh capture of
 * the same page was clean in 22 s, so the page was never at fault.
 *
 * ALL FOUR CONDITIONS ARE REQUIRED, and each rules out a legitimate shape:
 *
 *   census > 0        the tree says the element is there, so "the page has none" is excluded
 *   sweep found 0     not a shortfall, a total absence
 *   complete false    the sweep did NOT run to exhaustion, so this is not the documented residual gap
 *                     between quick-nav and the tree ("a question about this tool, not the page")
 *   stop silent       NVDA answered nothing, rather than "no next link" — the announced terminus
 *
 * That last pair is the whole discipline of `observed`: `exhausted` is the screen reader's own answer and
 * `silent` is an inference we refuse to trust. A sweep that ran out honestly is evidence; one that heard
 * nothing while the tree names the element is a capture that could not ask.
 *
 * This does NOT reject evidence whose absence is the finding — the rule this file exists to protect. An
 * unnamed control, a missing alt, a page with no headings: in every one of those the CENSUS is 0 too, so
 * the first condition already excludes them.
 */
function sweepWentSilentOnAPopulatedPage(capture: CapturedAnnouncements): boolean {
  const marks = Array.isArray(capture.diagnostics) ? capture.diagnostics : [];
  const census = marks.find((m) => typeof m === "object" && m !== null
    && (m as { event?: unknown }).event === "structureCensus") as
    { distinct?: Record<string, number> } | undefined;
  if (!census?.distinct) return false;
  return Object.entries(SWEEP_OF).some(([type, field]) => {
    if ((census.distinct?.[type] ?? 0) <= 0) return false;
    const announced = (capture.structure as Record<string, string[]> | undefined)?.[field];
    if (!Array.isArray(announced) || announced.length > 0) return false;
    const seen = observationOf(capture, field) as
      { complete?: boolean; stop?: { prev?: string; next?: string } } | undefined;
    if (seen?.complete !== false) return false;
    return seen.stop?.prev === "silent" && seen.stop?.next === "silent";
  });
}

/**
 * Did the probes we asked for produce anything?
 *
 * **DIAGNOSTIC ONLY. NEVER USE THIS TO REJECT A CAPTURE.** I did, and it was wrong: run against the
 * whole corpus it rejects 100 of 2,122 captures, every one of them half of a pair that
 * `check-signals` scores as discriminating. In a live run it failed 44 cases and added hours.
 *
 * The `custom-control` family shows why. Its bad pages are div-based fake buttons with no <button>
 * element, so NVDA finds no form controls and announces "Print this report" as plain text. THAT IS
 * THE FINDING -- the 4.1.2 failure the case exists to prove:
 *
 *   custom-control-print.bad   formFields []                          <- the evidence
 *   custom-control-print.good  formFields ["Print this report, button"]
 *
 * No version of this can be safe, because "the probe failed" and "absence is the evidence" are
 * distinguished by the CASE DEFINITION, which the capture layer cannot see. `check-signals` can, and
 * already reports it better: BLIND when a signal cannot fire, CONTAMINATED when it fires on both.
 *
 * Kept because it is a reasonable thing to want in diagnostics — just not in a gate.
 */
export function captureRanRequestedProbes(
  capture: CapturedAnnouncements,
  requested: { probeForms?: boolean; probeTables?: boolean },
): boolean {
  if (requested.probeForms && (capture.interaction?.controls.length ?? 0) === 0) return false;
  if (requested.probeTables && (capture.structure?.tableCells?.length ?? 0) === 0) return false;
  return true;
}

/**
 * Why a capture cannot be trusted to describe the requested page, or `null` when it can.
 *
 * One function because the two failures are mutually exclusive and a caller has to pick one message.
 * `wrong-content` is "we read something else"; `contained` is "we read the right page but got almost none
 * of it", which no title check can see because the title, the URL and the dialog's own words all agree.
 */
export type CaptureDoubt = "wrong-content" | "contained";

export function captureDoubt(capture: CapturedAnnouncements, title: string | undefined): CaptureDoubt | null {
  if (title && !captureMentionsTitle(capture, title)) return "wrong-content";
  if (!captureReachedThePage(capture)) return "contained";
  return null;
}

/** The <title> of a served page, or "" if it has none. */
export function titleOf(html: string): string {
  return html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1].trim() ?? "";
}

/**
 * Why a channel's evidence is incomplete. Four kinds, because they need four different responses.
 *
 *   starved   the shared capture deadline ran out before this sweep ran. The evidence is missing.
 *   capped    the per-direction step cap was reached. Often the cursor RE-WALKING rather than a big page:
 *             250 steps yielding 41 unique links is a dedupe fault, not a large document. A different bug
 *             from starvation and it must not be collapsed into it.
 *   faulted   the sweep or the read-through errored, or focus mode could not be escaped.
 *   inferred  the sweep stopped on a repeated phrase or a silent step -- which are GUESSES that it had
 *             reached the end, not the screen reader's own answer. Both have cost real evidence here:
 *             stopping on a repeat gave "graphics 5 of 66" on a page with four identical avatar alts, and
 *             stopping on silence gave "headings 3 of 10, no error anywhere". NVDA announces the end of a
 *             page ("no next heading"), which is `exhausted`; anything else is an inference.
 */
export type TruncationKind = "starved" | "capped" | "faulted" | "inferred";

export interface IncompleteChannel {
  /** The sweep type ("link", "list", ...) or "read-through". */
  channel: string;
  /** The raw stop reason the capture recorded, unmodified. */
  reason: string;
  kind: TruncationKind;
}

/** Sweep terminations that mean the channel was genuinely examined to its end. */
const SWEEP_COMPLETE = new Set(["exhausted"]);
/** Read-through terminations that mean the document was read to its end. */
const READ_COMPLETE = new Set(["repeatBottom", "wrap"]);

const KIND_BY_REASON: Record<string, TruncationKind> = {
  deadline: "starved",
  cap: "capped",
  maxSteps: "capped",
  error: "faulted",
  stepError: "faulted",
  focusModeStuck: "faulted",
  repeat: "inferred",
  silent: "inferred",
};

const kindOf = (reason: string): TruncationKind => KIND_BY_REASON[reason] ?? "faulted";

/**
 * Which of a capture's evidence channels were NOT examined to the end.
 *
 * Needed because **truncation is indistinguishable from absence** in the evidence itself, and on real pages
 * it is the common case rather than the exception. Measured over 26 real-page captures: 9 reported
 * `lists: 0`, and every one of those had a list sweep whose stop was `deadline` -- the sweep never ran. A
 * record built from such a capture teaches a scorer "real pages have no lists", which is precisely the
 * spurious correlation a real-page corpus exists to remove.
 *
 * `crossCheckStructure` cannot answer this and is not meant to: it compares four buckets
 * (heading/landmark/link/graphic) against the accessibility tree, omits `lists` and `formFields` entirely,
 * and its `landmark` bucket disagrees on essentially every capture because quick-nav cannot reach a
 * landmark enclosing the caret. Measured `agrees === false` on 26 of 26 -- saturated, so useless as a gate.
 * It reports; this decides.
 *
 * Pure, and reads only `diagnostics`, so a caller can gate an export without a worker or a browser.
 */
export function captureWasTruncated(diagnostics: unknown): IncompleteChannel[] {
  const marks = Array.isArray(diagnostics) ? diagnostics as Record<string, unknown>[] : [];
  const incomplete: IncompleteChannel[] = [];
  for (const mark of marks) {
    if (mark?.event === "sweep") incomplete.push(...sweepGaps(mark));
    if (mark?.event === "readThrough") incomplete.push(...readThroughGaps(mark));
  }
  return incomplete;
}

/**
 * BOTH directions, reported separately. A sweep that exhausted backwards and starved forwards has seen part
 * of the page, and calling that complete is how a partial count becomes a finding.
 */
function sweepGaps(mark: Record<string, unknown>): IncompleteChannel[] {
  const channel = String(mark.type ?? "unknown");
  return (["prevStop", "nextStop"] as const)
    .map((key) => (typeof mark[key] === "string" ? mark[key] as string : ""))
    .filter((reason) => reason && !SWEEP_COMPLETE.has(reason))
    .map((reason) => ({ channel, reason, kind: kindOf(reason) }));
}

function readThroughGaps(mark: Record<string, unknown>): IncompleteChannel[] {
  const reason = typeof mark.stopReason === "string" ? mark.stopReason : "";
  if (!reason || READ_COMPLETE.has(reason)) return [];
  return [{ channel: "read-through", reason, kind: kindOf(reason) }];
}
