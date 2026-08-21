/**
 * WHY each WCAG 2.2 AA criterion is or is not assessed — all 55, in one place.
 *
 * `coverage.ts` answers WHICH criteria ship. This answers WHY the other 45 do not, and what each would
 * take. That distinction is the whole point: `criterionOutcomes` returns 45 criteria as `untested`, one
 * undifferentiated bucket in which "impossible from assistive-technology evidence" (1.4.3 Contrast) and
 * "trivial, the data is already on disk" (2.4.2 Page Titled) look identical. For anyone deciding what to
 * build next, that is the only distinction that matters.
 *
 * It also records PARTIAL coverage, which nothing else could express. 4.1.2 is assessed, and one of its
 * three failure modes -- a role-less `<div onclick>` -- is not assessable at all from screen-reader
 * evidence. Reported at criterion granularity that page reads as fine; it is not.
 *
 * Pinned by `criterion-coverage.test.ts` against `WCAG_22_AA` and `assessedCriteria()`, so it cannot
 * drift from what ships in either direction: a criterion that starts being assessed and is still recorded
 * as unreachable fails the test, and so does the reverse.
 *
 * **`needs` is a claim about EVIDENCE, not about difficulty.** It says which source could decide the
 * criterion, and the honest ordering is that `screen-reader` items are reachable with a probe,
 * `accessibility-tree` items with the CDP socket the capture already opens, `dom` items only by crossing
 * the boundary that keeps the model honest (a deterministic rule may, a trained head may not -- see
 * `modelInput()`'s allowlist), and `visual` / `human` / `multi-page` items not by this tool at all.
 */

/** Where the evidence to decide a criterion would have to come from. */
export type EvidenceSource =
  /** NVDA's own output: announcements, quick-nav sweeps, probe responses. What this tool is FOR. */
  | "screen-reader"
  /** The accessibility tree, already fetched over CDP for `structuralCensus`. */
  | "accessibility-tree"
  /** Page source, attributes or computed style. A deterministic rule may use it; the model may not. */
  | "dom"
  /** Rendering — pixels, geometry, colour, motion. Out of scope: this tool never sees a rendered page. */
  | "visual"
  /** More than one page, or a journey through one. The capture is single-page by construction. */
  | "multi-page"
  /** Irreducibly a judgement about meaning or consequence that no automated check settles. */
  | "human";

/**
 * WHICH FIELD of a capture carries the evidence — the channel, not the source.
 *
 * Orthogonal to `EvidenceSource` and added because that axis cannot answer the question that actually comes
 * up: "can THIS capture assess THIS criterion?" `needs: ["screen-reader"]` says a probe could reach it;
 * `channels: ["focusOrder"]` says which field to look in, and therefore whether the field is populated.
 *
 * The cost of not having this was an afternoon. Establishing that 2.4.1, 2.4.3 and 2.1.1 could not be
 * validated meant walking 4,899 corpus captures over SSH to discover `focusOrder` is absent from every one
 * of them, because `probeFocus` is opt-in and the dataset runner never sets it. With the channel named, that
 * is `criteriaAssessableFrom(capture)`.
 *
 * It also makes "unchecked is not clean" enforceable at criterion granularity. `captureWasTruncated` already
 * reports incomplete CHANNELS and `producerFeedsModel` already maps producer to channel for the MODEL; this
 * extends the same idea to criteria, so a report can say "2.4.1 not assessed, focusOrder absent" instead of
 * silently returning no finding. Those are different statements and this project's whole discipline is that
 * they must never look alike.
 *
 * Only `assessed`, `partial` and `reachable` criteria carry channels. A `visual` or `human` criterion has
 * none — not "unknown", but genuinely none, because no field of a capture could carry it.
 */
export type EvidenceChannel =
  /** The read-through, in page order. */
  | "transcript"
  /** Quick-nav sweeps, in `structure`. */
  | "headings" | "landmarks" | "formFields" | "graphics" | "links" | "lists" | "tableCells"
  /** Interaction probes, in `interaction`. */
  | "controls" | "stateChanges" | "formChanges" | "postSubmitFields" | "focusOrder"
  /** The document title NVDA speaks on entry. Lives in the `documentReady` diagnostic, not in `structure`. */
  | "title"
  /** The accessibility-tree census, for cross-checks the sweeps cannot make alone. */
  | "structureCensus";

