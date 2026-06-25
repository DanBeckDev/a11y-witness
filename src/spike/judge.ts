import { Codex } from "@openai/codex-sdk";

// Runs on your local Codex login (`codex login`), so the judge uses your existing
// Codex subscription rather than a metered API. No API key is needed here.
const codex = new Codex();

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

Rules:
- Judge ONLY from the transcript provided. Do not invent problems you cannot point to in it. If the transcript is insufficient to judge something, say so rather than guessing.
- For every finding, cite the most relevant WCAG 2.2 success criterion (number and name), quote the announced text that evidences it, and give a calibrated confidence from 0 to 1.
- Distinguish a real blocker (the user cannot complete the task) from lesser issues.

Respond with ONLY a JSON object of this shape, and nothing else:
{"taskCompletable": boolean, "summary": string, "findings": [{"issue": string, "wcag": string, "severity": "blocker"|"serious"|"moderate"|"minor", "evidence": string, "confidence": number}], "confidence": number}`;

function buildPrompt(input: JudgeInput): string {
  return [
    INSTRUCTIONS,
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
  const thread = codex.startThread();
  const turn = await thread.run(buildPrompt(input));
  return JSON.parse(extractJson(turn.finalResponse ?? "")) as Judgment;
}

/** The model is asked for raw JSON; strip stray code fences just in case. */
function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start !== -1 && end !== -1 ? text.slice(start, end + 1) : text.trim();
}
