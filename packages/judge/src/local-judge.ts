/**
 * The judge with no rented expert: our own trained scorer, plus a deterministic evidence guard.
 *
 * ## Why this exists
 *
 * `judge.ts` is GENERATIVE — an LLM reads the transcript and both finds and describes problems. That
 * needs an account and a network, so the GitHub Action was built around a hosted key. But
 * `docs/local-model.md` describes an LLM-free path: the scorer answers "does this evidence support
 * criterion X?", and "a report explanation can then be rendered from the captured evidence and a fixed
 * WCAG template."
 *
 * The scorer takes a WHOLE capture and returns one score per criterion — it does not need candidate
 * findings generated for it, which is what `score_records` does today and what
 * `score-screenreader-model.py --stdin` already accepts. 87 MB encoder, 27 KB of heads, milliseconds.
 *
 * ## The guard is defence in depth, and the first diagnosis of WHY was wrong
 *
 * On a real capture of a page whose only fault was an unnamed icon button, the model predicted three
 * criteria — 4.1.2 at 0.993 (correct), 3.3.2 at 0.495 and 2.4.4 at 0.190 on a page containing NO LINKS.
 * I read that as threshold drift: calibration tuned for a paired dataset rather than for reporting on one
 * page, and wrote this guard to remove it.
 *
 * That was the wrong cause. The capture was being fed to the model with `structure` and `interaction`
 * MISSING, because the CLI's `--json` output dropped them — so 29 of the model's structured features read
 * zero and its scores went noisy. The same page, captured completely:
 *
 *     with structure omitted:   2.4.4 0.190   3.3.2 0.495   4.1.2 0.993
 *     with structure present:   2.4.4 0.000   3.3.2 0.114   4.1.2 0.998
 *
 * The model was starved, not miscalibrated. Fixed at source, and this is why it is worth chasing a cause
 * rather than filtering a symptom: the guard would have shipped, looked like it worked, and left the
 * model running on a third of its inputs.
 *
 * The guard stays, because it is independently right — a finding about link purpose on a page with no
 * links is indefensible at any score, and the same rule holds everywhere in this project: never claim
 * what the evidence cannot support. It is now a second line rather than the fix.
 *
 * On CONFORMANT pages the model is silent regardless: 0 findings across 150 conformant records.
 */
import { spawn } from "node:child_process";

import { scorerPaths as artefact } from "@a11y-witness/scorer";

import { WCAG_22_AA } from "@a11y-witness/evidence/wcag";
import type { Judgment, Finding, Severity } from "./judge.js";

/** Shape of what the scorer prints. */
interface ScorerOutput {
  // `ruleOwned` names the criteria a deterministic rule decides, carried across from the training
  // report by score.py. Optional so an older scorer artifact still loads.
  records: {
    scores: Record<string, number>;
    predictions: Record<string, boolean>;
    ruleOwned?: string[];
  }[];
}

/** The evidence a capture must actually contain before a criterion may be reported. */
export interface CaptureEvidence {
  transcript?: string[];
  structure?: {
    headings?: string[]; landmarks?: string[]; formFields?: string[];
    links?: string[]; lists?: string[]; graphics?: string[]; tableCells?: string[];
  };
  interaction?: {
    controls?: string[]; stateChanges?: unknown[]; postSubmitFields?: string[];
    /**
     * One entry per control this capture activated. `kind` distinguishes a disclosure from a task button
     * from a submit, and it is optional because captures made before protocol 3 do not carry it — code
     * reading it must treat `undefined` as "this capture cannot say", never as "not a submit".
     */
    formChanges?: { control?: string; kind?: string; after?: string }[];
    /** Set only when submitting a form NAVIGATED. Absent means it did not, or was not checked. */
    navigatedOnSubmit?: { from: string; to: string };
    /** Accessible names the page exposed AFTER a submit — the visual side of 3.3.1 and 4.1.3. */
    postSubmitNames?: string[];
  };
}

