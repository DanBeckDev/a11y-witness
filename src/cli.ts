/**
 * a11y-witness CLI (control plane).
 *
 * Runs the whole pipeline in one command: ask a capture worker to drive a real
 * screen reader through the page, then judge the announcement transcript here
 * (the judge uses the local Codex login, so no metered API cost).
 *
 * Usage:
 *   npm run witness -- <url> --task "..." [--worker http://host:port] [--json]
 * The worker URL also reads from A11Y_WORKER.
 *
 * With neither set, the run manages a local UTM worker VM on demand: it starts one if
 * needed and puts it back how it found it afterwards. See leaseWorker in capture/local-vm.
 */
import { judge, type Judgment } from "./spike/judge.js";
import { scanWithAxe, axeAvailable, type AxeFinding } from "./scan/axe.js";
import { fetchPageTitle } from "./scan/page-title.js";
import { loadAxeResults, warnOnUrlMismatch } from "./scan/axe-results.js";
import { layerOf, orderByLayer, LAYER_LABEL, type ExperienceLayer } from "./spike/layers.js";
import { leaseWorker, isAfterRun, type AfterRun } from "./capture/local-vm.js";
import { captureMentionsTitle } from "./capture/verify.js";

interface Args {
  url: string;
  task: string;
  /** null when the user named no worker, which is what enables local-VM management. */
  worker: string | null;
  after: AfterRun;
  json: boolean;
  debug: boolean;
  probeForms: boolean;
  /** Run the optional axe-core layer. Off with --no-axe or A11Y_AXE=0. */
  axe: boolean;
  /** Path to axe results produced elsewhere, used instead of running our own scan. */
  axeResults: string | null;
}

function parsedAfterRun(): AfterRun {
  const v = process.env.A11Y_VM_AFTER;
  if (!v) return "restore";
  if (isAfterRun(v)) return v;
  console.error(`A11Y_VM_AFTER must be restore|stop|pause|leave (got "${v}")`);
  process.exit(1);
}

const USAGE =
  'Usage: npm run witness -- <url> --task "..." [--worker http://host:port] ' +
  "[--after restore|stop|pause|leave] [--json] [--debug] [--probe-forms] [--no-axe] [--axe-results <file>]";

function defaultArgs(): Args {
  return {
    url: "",
    task: "Read and understand this page",
    worker: process.env.A11Y_WORKER ?? null,
    after: parsedAfterRun(),
    json: false,
    debug: false,
    probeForms: false,
    axe: process.env.A11Y_AXE !== "0",
    axeResults: process.env.A11Y_AXE_RESULTS ?? null,
  };
}

// Applies one argument and returns the index it consumed up to, so value-taking flags can
// swallow their value. Split out of parseArgs to keep each side simple: this one knows the
// flags, parseArgs knows the loop and the validation.
function applyArg(args: Args, argv: string[], i: number): number {
  const v = argv[i];
  switch (v) {
    case "--task": args.task = argv[++i] ?? args.task; return i;
    case "--worker": args.worker = argv[++i] ?? args.worker; return i;
    case "--after": args.after = afterRunArg(argv[++i]); return i;
    case "--axe-results": args.axeResults = argv[++i] ?? args.axeResults; return i;
    case "--json": args.json = true; return i;
    case "--debug": args.debug = true; return i;
    case "--probe-forms": args.probeForms = true; return i;
    case "--no-axe": args.axe = false; return i;
    default:
      if (!v.startsWith("--")) args.url = v;
      return i;
  }
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const args = defaultArgs();
  for (let i = 0; i < argv.length; i++) i = applyArg(args, argv, i);
  if (!args.url) {
    console.error(USAGE);
    process.exit(1);
  }
  return args;
}

