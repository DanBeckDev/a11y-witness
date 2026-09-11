#!/usr/bin/env node
// @ts-check
// command: check-transfer-urls -- walk the tree for every URL naming PRODUCT_REPO (a11ign/a11ign) and
//   fetch each one, printing the count and every non-200 by file:line. Run on transfer day (2026-09-15,
//   #63) and paste the output on #524.
//
// #524: every public doc URL naming a11ign/a11ign is a 404 today, and nothing tracked that interval.
// `repo-identity-consolidated.test.ts` and the `action-reference` check correctly pin PRODUCT_REPO into
// badges/security/provisioning URLs and REPO into `uses:` lines as two DELIBERATELY different values
// (#66) -- that split is right and stays right until the transfer (#63) actually happens. This is not a
// test of that split; it is the thing nothing else does: PROVE the interval has closed, on the day it is
// supposed to, by actually fetching what the docs tell a reader to fetch.
//
// THE POPULATION IS DISCOVERED, NOT LISTED -- the same shape `documented-checkout-step.test.ts` was
// corrected into after missing a real file on its first pass (#491). A hand-written file list is the
// "nobody updates it" shape; this walks the whole tree and finds every `github.com/a11ign/a11ign` and
// `raw.githubusercontent.com/a11ign/a11ign` URL wherever it appears -- `package.json` `repository`/
// `homepage` fields, workflow/prose sites the earlier consolidated test already tracks, and ansible/
// provisioning files that test never reads.
//
// REFUSES RATHER THAN PASSES ON ABSENCE, in two distinct ways this repo has paid for before:
//   - zero URLs found at all is a broken discovery pattern, not an empty tree -- refused, exit 2.
//   - a URL that could not be REACHED (DNS failure, timeout, no network) is a different fact from a URL
//     that resolved and answered non-200. Collapsing them is the exact "a checker that silently skips on
//     a fetch error" shape CLAUDE.md names as its own most expensive recurring defect one layer over --
//     reported separately below, and any unreachable URL refuses the whole run (exit 3) rather than
//     reporting a false "all clean" alongside the ones that did answer.
//
// Not wired into any CI job. `docs/pipeline.md` documents the real `acceptance` job as depth-1 with no
// network path assumed reliable for an external fetch sweep across 30+ live URLs on every push -- this is
// a DECISION VERIFICATION for one date, not a continuous gate, and `ceo`'s ruling on #524 names it as the
// transfer-day check to run and paste, not a thing to automate into a job that fires forever after.
//
// THIS SCRIPT CHECKS URLS, NOT MENTIONS -- 29 URLs across 22 files, not the 34 files the #524 audit
// counted. The gap is twelve files that name `a11ign/a11ign` as a bare STRING with no fetchable URL
// attached: `PLAN.md`'s historical prose, `docs/roles/README.md`, `repo-identity.mjs`'s own declaration,
// three consistency tests (`action-reference`, `repo-identity-consolidated`, `documented-checkout-step`)
// that reference `PRODUCT_REPO` via the IMPORTED CONSTANT rather than a literal, and six more docs
// mentioning the org in passing. Nothing there for a fetch to check -- that population is `repo-identity-
// consolidated.test.ts`'s own job, proving those sites still agree with the constant, which needs no
// network at all. "29 URLs checked" and "34 files name the org" are both correct and are answers to
// different questions; naming both here is what stops the smaller number reading as an undercount.
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";

import { refuseUnknownFlags } from "../packages/worker-fleet/src/cli-flags.mjs";
import { PRODUCT_REPO } from "./repo-identity.mjs";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

/**
 * @typedef {{ file: string, line: number, url: string }} TransferUrlSite
 * @typedef {TransferUrlSite & ({ reachable: true, status: number, ok: boolean }
 *   | { reachable: false, status: null, ok: false, error: string })} TransferUrlResult
 */

/** Directories the walk never descends into -- build output, dependencies, and generated/historical text. */
const EXCLUDED_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "runs", "coverage", ".changeset", ".venv",
]);

/**
 * Every regular file under `root`, skipping the excluded directories. Extension-agnostic on purpose --
 * #524's own population spans `.md`, `.json`, `.yml`, `.ps1` and `.sh`, and a hand-picked extension list
 * is exactly the shape that missed `packages/cli/README.md` on `documented-checkout-step.test.ts`'s
 * first pass.
 * @param {string} root
 * @returns {string[]}
 */
function walkFiles(root) {
  /** @type {string[]} */
  const found = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry.name)) found.push(...walkFiles(full));
      continue;
    }
    found.push(full);
  }
  return found;
}

