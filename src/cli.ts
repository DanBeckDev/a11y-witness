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
 * Set A11Y_SHADOW_MODEL=1 to run the verified local screen-reader scorer beside the existing
 * judge. Shadow output is log-only and never changes findings.
 */
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { judge } from "./spike/judge.js";
import { scanWithAxe, axeAvailable, type AxeFinding } from "./scan/axe.js";
import { fetchPageTitle } from "./scan/page-title.js";
import { loadAxeResults, warnOnUrlMismatch } from "./scan/axe-results.js";
import { layerOf } from "./spike/layers.js";
import { reportLines, type Report } from "./report.js";
import { leaseWorker, isAfterRun, type AfterRun } from "./capture/local-vm.js";
import { captureDoubt, captureMentionsTitle, pageCensus, type CaptureDoubt } from "./capture/verify.js";

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
  environment?: Record<string, string>;
  diagnostics?: unknown[];
}

const MAX_CAPTURE_ATTEMPTS = 3;
const SHADOW_PYTHON = process.env.A11Y_SHADOW_PYTHON ?? resolve(process.cwd(), ".venv/bin/python");
const SHADOW_SCORER = resolve(process.cwd(), "scripts/score-screenreader-model.py");

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

interface ShadowReport {
  mode?: string;
  decisionAction?: string;
  predictedPositiveCounts?: Record<string, number>;
  artifact?: {
    screenReader?: string;
    encoderSha256?: string;
    modelSha256?: string;
    reportSha256?: string;
    trainingDatasetSha256?: string | null;
  };
}

