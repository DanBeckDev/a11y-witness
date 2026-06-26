import { spawn } from "node:child_process";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WCAG_22_AA } from "../wcag/criteria.js";

// Model backend (the judge needs an LLM). The DEFAULT is the local Codex CLI,
// which uses your codex login — no metered API cost. External consumers (CI, the
// GitHub Action) can't use that login, so JUDGE_BACKEND=anthropic calls the
// Anthropic API with their own ANTHROPIC_API_KEY (JUDGE_MODEL overrides the
// model). The backend is one clean seam: a prompt in, raw text out.
const BACKEND = (process.env.JUDGE_BACKEND ?? "codex").toLowerCase();
const JUDGE_MODEL = process.env.JUDGE_MODEL ?? "claude-opus-4-8";

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
  structure?: { headings: string[]; landmarks: string[]; formFields: string[] };
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
- Use the structural-navigation section (if provided): if the page clearly has visual sections but Headings found NONE, the headings are not real headings (1.3.1); if it has visual regions but Landmarks found NONE, regions are unmarked (1.3.1); a form field listed without a name there is unlabelled (3.3.2 / 4.1.2).
- Anything announced in a confusing or illogical order.

The transcript is read line by line, so a single long heading, link, or sentence can be split across consecutive lines. Treat consecutive lines that continue a phrase, or that repeat the same role such as "heading, level 1", as ONE element. Do NOT report "split", "fragmented", or "broken-up" headings or links that are only an element wrapping across lines: that is not an accessibility problem.

For each problem, quote the exact transcript line(s) that evidence it.

Respond with ONLY a JSON array, nothing else:
[{"issue": string, "evidence": string}]`;

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
- Drop a candidate ONLY if its evidence supports no WCAG A or AA criterion, or it is not actually a barrier. Do not invent problems absent from the transcript.

SEPARATELY, judge whether a screen-reader user could complete the stated task from what was announced. This task judgment must NOT reduce the findings: a page can be fully task-completable and still fail many criteria.

Respond with ONLY a JSON object of this shape, and nothing else:
{"taskCompletable": boolean, "summary": string, "findings": [{"issue": string, "wcag": string, "severity": "blocker"|"serious"|"moderate"|"minor", "evidence": string, "confidence": number}], "confidence": number}`;

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
      `Disclosure controls activated (control -> what was announced after). An EMPTY announcement ("") means the control changed nothing audible: its state is not conveyed to the user, failing 4.1.2 Name, Role, Value. Any announcement of the new state or revealed content is acceptable. ` +
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
function ask(label: string, prompt: string): Promise<string> {
  if (BACKEND === "anthropic") return askAnthropic(label, prompt);
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

/** "1.1.1 Non-text Content (A)" -> "1.1.1" */
function criterionOf(wcag: string): string {
  const m = wcag.match(/(\d+\.\d+\.\d+)/);
  return m ? m[1] : wcag.trim();
}

/** One full two-stage pass: exhaustive recall, then grounding/verification. */
async function judgeOnce(input: JudgeInput): Promise<Judgment> {
  let candidates: Candidate[] = [];
  try {
    const raw = await ask("recall", buildRecallPrompt(input));
    const parsed = JSON.parse(extractJson(raw));
    if (Array.isArray(parsed)) candidates = parsed as Candidate[];
  } catch {
    // If recall fails to parse, stage 2 still audits the transcript directly.
  }
  process.stderr.write(`Recall pass surfaced ${candidates.length} candidate issues.\n`);
  const verdict = await ask("verify", buildVerifyPrompt(input, candidates));
  return JSON.parse(extractJson(verdict)) as Judgment;
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
  if (CONSENSUS <= 1) return judgeOnce(input);
  process.stderr.write(`Consensus mode: ${CONSENSUS} runs, keeping findings in >= ${Math.ceil(CONSENSUS / 2)}.\n`);
  const runs: Judgment[] = [];
  for (let i = 0; i < CONSENSUS; i++) runs.push(await judgeOnce(input));
  return mergeByConsensus(runs);
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
