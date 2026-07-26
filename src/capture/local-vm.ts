/**
 * On-demand lifecycle for the local UTM worker VM.
 *
 * A Windows guest is never really idle -- Defender, Update and the search indexer keep it
 * busy -- so leaving one running between captures costs the host real CPU. Cold start is
 * cheap enough (12-15s to /health, measured) that starting it per run and shutting it down
 * afterwards is the better trade.
 *
 * The default is to LEAVE THE VM AS FOUND, which needs no configuration to do the right
 * thing: a VM that was stopped gets stopped again, a paused one gets re-paused, and one you
 * had already started yourself is left alone. That last case matters -- a run must never
 * shut down a VM somebody else is using.
 *
 * Everything UTM-specific lives in scripts/local-worker/worker-ctl.sh (`json` emits the
 * state this module reads). Nothing here knows about utmctl, bundles or bookmarks.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

// Relative to this module, not the process cwd: `npm run` happens to start in the repo
// root, but a direct `tsx src/cli.ts` from elsewhere would not.
const CTL = fileURLToPath(new URL("../../scripts/local-worker/worker-ctl.sh", import.meta.url));

const STATUS_TIMEOUT_MS = 30_000;
// Generous on purpose: `up` boots Windows, waits for auto-logon and then polls /health,
// and worker-ctl gives that 180s of its own before giving up.
const LIFECYCLE_TIMEOUT_MS = 300_000;

/** What to do with the VM once the run finishes. */
export type AfterRun = "restore" | "stop" | "pause" | "leave";

const AFTER_RUN_VALUES: AfterRun[] = ["restore", "stop", "pause", "leave"];

export function isAfterRun(v: string): v is AfterRun {
  return (AFTER_RUN_VALUES as string[]).includes(v);
}

interface VmStatus {
  uuid: string;
  name: string;
  /** utmctl's own vocabulary: "started" | "paused" | "stopped" | "unknown". */
  state: string;
  ip: string;
  port: number;
  healthy: boolean;
  /** True while a capture is in flight -- the worker's own flag. */
  busy: boolean;
}

/** A worker to capture against, and the cleanup that matches how it was obtained. */
export interface WorkerLease {
  worker: string;
  /** Never throws: a cleanup failure must not mask the run's own result. */
  release: () => Promise<void>;
}

async function ctl(args: string[], timeoutMs: number): Promise<string> {
  const { stdout } = await execFileAsync(CTL, args, { timeout: timeoutMs, encoding: "utf8" });
  return stdout;
}

/**
 * The registered local VM, or null when there is nothing to manage: not macOS, no UTM, no
 * VM registered under that name, or duplicate registrations (worker-ctl refuses to guess
 * between those rather than risk acting on the wrong one).
 */
export async function findLocalVm(): Promise<VmStatus | null> {
  if (process.platform !== "darwin") return null;
  try {
    return JSON.parse(await ctl(["json"], STATUS_TIMEOUT_MS)) as VmStatus;
  } catch (e) {
    // Absence is the normal case for anyone without a local VM, so this is a debug
    // breadcrumb rather than a warning -- but never a silent catch.
    if (process.env.A11Y_DEBUG_VM) {
      process.stderr.write(`local VM lookup failed (continuing without one): ${(e as Error).message}\n`);
    }
    return null;
  }
}

/** Which lifecycle action returns the VM to `stateBefore`. */
function restoreAction(stateBefore: string): AfterRun {
  if (stateBefore === "started") return "leave";
  if (stateBefore === "paused") return "pause";
  return "stop";
}

async function releaseVm(action: AfterRun, stateBefore: string): Promise<void> {
  const resolved = action === "restore" ? restoreAction(stateBefore) : action;
  if (resolved === "leave") return;
  // Another run may have started a capture while ours was finishing. Shutting the guest
  // down underneath it would look exactly like a worker crash, so stand down instead.
  const now = await findLocalVm();
  if (now?.busy) {
    process.stderr.write(`worker is busy with another capture; leaving the VM ${now.state}\n`);
    return;
  }
  process.stderr.write(`${resolved === "pause" ? "Pausing" : "Shutting down"} the local worker VM ...\n`);
  await ctl([resolved], LIFECYCLE_TIMEOUT_MS);
}

/**
 * Start (or resume) the local VM, returning its worker URL and the matching cleanup.
 * Throws if the VM never becomes healthy -- there is no point judging a capture that could
 * not happen.
 */
export async function acquireLocalWorker(vm: VmStatus, after: AfterRun): Promise<WorkerLease> {
  const stateBefore = vm.state;
  if (stateBefore === "started" && vm.healthy) {
    process.stderr.write(`Using the running local worker VM '${vm.name}' at ${vm.ip}\n`);
  } else {
    process.stderr.write(`Local worker VM '${vm.name}' is ${stateBefore}; bringing it up ...\n`);
    process.stderr.write(await ctl(["up"], LIFECYCLE_TIMEOUT_MS));
  }

  const ready = await findLocalVm();
  if (!ready?.healthy || !ready.ip) {
    throw new Error(
      `Local worker VM '${vm.name}' did not become healthy. Check it directly: ${CTL} status`
    );
  }

  return {
    worker: `http://${ready.ip}:${ready.port}`,
    release: () =>
      releaseVm(after, stateBefore).catch((e: Error) => {
        // Report and move on. The run's verdict is the product; a VM left running is a
        // resource leak the user can fix with one command, not a reason to fail the run.
        process.stderr.write(`WARNING: could not release the local worker VM: ${e.message}\n`);
      }),
  };
}
