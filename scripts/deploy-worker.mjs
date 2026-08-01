// Deploy the worker's code to the guests, in one command, and prove it landed.
//
//   node scripts/deploy-worker.mjs              # every local worker VM, one at a time
//   node scripts/deploy-worker.mjs --vm=a11y-worker-2
//
// Why this exists: deploying was a documented twelve-step manual dance — push four files with
// `utmctl file push`, stop the VM, start it, then run `worker:code` and hope. Two things about that
// were unacceptable for something we rely on:
//
//  - **It is easy to get wrong, and I got it wrong.** Pushing three of the four files leaves a guest
//    running a mix; the symptom is a `worker:code` mismatch with no clue which file is stale.
//  - **`utmctl exec` cannot be trusted to restart the worker**, so the reboot is mandatory and easy to
//    skip. Skipping it makes the guest serve the previous code while reporting success — which cost two
//    workers an hour of running stale code once already.
//
// So: one command, every hashed file, a real reboot, and a hash check over HTTP afterwards. The hash
// check is the whole point — it shares no failure mode with the push, which is why `/health.code`
// exists rather than reading the guest's files back through the same broken channel.
//
// Deploys the WORKING TREE, deliberately: that is what you are testing. Roll back by checking out the
// ref you want and running this again — git is the source of truth for "the previous version", so there
// is no bespoke backup to go stale.
import { execFile, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, readFileSync } from "node:fs";
import { promisify } from "node:util";
import { resolve } from "node:path";

const run = promisify(execFile);
const NVDA_DIR = resolve("src/capture/nvda");
const GUEST_DIR = "C:\\Users\\witness\\a11y-witness\\src\\capture\\nvda";
const CTL = resolve("scripts/local-worker/worker-ctl.sh");
const LIFECYCLE_TIMEOUT_MS = 420_000;
// `pool` launches UTM if it is closed and polls every VM's /health. 90s was too short: it timed out
// mid-deploy while three guests were transitioning, and the whole run died with a bare SIGTERM.
const POOL_TIMEOUT_MS = 240_000;
const HEALTH_TIMEOUT_MS = 20_000;

const only = process.argv.find((a) => a.startsWith("--vm="))?.slice("--vm=".length);

/**
 * The files that make up the worker's code version.
 *
 * Read from check-worker-code.mjs rather than duplicated here, because a third copy of this list is a
 * third thing to forget to update — and a file missing from the list deploys invisibly.
 */
