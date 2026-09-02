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
 * needed and puts it back how it found it afterwards. See leaseWorker in @a11y-witness/worker-fleet.
 * Set A11Y_SHADOW_MODEL=1 to run the verified local screen-reader scorer beside the existing
 * judge. Shadow output is log-only and never changes findings.
 */
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { judge } from "@a11y-witness/judge";
import { scanWithAxe, axeAvailable, type AxeFinding } from "./scan/axe.js";
import { fetchPageTitle } from "./scan/page-title.js";
import { loadAxeResults, warnOnUrlMismatch } from "./scan/axe-results.js";
import { layerOf } from "@a11y-witness/judge/layers";
import { reportLines, type Report } from "./report.js";
import { leaseWorker, isAfterRun, type AfterRun } from "@a11y-witness/worker-fleet";
import { requestJson, CAPTURE_CLIENT_TIMEOUT_MS } from "@a11y-witness/worker-fleet/worker-http";
import type { CaptureStructure } from "@a11y-witness/evidence";
import type { RuleLayerCoverage } from "@a11y-witness/judge/outcomes";
import { captureDoubt, captureMentionsTitle, oracleCounts, type CaptureDoubt } from "@a11y-witness/evidence/verify";
import { scorerPaths as scorerArtefact } from "@a11y-witness/scorer";
import { conformanceScope, sweepOutcomes, truncatedSweeps, censusFromDiagnostics,
  censusCountsDistinctNames, type ConformanceRequirement }
  from "@a11y-witness/evidence/conformance";
import { assessedCriteria } from "@a11y-witness/judge/coverage";
import { earlReport } from "@a11y-witness/evidence/earl";
import { criterionOutcomes, type CriterionOutcome } from "@a11y-witness/judge/outcomes";

