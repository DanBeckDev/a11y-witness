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
 * **A SECOND boundary this file did not record until 2026-08-22, and it cuts across every entry below.**
 *
 * Where a subtype is decided by a deterministic RULE (`packages/lab/rule-ownership.json`), the answer is
 * exact and the trained head is suppressed for it. Where the head decides alone, the answer inherits the
 * head's blind spots — and those are measured: `npm run scorer:shortcuts` counts **225 features a head
 * penalises for free**, because they are 0 on every one of its training positives and therefore cost
 * nothing to learn. A page carrying such a feature can go silent on a criterion it genuinely fails.
 *
 * So `status: "assessed"` means "we have evidence and a decider", never "this answer is exact". Which it
 * is depends on the owner, and `rule-ownership.json` is where that is declared. The nine subtypes the head
 * decides alone are 1.1.1:generic-alt, 1.3.1:fake-heading, 1.3.1:unassociated-table, 2.4.4:regex,
 * 2.4.6:regex, 3.3.1:validation-error-silent, 3.3.2:placeholder-only, 3.3.2:unnamed-form-field,
 * 4.1.2:state-change-silent and 4.1.3:form-activation-silent. See
 * `docs/adr/0015-one-defect-per-page-taught-the-scorer-to-veto.md`.
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
  /**
   * The DOM media census — `<audio>`/`<video>` with their `autoplay`, `muted` and `controls` attributes.
   *
   * The one channel that is not screen-reader output, and it has to be: those attributes have no
   * accessibility-tree equivalent, so 1.4.2 is decided from the DOM or not at all. It was declared as
   * `transcript` until 2026-08-24 while `addAutoplayingAudio` read `capture.media` — one fact written in
   * two places, and the declaration was the copy that was wrong.
   */
  | "media"
  /**
   * What NVDA said the page was called and what its first heading was, before and after activating a
   * navigation control. The only channel that measures a TRANSITION rather than a state, which is why it
   * reaches a failure no static analyser can: the markup is valid at every instant.
   */
  | "routeChange"
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
  /**
   * Why this criterion cannot fire on a REAL-PAGE capture, when that is structurally true.
   *
   * Machine-readable on purpose. `audit-rule-coverage.ts` blocks a criterion this project CLAIMS to assess
   * that has never once fired on a real page, and two criteria are legitimately in that state forever: the
   * form probe is deliberately off for real pages, because submitting a form on a site we do not own is not
   * a review. Left as prose in `note`, that fact could not be told from an oversight — and the audit would
   * either block on something correct or, worse, be softened until it blocked on nothing.
   *
   * Absent means the criterion IS expected to fire on real pages. Only declare it with a reason.
   */
  realPageEvidence?: { available: false; because: string };
  note: string;
}

