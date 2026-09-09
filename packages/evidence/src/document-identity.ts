/**
 * WHICH DOCUMENT WAS THIS CAPTURE SERVED? — #687.
 *
 * `environmentKey()` keys a capture on everything about the ENVIRONMENT — browser and version, OS,
 * architecture, NVDA, guidepup, screen-reader settings, `provisionRevision`, `CAPTURE_PROTOCOL_VERSION`
 * — and, for corpus pages, on the page directory. It records nothing about what the server actually
 * SENT. So two captures of one URL, under an identical key, can describe different documents and
 * nothing in the pipeline can notice.
 *
 * Measured on `https://calendly.com/`, eight minutes apart, same worker, same command (#685):
 *
 *     10:42  served accounts.google.com/v3/signin/identifier  "Sign in - Google Accounts"
 *     10:50  served calendly.com/scheduling                   "Automated scheduling software Calendly …"
 *
 * Both records say `url: "https://calendly.com/"` and both say `landedOnRequested: ok`. The difference
 * is recorded — on the census marks, which carry the CDP target's own URL — and until this module
 * nothing read it. That is this repository's most recorded shape: a diagnostic written and never
 * consumed.
 *
 * ## What is compared, and what is only reported
 *
 * **Compared: the served path and the document title.** Those say WHICH document. A difference in
 * either is a difference in identity.
 *
 * **Reported, never compared: the structural counts** (`shape` below). #687 asked for the census counts
 * in the digest, and they are here — but they must not decide the verdict, because a count differs on
 * every real page that legitimately changed between two captures. A news homepage recaptured an hour
 * later has moved 40 links and is the same document; calendly's sign-in wall has moved 59 links and is
 * not. Deciding identity on counts would fire on the first case, which is most of the population this
 * runs against, and the refusal would be ignored within a day. The counts are here so a reader can see
 * the render they were given; the path and the title are what say it is a different page.
 *
 * ## The digest is a LABEL, not the comparison
 *
 * `digest` exists so a report line can name a render in eight characters. `compareIdentity` compares
 * the component VALUES, never the digests — a hash that collided would otherwise be able to say "same
 * document", and a guard whose whole job is to refuse must not have a path on which it blesses by
 * accident.
 *
 * ## Every component is optional, and an absence is never a difference
 *
 * Measured across the records on disk: a real-page capture carries `structureCensus`, `domCensus` and
 * `titleSource`; a corpus capture (`image-missing-alt-bulk-day-centre-062.good.json`) carries only
 * `structureCensus`, with no `targetUrl`, no `domCensus` and no `titleSource` at all. So a component
 * read in one capture and absent from the other is INCOMPARABLE, never a difference — the absence of a
 * measurement is not the measurement zero (#677) — and when no component can be compared the verdict is
 * `UNCOMPARABLE`, never `SAME_DOCUMENT`.
 *
 * That asymmetry is deliberate and it is what makes this safe to put in front of every existing
 * comparison: **this check can only ever add a refusal.** When identity cannot be established the
 * caller behaves exactly as it did before, and says so.
 *
 * ## What this is NOT
 *
 * `probeStates` (verify.ts) asks whether the page moved BETWEEN THE PROBES OF ONE CAPTURE. This asks
 * whether TWO CAPTURES describe the same document. They share `FINGERPRINT_KEYS` — imported, not
 * re-spelled, because `gate-probe-order.mjs` already recorded what happens when this exact concept gets
 * a second copy: "this copy compares four counts, and `FINGERPRINT_KEYS` has six".
 *
 * And it is not a cache key. See `capture-cache.mjs`'s `environmentKey`, and
 * `document-identity-is-not-a-cache-key.test.ts` for why adding it there would cost a full recapture of
 * 2,122+ captures to guard a population that is empty.
 */
import { FINGERPRINT_KEYS } from "./verify.js";

