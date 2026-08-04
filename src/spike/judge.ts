import { spawn } from "node:child_process";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WCAG_22_AA } from "../wcag/criteria.js";
import { judgeLocally } from "./local-judge.js";
import { ruleFindings } from "./rules.js";
import { applyGate } from "./verify-gate.js";

/**
 * Which judge to use. **The default is `local`: this project's OWN trained scorer.**
 *
 * It used to default to `codex`, and that was wrong in a way that quietly undermined every gate. The
 * whole point of training a screen-reader scorer was to stop renting an LLM's opinion, and the GitHub
 * Action already shipped `judge-backend: local` — but `npm run eval` and `npm run eval:gate` inherited
 * this default, so **judge quality was measured on a rented model and never once on ours**. A gate that
 * does not exercise what ships is not a gate.
 *
 * Flipping it also changed what those gates report, and the changes were real defects rather than noise:
 * running the fixtures through our own model found a starved-model false-positive storm on seven
 * conformant fixtures, and a crash on an out-of-scope capture. Both were invisible to `codex`, which only
 * ever reads the transcript.
 *
 * The other backends stay available and are never the default. They are for comparison and research —
 * `codex` uses a local subscription login (no metered cost), `anthropic` and `openai` need the caller's
 * own key. The backend is one clean seam: evidence in, findings out.
 */
const BACKEND = (process.env.JUDGE_BACKEND ?? "local").toLowerCase();
const JUDGE_MODEL = process.env.JUDGE_MODEL ?? "claude-opus-4-8";
// OpenAI-compatible backend (JUDGE_BACKEND=openai): works against hosted OpenAI
// or any local server that speaks /v1/chat/completions (llama.cpp, vLLM, Ollama,
// LM Studio). JUDGE_BASE_URL points at the endpoint; OPENAI_API_KEY is optional
// (local servers usually ignore it).
const JUDGE_BASE_URL = (process.env.JUDGE_BASE_URL ?? "https://api.openai.com/v1").replace(/\/+$/, "");
const JUDGE_MAX_TOKENS = Number(process.env.JUDGE_MAX_TOKENS ?? 8000);
// Constrained decoding: when on (default), the openai backend sends a JSON
// schema as response_format so the server grammar-constrains output to valid,
// correctly-shaped JSON. This eliminates the malformed/empty-JSON failures small
// local models otherwise produce. Object-root schemas only: local servers
// (Ollama) reliably constrain an object schema but return empty for an array
// root, so recall returns {issues:[...]} rather than a bare array. Set
// JUDGE_STRUCTURED=off if a server rejects response_format.
const STRUCTURED = (process.env.JUDGE_STRUCTURED ?? "on").toLowerCase() !== "off";

// Reasoning effort and timeout are configurable; defaults keep the judge fast
// and bounded.
const REASONING = process.env.JUDGE_REASONING ?? "medium";
const TIMEOUT_MS = Number(process.env.JUDGE_TIMEOUT_MS ?? 120_000);
// Consensus: judge N times and keep only findings that recur in a majority of
// runs. Real findings are stable across runs; speculative noise is not, so this
// trades N x the cost for higher precision. Default 1 (no consensus).
const CONSENSUS = Math.max(1, Number(process.env.JUDGE_CONSENSUS ?? 1));

export type Severity = "blocker" | "serious" | "moderate" | "minor";

export interface JudgeInput {
  url: string;
  task: string;
  screenReader: string;
  /** Ordered log of what the screen reader announced as it navigated, plus any events. */
  transcript: string[];
  /** Optional structural navigation passes (skim by element type). An empty list
   * for a type means the page exposes none of it, even if it looks like it does. */
  structure?: { headings: string[]; landmarks: string[]; formFields: string[]; links?: string[] };
  /**
   * What the PAGE exposes, from the accessibility tree — an oracle for the deterministic rules only, never
   * shown to the model (`docs/local-model.md` bars the tree as a model feature).
   */
  census?: { heading?: number; link?: number };
  /** Optional interaction pass: how each interactive control is announced (found
   * via quick-nav), the announced state after activating disclosures, and what
   * was announced after submitting a form with no valid input. */
  interaction?: {
    controls: string[];
    stateChanges: { control: string; after: string }[];
    formChanges?: { control: string; after: string }[];
    /** Form fields re-read after a submit: an accessible form marks the invalid
     * field (aria-invalid + an associated error), an inaccessible one does not. */
    postSubmitFields?: string[];
  };
}

