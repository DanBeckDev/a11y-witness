#!/usr/bin/env node
/**
 * a11y-witness CLI (control plane).
 *
 * Runs the whole pipeline in one command: ask a capture worker to drive a real
 * screen reader through the page, then judge the announcement transcript here
 * (the judge is our OWN trained scorer by default -- `JUDGE_BACKEND` has defaulted to `local` since
 * 2026-08-04, so there is no metered API cost and no rented model in the path. This line said "the
 * local Codex login", which was true of the previous default and had outlived it; `codex`,
 * `anthropic` and `openai` remain available for comparison and are never the default.)
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
import { scanWithAxe, axeAvailable, type AxeFinding, type AxeBrowserChannel } from "./scan/axe.js";
import { fetchPageTitle } from "./scan/page-title.js";
import { loadAxeResults, warnOnUrlMismatch } from "./scan/axe-results.js";
import { layerOf } from "@a11y-witness/judge/layers";
import { reportLines, type Report } from "./report.js";
import { leaseWorker, isAfterRun, type AfterRun } from "@a11y-witness/worker-fleet";
import { CAPTURE_CLIENT_TIMEOUT_MS } from "@a11y-witness/worker-fleet/worker-http";
import { captureTolerantly } from "@a11y-witness/worker-fleet/capture-client";
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
import { realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { parseFormsConfig, refuseIfWrongOrigin, FormsConfigError } from "./forms/config.js";
import { submissionPlan, formCoverage } from "./forms/coverage.js";
import { draftFormsConfig } from "./forms/draft.js";

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
  /**
   * Walk a few tab stops and press Escape, reporting what appeared on focus and whether Escape removed
   * it. Covers 1.4.13 Content on Hover or Focus — the Dismissable bullet.
   */
  probeFocusReveal: boolean;
  /** Run the optional axe-core layer. Off with --no-axe or A11Y_AXE=0. */
  axe: boolean;
  /**
   * Path to a forms config (ADR 0024). Explicit, never auto-discovered: one implicit config cannot
   * express more than one scenario, and instructing the tool to submit somebody's form should be
   * visible in the workflow file rather than inferred from a file being present.
   */
  formsConfig: string | null;
  /** Draft a forms config from what the screen reader announces on this page, and print it. */
  emitFormConfig: boolean;
  /** Say what WOULD be submitted, and submit nothing. */
  plan: boolean;
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
  + "[--forms <file>] [--emit-form-config] [--plan] "
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
    // ON as of 2026-09-05, and the FIRST probe here that presses ESCAPE on a page the user does not own.
    // The Tab half is free — `probeFocus` already walks the whole ring. Escape is the new keystroke and
    // it sits with Tab rather than with typing: it enters nothing into a field, submits nothing, and
    // writes to nobody's system; the most it can do is dismiss a dialog, which is a thing a visitor does.
    //
    // SET HERE AND IN `capture-real-pages.mjs` IN THE SAME COMMIT, because `probe-consent.test.ts`
    // requires it and its own header says what happens otherwise: those two copies drifted for nine days
    // and three criteria were validated on real pages through a path the product does not take.
    probeFocusReveal: true,
    formsConfig: null,
    emitFormConfig: false,
    plan: false,
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
  "--emit-form-config": (a) => { a.emitFormConfig = true; },
  "--plan": (a) => { a.plan = true; },
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
    case "--forms": args.formsConfig = argv[++i] ?? args.formsConfig; return i;
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

/**
 * `--plan`: say what would be submitted, and submit nothing.
 *
 * BEFORE the worker is leased, and that ordering is the whole point. A dry run that first starts a
 * Windows guest has already done something, and the question this answers — "what is this file about to
 * do to my site?" — must be answerable without doing any of it. It is also why this reads the config and
 * nothing else: no capture, no network, no worker.
 *
 * @returns true when the run is over
 */
