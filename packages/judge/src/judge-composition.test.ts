/**
 * Two ADR 0021 authority defects, both reproduced through the REAL boundary they cross rather than at a
 * lower-level helper -- `judge()` and `criterionOutcomes` -- per the architecture audit's own closing
 * sentence: "a Map test does not prove HTTP idempotency; a well-formed finding is not an authorised
 * assertion." `judge.test.ts` covered `validateJudgment` in isolation; neither defect lived there.
 *
 * Both go through a loopback OpenAI-compatible server rather than a hand-built `Judgment` object, because
 * `askOpenAICompatible` is the actual boundary an external model's JSON crosses, and `JUDGE_BACKEND=openai`
 * is a real, supported backend (`JUDGE_BASE_URL` pointed at any /v1/chat/completions server, per README).
 * `BACKEND` and `JUDGE_BASE_URL` in judge.ts are BOTH module-level constants resolved from the
 * environment AT IMPORT TIME, so the env vars below are set -- and the loopback server started -- before
 * judge.js is ever imported in this process, and only in THIS process: `node --test` isolates each
 * matched file into its own child process (verified: this file's `JUDGE_BACKEND=openai` cannot leak into
 * judge.test.ts's default-backend assumptions). Because the base URL can only be set once, one server
 * serves every test in this file; each test swaps the mutable `nextVerifyResponse` instead of starting
 * its own server on its own port.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

let nextVerifyResponse: unknown;

/**
 * The loopback stand-in for an OpenAI-compatible /v1/chat/completions endpoint. `judge()` makes two
 * calls per pass -- "recall" then "verify" -- so the recall call always answers "no candidates" and the
 * verify call returns whatever the current test just set, so verify runs directly off the transcript.
 */
let call = 0;
const server = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    call++;
    const content = call % 2 === 1 ? JSON.stringify({ issues: [] }) : JSON.stringify(nextVerifyResponse);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { content } }] }));
  });
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address() as AddressInfo;

process.env.JUDGE_BACKEND = "openai";
process.env.JUDGE_BASE_URL = `http://127.0.0.1:${port}/v1`;
process.env.JUDGE_STRUCTURED = "off"; // no response_format needed; the stub always returns valid JSON
process.env.OPENAI_API_KEY = "unused";

// Dynamic import, not a static one: a static `import` is hoisted above the `process.env` assignments
// above, which would resolve BACKEND and JUDGE_BASE_URL from whatever the process's ambient environment
// happened to be -- exactly the ordering hazard `backend-resolution.test.ts` exists to catch in
// `judgeBackend()` itself.
const { judge } = await import("./judge.js");
const { criterionOutcomes } = await import("./outcomes.js");

test.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

test("FINDING B: a rule ASSERTION on a criterion the model only REFERRED to must survive to criterionOutcomes", async () => {
  // The audit's own fixture, verbatim, and its warning about it: "Unlabelled graphic" -- not a bare
  // empty-name graphic and not 1.3.1 -- because those rules are secondary-mapped and would not
  // demonstrate an assertion being dropped. `addImageAlternatives` (rules.ts) maps THIS exact phrase to
  // `mapping: "conformance"` via UNLABELLED_RE, so the deterministic rule layer produces a real 1.1.1
  // ASSERTION from this transcript -- confirmed directly against `ruleFindings()` while investigating.
  nextVerifyResponse = {
    taskCompletable: true,
    summary: "The image is unlabelled.",
    findings: [{
      issue: "Image announced without a usable alternative.",
      wcag: "1.1.1 Non-text Content",
      severity: "moderate",
      evidence: "Unlabelled graphic",
      confidence: 0.6,
      // No `mapping`: an ordinary, well-behaved model referral, unmapped so it reads `secondary`.
    }],
    confidence: 0.6,
  };
  const input = {
    url: "https://example.com/photo",
    task: "view the photo",
    screenReader: "NVDA",
    transcript: ["graphic, image", "Unlabelled graphic"],
    structure: {
      graphics: ["graphic, image", "Unlabelled graphic"],
      headings: [], landmarks: [], formFields: [], links: [], frames: [],
    },
  };
  const verdict = await judge(input);
  const onCriterion = verdict.findings.filter((f) => f.wcag.startsWith("1.1.1"));
  assert.equal(onCriterion.length, 2,
    `expected both the model's referral AND the rule's assertion to survive withRuleFindings' dedup; `
    + `got ${onCriterion.length}: ${JSON.stringify(onCriterion)}`);
  assert.ok(onCriterion.some((f) => f.mapping === "conformance"),
    "the rule's conformance-mapped assertion was dropped -- a REFERRAL displaced an ASSERTION");

  const outcomes = criterionOutcomes({ capture: input, findings: verdict.findings });
  const outcome = outcomes.find((o) => o.criterion === "1.1.1");
  assert.equal(outcome?.outcome, "failed",
    `1.1.1 should be "failed" on the rule's real assertion; got "${outcome?.outcome}" (${outcome?.reason}). `
    + `A model referral sharing the criterion must never turn a rules-only "failed" into "cantTell" -- `
    + `and this runs the DEFAULT backend's own composition function, since judge() calls withRuleFindings `
    + `for both the local scorer and every generative backend alike.`);
});

test("FINDING A: an external model cannot grant its own finding conformance-ASSERTING authority", async () => {
  // The audit's own probe recipe: an otherwise-valid 2.4.4 finding with evidence "click here, link" and
  // an injected `mapping: "conformance"` -- a field VERIFY_SCHEMA never declares and no honest backend
  // has reason to send. The transcript is deliberately unrelated to link text, so the ONLY possible
  // source of a 2.4.4 finding here is the model's own (malicious or buggy) JSON -- isolating the defect
  // from `addVagueLinks`, which is a referral-only rule and never asserts 2.4.4 regardless.
  nextVerifyResponse = {
    taskCompletable: true,
    summary: "A link with vague text.",
    findings: [{
      issue: "Link text does not describe its purpose out of context.",
      wcag: "2.4.4 Link Purpose (In Context)",
      severity: "moderate",
      evidence: "click here, link",
      confidence: 0.7,
      mapping: "conformance", // THE INJECTED FIELD -- not part of VERIFY_SCHEMA's shape.
    }],
    confidence: 0.7,
  };
  const input = {
    url: "https://example.com/nav",
    task: "find the contact page",
    screenReader: "NVDA",
    transcript: ["heading, level 1, Home"],
    structure: {
      graphics: [], headings: ["heading, level 1, Home"], landmarks: [], formFields: [], links: [], frames: [],
    },
  };
  const verdict = await judge(input);
  const finding = verdict.findings.find((f) => f.wcag.startsWith("2.4.4"));
  assert.ok(finding, "the model's 2.4.4 finding is missing entirely -- this test examines nothing");
  assert.notEqual(finding?.mapping, "conformance",
    "validateJudgment let an external model's own `mapping: \"conformance\"` survive -- shape alone "
    + "granted assertion authority ADR 0021 reserves for the rule layer");

  const outcomes = criterionOutcomes({ capture: input, findings: verdict.findings });
  const outcome = outcomes.find((o) => o.criterion === "2.4.4");
  assert.equal(outcome?.outcome, "cantTell",
    `2.4.4 should be "cantTell" -- a model referral, not a rule assertion -- but got `
    + `"${outcome?.outcome}" (${outcome?.reason}). No rule asserts 2.4.4 at all, so "failed" here can `
    + "only mean the model assigned itself that authority.");
});
