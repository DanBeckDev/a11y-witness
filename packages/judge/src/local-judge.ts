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

import type { CaptureStructure } from "@a11y-witness/evidence";
import { annotateCapture } from "@a11y-witness/evidence";
import { scorerPaths as artefact } from "@a11y-witness/scorer";

import { WCAG_22_AA } from "@a11y-witness/evidence/wcag";
import { SCORED_CRITERIA, RULE_CRITERIA, assessedCriteria } from "./coverage.js";
import type { Judgment, Finding, Severity } from "./judge.js";

/** Shape of what the scorer prints. */
/** One record's worth of the scorer's output — named, because `findingsFromScores` takes it whole. */
export interface ScoredRecord {
  scores: Record<string, number>;
  predictions: Record<string, boolean>;
  // `ruleOwned` names the SUBTYPES whose finding a deterministic rule already supplies under the same
  // criterion, carried across from the training report by score.py. Optional so an older scorer
  // artifact still loads. Not "the criteria the rules decide": that was the shape, and it silenced the
  // model on 174 records the rules never look at.
  ruleOwned?: readonly string[];
  subtypePredictions?: Record<string, boolean>;
  novelty?: { nearestTrainingCosine?: number | null; inSupport?: boolean | null; floor?: number };
}

interface ScorerOutput {
  records: ScoredRecord[];
  /**
   * The scorer's own Python inference-runtime versions (publish blocker B2) -- `numpy`, `onnxruntime`,
   * `safetensors`, `transformers`, each a version string or `null` when that package is absent
   * (`_torch_encode`'s fallback path, no ONNX file in the encoder directory). Optional so an older
   * scorer artifact that predates this field still loads.
   */
  runtime?: Record<string, string | null>;
}