const nonEmpty = (value: unknown): boolean => Array.isArray(value) && value.length > 0;

/** NVDA announces an editable field with an `edit` role; a button is not a field needing a label. */
const hasEditableField = (fields: string[] = []): boolean =>
  fields.some((f) => /\bedit(\s+text)?\b|\bcombo\s*box\b|\bcheck\s*box\b|\bradio\b|\bspin\s*button\b/i.test(f));

/**
 * Was a form actually SUBMITTED, as opposed to something merely activated?
 *
 * `formChanges` mixes three kinds of activation — a disclosure being opened, a task button being pressed,
 * and a submit — and 3.3.1 is only about the third. Older captures carry no `kind`, so they fall back to
 * `postSubmitFields`, which is populated only after a submit and is therefore the same claim by a weaker
 * route rather than a looser one.
 */
const submitWasProbed = (c: CaptureEvidence): boolean =>
  (c.interaction?.formChanges ?? []).some((change) => change.kind === "submit")
  || (!(c.interaction?.formChanges ?? []).some((change) => change.kind !== undefined)
    && nonEmpty(c.interaction?.postSubmitFields));

/** Everything the screen reader said, lowercased, for asking "was this ever spoken?". */
const spokenText = (c: CaptureEvidence): string => [
  ...(c.transcript ?? []),
  ...(c.structure?.formFields ?? []),
  ...(c.interaction?.postSubmitFields ?? []),
  ...(c.interaction?.formChanges ?? []).map((change) => change.after ?? ""),
].join(" ").toLowerCase();

/**
 * Text a page uses to say an input was rejected.
 *
 * A vocabulary list is a blunt instrument and it is used only to decide whether the criterion APPLIES,
 * never to score it. NVDA's own announcement of a properly marked field ("invalid entry") is included
 * because that is what the accessible version of this page produces.
 */
const ERROR_TEXT = /\b(error|invalid|required|must be|cannot be|please enter|please provide|enter a|enter your|is not valid|missing)\b/i;

/** A count of results or matches — WCAG 4.1.3's own worked example of a status message. */
const STATUS_TEXT = /\b\d[\d,]*\s+(results?|items?|matches?|products?|found)\b|\bno results?\b|\bshowing\s+\d/i;

/**
 * Does the page SHOW something it never SAID?
 *
 * This is the two-layer thesis applied inside one criterion. The accessibility tree is the visual side and
 * is an oracle only — never evidence, never a model feature — while the announcements remain the evidence.
 * A page that displays "Enter a plot preference before requesting." and never speaks it has failed; one
 * that displays nothing of the sort has no error to announce, and its silence is correct.
 */
const shownButNotAnnounced = (c: CaptureEvidence, pattern: RegExp): boolean => {
  const names = c.interaction?.postSubmitNames ?? [];
  if (names.length === 0) return false;
  const heard = spokenText(c);
  return names.some((name) => pattern.test(name) && !heard.includes(name.toLowerCase()));
};

/**
 * The oracle may VETO, but only when we actually have it.
 *
 * `postSubmitNames` arrived with capture protocol 3, so every capture recorded before it — all 2,122 on
 * disk, and every eval fixture — carries none. Requiring it outright would silently switch 3.3.1 off for
 * all of them while every test stayed green, which is the exact shape of the regression that emptied
 * `postSubmitFields` across the whole corpus. So absence means "cannot say", and the criterion falls back
 * to what it could already establish; presence means the question is answerable and is answered.
 */
const errorEvidencePermits = (c: CaptureEvidence): boolean =>
  (c.interaction?.postSubmitNames ?? []).length === 0 || shownButNotAnnounced(c, ERROR_TEXT);

const statusShownButNotAnnounced = (c: CaptureEvidence): boolean => shownButNotAnnounced(c, STATUS_TEXT);