export const CRITERION_COVERAGE: Record<string, CriterionCoverage> = {
  // ---- assessed today -------------------------------------------------------------------------
  "1.1.1": { status: "assessed", channels: ["graphics", "transcript"], note: "Rules own missing and filename alt text exactly; the head owns generic alt ('image', 'photo')." },
  "1.3.1": { status: "assessed", channels: ["headings", "tableCells", "transcript"], note: "Fake headings and tables whose headers are not associated. Heading HIERARCHY (h2 -> h4) is not checked — see 'reachable' note on 2.4.10-style structure below; `moveToNextHeadingLevel` would supply it." },
  "1.4.2": {
    status: "assessed", needs: ["dom"], channels: ["media"],
    // MEASURED, not assumed: 89 real captures, 8 carry `<audio>`/`<video>` at all, and **0 autoplay**.
    // The probe runs and the channel is populated — this rule is exercised and correctly silent, which
    // on a page that does not autoplay is the right answer.
    //
    // It is not going to fire on this corpus, and the reason is the corpus rather than the rule: these
    // are UK public-body information pages, and autoplaying sound is the thing the regulations they
    // publish under exist to stop. A blocker that can only be closed by finding a public body breaking
    // that rule is a blocker nobody can close, so it is declared here instead — with the measurement,
    // so a future reader can check whether it is still true rather than take it on trust.
    realPageEvidence: {
      available: false,
      because: "89 real captures carry 8 media elements between them and NONE autoplay — measured "
        + "2026-08-25. The rule is exercised and silent because the failure does not occur on public-body "
        + "information pages, not because it cannot run",
    },
    note: "Rule-only, and the exception that proves the boundary: `autoplay` and `muted` are attributes with no accessibility-tree equivalent, so a deterministic rule reads the DOM and no head is trained on it." },
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
  "3.3.1": { status: "assessed", realPageEvidence: { available: false, because: "the form probe is OFF for real-page captures — pressing submit on a site we do not own is not a review — so `formChanges` is absent from all 77 real captures" }, channels: ["formChanges", "postSubmitFields"], note: "A validation error that is displayed but never announced. Needs the form probe, which is on by default in the Action and off in the CLI -- and therefore OFF for every real-page capture, because submitting a form on a site we do not own is not a review. Measured: 0 of 77 real captures carry `formChanges`, so on a real page this criterion cannot fire in either direction." },
  "3.3.2": {
    status: "partial",
    needs: ["dom"],
    channels: ["formFields", "transcript"],
    note: "ONE of two failure modes. A field with no label at all is covered and exact: the screen reader "
      + "announces a bare role, the rules decide it 115/115, and that is a fact rather than a judgement. "
      + "A field labelled ONLY by its placeholder is NOT covered, and cannot be from screen-reader "
      + "evidence — when a field has no label the browser uses the placeholder as its accessible name, so "
      + "NVDA speaks it exactly as it speaks a real label. `<input placeholder=\"Email address\">` and "
      + "`<label>Email address</label><input>` both announce \"Email address, edit\". Identical words, "
      + "identical order; the difference exists only in the DOM. THAT IS AXE'S JOB, and this tool sits "
      + "alongside axe-core rather than instead of it — a DOM scanner sees the missing `<label>` in one "
      + "pass. Attempting it here was a category error, not a gap to close. Measured 2026-08-23: the "
      + "trained head produced EIGHT false accusations on conformant pages because it had no placeholder "
      + "feature at all (encoder weight mass 598.9 against 9.26 across every document feature) and had "
      + "learned the corpus's placeholder WORDING — it fired on 4 of the 6 clean pages containing "
      + "\"Example value\" and 0 of the 34 without it. Declared `unavailable` in rule-ownership.json. "
      + "See ADR 0018.",
  },
  "4.1.3": { status: "assessed", realPageEvidence: { available: false, because: "same probe dependency as 3.3.1: `postSubmitFields` is absent from all 77 real captures, because the form probe is deliberately off for pages we do not own" }, channels: ["postSubmitFields", "formChanges"], note: "A status message after form activation that the screen reader never speaks. Same probe dependency as 3.3.1 and the same consequence, which was recorded there and not here: it reads `postSubmitFields`, and 0 of 77 real captures carry any, so it cannot fire on a real page." },

  "4.1.2": {
    status: "partial",
    needs: ["dom"],
    channels: ["controls", "formFields", "stateChanges", "structureCensus"], note: "Two of three failure modes are covered: a control announced with a role and no name (rules, exact on 147 records) and a state change that is never announced (head, calibrated). The third — a role-less `<div onclick>` styled as a button — is NOT, and cannot be from screen-reader evidence: the screen reader cannot perceive it, which IS the failure, so a page with a fake button and a page with no button are identical to NVDA. Declared `unavailable` in rule-ownership.json. Note `hasEvidenceFor('4.1.2')` also suppresses any finding on such a page, since it requires controls to exist. THE TWO COVERED MODES ARE NOT EQUALLY RELIABLE, measured 2026-08-22: the unnamed-control mode is rule-decided and therefore exact, while `state-change-silent` is head-decided and carries 18 free vetoes — a page presenting one of those features can go silent on a state change it genuinely fails to announce. The head's own score on an unnamed control is worse still (the identical announcement scores 0.9240 on a page without a table and 0.4525 on one with), but that mode never reaches a report because the rule owns it. See ADR 0015.",
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
  "2.4.2": { status: "partial", needs: ["screen-reader"], channels: ["title", "routeChange"], note: "PARTIAL, and the part is chosen rather than incidental. The missing-title mode is not worth a rule — ZERO missing or placeholder titles across 4,895 captures, and WebAIM's million-page survey does not list it among the failures covering 96% of errors — and the does-not-describe mode is human judgement, the same wall 2.4.6 stops at (W3C flags 2.4.2 on a page titled 'Welcome to CityLights! [Inaccessible Survey Page]'). What IS assessed, since 2026-08-22, is the single-page-app transition: `probeNavigation` activates a navigation control and asks NVDA for the page title before and after, and `addStaleRouteTitle` reports a route that moved while the title stood still. A static analyser cannot reach this at all — the markup is valid at every instant and the failure is the TRANSITION. Two known limits: the probe activates the FIRST link, which on a real site may be a skip link (then the heading does not change either and the rule correctly makes no claim), and the corroborating signal is deliberately NOT 'nothing was announced' — measured, the failing page announced 'visited'." },
  "2.4.1": { status: "partial", needs: ["screen-reader"], channels: ["focusOrder", "links", "routeChange"], note: "PARTIAL since 2026-08-22, and the scope was settled against W3C rather than assumed. A skip link is NOT required: headings alone satisfy this (H69), landmarks alone satisfy it (ARIA11), and the criterion does not intend to require methods redundant to the user agent — so detecting ABSENCE would fire on conformant pages, and every corpus page has an h1. Whether a mechanism exists is a DOM fact the static layer answers better than our landmark sweep, which is documented as nondeterministic; same call as 3.1.1, where the attribute is the fact. What is assessed is a mechanism that is present and INERT: `probeNavigation` activates the first link and records where one Tab lands immediately afterwards, and `addInertSkipLink` fires when that is exactly where the ordinary tab order would have gone anyway. Measured on a pair differing only in the target id: 'Search the archive, edit' against 'News and updates, link'. A checker sees a link and a plausible href and passes the page." },
  "2.4.3": { status: "partial", needs: ["screen-reader"], channels: ["focusOrder", "formFields"], note: "PARTIAL since 2026-08-22. The blocker recorded here was real and is now gone: `focusOrder` existed on real captures and on NO corpus capture, so no rule could be validated — `probeFocus` is forwarded end to end now and `focus-order-tabindex` supplies the pair. `addBrokenFocusOrder` compares what the page READS (formFields, document order) against what Tab VISITS (focusOrder), on accessible name, restricted to controls in both and taking each control's FIRST visit — the tab order is a cycle, and comparing it raw made the conformant variant differ from itself. Whether an order 'preserves meaning' in general stays human judgement, the wall 2.4.6 also stops at, so this covers the contradiction case only. Worth noting what the measured failure looks like: positive `tabindex` did not pull the fields to the FRONT of the traversal, it displaced them past every link to the end — a user tabbing the form reaches Notes, then six unrelated links, then Postcode." },
  "2.1.1": { status: "partial", needs: ["screen-reader"], channels: ["focusOrder", "formFields"], note: "PARTIAL since 2026-08-22. Assesses one mode: a control the page ANNOUNCES as operable that Tab never reaches — a `div role=button` with a click handler and no `tabindex`, which a screen-reader user meets as 'I can hear it and I cannot press it'. Deliberately NOT the roleless `<div onclick>` of the custom-control family: that is invisible to the screen reader (its 4.1.2 finding) and a capture cannot tell it from a page with no button. POSITIONAL, because the focus probe truncates at 12 stops on every corpus page — absence from `focusOrder` alone would fire almost everywhere, so a control counts as unreachable only when something LATER in reading order was reached. Keyboard operation of a control that is NOT announced, and operation by keys other than Tab, remain outside this." },
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
  if (nonEmpty((capture as { media?: unknown[] }).media)) present.add("media");
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