export interface Finding {
  issue: string;
  wcag: string; // e.g. "1.3.1 Info and Relationships"
  severity: Severity;
  evidence: string; // the announced text that shows the problem
  confidence: number; // 0 to 1
}

export interface Judgment {
  taskCompletable: boolean;
  summary: string;
  findings: Finding[];
  confidence: number;
}

interface Candidate {
  issue: string;
  evidence: string;
}

// Stage 1 — RECALL. Find everything; ignore the task; over-include on purpose.
// Decoupling the audit from "could the user finish the task" is what stops a
// completable page from suppressing its own real findings.
const RECALL_INSTRUCTIONS = `You are auditing a screen-reader transcript: the ordered list of what a screen reader actually announced while reading a web page in browse mode.

Your ONLY job here is RECALL. List EVERY potential accessibility problem you can find. Work through the transcript line by line. Be exhaustive and over-inclusive: a later step verifies and filters, so it is better to include a borderline issue than to miss one.

Do NOT consider whether the user could complete any task. That is irrelevant to this list.

Look especially for:
- Images or graphics announced with no meaningful name: "Unlabelled graphic", or a filename or junk string instead of a description.
- Links whose text does not convey their purpose: "Click here", "Read more", "link" with no name, or a bare URL.
- Visual section titles announced as plain text instead of "heading level N" (missing heading semantics).
- Form fields or controls announced without a clear label, or with a confusing name.
- Text or phone numbers presented as graphics.
- Data tables: if the cells in data rows are announced WITHOUT their row or column header (for example "column 2, 09:15" rather than "Departs, column 2, 09:15"), the header cells are not programmatically associated. If each data cell IS announced with its header, the table is fine.
- Use structural navigation as corroborating evidence, not as a finding by itself. If the ordered transcript already announces a heading or landmark role, do NOT report a failure merely because the structural-navigation list omits it: that pass can be incomplete. If the transcript contains several clear section-title lines interleaved with body text, but none are announced as headings, that supports 1.3.1. A single plain sentence—including a sentence that sounds like a section title—is not enough to establish missing heading semantics unless another direct signal identifies it as a visual heading. Likewise, "Landmarks/regions: NONE found" alone is not a WCAG failure without direct evidence of distinct regions that should be landmarks. A form field listed without a name there is unlabelled (3.3.2 / 4.1.2) only when it is actually a field, not merely a button.
- When a line contains the U+FFFC replacement marker ("￼"), treat it as an NVDA/Guidepup element-boundary artifact. It is not an unlabelled graphic when it follows a named control such as "Email address, edit, ￼". Flag it only when the role/name is otherwise absent, for example a bare "graphic, ￼".
- Form and dynamic-interaction probe fields are diagnostic context, not proof that every activated control is an invalid form submission. Do not invent 3.3.1 or 4.1.3 errors for ordinary named buttons. A dynamic result-change probe can support 4.1.3 only when the transcript/context shows that a user-triggered status or result count changed but the empty announcement failed to convey it.
- Do not treat status/weather lines such as "Traffic:" or "Today:" as headings merely because they are short plain text. Do not flag a link such as "full story" when the immediately associated heading or excerpt identifies the article. Do not flag an image-only unnamed link under 2.4.4 solely because its graphic lacks a name when 1.1.1/4.1.2 already describe the direct problem.
- Anything announced in a confusing or illogical order.
- A named combo box/action pair such as "Quick Menu, button, Go" has meaningful control context; do not flag its short action word under 2.4.6. A single content label such as "Artichoke advice telephone hotline:" is not evidence of missing heading semantics when it follows an announced section heading; do not turn labels into headings. Likewise, an isolated trailing value after an otherwise coherent table or list is not evidence of 1.3.2 without direct context showing that the value is out of sequence.
- An empty generic probe after an ordinary named action such as "Save changes" or "Search" is not a status-message failure. Require direct context that the action changes a result, count, validation state, or other user-relevant status before applying 4.1.3.

The transcript is read line by line, so a single long heading, link, or sentence can be split across consecutive lines. Treat consecutive lines that continue a phrase, or that repeat the same role such as "heading, level 1", as ONE element. Do NOT report "split", "fragmented", or "broken-up" headings or links that are only an element wrapping across lines: that is not an accessibility problem.

This applies to what you conclude, not only to how you word it. JOIN the fragments and judge the joined element. When a line ENDS with "link, <word>" and the next line BEGINS with "link, <word>", that is one link whose text wrapped — read it as the concatenation before asking whether its purpose is clear. Concretely, "link, document" ending one line and "link, use" starting the next is the single link "document use", which is descriptive; reporting "document" and "use" as two links with unclear destinations is the same error as calling them fragmented, and is wrong for the same reason. Standard footer boilerplate ("liability", "trademark", "document use", "software licensing", "privacy policy") names a specific policy document and is not vague link text.

For each problem, quote the exact transcript line(s) that evidence it.

Respond with ONLY a JSON object, nothing else:
{"issues": [{"issue": string, "evidence": string}]}`;

