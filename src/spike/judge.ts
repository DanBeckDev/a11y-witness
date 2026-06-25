import { spawn } from "node:child_process";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WCAG_22_AA } from "../wcag/criteria.js";

// Reasoning effort and timeout are configurable; defaults keep the judge fast
// and bounded. The judge runs through the Codex CLI on your local codex login,
// so there is no metered API cost.
const REASONING = process.env.JUDGE_REASONING ?? "low";
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

const INSTRUCTIONS = `You are an expert accessibility auditor. You are given a transcript of what a screen reader actually announced while navigating a web page the way a real user would: reading in browse mode, jumping by headings and landmarks, and operating controls.

Judge the LIVED experience, not mechanical rule compliance:
- Could a screen-reader user understand the page and accomplish the stated task from what was announced?
- Is the announced content coherent and in a sensible order?
- Are controls, links, headings, and form fields announced with meaningful names and roles?
- Are state changes, errors, and focus moves announced when they matter?

Be systematic, not just impressionistic. Walk the transcript in order and check EVERY announced item before you conclude. In particular, for each one ask:
- Images and non-text content: is it announced with a meaningful name, or only by its role (a bare "image" with no description is a finding)?
- Controls and form fields: does each button, link, and field have a meaningful accessible name and role (a bare "button", "edit text", or "link" with no name is a finding)?
- Headings and structure: do the headings form a coherent outline for the task?
- State, errors, and focus: are changes that matter announced?
Do not stop at the first blocker you find; surface every distinct problem in the transcript.

Rules:
- Judge ONLY from the transcript provided. Do not invent problems you cannot point to in it. If the transcript is insufficient to judge something, say so rather than guessing.
- For every finding, cite the single most precise WCAG 2.2 success criterion FROM THE PROVIDED LIST BELOW, using its exact number and name. Do not cite any criterion that is not in the list. Quote the announced text that evidences the finding, and give a calibrated confidence from 0 to 1.
- Judge link purpose in context: if the surrounding announced text makes a link's destination clear, do not flag it as a Level A failure even if the link text alone is vague.
- Distinguish a real blocker (the user cannot complete the task) from lesser issues.

Respond with ONLY a JSON object of this shape, and nothing else:
{"taskCompletable": boolean, "summary": string, "findings": [{"issue": string, "wcag": string, "severity": "blocker"|"serious"|"moderate"|"minor", "evidence": string, "confidence": number}], "confidence": number}`;

function buildPrompt(input: JudgeInput): string {
  const criteria = WCAG_22_AA.map((c) => `${c.num} ${c.name} (${c.level})`).join("\n");
  return [
    INSTRUCTIONS,
    ``,
    `Cite only from these WCAG 2.2 Level A and AA success criteria, using the exact number and name:`,
    criteria,
    ``,
    `URL: ${input.url}`,
    `Screen reader: ${input.screenReader}`,
    `Task the user was attempting: ${input.task}`,
    ``,
    `Announcement transcript, in order:`,
    ...input.transcript.map((line, i) => `${i + 1}. ${line}`),
  ].join("\n");
}

export async function judge(input: JudgeInput): Promise<Judgment> {
  const promptFile = join(tmpdir(), `a11y-witness-judge-${Date.now()}.txt`);
  await writeFile(promptFile, buildPrompt(input), "utf8");
  try {
    const output = await runCodex(promptFile);
    return JSON.parse(extractJson(output)) as Judgment;
  } finally {
    await unlink(promptFile).catch(() => {});
  }
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

/** Codex is asked for raw JSON; strip stray prose or fences just in case. */
function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start !== -1 && end !== -1 ? text.slice(start, end + 1) : text.trim();
}
