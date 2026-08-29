/**
 * Import axe-core results that someone else produced (`--axe-results <file>`).
 *
 * Most teams adopting this tool already run axe in their pipeline. Running our own second
 * copy would give them duplicate findings from a differently-versioned engine in the same
 * CI — worse than not having the layer at all. So the rule-based layer can be *fed* rather
 * than executed: they keep their axe run, we consume its output, and the two-layer report
 * still works with no Chromium download and no second scan.
 *
 * Deliberately tolerant about shape, because "axe results" means several different files
 * depending on which tool wrote them, and the differences are packaging rather than
 * substance. Accepted:
 *
 *   { violations: [...] }        axe.run() / @axe-core/playwright / axe-core reporters
 *   [ { violations: [...] } ]    axe CLI, which emits one entry per URL scanned
 *   [ ... ]                      a bare violations array
 *
 * Anything else is rejected loudly. Silently reading zero violations out of a file we did
 * not understand would print "0 violations" and read as a clean bill of health.
 */
import { readFile } from "node:fs/promises";
import { toFindings, type AxeFinding, type AxeViolation } from "./axe.js";

interface ImportedAxe {
  findings: AxeFinding[];
  /** The URL the imported results were produced against, when the file records one. */
  scannedUrl: string;
}

/**
 * Does this element look like an axe violation at all?
 *
 * A bare array was accepted UNCONDITIONALLY, so `--axe-results` pointed at the wrong JSON produced
 * fabricated findings rather than the loud rejection this module's header promises. Measured: a Lighthouse
 * report became 1 finding, an array of URL strings became 2, an array of numbers became 3 — each rendered
 * into the rule layer with empty `rule`, `impact` and `help`, beside real screen-reader findings.
 *
 * That is worse than the "0 violations from a file we did not understand" the header warns about, because
 * a fabricated count reads as a real one.
 *
 * `id` and `help` are the two fields every axe violation carries and no reporter renames. Requiring EITHER
 * keeps the deliberate tolerance about packaging — the whole point of this module — while refusing a file
 * that is not axe output at all.
 */
const looksLikeViolation = (value: unknown): boolean =>
  typeof value === "object" && value !== null
  && (typeof (value as { id?: unknown }).id === "string"
    || typeof (value as { help?: unknown }).help === "string");

function violationsFrom(parsed: unknown): AxeViolation[] | null {
  if (Array.isArray(parsed)) {
    // `every` on an EMPTY array is true, which is correct here: `[]` is a legitimate clean axe run and
    // must stay accepted as zero violations rather than falling through to the shape check below.
    if (parsed.every((e) => e && typeof e === "object" && "violations" in e)) {
      return parsed.flatMap((e) => (e as { violations: AxeViolation[] }).violations ?? []);
    }
    return parsed.every(looksLikeViolation) ? (parsed as AxeViolation[]) : null;
  }
  if (parsed && typeof parsed === "object" && Array.isArray((parsed as { violations?: unknown }).violations)) {
    return (parsed as { violations: AxeViolation[] }).violations;
  }
  return null;
}

function scannedUrlFrom(parsed: unknown): string {
  const first = Array.isArray(parsed) ? parsed[0] : parsed;
  const url = (first as { url?: unknown } | undefined)?.url;
  return typeof url === "string" ? url : "";
}

export async function loadAxeResults(path: string): Promise<ImportedAxe> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch (e) {
    throw new Error(`could not read axe results from ${path}: ${(e as Error).message}`, { cause: e });
  }
  const violations = violationsFrom(parsed);
  if (!violations) {
    throw new Error(
      `${path} does not look like axe results: expected { violations: [...] }, an array of those, ` +
        "or a bare violations array."
    );
  }
  return { findings: toFindings(violations), scannedUrl: scannedUrlFrom(parsed) };
}

/**
 * Warn when imported results were produced against a different URL. Not an error — a
 * staging host or a trailing slash is a legitimate difference — but a stale file from
 * another page is a quiet way to report the wrong findings with total confidence.
 */
export function warnOnUrlMismatch(scannedUrl: string, target: string): void {
  if (!scannedUrl || scannedUrl === target) return;
  process.stderr.write(
    `WARNING: the imported axe results were produced against ${scannedUrl}, not ${target}. ` +
      "The rule-based findings may describe a different page.\n"
  );
}
