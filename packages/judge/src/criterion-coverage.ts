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

export interface CriterionCoverage {
  /**
   * `assessed`    — the shipped judge can return a finding for it.
   * `partial`     — assessed, but a named failure mode of it is not covered. Read `note`.
   * `reachable`   — not assessed, and could be, from the sources in `needs`.
   * `out-of-scope`— no amount of work inside this tool's evidence model decides it.
   */
  status: "assessed" | "partial" | "reachable" | "out-of-scope";
  needs?: EvidenceSource[];
  note: string;
}

export const CRITERION_COVERAGE: Record<string, CriterionCoverage> = {
  // ---- assessed today -------------------------------------------------------------------------
  "1.1.1": { status: "assessed", note: "Rules own missing and filename alt text exactly; the head owns generic alt ('image', 'photo')." },
  "1.3.1": { status: "assessed", note: "Fake headings and tables whose headers are not associated. Heading HIERARCHY (h2 -> h4) is not checked — see 'reachable' note on 2.4.10-style structure below; `moveToNextHeadingLevel` would supply it." },
  "1.4.2": { status: "assessed", needs: ["dom"], note: "Rule-only, and the exception that proves the boundary: `autoplay` and `muted` are attributes with no accessibility-tree equivalent, so a deterministic rule reads the DOM and no head is trained on it." },
  "2.1.2": { status: "assessed", note: "Keyboard trap, from `focusOrder`: focus repeating and never reaching the rest of the page." },
  "2.4.4": { status: "assessed", note: "Vague link text. Rules cover a six-phrase subset (19 of 100 corpus records, a declared overlap); the head owns the rest." },
  "2.4.6": { status: "assessed", note: "Vague headings, learned. Deliberately contextual — whether 'Welcome' is vague depends on the page, so this head is document-pooled." },
  "3.3.1": { status: "assessed", note: "A validation error that is displayed but never announced. Needs the form probe, which is on by default in the Action and off in the CLI." },
  "3.3.2": { status: "assessed", note: "Unlabelled fields and placeholder-only labels." },
  "4.1.3": { status: "assessed", note: "A status message after form activation that the screen reader never speaks." },

  "4.1.2": {
    status: "partial",
    needs: ["dom"],
    note: "Two of three failure modes are covered: a control announced with a role and no name (rules, exact on 147 records) and a state change that is never announced (head, calibrated). The third — a role-less `<div onclick>` styled as a button — is NOT, and cannot be from screen-reader evidence: the screen reader cannot perceive it, which IS the failure, so a page with a fake button and a page with no button are identical to NVDA. Declared `unavailable` in rule-ownership.json. Note `hasEvidenceFor('4.1.2')` also suppresses any finding on such a page, since it requires controls to exist.",
  },

  // ---- reachable from evidence we already have, or could capture -------------------------------
  "2.4.2": { status: "reachable", needs: ["screen-reader"], note: "NVDA announces '<title>, document' on entering every page, so the title is already in every capture on disk. The cheapest criterion available: a rule over evidence already captured, no protocol bump." },
  "2.4.1": { status: "reachable", needs: ["screen-reader"], note: "Bypass blocks. A skip link is the first focusable element and announces as one; `focusOrder` already records what focus reaches first." },
  "2.4.3": { status: "reachable", needs: ["screen-reader"], note: "Focus order. `focusOrder` is captured and already assessed for 2.1.2 but feeds no 2.4.3 rule. A clearly broken order is detectable; whether an order 'preserves meaning' in the general case is human judgement, so expect partial coverage." },
  "2.1.1": { status: "reachable", needs: ["screen-reader", "accessibility-tree"], note: "Keyboard operability. A control present in the AX tree that Tab never reaches is exactly this failure, and both halves are already captured — `structuralCensus` and `focusOrder`." },
  "3.3.3": { status: "reachable", needs: ["screen-reader"], note: "Error suggestion. The form probe already submits and re-reads; whether the announced error names a REMEDY rather than only a problem is a judgement a head could learn." },
  "3.2.1": { status: "reachable", needs: ["screen-reader"], note: "On Focus. Requires focusing each control and detecting a context change — a probe this tool has the machinery for but does not drive." },
  "3.2.2": { status: "reachable", needs: ["screen-reader"], note: "On Input. Same shape as 3.2.1, on change rather than focus." },
  "1.3.5": { status: "reachable", needs: ["dom"], note: "Identify Input Purpose is the `autocomplete` attribute against a fixed token list — deterministic, and squarely a rule. Needs the DOM, like 1.4.2." },
  "3.1.1": { status: "reachable", needs: ["dom"], note: "Language of Page: `<html lang>`. NVDA switching synthesiser language is an indirect and unreliable proxy; the attribute is the fact." },
  "3.1.2": { status: "reachable", needs: ["dom"], note: "Language of Parts: `lang` on elements whose text differs from the page language." },
  "2.5.3": { status: "reachable", needs: ["dom", "accessibility-tree"], note: "Label in Name — visible text must be contained in the accessible name. Highly automatable and axe-core covers it well; worth deciding whether to duplicate or defer." },
  "2.1.4": { status: "reachable", needs: ["dom"], note: "Character Key Shortcuts: single-character key handlers with no way to disable or remap them." },

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
