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

interface Args {
  url: string;
  task: string;
  worker: string;
  json: boolean;
}

function parseArgs(): Args {
  const a = process.argv.slice(2);
  let url = "";
  let task = "Read and understand this page";
  let worker = process.env.A11Y_WORKER ?? "http://localhost:8765";
  let json = false;
  for (let i = 0; i < a.length; i++) {
    const v = a[i];
    if (v === "--task") task = a[++i] ?? task;
    else if (v === "--worker") worker = a[++i] ?? worker;
    else if (v === "--json") json = true;
    else if (!v.startsWith("--")) url = v;
  }
  if (!url) {
    console.error('Usage: npm run witness -- <url> --task "..." [--worker http://host:port] [--json]');
    process.exit(1);
  }
  return { url, task, worker, json };
}

interface CaptureResponse {
  url: string;
  screenReader: string;
  transcript: string[];
}

async function main(): Promise<void> {
  const { url, task, worker, json } = parseArgs();

  process.stderr.write(`Capturing ${url} via ${worker} (real screen reader) ...\n`);
  const res = await fetch(`${worker}/capture`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url, task }),
  });
  if (!res.ok) {
    console.error(`Worker error ${res.status}: ${await res.text()}`);
    process.exit(1);
  }
  const cap = (await res.json()) as CaptureResponse;

  process.stderr.write(`Captured ${cap.transcript.length} announcements; judging ...\n`);
  const verdict = await judge({
    url: cap.url,
    task,
    screenReader: cap.screenReader,
    transcript: cap.transcript,
  });

  if (json) {
    console.log(JSON.stringify({ url, task, screenReader: cap.screenReader, transcript: cap.transcript, verdict }, null, 2));
  } else {
    printReport(url, task, cap.screenReader, cap.transcript.length, verdict);
  }
}

function printReport(url: string, task: string, sr: string, n: number, v: Judgment): void {
  const lines: string[] = [
    "",
    "a11y-witness report",
    "===================",
    `URL:   ${url}`,
    `Task:  ${task}`,
    `Read by ${sr}: ${n} announcements captured`,
    `Task completable: ${v.taskCompletable ? "yes" : "no"} (overall confidence ${v.confidence})`,
    "",
    v.summary,
    "",
    `${v.findings.length} finding(s):`,
  ];
  for (const f of v.findings) {
    lines.push(`  [${f.severity.toUpperCase()}] ${f.wcag}  (confidence ${f.confidence})`);
    lines.push(`     ${f.issue}`);
    lines.push(`     evidence: ${f.evidence}`);
  }
  lines.push("");
  console.log(lines.join("\n"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
