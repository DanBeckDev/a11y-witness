/**
 * Rule-based layer (ADR 0002): run axe-core over a page and return its
 * WCAG-tagged violations. This is the deterministic, mechanical/visual layer
 * (contrast, colour, ARIA, parsing, names/roles) that a screen-reader
 * read-through cannot perceive. It complements the lived-experience judge; it
 * does not replace it.
 *
 * Scoped to WCAG A/AA to match @a11y-witness/evidence/wcag and the legal baseline.
 *
 * OPTIONAL. Playwright and @axe-core/playwright are optionalDependencies: the layer is
 * ~100 lines and about a second of wall-clock, but it pulls half a gigabyte of Chromium,
 * which is a poor trade for anyone who already runs axe in their own pipeline. So the
 * imports are dynamic and their absence is a supported state, not a crash. The
 * lived-experience layer — the part only this project does — never depends on them.
 */

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

export interface AxeResult {
  findings: AxeFinding[];
  /** The page's document.title — used to verify the screen-reader worker
   * actually captured THIS page and not browser chrome (see cli.ts). */
  title: string;
}

/** One violation as axe-core reports it, in the shape both our own run and an imported
 * results file share. Loosely typed on purpose: an imported file comes from someone
 * else's axe version and may carry more or fewer fields than ours. */
export interface AxeViolation {
  id?: unknown;
  tags?: unknown;
  impact?: unknown;
  help?: unknown;
  helpUrl?: unknown;
  nodes?: unknown;
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** Map axe's violations to our findings. Shared so an imported results file and our own
 * run produce identical output — a finding must not look different depending on who ran
 * the scan. */
export function toFindings(violations: readonly AxeViolation[]): AxeFinding[] {
  return violations.map((v) => ({
    source: "axe-core" as const,
    wcag: criteriaFromTags(Array.isArray(v.tags) ? v.tags.map(str) : []),
    rule: str(v.id),
    impact: str(v.impact),
    help: str(v.help),
    helpUrl: str(v.helpUrl),
    nodes: (Array.isArray(v.nodes) ? v.nodes : []).map((n: { html?: unknown; target?: unknown }) => ({
      html: str(n?.html),
      target: (Array.isArray(n?.target) ? n.target : []).map(String),
    })),
  }));
}

/** Thrown when the optional browser dependencies are not installed. */
export class AxeUnavailableError extends Error {
  constructor(cause: unknown) {
    super(
      "the axe layer needs its optional dependencies: npm install playwright @axe-core/playwright && npx playwright install chromium",
      { cause }
    );
    this.name = "AxeUnavailableError";
  }
}

// The NAMED export, not the default. The package exports the same class both ways
// (`export { AxeBuilder, AxeBuilder as default }`), but under dynamic import the default
// resolves to the module namespace, which is not constructable.
async function loadAxe() {
  try {
    const [playwright, axe] = await Promise.all([import("playwright"), import("@axe-core/playwright")]);
    return { chromium: playwright.chromium, AxeBuilder: axe.AxeBuilder };
  } catch (e) {
    throw new AxeUnavailableError(e);
  }
}

/** True when the rule-based layer can run here. Cheap: resolves the modules, launches nothing. */
export async function axeAvailable(): Promise<boolean> {
  try {
    await loadAxe();
    return true;
  } catch (e) {
    if (e instanceof AxeUnavailableError) return false;
    throw e;
  }
}

export async function scanWithAxe(url: string): Promise<AxeResult> {
  const { chromium, AxeBuilder } = await loadAxe();
  const browser = await chromium.launch();
  try {
    // @axe-core/playwright requires a page from an explicit context.
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "load" });
    const title = await page.title();
    const results = await new AxeBuilder({ page }).withTags(WCAG_AA_TAGS).analyze();
    return { findings: toFindings(results.violations), title };
  } finally {
    await browser.close();
  }
}
