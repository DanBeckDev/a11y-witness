/**
 * `askAnthropic` REPRODUCED THROUGH THE REAL BOUNDARY, the same way `judge-composition.test.ts` already
 * does for the `openai` backend -- a loopback server standing in for the provider, never a hand-built
 * `Judgment` object standing in for what crosses the wire.
 *
 * The Anthropic SDK reads `ANTHROPIC_BASE_URL` from the environment when no explicit `baseURL` is passed
 * (`new Anthropic()` in `askAnthropic`, unchanged), so no source change was needed to make this
 * redirectable -- only the request/response bodies below had to be constructed to match Anthropic's own
 * documented streaming Messages API shape (`RawMessageStreamEvent`, `resources/messages/messages.d.ts`
 * in the installed SDK), since `askAnthropic` calls `client.messages.stream(...)`.
 *
 * `BACKEND`, `JUDGE_MODEL` are module-level constants resolved from the environment AT IMPORT TIME
 * (same hazard `judge-composition.test.ts`'s own header names), so the env vars are set and the loopback
 * server is listening before `judge.js` is ever imported in this process -- and `node --test` isolates
 * each matched file into its own child process, so this cannot leak `JUDGE_BACKEND=anthropic` into any
 * other test file's default-backend assumptions.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

type Responder = (req: IncomingMessage, res: ServerResponse, body: string) => void;
let nextResponder: Responder;

/** One SSE "event: <type>\ndata: <json>\n\n" frame, Anthropic's own wire shape. */
function sseEvent(type: string, data: unknown): string {
  return `event: ${type}\ndata: ${JSON.stringify({ type, ...(data as object) })}\n\n`;
}

/** A minimal, real, successful Anthropic stream: one text content block, start to stop. */
function streamTextResponse(res: ServerResponse, text: string): void {
  res.writeHead(200, { "content-type": "text/event-stream" });
  res.write(sseEvent("message_start", {
    message: {
      id: "msg_test", type: "message", role: "assistant", content: [], model: "claude-test",
      stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 },
    },
  }));
  res.write(sseEvent("content_block_start", { index: 0, content_block: { type: "text", text: "", citations: null } }));
  res.write(sseEvent("content_block_delta", { index: 0, delta: { type: "text_delta", text } }));
  res.write(sseEvent("content_block_stop", { index: 0 }));
  res.write(sseEvent("message_delta", {
    delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 1 },
  }));
  res.write(sseEvent("message_stop", {}));
  res.end();
}

const server = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => nextResponder(req, res, body));
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address() as AddressInfo;

process.env.JUDGE_BACKEND = "anthropic";
process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${port}`;
process.env.ANTHROPIC_API_KEY = "unused-loopback-key";

// Dynamic import, not a static one -- for the identical reason judge-composition.test.ts's header gives:
// a static `import` is hoisted above the `process.env` assignments and would resolve `BACKEND` from
// whatever the process's ambient environment happened to be.
const { judge } = await import("./judge.js");
const { criterionOutcomes } = await import("./outcomes.js");

test.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

const INPUT = {
  url: "https://example.com/nav",
  task: "find the contact page",
  screenReader: "NVDA",
  transcript: ["heading, level 1, Home"],
  structure: {
    graphics: [], headings: ["heading, level 1, Home"], landmarks: [], formFields: [], links: [], frames: [],
  },
};

let call = 0;
function judgment(findings: unknown[]): unknown {
  return { taskCompletable: true, summary: "Summary.", findings, confidence: 0.7 };
}

test("a well-formed Anthropic response reaches judge() as a real finding", async () => {
  call = 0;
  nextResponder = (_req, res) => {
    call++;
    // recall (odd calls) always answers "no candidates"; verify (even calls) answers the judgment.
    const payload = call % 2 === 1 ? { issues: [] } : judgment([{
      issue: "The heading names the wrong content.", wcag: "2.4.6 Headings and Labels",
      severity: "minor", evidence: "heading, level 1, Home", confidence: 0.6,
    }]);
    streamTextResponse(res, JSON.stringify(payload));
  };
  const verdict = await judge(INPUT);
  assert.ok(verdict.findings.some((f) => f.wcag.startsWith("2.4.6")),
    "a well-formed streamed response must produce the finding it described");
});

test("SECURITY: an injected mapping over the Anthropic transport is stripped exactly as it is for openai", async () => {
  call = 0;
  nextResponder = (_req, res) => {
    call++;
    const payload = call % 2 === 1 ? { issues: [] } : judgment([{
      issue: "Link text does not describe its purpose out of context.",
      wcag: "2.4.4 Link Purpose (In Context)", severity: "moderate", evidence: "click here, link",
      confidence: 0.7, mapping: "conformance", // THE INJECTED FIELD, over a DIFFERENT transport.
    }]);
    streamTextResponse(res, JSON.stringify(payload));
  };
  const verdict = await judge(INPUT);
  const finding = verdict.findings.find((f) => f.wcag.startsWith("2.4.4"));
  assert.ok(finding, "the model's 2.4.4 finding is missing entirely -- this test examines nothing");
  assert.notEqual(finding?.mapping, "conformance",
    "validateJudgment must strip an injected mapping regardless of WHICH transport the JSON arrived over");
  const outcomes = criterionOutcomes({ capture: INPUT, findings: verdict.findings });
  assert.equal(outcomes.find((o) => o.criterion === "2.4.4")?.outcome, "cantTell",
    "an Anthropic-sourced referral must not read as an authorised assertion, same as the openai case");
});

test("a 401 from the provider is a clean rejection, not a finding and not a stack trace", async () => {
  call = 0;
  nextResponder = (_req, res) => {
    call++;
    if (call === 1) { streamTextResponse(res, JSON.stringify({ issues: [] })); return; }
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }));
  };
  await assert.rejects(() => judge(INPUT), (err: Error) => {
    assert.doesNotMatch(err.message, /^\s*$/, "the rejection must carry a real message");
    return true;
  }, "an authentication failure must reject judge(), never resolve with a finding built from no data");
});

test("a truncated/non-JSON verify response is a named failure, not a raw JSON.parse crash", async () => {
  call = 0;
  nextResponder = (_req, res) => {
    call++;
    if (call === 1) { streamTextResponse(res, JSON.stringify({ issues: [] })); return; }
    streamTextResponse(res, "{ this is not valid json, the stream was cut off"); // truncated on purpose
  };
  await assert.rejects(() => judge(INPUT), (err: Error) => {
    assert.match(err.message, /judge verify stage \(anthropic\) did not return valid JSON/,
      "the message must name the STAGE and the BACKEND -- a bare V8 JSON.parse message names neither");
    assert.ok(err.cause instanceof Error, "the original parse error must survive as `cause`, not be discarded");
    return true;
  });
});
