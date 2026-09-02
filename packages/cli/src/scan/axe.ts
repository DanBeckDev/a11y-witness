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

/**
 * A/AA across WCAG 2.0/2.1/2.2 (axe tags conformance level + version).
 *
 * EXPORTED so a test can hold it against what axe-core actually offers. Verified 2026-08-29: axe's level
 * tags are exactly `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa` and `wcag2aaa` — this list is
 * every A/AA one, with AAA correctly out of scope, and there is no `wcag22a` (WCAG 2.2's two Level A
 * additions, 3.2.6 and 3.3.7, have no axe rule at all).
 *
 * The reason it is pinned rather than left correct: a tag added by a future axe version would silently
 * narrow the scan, and a scan that quietly checks less still reports "0 violations".
 */
export const WCAG_AA_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

// Imported rather than redeclared: the judge owns the outcomes model, and a second spelling of this type
// would be the fact-stated-twice defect with a compiler that cannot see it, since structurally identical
// types unify silently.
import type { RuleLayerCoverage, RuleLayerVerdict } from "@a11y-witness/judge/outcomes";
export type { RuleLayerCoverage, RuleLayerVerdict };

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

/**
 * Fold axe's four result buckets into one verdict per criterion.
 *
 * A criterion usually has SEVERAL axe rules, so the buckets must be reduced with a precedence and it is
 * the strict one: a violation anywhere beats review-needed, which beats clean. Two rules for a criterion
 * where one passes and one needs review leaves the criterion needing review — claiming otherwise would let
 * a passing fragment vouch for a fragment nobody checked.
 *
 * `inapplicable` counts as CLEAN rather than as ACT's `inapplicable`, and that is deliberate. axe means
 * "this RULE found no elements to test"; the criterion may still have aspects no axe rule covers, so the
 * page having no images tells you nothing about the rest of 1.1.1. Reporting the criterion inapplicable
 * from a rule's inapplicability would be a claim about the criterion drawn from a claim about one rule.
 */
export function coverageFrom(buckets: {
  violations?: readonly AxeViolation[];
  incomplete?: readonly AxeViolation[];
  passes?: readonly AxeViolation[];
  inapplicable?: readonly AxeViolation[];
}): RuleLayerCoverage {
  const out: Record<string, RuleLayerVerdict> = {};
  const record = (rules: readonly AxeViolation[] | undefined, verdict: RuleLayerVerdict) => {
    for (const rule of rules ?? []) {
      for (const criterion of criteriaFromTags(Array.isArray(rule.tags) ? rule.tags.map(str) : [])) {
        if (!RANK[out[criterion]] || RANK[verdict] > RANK[out[criterion]]) out[criterion] = verdict;
      }
    }
  };
  // Weakest first, so the precedence above only ever upgrades.
  record(buckets.inapplicable, "clean");
  record(buckets.passes, "clean");
  record(buckets.incomplete, "needsReview");
  record(buckets.violations, "violated");
  return out;
}

const RANK: Record<string, number> = { clean: 1, needsReview: 2, violated: 3 };

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
  /**
   * Which criteria this scan actually EXAMINED, and what it concluded — the thing that was thrown away.
   *
   * `analyze()` returns four buckets and this module kept one. Keeping only `violations` makes "no
   * violation for 3.1.1" mean both "axe checked and the page has a valid lang" and "axe never ran that
   * rule", which is the ambiguity this whole project refuses everywhere else. The report then said "No
   * assessor in this tool covers this criterion" about criteria axe had just checked.
   */
  coverage: RuleLayerCoverage;
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
    return { findings: toFindings(results.violations), title, coverage: coverageFrom(results) };
  } finally {
    await browser.close();
  }
}
