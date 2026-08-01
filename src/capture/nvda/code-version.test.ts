// The worker's code hash is computed twice — once on the guest (server.mjs) and once on the host
// (check-worker-code.mjs) — and the two lists must be identical or the comparison is meaningless.
//
// They are kept in step by a comment saying "must match server.mjs codeVersion() exactly". That held
// until a new worker file was added and only one list learned about it: the deploy check then reported
// a worker as up to date while it was running a different version of that file. This test is what the
// comment was hoping for.
//
// It parses the two sources rather than importing them: server.mjs binds a port on import, and
// check-worker-code.mjs runs its check on import. Neither can be loaded just to read a constant.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const HASHED_FILES = /for \(const file of \[([^\]]+)\]\)/;

function hashedFileList(path: string): string[] {
  const source = readFileSync(resolve(process.cwd(), path), "utf8");
  const match = HASHED_FILES.exec(source);
  assert.ok(match, `no code-hash file list found in ${path}`);
  return match[1].split(",").map((name) => name.trim().replace(/^["']|["']$/g, ""));
}

test("the guest and the host hash exactly the same worker files, in the same order", () => {
  const guest = hashedFileList("src/capture/nvda/server.mjs");
  const host = hashedFileList("scripts/check-worker-code.mjs");
  assert.deepEqual(guest, host,
    "server.mjs and check-worker-code.mjs disagree about which files make up the worker's code " +
    "version. A file in only one list deploys without the parity check noticing.");
});

test("the hash covers every worker source file the guest runs", () => {
  // A new .mjs under src/capture/nvda that the worker runs but nobody hashes is invisible to
  // `npm run worker:code` — the only check that a deploy actually landed. It must follow imports
  // TRANSITIVELY: capture-faults.mjs is imported by capture-core, not by server.mjs, so a check that
  // only looked at server.mjs's own imports would have missed it and reported a stale guest as fresh.
  const hashed = new Set(hashedFileList("src/capture/nvda/server.mjs"));
  const seen = new Set<string>();
  const queue = ["server.mjs"];
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const source = readFileSync(resolve(process.cwd(), "src/capture/nvda", file), "utf8");
    for (const [, imported] of source.matchAll(/from "\.\/([\w-]+\.mjs)"/g)) {
      assert.ok(hashed.has(imported), `${file} imports ${imported} but it is not in the code-version hash`);
      queue.push(imported);
    }
  }
});
