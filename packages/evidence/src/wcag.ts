/**
 * WCAG 2.2 success criteria, Levels A and AA, version-tagged.
 *
 * Sourced from the W3C WCAG 2.2 Recommendation (https://www.w3.org/TR/WCAG22/)
 * and validated by parsing the spec's own HTML: 55 active A/AA criteria (the
 * obsolete 4.1.1 Parsing is excluded; 2.5.5 / 2.5.6 are AAA and excluded).
 *
 * `since` records the WCAG version that introduced each criterion, derived by
 * parsing the 2.0, 2.1, and 2.2 specs (2.0 = 38 A/AA, 2.1 = 50, 2.2 adds 6 at
 * A/AA). This lets the tool report against WCAG 2.1 AA, the version most law and
 * regulation reference (for example EN 301 549), as well as 2.2 AA.
 *
 * Important for this project: every "2.2" criterion here (2.4.11, 2.5.7, 2.5.8,
 * 3.2.6, 3.3.7, 3.3.8) requires interaction, vision, or cross-page context, so
 * NONE are observable from a screen-reader read-through. The subset a read
 * through can detect is therefore identical under WCAG 2.1 and 2.2; the version
 * only changes how a finding is labelled. (4.1.1 Parsing, the one 2.1 criterion
 * that 2.2 removed, is likewise non-observable and is excluded.)
 *
 * The judge cites only from this list. To re-validate, re-parse the specs.
 */
export interface Criterion {
  num: string;
  name: string;
  level: "A" | "AA";
  /** WCAG version that introduced this criterion. */
  since: "2.0" | "2.1" | "2.2";
}

export const WCAG_22_AA: Criterion[] = [
  { num: "1.1.1", name: "Non-text Content", level: "A", since: "2.0" },
  { num: "1.2.1", name: "Audio-only and Video-only (Prerecorded)", level: "A", since: "2.0" },
  { num: "1.2.2", name: "Captions (Prerecorded)", level: "A", since: "2.0" },
  { num: "1.2.3", name: "Audio Description or Media Alternative (Prerecorded)", level: "A", since: "2.0" },
  { num: "1.2.4", name: "Captions (Live)", level: "AA", since: "2.0" },
  { num: "1.2.5", name: "Audio Description (Prerecorded)", level: "AA", since: "2.0" },
  { num: "1.3.1", name: "Info and Relationships", level: "A", since: "2.0" },
  { num: "1.3.2", name: "Meaningful Sequence", level: "A", since: "2.0" },
  { num: "1.3.3", name: "Sensory Characteristics", level: "A", since: "2.0" },
  { num: "1.3.4", name: "Orientation", level: "AA", since: "2.1" },
  { num: "1.3.5", name: "Identify Input Purpose", level: "AA", since: "2.1" },
  { num: "1.4.1", name: "Use of Color", level: "A", since: "2.0" },
  { num: "1.4.2", name: "Audio Control", level: "A", since: "2.0" },
  { num: "1.4.3", name: "Contrast (Minimum)", level: "AA", since: "2.0" },
  { num: "1.4.4", name: "Resize Text", level: "AA", since: "2.0" },
  { num: "1.4.5", name: "Images of Text", level: "AA", since: "2.0" },
  { num: "1.4.10", name: "Reflow", level: "AA", since: "2.1" },
  { num: "1.4.11", name: "Non-text Contrast", level: "AA", since: "2.1" },
  { num: "1.4.12", name: "Text Spacing", level: "AA", since: "2.1" },
  { num: "1.4.13", name: "Content on Hover or Focus", level: "AA", since: "2.1" },
  { num: "2.1.1", name: "Keyboard", level: "A", since: "2.0" },
  { num: "2.1.2", name: "No Keyboard Trap", level: "A", since: "2.0" },
  { num: "2.1.4", name: "Character Key Shortcuts", level: "A", since: "2.1" },
  { num: "2.2.1", name: "Timing Adjustable", level: "A", since: "2.0" },
  { num: "2.2.2", name: "Pause, Stop, Hide", level: "A", since: "2.0" },
  { num: "2.3.1", name: "Three Flashes or Below Threshold", level: "A", since: "2.0" },
  { num: "2.4.1", name: "Bypass Blocks", level: "A", since: "2.0" },
  { num: "2.4.2", name: "Page Titled", level: "A", since: "2.0" },
  { num: "2.4.3", name: "Focus Order", level: "A", since: "2.0" },
  { num: "2.4.4", name: "Link Purpose (In Context)", level: "A", since: "2.0" },
  { num: "2.4.5", name: "Multiple Ways", level: "AA", since: "2.0" },
  { num: "2.4.6", name: "Headings and Labels", level: "AA", since: "2.0" },
  { num: "2.4.7", name: "Focus Visible", level: "AA", since: "2.0" },
  { num: "2.4.11", name: "Focus Not Obscured (Minimum)", level: "AA", since: "2.2" },
  { num: "2.5.1", name: "Pointer Gestures", level: "A", since: "2.1" },
  { num: "2.5.2", name: "Pointer Cancellation", level: "A", since: "2.1" },
  { num: "2.5.3", name: "Label in Name", level: "A", since: "2.1" },
  { num: "2.5.4", name: "Motion Actuation", level: "A", since: "2.1" },
  { num: "2.5.7", name: "Dragging Movements", level: "AA", since: "2.2" },
  { num: "2.5.8", name: "Target Size (Minimum)", level: "AA", since: "2.2" },
  { num: "3.1.1", name: "Language of Page", level: "A", since: "2.0" },
  { num: "3.1.2", name: "Language of Parts", level: "AA", since: "2.0" },
  { num: "3.2.1", name: "On Focus", level: "A", since: "2.0" },
  { num: "3.2.2", name: "On Input", level: "A", since: "2.0" },
  { num: "3.2.3", name: "Consistent Navigation", level: "AA", since: "2.0" },
  { num: "3.2.4", name: "Consistent Identification", level: "AA", since: "2.0" },
  { num: "3.2.6", name: "Consistent Help", level: "A", since: "2.2" },
  { num: "3.3.1", name: "Error Identification", level: "A", since: "2.0" },
  { num: "3.3.2", name: "Labels or Instructions", level: "A", since: "2.0" },
  { num: "3.3.3", name: "Error Suggestion", level: "AA", since: "2.0" },
  { num: "3.3.4", name: "Error Prevention (Legal, Financial, Data)", level: "AA", since: "2.0" },
  { num: "3.3.7", name: "Redundant Entry", level: "A", since: "2.2" },
  { num: "3.3.8", name: "Accessible Authentication (Minimum)", level: "AA", since: "2.2" },
  { num: "4.1.2", name: "Name, Role, Value", level: "A", since: "2.0" },
  { num: "4.1.3", name: "Status Messages", level: "AA", since: "2.1" },
];
