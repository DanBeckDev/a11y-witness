/**
 * Eval-as-fitness-function: an objective pass/fail on judge quality so it can't
 * silently regress. ("Fitness function" in the architecture-governance sense —
 * Building Evolutionary Architectures: a check wired into the build that verifies
 * a characteristic is preserved.) Pure so it is unit-testable without a model;
 * run.ts calls it under EVAL_GATE and sets a non-zero exit on FAIL.
 */
export interface FitnessThresholds {
  /** Minimum acceptable recall over failure cases (0–1). */
  minRecall: number;
  /** Maximum acceptable false positives on conformant (clean) pages. */
  maxConformantFP: number;
}

export interface FitnessMetrics {
  recall: number;
  conformantFP: number;
}

export interface FitnessResult {
  pass: boolean;
  reasons: string[];
}

const pct = (n: number): string => `${(n * 100).toFixed(0)}%`;

export function evaluateFitness(m: FitnessMetrics, t: FitnessThresholds): FitnessResult {
  const reasons: string[] = [];
  if (m.recall < t.minRecall) {
    reasons.push(`recall ${pct(m.recall)} below floor ${pct(t.minRecall)}`);
  }
  if (m.conformantFP > t.maxConformantFP) {
    reasons.push(`${m.conformantFP} false positive(s) on conformant pages (max ${t.maxConformantFP})`);
  }
  return { pass: reasons.length === 0, reasons };
}

/** Thresholds from env, with regression-gate defaults: recall floor 80%, zero
 * over-flagging on conformant pages (the precision bar). */
export function thresholdsFromEnv(env: NodeJS.ProcessEnv = process.env): FitnessThresholds {
  return {
    minRecall: Number(env.EVAL_MIN_RECALL ?? 0.8),
    maxConformantFP: Number(env.EVAL_MAX_CONFORMANT_FP ?? 0),
  };
}