async function planOnly(args: Args): Promise<boolean> {
  if (!args.plan) return false;
  if (!args.formsConfig) {
    process.stderr.write("--plan describes what a forms config would submit, so it needs --forms <file>.\n");
    process.exit(2);
  }
  const config = parseFormsConfig(await readFile(args.formsConfig, "utf8"), args.formsConfig);
  // The origin guard runs HERE too, not only on the real path. A plan against the wrong site would print
  // a reassuring page of intentions that describe a run which would have been refused.
  refuseIfWrongOrigin(config, args.url);
  console.log(submissionPlan(config.forms, config.origin).join("\n"));
  return true;
}

/**
 * The states this run will drive, in the order it will drive them.
 *
 * ERROR STATES FIRST, then file order. A success submission may navigate away, and the less destructive
 * state should have been observed before the one that completes the form — so a run that dies midway has
 * done the safer thing. `submissionPlan` sorts identically, which matters: a `--plan` that listed a
 * different order from the run would be a dry run describing something else.
 */
async function configuredStates(args: Args): Promise<FormStateRequest[]> {
  if (!args.formsConfig) return [];
  const config = parseFormsConfig(await readFile(args.formsConfig, "utf8"), args.formsConfig);
  refuseIfWrongOrigin(config, args.url);
  return config.forms.flatMap((form) => {
    for (const line of coverageLines(formCoverage(form))) process.stderr.write(`${line}\n`);
    return [...form.states]
      .sort((a, b) => Number(a.state === "success") - Number(b.state === "success"))
      .map((state) => ({ state: state.state, submit: form.submit, fields: state.fields }));
  });
}

/**
 * What this configuration can and cannot answer, said BEFORE the run rather than inferred after it.
 *
 * A criterion nobody supplied a state for is not a finding and not a pass; it is unconfigured, and the
 * reader needs to know which of the three they are looking at. Printing it up front also means a
 * misconfigured file is visible before any form is submitted.
 */
function coverageLines(coverage: ReturnType<typeof formCoverage>): string[] {
  return [
    `Form "${coverage.form}" — states configured: ${coverage.states.join(", ") || "none"}`,
    ...coverage.criteria.map((entry) => `  ${entry.criterion} ${entry.readiness}: ${entry.why}`),
  ];
}

async function main(): Promise<void> {
  const args = parseArgs();
  if (await planOnly(args)) return;
  const lease = await leaseWorker(args);
  // finally, not a catch: the VM must be released whether the run succeeded, threw, or the
  // judge rejected the capture. Leaking a running Windows guest is the failure mode this
  // whole module exists to prevent.
  try {
    const states = await configuredStates(args);
    if (states.length === 0) {
      await runWitness({ ...args, worker: lease.worker });
    } else {
      // ONE RUN PER STATE, through the ordinary pipeline. Reusing `runWitness` rather than building a
      // second reporting path is deliberate: a configured run and an unconfigured one must produce
      // evidence and a report of the same shape, or every consumer downstream needs to know which it is
      // holding — which is the fact-stated-twice defect with a report attached.
      for (const [index, formState] of states.entries()) {
        process.stderr.write(`\n=== form state ${index + 1}/${states.length}: `
          + `"${formState.state}" via "${formState.submit}" ===\n`);
        await runWitness({ ...args, worker: lease.worker, formState });
      }
    }
  } finally {
    await lease.release();
  }
}

type RunOptions = Omit<Args, "worker"> & { worker: string; formState?: FormStateRequest };

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
    probeNavigation: boolean; probeFocusContext: boolean; probeFocusReveal: boolean;
    formState?: FormStateRequest },
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
 * Obtain the evidence — both layers, verified against the page we asked for.
 *
 * Extracted when `runWitness` crossed the physical-line budget, and it earns a name: everything here is
 * ACQUISITION, and everything after it is interpretation. The two run on different clocks (this half is
 * network- and worker-bound; the other is pure) and fail for unrelated reasons, which is the seam.
 */
