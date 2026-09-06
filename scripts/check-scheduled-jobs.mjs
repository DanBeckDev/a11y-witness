#!/usr/bin/env node
// Names every job this repo CLAIMS to schedule and its ACTUAL installed state -- the question nothing
// asked before this, because every existing signal for a broken schedule is the job itself telling you,
// and a job that was never installed (or was silently removed) tells you nothing.
//
// THE LAUNCHD PATH THIS SCRIPT CHECKS WAS RETIRED 2026-09-06 -- the board report now runs from GitHub
// Actions (see docs/board/README.md), both docs/board/*.plist were deleted, and zero claimed jobs is the
// CORRECT state, not a broken discovery. This script is kept for the day launchd is reintroduced, or a
// different local job is claimed the same way; it reports that honestly rather than refusing on empty.
//
// Usage:
//   npm run jobs:check                          # report only -- never fails
//   A11Y_ASSERT_CONTROL_PLANE=1 npm run jobs:check   # THIS machine is meant to run every claimed job;
//                                                     # exit 1 if one is missing, naming it
import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";
import { refuseUnknownFlags } from "@a11y-witness/worker-fleet/cli-flags";
import { checkScheduledJobs, launchctlInstalled, launchctlListA11yWitnessJobs, orphanJobs,
  platformSupportsLaunchd } from "../packages/lab/src/packaging/scheduled-jobs.mjs";

function main() {
  refuseUnknownFlags([], { entry: import.meta.url, command: "npm run jobs:check" });

  const assertControlPlane = process.env.A11Y_ASSERT_CONTROL_PLANE === "1";
  const report = checkScheduledJobs({
    repoRoot: process.cwd(),
    supportsLaunchd: platformSupportsLaunchd(),
    isInstalled: launchctlInstalled,
    assertControlPlane,
  });

  if (report.length === 0) {
    console.log("No jobs are claimed under docs/board/*.plist -- expected since the launchd board-report "
      + "path was retired for GitHub Actions on 2026-09-06 (see board-schedule.test.ts for its check). "
      + "If a .plist was meant to be here, that is the defect, not this script.");
    process.exit(0);
  }

  for (const job of report) {
    console.log(`${job.status.padEnd(18)} ${job.label}  (${job.plist})`);
    if (job.reason) console.log(`  ${job.reason}`);
  }

  const missing = report.filter((j) => j.status === "MISSING");
  if (missing.length) {
    console.error(`\n${missing.length} job(s) MISSING on a machine asserted to be the control plane: `
      + `${missing.map((j) => j.label).join(", ")}`);
    console.error("Re-run: bash scripts/install-board-report.sh");
    process.exit(1);
  }

  const orphans = orphanJobs({
    repoRoot: process.cwd(),
    supportsLaunchd: platformSupportsLaunchd(),
    listInstalled: launchctlListA11yWitnessJobs,
  });
  if (orphans.length) {
    console.log(`\nORPHAN (installed, claimed by no .plist): ${orphans.join(", ")}`);
  }

  if (!assertControlPlane) {
    console.log("\n(Set A11Y_ASSERT_CONTROL_PLANE=1 to fail rather than report on a missing job.)");
  }
  process.exit(0);
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) main();