/** The evidence a capture must actually contain before a criterion may be reported. */
export interface CaptureEvidence {
  transcript?: string[];
  /**
   * ALL SEVEN, all optional — known-gaps §15. Derived rather than restated: this is a gate on what a
   * capture CONTAINS, so it reads every sweep, and `Partial` because every one of them may legitimately
   * be absent. That is the question this interface exists to ask.
   */
  structure?: Partial<CaptureStructure>;
  interaction?: {
    controls?: string[]; stateChanges?: unknown[]; postSubmitFields?: string[];
    /**
     * One entry per control this capture activated. `kind` distinguishes a disclosure from a task button
     * from a submit, and it is optional because captures made before protocol 3 do not carry it — code
     * reading it must treat `undefined` as "this capture cannot say", never as "not a submit".
     *
     * `after` admits `null` alongside `string | undefined`, matching `RuleInput`'s copy of this shape
     * (`rules.ts`) rather than a narrower one written by hand here — found when `JudgeInput.interaction`
     * was changed to derive from `RuleInput` and `judgeLocally(input)`'s call stopped type-checking. The
     * read site already treated the two identically (`change.after ?? ""`), so this closes a type that had
     * quietly stopped matching what flows, not a behaviour change.
     */
    formChanges?: { control?: string; kind?: string; after?: string | null }[];
    /**
     * Set once `probeFormSubmit` runs. `checked: false` means `currentPageUrl()` failed on at least one
     * side (could not ask) — a different fact from `navigated: false` (asked, stayed put). Captures from
     * before this fix carry the OLD shape instead: a bare `{ from, to }`, present only when it navigated —
     * `submitDidNotNavigate` below reads both. Absent entirely means the probe never ran.
     */
    navigatedOnSubmit?: { checked: boolean; navigated?: boolean; from?: string; to?: string };
    /** Accessible names the page exposed AFTER a submit — the visual side of 3.3.1 and 4.1.3. */
    postSubmitNames?: string[];
    /** What each Tab press announced. Absent means the focus probe did not run. Rule-only, like `media`. */
    focusOrder?: string[];
    /**
     * F55's focusin/focusout log verdict. Rule-only, like `focusOrder` above and read by `outcomes.ts`'s
     * own applicability case for 2.4.7 the same way — `checked: false` is "the oracle could not run",
     * never "no findings", so it must not collapse into an empty `focusOrder` here either.
     */
    focusEvents?: { checked: boolean; events?: number; scriptRemovedFocus?: { id: number; name: string; heldMs: number }[] | null };
  };
  /**
   * Media elements the page declares, from the DOM. Deliberately NOT added to `EVIDENCE_CHANNEL`: that
   * table gates the trained SCORER, which has no head for 1.4.2, and letting it report one would claim
   * coverage the model does not have. 1.4.2 is rule-only, and `outcomes.ts` handles its applicability.
   */
  media?: { tag: string; autoplay: boolean; muted: boolean; controls: boolean; loop: boolean }[];
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

/**
 * True only when we can POSITIVELY say the submit stayed on the same document — an ASSERTING criterion
 * (3.3.1 is one of the four that actually assert, see CLAUDE.md) must never fire on ambiguous evidence,
 * so "checked and confirmed same page" is required, never merely "the field is absent".
 *
 * The two shapes need OPPOSITE defaults for absence, which is why this cannot be one `!navigatedOnSubmit`
 * check any more. The current shape carries `checked`, and once a capture has that key, absence of the
 * whole field means only "this probe never ran" — `submitWasProbed` above already gates on that
 * separately, so this function need not repeat it, but a `checked: false` (could not ask) verdict must
 * still read as "cannot say", not as "did not navigate", or an ambiguous submit would earn a false 3.3.1
 * exactly like Wikipedia's search once did. A capture from before this fix carries the OLD shape instead —
 * bare presence always meant navigated — so absence there keeps meaning what it always did: not navigated,
 * as far as anything could tell. Changing that legacy reading would move this project's own measured
 * false-positive baseline for every capture already on disk, with no recapture to justify it.
 */
const submitDidNotNavigate = (c: CaptureEvidence): boolean => {
  const nav = c.interaction?.navigatedOnSubmit;
  if (nav && typeof nav === "object" && "checked" in nav) return nav.checked === true && nav.navigated === false;
  return !nav;
};

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
 *
 * DELIBERATELY WIDER than `ANNOUNCED_ERROR_TEXT` (rules.ts) / `ERROR_WORD` (screenreader_features.py),
 * which are pinned equal to EACH OTHER for the opposite, narrow question ("did the announcement actually
 * say an error") — audited 2026-09-06 alongside that pair and confirmed as a deliberate applicability/
 * scoring split, not drift, so this one is intentionally excluded from that pin.
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
  "3.3.1": (c) => submitDidNotNavigate(c) && submitWasProbed(c) && errorEvidencePermits(c),
  // Status Messages is about a change the page ANNOUNCES nothing for. A result count that appears in the
  // tree and never in speech is the canonical example in WCAG's own understanding document.
  "4.1.3": (c) => nonEmpty(c.interaction?.formChanges) || nonEmpty(c.interaction?.stateChanges)
    || statusShownButNotAnnounced(c),
  // FOUR independent channels, any one of which is sufficient — measured 2026-09-06 against every
  // capture on disk where the deterministic rule actually reports 4.1.2 (`packages/judge` audit
  // §4.4). Of 221 captures across the synthetic corpus and the real-page corpus where a 4.1.2 finding
  // fired, EVERY one was reproduced by isolating exactly one of `formFields` (148), `controls` (148,
  // heavily redundant with `formFields` — the same control usually appears in both the form-field
  // sweep and the interaction probe), `stateChanges` (69 — `state-change-silent`, which needs no form
  // field or control announcement at all), or `frames` (1 — an unnamed iframe, which the frame sweep
  // is the ONLY channel for). `transcript` alone was never independently sufficient in that sample
  // (0/221) but the rule genuinely reads it (`addUnnamedControls(input.transcript, "transcript", add)`
  // in rules.ts) and a future capture could reach it with none of the other four populated, so it
  // stays as a fifth disjunct rather than being dropped on the strength of an absence.
  //
  // This used to read `formFields || controls` only, which `criterion-coverage.ts`'s
  // `criteriaAssessableFrom` also disagreed with in a THIRD way (an ALL-of-four-channels AND,
  // including `structureCensus` — never once load-bearing, measured by ablation) — see that file's
  // 4.1.2 entry for the fuller account and `channel-tables-4.1.2.test.ts` for the parity this pins.
  "4.1.2": (c) => nonEmpty(c.structure?.formFields) || nonEmpty(c.interaction?.controls)
    || nonEmpty(c.interaction?.stateChanges) || nonEmpty(c.structure?.frames)
    || (c.transcript ?? []).length > 0,
};

/**
 * Exported so `criterion-coverage.ts`'s per-criterion channel declarations can be pinned against this
 * table rather than trusted to stay equal by memory — see `channel-tables-4.1.2.test.ts`. This table
 * answers "is there evidence of the right KIND", content-sensitive where the criterion needs it
 * (1.1.1's transcript regex, 3.3.1's submit/navigation/error checks); `CRITERION_COVERAGE[c].channels`
 * answers the coarser "does the capture carry the FIELD at all" and cannot express a content check, so
 * exact parity is only expected — and only pinned — for criteria whose applicability is a pure
 * presence-of-channel disjunction. 4.1.2 is one; see the pin test for which others are.
 */
export const EVIDENCE_CHANNEL_CRITERIA: readonly string[] = Object.keys(EVIDENCE_CHANNEL);

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
 *
 * Takes ONE scored record rather than its four fields spread out. They were separate parameters with
 * `[]` and `{}` defaults, and the call site spelled out `record.ruleOwned ?? []` -- which is how the
 * suppression guard came to be passed an empty list and sit inert for the life of the corpus. A record
 * is a cohesive whole; splitting it made it possible to hand over three quarters of one.
 */
export function findingsFromScores(
  scored: ScoredRecord,
  capture: CaptureEvidence,
): { findings: Finding[]; suppressed: { criterion: string; score: number; reason: string }[] } {
  const { predictions, scores, ruleOwned = [], subtypePredictions = {} } = scored;
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
    // Suppress per SUBTYPE, not per criterion. `rules:score` measures that the rules decide `4.1.2:regex`
    // exactly and never look at `4.1.2:missing-role` or `4.1.2:state-change-silent` -- 143 records for
    // that criterion alone. Suppressing the whole criterion would hand those to nobody; suppressing none
    // of it leaves the model duplicating the rules on the half they own, which is the false positive
    // this guard exists to stop.
    //
    // `ruleOwned` is narrower than "every subtype a rule decides", and the narrowing happens in
    // `score.py`: a subtype only appears here when the rule reports it under the SAME criterion the
    // model would. `3.3.2:unnamed-form-field` is rule-decided and reported as 4.1.2, so it is absent
    // and the model's 3.3.2 stands -- otherwise the criterion would be suppressed here and supplied by
    // nobody. `packages/lab/rule-ownership.json` is where that mapping is declared, once.
    //
    // So a prediction is the model's to make unless EVERY subtype behind it is rule-owned.
    const firedSubtypes = Object.entries(subtypePredictions)
      .filter(([subtype, fired]) => fired && subtype.startsWith(`${criterion}:`))
      .map(([subtype]) => subtype);
    const allRuleOwned = firedSubtypes.length > 0 && firedSubtypes.every((s) => decidedByRules.has(s));
    // With no subtype detail the criterion-level answer is all there is, and the old behaviour is the
    // safe one: an older scorer artifact reports nothing here rather than double-reporting.
    const criterionRuleOwned = firedSubtypes.length === 0 && decidedByRules.has(criterion);
    if (allRuleOwned || criterionRuleOwned) {
      suppressed.push({
        criterion,
        score,
        reason: firedSubtypes.length
          ? `a deterministic rule decides ${firedSubtypes.join(", ")}`
          : "a deterministic rule decides this criterion",
      });
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
    // `A11Y_SCORER_MODEL` names a CANDIDATE to evaluate instead of the shipped weights.
    //
    // Only `calibrate-abstention.mjs` honoured it, so `npm run eval` -- the judge-quality gate -- could
    // measure ONLY what was already released. A gate that cannot examine the thing being decided cannot
    // gate the decision: a candidate's judge quality was unknowable until after promotion, which is the
    // wrong way round and is why this went unnoticed.
    //
    // `--evaluating` travels with it for the same reason the sweep passes it: a fresh candidate is marked
    // ineligible BECAUSE its gates have not run, so the guard that refuses ineligible weights would refuse
    // the very run that would qualify them. Naming a model is the declaration of purpose; with no model
    // named, nothing is passed and the strict default stands over the shipped artefact.
    const candidate = process.env.A11Y_SCORER_MODEL;
    const args = [script, "--stdin", ...(candidate ? ["--model", candidate, "--evaluating"] : [])];
    const child = spawn(python, args, { stdio: ["pipe", "pipe", "pipe"] });
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
    // Annotated, because `score.py` builds its record from this JSON and the featurizer now reads the
    // parse rather than re-deriving it. Unannotated input fails loudly there rather than silently
    // falling back to a regex, which is what let the old defect survive every gate.
    child.stdin.end(JSON.stringify(annotateCapture(capture as unknown as Record<string, unknown>)));
  });
}