/**
 * Matches a `github.com/<PRODUCT_REPO>` or `raw.githubusercontent.com/<PRODUCT_REPO>` URL, stopping at
 * markdown/JSON/YAML delimiters (`)`, `]`, quotes, angle brackets, whitespace) rather than at the next
 * whitespace alone -- a README badge line packs TWO such URLs back-to-back with no space between them
 * (`[![...](URL1)](URL2)`), and a bare `\S+` would swallow the markdown syntax between them into one
 * unfetchable string.
 */
function urlPattern() {
  const escaped = PRODUCT_REPO.replace(/[/.]/g, "\\$&");
  return new RegExp(
    `https?://(?:raw\\.githubusercontent\\.com|github\\.com)/${escaped}[^\\s)\\]}"'<>]*`, "g",
  );
}

/**
 * Every occurrence of a PRODUCT_REPO URL in the tree, sorted for stable output.
 * @param {string} [repoRoot]
 * @returns {TransferUrlSite[]}
 */
export function findTransferUrls(repoRoot = REPO_ROOT) {
  const pattern = urlPattern();
  /** @type {TransferUrlSite[]} */
  const found = [];
  for (const file of walkFiles(repoRoot)) {
    let text;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue; // a binary file, a broken symlink -- not a place a documented URL lives
    }
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i += 1) {
      for (const match of lines[i].matchAll(pattern)) {
        found.push({ file: relative(repoRoot, file), line: i + 1, url: match[0] });
      }
    }
  }
  return found.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

/**
 * Fetches every site and classifies each as `ok` (2xx), `broken` (a real non-2xx response), or
 * `unreachable` (the fetch itself threw -- DNS, timeout, no network). `fetchImpl` is injected so the
 * classification logic is testable without a real network call; it only needs to resolve to something
 * carrying `status`/`ok`, never a full `Response`, since that is all this function reads.
 * @param {TransferUrlSite[]} sites
 * @param {{ fetchImpl?: (url: string, init: { method: string, redirect: "follow" })
 *   => Promise<{ status: number, ok: boolean }>, method?: string }} [options]
 * @returns {Promise<TransferUrlResult[]>}
 */
export async function checkTransferUrls(sites, { fetchImpl = fetch, method = "HEAD" } = {}) {
  /** @type {TransferUrlResult[]} */
  const results = [];
  for (const site of sites) {
    try {
      const res = await fetchImpl(site.url, { method, redirect: "follow" });
      results.push({ ...site, reachable: true, status: res.status, ok: res.ok });
    } catch (error) {
      results.push({
        ...site, reachable: false, status: null, ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}

/**
 * Renders the report CLAUDE.md's own rule asks for: a number that carries what it was computed from.
 * @param {TransferUrlResult[]} results
 * @returns {string}
 */
export function reportTransferUrls(results) {
  /** @type {string[]} */
  const lines = [];
  lines.push(`${results.length} ${PRODUCT_REPO} URL(s) found in the tree and checked.`);
  const unreachable = results.filter((r) => !r.reachable);
  const broken = results.filter((r) => r.reachable && !r.ok);
  const ok = results.filter((r) => r.reachable && r.ok);
  lines.push(`  ${ok.length} resolved cleanly (2xx)`);
  if (broken.length > 0) {
    lines.push(`  ${broken.length} resolved and answered NON-200:`);
    for (const r of broken) lines.push(`    ${r.status}  ${r.file}:${r.line}  ${r.url}`);
  }
  if (unreachable.length > 0) {
    lines.push(`  ${unreachable.length} COULD NOT BE REACHED (not the same as broken -- refusing below):`);
    for (const r of unreachable) lines.push(`    UNREACHABLE  ${r.file}:${r.line}  ${r.url}  (${r.error})`);
  }
  return lines.join("\n");
}

async function main() {
  refuseUnknownFlags([], { entry: import.meta.url, command: "check-transfer-urls" });
  const sites = findTransferUrls();
  if (sites.length === 0) {
    process.stderr.write(
      "REFUSING: found 0 URLs naming a11ign/a11ign in the tree -- the discovery pattern almost certainly "
      + "broke (this project's own docs have carried dozens since #66), not that the tree genuinely has "
      + "none. This would otherwise report a clean transfer having examined nothing.\n",
    );
    process.exitCode = 2;
    return;
  }
  const results = await checkTransferUrls(sites);
  process.stdout.write(reportTransferUrls(results) + "\n");
  const unreachable = results.filter((r) => !r.reachable);
  if (unreachable.length > 0) {
    process.stderr.write(
      `\nREFUSING to conclude: ${unreachable.length} URL(s) could not be reached at all. "unreachable" `
      + "and \"resolves cleanly\" are different outcomes, and reporting this run as clean would silently "
      + "collapse them.\n",
    );
    process.exitCode = 3;
    return;
  }
  const broken = results.filter((r) => r.reachable && !r.ok);
  if (broken.length > 0) {
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) {
  main();
}