/**
 * Which channel of the capture each criterion is ABOUT.
 *
 * Deliberately about the CHANNEL, not the verdict: it asks "is there anything of the right kind here to
 * be right or wrong about?" A criterion whose channel is empty is unreportable, not passing — the
 * distinction this project draws everywhere else between "clean" and "unchecked".
 *
 * A table rather than a branch chain: the chain put `hasEvidenceFor` at complexity 22 against a limit of
 * 15, and naming each criterion's channel once reads better than restating it in `case` arms.
 */
const EVIDENCE_CHANNEL: Record<string, (c: CaptureEvidence) => boolean> = {
  "1.1.1": (c) => nonEmpty(c.structure?.graphics)
    || (c.transcript ?? []).some((p) => /\b(graphic|image)\b/i.test(p)),
  // Link purpose needs links. This is the case that fired at 0.19 on a page containing none.
  "2.4.4": (c) => nonEmpty(c.structure?.links),
  "2.4.6": (c) => nonEmpty(c.structure?.headings) || nonEmpty(c.structure?.formFields),
  "1.3.1": (c) => nonEmpty(c.structure?.headings) || nonEmpty(c.structure?.landmarks)
    || nonEmpty(c.structure?.lists) || nonEmpty(c.structure?.tableCells),
  // Labels or Instructions is about FIELDS. A page whose only control is a button cannot fail it.
  "3.3.2": (c) => hasEditableField(c.structure?.formFields),
  // Error identification requires a form to have been submitted AND to have stayed put.
  //
  // A form that submits successfully and navigates has no error to announce, so the absence of one is not
  // a failure — but it is indistinguishable from a silent rejection if you only ask "was anything
  // announced afterwards?". Measured on Wikipedia: submitting the search navigated to French Wikipedia,
  // the post-submit re-read described THAT page, and this criterion was reported as a silent validation
  // error on a form that worked perfectly. The corpus never showed it because every synthetic page calls
  // `preventDefault()`.
  //
  // It also requires an error to EXIST. "The form rejected my input silently" and "the form accepted my
  // input" are the same screen-reader observation — nothing was said — so silence alone cannot decide it.
  // The accessibility tree settles it: `errorShownButNotAnnounced` asks whether the page displays an
  // error it never spoke. On apache.org this criterion fired on a SEARCH toggle that submitted nothing
  // and rejected nothing, because any non-empty `formChanges` counted as a submission.
  "3.3.1": (c) => !c.interaction?.navigatedOnSubmit && submitWasProbed(c) && errorEvidencePermits(c),
  // Status Messages is about a change the page ANNOUNCES nothing for. A result count that appears in the
  // tree and never in speech is the canonical example in WCAG's own understanding document.
  "4.1.3": (c) => nonEmpty(c.interaction?.formChanges) || nonEmpty(c.interaction?.stateChanges)
    || statusShownButNotAnnounced(c),
  "4.1.2": (c) => nonEmpty(c.structure?.formFields) || nonEmpty(c.interaction?.controls),
};

