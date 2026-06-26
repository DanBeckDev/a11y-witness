/**
 * Rule-based layer (ADR 0002): run axe-core over a page and return its
 * WCAG-tagged violations. This is the deterministic, mechanical/visual layer
 * (contrast, colour, ARIA, parsing, names/roles) that a screen-reader
 * read-through cannot perceive. It complements the lived-experience judge; it
 * does not replace it.
 *
 * Scoped to WCAG A/AA to match src/wcag/criteria.ts and the legal baseline.
 */
import { chromium } from "playwright";
import { AxeBuilder } from "@axe-core/playwright";

// A/AA across WCAG 2.0/2.1/2.2 (axe tags conformance level + version).
const WCAG_AA_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

export interface AxeFinding {
  source: "axe-core";
  /** WCAG success criteria this violation maps to, e.g. ["1.4.3"]. */
  wcag: string[];
  rule: string; // axe rule id, e.g. "color-contrast"
  impact: string; // minor | moderate | serious | critical
  help: string;
  helpUrl: string;
  /** The failing elements (HTML snippet + CSS selector path). */
  nodes: { html: string; target: string[] }[];
}

/** axe tags include "wcag143" for SC 1.4.3; extract criterion numbers. */
function criteriaFromTags(tags: string[]): string[] {
  const out: string[] = [];
  for (const t of tags) {
    const m = t.match(/^wcag(\d)(\d)(\d+)$/);
    if (m) out.push(`${m[1]}.${m[2]}.${m[3]}`);
  }
  return out;
}

export async function scanWithAxe(url: string): Promise<AxeFinding[]> {
  const browser = await chromium.launch();
  try {
    // @axe-core/playwright requires a page from an explicit context.
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "load" });
    const results = await new AxeBuilder({ page }).withTags(WCAG_AA_TAGS).analyze();
    return results.violations.map((v) => ({
      source: "axe-core" as const,
      wcag: criteriaFromTags(v.tags),
      rule: v.id,
      impact: v.impact ?? "",
      help: v.help,
      helpUrl: v.helpUrl,
      nodes: v.nodes.map((n) => ({ html: n.html, target: n.target.map(String) })),
    }));
  } finally {
    await browser.close();
  }
}
