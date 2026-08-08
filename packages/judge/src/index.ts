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

/**
 * How to LABEL a judgment's `taskCompletable`, which means different things per backend.
 *
 * The LLM backends read the task and answer "could someone finish this?", so for them the field is what
 * its name says. The default local scorer has no head for task completion and never sees the task —
 * local-judge.ts says so itself: "claiming an answer would be inventing one. A blocking failure is the
 * closest honest signal." So for local it is `!findings.some(f => f.severity === "blocker")` and nothing
 * more, and printing "Task completable: yes" invents exactly the answer that comment refuses to.
 *
 * Worst instance was a PR comment asking "**Could a screen-reader user complete the task?**" and
 * answering it in bold, on someone's pull request, from a signal that never looked at the task.
 */
export function taskVerdictLabel(): { question: string; isTaskClaim: boolean } {
  const backend = (process.env.JUDGE_BACKEND || "local").toLowerCase();
  return backend === "local"
    ? { question: "No blocking findings", isTaskClaim: false }
    : { question: "Could a screen-reader user complete the task?", isTaskClaim: true };
}
