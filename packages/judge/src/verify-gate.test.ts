/**
 * `@huggingface/transformers` IS OPTIONAL, AND ITS ABSENCE MUST NOT BE A BARE MODULE-NOT-FOUND.
 *
 * `ENABLED` is read once at module load from `JUDGE_GATE`/`GATE_MODEL_PATH`, so the enabled path can only
 * be exercised in a fresh process -- these tests spawn one against the BUILT `dist/internal.js` (a plain
 * subprocess needs no `tsx`, and this package's own `prepack`/`prepare` already keep `dist` current).
 *
 * Reproduced from a real tarball install (architecture-audit.md §4.5, §3.5): `@huggingface/transformers`
 * was declared in no manifest, so a consumer who followed the header comment's own instruction --
 * `JUDGE_GATE=on GATE_MODEL_PATH=... npm run eval` -- without also running `npm install
 * @huggingface/transformers` got `Cannot find package '@huggingface/transformers'` out of `judge.ts:642`,
 * which has no catch around `applyGate`, so the WHOLE `judge()` call died rather than just the gate.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const INTERNAL_JS = pathToFileURL(resolve(HERE, "../dist/internal.js")).href;

function runProbe(env: Record<string, string>): string {
  const script = `
    import { applyGate } from ${JSON.stringify(INTERNAL_JS)};
    try {
      await applyGate([{ wcag: "2.4.4", issue: "x", evidence: "click here", severity: "moderate", confidence: 0.5 }]);
      console.log("RESOLVED");
    } catch (e) {
      console.log("REJECTED: " + e.message);
    }
  `;
  return execFileSync("node", ["--input-type=module", "-e", script], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  }).trim();
}

test("the gate disabled (the default) is a no-op, with no import attempted at all", () => {
  const output = runProbe({ JUDGE_GATE: "", GATE_MODEL_PATH: "" });
  assert.equal(output, "RESOLVED", "a disabled gate must never even try to load transformers.js");
});

test("JUDGE_GATE=on without @huggingface/transformers installed names the fix, not a raw resolution error", () => {
  // /dev/null/not-a-model: guaranteed absent, and irrelevant here -- the import fails before this path is
  // ever read.
  const output = runProbe({ JUDGE_GATE: "on", GATE_MODEL_PATH: "/dev/null/not-a-model" });
  assert.match(output, /^REJECTED:/, "an unmet optional dependency must reject cleanly, not crash the process");
  assert.match(output, /npm install @huggingface\/transformers/,
    "the message must name the exact fix -- this is what the docstring above `getClassifier` promises "
    + "and what architecture-audit.md's reproduction found missing");
  assert.doesNotMatch(output, /Cannot find package/,
    "the raw ERR_MODULE_NOT_FOUND text must not reach the caller unwrapped");
});
