/**
 * The trained screen-reader scorer, as an ARTEFACT rather than a library.
 *
 * There is no `score()` function here on purpose. Scoring runs in Python — torch, transformers, a frozen
 * MiniLM encoder — and this package's job is to tell a caller where those files are, so the caller can spawn
 * the program with an interpreter it chose. ADR 0004 puts the model in its own package for one reason: **the
 * weights are the API.** A retrain that moves a score flips a consumer's pass/fail with no code change, so it
 * is a major bump, and that is only expressible if the weights version independently of the judge.
 *
 * Every path is absolute and resolved from `import.meta.url`, never the process cwd. That is not a
 * preference: M0 found `local-judge.ts` resolving the scorer as `".venv/bin/python"` and
 * `"scripts/score-screenreader-model.py"`, which work only when the cwd happens to be the repo root — so the
 * default judge backend was unusable from anywhere else, including from an installed package.
 *
 * Resolution works identically from `dist/index.js` and from `src/index.ts` under tsx, because both sit one
 * level below the package root.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const packageRoot = (): string => fileURLToPath(new URL("../", import.meta.url));

export interface ScorerPaths {
  /** The trained heads: 27 KB of them, over a frozen encoder. Committed, and versioned as the API. */
  weights: string;
  /** `training-report.json` — provenance, thresholds, and the encoder hash the weights were trained against. */
  trainingReport: string;
  /** The scoring program. Spawn it with `--capture-json <file>` or `--stdin`. */
  scoreScript: string;
  /** Downloads the 87 MB encoder. Also exposed as the `a11y-scorer-fetch-encoder` bin. */
  fetchEncoderScript: string;
  /** Python requirements for the two programs above. */
  requirements: string;
  /** Where the encoder must live. NOT shipped — 87 MB, fetched on demand. */
  encoderDir: string;
}

export function scorerPaths(): ScorerPaths {
  const root = packageRoot();
  return {
    weights: join(root, "models/screenreader-scorer/model.safetensors"),
    trainingReport: join(root, "models/screenreader-scorer/training-report.json"),
    scoreScript: join(root, "python/score.py"),
    fetchEncoderScript: join(root, "python/fetch-encoder.py"),
    requirements: join(root, "requirements.txt"),
    encoderDir: join(root, "models/encoders/all-MiniLM-L6-v2"),
  };
}

/**
 * Is the encoder on disk?
 *
 * Worth asking before spawning the scorer, because the failure without it is a Python traceback about a
 * missing directory, which reads like a broken install rather than "run the fetch step". The encoder is
 * deliberately not in the tarball: 87 MB of weights that a package manager would copy on every install.
 */
export function encoderPresent(): boolean {
  return existsSync(join(scorerPaths().encoderDir, "model.safetensors"));
}

export interface ScorerProvenance {
  featureSchema?: string;
  releaseEligible?: boolean;
  encoderSha256?: string;
  trainedAt?: string;
}

/**
 * What produced these weights, read from the training report.
 *
 * `releaseEligible` is the field that matters: the scorer refuses a report not marked eligible unless
 * `--allow-ineligible` is passed, so a consumer can check before spawning rather than after.
 */
export function scorerProvenance(): ScorerProvenance | null {
  const path = scorerPaths().trainingReport;
  if (!existsSync(path)) return null;
  const report = JSON.parse(readFileSync(path, "utf8")) as {
    // `representation` is an OBJECT in the report and a STRING in the safetensors metadata. Reading it as a
    // string here produced a literal "[object Object]" in the provenance, which the smoke test caught only
    // because it prints the value — a `typeof` assertion now makes that a failure rather than a curiosity.
    representation?: { schema?: string }; releaseEligible?: boolean;
    encoder?: { modelSha256?: string }; trainedAt?: string; generatedAt?: string;
  };
  return {
    featureSchema: report.representation?.schema,
    releaseEligible: report.releaseEligible,
    encoderSha256: report.encoder?.modelSha256,
    trainedAt: report.trainedAt ?? report.generatedAt,
  };
}
