/**
 * Organise findings by the screen-reader experience waterfall.
 *
 * Ashley Firth (Practical Web Accessibility) frames screen-reader accessibility
 * as three layers in order — Perceive (is content conveyed?) -> Navigate (can the
 * user move through it?) -> Interact (can they operate it?) — a waterfall: you
 * must perceive before you can navigate, and navigate before you can interact. So
 * a Perceive failure is more fundamental than a Navigate one, which is more
 * fundamental than an Interact one. Reporting findings in that order surfaces the
 * deepest problems first and matches how accessibility practitioners reason.
 *
 * We map each finding to a layer by its WCAG principle (the criterion's first
 * number): 1 Perceivable -> perceive, 2 Operable -> navigate, 3 Understandable +
 * 4 Robust -> interact.
 */
export type ExperienceLayer = "perceive" | "navigate" | "interact";

const ORDER: ExperienceLayer[] = ["perceive", "navigate", "interact"];

export const LAYER_LABEL: Record<ExperienceLayer, string> = {
  perceive: "Perceive — is the content conveyed at all?",
  navigate: "Navigate — can the user move through the page?",
  interact: "Interact — can the user operate the controls?",
};

/** The experience layer for a WCAG criterion, keyed on its principle digit. */
export function layerOf(wcag: string): ExperienceLayer {
  const principle = wcag.match(/(\d+)\.\d+\.\d+/)?.[1];
  if (principle === "1") return "perceive";
  if (principle === "2") return "navigate";
  return "interact"; // principle 3 (Understandable) and 4 (Robust)
}

export function layerRank(layer: ExperienceLayer): number {
  return ORDER.indexOf(layer);
}

/** Findings ordered by the waterfall (perceive first); stable within a layer. */
export function orderByLayer<T extends { wcag: string }>(findings: T[]): T[] {
  return [...findings].sort((a, b) => layerRank(layerOf(a.wcag)) - layerRank(layerOf(b.wcag)));
}