/**
 * What this layer covers, in words, above the findings list.
 *
 * Counted, not spelled out: "eight" was hardcoded here and in two consumer-facing docs, and went stale the
 * day 1.4.2 and 2.1.2 arrived — a number in prose is a number that stops being true.
 *
 * And it counts the LAYER, not this scorer. It used `SCORED_CRITERIA.length` — the trained heads, 8 — while
 * the same section prints findings the deterministic rules produced. On the first real page this was ever
 * pointed at, a 2.4.3 and a 2.1.1 finding appeared directly beneath a sentence claiming the layer scores
 * criteria that include neither, and THREE DIFFERENT TOTALS were readable in one report — the scorer's
 * head count, the rule-assessed count, and the conformance section's — with nothing saying which was
 * which. The numerals are deliberately not repeated here; they were the symptom, and quoting them would
 * make this comment the fourth total.
 *
 * **It states SCOPE and makes no claim about counts**, which is the second half of the same lesson. It said
 * "No failures were confirmed for the N criteria this layer covers" — computed from the SCORER's findings,
 * while the deterministic rules' findings are merged into the layer afterwards. So on a page where the
 * scorer is silent and a rule fires, it printed "no failures were confirmed" directly above `1 finding(s)`:
 * exactly the contradiction just removed from the headline, surviving one line further down. The count
 * belongs to the line that lists them, and this sentence has no business restating it.
 */