// Stage 2 — GROUND + VERIFY. Assign the precise criterion, drop the unsupported,
// judge the task SEPARATELY so it cannot delete a finding.
const VERIFY_INSTRUCTIONS = `You are an expert accessibility auditor finalizing a report. A first pass produced a list of CANDIDATE issues found in a screen-reader transcript. Your job is to GROUND and FINALIZE them, not to second-guess whether problems exist.

For EACH candidate, produce a finding UNLESS it is clearly spurious or clearly not a WCAG 2.2 Level A or AA matter. Default to KEEPING it; when in doubt, keep it.

For each finding you keep:
- Cite the single most precise success criterion FROM THE PROVIDED LIST, using its exact number and name. Do not cite any criterion that is not in the list.
- Quote the transcript evidence (you may reuse the candidate's evidence).
- Assign severity (blocker, serious, moderate, or minor) and a calibrated confidence from 0 to 1.

Rules:
- Keep distinct problems SEPARATE. Unlabelled or junk-described images (1.1.1), vague link text such as "Click here" / "Read more" / a bare "news" (2.4.4 Link Purpose (In Context)), and visual titles not announced as "heading level N" (1.3.1 Info and Relationships) are different findings. Do not collapse them into one.
- Only merge candidates that are literally the same issue repeated, into a single finding that notes the recurrence.
- A "Click here" or "Read more" link fails 2.4.4 UNLESS the immediately surrounding announced text makes its destination clear. A vague link beside unrelated text still fails.
- Text or phone numbers shown as a graphic are 1.1.1 (and, if they convey readable text, 1.4.5 Images of Text).
- The transcript is read line by line, so one heading, link, or sentence may wrap across consecutive lines. Do NOT create a finding for a "split", "fragmented", or "broken-up" heading or link that is merely line-wrapping (for example, consecutive "heading, level 1, ..." lines that form one title). Line-wrapping is not a WCAG failure.
- Flag 1.3.1 Info and Relationships ONLY when structure is announced WITHOUT its semantics: a visual section title read as plain text with no "heading" role, or missing list/table relationships. A heading-level skip (for example level 1 then level 4) is NOT a 1.3.1 failure. If headings, lists, and landmarks ARE announced with their roles, do not raise 1.3.1.
- A control announced with descriptive text (for example "Change Text Size or Colors") HAS an accessible name, even if the word "link" or "button" does not appear on the same transcript line, and even if it also appears compressed elsewhere (such as a skip-link or controls landmark read at the top of the page). Do NOT flag it under 4.1.2 Name, Role, Value or 2.4.6 Headings and Labels. Reserve 4.1.2 for controls announced by ROLE ONLY with no name: a bare "button", "link", "graphic", or "edit text" with no accompanying text.
- Treat structural navigation as corroborating evidence, not as an independent oracle. If the ordered transcript announces a heading or landmark role, do NOT report a failure merely because the structural list omits it. Report missing heading semantics only when the transcript itself shows several clear, title-like sections announced as plain text, or another direct signal explicitly identifies a plain-text line as a visual heading. An isolated plain sentence or an ambiguous structural-list mismatch is insufficient. Report missing landmarks only when the transcript/context directly establishes distinct regions that should be landmarks; "Landmarks/regions: NONE found" alone is insufficient.
- Do not infer a missing selection, pressed, or expanded state from a static list of otherwise named controls. For example, "button, All, button, Shoes, button, Bags" does not establish a 4.1.2 failure: require an explicitly announced state, or an interaction re-read showing a state is absent or unchanged after activation. A candidate that calls this only a "potential" state problem is spurious.
- The character "￼" (U+FFFC) is an NVDA/Guidepup element-boundary marker. It is not evidence of an unlabelled graphic when it follows a named control or field, such as "Email address, edit, ￼" or "Email, radio button, not checked, ￼". Flag it only when the role/name is otherwise absent, such as a standalone "graphic, ￼".
- Probe metadata about form submission and control activation does not mean that every activated button is an invalid form. Apply 3.3.1 only to an actual form field whose post-submit announcement lacks an error or invalid state. Apply 4.1.3 to an empty post-action announcement only when the page/context clearly requires a user-triggered status or result update; do not flag ordinary named buttons or controls merely because their generic probe delta is empty. A positive announcement such as a changed result count satisfies the status requirement.
- Context matters for link purpose: "full story" can be sufficiently clear when immediately associated with an announced article heading or excerpt. Do not flag status/weather lines such as "Traffic:" or "Today:" as headings merely because they are short plain text. Do not add 2.4.4 solely because an image-only link also has an unnamed graphic when the direct evidence is already covered by 1.1.1/4.1.2. Do not treat a repeated landmark/content-info announcement or a named landmark/form name as a reading-order or headings-and-labels failure by itself.
- Keep a candidate only when its evidence directly establishes a WCAG A or AA failure. Do not turn "may", "potentially", generic structural absence, a heading-level skip, a duplicate caused by a landmark announcement, or a U+FFFC marker into a finding.
- Do not flag 2.4.6 for a short action word like "Go" when the control is explicitly announced with a meaningful context/name such as "Quick Menu". Do not flag 1.3.1 for a single descriptive content label such as "Artichoke advice telephone hotline:"; that is a label, not a proven visual heading. Do not flag 1.3.2 from a solitary trailing value after a coherent table or list unless the transcript directly establishes that the value is out of sequence.
- Do not flag 4.1.3 when the only evidence is an empty generic probe after an ordinary named action such as "Save changes" or "Search" and no result, count, validation, or other status change is shown.

SEPARATELY, judge whether a screen-reader user could complete the stated task from what was announced. This task judgment must NOT reduce the findings: a page can be fully task-completable and still fail many criteria.

Respond with ONLY a JSON object of this shape, and nothing else:
{"taskCompletable": boolean, "summary": string, "findings": [{"issue": string, "wcag": string, "severity": "blocker"|"serious"|"moderate"|"minor", "evidence": string, "confidence": number}], "confidence": number}`;