/** The components that decide identity. Reported components (`shape`) are deliberately not here. */
export const IDENTITY_COMPONENTS = ["servedPath", "title"] as const;

export type IdentityComponent = (typeof IDENTITY_COMPONENTS)[number];

export interface DocumentIdentity {
  /** The components that could be READ. A component absent here was not measured, never "empty". */
  components: Partial<Record<IdentityComponent, string>>;
  /** `IDENTITY_COMPONENTS` that `components` carries, in table order. */
  read: IdentityComponent[];
  /**
   * COMPONENTS THE CAPTURE CONTRADICTS ITSELF ABOUT, with every distinct value it recorded.
   *
   * A capture is not an instant. If its own marks name two documents, then "which document was this
   * capture served" has no single answer, and picking one would be a guess dressed as a reading. An
   * unstable component is never compared and never appears in `components`: it is a finding in its own
   * right, and a louder one than two captures differing, because it says one capture straddles two pages.
   */
  unstable: Partial<Record<IdentityComponent, string[]>>;
  /**
   * WHICH READ produced the title — `"document"` (read over CDP) or `"spoken"` (what NVDA said).
   * `titleSourceVerdict` chooses between them per capture, so two captures can carry titles of
   * different provenance, and comparing one against the other proves nothing about either.
   */
  titleSource: string | null;
  /**
   * The structural counts, for the report line. NOT compared — see this file's header.
   * `null` when no census mark carried any of them.
   */
  shape: Record<string, number> | null;
  /** Which mark `shape` came from, so a reader knows what they are looking at. */
  shapeFrom: "domCensus" | "structureCensus" | null;
  /**
   * Did the capture CONFIRM the CDP target it read? `"matched"` means yes; `"fallback"` means it took
   * the only candidate it could find. Reported rather than gating: on the calendly pair both are
   * `"fallback"`, and refusing to state an identity there would withhold exactly the finding.
   */
  targetMatch: string | null;
  /**
   * HOW MANY QUERY PARAMETERS THE SERVED PATH DROPPED — the caveat on this module's own reduction.
   *
   * `0` means the served URL carried no query, so nothing was set aside and a `SAME_DOCUMENT` verdict
   * rests on the whole URL. Above zero, two captures agreeing on `servedPath` agreed on origin and path
   * while differing, possibly, in a query this deliberately did not read. `null` when no served path was
   * read at all — not `0`, which would claim a reduction that never happened.
   *
   * The COUNT only. See `servedFrom` for why the values are never recorded.
   */
  droppedQueryParams: number | null;
  /** Eight hex characters naming this render in a report. A label; never the comparison. */
  digest: string;
}

export type IdentityVerdict = "SAME_DOCUMENT" | "DIFFERENT_DOCUMENT" | "UNCOMPARABLE";

export interface IdentityComparison {
  verdict: IdentityVerdict;
  /** Components present in BOTH captures — the only ones a verdict may rest on. */
  compared: IdentityComponent[];
  /** Of those, the ones that differ, with both values so a reader can see the two documents. */
  differing: { component: IdentityComponent; before: string; after: string }[];
  /**
   * Components one capture has and the other does not, or whose provenance differs. Named so a reader
   * can tell "we did not compare this" from "this agreed" — the distinction the whole module is about.
   */
  incomparable: IdentityComponent[];
  /**
   * Of those, the ones EITHER capture contradicted itself about. Separated from the rest of
   * `incomparable` because "nobody measured this" and "one capture named two documents" are different
   * facts and the second is the more serious one — see `DocumentIdentity.unstable`.
   */
  unstable: IdentityComponent[];
  /**
   * Did either side's served path drop a query string? A `SAME_DOCUMENT` verdict here rests on origin
   * and path with a query set aside, so the agreement is narrower than it looks and the caller must be
   * able to say so. `false` when neither URL carried a query, or when no path was compared.
   */
  queryDropped: boolean;
}

