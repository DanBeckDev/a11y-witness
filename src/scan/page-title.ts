/**
 * The page's own title, fetched from the control plane.
 *
 * This exists so capture verification does not depend on the axe layer. The CLI checks
 * that the screen reader actually read the target page by looking for the page's title in
 * what was announced; that title used to come from axe's Playwright page, so turning axe
 * off silently disabled the check.
 *
 * It MUST come from a source independent of the capture. Asking the worker what title it
 * saw and then using that to verify the worker read the right page proves nothing — the
 * check only has value because the two observations are independent.
 *
 * A fetched title is weaker than a rendered one: a page that sets its title in JavaScript
 * will report whatever the server sent. That is acceptable here, because the check is
 * deliberately lenient (one significant word) and only ever triggers a re-capture.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { titleOf } from "@a11y-witness/evidence/verify";

const TITLE_TIMEOUT_MS = 10_000;

async function sourceOf(url: string): Promise<string> {
  if (url.startsWith("file:")) return readFile(fileURLToPath(url), "utf8");
  const response = await fetch(url, { signal: AbortSignal.timeout(TITLE_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

/** The page's `<title>`, or "" if it cannot be determined. */
export async function fetchPageTitle(url: string): Promise<string> {
  try {
    return titleOf(await sourceOf(url));
  } catch (e) {
    // Not fatal: without a title the CLI simply skips the wrong-page check, which is the
    // same position it is in for a page that has no title at all.
    process.stderr.write(`could not read the page title for verification (${(e as Error).message})\n`);
    return "";
  }
}
