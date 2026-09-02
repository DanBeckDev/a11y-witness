/**
 * What a forms config can and cannot answer — ADR 0024's "properly tested", made computable.
 *
 * The states model exists so this is a CALCULATION rather than a judgement. Each criterion declares which
 * states its evidence needs, so a config carrying only an error state reports 4.1.3 as half-answered and
 * names the missing half, instead of the tool quietly assessing what it happens to have and calling it
 * done.
 *
 * The three outcomes it keeps apart are the point, and today they collapse into one:
 *   NOT CONFIGURED     the author's to supply, and the report says how
 *   CONFIGURED         the states needed are present
 *   PARTLY CONFIGURED  some evidence, and a named gap
 */
import type { FormSpec, StateName } from "./config.js";

/**
 * Which states each criterion's evidence needs.
 *
 * A single table, so the report and the docs cannot drift — ADR 0024 renders the same rows, and a second
 * hand-kept copy of this mapping is the fact-stated-twice defect with a criterion attached.
 *
 * `either` means the evidence comes from FILLING rather than from submitting: 3.2.2 asks whether entering
 * data changes context, so any state with values answers it. That is also why supplying values enables
 * the typing probe by construction — we type the author's own value, into the field they named, at their
 * instruction, so consent is not a second question.
 */
export const CRITERION_STATES: Readonly<Record<string, { needs: StateName[]; mode: "all" | "either" | "partial" }>> =
  Object.freeze({
    "3.3.1": { needs: ["error"], mode: "all" },
    "3.3.3": { needs: ["error"], mode: "all" },
    "4.1.3": { needs: ["error", "success"], mode: "partial" },
    "3.2.2": { needs: ["error", "success"], mode: "either" },
  });

export type CriterionReadiness = "configured" | "partly" | "notConfigured";

export interface FormCoverage {
  form: string;
  states: StateName[];
  criteria: { criterion: string; readiness: CriterionReadiness; why: string }[];
}

function readinessFor(
  criterion: string, present: ReadonlySet<StateName>,
): { readiness: CriterionReadiness; why: string } {
  const spec = CRITERION_STATES[criterion];
  const missing = spec.needs.filter((state) => !present.has(state));
  if (missing.length === 0) {
    return { readiness: "configured", why: `every state this criterion needs is configured.` };
  }
  if (missing.length === spec.needs.length) {
    return {
      readiness: "notConfigured",
      why: `needs a ${spec.needs.join(" or ")} state, and this form declares neither.`,
    };
  }
  // Some present, some missing. What that COSTS differs by mode, and saying which is the whole value.
  if (spec.mode === "either") {
    return { readiness: "configured", why: "answered by filling the form; submitting is not required." };
  }
  if (spec.mode === "partial") {
    return {
      readiness: "partly",
      why: `answered for the ${[...present].join(" and ")} path only. No ${missing.join(" or ")} state was `
        + `supplied, so whether a ${missing.join("/")} status is announced is unknown.`,
    };
  }
  return { readiness: "notConfigured", why: `needs a ${missing.join(" and ")} state.` };
}

/** What this form's configuration can answer, criterion by criterion. */
export function formCoverage(form: FormSpec): FormCoverage {
  const present = new Set(form.states.map((state) => state.state));
  return {
    form: form.form,
    states: [...present],
    criteria: Object.keys(CRITERION_STATES).map((criterion) => ({
      criterion,
      ...readinessFor(criterion, present),
    })),
  };
}

/**
 * What a run would SUBMIT, said before it submits anything — the `--plan` output.
 *
 * A guard that names the irreversible act in advance. `origin:` already stops a staging config being
 * aimed at production, but it cannot tell an author that the file they just wrote completes a booking
 * twice on every CI run. This can, and it is the only thing between "I configured a success state" and
 * finding out what that meant.
 */
export function submissionPlan(forms: readonly FormSpec[], origin: string): string[] {
  const lines: string[] = [];
  for (const form of forms) {
    // Error states first, matching the order a run uses: the less destructive state is observed before
    // the one that completes the form, so a run that dies midway has done the safer thing.
    const ordered = [...form.states].sort((a, b) => Number(a.state === "success") - Number(b.state === "success"));
    lines.push(`Would submit ${JSON.stringify(form.form)} ${ordered.length} time(s) against ${origin}, via `
      + `${JSON.stringify(form.submit)}:`);
    ordered.forEach((state, index) => {
      const because = state.because ? `  (because: ${state.because})` : "";
      const warning = state.state === "success" ? "   <- THIS COMPLETES THE FORM" : "";
      lines.push(`  ${index + 1}. state ${JSON.stringify(state.state)}${because}${warning}`);
    });
  }
  lines.push("", "Nothing was submitted. Remove --plan to run.");
  return lines;
}
