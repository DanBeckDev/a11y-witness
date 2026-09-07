#!/usr/bin/env node
// @ts-check
// SCANS THE FULL GIT HISTORY -- every blob ever reachable from every ref -- for internal addresses,
// key-shaped filenames, and secret-shaped strings. #310, preparation for #63's org transfer and the
// repository going public: the dispatcher measured 72 files on an old branch and 48 on main carrying
// `192.168.x.x` addresses, and a file fixed in a later commit still has its old content in every commit
// before that fix -- so the CURRENT tree alone understates what a public history would expose.
//
// EVERY REACHABLE BLOB, ONCE -- not `git log -p` per commit. `git rev-list --objects` already
// deduplicates identical content across commits and branches (a file unchanged across 50 commits is one
// blob, not fifty), and `git cat-file --batch` streams every blob's bytes over one long-lived process
// rather than one subprocess per blob -- 17,000+ blobs in this repository at the time this was written,
// which one-spawn-per-blob would take minutes to hours over.
//
// COUNTS AND LOCATIONS, NEVER A BARE "found something". A number with no path attached is a number
// nobody can act on -- this repo's own recurring lesson about a figure that cannot say what it was
// computed from.
import { execFileSync, spawn } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";
import { refuseUnknownFlags, flagValue } from "@a11ign/worker-fleet/cli-flags";
import { sandboxGitEnv } from "./git-env.mjs";

/**
 * Each pattern's own name, regex source and what a match means. Kept as a STRING and re-compiled to a
 * fresh `RegExp` per blob in `scanBlob` -- a shared `g`-flagged `RegExp` carries `lastIndex` state across
 * calls, and reusing one instance across many blobs would silently skip matches after the position was
 * left mid-string by an earlier, shorter blob.
 * @type {Record<string, { pattern: string, why: string }>}
 */
export const PATTERNS = {
  internalAddress: {
    pattern: String.raw`\b(?:192\.168|10\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\b`,
    why: "an RFC 1918 private address -- the measured defect this row exists for",
  },
  privateKeyBlock: {
    pattern: String.raw`-----BEGIN (?:RSA |OPENSSH |EC |DSA |ENCRYPTED )?PRIVATE KEY-----`,
    why: "a PEM private key block",
  },
  githubToken: {
    pattern: String.raw`\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{20,}\b`,
    why: "a GitHub token",
  },
  npmToken: { pattern: String.raw`\bnpm_[A-Za-z0-9]{30,}\b`, why: "an npm token" },
  awsAccessKey: { pattern: String.raw`\bAKIA[0-9A-Z]{16}\b`, why: "an AWS access key ID" },
  slackToken: { pattern: String.raw`\bxox[baprs]-[A-Za-z0-9-]{10,}\b`, why: "a Slack token" },
};

/** A filename shaped like a private key or credential file, wherever it sits in the tree. */
export const KEY_FILENAME_RE =
  /(^|\/)(id_rsa|id_ed25519|id_ecdsa|id_dsa|[^/]+\.pem|[^/]+\.ppk|a11y[-_]?pve(?:[-_]?ed25519)?|a11y[-_]?ssh(?:[-_]?ed25519)?|\.npmrc|\.env(?:\.[a-z]+)?)$/i;

/**
 * A CONVENTIONAL TEMPLATE, never a real credential -- `.env.example`, `id_rsa.sample`, checked before
 * `KEY_FILENAME_RE` rather than folded into it, so the two rules stay independently readable. Verified
 * against this repository's own `.env.example` (early history, since removed): an empty value with no
 * secret content, which is exactly the shape this suffix exists to name.
 */
export const TEMPLATE_SUFFIX_RE = /\.(example|sample|template|dist)$/i;

/**
 * Every finding in one blob's text content, at one path. PURE -- given content and a path, no git call,
 * no filesystem, no network -- so this is what `history-secret-scan.test.ts` drives directly.
 * @param {string} content
 * @param {string} path
 * @returns {{ pattern: string, count: number, why: string, path: string }[]}
 */
export function scanBlob(content, path) {
  const findings = [];
  for (const [name, { pattern, why }] of Object.entries(PATTERNS)) {
    const matches = content.match(new RegExp(pattern, "g"));
    if (matches && matches.length > 0) findings.push({ pattern: name, count: matches.length, why, path });
  }
  if (KEY_FILENAME_RE.test(path) && !TEMPLATE_SUFFIX_RE.test(path)) {
    findings.push({ pattern: "keyFilename", count: 1,
      why: "filename shaped like a private key or credential file", path });
  }
  return findings;
}

/**
 * `git rev-list --objects --all` gives `<sha> <path>` for every blob reachable from every ref, and a bare
 * `<sha>` (no path) for every tree and commit -- filtered out here, since a scan needs a path to report.
 * @param {string} repoDir
 * @returns {Map<string, Set<string>>} blob sha -> every path it was ever committed at
 */
