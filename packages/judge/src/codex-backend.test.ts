/**
 * `askCodex`/`runCodex` REPRODUCED THROUGH THE REAL BOUNDARY: a subprocess actually named `codex` on
 * `PATH`, invoked exactly the way `runCodex`'s own command line does, rather than a hand-built
 * `Judgment` or a mocked `child_process`. This is Codex's own default backend and the one CLAUDE.md
 * names as needing no API key, so it is the one most likely to run unattended -- and, before this file,
 * the one with no test of any kind.
 *
 * The fake `codex` is a real executable, in a directory prepended to `PATH` for one spawned subprocess
 * only (this test's own `PATH` is restored after every `judge()` call, and nothing outside this process
 * sees the fake binary). It has no state of its own between invocations -- each `codex exec` is a fresh
 * process -- so call count and the verify-stage answer are handed to it through two files in a scratch
 * directory the test controls, the same shape `judge()` itself uses when talking to a real Codex CLI.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, chmodSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BIN_DIR = mkdtempSync(join(tmpdir(), "fake-codex-bin-"));
const STATE_DIR = mkdtempSync(join(tmpdir(), "fake-codex-state-"));

// $1 is "exec", $2 is the prompt text (runCodex passes it as one shell-quoted argument via `$(cat ...)`).
// Odd calls (1st, 3rd, ...) are the RECALL stage and answer "no candidates"; even calls are VERIFY and
// answer from verify-response.json, which each test overwrites before calling judge(). Two independent
// failure markers let a test fail exactly the stage it means to: fail-on-odd/fail-on-even, each
// self-clearing after firing once, so a test can fail one call and let the retry (if any) succeed.
writeFileSync(join(BIN_DIR, "codex"), `#!/bin/bash
echo "$2" >> "${STATE_DIR}/prompts.log"
echo "---" >> "${STATE_DIR}/prompts.log"
count_file="${STATE_DIR}/call-count"
count=$(( $(cat "$count_file" 2>/dev/null || echo 0) + 1 ))
echo "$count" > "$count_file"
parity="even"; [ $(( count % 2 )) -eq 1 ] && parity="odd"
marker="${STATE_DIR}/fail-on-\${parity}"
if [ -f "$marker" ]; then
  rm -f "$marker"
  cat "${STATE_DIR}/fail-message" >&2
  exit 1
fi
if [ "$parity" = "odd" ]; then
  echo '{"issues":[]}'
else
  cat "${STATE_DIR}/verify-response.json"
fi
`, { mode: 0o755 });
chmodSync(join(BIN_DIR, "codex"), 0o755);

process.env.JUDGE_BACKEND = "codex";
process.env.PATH = `${BIN_DIR}:${process.env.PATH}`;

const { judge } = await import("./judge.js");
const { criterionOutcomes } = await import("./outcomes.js");

test.after(() => {
  rmSync(BIN_DIR, { recursive: true, force: true });
  rmSync(STATE_DIR, { recursive: true, force: true });
});

const INPUT = {
  url: "https://example.com/nav",
  task: "find the contact page",
  screenReader: "NVDA",
  transcript: ["heading, level 1, Home"],
  structure: {
    graphics: [], headings: ["heading, level 1, Home"], landmarks: [], formFields: [], links: [], frames: [],
  },
};

function setVerifyResponse(judgment: unknown): void {
  writeFileSync(join(STATE_DIR, "verify-response.json"), JSON.stringify(judgment));
}
function resetCallCount(): void {
  rmSync(join(STATE_DIR, "call-count"), { force: true });
  rmSync(join(STATE_DIR, "prompts.log"), { force: true });
}

test("a well-formed Codex response reaches judge() as a real finding, and the prompt actually reached the subprocess", async () => {
  resetCallCount();
  setVerifyResponse({
    taskCompletable: true, summary: "Summary.", confidence: 0.6,
    findings: [{
      issue: "The heading names the wrong content.", wcag: "2.4.6 Headings and Labels",
      severity: "minor", evidence: "heading, level 1, Home", confidence: 0.6,
    }],
  });
  const verdict = await judge(INPUT);
  assert.ok(verdict.findings.some((f) => f.wcag.startsWith("2.4.6")));
  const prompts = readFileSync(join(STATE_DIR, "prompts.log"), "utf8");
  assert.match(prompts, /find the contact page/, "the task must actually reach the codex subprocess");
  assert.match(prompts, /heading, level 1, Home/, "the transcript must actually reach the codex subprocess");
});

test("SECURITY: an injected mapping over the Codex transport is stripped exactly as it is for openai and anthropic", async () => {
  resetCallCount();
  setVerifyResponse({
    taskCompletable: true, summary: "A link with vague text.", confidence: 0.7,
    findings: [{
      issue: "Link text does not describe its purpose out of context.",
      wcag: "2.4.4 Link Purpose (In Context)", severity: "moderate", evidence: "click here, link",
      confidence: 0.7, mapping: "conformance", // THE INJECTED FIELD, over the THIRD transport.
    }],
  });
  const verdict = await judge(INPUT);
  const finding = verdict.findings.find((f) => f.wcag.startsWith("2.4.4"));
  assert.ok(finding, "the model's 2.4.4 finding is missing entirely -- this test examines nothing");
  assert.notEqual(finding?.mapping, "conformance");
  const outcomes = criterionOutcomes({ capture: INPUT, findings: verdict.findings });
  assert.equal(outcomes.find((o) => o.criterion === "2.4.4")?.outcome, "cantTell");
});

test("codex failing the RECALL stage is tolerated -- judgeOnce falls back to auditing the transcript directly", async () => {
  resetCallCount();
  setVerifyResponse({ taskCompletable: true, summary: "Summary.", findings: [], confidence: 0.5 });
  writeFileSync(join(STATE_DIR, "fail-on-odd"), ""); // fails call 1 (recall) only; call 2 (verify) still runs
  writeFileSync(join(STATE_DIR, "fail-message"), "codex: transient recall failure\n");
  await assert.doesNotReject(() => judge(INPUT),
    "a failed recall pass must not be fatal -- verify runs directly off the transcript regardless");
  assert.ok(!existsSync(join(STATE_DIR, "fail-on-odd")), "the marker must have been consumed, proving the failing call actually ran");
});

test("codex failing the VERIFY stage is a clean rejection naming the exit code, not a finding and not a bare stack trace", async () => {
  resetCallCount();
  writeFileSync(join(STATE_DIR, "fail-on-even"), ""); // fails call 2 (verify), which has no fallback
  writeFileSync(join(STATE_DIR, "fail-message"), "codex: no active login session\n");
  await assert.rejects(() => judge(INPUT), (err: Error) => {
    assert.match(err.message, /codex exec exited with code 1/,
      "the exit code must be in the message, so a login/auth failure is distinguishable from a hang or a crash");
    return true;
  }, "a failed verify pass must reject judge(), never resolve with a finding built from no data");
});
