/**
 * How many worker VMs will actually fit on this Mac?
 *
 * The pool used to start every VM it found. On a 36 GB host that meant three guests, and measurement
 * says three do not fit: with all three up a capture took 44.5 s, and with one up it took 27.4 s of
 * the same page on the same worker — a 1.6x penalty paid by every capture in the run. The guests were
 * being swapped out from under NVDA, which also produced "NVDA is running but not speaking" failures
 * and blackouts on /health. More workers were making the run slower AND less reliable.
 *
 * So capacity is a property of the host, not a count of the VMs that happen to be registered.
 *
 * `.mjs` rather than `.ts` because `npm run doctor` runs under plain node — it is the first thing an
 * agent runs and must not depend on a transpiler — while the pool lease is TypeScript. Same reason
 * capture-decisions.mjs is .mjs.
 */
import { execFileSync } from "node:child_process";

/**
 * What one worker VM costs the host.
 *
 * Measured with `top -o mem`, which agrees with phys_footprint: ~7.0–7.6 GB for a guest configured
 * with 4096 MB. The gap is QEMU's own overhead on top of guest RAM that Windows dirties and never
 * gives back (there is no balloon driver). It is NOT accumulation: a VM sits at 6.8 GB within ten
 * minutes of booting and creeps only to ~7.6 GB over nearly two hours.
 *
 * Deliberately the high end of that range. Under-committing costs a little parallelism; over-committing
 * costs correctness, because a swapped-out guest fails captures rather than merely slowing them.
 */
const MEMORY_PER_WORKER_MB = 7_600;

/**
 * Memory left for the host itself.
 *
 * The Mac is somebody's desktop, not a dedicated hypervisor — Chrome, Spotify and the editor were all
 * resident during the measurements above. Taking the last of the available memory pushes the HOST into
 * swap, which slows every guest at once.
 */
const HOST_HEADROOM_MB = 3_000;

/**
 * Available memory on macOS, in MB, or null if it cannot be read.
 *
 * `os.freemem()` is useless here: it reported 402 MB on a host that comfortably had ~12 GB to give,
 * because macOS counts compressed and inactive pages as used. The pages that can actually be handed
 * out without swapping are free + inactive + speculative + purgeable, which is what `vm_stat` reports.
 *
 * Returns null rather than throwing on any surprise — a capacity check that cannot read the host must
 * not stop a run. This codebase already applies that rule to foregroundLockTimeout(): a broken
 * diagnostic taking the pool offline is worse than the fault it looks for.
 */
export function availableHostMemoryMb() {
  if (process.platform !== "darwin") return null;
  try {
    const output = execFileSync("vm_stat", { encoding: "utf8", timeout: 5_000 });
    const pageSize = Number(/page size of (\d+) bytes/.exec(output)?.[1]);
    if (!Number.isFinite(pageSize)) return null;
    const pagesFor = (label) =>
      Number(new RegExp(`Pages ${label}:\\s+(\\d+)`).exec(output)?.[1] ?? 0);
    const pages = pagesFor("free") + pagesFor("inactive") + pagesFor("speculative") + pagesFor("purgeable");
    return Math.round((pages * pageSize) / (1024 * 1024));
  } catch {
    return null;
  }
}

/**
 * How many workers may be RUNNING at once, given what the host has spare.
 *
 * Workers already up have paid for their memory and are counted in neither the budget nor the
 * headroom — `availableMb` is what is left after them — so they are added back at the end.
 *
 * Never returns less than one running worker: a run with no workers is a worse outcome than a slow
 * one, and refusing to start the only guest available would turn a tight host into an outage.
 */
/**
 * @param {{ availableMb: number | null, alreadyRunning: number }} host
 * @returns {number}
 */
export function workersHostCanRun({ availableMb, alreadyRunning }) {
  if (availableMb === null) return Number.POSITIVE_INFINITY; // unreadable: do not constrain the run
  const spareMb = availableMb - HOST_HEADROOM_MB;
  const canStart = Math.max(0, Math.floor(spareMb / MEMORY_PER_WORKER_MB));
  return Math.max(1, alreadyRunning + canStart);
}

/**
 * Why the pool was capped, in words a human can act on. Null when nothing was held back.
 *
 * @param {{ limit: number, wanted: number, availableMb: number | null }} cap
 * @returns {string | null}
 */
export function capacityReason({ limit, wanted, availableMb }) {
  if (!Number.isFinite(limit) || limit >= wanted) return null;
  return `host has ~${availableMb} MB available and each worker needs ~${MEMORY_PER_WORKER_MB} MB, ` +
    `so ${limit} of ${wanted} local workers will be used; the rest stay stopped. ` +
    "Measured: an over-committed host made every capture 1.6x slower and caused mute-NVDA failures. " +
    "Override with A11Y_MAX_WORKERS if you know better.";
}