export function hasEvidenceFor(criterion: string, capture: CaptureEvidence): boolean {
  // BLIND is not the same as EMPTY, and conflating them suppressed a correct finding.
  //
  // The first version checked only whether each channel was empty. Run against the CLI's `--json` output
  // -- which omitted `structure` and `interaction` entirely -- every channel read empty, so it suppressed
  // `4.1.2 @ 0.993`: the one true finding on the page, silently, while reporting no false positives. It
  // looked exactly like the guard working perfectly.
  //
  // ...but deferring to the model when there is NO structural evidence was worse, and this is the second
  // half of the story.
  //
  // The rule above deferred to the model on the reasoning that a guard which cannot see must not veto.
  // Correct for the cause it was written for — the CLI's `--json` dropped `structure` and `interaction`,
  // so a fully captured page looked blind — and that cause is now fixed AT SOURCE, which is the right
  // place for it. What the deferral left behind is backwards: it grants maximum trust to the model
  // exactly when the model has minimum information, because those same missing fields are 29 of its
  // structured features and they all read zero. `local-judge`'s own header records what that does to its
  // scores: 2.4.4 went 0.000 -> 0.190 and 3.3.2 0.114 -> 0.495 on one page purely by omitting them.
  //
  // Measured: running the eval fixtures through this backend produced false positives on SEVEN
  // conformant pages — w3c-bad-after [1.1.1, 2.4.4, 3.3.2], tut-forms-good [1.1.1, 3.3.2, 4.1.2],
  // tut-menus-good, tut-carousels-good and more — because almost every fixture predates the structural
  // sweeps and carries a transcript only. Those are not judgements about the pages; they are a starved
  // model being trusted absolutely.
  //
  // So a capture with no structural evidence yields NO model findings. The deterministic rules are
  // unaffected — they read the transcript — so a starved capture still reports what can be proved from
  // what was announced. If the old cause ever recurs the failure direction is a missing finding rather
  // than invented ones, which for a tool whose value rests on precision is the safe way round.
  if (!capture.structure && !capture.interaction) return false;
  // An unknown criterion is never reportable: the scorer has heads for eight, and inventing a finding for
  // a ninth would claim coverage this layer does not have.
  return EVIDENCE_CHANNEL[criterion]?.(capture) ?? false;
}

/**
 * What the screen reader said that this criterion is about.
 *
 * Quoted from the capture, never composed: the whole value of this tool is that a finding can point at
 * what a user would actually have heard. A criterion whose channel is empty returns "", and the caller
 * has already refused to report it.
 */
export function evidenceFor(criterion: string, capture: CaptureEvidence): string {
  const s = capture.structure ?? {};
  const i = capture.interaction ?? {};
  const first = (...groups: (string[] | undefined)[]): string => {
    for (const g of groups) if (nonEmpty(g)) return g!.slice(0, 3).join(" · ");
    return "";
  };
  switch (criterion) {
    case "1.1.1": return first(s.graphics, (capture.transcript ?? []).filter((p) => /\b(graphic|image)\b/i.test(p)));
    case "2.4.4": return first(s.links);
    case "2.4.6": return first(s.headings, s.formFields);
    case "1.3.1": return first(s.headings, s.landmarks, s.tableCells, s.lists);
    case "3.3.2": return first(s.formFields);
    // `postSubmitFields` is on `interaction`, not `structure` — the field re-read AFTER a submit is an
    // interaction result, not page structure. Written as `s.postSubmitFields` first, which typecheck
    // caught; left unchecked it would have quoted the wrong channel as this criterion's evidence.
    case "3.3.1": return first(i.postSubmitFields, (i.formChanges ?? []).map((c) => JSON.stringify(c)));
    case "4.1.3": return first((i.formChanges ?? []).map((c) => JSON.stringify(c)), (i.stateChanges ?? []).map((c) => JSON.stringify(c)));
    case "4.1.2": return first(s.formFields, i.controls);
    default: return "";
  }
}

/**
 * What the criterion means, in the words a developer needs.
 *
 * A fixed template rather than generated prose, exactly as the design doc specifies. It is less fluent
 * than an LLM's sentence and it cannot be wrong, which is the trade this layer is making.
 */
const EXPLANATION: Record<string, string> = {
  "1.1.1": "An image was announced without a useful text alternative, so its content is unavailable to a screen-reader user.",
  "1.3.1": "Structure that is visible on screen was not announced with its role, so the page's organisation is unavailable non-visually.",
  "2.4.4": "Link text does not convey where the link goes when heard out of its surrounding context.",
  "2.4.6": "A heading or label does not describe what it labels, so it does not help a user orient.",
  "3.3.1": "A form was submitted with invalid input and no error was announced, so the user is not told what went wrong.",
  "3.3.2": "A form field was announced without a label or instructions, so its purpose has to be guessed.",
  "4.1.2": "A control was announced by role alone, with no accessible name, so a user cannot tell what it does.",
  "4.1.3": "Something changed on the page and nothing was announced, so the user is not told the result of their action.",
};

