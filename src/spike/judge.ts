import { spawn } from "node:child_process";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WCAG_22_AA } from "../wcag/criteria.js";

// Reasoning effort and timeout are configurable; defaults keep the judge fast
// and bounded. The judge runs through the Codex CLI on your local codex login,
// so there is no metered API cost.
const REASONING = process.env.JUDGE_REASONING ?? "medium";
const TIMEOUT_MS = Number(process.env.JUDGE_TIMEOUT_MS ?? 120_000);

export type Severity = "blocker" | "serious" | "moderate" | "minor";

export interface JudgeInput {
  url: string;
  task: string;
  screenReader: string;
  /** Ordered log of what the screen reader announced as it navigated, plus any events. */
  transcript: string[];
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

function buildRecallPrompt(input: JudgeInput): string {
  // Note: the task is deliberately omitted here so it cannot bias recall.
  return [RECALL_INSTRUCTIONS, ``, transcriptBlock(input)].join("\n");
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
    ``,
    `Candidate issues from the first pass:`,
    JSON.stringify(candidates, null, 2),
  ].join("\n");
}

/** Run one Codex pass against a prompt string and return its raw stdout. */
async function askCodex(label: string, prompt: string): Promise<string> {
  const promptFile = join(tmpdir(), `a11y-witness-${label}-${Date.now()}.txt`);
  await writeFile(promptFile, prompt, "utf8");
  try {
    return await runCodex(promptFile);
  } finally {
    await unlink(promptFile).catch(() => {});
  }
}

export async function judge(input: JudgeInput): Promise<Judgment> {
  // Stage 1: exhaustive recall.
  let candidates: Candidate[] = [];
  try {
    const raw = await askCodex("recall", buildRecallPrompt(input));
    const parsed = JSON.parse(extractJson(raw));
    if (Array.isArray(parsed)) candidates = parsed as Candidate[];
  } catch {
    // If recall fails to parse, stage 2 still audits the transcript directly.
  }
  process.stderr.write(
    `Recall pass surfaced ${candidates.length} candidate issues:\n` +
      candidates.map((c, i) => `  ${i + 1}. ${c.issue}`).join("\n") +
      "\n"
  );

  // Stage 2: ground, verify, and judge the task separately.
  const verdict = await askCodex("verify", buildVerifyPrompt(input, candidates));
  return JSON.parse(extractJson(verdict)) as Judgment;
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
