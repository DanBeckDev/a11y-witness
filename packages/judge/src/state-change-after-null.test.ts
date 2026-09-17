/**
 * #1616: the judge's prompt must not print a FAILED re-read (`after: null`, `error` set) as `-> "null"`, which the model
 * would read as something the screen reader said.
 *
 * Driven through the real exported `judge()` over the Anthropic transport, with a loopback server standing in for the
 * provider -- the seam `anthropic-backend.test.ts` already uses, so no export was added for this test. The env vars are
 * set before `judge.js` is imported, because `BACKEND` is resolved at import time.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

const bodies: string[] = [];
let call = 0;
const sseEvent = (type: string, data: unknown): string => `event: ${type}\ndata: ${JSON.stringify({ type, ...(data as object) })}\n\n`;
const server = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    bodies.push(body);
    call++;
    // recall (odd calls) answers "no candidates"; verify (even calls) answers an empty judgment.
    const text = JSON.stringify(call % 2 === 1 ? { issues: [] } : { taskCompletable: true, summary: "Summary.", findings: [], confidence: 0.7 });
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write(sseEvent("message_start", { message: { id: "msg_test", type: "message", role: "assistant", content: [], model: "claude-test", stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } } }));
    res.write(sseEvent("content_block_start", { index: 0, content_block: { type: "text", text: "", citations: null } }));
    res.write(sseEvent("content_block_delta", { index: 0, delta: { type: "text_delta", text } }));
    res.write(sseEvent("content_block_stop", { index: 0 }));
    res.write(sseEvent("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 1 } }));
    res.write(sseEvent("message_stop", {}));
    res.end();
  });
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
process.env.JUDGE_BACKEND = "anthropic";
process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
process.env.ANTHROPIC_API_KEY = "unused-loopback-key";
const { judge } = await import("./judge.js");
test.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

/** Every text the judge sent the provider, from the recorded request bodies. */
const promptsSent = (): string[] => bodies.flatMap((b) => {
  const parsed = JSON.parse(b) as { system?: unknown; messages?: { content: unknown }[] };
  const texts = (value: unknown): string[] => typeof value === "string" ? [value]
    : Array.isArray(value) ? value.flatMap((v) => texts((v as { text?: unknown }).text ?? v)) : [];
  return [...texts(parsed.system), ...(parsed.messages ?? []).flatMap((m) => texts(m.content))];
});

test("#1616 an errored state change is not printed into the judge's prompt as \"null\"", async () => {
  bodies.length = 0; call = 0;
  await judge({
    url: "https://example.com/faq", task: "open the delivery options", screenReader: "NVDA", transcript: ["heading, level 1, FAQ"],
    interaction: {
      controls: ["Delivery options, button, collapsed", "FAQ, button, collapsed"],
      stateChanges: [
        { control: "Delivery options, button, collapsed", after: null, afterSource: "focus", error: "reportFocus timed out after 6000ms" },
        { control: "FAQ, button, collapsed", after: "FAQ, button, expanded", afterSource: "focus" },
      ],
      formChanges: [], postSubmitFields: [],
    },
  } as Parameters<typeof judge>[0]);
  const prompts = promptsSent();
  assert.ok(prompts.length >= 2, `the population: the recall and verify prompts were recorded (got ${prompts.length})`);
  for (const prompt of prompts) {
    assert.doesNotMatch(prompt, /-> "null"/, "a failed re-read reached the prompt as the word null");
    assert.doesNotMatch(prompt, /"Delivery options, button, collapsed" -> /, "the errored pair is in the prompt at all");
  }
  // The control: the measured pair still reaches every prompt.
  assert.ok(prompts.every((p) => p.includes('"FAQ, button, collapsed" -> "FAQ, button, expanded"')), "the measured pair no longer reaches the prompt");
});
