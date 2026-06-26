/**
 * a11y-witness CLI (control plane).
 *
 * Runs the whole pipeline in one command: ask a capture worker to drive a real
 * screen reader through the page, then judge the announcement transcript here
 * (the judge uses the local Codex login, so no metered API cost).
 *
 * Usage:
 *   npm run witness -- <url> --task "..." [--worker http://host:port] [--json]
 * The worker URL also reads from A11Y_WORKER. Default http://localhost:8765.
 */
import { judge, type Judgment } from "./spike/judge.js";
import { scanWithAxe, type AxeFinding } from "./scan/axe.js";

interface Args {
  url: string;
  task: string;
  worker: string;
  json: boolean;
  debug: boolean;
  probeForms: boolean;
}

function parseArgs(): Args {
  const a = process.argv.slice(2);
  let url = "";
  let task = "Read and understand this page";
  let worker = process.env.A11Y_WORKER ?? "http://localhost:8765";
  let json = false;
  let debug = false;
  let probeForms = false;
  for (let i = 0; i < a.length; i++) {
    const v = a[i];
    if (v === "--task") task = a[++i] ?? task;
    else if (v === "--worker") worker = a[++i] ?? worker;
    else if (v === "--json") json = true;
    else if (v === "--debug") debug = true;
    else if (v === "--probe-forms") probeForms = true;
    else if (!v.startsWith("--")) url = v;
  }
  if (!url) {
    console.error('Usage: npm run witness -- <url> --task "..." [--worker http://host:port] [--json] [--debug] [--probe-forms]');
    process.exit(1);
  }
  return { url, task, worker, json, debug, probeForms };
}

interface CaptureResponse {
  url: string;
  screenReader: string;
  transcript: string[];
  structure?: { headings: string[]; landmarks: string[]; formFields: string[] };
  interaction?: {
    controls: string[];
    stateChanges: { control: string; after: string }[];
    formChanges?: { control: string; after: string }[];
  };
  diagnostics?: unknown[];
}

async function main(): Promise<void> {
  const { url, task, worker, json, debug, probeForms } = parseArgs();

  process.stderr.write(`Scanning ${url} (rule-based axe-core + real screen reader) ...\n`);
  // Layer 1 (rule-based, local) and capture (lived-experience, remote worker)
  // load the same URL independently, so run them concurrently. axe failure is
  // non-fatal: we still report the lived-experience layer.
  const [cap, axeFindings] = await Promise.all([
    captureViaWorker(url, { task, worker, probeForms }),
    scanWithAxe(url).catch((e) => {
      process.stderr.write(`axe-core scan failed (continuing without it): ${e.message}\n`);
      return [] as AxeFinding[];
    }),
  ]);

  if (debug && cap.diagnostics) {
    process.stderr.write("-- capture diagnostics --\n");
    for (const e of cap.diagnostics) process.stderr.write("  " + JSON.stringify(e) + "\n");
  }
  if (cap.transcript.length === 0) {
    process.stderr.write(
      "WARNING: 0 announcements captured. Run with --debug; if afterStart.lastSpoken is empty, " +
        "NVDA is running but not producing speech (the worker likely needs a clean restart/reboot).\n"
    );
  }
  process.stderr.write(`Captured ${cap.transcript.length} announcements; judging ...\n`);
  const verdict = await judge({
    url: cap.url,
    task,
    screenReader: cap.screenReader,
    transcript: cap.transcript,
    structure: cap.structure,
    interaction: cap.interaction,
  });

  if (json) {
    console.log(JSON.stringify({ url, task, screenReader: cap.screenReader, transcript: cap.transcript, ruleBased: axeFindings, verdict }, null, 2));
  } else {
    printReport(url, task, cap.screenReader, cap.transcript.length, verdict, axeFindings);
  }
}

interface CaptureRequest {
  task: string;
  worker: string;
  probeForms: boolean;
}

async function captureViaWorker(url: string, { task, worker, probeForms }: CaptureRequest): Promise<CaptureResponse> {
  const res = await fetch(`${worker}/capture`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url, task, probeForms }),
  });
  if (!res.ok) {
    throw new Error(`Worker error ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as CaptureResponse;
}

function printReport(url: string, task: string, sr: string, n: number, v: Judgment, axe: AxeFinding[]): void {
  const lines: string[] = [
    "",
    "a11y-witness report",
    "===================",
    `URL:   ${url}`,
    `Task:  ${task}`,
    "",
    "-- Rule-based layer (axe-core): contrast, colour, ARIA, parsing --",
    `${axe.length} violation(s):`,
  ];
  for (const f of axe) {
    lines.push(`  [${f.impact}] ${f.wcag.join(", ") || "(no SC)"}  ${f.rule}: ${f.help}`);
    if (f.nodes[0]) lines.push(`     evidence: ${f.nodes[0].html.slice(0, 100)}`);
  }
  lines.push(
    "",
    `-- Lived-experience layer (${sr} + AI judge): ${n} announcements --`,
    `Task completable: ${v.taskCompletable ? "yes" : "no"} (overall confidence ${v.confidence})`,
    v.summary,
    `${v.findings.length} finding(s):`
  );
  for (const f of v.findings) {
    lines.push(`  [${f.severity.toUpperCase()}] ${f.wcag}  (confidence ${f.confidence})`);
    lines.push(`     ${f.issue}`);
    lines.push(`     evidence: ${f.evidence}`);
  }
  lines.push(
    "",
    "Note: visual issues (contrast, colour, target size) come from the rule-based layer;",
    "a screen reader cannot perceive them. Some criteria still need human review.",
    ""
  );
  console.log(lines.join("\n"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
