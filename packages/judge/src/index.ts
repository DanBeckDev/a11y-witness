/**
 * The judge: what did a screen-reader capture actually mean for a WCAG 2.2 AA conformance question?
 *
 * `judge()` is the whole public surface. It runs the configured backend — `local` by default, which is this
 * project's own trained scorer rather than a rented LLM — merges in the deterministic absence rules, and
 * returns findings ordered by experience layer.
 *
 * The subpaths exist because callers want different amounts of this: `./rules` alone is useful without a
 * model, `./layers` is pure ordering, and `./internal` is for a test that must drive the real gate.
 */
export { judge, validateJudgment } from "./judge.js";
export type { JudgeInput, Judgment, Finding, Severity } from "./judge.js";