/** A capture record, walked by field. `any` for the same reason `evidence-diff.mjs` uses it. */
type CaptureRecord = { diagnostics?: unknown } & Record<string, unknown>;

/**
 * EVERY mark of that name, not the first.
 *
 * `.find()` was the first version of this and it was wrong in a way only the records could show: the
 * 10:42 calendly capture carries ELEVEN `titleSource` marks, ten saying "Sign in - Google Accounts" and
 * the last saying "Privacy Notice Calendly" — the served document changed DURING the capture. Taking the
 * first silently picks one of two documents and the choice is invisible in the result.
 *
 * A FAILED MARK IS NOT A READING. The census marks even when the count failed, precisely so "not counted"
 * stays distinguishable from "none" — the same skip `probeStates` makes, for the same reason.
 */
const marksNamed = (diagnostics: readonly unknown[], event: string): Record<string, unknown>[] =>
  diagnostics.filter(
    (d): d is Record<string, unknown> =>
      typeof d === "object" && d !== null && (d as { event?: unknown }).event === event
      && typeof (d as { error?: unknown }).error !== "string");

const markNamed = (diagnostics: readonly unknown[], event: string): Record<string, unknown> | null =>
  marksNamed(diagnostics, event)[0] ?? null;

/**
 * The served URL reduced to origin + path.
 *
 * QUERY AND FRAGMENT ARE DROPPED, and that is not tidiness. The Google sign-in URL in the calendly
 * capture carries `dsh=`, `state=` and `rart=` — per-request nonces — so two captures of the SAME
 * sign-in wall would differ in the query every time and read as different documents. Origin and path
 * are what survive a nonce and still separate `calendly.com/` from `calendly.com/scheduling` from
 * `accounts.google.com/v3/signin/identifier`, which are the distinctions this exists to make.
 *
 * The cost is real and worth stating: a site whose documents are distinguished ONLY by query string
 * (`?page=2`, an SPA on `?view=`) reads as one document here. That is a known blind spot, not an
 * oversight; it is the safe direction, since this check may only ever add a refusal.
 *
 * @returns `null` when the value is absent or is not a URL — never a partial string, which would be a
 *   guess dressed as a reading.
 */
export function servedPathOf(url: unknown): string | null {
  return servedFrom(url)?.path ?? null;
}

/**
 * The served path AND HOW MUCH WAS DROPPED TO GET IT — ceo's condition on this reduction, 2026-09-09.
 *
 * Dropping the query is what makes a nonce-bearing URL comparable at all, and it is also what makes a
 * `SAME_DOCUMENT` verdict weaker on exactly the captures where a query was present: two URLs that agree
 * on origin and path but differed in a query this deliberately did not read. So the COUNT of dropped
 * parameters is recorded beside the path and carried into the verdict, and a report can say where the
 * caveat applies rather than leaving the reader to discover the reduction.
 *
 * **The count, never the values.** The parameters are the nonces (`state`, `code_challenge`, `rart`),
 * and recording them would put single-use handshake material into a tracked comparison record for no
 * gain — the count is what says "a caveat applies here", which is the whole of what a reader needs.
 */
function servedFrom(url: unknown): { path: string, droppedParams: number } | null {
  if (typeof url !== "string" || url === "") return null;
  try {
    const parsed = new URL(url);
    const droppedParams = [...parsed.searchParams.keys()].length;
    // AN OPAQUE ORIGIN IS THE STRING "null", and concatenating it produces a value that is not a URL and
    // is not distinguishable from another one: `about:blank#` came out as `"nullblank"` under the first
    // version of this line, and `about:blank` is a real value a capture carries when a navigation failed.
    // Two different failures reading equal is a silent SAME_DOCUMENT, which is the one answer this module
    // must never give by accident. Found by this function's own test, not by review.
    const path = parsed.origin === "null"
      ? `${parsed.protocol}${parsed.pathname}`
      : `${parsed.origin}${parsed.pathname}`;
    return { path, droppedParams };
  } catch (cause) {
    // NOT swallowed and not thrown: a capture may legitimately record a target that is not a URL, and
    // that is "unreadable", which this function's contract already has a value for.
    void cause;
    return null;
  }
}