export interface CriterionCoverage {
  /**
   * `assessed`    — the shipped judge can return a finding for it.
   * `partial`     — assessed, but a named failure mode of it is not covered. Read `note`.
   * `reachable`   — not assessed, and could be, from the sources in `needs`.
   * `out-of-scope`— no amount of work inside this tool's evidence model decides it.
   */
  status: "assessed" | "partial" | "reachable" | "out-of-scope";
  needs?: EvidenceSource[];
  /**
   * Which capture fields decide it. Required for anything assessed, partial or reachable; absent for
   * out-of-scope, where no channel could carry the evidence. Pinned both ways by the tests.
   */
  channels?: EvidenceChannel[];
  note: string;
}

export const CRITERION_COVERAGE: Record<string, CriterionCoverage> = {
  // ---- assessed today -------------------------------------------------------------------------
  "1.1.1": { status: "assessed", channels: ["graphics", "transcript"], note: "Rules own missing and filename alt text exactly; the head owns generic alt ('image', 'photo')." },
  "1.3.1": { status: "assessed", channels: ["headings", "tableCells", "transcript"], note: "Fake headings and tables whose headers are not associated. Heading HIERARCHY (h2 -> h4) is not checked — see 'reachable' note on 2.4.10-style structure below; `moveToNextHeadingLevel` would supply it." },
  "1.4.2": { status: "assessed", needs: ["dom"], channels: ["transcript"], note: "Rule-only, and the exception that proves the boundary: `autoplay` and `muted` are attributes with no accessibility-tree equivalent, so a deterministic rule reads the DOM and no head is trained on it." },
  // ASSESSED BUT NEVER VALIDATED, and `criteriaAssessableFrom` is what surfaced it on the day it was added.
  // `rules.ts` emits "2.1.2 No Keyboard Trap", but: no corpus case targets it, it is absent from
  // `rule-ownership.json` — so `rules:gate`'s "every declared boundary holds" never covered it — and it reads
  // `focusOrder`, which is present on 0 of 4,899 corpus captures because `probeFocus` is opt-in and the
  // dataset runner never sets it. So it can only fire on real-page captures, which carry no per-criterion
  // ground truth. A shipped Level A rule that has never once fired against known evidence, looking verified
  // because the gate beside it is green.
  "2.1.2": { status: "assessed", channels: ["focusOrder"], note: "Keyboard trap, from `focusOrder`: focus repeating and never reaching the rest of the page. UNVALIDATED: no corpus case targets it, it is not declared in `rule-ownership.json` so `rules:gate` does not cover it, and `focusOrder` is absent from all 4,899 corpus captures. Needs a case family captured WITH the focus probe — the same fix 2.4.1, 2.4.3 and 2.1.1 need, which makes it the cheapest of the four since the rule already exists." },
  "2.4.4": { status: "assessed", channels: ["links", "transcript"], note: "Vague link text. Rules cover a six-phrase subset (19 of 100 corpus records, a declared overlap); the head owns the rest." },
  "2.4.6": { status: "assessed", channels: ["headings", "transcript"], note: "Vague headings, learned. Deliberately contextual — whether 'Welcome' is vague depends on the page, so this head is document-pooled." },
  "3.3.1": { status: "assessed", channels: ["formChanges", "postSubmitFields"], note: "A validation error that is displayed but never announced. Needs the form probe, which is on by default in the Action and off in the CLI -- and therefore OFF for every real-page capture, because submitting a form on a site we do not own is not a review. Measured: 0 of 77 real captures carry `formChanges`, so on a real page this criterion cannot fire in either direction." },
  "3.3.2": { status: "assessed", channels: ["formFields", "transcript"], note: "Unlabelled fields and placeholder-only labels." },
  "4.1.3": { status: "assessed", channels: ["postSubmitFields", "formChanges"], note: "A status message after form activation that the screen reader never speaks. Same probe dependency as 3.3.1 and the same consequence, which was recorded there and not here: it reads `postSubmitFields`, and 0 of 77 real captures carry any, so it cannot fire on a real page." },

  "4.1.2": {
    status: "partial",
    needs: ["dom"],
    channels: ["controls", "formFields", "stateChanges", "structureCensus"], note: "Two of three failure modes are covered: a control announced with a role and no name (rules, exact on 147 records) and a state change that is never announced (head, calibrated). The third — a role-less `<div onclick>` styled as a button — is NOT, and cannot be from screen-reader evidence: the screen reader cannot perceive it, which IS the failure, so a page with a fake button and a page with no button are identical to NVDA. Declared `unavailable` in rule-ownership.json. Note `hasEvidenceFor('4.1.2')` also suppresses any finding on such a page, since it requires controls to exist.",
  },

  // ---- reachable from evidence we already have, or could capture -------------------------------
  // MEASURED 2026-08-21. First conclusion was "cheap to build, worthless to ship" on the strength of
  // "zero failures in 4,895 captures" — and that number proves nothing, because NEITHER population can
  // produce the fault:
  //
  //   - the 4,822 corpus captures come from `page()` in case-matrix.mjs, which hardcodes `<title>`, so a
  //     titleless generated page is impossible BY CONSTRUCTION;
  //   - the 77 real captures are UK public-sector pages, the most templated and most audited on the web.
  //
  // That is this repo's own "a canary that cannot express the fault is worthless" rule, applied to the
  // criterion when it belonged to the measurement. The evidence was never the problem: the title is
  // captured reliably, with an `ok` flag, on 98.3% of everything on disk.
  //
  // The claim survives on THIRD-PARTY data instead. WebAIM's 2026 Million report tests 1,000,000 home pages
  // and names six categories covering 96% of all errors — contrast 83.9%, alt text 53.1%, form labels 51%,
  // empty links 46.3%, empty buttons 30.6%, document LANGUAGE 13.5%. Missing document TITLE is not among
  // them, and since they do measure document-level attributes, title absence sits well below 13.5%.
  //
  // The evidence is genuinely there — 4,818 of 4,899 corpus captures and 77 of 77 real ones carry a
  // `documentReady` diagnostic with NVDA's SPOKEN title, and the 81 without have `ok: false`, so "we could
  // not measure" is distinguishable from "the page has no title". That distinction is the one this criterion
  // would live or die on.
  //
  // What killed it is the failure rate. The detectable subset is ABSENCE — no title, or a placeholder like
  // "Untitled" or "index.html" — and across 4,895 measurable captures there are **zero** of either. Every
  // CMS template on earth emits a title.
  //
  // And the documented failures are the other kind. W3C's own report for the BAD survey page lists 2.4.2 as
  // "page title doesn't describe content", yet the page's actual title is
  // "Welcome to CityLights! [Inaccessible Survey Page]" — descriptive by any reading. Whether a title
  // describes its topic is human judgement, the same wall 2.4.6 stops at.
  //
  // So a rule here would fire only on pages authored to trip it, and would add a row to this table without
  // adding any detection. That is the "canary that cannot express the fault" shape, sold as coverage.
  "2.4.2": { status: "reachable", needs: ["screen-reader"], channels: ["title"], note: "The title IS captured (`documentReady.title`, with an `ok` flag separating a failed measurement from a missing title) and a rule is trivial. But measured across 4,895 captures there are ZERO missing or placeholder titles, and the documented real-world failures are the 'does not describe' kind, which is judgement — W3C flags 2.4.2 on a page whose title reads 'Welcome to CityLights! [Inaccessible Survey Page]'. Buildable, and the detectable subset (absence) is rare on third-party evidence too — WebAIM's million-page survey does not list missing title among the failures covering 96% of errors, while it does list missing document LANGUAGE at 13.5%. The subset worth catching is different and we cannot reach it: a single-page app that changes route without changing `document.title`, so the user hears the previous page's name. That needs a NAVIGATION probe — a capture reads the title once, at entry — and it is the failure mode a screen-reader tool would be uniquely placed to prove." },
  "2.4.1": { status: "reachable", needs: ["screen-reader"], channels: ["focusOrder", "links"], note: "MEASURED 2026-08-21: `focusOrder` is present on 74 of 77 REAL captures and **0 of 4,899 corpus captures**, because `probeFocus` is opt-in and the dataset runner never sets it. So `rules:gate`, which validates against 1,003 conformant corpus records, cannot see this criterion at all — and the real pages that do carry the evidence have no per-criterion ground truth. Needs synthetic cases captured WITH the focus probe before it is assessable. Bypass blocks. A skip link is the first focusable element and announces as one; `focusOrder` already records what focus reaches first." },
  "2.4.3": { status: "reachable", needs: ["screen-reader"], channels: ["focusOrder"], note: "MEASURED 2026-08-21: same blocker as 2.4.1 — `focusOrder` exists on real captures and on none of the 4,899 corpus captures, so there is nothing to validate a rule against. Focus order. `focusOrder` is captured and already assessed for 2.1.2 but feeds no 2.4.3 rule. A clearly broken order is detectable; whether an order 'preserves meaning' in the general case is human judgement, so expect partial coverage." },
  "2.1.1": { status: "reachable", needs: ["screen-reader", "accessibility-tree"], channels: ["focusOrder", "structureCensus"], note: "MEASURED 2026-08-21: both halves exist only on REAL captures. `focusOrder` is on 0 of 4,899 corpus captures and `structureCensus` on 2,165 of them, so the set difference this criterion depends on cannot be computed over the corpus. Keyboard operability. A control present in the AX tree that Tab never reaches is exactly this failure, and both halves are already captured — `structuralCensus` and `focusOrder`." },
  "3.3.3": { status: "reachable", needs: ["screen-reader"], channels: ["postSubmitFields", "formChanges"], note: "Error suggestion. The form probe already submits and re-reads; whether the announced error names a REMEDY rather than only a problem is a judgement a head could learn." },
  "3.2.1": { status: "reachable", needs: ["screen-reader"], channels: ["focusOrder", "stateChanges"], note: "On Focus. Requires focusing each control and detecting a context change — a probe this tool has the machinery for but does not drive." },
  "3.2.2": { status: "reachable", needs: ["screen-reader"], channels: ["formChanges", "stateChanges"], note: "On Input. Same shape as 3.2.1, on change rather than focus." },
  "1.3.5": { status: "reachable", needs: ["dom"], channels: ["formFields"], note: "Identify Input Purpose is the `autocomplete` attribute against a fixed token list — deterministic, and squarely a rule. Needs the DOM, like 1.4.2." },
  "3.1.1": { status: "reachable", needs: ["dom"], channels: ["transcript"], note: "Language of Page: `<html lang>`. NVDA switching synthesiser language is an indirect and unreliable proxy; the attribute is the fact." },
  "3.1.2": { status: "reachable", needs: ["dom"], channels: ["transcript"], note: "Language of Parts: `lang` on elements whose text differs from the page language." },
  "2.5.3": { status: "reachable", needs: ["dom", "accessibility-tree"], channels: ["controls", "structureCensus"], note: "Label in Name — visible text must be contained in the accessible name. Highly automatable and axe-core covers it well; worth deciding whether to duplicate or defer." },
  "2.1.4": { status: "reachable", needs: ["dom"], channels: ["focusOrder", "transcript"], note: "Character Key Shortcuts: single-character key handlers with no way to disable or remap them." },

  // ---- out of scope: the evidence does not exist in this tool ----------------------------------
  "1.4.3": { status: "out-of-scope", needs: ["visual"], note: "Contrast is a property of rendered pixels. No assistive-technology signal exists; this is a rule/visual scanner's job." },
  "1.4.11": { status: "out-of-scope", needs: ["visual"], note: "Non-text contrast is a property of rendered pixels, exactly as 1.4.3, and applies to control boundaries and graphics." },
  "1.4.1": { status: "out-of-scope", needs: ["visual"], note: "Use of Colour requires knowing what colour conveys, which needs the rendering and usually a human." },
  "1.4.4": { status: "out-of-scope", needs: ["visual"], note: "Resize Text needs the page re-rendered at 200%." },
  "1.4.5": { status: "out-of-scope", needs: ["visual"], note: "Images of Text needs pixel inspection or OCR." },
  "1.4.10": { status: "out-of-scope", needs: ["visual"], note: "Reflow needs a 320px viewport and geometry." },
  "1.4.12": { status: "out-of-scope", needs: ["visual"], note: "Text Spacing needs re-rendering with overridden CSS." },
  "1.4.13": { status: "out-of-scope", needs: ["visual"], note: "Content on Hover or Focus needs pointer hover and geometry; the screen-reader path never hovers." },
  "1.3.4": { status: "out-of-scope", needs: ["visual"], note: "Orientation needs the page rendered in two orientations." },
  "1.3.2": { status: "out-of-scope", needs: ["visual"], note: "Meaningful Sequence compares reading order to VISUAL order. The screen-reader order alone cannot say whether it matches what a sighted user sees." },
  "1.3.3": { status: "out-of-scope", needs: ["visual", "human"], note: "Sensory Characteristics — instructions relying on shape, position or sound. Needs the rendering and a judgement." },
  "2.3.1": { status: "out-of-scope", needs: ["visual"], note: "Three Flashes needs frame-by-frame analysis of motion." },
  "2.4.7": { status: "out-of-scope", needs: ["visual"], note: "Focus Visible is about a rendered focus indicator." },
  "2.4.11": { status: "out-of-scope", needs: ["visual"], note: "Focus Not Obscured is geometry: is the focused element covered by other content." },
  "2.5.8": { status: "out-of-scope", needs: ["visual"], note: "Target Size is geometry: the rendered width and height of a control, and its spacing from its neighbours. Nothing in the accessibility tree carries it." },
  "2.5.1": { status: "out-of-scope", needs: ["dom", "human"], note: "Pointer Gestures — path-based gestures needing a single-pointer alternative. Not observable from a keyboard-driven screen-reader session." },
  "2.5.2": { status: "out-of-scope", needs: ["dom"], note: "Pointer Cancellation is about down-event behaviour; this tool never uses a pointer to operate anything." },
  "2.5.4": { status: "out-of-scope", needs: ["dom"], note: "Motion Actuation needs device-motion handlers and an alternative." },
  "2.5.7": { status: "out-of-scope", needs: ["dom"], note: "Dragging Movements need a pointer-driven session and a single-pointer alternative, exactly as 2.5.1." },
  "1.2.1": { status: "out-of-scope", needs: ["human"], note: "Whether an alternative CONVEYS the media is a judgement about content, not a property observable from a page." },
  "1.2.2": { status: "out-of-scope", needs: ["human"], note: "Captions: presence is detectable from the DOM, but accuracy and completeness are not." },
  "1.2.3": { status: "out-of-scope", needs: ["human"], note: "Audio Description or Media Alternative: presence may be detectable, adequacy is not, exactly as 1.2.1." },
  "1.2.4": { status: "out-of-scope", needs: ["human"], note: "Live captions cannot be assessed from a static capture at all." },
  "1.2.5": { status: "out-of-scope", needs: ["human"], note: "Audio Description: whether the description conveys what the video shows is a judgement about content, exactly as 1.2.3." },
  "2.2.1": { status: "out-of-scope", needs: ["dom", "human"], note: "Timing Adjustable needs a time limit to exist and be observed over time; a 12-second capture cannot see one." },
  "2.2.2": { status: "out-of-scope", needs: ["visual", "dom"], note: "Pause, Stop, Hide needs moving content and a control for it, observed over time." },
  "2.4.5": { status: "out-of-scope", needs: ["multi-page"], note: "Multiple Ways is a property of a SITE — more than one route to a page. The capture is single-page by construction." },
  "3.2.3": { status: "out-of-scope", needs: ["multi-page"], note: "Consistent Navigation compares pages to each other." },
  "3.2.4": { status: "out-of-scope", needs: ["multi-page"], note: "Consistent Identification compares how the same function is labelled across pages, so it needs more than one." },
  "3.2.6": { status: "out-of-scope", needs: ["multi-page"], note: "Consistent Help compares the position of help mechanisms across pages, so it needs more than one." },
  "3.3.4": { status: "out-of-scope", needs: ["multi-page", "human"], note: "Error Prevention for legal/financial submissions needs a whole transaction flow and a judgement about consequence." },
  "3.3.7": { status: "out-of-scope", needs: ["multi-page"], note: "Redundant Entry spans steps of a process." },
  "3.3.8": { status: "out-of-scope", needs: ["multi-page", "human"], note: "Accessible Authentication needs a real authentication flow." },
};