function hashedFiles() {
  const source = readFileSync(resolve("scripts/check-worker-code.mjs"), "utf8");
  const match = /for \(const file of \[([^\]]+)\]\)/.exec(source);
  if (!match) throw new Error("could not find the hashed-file list in scripts/check-worker-code.mjs");
  return match[1].split(",").map((name) => name.trim().replace(/^["']|["']$/g, ""));
}

/** Must match server.mjs codeVersion(): same files, same order. */
function localVersion(files) {
  const hash = createHash("sha256");
  for (const file of files) hash.update(readFileSync(resolve(NVDA_DIR, file)));
  return hash.digest("hex").slice(0, 16);
}

async function pool() {
  const { stdout } = await run(CTL, ["pool"], { timeout: POOL_TIMEOUT_MS, encoding: "utf8" });
  const all = JSON.parse(stdout);
  return only ? all.filter((vm) => vm.name === only) : all;
}

function ctl(action, vmName) {
  return run(CTL, [action], {
    timeout: LIFECYCLE_TIMEOUT_MS, encoding: "utf8",
    env: { ...process.env, A11Y_VM_NAME: vmName },
  });
}

/**
 * Push one file. `utmctl file push` reads the content from stdin, which execFile cannot stream, so the
 * child is spawned and the file piped in.
 */
function push(uuid, file) {
  return new Promise((done, fail) => {
    const child = execFile("utmctl", ["file", "push", uuid, `${GUEST_DIR}\\${file}`], (error) =>
      error ? fail(new Error(`push ${file}: ${error.message}`)) : done());
    createReadStream(resolve(NVDA_DIR, file)).pipe(child.stdin);
  });
}

async function healthCode(ip, port) {
  const response = await fetch(`http://${ip}:${port}/health`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`HTTP ${response.status} from /health`);
  return (await response.json()).code;
}

async function deployTo(vm, files, expected) {
  process.stdout.write(`\n=== ${vm.name} ===\n`);
  // Push needs the guest running; the reboot afterwards is what actually loads the new code.
  await ctl("up", vm.name);
  for (const file of files) {
    await push(vm.uuid, file);
    process.stdout.write(`  pushed ${file}\n`);
  }
  process.stdout.write("  rebooting (utmctl exec cannot be trusted to restart the worker) ...\n");
  await ctl("stop", vm.name);
  await ctl("up", vm.name);

  const fresh = await pool();
  const back = fresh.find((v) => v.name === vm.name);
  if (!back?.ip) throw new Error(`${vm.name} did not come back with an address`);
  const actual = await healthCode(back.ip, back.port);
  const ok = actual === expected;
  process.stdout.write(`  /health.code ${actual} ${ok ? "== expected" : `!= expected ${expected}`}\n`);
  // Put it back where it was found, the same contract the run's lease honours.
  if (vm.state !== "started") await ctl("stop", vm.name);
  return ok;
}

/**
 * Refuse to deploy a CAPTURE_PROTOCOL_VERSION change unless it is asked for explicitly.
 *
 * This deploys the WORKING TREE, which is right for testing a change and dangerous for one specific
 * change: the protocol version is a capture-cache key input, so shipping a bump invalidates every capture
 * on disk — 2,122 of them — and forces a full recapture that takes hours.
 *
 * The trap is real and was live in this repo. An uncommitted bump in a shared checkout makes
 * `npm run worker:code` report every worker STALE, and the remedy it prints is "redeploy" — which would
 * deploy the bump, wipe the cache, and give no clue why the next run recaptured everything.
 */
function guardProtocolChange() {
  const inTree = /CAPTURE_PROTOCOL_VERSION = (\d+)/.exec(
    readFileSync(resolve(NVDA_DIR, "capture-core.mjs"), "utf8"))?.[1];
  let committed;
  try {
    committed = /CAPTURE_PROTOCOL_VERSION = (\d+)/.exec(
      execFileSync("git", ["show", "HEAD:src/capture/nvda/capture-core.mjs"], { encoding: "utf8" }))?.[1];
  } catch {
    return; // not a git checkout, or no HEAD yet: nothing to compare against
  }
  if (!inTree || !committed || inTree === committed) return;
  if (process.argv.includes("--allow-protocol-change")) {
    process.stdout.write(`\nDeploying CAPTURE_PROTOCOL_VERSION ${committed} -> ${inTree} as requested. ` +
      "Every cached capture is now invalid and the next run will recapture all of them.\n");
    return;
  }
  process.stderr.write(
    `\nREFUSING TO DEPLOY: the working tree has CAPTURE_PROTOCOL_VERSION = ${inTree}, but HEAD has ` +
    `${committed}.\n\n` +
    "That value is a capture-cache key, so deploying it invalidates all cached captures and forces a\n" +
    "full recapture (2,122 captures, hours). If a `worker:code` STALE report sent you here, the stale\n" +
    "hash is probably caused by this uncommitted bump rather than by the guests being out of date.\n\n" +
    "  git stash                            # deploy without the bump, or\n" +
    "  npm run worker:deploy -- --allow-protocol-change   # deploy it deliberately\n");
  process.exit(3);
}

guardProtocolChange();

const files = hashedFiles();
const expected = localVersion(files);
const vms = await pool();
if (!vms.length) {
  process.stderr.write(only ? `no local worker VM named ${only}\n` : "no local worker VMs registered\n");
  process.exit(2);
}
process.stdout.write(`Deploying ${files.length} file(s) to ${vms.length} worker(s)\n`);
process.stdout.write(`Files: ${files.join(", ")}\nExpected code: ${expected}\n`);

const failed = [];
for (const vm of vms) {
  try {
    if (!await deployTo(vm, files, expected)) failed.push(vm.name);
  } catch (error) {
    process.stdout.write(`  FAILED: ${error.message}\n`);
    failed.push(vm.name);
  }
}

process.stdout.write(`\n${vms.length - failed.length}/${vms.length} worker(s) on ${expected}\n`);
if (failed.length) {
  process.stdout.write(`stale or failed: ${failed.join(", ")}\n`);
  process.stdout.write("Re-run this command; if it persists, the guest is not rebooting — see docs/nvda-worker-runbook.md\n");
}
process.exit(failed.length ? 1 : 0);
