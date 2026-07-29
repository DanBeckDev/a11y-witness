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
  structure?: { headings: string[]; landmarks: string[]; formFields: string[] };
  interaction?: {
    controls: string[];
    stateChanges: { control: string; after: string }[];
    postSubmitFields?: string[];
  };
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
 * True when the capture plausibly read the page with this title -- including when the title
 * gives us nothing to check, since absence of a usable title is not evidence of failure.
 */
export function captureMentionsTitle(capture: CapturedAnnouncements, title: string): boolean {
  const words = (title.toLowerCase().match(new RegExp(`[a-z0-9]{${SIGNIFICANT_WORD_LENGTH},}`, "g")) ?? [])
    .filter(isSignificant);
  // A title made entirely of common words gives us nothing to check, which is not the same as
  // a match. Returning true here keeps the check lenient by design -- it only ever catches the
  // egregious wrong-content case -- but the words that do the catching must be distinctive.
  if (words.length === 0) return true;
  const s = capture.structure;
  const it = capture.interaction;
  const haystack = [
    ...capture.transcript,
    ...(s?.headings ?? []), ...(s?.landmarks ?? []), ...(s?.formFields ?? []),
    ...(it?.controls ?? []),
    ...(it?.stateChanges ?? []).map((x) => `${x.control} ${x.after}`),
    ...(it?.postSubmitFields ?? []),
  ].join(" ").toLowerCase();
  return words.some((w) => haystack.includes(w));
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
  // Nothing but the title (however many times it was said) is not evidence of a page.
  return capture.transcript.some((phrase) => normalise(phrase) !== wanted && normalise(phrase) !== "");
}

/** The <title> of a served page, or "" if it has none. */
export function titleOf(html: string): string {
  return html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1].trim() ?? "";
}