function afterRunArg(v: string | undefined): AfterRun {
  if (v && isAfterRun(v)) return v;
  console.error(`--after must be restore|stop|pause|leave (got "${v ?? ""}")`);
  process.exit(1);
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

async function main(): Promise<void> {
  const args = parseArgs();
  const lease = await leaseWorker(args);
  // finally, not a catch: the VM must be released whether the run succeeded, threw, or the
  // judge rejected the capture. Leaking a running Windows guest is the failure mode this
  // whole module exists to prevent.
  try {
    await runWitness({ ...args, worker: lease.worker });
  } finally {
    await lease.release();
  }
}

type RunOptions = Omit<Args, "worker"> & { worker: string };

async function runWitness({ url, task, worker, json, debug, probeForms, axe: wantAxe, axeResults }: RunOptions): Promise<void> {
  const ruleLayer = await chooseRuleLayer({ wantAxe, axeResults });
  process.stderr.write(`Scanning ${url} (${ruleLayer === "none" ? "" : "rule-based axe-core + "}real screen reader) ...\n`);
  // Layer 1 (rule-based, local) and capture (lived-experience, remote worker)
  // load the same URL independently, so run them concurrently. axe failure is
  // non-fatal: we still report the lived-experience layer.
  const [firstCap, axe] = await Promise.all([
    captureViaWorker(url, { task, worker, probeForms }),
    pageContext(url, ruleLayer, axeResults),
  ]);
  const axeFindings = axe.findings;

  // Verify-and-retry (the Root-1 fix, brought to the product). Browser focus on
  // the worker can be racy, so NVDA sometimes reads chrome instead of the page.
  // axe (Playwright) gives us the page title; if the capture doesn't contain it,
  // NVDA likely read the wrong content — re-capture before judging.
  let cap = firstCap;
  for (let attempt = 2; attempt <= MAX_CAPTURE_ATTEMPTS && !captureMentionsTitle(cap, axe.title); attempt++) {
    process.stderr.write(`Capture did not appear to read "${axe.title}" (wrong content?); re-capturing (attempt ${attempt}/${MAX_CAPTURE_ATTEMPTS}) ...\n`);
    cap = await captureViaWorker(url, { task, worker, probeForms });
  }
  if (axe.title && !captureMentionsTitle(cap, axe.title)) {
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
    printReport({ url, task, screenReader: cap.screenReader, announcements: cap.transcript.length, verdict, axe: ruleLayer === "none" ? null : axeFindings });
  }
}

type RuleLayer = "none" | "run" | "import";

// Imported results win over running our own. Someone who supplies a file has already run
// axe; scanning again would give them two differently-versioned opinions on one page.
async function chooseRuleLayer({ wantAxe, axeResults }: { wantAxe: boolean; axeResults: string | null }): Promise<RuleLayer> {
  if (axeResults) return "import";
  if (!wantAxe) return "none";
  if (await axeAvailable()) return "run";
  process.stderr.write(
    "axe-core layer skipped: its optional dependencies are not installed " +
      "(npm install playwright @axe-core/playwright && npx playwright install chromium), " +
      "or pass --axe-results <file> to use results you already have.\n"
  );
  return "none";
}

// The rule-based findings plus the page title, from whichever source is available. The
// title is NOT optional the way the rule layer is: without it the capture cannot be checked
// for having read the wrong page, so it falls back to a plain fetch.
async function pageContext(url: string, layer: RuleLayer, axeResults: string | null): Promise<{ findings: AxeFinding[]; title: string }> {
  if (layer === "import" && axeResults) {
    const imported = await loadAxeResults(axeResults);
    warnOnUrlMismatch(imported.scannedUrl, url);
    process.stderr.write(`Using ${imported.findings.length} imported axe violation(s) from ${axeResults}\n`);
    return { findings: imported.findings, title: await fetchPageTitle(url) };
  }
  if (layer === "none") return { findings: [], title: await fetchPageTitle(url) };
  return scanWithAxe(url).catch(async (e: Error) => {
    process.stderr.write(`axe-core scan failed (continuing without it): ${e.message}\n`);
    return { findings: [] as AxeFinding[], title: await fetchPageTitle(url) };
  });
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
  /** null when the rule-based layer did not run — distinct from "ran and found nothing". */
  axe: AxeFinding[] | null;
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
    axe === null
      ? "not run. Visual criteria are unchecked, not clean."
      : `${axe.length} violation(s):`,
  ];
  for (const f of axe ?? []) {
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