/**
 * Exactly the capture fields the channel map reads. Narrow on purpose, like `ScorableCapture` in the scorer:
 * this package should not depend on a full `CaptureResult` to answer a question about coverage, and naming
 * the fields makes the coupling visible. TypeScript is structural, so a real capture satisfies it uncast.
 */
export interface ChannelBearingCapture {
  transcript?: string[];
  structure?: Record<string, unknown> | null;
  interaction?: Record<string, unknown> | null;
  diagnostics?: Array<Record<string, unknown>> | null;
}

const STRUCTURE_CHANNELS: EvidenceChannel[] =
  ["headings", "landmarks", "formFields", "graphics", "links", "lists", "tableCells"];
const INTERACTION_CHANNELS: EvidenceChannel[] =
  ["controls", "stateChanges", "formChanges", "postSubmitFields", "focusOrder"];

const nonEmpty = (value: unknown): boolean => Array.isArray(value) && value.length > 0;

/**
 * Which channels this capture actually CARRIES — populated, not merely declared.
 *
 * Emptiness counts as absence deliberately, and that is the whole point of the type. An empty
 * `formChanges` and a `formChanges` the probe never ran are the same shape on disk, and this project has
 * repeatedly paid for treating one as the other: "0 of 77 real captures carry `formChanges`" is why 3.3.1
 * cannot fire on a real page. A caller that needs to tell "probe did not run" from "probe found nothing"
 * must read `captureWasTruncated`, which reports exactly that and is a separate question from this one.
 *
 * `title` is read from the `documentReady` DIAGNOSTIC because that is where it lives — the capture result
 * has no title field, though `documentTitle` is computed and passed to the read-through. Promoting it would
 * be cleaner and is a capture change; reading it here is honest about where the evidence actually is.
 */