/** FNV-1a over the canonical string. Pure, dependency-free, and only ever a report label. */
function shortDigest(canonical: string): string {
  const OFFSET_BASIS = 0x811c9dc5;
  const PRIME = 0x01000193;
  let hash = OFFSET_BASIS;
  for (let i = 0; i < canonical.length; i += 1) {
    hash = Math.imul(hash ^ canonical.charCodeAt(i), PRIME);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * The structural counts, from whichever census mark carries them.
 *
 * `domCensus` first because it carries all six `FINGERPRINT_KEYS`; `structureCensus` is the fallback and
 * carries four of them (a corpus capture has no `domCensus` at all). WHICH mark answered is returned
 * alongside, because "graphic 26 from the AX tree" and "graphic 23 from the DOM" are different readings
 * of one page and a report that did not say which would be comparing unlike with unlike.
 */
function shapeOf(diagnostics: readonly unknown[]):
  { shape: Record<string, number> | null; shapeFrom: DocumentIdentity["shapeFrom"] } {
  for (const from of ["domCensus", "structureCensus"] as const) {
    const mark = markNamed(diagnostics, from);
    if (!mark) continue;
    const counts: Record<string, number> = {};
    for (const key of FINGERPRINT_KEYS) {
      if (typeof mark[key] === "number") counts[key] = mark[key] as number;
    }
    if (Object.keys(counts).length > 0) return { shape: counts, shapeFrom: from };
  }
  return { shape: null, shapeFrom: null };
}

/**
 * What document did this capture describe?
 *
 * Derived from the marks the capture already carries — nothing new is observed and nothing is stored a
 * second time. That is a deliberate departure from #687's literal "recorded … as a digest": a stored
 * digest would be a second spelling of counts and a title that are already on the record, and a fact
 * stated twice with nothing comparing the copies is the shape this repository pays most for. Deriving
 * also means every capture ALREADY ON DISK has an identity, including the two the row's acceptance
 * names — which a stored field could not give them.
 */
export function documentIdentity(capture: CaptureRecord | null | undefined): DocumentIdentity {
  const diagnostics = Array.isArray(capture?.diagnostics) ? capture.diagnostics : [];
  const { components, unstable, droppedQueryParams } = componentsIn(diagnostics);
  const read = IDENTITY_COMPONENTS.filter((name) => components[name] !== undefined);
  // THE COMPONENT NAMES ARE IN THE CANONICAL STRING, not only their values. An identity that read a
  // title and no path must never digest equal to one that read a path and no title.
  const canonical = read.map((name) => `${name}=${components[name]}`).join("\n");
  return {
    components, read, unstable, droppedQueryParams,
    titleSource: titleSourceIn(diagnostics),
    ...shapeOf(diagnostics),
    targetMatch: targetMatchIn(diagnostics),
    digest: shortDigest(canonical),
  };
}

/** Distinct values, in first-seen order. Order is stable so a digest over them is too. */
const distinct = (values: readonly string[]): string[] => [...new Set(values)];

/**
 * The identity components a capture's marks carry.
 *
 * A component absent from `components` was either NOT MEASURED (no mark carried it) or UNSTABLE (the
 * marks disagreed) — and `unstable` says which, because those need opposite responses: the first means
 * ask for a better capture, the second means the page moved under the capture you have.
 */
function componentsIn(diagnostics: readonly unknown[]):
  Pick<DocumentIdentity, "components" | "unstable" | "droppedQueryParams"> {
  // EVERY census mark, both kinds. `structureCensus` and `domCensus` are separate reads of the CDP
  // target and can in principle name different documents; asserting they agree without looking is the
  // assumption this function exists to stop making.
  const servedReads = [...marksNamed(diagnostics, "structureCensus"), ...marksNamed(diagnostics, "domCensus")]
    .map((mark) => servedFrom(mark.targetUrl))
    .filter((read): read is { path: string, droppedParams: number } => read !== null);
  const served = distinct(servedReads.map((read) => read.path));
  // THE MOST ANY READ DROPPED. Two marks can share a path and differ in their query — that is precisely
  // the nonce case — so the caveat applies if it applied to any of them.
  const droppedQueryParams = servedReads.length
    ? Math.max(...servedReads.map((read) => read.droppedParams))
    : null;
  const titles = distinct(marksNamed(diagnostics, "titleSource")
    .map((mark) => mark.title)
    .filter((value): value is string => typeof value === "string" && value !== ""));

  const components: Partial<Record<IdentityComponent, string>> = {};
  const unstable: Partial<Record<IdentityComponent, string[]>> = {};
  for (const [name, values] of [["servedPath", served], ["title", titles]] as const) {
    if (values.length === 1) components[name] = values[0];
    else if (values.length > 1) unstable[name] = values;
  }
  return { components, unstable, droppedQueryParams };
}

/**
 * WHICH READ produced the title — and `null` when the capture used more than one, since a title's
 * provenance is then not a single fact either and comparing on it would be comparing a mixture.
 */
function titleSourceIn(diagnostics: readonly unknown[]): string | null {
  const sources = distinct(marksNamed(diagnostics, "titleSource")
    .map((mark) => mark.source)
    .filter((value): value is string => typeof value === "string"));
  return sources.length === 1 ? sources[0] : null;
}

/**
 * Did the capture CONFIRM the CDP target it read?
 *
 * THE LEAST-CONFIRMED ANSWER WINS when the marks disagree. A capture with one `matched` census and one
 * `fallback` census has not confirmed its target; reporting the first mark's `matched` would let the
 * weaker read hide behind the stronger one, which is the direction that costs a reader something.
 */
function targetMatchIn(diagnostics: readonly unknown[]): string | null {
  const values = distinct([...marksNamed(diagnostics, "structureCensus"), ...marksNamed(diagnostics, "domCensus")]
    .map((mark) => mark.targetMatch)
    .filter((value): value is string => typeof value === "string"));
  if (values.length === 0) return null;
  return values.find((value) => value !== "matched") ?? values[0];
}

/**
 * Do two captures describe the same document?
 *
 * Only components BOTH captures carry are compared, and a title is comparable only when both were read
 * the same way — a `document` title against a `spoken` one is two different readings, not a difference
 * between two pages.
 *
 * `UNCOMPARABLE` when nothing could be compared, and it must never be read as agreement. That is the
 * vacuity failure this module would otherwise have: an identity over an empty component set digests to
 * the same eight characters for every capture in the corpus, so a comparison resting on digest equality
 * would have declared every unexamined pair the same page.
 */
export function compareIdentity(before: DocumentIdentity, after: DocumentIdentity): IdentityComparison {
  const titleProvenanceDiffers = before.titleSource !== after.titleSource;
  const compared: IdentityComponent[] = [];
  const incomparable: IdentityComponent[] = [];
  for (const name of IDENTITY_COMPONENTS) {
    const both = before.components[name] !== undefined && after.components[name] !== undefined;
    if (both && !(name === "title" && titleProvenanceDiffers)) compared.push(name);
    else incomparable.push(name);
  }
  const differing = compared
    .filter((name) => before.components[name] !== after.components[name])
    .map((name) => ({ component: name, before: before.components[name]!, after: after.components[name]! }));
  const verdict: IdentityVerdict = compared.length === 0 ? "UNCOMPARABLE"
    : differing.length ? "DIFFERENT_DOCUMENT" : "SAME_DOCUMENT";
  const unstable = IDENTITY_COMPONENTS.filter(
    (name) => before.unstable[name] !== undefined || after.unstable[name] !== undefined);
  const queryDropped = compared.includes("servedPath")
    && [before, after].some((side) => (side.droppedQueryParams ?? 0) > 0);
  return { verdict, compared, differing, incomparable, unstable, queryDropped };
}

/** The counts, rendered in `FINGERPRINT_KEYS` order — the order is the report order. */
function shapeSentence(identity: DocumentIdentity): string {
  if (!identity.shape) return "";
  const counts = FINGERPRINT_KEYS
    .filter((key) => identity.shape![key] !== undefined)
    .map((key) => `${key}=${identity.shape![key]}`);
  return counts.length ? ` Render (${identity.shapeFrom}): ${counts.join(", ")}.` : "";
}

/**
 * WHICH RENDER DOES THIS REPORT DESCRIBE? — #687's third half.
 *
 * A report stating how many criteria it assessed deserves to say WHICH RENDER it assessed them against
 * — a page with eleven tabbable elements is a different subject from the one with ninety-eight, and the
 * criteria count says nothing about which it saw. (The count itself is `assessedCriteria().length`; it is
 * not written here, because a number in a comment is a number that stops being true.) Says NOT RECORDED
 * rather than nothing when the marks are absent, because a report silently omitting the render reads as
 * a report about the page the reader asked for.
 */
export function identitySentence(identity: DocumentIdentity): string {
  const served = identity.components.servedPath
    ? `served ${identity.components.servedPath}`
    : "served document NOT RECORDED";
  const title = identity.components.title
    ? ` titled ${JSON.stringify(identity.components.title)}`
      + (identity.titleSource ? ` (${identity.titleSource})` : "")
    : "";
  const unconfirmed = identity.targetMatch === "matched" ? ""
    : identity.targetMatch === null ? ""
      : ` The document this was read from was NOT CONFIRMED (targetMatch: ${identity.targetMatch}).`;
  return `Document ${identity.digest}: ${served}${title}.${shapeSentence(identity)}${unconfirmed}`
    + droppedQuerySentence(identity) + unstableSentence(identity);
}

/**
 * WHERE THE CAVEAT ON THIS MODULE'S REDUCTION APPLIES — ceo's condition, 2026-09-09.
 *
 * The served path is origin + path, so a query string is set aside to make a nonce-bearing URL
 * comparable at all. On a capture whose URL carried one, "the same document" is a narrower claim than it
 * reads: two such captures agreed on origin and path while a query went unexamined. Said here, on the
 * captures where it applies, rather than left in a code comment for a reader to discover afterwards.
 */
function droppedQuerySentence(identity: DocumentIdentity): string {
  const dropped = identity.droppedQueryParams;
  if (dropped === null || dropped === 0) return "";
  return ` Its served URL carried ${dropped} query parameter(s), which the served path DROPS`
    + " (they carry per-request nonces), so an identity match here is a match on origin and path only.";
}

/**
 * ONE CAPTURE, TWO DOCUMENTS — and this must never be the silent half of a report.
 *
 * It is a louder finding than two captures differing: the evidence in a single record was gathered
 * across more than one page, so nothing in it can be attributed to either with confidence. Measured on
 * the 10:42 calendly capture, whose title marks read "Sign in - Google Accounts" ten times and then
 * "Privacy Notice Calendly".
 */
function unstableSentence(identity: DocumentIdentity): string {
  const entries = IDENTITY_COMPONENTS
    .filter((name) => identity.unstable[name] !== undefined)
    .map((name) => `${name} ${identity.unstable[name]!.map((v) => JSON.stringify(v)).join(" then ")}`);
  if (entries.length === 0) return "";
  return " THIS CAPTURE NAMED MORE THAN ONE DOCUMENT and so has no single identity — "
    + `${entries.join("; ")}. Its evidence was gathered across more than one page.`;
}
