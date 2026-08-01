// Is every worker running the code in this checkout?
//
//   npm run worker:code
//
// Deploying is push-then-restart and both halves fail silently: `utmctl exec` reports success
// whether or not it ran, so a worker can serve the previous process indefinitely. Reading the
// guest's file hash does not help, because that read goes through exec too -- when exec is
// dead the check returns empty rather than mismatched, which reads as a flaky tool instead of a
// failed deploy. That cost an hour, and the stale workers looked exactly like a logic bug.
//
// This asks each worker over HTTP, which is reachable exactly when the worker is usable and
// involves no guest agent. Exit 0 when every worker matches, 1 otherwise.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const CTL = resolve("scripts/local-worker/worker-ctl.sh");
const NVDA_DIR = resolve("src/capture/nvda");
// /health now reports installed runtime versions as well as the code hash. The first
// request after a Windows boot may need PowerShell file-version discovery, so four seconds
// was too tight and made a healthy worker look unreachable.
const HEALTH_TIMEOUT_MS = 15000;

// Must match server.mjs codeVersion() exactly: same files, same order.
function localVersion() {
  const hash = createHash("sha256");
  for (const file of ["capture-core.mjs", "server.mjs", "worker-recovery.mjs", "capture-faults.mjs", "diagnostics.mjs", "browser-profile.mjs", "nvda-logging.mjs"]) {
    hash.update(readFileSync(resolve(NVDA_DIR, file)));
  }
  return hash.digest("hex").slice(0, 16);
}

function workerUrls() {
  if (process.env.A11Y_WORKER) return [process.env.A11Y_WORKER];
  if (process.env.A11Y_WORKERS) return process.env.A11Y_WORKERS.split(",");
  const pool = JSON.parse(execFileSync(CTL, ["pool"], { encoding: "utf8" }));
  return pool.filter((vm) => vm.ip).map((vm) => `http://${vm.ip}:${vm.port}`);
}

async function versionOf(url) {
  const response = await fetch(`${url.replace(/\/$/, "")}/health`, {
    signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
  });
  return (await response.json()).code ?? "absent";
}

const expected = localVersion();
const urls = workerUrls();
console.log(`this checkout: ${expected}`);
if (!urls.length) {
  console.log("no worker is running — nothing to compare (start one, or a run will)");
  process.exit(0);
}

let stale = 0;
for (const url of urls) {
  let actual;
  try {
    actual = await versionOf(url);
  } catch (e) {
    console.log(`  ${url}  unreachable (${e.message})`);
    continue;
  }
  // "absent" means the worker predates /health.code, which is itself a stale deploy.
  const ok = actual === expected;
  if (!ok) stale += 1;
  console.log(`  ${url}  ${actual}  ${ok ? "matches" : "STALE — redeploy and REBOOT the guest"}`);
}
if (stale) {
  console.log(`\n${stale} stale worker(s). A restart via \`utmctl exec\` silently does nothing on`);
  console.log("some guests; rebooting the VM always picks up a pushed file:");
  console.log("  utmctl stop <uuid> --request && utmctl start <uuid>");
}
process.exit(stale ? 1 : 0);