// JSON schemas for constrained decoding (sent as response_format by the openai
// backend when STRUCTURED is on). Object-root only — see the STRUCTURED note.
const RECALL_SCHEMA = {
  type: "object",
  properties: {
    issues: {
      type: "array",
      items: {
        type: "object",
        properties: { issue: { type: "string" }, evidence: { type: "string" } },
        required: ["issue", "evidence"],
      },
    },
  },
  required: ["issues"],
};

const VERIFY_SCHEMA = {
  type: "object",
  properties: {
    taskCompletable: { type: "boolean" },
    summary: { type: "string" },
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          issue: { type: "string" },
          wcag: { type: "string" },
          severity: { type: "string", enum: ["blocker", "serious", "moderate", "minor"] },
          evidence: { type: "string" },
          confidence: { type: "number" },
        },
        required: ["issue", "wcag", "severity", "evidence", "confidence"],
      },
    },
    confidence: { type: "number" },
  },
  required: ["taskCompletable", "summary", "findings", "confidence"],
};

const SEVERITIES = new Set<Severity>(["blocker", "serious", "moderate", "minor"]);

function isFiniteConfidence(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

/** Validate every field before a backend result can reach the report renderer.
 * JSON schema decoding is only available on some providers, so this boundary
 * remains mandatory for Codex, Anthropic, and older OpenAI-compatible servers. */
export function validateJudgment(value: unknown): Judgment {
  if (!value || typeof value !== "object") throw new Error("judge output is not an object");
  const candidate = value as Partial<Judgment>;
  if (typeof candidate.taskCompletable !== "boolean") throw new Error("judge output has invalid taskCompletable");
  if (typeof candidate.summary !== "string" || !candidate.summary.trim()) throw new Error("judge output has invalid summary");
  if (!Array.isArray(candidate.findings)) throw new Error("judge output has invalid findings");
  if (!isFiniteConfidence(candidate.confidence)) throw new Error("judge output has invalid overall confidence");
  const findings = candidate.findings.map((finding, index) => {
    if (!finding || typeof finding !== "object") throw new Error(`judge finding ${index + 1} is not an object`);
    const item = finding as Partial<Finding>;
    if (typeof item.issue !== "string" || !item.issue.trim()) throw new Error(`judge finding ${index + 1} has invalid issue`);
    if (typeof item.wcag !== "string" || !item.wcag.trim()) throw new Error(`judge finding ${index + 1} has invalid wcag`);
    if (typeof item.evidence !== "string" || !item.evidence.trim()) throw new Error(`judge finding ${index + 1} has invalid evidence`);
    if (!SEVERITIES.has(item.severity as Severity)) throw new Error(`judge finding ${index + 1} has invalid severity`);
    if (!isFiniteConfidence(item.confidence)) throw new Error(`judge finding ${index + 1} has invalid confidence`);
    return item as Finding;
  });
  return {
    taskCompletable: candidate.taskCompletable,
    summary: candidate.summary,
    findings,
    confidence: candidate.confidence,
  };
}

function transcriptBlock(input: JudgeInput): string {
  return [
    `URL: ${input.url}`,
    `Screen reader: ${input.screenReader}`,
    ``,
    `Announcement transcript, in order:`,
    ...input.transcript.map((line, i) => `${i + 1}. ${line}`),
  ].join("\n");
}

/**
 * Structural navigation passes (skim by element type). An empty list is a
 * strong signal: if the page visibly has sections, regions, or form fields but
 * the screen reader found none of that type here, the semantics are missing.
 */
function structureBlock(input: JudgeInput): string {
  const s = input.structure;
  if (!s) return "";
  const fmt = (label: string, arr: string[]) =>
    arr.length ? `${label} (${arr.length}): ${arr.map((x) => `"${x}"`).join("; ")}` : `${label}: NONE found`;
  return [
    ``,
    `Structural navigation (what the screen reader found skimming by element type; an empty list means the page exposes NONE of that type, even if it visually appears to):`,
    fmt("Headings", s.headings),
    fmt("Landmarks/regions", s.landmarks),
    fmt("Form fields", s.formFields),
  ].join("\n");
}

/**
 * Keyboard-interaction pass: how each focusable control is announced when
 * tabbed to (focus mode), and the state announced after activating disclosures.
 * A control announced with only a role and no name (just "button" / "edit") is
 * unlabelled (4.1.2); a disclosure that does not announce "expanded" after
 * activation does not convey its state (4.1.2).
 */
function interactionBlock(input: JudgeInput): string {
  const it = input.interaction;
  if (!it || (!it.controls?.length && !it.stateChanges?.length && !it.formChanges?.length && !it.postSubmitFields?.length)) return "";
  const lines = [
    ``,
    `Interactive controls (found by quick-nav; each line is how the control is announced, with its name/role/state):`,
    ...it.controls.map((x, i) => `  ${i + 1}. ${x}`),
  ];
  if (it.stateChanges?.length) {
    lines.push(
      `Disclosure controls activated, then RE-READ (control as first announced -> the same control re-read after activation, which reports its CURRENT state). Compare the state word on each side. "collapsed" -> "expanded" means the new state IS exposed to the screen reader: correct, raise nothing. If the state word is UNCHANGED ("collapsed" -> "collapsed"), the control revealed its content visually but never updated its state, so a screen-reader user gets no indication anything changed: that fails 4.1.2 Name, Role, Value. An EMPTY re-read ("") is also a 4.1.2 failure. Judge ONLY the state word; a page title or document re-announce on either side is capture noise, not evidence. ` +
        it.stateChanges.map((s) => `"${s.control}" -> "${s.after}"`).join("; ")
    );
  }
  lines.push(...formSubmitLines(it));
  return lines.join("\n");
}

// Two best-effort signals from submitting a form with no valid input. NVDA's
// post-action announcements are nondeterministic, so treat them as POSITIVE
// evidence: if EITHER names the error, it was conveyed (no finding). Flag a
// failure only when BOTH show no error — strong evidence the form failed
// silently. This keeps single-channel flakiness from causing false positives.
function formSubmitLines(it: NonNullable<JudgeInput["interaction"]>): string[] {
  const lines: string[] = [];
  if (it.formChanges?.length) {
    lines.push(
      `Announced immediately after the submit (4.1.3 Status Messages — an accessible form announces the error here without moving focus). Naming the error ("there is a problem", "email is required") satisfies it; an EMPTY ("") or page/button re-read means no status was announced: ` +
        it.formChanges.map((s) => `"${s.control}" -> "${s.after}"`).join("; ")
    );
  }
  if (it.postSubmitFields?.length) {
    lines.push(
      `Form fields re-read AFTER that submit (3.3.1 Error Identification). An accessible form marks the invalid field, so it announces "invalid entry" and/or an associated error ("Error: enter your email address"); a field label merely saying "(required)" is NOT error identification. Only conclude 3.3.1/4.1.3 failure if NEITHER this NOR the announcement above shows any error: ` +
        it.postSubmitFields.map((s) => `"${s}"`).join("; ")
    );
  }
  return lines;
}

function buildRecallPrompt(input: JudgeInput): string {
  // Note: the task is deliberately omitted here so it cannot bias recall.
  return [RECALL_INSTRUCTIONS, ``, transcriptBlock(input), structureBlock(input), interactionBlock(input)].join("\n");
}

function buildVerifyPrompt(input: JudgeInput, candidates: Candidate[]): string {
  const criteria = WCAG_22_AA.map((c) => `${c.num} ${c.name} (${c.level})`).join("\n");
  return [
    VERIFY_INSTRUCTIONS,
    ``,
    `Cite only from these WCAG 2.2 Level A and AA success criteria, using the exact number and name:`,
    criteria,
    ``,
    `Task the user was attempting: ${input.task}`,
    ``,
    transcriptBlock(input),
    structureBlock(input),
    interactionBlock(input),
    ``,
    `Candidate issues from the first pass:`,
    JSON.stringify(candidates, null, 2),
  ].join("\n");
}

/** Run one model pass against a prompt and return its raw text. Dispatches to
 * the selected backend (Codex by default; Anthropic API when JUDGE_BACKEND is
 * set). Both return text; extractJson handles either one's output. */
function ask(label: string, prompt: string, schema?: unknown): Promise<string> {
  if (BACKEND === "anthropic") return askAnthropic(label, prompt);
  if (BACKEND === "openai") return askOpenAICompatible(label, prompt, schema);
  return askCodex(label, prompt);
}

/** Codex backend (default): the local codex login, no metered API cost. */
async function askCodex(label: string, prompt: string): Promise<string> {
  const promptFile = join(tmpdir(), `a11y-witness-${label}-${Date.now()}.txt`);
  await writeFile(promptFile, prompt, "utf8");
  try {
    return await runCodex(promptFile);
  } finally {
    await unlink(promptFile).catch(() => {});
  }
}

/** Anthropic-API backend (BYO ANTHROPIC_API_KEY) — for CI / the GitHub Action,
 * where the local Codex login isn't available. Uses the official SDK with
 * adaptive thinking, streamed so large prompts can't hit request timeouts. The
 * SDK is lazy-imported so Codex-only users never load it. */
async function askAnthropic(label: string, prompt: string): Promise<string> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment
  process.stderr.write(`\nCalling Anthropic API (model=${JUDGE_MODEL}, ${label})...\n`);
  const stream = client.messages.stream({
    model: JUDGE_MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    messages: [{ role: "user", content: prompt }],
  });
  const message = await stream.finalMessage();
  // Join the text blocks; thinking blocks contribute nothing. The JSON the judge
  // asked for lives in the text, and extractJson strips any surrounding prose.
  return message.content.map((b) => (b.type === "text" ? b.text : "")).join("");
}

