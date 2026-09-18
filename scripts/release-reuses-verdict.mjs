#!/usr/bin/env node
// command: does the release job need to run coverage itself, or can it reuse nightly's verdict for this sha
//
// #1308: `release.yml`'s "Coverage — the whole-repo threshold" step runs `npm run coverage` (c8 over the
// whole suite, 301s measured) EVERY release, even when `nightly.yml`'s own `coverage` job already ran the
// identical command against the EXACT SAME sha earlier that day (measured: `npm run coverage` is invoked
// once each in `release.yml` and `nightly.yml`, never in `trunk.yml` -- trunk's own verdict is `npm test`,
// the suite passing, not a coverage number, so it cannot stand in for this check). A release cut right
// after a nightly run pays for the same 301 seconds twice.
//
// READS THE COVERAGE JOB'S OWN CONCLUSION, NEVER THE RUN'S -- `nightly.yml` also runs `gateSweep`,
// `closeRowsSweep` and `watch` in the same workflow file. A sibling job failing would roll the whole RUN's
// conclusion to `failure` while `coverage` itself passed, and reading the run-level conclusion would
// refuse a genuinely reusable verdict for a reason that has nothing to do with coverage.
//
// MATCHED BY EXACT SHA, NEVER "THE LATEST NIGHTLY RUN" -- nightly runs on a schedule against whatever
// `main`'s tip happens to be at trigger time (`ref: main`, `.github/workflows/nightly.yml`), so its most
// recent run is very often the PARENT of the sha being released, not the sha itself. Reusing a parent's
// verdict would ship a coverage number that was never measured for the code actually being released.
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { realpathSync, appendFileSync } from "node:fs";
import { refuseUnknownFlags, flagValue } from "../packages/worker-fleet/src/cli-flags.mjs";
import { REPO } from "./repo-identity.mjs";
import { gh } from "../packages/agent-org/src/merge-guard/lookups.mjs";
import { sandboxGitEnv } from "../packages/guards/src/git-env.mjs";

const NIGHTLY_RUN_LIMIT = 30; // ~a month of daily runs -- plenty of margin over "was there one today"

/**
 * Does the release job need to run coverage itself, or can it reuse nightly's verdict for this EXACT sha?
 *
 * PURE: `candidates` is nightly's own `coverage` job conclusion per recent run, one entry per sha it ran
 * against -- gathering them (network calls) is `nightlyCoverageCandidates`'s job, not this one's, so this
 * decision is testable against a fixture array with no `gh` process involved.
 *
 * @param {{ releaseSha: string, candidates: { sha: string, conclusion: string }[] }} input
 * @returns {{ reuse: true, sha: string } | { reuse: false, reason: string }}
 */
export function coverageVerdictDecision({ releaseSha, candidates }) {
  // MULTIPLE ENTRIES CAN SHARE ONE SHA -- `nightly.yml`'s `coverage` job also runs (as `skipped`) on the
  // hourly org-watch cron tick, beside the one real run on the 06:17 daily cron; both attach to the same
  // `main`-tip sha if nothing merged in between. Found by running this against the real repo, not assumed:
  // the first entry for a real reusable sha was `skipped`, and taking "the first match" reported a
  // genuine success as unreusable. Any SUCCESS for this sha reuses, regardless of order or how many
  // other entries (skipped or otherwise) also carry it.
  const forThisSha = candidates.filter((c) => c.sha === releaseSha);
  if (forThisSha.length === 0) {
    return { reuse: false, reason: `no nightly coverage verdict recorded for ${releaseSha}` };
  }
  if (!forThisSha.some((c) => c.conclusion === "success")) {
    const conclusions = [...new Set(forThisSha.map((c) => c.conclusion))].join(", ");
    return { reuse: false,
      reason: `nightly's coverage job for ${releaseSha} did not succeed (conclusion: ${conclusions})` };
  }
  return { reuse: true, sha: releaseSha };
}

/**
 * `nightly.yml`'s `coverage` job's own conclusion for each of its recent runs, keyed by the sha it ran
 * against. `null` on a lookup failure -- CANNOT ASK is never treated as "no candidates", which would read
 * as license to reuse nothing and silently always re-run (safe) or, worse, be confused with a genuine
 * absence a caller might one day treat differently.
 * @returns {{ sha: string, conclusion: string }[] | null}
 */
export function nightlyCoverageCandidates() {
  try {
    const runs = JSON.parse(gh(["run", "list", "--repo", REPO, "--workflow", "nightly.yml",
      "--status", "completed", "--json", "databaseId,headSha", "--limit", String(NIGHTLY_RUN_LIMIT)]));
    return runs
      .map((/** @type {{ databaseId: number, headSha: string }} */ run) => {
        const jobs = JSON.parse(gh(["run", "view", String(run.databaseId), "--repo", REPO,
          "--json", "jobs"])).jobs;
        const coverageJob = jobs.find((/** @type {{ name: string }} */ j) => j.name === "coverage");
        return coverageJob ? { sha: run.headSha, conclusion: coverageJob.conclusion } : null;
      })
      .filter((/** @type {unknown} */ c) => c !== null);
  } catch {
    return null;
  }
}

function releaseSha() {
  const flagged = flagValue(process.argv.slice(2), "sha");
  if (flagged) return flagged;
  return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", env: sandboxGitEnv() }).trim();
}

function writeOutputs({ reuse, reason }) {
  const lines = [`reuse=${reuse}`, `reason=${reason ?? "reusing nightly's verdict"}`];
  const outFile = process.env.GITHUB_OUTPUT;
  if (!outFile) {
    // Not inside a GitHub Actions job -- print rather than fail, so this is also runnable by hand.
    console.log(lines.join("\n"));
    return;
  }
  appendFileSync(outFile, `${lines.join("\n")}\n`);
}

function main() {
  refuseUnknownFlags(["--sha"], { entry: import.meta.url, command: "node scripts/release-reuses-verdict.mjs" });
  const sha = releaseSha();
  const candidates = nightlyCoverageCandidates();
  if (candidates === null) {
    // CANNOT ASK falls back to running coverage itself -- the safe direction. A release that skipped a
    // real coverage check because a `gh` lookup failed is a worse outcome than one that ran it needlessly.
    process.stderr.write("release-reuses-verdict: could not read nightly.yml's recent runs -- running "
      + "coverage rather than guessing.\n");
    writeOutputs({ reuse: false, reason: "could not look up nightly's coverage verdict" });
    return;
  }
  const decision = coverageVerdictDecision({ releaseSha: sha, candidates });
  process.stdout.write(decision.reuse
    ? `release-reuses-verdict: reusing nightly's coverage verdict for ${decision.sha}\n`
    : `release-reuses-verdict: running coverage -- ${decision.reason}\n`);
  writeOutputs(decision.reuse ? { reuse: true, reason: `nightly already covered ${decision.sha}` } : decision);
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) {
  main();
}