export function channelsPresent(capture: ChannelBearingCapture): Set<EvidenceChannel> {
  const present = new Set<EvidenceChannel>();
  if (nonEmpty(capture.transcript)) present.add("transcript");
  for (const channel of STRUCTURE_CHANNELS) {
    if (nonEmpty((capture.structure ?? {})[channel])) present.add(channel);
  }
  for (const channel of INTERACTION_CHANNELS) {
    if (nonEmpty((capture.interaction ?? {})[channel])) present.add(channel);
  }
  const ready = (capture.diagnostics ?? []).find((mark) => mark.event === "documentReady");
  if (typeof ready?.title === "string" && ready.title.trim()) present.add("title");
  if ((capture.diagnostics ?? []).some((mark) => mark.event === "structureCensus")) {
    present.add("structureCensus");
  }
  return present;
}

/** A criterion this capture cannot decide, and the channels it would have needed. */
export interface BlockedCriterion { criterion: string; missing: EvidenceChannel[] }

/**
 * Which criteria this capture can decide, and which it cannot AND WHY.
 *
 * The reason this exists, in one sentence: establishing that 2.4.1, 2.4.3 and 2.1.1 were unvalidatable took
 * an afternoon of walking 4,899 captures over SSH to find that `focusOrder` is absent from every one of them,
 * because `probeFocus` is opt-in and the dataset runner never sets it. This turns that into a call.
 *
 * A criterion needs ALL of its channels, not any: 3.3.1 reads `formChanges` and `postSubmitFields` and a rule
 * with only one of them would be deciding on half the evidence. Where that is too strict for a specific
 * criterion the fix is to correct that criterion's channel list, not to weaken this.
 *
 * `out-of-scope` criteria are absent from both lists rather than reported as blocked — nothing is missing,
 * they are simply not this tool's business, and listing them as blocked would imply a probe could fix it.
 */
export function criteriaAssessableFrom(capture: ChannelBearingCapture):
  { assessable: string[]; blocked: BlockedCriterion[] } {
  const present = channelsPresent(capture);
  const assessable: string[] = [];
  const blocked: BlockedCriterion[] = [];
  for (const [criterion, entry] of Object.entries(CRITERION_COVERAGE)) {
    if (entry.status === "out-of-scope" || !entry.channels?.length) continue;
    const missing = entry.channels.filter((channel) => !present.has(channel));
    if (missing.length) blocked.push({ criterion, missing });
    else assessable.push(criterion);
  }
  return { assessable, blocked };
}
