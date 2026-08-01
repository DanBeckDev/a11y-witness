/**
 * Keep the durable Edge profile durable *and* bounded, and clear strays left by a previous worker.
 *
 * The profile is deliberately persistent: a fresh `--user-data-dir` shows Edge's first-run
 * welcome/sign-in surface, and on a page with no headings NVDA's quick-nav escapes the empty document
 * into that surface and records it as phantom page content. So it must survive. **Durable is not the
 * same as unbounded**, and nothing was enforcing the difference.
 *
 * Measured across three otherwise identical guests, freshly booted:
 *
 *   a11y-worker    511 MB profile, 5 orphaned msedge processes   ~21 s per capture
 *   a11y-worker-2  261 MB profile, 0 orphaned                    ~11 s per capture
 *   a11y-worker-3  170 MB profile, 0 orphaned                    ~11 s per capture
 *
 * Both halves of that are known failure modes rather than novel ones. A Chromium profile with
 * accumulated cache stalls the browser's main thread during startup — the standard diagnostic is "does
 * a fresh profile launch fast?", and the standard fix is to rebuild the profile. And orphaned Edge
 * processes are already recorded in this repo as an outage: eight of them on a 4 GB guest is the load
 * that made the next `nvda.start` time out, with failures compounding until the worker could not capture
 * at all.
 *
 * Since Edge launch (`windowsActivate`) is the single largest phase of a capture, a slow-starting
 * browser is not a cosmetic problem.
 *
 * **Both jobs run at BOOT and nowhere else.** A capture owns Edge for its whole duration, so pruning or
 * killing at any other moment would race it. At boot no capture can be in flight, which makes "kill
 * every msedge" safe here and nowhere else.
 */
import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

/**
 * Regenerable subtrees. Every one of these is a cache or a session record that Chromium rebuilds on
 * demand; none of them is what suppresses the first-run experience (that is `Local State`, `Preferences`
 * and the profile's existence, all of which are left alone).
 *
 * The `Sessions`/`Current *`/`Last *` entries are here for a second reason: they are what makes Edge
 * try to restore a previous window on launch, which both slows startup and risks restoring page content
 * into a capture.
 */
/**
 * Always dropped, whatever the profile size, because they have no function for a capture worker and at
 * least one of them grows without bound.
 *
 * `BrowserMetrics` is the one that mattered: Edge writes a histogram file there **per launch**, and this
 * worker launches Edge once per capture. Measured on the busiest guest it was **348 MB of a 448 MB
 * profile** — hundreds of files Edge has to deal with at startup, which is why the slow worker stayed
 * slow across reboots. It is write-only telemetry that nothing here ever reads.
 *
 * The rest are Edge component payloads (wallet, shopping, entity extraction, DRM) that a machine whose
 * only job is reading pages to a screen reader does not need. They do not grow per launch, so they are
 * cleanliness rather than a fix.
 */
const ALWAYS_REGENERABLE = [
  "BrowserMetrics",
  "Edge Entity Extraction", "Edge Wallet", "Edge Shopping", "Subresource Filter", "WidevineCdm",
];

const REGENERABLE = [
  "Default/Cache", "Default/Code Cache", "Default/GPUCache", "Default/DawnCache",
  "Default/DawnGraphiteCache", "Default/DawnWebGPUCache", "Default/GrShaderCache",
  "Default/Service Worker/CacheStorage", "Default/Service Worker/ScriptCache",
  "Default/Sessions", "Default/Current Session", "Default/Current Tabs",
  "Default/Last Session", "Default/Last Tabs",
  "GrShaderCache", "ShaderCache", "component_crx_cache", "GraphiteDawnCache",
];

/** Above this, the profile is costing more startup time than the cache is saving. */
const PRUNE_ABOVE_MB = 200;

/**
 * Which regenerable paths exist and should go, given a profile size.
 *
 * Pure so the policy can be tested without a filesystem: the risky part of this feature is *what* it
 * deletes, and that decision deserves a test rather than a comment.
 *
 * @param {{ megabytes: number | null, root: string, exists: (path: string) => boolean }} profile
 * @returns {string[]} absolute paths to remove; empty when the profile is small enough to leave alone
 */
export function prunablePaths({ megabytes, root, exists }) {
  const absolute = (relative) => join(root, ...relative.split("/"));
  const always = ALWAYS_REGENERABLE.map(absolute).filter(exists);
  // The cache list is size-gated because a warm cache genuinely speeds Edge up; the always-list is not,
  // because none of it helps and BrowserMetrics actively hurts.
  if (megabytes === null || megabytes <= PRUNE_ABOVE_MB) return always;
  return [...always, ...REGENERABLE.map(absolute).filter(exists)];
}

/**
 * Drop the regenerable parts of an oversized profile. Returns what it removed.
 *
 * @param {string} root
 * @param {number | null} megabytes current size, from diagnostics.treeSize
 * @param {(line: string) => void} log
 */
export function pruneEdgeProfile(root, megabytes, log) {
  const targets = prunablePaths({ megabytes, root, exists: existsSync });
  if (!targets.length) return [];
  log(`Edge profile is ${megabytes} MB; dropping ${targets.length} regenerable path(s)`);
  const removed = [];
  for (const path of targets) {
    try {
      rmSync(path, { recursive: true, force: true });
      removed.push(path);
    } catch (error) {
      // Locked by something, or already gone. Pruning is best-effort by design: a profile we could not
      // shrink is slow, but a worker that refuses to start because of it is worse.
      log(`  could not remove ${path}: ${error.message}`);
    }
  }
  return removed;
}

/**
 * Kill Edge processes left over from a previous worker.
 *
 * Safe **only** at boot. `captureWithNvda` closes Edge in a `finally`, so a stray at boot means the
 * previous worker died mid-capture or was killed — and those strays are what compound into
 * `nvda.start` timeouts.
 *
 * @param {number | null} count from diagnostics.processCounts
 * @param {(line: string) => void} log
 */
export function killStrayBrowsers(count, log) {
  if (process.platform !== "win32" || !count) return false;
  log(`${count} orphaned msedge process(es) at boot — a previous capture did not clean up; killing them`);
  try {
    execFileSync("taskkill", ["/im", "msedge.exe", "/f"], { stdio: "ignore", timeout: 30_000 });
    return true;
  } catch {
    // taskkill exits non-zero when nothing matched, which is a race we do not care about losing.
    return false;
  }
}
