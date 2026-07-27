// Can I run right now? One command, one answer.
//
//   npm run doctor            human-readable, with the fix for anything broken
//   npm run doctor -- --json  machine-readable, for an agent
//
// This exists because "is the environment ready" took five commands and some inference, and
// the inference went wrong: a healthy VM was reported as a corrupted one because `utmctl`
// answers `unknown` when the UTM app is closed. Every check below therefore reports what it
// observed AND the exact command that fixes it, so nothing has to be deduced.
//
// Exit codes: 0 ready, 1 something is broken (details in the report).
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const run = promisify(execFile);
const JSON_OUT = process.argv.includes("--json");
const WORKER_ENV = process.env.A11Y_WORKER ?? null;
const PAGES_PORT = Number(process.env.DATASET_PAGES_PORT || 5050);
const CTL = fileURLToPath(new URL("../scripts/local-worker/worker-ctl.sh", import.meta.url));
const DATASET = resolve(process.cwd(), "runs/screenreader-dataset");
const PROBE_TIMEOUT_MS = 8000;

const checks = [];
const add = (name, ok, detail, fix = null) => checks.push({ name, ok, detail, fix });

async function shell(cmd, args, timeout = 30000) {
  const { stdout } = await run(cmd, args, { timeout, encoding: "utf8" });
  return stdout.trim();
}

async function httpJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

// --- the checks -----------------------------------------------------------

async function checkJudge() {
  const backend = (process.env.JUDGE_BACKEND ?? "codex").toLowerCase();
  if (backend !== "codex") {
    const key = backend === "anthropic" ? "ANTHROPIC_API_KEY" : "JUDGE_BASE_URL";
    return add("judge", !!process.env[key], `backend=${backend}`, `export ${key}=...`);
  }
  try {
    await shell("codex", ["--version"], 15000);
    add("judge", true, "codex CLI present (login is not checked here)");
  } catch {
    add("judge", false, "codex CLI not found", "install Codex and run: codex login");
  }
}

// The worker is the only hard prerequisite, and the one that breaks. Report the VM and the
// worker separately: "guest up, worker down" and "no VM at all" need different fixes.
async function checkWorker() {
  if (WORKER_ENV) {
    try {
      const health = await httpJson(`${WORKER_ENV.replace(/\/$/, "")}/health`);
      return add("worker", health.screenReader === "NVDA", `A11Y_WORKER ${WORKER_ENV} — ${JSON.stringify(health)}`);
    } catch (e) {
      return add("worker", false, `A11Y_WORKER ${WORKER_ENV} unreachable (${e.message})`,
        "check that machine is up and its a11ysrv task is running");
    }
  }
  if (process.platform !== "darwin" || !existsSync(CTL)) {
    return add("worker", false, "no A11Y_WORKER set and no local VM tooling here",
      "set A11Y_WORKER=http://host:8765, or see docs/getting-started.md");
  }
  let vm;
  try {
    vm = JSON.parse(await shell(CTL, ["json"], 60000));
  } catch (e) {
    return add("worker", false, `could not query the local VM (${e.message.split("\n")[0]})`,
      `${CTL} status`);
  }
  add("vm", vm.state === "started", `local VM '${vm.name}' is ${vm.state}`,
    vm.state === "started" ? null : `${CTL} up`);
  if (!vm.healthy) {
    return add("worker", false, vm.ip ? `guest is up at ${vm.ip} but the worker is not answering` : "guest has no IP yet",
      vm.ip ? "Start-ScheduledTask -TaskName a11ysrv on the guest" : `${CTL} up`);
  }
  add("worker", true, `http://${vm.ip}:${vm.port} — NVDA ready${vm.busy ? ", BUSY with a capture" : ""}`);
  if (vm.busy) {
    add("contention", false, "a capture is in flight — another shell or agent is using this worker",
      "wait for it, or you will both see the other's restarts as breakage");
  }
}

// Dataset capture needs the pages served, and the guest must be able to reach them — the
// host's localhost is not reachable from inside the VM.
async function checkDatasetPages() {
  if (!existsSync(resolve(DATASET, "manifest.json"))) {
    return add("dataset", false, "no manifest — the dataset has not been generated",
      "npm run training:generate");
  }
  try {
    await fetch(`http://localhost:${PAGES_PORT}/`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    add("pages", true, `served on :${PAGES_PORT}`);
  } catch {
    add("pages", false, `nothing serving on :${PAGES_PORT}`,
      `npx serve ${DATASET}/pages -l ${PAGES_PORT}`);
  }
}

// A run left mid-flight is the difference between "start" and "--resume", and getting it
// wrong either re-captures for hours or silently skips work.
function checkRunState() {
  const progress = resolve(DATASET, "capture-progress.json");
  if (!existsSync(progress)) return add("run", true, "no capture run recorded");
  const p = JSON.parse(readFileSync(progress, "utf8"));
  if (!p.startedAt) return add("run", true, "no capture run recorded");
  if (!p.finishedAt) {
    return add("run", false, `a run is UNFINISHED (started ${p.startedAt})`,
      "npm run training:wait, or npm run training:capture -- --resume");
  }
  const failed = Object.values(p.cases ?? {}).filter((c) => c.status === "failed").length;
  add("run", failed === 0, `last run ${p.outcome ?? "finished"}`,
    failed ? "npm run training:capture -- --resume" : null);
}

// --- report ---------------------------------------------------------------

await checkJudge();
await checkWorker();
await checkDatasetPages();
checkRunState();

const ready = checks.every((c) => c.ok);
if (JSON_OUT) {
  console.log(JSON.stringify({ ready, checks }, null, 2));
} else {
  for (const c of checks) {
    console.log(`${c.ok ? "OK  " : "FAIL"}  ${c.name.padEnd(11)} ${c.detail}`);
    if (!c.ok && c.fix) console.log(`        fix: ${c.fix}`);
  }
  console.log(`\n${ready ? "READY" : "NOT READY — see the fixes above"}`);
}
process.exit(ready ? 0 : 1);