/** Run the local scorer beside the existing judge without changing findings. */
async function shadowScreenReaderCapture(capture: CaptureResponse): Promise<void> {
  if (process.env.A11Y_SHADOW_MODEL !== "1") return;
  try {
    const child = spawn(SHADOW_PYTHON, [SHADOW_SCORER, "--shadow", "--stdin"], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.stdin.end(JSON.stringify(capture));
    const exitCode = await new Promise<number>((resolveExit, reject) => {
      child.once("error", reject);
      child.once("close", (code) => resolveExit(code ?? 1));
    });
    if (exitCode !== 0) {
      process.stderr.write(`Shadow scorer unavailable; existing judge unchanged. ${stderr.trim()}\n`);
      return;
    }
    const report = JSON.parse(stdout) as ShadowReport;
    process.stderr.write(
      `Shadow scorer (${report.mode ?? "unknown"}, ${report.decisionAction ?? "unknown"}): ` +
        JSON.stringify({
          predictedPositiveCounts: report.predictedPositiveCounts ?? {},
          artifact: report.artifact ?? null,
        }) + "\n",
    );
  } catch (error) {
    process.stderr.write(`Shadow scorer failed; existing judge unchanged. ${String(error)}\n`);
  }
}

/**
 * Say which kind of doubt it is, in words that match the cause.
 *
 * Telling someone their page "read browser chrome" when a consent dialog held the screen reader inside
 * their page sends them looking in the wrong place entirely.
 */
function warnUnverified(reason: CaptureDoubt, title: string | undefined): void {
  if (reason === "wrong-content") {
    process.stderr.write(`WARNING: after ${MAX_CAPTURE_ATTEMPTS} attempts the capture still doesn't match the page title "${title ?? ""}" — results may reflect browser chrome, not the page.\n`);
    return;
  }
  process.stderr.write("WARNING: the screen reader reached almost none of this page — most likely held inside a "
    + "modal such as a cookie or consent dialog. Reporting no findings rather than describing the dialog.\n");
}

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
  // `null` when the rule layer did not run, so "unchecked" can never be mistaken for "clean". Both
  // output paths must use THIS, not `axe.findings`: the human report already did
  // (`ruleLayer === "none" ? null : ...`) while the --json path emitted the bare array, so `--no-axe`
  // produced `"ruleBased": []` and any consumer rendered it as "0 violations". The text report and the
  // JSON disagreed about whether contrast had been checked, and the JSON was the one that lied.
  const ruleFindings = ruleLayer === "none" ? null : axe.findings;

  // Verify-and-retry (the Root-1 fix, brought to the product). Browser focus on
  // the worker can be racy, so NVDA sometimes reads chrome instead of the page.
  // axe (Playwright) gives us the page title; if the capture doesn't contain it,
  // NVDA likely read the wrong content — re-capture before judging.
  let cap = firstCap;
  for (let attempt = 2; attempt <= MAX_CAPTURE_ATTEMPTS && !captureMentionsTitle(cap, axe.title); attempt++) {
    process.stderr.write(`Capture did not appear to read "${axe.title}" (wrong content?); re-capturing (attempt ${attempt}/${MAX_CAPTURE_ATTEMPTS}) ...\n`);
    cap = await captureViaWorker(url, { task, worker, probeForms });
  }
  // Carry the verdict, do not just warn about it.
  //
  // This wrote a WARNING and carried on. On gov.uk the capture read Edge's image-magnifier overlay
  // ("Image Magnify, document"), the retry fired all three times and said so — and the run then judged
  // that chrome and reported a 4.1.2 finding about the browser's own Zoom In / Rotate buttons as though
  // it were the site's fault. The check knew it had failed and the pipeline downstream could not tell.
  //
  // A stderr line is not a signal. Anything consuming the result has to be able to see this.
  //
  // Two independent ways a capture can fail to be about the page, and they need different words. Reading
  // the WRONG thing (browser chrome, an interstitial) is caught by the title; reading only PART of the
  // right thing is not caught by anything the title can see — on theregister.com the consent modal traps
  // focus, so the URL, the title and a title word all check out while the sweep reached 1 of 463 headings.
  //
  // Reachability is deliberately NOT in the retry loop above. A consent wall is on every attempt, so
  // retrying buys three captures and the same answer.
  const unverifiedReason = captureDoubt(cap, axe.title) ?? undefined;
  const captureVerified = unverifiedReason === undefined;
  if (unverifiedReason) warnUnverified(unverifiedReason, axe.title);

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
  await shadowScreenReaderCapture(cap);
  const verdict = await judge({
    url: cap.url,
    task,
    screenReader: cap.screenReader,
    transcript: cap.transcript,
    structure: cap.structure,
    interaction: cap.interaction,
    // The tree's own counts, so the rules that assert an ABSENCE can corroborate it. Without this a page
    // with no headings and a capture that failed to reach them are the same input.
    census: pageCensus(cap) ?? undefined,
  });

  if (json) {
    const layered = { ...verdict, findings: verdict.findings.map((f) => ({ ...f, layer: layerOf(f.wcag) })) };
    // `structure` and `interaction` are included deliberately. They were omitted, so the machine-readable
    // output carried only the read-through and dropped every structural sweep and interaction probe --
    // the evidence behind most findings. A consumer reading this JSON could not tell "this page has no
    // links" from "links were never recorded", and the local judge's evidence guard, given exactly that,
    // suppressed a correct 4.1.2 finding scored at 0.993.
    console.log(JSON.stringify({
      url, task, screenReader: cap.screenReader, transcript: cap.transcript,
      structure: cap.structure, interaction: cap.interaction,
      ruleBased: ruleFindings, verdict: layered,
      // False when the capture could not be confirmed to have read the requested page. Findings from an
      // unverified capture may describe browser chrome, so a consumer must be able to refuse them.
      captureVerified,
      // WHY it is unverified, because the two causes need different explanations to a reader: reading the
      // wrong thing entirely, versus reading only a modal dialog that sat in front of the right page.
      ...(unverifiedReason ? { captureUnverifiedReason: unverifiedReason } : {}),
    }, null, 2));
  } else {
    printReport({ url, task, screenReader: cap.screenReader, announcements: cap.transcript.length, verdict, axe: ruleFindings });
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

function printReport(report: Report): void {
  console.log(reportLines(report).join("\n"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
