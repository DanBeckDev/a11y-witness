/**
 * Guest facts, over HTTP, because the guest agent cannot be relied on.
 *
 * Everything here was previously obtainable only through `utmctl exec`, which is a wrapper over QEMU's
 * `guest-exec`. That mechanism is **known-unreliable on Windows** — upstream has long-standing reports
 * of qemu-ga stopping at random across Windows and hypervisor versions, and of it failing to open
 * `\\.\Global\org.qemu.guest_agent.0` with "Access is denied" — and the standing advice to clients is to
 * assume it may simply not answer. Measured here across one session: it worked, then silently wrote
 * nothing, then returned OSStatus -2700, then worked again, on the same guest.
 *
 * A diagnostic channel that fails in the same way as the thing it diagnoses is worthless, which this
 * repo already learned once for the code hash: `/health.code` exists because reading the guest's files
 * back through `exec` returned *empty* rather than *mismatched* when `exec` was broken, and empty reads
 * as a flaky tool rather than a failed deploy. Same reasoning, wider scope.
 *
 * **Separate from `/health` on purpose.** `/health` is polled — by `worker-ctl.sh`, by the pool lease,
 * by `doctor` — so it must stay cheap. Walking an Edge profile of tens of thousands of files and
 * shelling out to `tasklist` is not cheap, so it lives behind its own endpoint and is only paid for when
 * somebody is actually diagnosing something.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, statfsSync, statSync } from "node:fs";
import { join } from "node:path";

/** Stop walking a runaway tree. An Edge profile is large but not unbounded. */
const MAX_WALK_ENTRIES = 200_000;
const MAX_WALK_DEPTH = 12;
const BYTES_PER_MB = 1024 * 1024;

/**
 * Total size and file count of a directory tree.
 *
 * Returns what it managed to measure rather than throwing: a diagnostic that fails must degrade to
 * "unknown", never take down the endpoint that reports it.
 *
 * @param {string} root
 * @returns {{ megabytes: number, files: number, truncated: boolean } | null}
 */
export function treeSize(root) {
  let bytes = 0, files = 0, truncated = false;
  const walk = (dir, depth) => {
    if (depth > MAX_WALK_DEPTH || files >= MAX_WALK_ENTRIES) {
      truncated = true;
      return;
    }
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // unreadable subtree (locked by Edge, most likely) -- skip it, keep the rest
    }
    for (const entry of entries) {
      if (files >= MAX_WALK_ENTRIES) { truncated = true; return; }
      const path = join(dir, entry.name);
      if (entry.isDirectory() && !entry.isSymbolicLink()) { walk(path, depth + 1); continue; }
      if (!entry.isFile()) continue;
      files += 1;
      try {
        bytes += statSync(path).size;
      } catch {
        // Vanished or locked between readdir and stat. Counting it as zero is honest enough.
      }
    }
  };
  try {
    statSync(root);
  } catch {
    return null; // absent, which is itself a fact worth reporting as null
  }
  walk(root, 0);
  return { megabytes: Math.round(bytes / BYTES_PER_MB), files, truncated };
}

/** Free and total space on the volume holding `path`, in MB, or null if unreadable. */
export function diskSpace(path) {
  try {
    const fs = statfsSync(path);
    return {
      freeMb: Math.round((fs.bsize * fs.bavail) / BYTES_PER_MB),
      totalMb: Math.round((fs.bsize * fs.blocks) / BYTES_PER_MB),
    };
  } catch {
    return null;
  }
}

/**
 * How many of each process are running.
 *
 * This is the fact that mattered most and was hardest to get: a leaked Edge is invisible from outside,
 * and eight orphaned msedge processes on a 4 GB guest is what once made every subsequent nvda.start time
 * out. One `tasklist` call for all of them, because spawning per name is what made this expensive.
 *
 * @param {string[]} names image names without `.exe`
 */
export function processCounts(names) {
  if (process.platform !== "win32") return null;
  try {
    const csv = execFileSync("tasklist", ["/fo", "csv", "/nh"], {
      encoding: "utf8", timeout: 15_000, maxBuffer: 1 << 24,
    });
    const counts = {};
    for (const name of names) counts[name] = 0;
    for (const line of csv.split("\n")) {
      const image = /^"([^"]+)"/.exec(line)?.[1]?.replace(/\.exe$/i, "").toLowerCase();
      if (image && counts[image] !== undefined) counts[image] += 1;
    }
    return counts;
  } catch {
    return null;
  }
}

/** Image names worth counting: the three that have each caused an outage by leaking or dying. */
const WATCHED_PROCESSES = ["msedge", "nvda", "node"];

/**
 * Everything a human would otherwise reach for `utmctl exec` to find out.
 *
 * @param {{ edgeProfile: string, logPath: string }} paths
 */
/**
 * Where a profile's bulk actually is, one level down.
 *
 * A total tells you the profile is big; it does not tell you what to do about it. Pruning the obvious
 * cache directories on a 511 MB profile recovered only 52 MB, which is exactly the kind of guess this
 * breakdown exists to prevent.
 */
export function largestSubtrees(root, limit = 8) {
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return null;
  }
  const sized = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory() && !entry.isSymbolicLink()) {
      sized.push({ name: entry.name, megabytes: treeSize(path)?.megabytes ?? 0 });
      continue;
    }
    try {
      sized.push({ name: entry.name, megabytes: Math.round(statSync(path).size / BYTES_PER_MB) });
    } catch { /* vanished between readdir and stat; nothing to report */ }
  }
  return sized.sort((a, b) => b.megabytes - a.megabytes).slice(0, limit);
}

/** The Edge policy values the worker depends on, read back so drift is visible over HTTP. */
export function edgePolicy() {
  if (process.platform !== "win32") return null;
  const read = (name) => {
    try {
      const out = execFileSync("reg",
        ["query", "HKLM\\SOFTWARE\\Policies\\Microsoft\\Edge", "/v", name],
        { encoding: "utf8", timeout: 15_000, stdio: ["ignore", "pipe", "ignore"] });
      const hex = /REG_DWORD\s+0x([0-9a-f]+)/i.exec(out)?.[1];
      return hex === undefined ? null : Number.parseInt(hex, 16);
    } catch {
      return null; // absent, which for a policy means "not set"
    }
  };
  return { StartupBoostEnabled: read("StartupBoostEnabled"), BackgroundModeEnabled: read("BackgroundModeEnabled") };
}

export function guestDiagnostics({ edgeProfile, logPath }) {
  return {
    measuredAt: new Date().toISOString(),
    edgePolicy: edgePolicy(),
    edgeProfileBreakdown: largestSubtrees(edgeProfile),
    edgeProfileDefaultBreakdown: largestSubtrees(join(edgeProfile, "Default")),
    // The leading suspect for a slow worker: Edge is launched per capture, so its cold start is on the
    // critical path, and a Chromium profile that has accumulated cache stalls startup. Durable by
    // design (a fresh profile shows the first-run experience, which leaks into captures) -- durable is
    // not the same as unbounded, and this is how you tell the difference.
    edgeProfile: treeSize(edgeProfile),
    disk: diskSpace(edgeProfile),
    serverLog: treeSize(logPath),
    processes: processCounts(WATCHED_PROCESSES),
  };
}