/** Severity by criterion. Conformance level is the honest proxy: A failures block more people than AA. */
function severityFor(criterion: string, score: number): Severity {
  const level = WCAG_22_AA.find((c) => c.num === criterion)?.level;
  if (level === "A") return score >= 0.9 ? "blocker" : "serious";
  return score >= 0.9 ? "serious" : "moderate";
}

const criterionLabel = (num: string): string => {
  const found = WCAG_22_AA.find((c) => c.num === num);
  return found ? `${num} ${found.name} (${found.level})` : num;
};

/**
 * Turn the scorer's per-criterion predictions into findings.
 *
 * Pure, so the guard and the templating are testable without Python, a model, or a network.
 */
export function findingsFromScores(
  predictions: Record<string, boolean>,
  scores: Record<string, number>,
  capture: CaptureEvidence,
  ruleOwned: readonly string[] = [],
): { findings: Finding[]; suppressed: { criterion: string; score: number; reason: string }[] } {
  const decidedByRules = new Set(ruleOwned);
  const findings: Finding[] = [];
  const suppressed: { criterion: string; score: number; reason: string }[] = [];
  for (const [criterion, predicted] of Object.entries(predictions)) {
    if (!predicted) continue;
    const score = scores[criterion] ?? 0;
    // A criterion a deterministic rule decides is not the model's to call. `judge()` appends the rule
    // layer AFTER this, so both used to reach the report: on conformant W3C pages the rule correctly
    // found nothing and the model's 4.1.2 prediction survived as a false positive — the worst error this
    // tool can make. The rules are exact on 216 of 4.1.2's 290 records with zero false positives across
    // 1001 conformant ones, so where they have looked, they are the answer.
    //
    // Recorded rather than dropped, like the guard below: a suppressed prediction is evidence about the
    // model's calibration, and 4.1.2's threshold is currently an uncalibrated 0.5 fallback.
    if (decidedByRules.has(criterion)) {
      suppressed.push({ criterion, score, reason: "a deterministic rule decides this criterion" });
      continue;
    }
    if (!hasEvidenceFor(criterion, capture)) {
      // Recorded, not dropped silently. A suppressed prediction is information about the model's
      // calibration, and hiding it would make this guard impossible to audit.
      suppressed.push({ criterion, score, reason: "the capture contains no evidence of the kind this criterion is about" });
      continue;
    }
    findings.push({
      issue: EXPLANATION[criterion] ?? `Predicted failure of ${criterionLabel(criterion)}.`,
      wcag: criterionLabel(criterion),
      severity: severityFor(criterion, score),
      evidence: evidenceFor(criterion, capture),
      confidence: Number(score.toFixed(3)),
    });
  }
  return { findings, suppressed };
}

/**
 * Where the scorer lives.
 *
 * The SCRIPT path comes from `@a11y-witness/scorer`, which resolves it from its own module, so this function
 * does not have to know any layout.
 *
 * The INTERPRETER defaults to `python3` on the PATH. It used to default to `<repo>/.venv/bin/python`, which
 * was wrong in two ways at once: an installed package has no venv at all, and the path was derived as `../../`
 * from this file — so when the judge moved into its own package it silently became `packages/.venv/bin/python`
 * and every score failed with ENOENT. A default that depends on where the source file happens to sit is the
 * same defect M0 found in the cwd-relative version, one level removed.
 *
 * `A11Y_PYTHON` still wins, and this repo's own scripts set it to the venv. `action.yml` sets it to a bare
 * `python`, because a GitHub Windows runner has no venv and installs to the system interpreter.
 */
export function scorerPaths(): { python: string; script: string } {
  return {
    python: process.env.A11Y_PYTHON ?? "python3",
    script: artefact().scoreScript,
  };
}

