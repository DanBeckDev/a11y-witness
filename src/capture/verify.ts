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
 * True when the capture plausibly read the page with this title -- including when the title
 * gives us nothing to check, since absence of a usable title is not evidence of failure.
 */
export function captureMentionsTitle(capture: CapturedAnnouncements, title: string): boolean {
  const words = title.toLowerCase().match(new RegExp(`[a-z0-9]{${SIGNIFICANT_WORD_LENGTH},}`, "g")) ?? [];
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

/** The <title> of a served page, or "" if it has none. */
export function titleOf(html: string): string {
  return html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1].trim() ?? "";
}