async function captureAndScan(
  { url, task, worker, probeForms, probeFocus, probeNavigation, probeFocusContext, probeFocusReveal,
    wantAxe, axeResults, formState }: {
    url: string; task: string; worker: string; probeForms: boolean; probeFocus: boolean;
    probeNavigation: boolean; probeFocusContext: boolean; probeFocusReveal: boolean; wantAxe: boolean;
    axeResults: string | null; formState?: FormStateRequest;
  },
): Promise<{ cap: CaptureResponse; axe: Awaited<ReturnType<typeof pageContext>> }> {
  const ruleLayer = await chooseRuleLayer({ wantAxe, axeResults });
  process.stderr.write(`Scanning ${url} (${ruleLayer === "none" ? "" : "rule-based axe-core + "}real screen reader) ...\n`);
  // Layer 1 (rule-based, local) and capture (lived-experience, remote worker)
  // load the same URL independently, so run them concurrently. axe failure is
  // non-fatal: we still report the lived-experience layer.
  const [firstCap, axe] = await Promise.all([
    captureViaWorker(url,
      { task, worker, probeForms, probeFocus, probeNavigation, probeFocusContext, probeFocusReveal, formState }),
    pageContext(url, ruleLayer, axeResults),
  ]);
  // `null` when the rule layer did not run, so "unchecked" can never be mistaken for "clean". Both
  // output paths must use THIS, not `axe.findings`: the human report already did
  // (`ruleLayer === "none" ? null : ...`) while the --json path emitted the bare array, so `--no-axe`
  // produced `"ruleBased": []` and any consumer rendered it as "0 violations". The text report and the
  // JSON disagreed about whether contrast had been checked, and the JSON was the one that lied.
  // `pageContext` decides this now — see its header. The ternary that used to live here knew only about
  // `--no-axe` and rendered a FAILED scan as "0 violations". The caller reads it off the returned result
  // for that reason: there must be exactly one place this is derived.

  // Verify-and-retry (the Root-1 fix, brought to the product). Browser focus on
  // the worker can be racy, so NVDA sometimes reads chrome instead of the page.
  const cap = await recaptureUntilItReadsThePage(firstCap, axe.title,
    { url, task, worker, probeForms, probeFocus, probeNavigation, probeFocusContext, probeFocusReveal, formState });
  return { cap, axe };
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
    probeFocusReveal, emitFormConfig, formState, axe: wantAxe, axeResults }: RunOptions,
): Promise<void> {
  const { cap, axe } = await captureAndScan(
    { url, task, worker, probeForms, probeFocus, probeNavigation, probeFocusContext, probeFocusReveal,
      wantAxe, axeResults, formState });
  const ruleFindings = axe.findings;
  // A draft needs the ANNOUNCEMENTS and nothing downstream of them, so it returns before the judge runs.
  // Scoring a page in order to print a config skeleton would spend a model pass on an answer nobody asked
  // for, and would make `--emit-form-config` fail on a page the scorer abstains from.
  if (emitFormConfig) return emitDraft(cap, url);
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
//
// EXPORTED, and `isAvailable` is INJECTABLE, for the same reason `axeAvailable` itself takes a `deps`
// parameter: a test must drive the REAL decision, not a copy of it. This is the one place that decides
// whether an unavailable rule layer gets REPORTED (a stderr line naming the exact fix, and `findings:
// null` -- never `[]` -- flowing through to "not run. Visual criteria are unchecked, not clean." in the
// printed report) or is silently absorbed. `chooseRuleLayer.test.ts` reproduces the chain end to end
// rather than asserting on this function's shape.
export async function chooseRuleLayer({ wantAxe, axeResults }: { wantAxe: boolean; axeResults: string | null },
  isAvailable: () => Promise<boolean> = axeAvailable): Promise<RuleLayer> {
  if (axeResults) return "import";
  if (!wantAxe) return "none";
  if (await isAvailable()) return "run";
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
Promise<{ findings: AxeFinding[] | null; title: string; coverage: RuleLayerCoverage;
  browserChannel: AxeBrowserChannel | null }> {
  if (layer === "import" && axeResults) {
    const imported = await loadAxeResults(axeResults);
    warnOnUrlMismatch(imported.scannedUrl, url);
    process.stderr.write(`Using ${imported.findings.length} imported axe violation(s) from ${axeResults}\n`);
    return { findings: imported.findings, title: await fetchPageTitle(url), coverage: imported.coverage,
      browserChannel: null };
  }
  if (layer === "none") {
    return { findings: null, title: await fetchPageTitle(url), coverage: {}, browserChannel: null };
  }
  return scanWithAxe(url).then((result) => {
    // WHICH BROWSER ANSWERED, reported rather than assumed — see `launchBrowser`. The Action skips the
    // bundled download deliberately, so seeing "msedge" there is the fallback working as designed, not a
    // warning; seeing it locally on a machine with no Edge would be the warning.
    process.stderr.write(`axe-core: ran via ${result.browserChannel === "chromium"
      ? "the bundled Chromium" : "the system Edge (channel: msedge)"}\n`);
    return result;
  }).catch(async (e: Error) => {
    process.stderr.write(`axe-core scan failed (continuing without it): ${e.message}\n`);
    // NULL, not []. The visual criteria are unchecked, and saying "0 violations" here would be the one
    // thing this tool must never do. `coverage: {}` is the same statement per criterion: a scan that
    // THREW examined nothing, so nothing may be reported as examined-and-clean.
    return { findings: null, title: await fetchPageTitle(url), coverage: {}, browserChannel: null };
  });
}

export interface CaptureRequest {
  task: string;
  worker: string;
  probeForms: boolean;
  probeFocus: boolean;
  probeNavigation: boolean;
  probeFocusContext: boolean;
  probeFocusReveal: boolean;
  /**
   * ONE declared state (ADR 0024), or none.
   *
   * One per capture and never several, because an error submission leaves a dirty form and an error
   * banner, and a success submission may navigate away — so a second state cannot start from the first.
   * The host issues a capture per state for that reason, rather than the worker looping.
   */
  formState?: FormStateRequest;
}

/** The resolved state as it goes over the wire: names and values, with the schema already checked. */
interface FormStateRequest {
  state: string;
  submit: string;
  fields: { field: string; within?: string; nth?: number; value?: string; choose?: string; check?: boolean }[];
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
// `CAPTURE_HARD_TIMEOUT_DEFAULT_MS + 40_000`, which was 560_000 at the time -- byte for byte the value
// `worker-http.mjs` already exported, arrived at a second way and paid for with an import of
// `@a11y-witness/nvda-worker`. That package is NOT a dependency of this one (isolation-smoke.mjs asserts
// it must not be, "the CLI speaks HTTP to a worker"), so the published bundle imported something npm
// never installed -- and it reached guidepup, which throws at import wherever there is no screen reader.
// Found by `no-win32-imports.test.ts`; `budget-ladder.test.ts` already treats an unresolvable ceiling as
// "it comes from the shared constant", which is now true here.
//
// The number moved to 620_000 on architecture-audit.md §14.5, for a reason that has nothing to do with
// the story above: the worker's true worst case also includes desktop preparation, not just the hard
// timeout. Importing rather than recomputing is what makes that a one-file change.

/**
 * THROUGH `captureTolerantly` NOW, not a bare `requestJson` POST — architecture-audit.md §5, item 6.
 *
 * This was the one caller of ten that sent no `captureId`, so the async-dispatch, poll and lost-response
 * recovery every lab client already had (see `@a11y-witness/worker-fleet/capture-client`) was unavailable
 * to the one caller that is a real user: a dropped response here used to mean the page was silently never
 * examined, on a capture that may already have completed. `captureTolerantly` mints its own id, so this
 * function's only job is the request BODY and turning a transport failure into a message about the page,
 * not about a Map or a protocol.
 */
export async function captureViaWorker(
  url: string,
  { task, worker, probeForms, probeFocus, probeNavigation, probeFocusContext, probeFocusReveal,
    formState }: CaptureRequest,
): Promise<CaptureResponse> {
  let res: { status: number; ok: boolean; text: string; json: unknown };
  try {
    res = await captureTolerantly({
      worker,
      body: { url, task, probeForms, probeFocus, probeNavigation, probeFocusContext, probeFocusReveal,
        // Omitted rather than sent as null when absent: an older worker reads known fields only, so an
        // absent key is the same "no configured form" it has always understood. Additive, like `fault`.
        ...(formState ? { formState } : {}) },
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

/**
 * Print a forms-config skeleton drawn from what NVDA announced on this page.
 *
 * To STDOUT with the diagnostics on stderr, so `--emit-form-config > forms.yml` produces a file that
 * loads. A draft printed with a banner in front of it is a draft the author has to edit before the parser
 * will take it, which defeats the point of generating it.
 */
function emitDraft(cap: CaptureResponse, url: string): void {
  const fields = (cap.structure?.formFields ?? []) as string[];
  const draft = draftFormsConfig(fields, { origin: new URL(url).origin });
  if (draft.unparsed.length) {
    // Ours, and said as ours. An author cannot fix this tool's announcement grammar and must not be sent
    // looking for a defect on their page that belongs to us.
    process.stderr.write(`${draft.unparsed.length} announcement(s) could not be read by this tool's `
      + "grammar and are listed in the draft. That is a gap in a11y-witness, not a finding about the "
      + "page.\n");
  }
  if (draft.unnamed.length) {
    // On STDERR so it survives a redirect to a file, because it is the half of the output that is a
    // FINDING rather than a template. A field NVDA announced with no name cannot be addressed by this
    // config and cannot be addressed by a screen reader user either — that is 4.1.2, reported whether or
    // not this form is ever configured.
    process.stderr.write(`${draft.unnamed.length} form field(s) have NO accessible name and are named in `
      + "comments in the draft. That is a 4.1.2 finding about the page, not a gap in the config.\n");
  }
  console.log(draft.yaml);
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
 *
 * `process.argv[1]` is REALPATH'D before comparison, and this is not optional. `import.meta.url` is
 * canonicalised by Node's ESM loader (it resolves symlinks), while `process.argv[1]` is the raw invocation
 * path — so on any path that passes through a symlink they disagree and this guard silently reads FALSE.
 * `/var` and `/tmp` are themselves symlinks to `/private/var` and `/private/tmp` on every macOS install,
 * and `os.tmpdir()` returns a `/var/folders/...` path — which is where `npx` stages a package before running
 * it. So the installed bin ran, loaded, and did NOTHING: no output, exit 0, because `main()` was never
 * called and nothing downstream knew a check had even been skipped. Reproduced with a three-line script
 * invoked through `/tmp/...` instead of its `/private/tmp/...` realpath before this was believed; the
 * isolation smoke test only ever checked the bin FILE EXISTS, never that running it does anything, which is
 * exactly how this survived every `gate:isolation` run there has ever been.
 */
const isProgram = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;

if (isProgram) main().catch((err: unknown) => {
  // `console.error(err)` printed a Node stack trace as the entire user-facing output on the first real
  // website this was pointed at. A stack is for whoever is fixing the tool; a user needs the reason.
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`\n${message}\n`);
  if (process.argv.includes("--debug") && err instanceof Error && err.stack) {
    process.stderr.write(`\n${err.stack}\n`);
  }
  // A CONFIG error is the author's to fix and a tool failure is ours, so they exit differently. A CI job
  // that treats every non-zero exit as "the scan broke" will retry a malformed forms file for ever;
  // exit 2 says the input is wrong and retrying it will not help.
  process.exit(err instanceof FormsConfigError ? 2 : 1);
});