/** OpenAI-compatible backend (BYO key, or a local server). Plain /v1/chat/
 * completions over fetch — works against hosted OpenAI and local engines
 * (llama.cpp/vLLM/Ollama/LM Studio) alike, no SDK needed. Reasoning models that
 * use a separate reasoning_content field leave content clean; the <think> strip
 * covers servers that inline it instead. */
async function askOpenAICompatible(label: string, prompt: string, schema?: unknown): Promise<string> {
  process.stderr.write(`\nCalling OpenAI-compatible API (model=${JUDGE_MODEL}, base=${JUDGE_BASE_URL}, ${label})...\n`);
  const apiKey = process.env.OPENAI_API_KEY ?? process.env.JUDGE_API_KEY ?? "";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${JUDGE_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
      body: JSON.stringify({
        model: JUDGE_MODEL,
        messages: [{ role: "user", content: prompt }],
        max_tokens: JUDGE_MAX_TOKENS,
        temperature: 0,
        stream: false,
        ...(STRUCTURED && schema
          ? { response_format: { type: "json_schema", json_schema: { name: label, strict: true, schema } } }
          : {}),
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`OpenAI-compatible API error ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content ?? "";
    return content.replace(/<think>[\s\S]*?<\/think>/gi, "");
  } finally {
    clearTimeout(timer);
  }
}

/** "1.1.1 Non-text Content (A)" -> "1.1.1" */
/** Every criterion this tool is allowed to cite, as bare numbers. */
const REAL_CRITERIA = new Set(WCAG_22_AA.map((c) => c.num));

/**
 * Drop findings that do not cite a real WCAG 2.2 A/AA criterion.
 *
 * The previous check tested only the SHAPE of the number, `/\d+\.\d+\.\d+/`, so a model that
 * invented "9.9.9 Totally Invented Criterion" passed it and the citation reached the user's report.
 * The authoritative list was already imported to build the prompt; it just never checked the answer,
 * which made "cites only from this list" a promise the prompt made and nothing enforced.
 *
 * Dropped findings are reported, not swallowed: a model inventing criteria is a signal about the
 * model, and silently discarding it hides the thing you would want to know.
 */
function keepRealCriteria(findings: Finding[]): Finding[] {
  const kept = findings.filter((f) => REAL_CRITERIA.has(criterionOf(f.wcag ?? "")));
  const dropped = findings.length - kept.length;
  if (dropped > 0) {
    const invented = findings
      .filter((f) => !REAL_CRITERIA.has(criterionOf(f.wcag ?? "")))
      .map((f) => JSON.stringify(f.wcag ?? ""))
      .join(", ");
    process.stderr.write(`Dropped ${dropped} finding(s) citing no real WCAG 2.2 A/AA criterion: ${invented}\n`);
  }
  return kept;
}

function criterionOf(wcag: string): string {
  const m = wcag.match(/(\d+\.\d+\.\d+)/);
  return m ? m[1] : wcag.trim();
}

/** One full two-stage pass: exhaustive recall, then grounding/verification. */
async function judgeOnce(input: JudgeInput): Promise<Judgment> {
  let candidates: Candidate[] = [];
  try {
    const raw = await ask("recall", buildRecallPrompt(input), RECALL_SCHEMA);
    const parsed = JSON.parse(extractJson(raw)) as unknown;
    // Constrained decoding wraps the list as {issues:[...]}; older/unconstrained
    // backends may still return a bare array. Accept either.
    const arr = Array.isArray(parsed) ? parsed : (parsed as { issues?: unknown })?.issues;
    if (Array.isArray(arr)) candidates = arr as Candidate[];
  } catch {
    // If recall fails to parse, stage 2 still audits the transcript directly.
  }
  process.stderr.write(`Recall pass surfaced ${candidates.length} candidate issues.\n`);
    const verdict = await ask("verify", buildVerifyPrompt(input, candidates), VERIFY_SCHEMA);
    const judged = validateJudgment(JSON.parse(extractJson(verdict)));
  judged.findings = keepRealCriteria(judged.findings ?? []);
  return judged;
}

/**
 * Keep only findings whose WCAG criterion recurs in a majority of runs. For a
 * kept criterion, the highest-confidence finding is the representative. This
 * drops run-to-run noise (flaky speculative findings) while preserving the
 * stable, real ones.
 */
function mergeByConsensus(runs: Judgment[]): Judgment {
  const need = Math.ceil(runs.length / 2);
  const byCriterion = new Map<string, { findings: Finding[]; runs: Set<number> }>();
  runs.forEach((r, ri) => {
    for (const f of r.findings) {
      const c = criterionOf(f.wcag);
      if (!byCriterion.has(c)) byCriterion.set(c, { findings: [], runs: new Set() });
      const entry = byCriterion.get(c)!;
      entry.findings.push(f);
      entry.runs.add(ri);
    }
  });
  const findings: Finding[] = [];
  for (const { findings: fs, runs: seenIn } of byCriterion.values()) {
    if (seenIn.size >= need) {
      findings.push([...fs].sort((a, b) => b.confidence - a.confidence)[0]);
    }
  }
  const taskVotes = runs.filter((r) => r.taskCompletable).length;
  return {
    taskCompletable: taskVotes >= need,
    summary: runs[runs.length - 1].summary,
    findings,
    confidence: runs.reduce((a, r) => a + r.confidence, 0) / runs.length,
  };
}

export async function judge(input: JudgeInput): Promise<Judgment> {
  // `local` is the LLM-FREE path: this project's own trained scorer instead of a rented one. It needs no
  // key, no network and no account — 87 MB of encoder and 27 KB of heads — which is what makes it usable
  // in someone else's CI without asking them to buy anything.
  //
  // It composes the same way: `withRuleFindings` still contributes the deterministic rule layer, so the
  // result is rules + scorer. What it does NOT get is `applyGate`, which exists to filter a GENERATIVE
  // model's over-flagging; the scorer is already discriminative and carries its own evidence guard.
  //
  // Narrower than an LLM and deliberately so: eight criteria, 14 heads, and silent on everything else.
  // `local-judge.ts` states what that does and does not cover.
  if (BACKEND === "local") return withRuleFindings(await judgeLocally(input), input);
  const verdict = await runModelJudge(input);
  // Discriminative gate (opt-in): drop the model's unconfirmed semantic findings
  // and its absence findings (the rules re-supply those). No-op unless enabled.
  const gated: Judgment = { ...verdict, findings: await applyGate(verdict.findings) };
  return withRuleFindings(gated, input);
}

/** The model-based verdict: one two-stage pass, or a consensus of several. */
async function runModelJudge(input: JudgeInput): Promise<Judgment> {
  if (CONSENSUS <= 1) return judgeOnce(input);
  process.stderr.write(`Consensus mode: ${CONSENSUS} runs, keeping findings in >= ${Math.ceil(CONSENSUS / 2)}.\n`);
  const runs: Judgment[] = [];
  for (let i = 0; i < CONSENSUS; i++) runs.push(await judgeOnce(input));
  return mergeByConsensus(runs);
}

/** Merge the deterministic absence-rule findings into the model verdict. The
 * rules are high-precision (confidence 1) and cover the absence-of-name criteria
 * (1.1.1, 4.1.2) the model judges poorly; add any whose criterion the model did
 * not already flag, so the hybrid gains recall without the model's over-flagging.
 * The rules produce nothing on conformant pages, so this cannot add false
 * positives. */
function withRuleFindings(verdict: Judgment, input: JudgeInput): Judgment {
  const seen = new Set(verdict.findings.map((f) => criterionOf(f.wcag)));
  const extra = ruleFindings(input).filter((f) => !seen.has(criterionOf(f.wcag)));
  if (extra.length) process.stderr.write(`Rules added ${extra.length} absence finding(s) the model missed.\n`);
  return { ...verdict, findings: [...verdict.findings, ...extra] };
}

/**
 * Run the Codex CLI one-shot on your local codex login (no metered API).
 * Streams Codex's own progress to stderr so the run is never a silent black
 * box, and enforces a hard timeout so it can't hang forever.
 */
function runCodex(promptFile: string): Promise<string> {
  const cmd = `codex exec "$(cat ${JSON.stringify(promptFile)})" -s read-only --skip-git-repo-check -c 'model_reasoning_effort="${REASONING}"' < /dev/null`;
  process.stderr.write(`\nCalling Codex (reasoning=${REASONING}, timeout=${TIMEOUT_MS / 1000}s)...\n`);
  return new Promise((resolve, reject) => {
    const child = spawn("bash", ["-c", cmd]);
    let stdout = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Codex timed out after ${TIMEOUT_MS / 1000}s`));
    }, TIMEOUT_MS);
    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => process.stderr.write(d)); // live Codex progress
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(`codex exec exited with code ${code}`));
    });
  });
}

/**
 * Codex is asked for raw JSON; strip stray prose or fences just in case.
 * Handles both objects ({...}, the verdict) and arrays ([...], the recall
 * candidates) by anchoring on whichever delimiter appears first.
 */
function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1].trim() : text;
  const firstObj = body.indexOf("{");
  const firstArr = body.indexOf("[");
  const isArray = firstArr !== -1 && (firstObj === -1 || firstArr < firstObj);
  const start = isArray ? firstArr : firstObj;
  const end = isArray ? body.lastIndexOf("]") : body.lastIndexOf("}");
  return start !== -1 && end !== -1 ? body.slice(start, end + 1) : body.trim();
}