export function layerSummary(): string {
  return `This layer covers ${assessedCriteria().length} criteria: ${RULE_CRITERIA.length} by deterministic `
    + `rules and ${SCORED_CRITERIA.length} by the trained scorer, overlapping. Other criteria are `
    + "unchecked, not clean.";
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
    // ABSTAIN outside the training distribution rather than predict and be confidently wrong.
    //
    // Measured: every training record sits at cosine 0.847-0.99 from its nearest neighbour, while 28 of
    // 32 real eval pages sit at 0.50-0.84. A linear head on a frozen embedding cannot tell it is
    // extrapolating -- it returned 0.97 and 0.99 for 4.1.2 on two CONFORMANT W3C pages. For an
    // accessibility tool a false positive is an accusation someone may act on or be challenged over, so
    // declining is the only defensible answer where there is no basis to predict.
    //
    // Selective prediction with a reject option (Chow) over a k-NN feature-space novelty score
    // (Sun et al., ICML 2022) -- not a bespoke mechanism. UNCHECKED, never clean: the same distinction
    // the VoiceOver branch makes. The rule layer still runs, so deterministic findings survive.
    //
    // `=== false` only: null means an older artifact shipped no reference, and unknown must not read as
    // out-of-support any more than as safe.
    if (record.novelty?.inSupport === false) {
      const nearest = record.novelty.nearestTrainingCosine ?? "unknown";
      return {
        taskCompletable: true,
        summary: `This page is unlike anything the trained scorer was validated on (nearest training `
          + `similarity ${nearest}, below the ${record.novelty.floor ?? "?"} support floor), so it was `
          + "NOT scored. These criteria are unchecked, not clean.",
        findings: [],
        confidence: 0,
        // The machine-readable half of the sentence above, so no consumer has to parse prose to learn
        // that nothing was scored. `criterionOutcomes` turns this into `cantTell` per criterion, which is
        // what stops an unassessed page reading as a passing one.
        abstained: true,
        suppressed: Object.entries(record.predictions).filter(([, p]) => p).map(([criterion]) => ({
          criterion,
          score: record.scores[criterion] ?? 0,
          reason: "the page is outside the distribution this scorer was validated on",
        })),
        // Scoring ran far enough to compute novelty before declining, so the runtime it ran under is
        // exactly as reportable here as on the path that goes on to score. Absent only for an artifact
        // that predates this field, same as everywhere else it appears.
        ...(scored.runtime ? { runtime: scored.runtime } : {}),
      };
    }
  // `record.ruleOwned` was parsed from the scorer output, documented as preventing "the worst error
  // this tool can make", and then passed as `[]` -- so the guard inside has never once run. The same
  // shape as `refreshBrowseBuffer` guarding on a flag nothing assigned: a remedy that is reachable,
  // commented, and inert.
  const { findings, suppressed } = findingsFromScores(record, capture);
  return {
    // Carried whether or not it declined. See `Judgment.novelty`: reported only on abstention, it made
    // "scored at the edge of the distribution" and "scored comfortably inside it" the same output.
    ...(record.novelty ? { novelty: record.novelty } : {}),
    // Publish blocker B2: a disputed finding has to be traceable to the RUNTIME it was scored under, not
    // only to the weights -- the same principle `provenance.browserVersion` applies to a capture.
    ...(scored.runtime ? { runtime: scored.runtime } : {}),
    // Not inferred. This layer scores WCAG criteria and has no head for "could someone finish the task",
    // so claiming an answer would be inventing one. A blocking failure is the closest honest signal.
    taskCompletable: !findings.some((f) => f.severity === "blocker"),
    // Deliberately carries NO COUNT. `judge()` appends the deterministic rule layer's findings AFTER this
    // returns (`withRuleFindings`), so any number written here is stale by the time it is read: on a real
    // site this said "1 confirmed failure(s)" above a table listing three. The renderer counts the actual
    // findings, so the count has exactly one source of truth and the prose cannot contradict the table.
    summary: layerSummary(),
    findings,
    // The layer's own confidence is the weakest finding's: a report is only as good as its shakiest claim.
    confidence: findings.length === 0 ? 1 : Math.min(...findings.map((f) => f.confidence)),
    suppressed,
  };
}