export function blobPaths(repoDir) {
  const out = execFileSync("git", ["rev-list", "--objects", "--all"],
    { cwd: repoDir, env: sandboxGitEnv(), encoding: "utf8", maxBuffer: 512 * 1024 * 1024 });
  /** @type {Map<string, Set<string>>} */
  const map = new Map();
  for (const line of out.split("\n")) {
    const space = line.indexOf(" ");
    if (space === -1) continue; // a tree or commit object, carrying no path
    const sha = line.slice(0, space);
    const path = line.slice(space + 1);
    if (!map.has(sha)) map.set(sha, new Set());
    map.get(sha)?.add(path);
  }
  return map;
}

/**
 * Streams every blob's content over ONE `git cat-file --batch` process, rather than one subprocess per
 * blob. The batch protocol is `<sha> <type> <size>\n<size bytes of content>\n` per object, which can
 * contain arbitrary bytes including embedded newlines -- so this parses the whole response as one Buffer
 * rather than line-by-line, which would corrupt on binary content.
 *
 * @param {string} repoDir
 * @param {string[]} shas
 * @returns {Promise<Map<string, string>>} blob sha -> its content, decoded as utf8 (lossy for binary
 *   blobs, which this scan does not need to read exactly -- a secret pattern inside a binary file is
 *   still findable in the readable-text portions that survive the decode)
 */
export function readBlobs(repoDir, shas) {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["cat-file", "--batch"],
      { cwd: repoDir, env: sandboxGitEnv(), stdio: ["pipe", "pipe", "pipe"] });
    /** @type {Buffer[]} */
    const chunks = [];
    let stderr = "";
    child.stdout.on("data", (/** @type {Buffer} */ d) => chunks.push(d));
    child.stderr.on("data", (/** @type {Buffer} */ d) => { stderr += d.toString("utf8"); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`git cat-file --batch exited ${code}: ${stderr}`));
        return;
      }
      const buf = Buffer.concat(chunks);
      /** @type {Map<string, string>} */
      const result = new Map();
      let offset = 0;
      while (offset < buf.length) {
        const headerEnd = buf.indexOf("\n", offset);
        if (headerEnd === -1) break;
        const header = buf.toString("utf8", offset, headerEnd);
        const parts = header.split(" ");
        if (parts[1] === "missing") { offset = headerEnd + 1; continue; }
        const [sha, , sizeStr] = parts;
        const size = Number(sizeStr);
        const contentStart = headerEnd + 1;
        const content = buf.toString("utf8", contentStart, contentStart + size);
        result.set(sha, content);
        offset = contentStart + size + 1; // +1 for the trailing newline after content
      }
      resolve(result);
    });
    child.stdin.write(shas.join("\n"));
    child.stdin.end();
  });
}

/**
 * The whole scan: every reachable blob, at every path it was ever committed under.
 * @param {string} repoDir
 * @returns {Promise<{ pattern: string, count: number, why: string, path: string }[]>}
 */
export async function scanHistory(repoDir) {
  const paths = blobPaths(repoDir);
  const shas = [...paths.keys()];
  const contents = await readBlobs(repoDir, shas);
  const findings = [];
  for (const [sha, pathSet] of paths) {
    const content = contents.get(sha);
    if (content === undefined) continue;
    for (const path of pathSet) findings.push(...scanBlob(content, path));
  }
  return findings;
}

/**
 * One line per finding, grouped by pattern, with a total count each -- never a bare "found something".
 * @param {{ pattern: string, count: number, why: string, path: string }[]} findings
 */
function report(findings) {
  if (findings.length === 0) {
    console.log("0 findings across every reachable blob and path. No internal address, key-shaped "
      + "filename or secret-shaped string was seen in this repository's history.");
    return;
  }
  /** @type {Map<string, typeof findings>} */
  const byPattern = new Map();
  for (const f of findings) {
    if (!byPattern.has(f.pattern)) byPattern.set(f.pattern, []);
    byPattern.get(f.pattern)?.push(f);
  }
  for (const [pattern, group] of byPattern) {
    const total = group.reduce((sum, f) => sum + f.count, 0);
    console.log(`\n${pattern}: ${total} match(es) across ${group.length} path(s) -- ${group[0].why}`);
    for (const f of group) console.log(`  ${f.count}  ${f.path}`);
  }
  console.log(`\n${findings.length} finding row(s) total. Counts are per (pattern, path); a path hit by`
    + " two patterns lists twice, once per pattern.");
}

if (import.meta.url === pathToFileURL(process.argv[1] ? realpathSync(process.argv[1]) : "").href) {
  refuseUnknownFlags(["--all", "--repo"], { entry: import.meta.url, command: "node scripts/history-secret-scan.mjs" });
  if (!process.argv.includes("--all")) {
    console.error("Usage: node scripts/history-secret-scan.mjs --all [--repo=<path>]\n"
      + "`--all` is required and not optional -- scanning only the current branch would silently miss\n"
      + "the branches with more instances of the defect than main has (measured: 72 vs 48).");
    process.exit(2);
  }
  const repoDir = flagValue(process.argv, "repo") ?? fileURLToPath(new URL("..", import.meta.url));
  const findings = await scanHistory(repoDir);
  report(findings);
  process.exit(findings.length > 0 ? 1 : 0);
}
