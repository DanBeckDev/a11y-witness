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
import { layerOf, orderByLayer, LAYER_LABEL, type ExperienceLayer } from "./spike/layers.js";

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
    postSubmitFields?: string[];
  };
  diagnostics?: unknown[];
}

const MAX_CAPTURE_ATTEMPTS = 3;

// Best-effort check that the screen-reader capture actually read the target page
// (not browser chrome). True if the title gives nothing to check (empty / no
// significant words) or at least one significant title word appears in what NVDA
// announced. Catches the egregious wrong-content case (e.g. the browser start
// page) without over-retrying when a page's title legitimately isn't spoken.
function captureReadPage(cap: CaptureResponse, title: string): boolean {
  const words = title.toLowerCase().match(/[a-z0-9]{4,}/g) ?? [];
  if (words.length === 0) return true;
  const s = cap.structure;
  const it = cap.interaction;
  const haystack = [
    ...cap.transcript,
    ...(s?.headings ?? []), ...(s?.landmarks ?? []), ...(s?.formFields ?? []),
    ...(it?.controls ?? []),
    ...(it?.stateChanges ?? []).map((x) => `${x.control} ${x.after}`),
    ...(it?.postSubmitFields ?? []),
  ].join(" ").toLowerCase();
  return words.some((w) => haystack.includes(w));
}

async function main(): Promise<void> {
  const { url, task, worker, json, debug, probeForms } = parseArgs();

  process.stderr.write(`Scanning ${url} (rule-based axe-core + real screen reader) ...\n`);
  // Layer 1 (rule-based, local) and capture (lived-experience, remote worker)
  // load the same URL independently, so run them concurrently. axe failure is
  // non-fatal: we still report the lived-experience layer.
  const [firstCap, axe] = await Promise.all([
    captureViaWorker(url, { task, worker, probeForms }),
    scanWithAxe(url).catch((e) => {
      process.stderr.write(`axe-core scan failed (continuing without it): ${e.message}\n`);
      return { findings: [] as AxeFinding[], title: "" };
    }),
  ]);
  const axeFindings = axe.findings;

  // Verify-and-retry (the Root-1 fix, brought to the product). Browser focus on
  // the worker can be racy, so NVDA sometimes reads chrome instead of the page.
  // axe (Playwright) gives us the page title; if the capture doesn't contain it,
  // NVDA likely read the wrong content — re-capture before judging.
  let cap = firstCap;
  for (let attempt = 2; attempt <= MAX_CAPTURE_ATTEMPTS && !captureReadPage(cap, axe.title); attempt++) {
    process.stderr.write(`Capture did not appear to read "${axe.title}" (wrong content?); re-capturing (attempt ${attempt}/${MAX_CAPTURE_ATTEMPTS}) ...\n`);
    cap = await captureViaWorker(url, { task, worker, probeForms });
  }
  if (axe.title && !captureReadPage(cap, axe.title)) {
    process.stderr.write(`WARNING: after ${MAX_CAPTURE_ATTEMPTS} attempts the capture still doesn't match the page title "${axe.title}" — results may reflect browser chrome, not the page.\n`);
  }

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
    const layered = { ...verdict, findings: verdict.findings.map((f) => ({ ...f, layer: layerOf(f.wcag) })) };
    console.log(JSON.stringify({ url, task, screenReader: cap.screenReader, transcript: cap.transcript, ruleBased: axeFindings, verdict: layered }, null, 2));
  } else {
    printReport({ url, task, screenReader: cap.screenReader, announcements: cap.transcript.length, verdict, axe: axeFindings });
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

interface Report {
  url: string;
  task: string;
  screenReader: string;
  announcements: number;
  verdict: Judgment;
  axe: AxeFinding[];
}

function printReport({ url, task, screenReader, announcements, verdict, axe }: Report): void {
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
    `-- Lived-experience layer (${screenReader} + AI judge): ${announcements} announcements --`,
    `Task completable: ${verdict.taskCompletable ? "yes" : "no"} (overall confidence ${verdict.confidence})`,
    verdict.summary,
    `${verdict.findings.length} finding(s):`
  );
  // Group findings by the Perceive -> Navigate -> Interact waterfall (most
  // fundamental first), with a heading per layer.
  let currentLayer: ExperienceLayer | "" = "";
  for (const f of orderByLayer(verdict.findings)) {
    const layer = layerOf(f.wcag);
    if (layer !== currentLayer) {
      currentLayer = layer;
      lines.push(`  ${LAYER_LABEL[layer]}`);
    }
    lines.push(`    [${f.severity.toUpperCase()}] ${f.wcag}  (confidence ${f.confidence})`);
    lines.push(`       ${f.issue}`);
    lines.push(`       evidence: ${f.evidence}`);
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
