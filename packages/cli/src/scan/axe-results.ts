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

function violationsFrom(parsed: unknown): AxeViolation[] | null {
  if (Array.isArray(parsed)) {
    if (parsed.every((e) => e && typeof e === "object" && "violations" in e)) {
      return parsed.flatMap((e) => (e as { violations: AxeViolation[] }).violations ?? []);
    }
    return parsed as AxeViolation[];
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
