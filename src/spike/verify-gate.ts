/**
 * Discriminative gate — the precision half of the hybrid judge.
 *
 * The generative model over-flags SEMANTIC criteria (vague links, non-descriptive
 * headings) on clean pages. This gate re-judges each semantic finding with a small
 * encoder (DeBERTa-v3 NLI, ONNX) run in-process via transformers.js, and keeps the
 * finding only if the encoder confirms the violation. A discriminative model
 * scores rather than generates, so it cannot invent a finding — which is exactly
 * the over-flagging the generative model couldn't be prompted, voted, or
 * constrained out of.
 *
 * Absence-of-name criteria (1.1.1, 4.1.2) are NOT gated here: the deterministic
 * rules in rules.ts own them. The gate drops the model's absence findings so the
 * rules supply the authoritative ones.
 *
 * Opt-in and self-contained. Enabled only when JUDGE_GATE=on and GATE_MODEL_PATH
 * points at a local ONNX model directory. transformers.js is an OPTIONAL
 * dependency, lazy-loaded via a non-literal import specifier so it is not required
 * to build or run the judge without the gate. To enable:
 *   npm install @huggingface/transformers
 *   JUDGE_GATE=on GATE_MODEL_PATH=/path/to/model-dir npm run eval
 */
import { basename, dirname } from "node:path";
import type { Finding } from "./judge.js";

const ENABLED = process.env.JUDGE_GATE === "on" && Boolean(process.env.GATE_MODEL_PATH);
const MODEL_DIR = process.env.GATE_MODEL_PATH ?? "";
const DTYPE = process.env.GATE_DTYPE ?? "fp32";
const DEFAULT_THRESHOLD = 0.4; // entailment score above which a semantic finding is kept
const THRESHOLD = Number(process.env.GATE_THRESHOLD ?? DEFAULT_THRESHOLD);
const EVIDENCE_LOG_LEN = 48; // truncate evidence in drop logs
const OBJECT_REPLACEMENT = /￼/g; // ￼ — strip the empty-name marker for clean premises

/** Absence-of-name criteria owned by the deterministic rules, never gated here. */
export const ABSENCE_CRITERIA = new Set(["1.1.1", "4.1.2"]);

/** Per-criterion violation hypotheses; entailment of any one means a real failure. */
const HYPOTHESES: Record<string, string[]> = {
  "1.3.1": [
    "This is a section title shown as plain text with no heading role.",
    "This table cell is announced without its column or row header.",
  ],
  "2.4.4": [
    "This link's text is vague and does not say where it leads.",
    "This link is announced as 'click here' or 'read more' with no destination.",
  ],
  "2.4.6": ["This heading or label is not descriptive of its content."],
  "1.4.5": ["This is real text shown as an image instead of selectable text."],
  "3.3.1": ["A form input error is not announced to the user."],
  "3.3.2": ["This form field has no label or instructions."],
  "4.1.3": ["A status message or update is not announced to the user."],
};

interface ZeroShotOutput {
  labels: string[];
  scores: number[];
}
type Classifier = (text: string, labels: string[], opts: { multi_label: boolean }) => Promise<ZeroShotOutput>;
interface TransformersModule {
  pipeline: (task: string, model: string, opts: { dtype: string }) => Promise<Classifier>;
  env: { allowLocalModels: boolean; allowRemoteModels: boolean; localModelPath: string };
}

function criterionOf(wcag: string): string {
  const m = wcag.match(/(\d+\.\d+\.\d+)/);
  return m ? m[1] : wcag.trim();
}

function hypothesesFor(criterion: string): string[] {
  return HYPOTHESES[criterion] ?? [`This content fails WCAG success criterion ${criterion}.`];
}

export function gateEnabled(): boolean {
  return ENABLED;
}

let classifierPromise: Promise<Classifier> | null = null;
async function getClassifier(): Promise<Classifier> {
  if (!classifierPromise) {
    classifierPromise = (async (): Promise<Classifier> => {
      // Non-literal specifier: transformers.js is optional, so tsc must not try
      // to resolve it when the gate is unused.
      const spec: string = "@huggingface/transformers";
      const tf = (await import(spec)) as TransformersModule;
      tf.env.allowLocalModels = true;
      tf.env.allowRemoteModels = false;
      tf.env.localModelPath = dirname(MODEL_DIR);
      process.stderr.write(`Loading discriminative gate (${basename(MODEL_DIR)}, dtype=${DTYPE})...\n`);
      return tf.pipeline("zero-shot-classification", basename(MODEL_DIR), { dtype: DTYPE });
    })();
  }
  return classifierPromise;
}

function toPremise(evidence: string): string {
  return `A screen reader announced: ${evidence.replace(OBJECT_REPLACEMENT, " ").replace(/\s+/g, " ").trim()}`;
}

/**
 * Filter findings through the gate. Absence-criteria findings are dropped (the
 * rules supply them); each semantic finding is kept only if the encoder's
 * entailment for its criterion clears the threshold. A no-op when the gate is
 * disabled, so the judge behaves exactly as before unless opted in.
 */
export async function applyGate(findings: Finding[]): Promise<Finding[]> {
  if (!ENABLED) return findings;
  const classify = await getClassifier();
  const kept: Finding[] = [];
  for (const finding of findings) {
    const criterion = criterionOf(finding.wcag);
    if (ABSENCE_CRITERIA.has(criterion)) continue; // deterministic rules own these
    const out = await classify(toPremise(finding.evidence), hypothesesFor(criterion), { multi_label: true });
    const score = Math.max(...out.scores);
    if (score >= THRESHOLD) kept.push(finding);
    else process.stderr.write(`Gate dropped ${criterion} (${score.toFixed(2)} < ${THRESHOLD}): ${finding.evidence.slice(0, EVIDENCE_LOG_LEN)}\n`);
  }
  return kept;
}
