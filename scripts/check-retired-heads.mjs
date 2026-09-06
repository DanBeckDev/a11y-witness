/**
 * A candidate whose head set SHRINKS must name what it retired, or be refused.
 *
 * v19 was going to ship without `3.3.2:unnamed-form-field` — a head v18 carried, calibrated at its target
 * false-positive rate, with 165 positives in its own threshold sweep — and nothing declared it. The
 * changeset would have listed twenty per-subtype thresholds and simply had one fewer than before; the
 * promote commit message would not have mentioned it. Caught by a pre-push hook noticing, not by anything
 * asking the question, and only because two sessions spent most of an evening on it: one compared the
 * report against a file from the wrong commit and reported the promotion innocent, one read
 * `rule-ownership.json`'s `3.3.2:placeholder-only` — a DIFFERENT 3.3.2 subtype with the opposite answer —
 * and reported the loss correct. Both resolved an ambiguity by assumption inside a message asserting they
 * had checked.
 *
 * The removal itself was correct — W3C does not require a label to be ASSOCIATED for 3.3.2 (that is 1.3.1),
 * those cases always declared 4.1.2 as well, and the head was a duplicate label a deletion had not
 * finished removing. Being correct is exactly why this needs a gate: a legitimate removal, fully reasoned
 * months of context away, still cost an evening because nothing MADE the reasoning travel with the change.
 *
 * So: a head present in the SHIPPED report and absent from the CANDIDATE is a REFUSAL, never a warning —
 * the same shape `promote:gated` already uses — unless `retired-heads.json` accounts for it by name. The
 * declaration is the deliverable; the comparison (this file's `headSet`/`retiredHeadsVerdict`) is the cheap
 * part. Deliberately silent on whether a criterion SHOULD be covered — this row only asks whether a
 * disappearance was declared, never whether it was right.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";

export const SHIPPED_REPORT = "packages/scorer/models/screenreader-scorer/training-report.json";
export const CANDIDATE_REPORT = "runs/model-candidate/training-report.json";
export const DECLARATION_FILE = "packages/scorer/models/retired-heads.json";

/** Every `criterion:subtype` head id a training report declares, from its own `criteria` map. */
export function headSet(report) {
  const ids = new Set();
  for (const entry of Object.values(report?.criteria ?? {})) {
    for (const id of Object.keys(entry?.subtypes ?? {})) ids.add(id);
  }
  return ids;
}

const REQUIRED_DECLARATION_FIELDS = ["subtype", "retiredAt", "reason", "where"];

/**
 * Pure so the test can drive it — the filesystem is the caller's business, not this function's, exactly
 * as `migrationVerdict` in `check-schema-migration.mjs` (the sibling this file's shape follows) keeps
 * "is a declaration present" out of the verdict itself.
 *
 * @param {Set<string>} shippedHeads
 * @param {Set<string>} candidateHeads
 * @param {Array<Record<string, unknown>>} declarations
 */
export function retiredHeadsVerdict(shippedHeads, candidateHeads, declarations) {
  const retired = [...shippedHeads].filter((id) => !candidateHeads.has(id));
  if (retired.length === 0) return { ok: true, message: "the candidate's head set did not shrink" };

  const declared = new Map(declarations.map((d) => [d.subtype, d]));
  const undeclared = [];
  const malformed = [];
  for (const id of retired) {
    const entry = declared.get(id);
    if (!entry) { undeclared.push(id); continue; }
    const missing = REQUIRED_DECLARATION_FIELDS.filter((f) => !String(entry[f] ?? "").trim());
    if (missing.length > 0) malformed.push(`${id} (missing ${missing.join(", ")})`);
  }

  if (undeclared.length > 0) {
    return {
      ok: false,
      message: `${undeclared.length} head(s) retired with no declaration in ${DECLARATION_FILE}: `
        + `${undeclared.join(", ")}.\n`
        + "  Absent is not a licence. Add an entry naming the subtype, when it was retired, why in one "
        + "sentence, and where the full reasoning lives (a file and comment a reader can land on).",
    };
  }
  if (malformed.length > 0) {
    return {
      ok: false,
      message: `${malformed.length} retired-head declaration(s) are incomplete: ${malformed.join("; ")}.\n`
        + `  Every entry needs: ${REQUIRED_DECLARATION_FIELDS.join(", ")}.`,
    };
  }
  return {
    ok: true,
    message: `${retired.length} head(s) retired, all declared: ${retired.join(", ")}`,
  };
}

function readJson(path) {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
}

function main() {
  const repoRoot = fileURLToPath(new URL("../", import.meta.url));
  const shipped = readJson(join(repoRoot, SHIPPED_REPORT));
  const candidate = readJson(join(repoRoot, CANDIDATE_REPORT));

  if (!candidate) {
    console.log(`SKIPPED  no candidate report at ${CANDIDATE_REPORT} — nothing to compare a head set against`);
    process.exit(0);
  }
  if (!shipped) {
    console.log(`SKIPPED  no shipped report at ${SHIPPED_REPORT} — nothing to compare a head set against`);
    process.exit(0);
  }

  const declarations = readJson(join(repoRoot, DECLARATION_FILE)) ?? [];
  const verdict = retiredHeadsVerdict(headSet(shipped), headSet(candidate), declarations);
  console.log(verdict.ok ? `OK  ${verdict.message}` : `BLOCKED  ${verdict.message}`);
  process.exit(verdict.ok ? 0 : 1);
}

// Same idiom as every other CLI entry point here: `node -e "import(...)"` runs with no `argv[1]`, and a
// guard that throws on import would defeat the one check that catches an import-time ReferenceError.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
