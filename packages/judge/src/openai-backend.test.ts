/**
 * REQUEST CONSTRUCTION and FAILURE HANDLING for `askOpenAICompatible`, over the same loopback-server
 * technique `judge-composition.test.ts` uses for the two ADR 0021 authority defects. Separate file
 * because `JUDGE_STRUCTURED` -- like `BACKEND` -- is a module-level constant read once at import, and
 * this file needs it at its DEFAULT ("on"), where `judge-composition.test.ts` deliberately turns it off.
 *
 * `anthropic-backend.test.ts` covers the identical failure/security shapes over the Anthropic streaming
 * transport; this file is the openai-compatible half plus the one thing only this backend has to get
 * right: the `response_format` JSON-schema payload constrained decoding depends on.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

type Responder = (req: IncomingMessage, res: ServerResponse, requestBody: unknown) => void;
let nextResponder: Responder;

const server = createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => nextResponder(req, res, JSON.parse(raw)));
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address() as AddressInfo;

process.env.JUDGE_BACKEND = "openai";
process.env.JUDGE_BASE_URL = `http://127.0.0.1:${port}/v1`;
process.env.OPENAI_API_KEY = "unused-loopback-key";
// JUDGE_STRUCTURED left at its default ("on"): this file exists specifically to prove the
// response_format payload that default sends.

const { judge } = await import("./judge.js");

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

function chatCompletion(content: string): unknown {
  return { choices: [{ message: { content } }] };
}

let call = 0;

test("STRUCTURED=on (the default): both requests carry a response_format matching the schema they claim, and the prompt reaches the wire", async () => {
  call = 0;
  const seenBodies: Record<string, unknown>[] = [];
  nextResponder = (_req, res, body) => {
    call++;
    seenBodies.push(body as Record<string, unknown>);
    res.writeHead(200, { "content-type": "application/json" });
    const payload = call === 1 ? { issues: [] } : {
      taskCompletable: true, summary: "Summary.", findings: [], confidence: 0.5,
    };
    res.end(JSON.stringify(chatCompletion(JSON.stringify(payload))));
  };
  await judge(INPUT);
  assert.equal(seenBodies.length, 2, "one recall call, one verify call");

  const [recallBody, verifyBody] = seenBodies as unknown as {
    model: string; messages: { role: string; content: string }[];
    response_format?: { type: string; json_schema: { name: string; strict: boolean; schema: { required: string[] } } };
  }[];

  for (const body of [recallBody, verifyBody]) {
    assert.equal(typeof body.model, "string", "the model name must be sent, not omitted");
    assert.ok(body.messages?.[0]?.content?.length, "the prompt must actually be in the request body");
  }
  assert.equal(recallBody.response_format?.json_schema.name, "recall");
  assert.deepEqual(recallBody.response_format?.json_schema.schema.required, ["issues"]);
  assert.equal(verifyBody.response_format?.json_schema.name, "verify");
  assert.deepEqual(verifyBody.response_format?.json_schema.schema.required,
    ["taskCompletable", "summary", "findings", "confidence"]);

  // The task the capture describes must actually reach the model -- a prompt bug that dropped it would
  // still "work" (return valid JSON) and nothing else here would notice.
  assert.match(verifyBody.messages[0].content, /find the contact page/);
  assert.match(verifyBody.messages[0].content, /heading, level 1, Home/);
});

test("a 429 from the provider is a clean rejection naming the status, not a finding and not a stack trace", async () => {
  call = 0;
  nextResponder = (_req, res) => {
    call++;
    if (call === 1) { res.writeHead(200); res.end(JSON.stringify(chatCompletion(JSON.stringify({ issues: [] })))); return; }
    res.writeHead(429, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { message: "rate limit exceeded" } }));
  };
  await assert.rejects(() => judge(INPUT), (err: Error) => {
    assert.match(err.message, /429/, "the status code must be in the message, so the cause is findable");
    return true;
  }, "a rate-limit response must reject judge(), never resolve with a finding built from no data");
});

test("a truncated/non-JSON verify response names the stage and backend, not a raw JSON.parse crash", async () => {
  call = 0;
  nextResponder = (_req, res) => {
    call++;
    if (call === 1) { res.writeHead(200); res.end(JSON.stringify(chatCompletion(JSON.stringify({ issues: [] })))); return; }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(chatCompletion("{ this is not valid json, cut off mid")));
  };
  await assert.rejects(() => judge(INPUT), (err: Error) => {
    assert.match(err.message, /judge verify stage \(openai\) did not return valid JSON/,
      "the message must name the STAGE and the BACKEND -- a bare V8 SyntaxError names neither");
    assert.ok(err.cause instanceof Error, "the original parse error must survive as `cause`, not be discarded");
    return true;
  });
});