/** Run the scorer over one raw witness capture. Separate so the pure logic above needs no subprocess. */
export async function scoreCapture(capture: unknown, options: { python?: string; script?: string; timeoutMs?: number } = {}):
Promise<ScorerOutput> {
  const resolved = scorerPaths();
  const python = options.python ?? resolved.python;
  const script = options.script ?? resolved.script;
  return new Promise((resolve, reject) => {
    const child = spawn(python, [script, "--stdin"], { stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`the local scorer did not finish within ${options.timeoutMs ?? 120_000}ms`));
    }, options.timeoutMs ?? 120_000);
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`the local scorer exited ${code}: ${err.slice(0, 400)}`));
      const start = out.indexOf("{");
      if (start === -1) return reject(new Error(`the local scorer printed no JSON: ${out.slice(0, 200)}`));
      try {
        resolve(JSON.parse(out.slice(start)) as ScorerOutput);
      } catch (e) {
        reject(new Error(`could not parse the local scorer's output: ${(e as Error).message}`));
      }
    });
    child.stdin.end(JSON.stringify(capture));
  });
}

/**
 * The local judge: scorer + guard + template, returning the SAME `Judgment` the LLM judge returns.
 *
 * Keeping the shape identical is the point — the CLI, the report and the Action all work unchanged, so
 * choosing this layer is a backend decision rather than a rewrite.
 */
export async function judgeLocally(capture: CaptureEvidence & { task?: string }): Promise<Judgment & {
  suppressed: { criterion: string; score: number; reason: string }[];
}> {
  // The scorer is an NVDA artifact and refuses anything else, correctly — it was trained on NVDA speech and
  // VoiceOver phrases the same page differently. But that refusal used to propagate as a crash: one
  // VoiceOver fixture aborted the entire eval run mid-way with
  // `scorer artifact supports NVDA captures only, got 'VoiceOver'`, so no aggregate was ever printed and
  // the exit code said "gate failed" when the truth was "one input is out of scope".
  //
  // Out of scope is not a failure and it is not a pass. The model contributes nothing, the deterministic
  // rules still read the transcript, and the summary says so.
  const screenReader = (capture as { screenReader?: string }).screenReader;
  if (screenReader && !/nvda/i.test(screenReader)) {
    return {
      taskCompletable: true,
      summary: `The trained scorer covers NVDA captures only, and this one is ${screenReader}. `
        + "Nothing was scored: these criteria are unchecked, not clean.",
      findings: [],
      confidence: 0,
      suppressed: [],
    };
  }
  const scored = await scoreCapture(capture);
  const record = scored.records?.[0];
  if (!record) throw new Error("the local scorer returned no record for this capture");
  const { findings, suppressed } = findingsFromScores(
    record.predictions, record.scores, capture, [],
  );
  return {
    // Not inferred. This layer scores WCAG criteria and has no head for "could someone finish the task",
    // so claiming an answer would be inventing one. A blocking failure is the closest honest signal.
    taskCompletable: !findings.some((f) => f.severity === "blocker"),
    // Deliberately carries NO COUNT. `judge()` appends the deterministic rule layer's findings AFTER this
    // returns (`withRuleFindings`), so any number written here is stale by the time it is read: on a real
    // site this said "1 confirmed failure(s)" above a table listing three. The renderer counts the actual
    // findings, so the count has exactly one source of truth and the prose cannot contradict the table.
    summary: findings.length === 0
      ? "No failures were confirmed for the eight criteria this layer scores. Other criteria are unchecked, not clean."
      : "Confirmed failures below, scored against the eight criteria this layer covers. Other criteria are unchecked, not clean.",
    findings,
    // The layer's own confidence is the weakest finding's: a report is only as good as its shakiest claim.
    confidence: findings.length === 0 ? 1 : Math.min(...findings.map((f) => f.confidence)),
    suppressed,
  };
}
