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

/** Whatever a capture backend returned; only the announcement fields matter here. */
export interface CapturedAnnouncements {
  transcript: string[];
  structure?: {
    headings: string[];
    landmarks: string[];
    formFields: string[];
    tableCells?: string[];
  };
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

/** Everything the screen reader said, as one lowercased string. */
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

/** The census mark itself, for the counts rather than the names. */
function pageCensus(capture: CapturedAnnouncements): { heading?: number } | null {
  const marks = Array.isArray(capture.diagnostics) ? capture.diagnostics : [];
  for (const mark of marks) {
    if (typeof mark !== "object" || mark === null) continue;
    const record = mark as { event?: unknown; heading?: unknown; error?: unknown };
    if (record.event !== "structureCensus" || record.error) continue;
    return { heading: typeof record.heading === "number" ? record.heading : undefined };
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
  return !heardAHeading || sweptAHeading;
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
