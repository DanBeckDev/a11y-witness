/**
 * WCAG 2.2 success criteria, Levels A and AA.
 *
 * Sourced from the W3C WCAG 2.2 Recommendation (https://www.w3.org/TR/WCAG22/).
 * Corrected against the spec after an initial fetch error: 2.5.5 Target Size
 * (Enhanced) and 2.5.6 Concurrent Input Mechanisms are Level AAA and are
 * excluded; 3.2.6 Consistent Help (Level A, new in 2.2) was added. 4.1.1 Parsing
 * is intentionally absent (removed in WCAG 2.2). 55 criteria total.
 *
 * The judge cites only from this list, so its accuracy matters. Verify against
 * the spec if in doubt.
 */
export interface Criterion {
  num: string;
  name: string;
  level: "A" | "AA";
}

export const WCAG_22_AA: Criterion[] = [
  { num: "1.1.1", name: "Non-text Content", level: "A" },
  { num: "1.2.1", name: "Audio-only and Video-only (Prerecorded)", level: "A" },
  { num: "1.2.2", name: "Captions (Prerecorded)", level: "A" },
  { num: "1.2.3", name: "Audio Description or Media Alternative (Prerecorded)", level: "A" },
  { num: "1.2.4", name: "Captions (Live)", level: "AA" },
  { num: "1.2.5", name: "Audio Description (Prerecorded)", level: "AA" },
  { num: "1.3.1", name: "Info and Relationships", level: "A" },
  { num: "1.3.2", name: "Meaningful Sequence", level: "A" },
  { num: "1.3.3", name: "Sensory Characteristics", level: "A" },
  { num: "1.3.4", name: "Orientation", level: "AA" },
  { num: "1.3.5", name: "Identify Input Purpose", level: "AA" },
  { num: "1.4.1", name: "Use of Color", level: "A" },
  { num: "1.4.2", name: "Audio Control", level: "A" },
  { num: "1.4.3", name: "Contrast (Minimum)", level: "AA" },
  { num: "1.4.4", name: "Resize Text", level: "AA" },
  { num: "1.4.5", name: "Images of Text", level: "AA" },
  { num: "1.4.10", name: "Reflow", level: "AA" },
  { num: "1.4.11", name: "Non-text Contrast", level: "AA" },
  { num: "1.4.12", name: "Text Spacing", level: "AA" },
  { num: "1.4.13", name: "Content on Hover or Focus", level: "AA" },
  { num: "2.1.1", name: "Keyboard", level: "A" },
  { num: "2.1.2", name: "No Keyboard Trap", level: "A" },
  { num: "2.1.4", name: "Character Key Shortcuts", level: "A" },
  { num: "2.2.1", name: "Timing Adjustable", level: "A" },
  { num: "2.2.2", name: "Pause, Stop, Hide", level: "A" },
  { num: "2.3.1", name: "Three Flashes or Below Threshold", level: "A" },
  { num: "2.4.1", name: "Bypass Blocks", level: "A" },
  { num: "2.4.2", name: "Page Titled", level: "A" },
  { num: "2.4.3", name: "Focus Order", level: "A" },
  { num: "2.4.4", name: "Link Purpose (In Context)", level: "A" },
  { num: "2.4.5", name: "Multiple Ways", level: "AA" },
  { num: "2.4.6", name: "Headings and Labels", level: "AA" },
  { num: "2.4.7", name: "Focus Visible", level: "AA" },
  { num: "2.4.11", name: "Focus Not Obscured (Minimum)", level: "AA" },
  { num: "2.5.1", name: "Pointer Gestures", level: "A" },
  { num: "2.5.2", name: "Pointer Cancellation", level: "A" },
  { num: "2.5.3", name: "Label in Name", level: "A" },
  { num: "2.5.4", name: "Motion Actuation", level: "A" },
  { num: "2.5.7", name: "Dragging Movements", level: "AA" },
  { num: "2.5.8", name: "Target Size (Minimum)", level: "AA" },
  { num: "3.1.1", name: "Language of Page", level: "A" },
  { num: "3.1.2", name: "Language of Parts", level: "AA" },
  { num: "3.2.1", name: "On Focus", level: "A" },
  { num: "3.2.2", name: "On Input", level: "A" },
  { num: "3.2.3", name: "Consistent Navigation", level: "AA" },
  { num: "3.2.4", name: "Consistent Identification", level: "AA" },
  { num: "3.2.6", name: "Consistent Help", level: "A" },
  { num: "3.3.1", name: "Error Identification", level: "A" },
  { num: "3.3.2", name: "Labels or Instructions", level: "A" },
  { num: "3.3.3", name: "Error Suggestion", level: "AA" },
  { num: "3.3.4", name: "Error Prevention (Legal, Financial, Data)", level: "AA" },
  { num: "3.3.7", name: "Redundant Entry", level: "A" },
  { num: "3.3.8", name: "Accessible Authentication (Minimum)", level: "AA" },
  { num: "4.1.2", name: "Name, Role, Value", level: "A" },
  { num: "4.1.3", name: "Status Messages", level: "AA" },
];