interface Args {
  url: string;
  task: string;
  /** null when the user named no worker, which is what enables local-VM management. */
  worker: string | null;
  after: AfterRun;
  json: boolean;
  debug: boolean;
  probeForms: boolean;
  /** Tab through the page and report focus. Covers 2.1.2 No Keyboard Trap. */
  probeFocus: boolean;
  /**
   * Follow the FIRST LINK and report the title either side. Covers 2.4.1 Bypass Blocks (an inert skip
   * link) and 2.4.2 Page Titled (a route that changes without the title following it).
   */
  probeNavigation: boolean;
  /** Focus the first few controls and report the title either side. Covers 3.2.1 On Focus. */
  probeFocusContext: boolean;
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
  "[--after restore|stop|pause|leave] [--json] [--debug] [--probe-forms] [--no-probe-focus] "
  + "[--no-probe-navigation] [--no-probe-focus-context] "
  + "[--no-axe] [--axe-results <file>]";

function defaultArgs(): Args {
  return {
    url: "",
    task: "Read and understand this page",
    worker: process.env.A11Y_WORKER ?? null,
    after: parsedAfterRun(),
    json: false,
    debug: false,
    // OFF here, ON in the GitHub Action, and the asymmetry is deliberate. `--probe-forms` ACTIVATES
    // controls: a submit-like button, or one your task names. A workflow runs against your own
    // application, where submitting is the intended act and an unannounced error is only reachable by
    // submitting. This CLI can be aimed at any URL on the internet, and pressing *Book* or *Send* on
    // somebody else's production site is not a review. So the risky default follows who owns the page.
    probeForms: false,
    // ON, unlike probe-forms, and the difference is side effects: Tab moves focus and activates nothing,
    // so it is safe on a page you do not own. 2.1.2 is also a NON-INTERFERENCE criterion — WCAG §5.2.5
    // applies it to all content whether or not it is relied upon — and a keyboard trap is total: a user
    // who cannot leave a control cannot use the rest of the page. It costs ~8 s per capture.
    probeFocus: true,
    // ON, on the same side of the consent line as `probeFocus` and for the same reason: following a
    // link is ordinary browsing -- the thing this tool already did to reach the page -- where
    // submitting a form writes to somebody's system. On essentially every real page the first link IS
    // the skip link, which is exactly what 2.4.1 exists to test.
    //
    // These two defaulted to ABSENT until 2026-09-02, and the cost was the shape this repo names most
    // often: a gate that does not exercise what ships. `capture-real-pages.mjs` has set both since
    // 2026-08-24, so the 86-conformant-page validation behind `addInertSkipLink`, `addStaleRouteTitle`
    // and 3.2.1 was gathered with flags THE PRODUCT COULD NOT SEND. Three criteria the README headlines
    // as unreachable by a static analyser were unreachable by this CLI too, silently, because an
    // un-asked probe returns an empty channel and an empty channel is what a clean page looks like.
    // `observed` is why that was merely invisible rather than a false pass -- it recorded `asked: false`
    // the whole time, and nothing in the product read it back to the user.
    probeNavigation: true,
    probeFocusContext: true,
    axe: process.env.A11Y_AXE !== "0",
    axeResults: process.env.A11Y_AXE_RESULTS ?? null,
  };
}

// Applies one argument and returns the index it consumed up to, so value-taking flags can
// swallow their value. Split out of parseArgs to keep each side simple: this one knows the
// flags, parseArgs knows the loop and the validation.
/**
 * Apply one argv token. EXPORTED for tests, and that is the whole reason this file had none: it exported
 * nothing, so nothing could import it. Argument handling is pure and this project has already paid for
 * getting it wrong — `--worker=http://:8765` was accepted and burned 29 minutes before anything noticed.
 *
 * The two halves are split by SHAPE, not by taste: a flag that swallows the next token has to move `i`,
 * and one that does not cannot. Keeping the value-taking four in the switch means `i` is only reassigned
 * where that is the point, and the boolean flags become a table that grows without touching control flow
 * — which is what pushed this function past the complexity gate when 3.2.1's and 2.4.1's arrived.
 */
const BOOLEAN_FLAGS: Readonly<Record<string, (args: Args) => void>> = Object.freeze({
  "--json": (a) => { a.json = true; },
  "--debug": (a) => { a.debug = true; },
  "--probe-forms": (a) => { a.probeForms = true; },
  "--no-probe-focus": (a) => { a.probeFocus = false; },
  "--no-probe-navigation": (a) => { a.probeNavigation = false; },
  "--no-probe-focus-context": (a) => { a.probeFocusContext = false; },
  "--no-axe": (a) => { a.axe = false; },
});

export function applyArg(args: Args, argv: string[], i: number): number {
  const v = argv[i];
  const setBoolean = BOOLEAN_FLAGS[v];
  if (setBoolean) { setBoolean(args); return i; }
  switch (v) {
    case "--task": args.task = argv[++i] ?? args.task; return i;
    case "--worker": args.worker = argv[++i] ?? args.worker; return i;
    case "--after": args.after = afterRunArg(argv[++i]); return i;
    case "--axe-results": args.axeResults = argv[++i] ?? args.axeResults; return i;
    default:
      if (!v.startsWith("--")) args.url = v;
      return i;
  }
}

/** ARGV as a parameter, so a test needs no `process.argv`, and `main()` passes the real one. */
export function parseArgs(argv: string[] = process.argv.slice(2)): Args {
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

export interface CaptureResponse {
  url: string;
  screenReader: string;
  transcript: string[];
  /** A subset of the wire type, derived — known-gaps §15. `Pick` keeps the omission meaningful. */
  structure?: Pick<CaptureStructure, "headings" | "landmarks" | "formFields">;
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
// Both of these were resolved against `process.cwd()`, so the shadow scorer ran only when the CLI happened
// to be invoked from the repo root — the same defect M0 found in `local-judge.ts`. The program's path now
// comes from `@a11y-witness/scorer`, which resolves it from its own module; the interpreter is still
// overridable, because choosing a Python is the caller's business and a Windows runner has no venv.
const SHADOW_PYTHON = process.env.A11Y_SHADOW_PYTHON
  ?? fileURLToPath(new URL("../.venv/bin/python", import.meta.url));
const SHADOW_SCORER = scorerArtefact().scoreScript;

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

/**
 * Re-capture while the transcript does not appear to be about the page.
 *
 * axe gives us the page title; a capture that never says it probably read something else — Edge's image
 * magnifier overlay did exactly this on gov.uk, three attempts running. A retry is worth it because that fault
 * is usually transient (a window that had not taken focus yet).
 *
 * Reachability is deliberately NOT checked here: a consent wall is present on every attempt, so retrying buys
 * three captures and the same answer. `captureDoubt` handles that afterwards, once, and carries it in the
 * result rather than only warning.
 */
async function recaptureUntilItReadsThePage(
  first: CaptureResponse,
  title: string,
  options: { url: string; task: string; worker: string; probeForms: boolean; probeFocus: boolean;
    probeNavigation: boolean; probeFocusContext: boolean },
): Promise<CaptureResponse> {
  let cap = first;
  const { url, ...captureOptions } = options;
  for (let attempt = 2; attempt <= MAX_CAPTURE_ATTEMPTS && !captureMentionsTitle(cap, title); attempt++) {
    process.stderr.write(`Capture did not appear to read "${title}" (wrong content?); re-capturing (attempt ${attempt}/${MAX_CAPTURE_ATTEMPTS}) ...\n`);
    cap = await captureViaWorker(url, captureOptions);
  }
  return cap;
}

/**
 * What the run says about the capture BEFORE judging it — diagnostics on request, and the one warning that
 * has to survive an empty transcript.
 *
 * Extracted because `function-size.test.ts` refused `runWitness` at 92 physical lines against a budget of
 * 90, and it was right to: this is a distinct phase, it reads as one, and the gate exists precisely
 * because ESLint's `skipComments: true` lets a comment-dense function grow to twice its stated budget
 * without complaint.
 *
 * @param cap the capture, already verified or not
 * @param debug whether the caller asked for the diagnostic marks
 */
function reportOnTheCapture(cap: CaptureResponse, debug: boolean): void {
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
}

async function runWitness(
  { url, task, worker, json, debug, probeForms, probeFocus, probeNavigation, probeFocusContext,
    axe: wantAxe, axeResults }: RunOptions,
): Promise<void> {
  const ruleLayer = await chooseRuleLayer({ wantAxe, axeResults });
  process.stderr.write(`Scanning ${url} (${ruleLayer === "none" ? "" : "rule-based axe-core + "}real screen reader) ...\n`);
  // Layer 1 (rule-based, local) and capture (lived-experience, remote worker)
  // load the same URL independently, so run them concurrently. axe failure is
  // non-fatal: we still report the lived-experience layer.
  const [firstCap, axe] = await Promise.all([
    captureViaWorker(url, { task, worker, probeForms, probeFocus, probeNavigation, probeFocusContext }),
    pageContext(url, ruleLayer, axeResults),
  ]);
  // `null` when the rule layer did not run, so "unchecked" can never be mistaken for "clean". Both
  // output paths must use THIS, not `axe.findings`: the human report already did
  // (`ruleLayer === "none" ? null : ...`) while the --json path emitted the bare array, so `--no-axe`
  // produced `"ruleBased": []` and any consumer rendered it as "0 violations". The text report and the
  // JSON disagreed about whether contrast had been checked, and the JSON was the one that lied.
  // `pageContext` decides this now — see its header. The ternary that used to live here knew only about
  // `--no-axe` and rendered a FAILED scan as "0 violations".
  const ruleFindings = axe.findings;

  // Verify-and-retry (the Root-1 fix, brought to the product). Browser focus on
  // the worker can be racy, so NVDA sometimes reads chrome instead of the page.
  const cap = await recaptureUntilItReadsThePage(firstCap, axe.title,
    { url, task, worker, probeForms, probeFocus, probeNavigation, probeFocusContext });
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

  reportOnTheCapture(cap, debug);

  process.stderr.write(`Captured ${cap.transcript.length} announcements; judging ...\n`);
  await shadowScreenReaderCapture(cap);
  const verdict = await judge({
    url: cap.url,
    task,
    screenReader: cap.screenReader,
    transcript: cap.transcript,
    structure: cap.structure,
    interaction: cap.interaction,
    // The oracle counts, so the rules that assert an ABSENCE can corroborate it. Without these a page
    // with no headings and a capture that failed to reach them are the same input.
    ...oracleCounts(cap),
  });

  const conformance = conformanceFor(cap, ruleFindings);
  // Per-criterion ACT outcomes. `truncatedSweeps` is what turns Conformance Requirement 2 into something
  // per-criterion: a link sweep that stopped at its cap makes 2.4.4 `cantTell`, not `passed`.
  const outcomes = criterionOutcomes({
    capture: cap,
    findings: verdict.findings,
    abstained: verdict.abstained === true,
    truncatedSweeps: truncatedSweeps(sweepOutcomes(cap.diagnostics ?? [])),
    // The SECOND way a sweep is short: it ended cleanly and still missed something. Without this a
    // capture whose landmark sweep found 0 of 1 reported 1.3.1 as "examined in full".
    completeness: oracleCounts(cap).completeness,
    // The SECOND assessor. Without it every criterion outside the screen-reader layer printed "No
    // assessor in this tool covers this criterion" -- in a run that had just started by announcing
    // "rule-based axe-core + real screen reader".
    ruleLayer: axe.coverage,
  });
  if (json) {
    printJson({
      url, task, cap, verdict, ruleFindings, captureVerified, unverifiedReason, conformance, outcomes,
    });
  } else {
    printReport({
      url, task, screenReader: cap.screenReader, announcements: cap.transcript.length,
      verdict, axe: ruleFindings, conformance, outcomes,
    });
  }
}

/**
 * What this run establishes against WCAG's five conformance requirements (§5.2).
 *
 * Built from the capture rather than assumed, because Requirement 2 (Full pages) turns on whether the
 * sweeps actually reached the end of the page — and `environment` carries the exact screen-reader and
 * browser versions Requirement 4 scopes the claim to.
 *
 * `assessedCriteria` is what the shipped assessors can return a finding for, and NOT what we captured
 * evidence about. `interaction.focusOrder` is the cautionary case: the worker records it, no rule or
 * scorer head reads it, so counting it would report a criterion as covered while a keyboard trap in that
 * array reached nobody.
 */
/**
 * What this run can and cannot claim, from a capture. EXPORTED because it is pure over a capture object,
 * and this repo has 2,122 real captures on disk — so it is testable against evidence a real screen reader
 * produced, not against a hand-written shape somebody imagined.
 */
export function conformanceFor(cap: CaptureResponse, axe: AxeFinding[] | null): ConformanceRequirement[] {
  const env = (cap as { environment?: Record<string, string> }).environment ?? {};
  const version = (name: string, ver: string): string | null =>
    env[name] ? `${env[name]}${env[ver] ? ` ${env[ver]}` : ""}` : null;
  // Read from the DIAGNOSTIC MARK, not from a capture field, and deliberately so. The census is the AX tree's
  // own element count, and `capture-core` keeps it out of the evidence on purpose: "a completeness ORACLE and
  // never evidence -- the accessibility tree is barred from being a model feature". Promoting it to a field
  // would breach that boundary and invalidate every cached capture for a number already on the wire.
  //
  // `crossCheckStructure` computes the same sweep-versus-census comparison for the diagnostics. This is the
  // REPORTING path for it, and it existed unread: the disagreement that answers "how much of the page did you
  // examine?" was being written to a diagnostic every run and shown to nobody.
  // Named once. Three readers of the same cast-and-default is repetition the complexity gate correctly
  // refused at 16, and the third was added the moment a fourth reader would have been.
  const diagnostics = (cap as { diagnostics?: unknown[] }).diagnostics ?? [];
  const census = censusFromDiagnostics(diagnostics);
  const structure = (cap.structure ?? {}) as Record<string, unknown[] | undefined>;
  return conformanceScope({
    assessedCriteria: assessedCriteria(),
    sweeps: sweepOutcomes(diagnostics),
    censusCountsDistinctNames: censusCountsDistinctNames(diagnostics),
    screenReader: version("screenReader", "screenReaderVersion") ?? cap.screenReader,
    browser: version("browser", "browserVersion"),
    ruleLayerRan: axe !== null,
    census: census ?? null,
    // Singular keys to match the census vocabulary; the structure fields are plural.
    swept: {
      heading: structure.headings?.length ?? 0,
      landmark: structure.landmarks?.length ?? 0,
      link: structure.links?.length ?? 0,
      graphic: structure.graphics?.length ?? 0,
    },
  });
}

/**
 * The machine-readable result, for CI and for anything downstream of this tool.
 *
 * `structure` and `interaction` are included DELIBERATELY. They were omitted once, so this output carried only
 * the read-through and dropped every structural sweep and interaction probe — the evidence behind most
 * findings. A consumer reading it could not tell "this page has no links" from "links were never recorded",
 * and the local judge's evidence guard, given exactly that, suppressed a correct 4.1.2 finding scored at 0.993.
 */
function printJson(
  { url, task, cap, verdict, ruleFindings, captureVerified, unverifiedReason, conformance, outcomes }: {
    url: string; task: string; cap: CaptureResponse; verdict: Report["verdict"];
    ruleFindings: AxeFinding[] | null; captureVerified: boolean; unverifiedReason?: CaptureDoubt;
    conformance: ConformanceRequirement[]; outcomes: CriterionOutcome[];
  },
): void {
  const layered = { ...verdict, findings: verdict.findings.map((f) => ({ ...f, layer: layerOf(f.wcag) })) };
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
    // WCAG §5.2's five conformance requirements, each with what this run established and what it did
    // NOT. In the machine-readable output as well as the printed report, because a CI job deciding
    // whether to fail a build needs the limits as much as a human does — and a consumer that sees only
    // `findings: []` is the reader most likely to conclude the page is fine.
    conformance,
    // Per-criterion ACT outcomes: failed / cantTell / passed / inapplicable / untested. This matters most
    // in the MACHINE-readable output, because a CI job reading `findings: []` has no other way to tell
    // "clean" from "we could not check it" — and it will fail or pass a build on that difference.
    outcomes,
    // The same outcomes as EARL, the W3C's vendor-neutral vocabulary for test results, so a team already
    // aggregating axe or Lighthouse can merge these without writing a parser for our shape. Emitted
    // always rather than behind a flag, because an export nobody can reach is the defect this session
    // already found twice: `probeFocus` and `focusOrder` were both exactly that.
    earl: earlReport({
      url,
      date: new Date().toISOString(),
      environment: [
        cap.environment?.screenReader, cap.environment?.screenReaderVersion,
        cap.environment?.browser, cap.environment?.browserVersion,
      ].filter(Boolean).join(" "),
      toolVersion: process.env.npm_package_version ?? "0.1.0",
      outcomes,
    }),
  }, null, 2));
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
/**
 * `findings: null` means THE RULE LAYER PRODUCED NO RESULTS, which is not the same as finding none.
 *
 * A FAILED axe scan returned `[]`, and the caller decided nullness from the layer NAME alone — so a scan
 * that was requested, ran and threw rendered as "Rule layer (axe-core): 0 violations". A clean bill of
 * health for a scan that did not happen. The caller's own comment describes that defect and had fixed it
 * for `--no-axe` only: the remedy reached one of the two paths producing no results.
 *
 * Decided here now, by the function that knows. There is no second place to get it wrong.
 */
async function pageContext(url: string, layer: RuleLayer, axeResults: string | null):
Promise<{ findings: AxeFinding[] | null; title: string; coverage: RuleLayerCoverage }> {
  if (layer === "import" && axeResults) {
    const imported = await loadAxeResults(axeResults);
    warnOnUrlMismatch(imported.scannedUrl, url);
    process.stderr.write(`Using ${imported.findings.length} imported axe violation(s) from ${axeResults}\n`);
    return { findings: imported.findings, title: await fetchPageTitle(url), coverage: imported.coverage };
  }
  if (layer === "none") return { findings: null, title: await fetchPageTitle(url), coverage: {} };
  return scanWithAxe(url).catch(async (e: Error) => {
    process.stderr.write(`axe-core scan failed (continuing without it): ${e.message}\n`);
    // NULL, not []. The visual criteria are unchecked, and saying "0 violations" here would be the one
    // thing this tool must never do. `coverage: {}` is the same statement per criterion: a scan that
    // THREW examined nothing, so nothing may be reported as examined-and-clean.
    return { findings: null, title: await fetchPageTitle(url), coverage: {} };
  });
}

interface CaptureRequest {
  task: string;
  worker: string;
  probeForms: boolean;
  probeFocus: boolean;
  probeNavigation: boolean;
  probeFocusContext: boolean;
}

/**
 * How long to wait for a capture, measured against the WORKER's own bound rather than guessed.
 *
 * The margin is deliberate: the worker is the component that knows why a capture failed, and it must always
 * be the one that gets to say so — a client that gives up first replaces a diagnosis with "no answer".
 *
 * This comment used to state the real defect and then not fix it: `fetch`'s ~300 s headers timeout sits BELOW
 * the worker's 520 s hard timeout, so `scan` died with `UND_ERR_HEADERS_TIMEOUT` on any page that took longer
 * than five minutes, and the number below never applied. `AbortSignal.timeout()` does not govern that cap;
 * only a different client does. Measured, and the reason `requestJson` exists — see worker-http.mjs.
 */
// The SHARED ceiling, imported rather than recomputed. This was
// `CAPTURE_HARD_TIMEOUT_DEFAULT_MS + 40_000`, which is 560_000 -- byte for byte the value
// `worker-http.mjs` already exports, arrived at a second way and paid for with an import of
// `@a11y-witness/nvda-worker`. That package is NOT a dependency of this one (isolation-smoke.mjs asserts
// it must not be, "the CLI speaks HTTP to a worker"), so the published bundle imported something npm
// never installed -- and it reached guidepup, which throws at import wherever there is no screen reader.
// Found by `no-win32-imports.test.ts`; `budget-ladder.test.ts` already treats an unresolvable ceiling as
// "it comes from the shared constant", which is now true here.

async function captureViaWorker(
  url: string,
  { task, worker, probeForms, probeFocus, probeNavigation, probeFocusContext }: CaptureRequest,
): Promise<CaptureResponse> {
  let res: { status: number; ok: boolean; text: string; json: unknown };
  try {
    res = await requestJson(`${worker}/capture`, {
      method: "POST",
      body: { url, task, probeForms, probeFocus, probeNavigation, probeFocusContext },
      timeoutMs: CAPTURE_CLIENT_TIMEOUT_MS,
    });
  } catch (error) {
    // A transport failure is not an accessibility finding, and it must not read like one.
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Could not reach the capture worker at ${worker} (${reason}).\n`
      + `The page was not examined, so this report would say nothing about it. Check the worker is `
      + `answering: curl ${worker}/health`,
      { cause: error },
    );
  }
  if (!res.ok) {
    throw new Error(`Worker error ${res.status}: ${res.text}`);
  }
  return res.json as CaptureResponse;
}

function printReport(report: Report): void {
  console.log(reportLines(report).join("\n"));
}

/**
 * Run ONLY when this file is the program, never when it is imported.
 *
 * Without this guard, importing `cli.ts` runs the CLI: a test that merely imported it printed USAGE and
 * exited 1 before a single assertion. That is the structural reason this file had no tests — not that its
 * logic is hard to test. `entry-points.test.ts` asserts this property for scripts reached through
 * `package.json`; the CLI is reached through a bin and slipped past it.
 */
const isProgram = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isProgram) main().catch((err: unknown) => {
  // `console.error(err)` printed a Node stack trace as the entire user-facing output on the first real
  // website this was pointed at. A stack is for whoever is fixing the tool; a user needs the reason.
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`\n${message}\n`);
  if (process.argv.includes("--debug") && err instanceof Error && err.stack) {
    process.stderr.write(`\n${err.stack}\n`);
  }
  process.exit(1);
});
