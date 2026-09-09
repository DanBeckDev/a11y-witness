#!/usr/bin/env node
// @ts-check
// RULE: DOES THIS ROW'S BODY STATE ALL THREE REQUIRED TEMPLATE FIELDS? -- #707.
//
// `.github/ISSUE_TEMPLATE/backlog-row.yml` marks Region, Acceptance and Open-check `required` -- but that
// is a GitHub issue FORM, which applies only in the web UI. Every row in this repository is filed with
// `gh issue create --body`, which bypasses the form entirely: there is no field to leave blank, because
// there are no fields. Measured 2026-09-09: 39 of ~65 open rows carry no Open-check, sixteen of them
// filed the same day by the person who owns the template. The requirement was real and had no path to
// being met.
//
// CLAIMING, NOT FILING, is where this is asked -- `ceo`'s ruling. Filing stays `gh issue create` and
// always will; an Open-check exists so a session is not dispatched at a row already done, and that
// question matters at the moment a session is about to spend a day on it, not at the moment it was typed.
//
// A MISSING FIELD IS REFUSED BY NAME, never folded into one generic "template incomplete" message -- the
// same reason `owned-path-signoff.mjs` (#603) names each unstated fact rather than saying "sign-off
// missing": a reader fixing the row needs to know WHICH of the three to add, not that something is wrong.
import { REPO } from "../repo-identity.mjs";
import { gh, lookup } from "../merge-guard/lookups.mjs";
import { hasTemplateField } from "../region-paths.mjs";

/** The three fields the issue template requires, in the order they appear in the form. */
export const REQUIRED_FIELDS = ["Region", "Acceptance", "Open-check"];

/**
 * THE VERDICT, PURE -- every required field this body does NOT state a non-empty value for, in
 * `REQUIRED_FIELDS` order. `[]` means the row is complete.
 * @param {string} body
 * @returns {string[]}
 */
export function missingTemplateFields(body) {
  return REQUIRED_FIELDS.filter((field) => !hasTemplateField(body, field));
}

/**
 * The refusal reason for `sessionEligibilityReason`, or `null` when the row is complete. Named fields,
 * not a count -- see this file's own header.
 * @param {string} body @param {number} issueNumber
 * @returns {string | null}
 */
export function templateFieldsReason(body, issueNumber) {
  const missing = missingTemplateFields(body);
  if (missing.length === 0) return null;
  return `#${issueNumber} is missing ${missing.join(", ")} -- the issue template requires all three `
    + "(Region, Acceptance, Open-check) but the web form that enforces that does not apply to a row filed "
    + "with `gh issue create`. Add the missing section(s) as a `## <Field>` heading with real content "
    + "under it, then claim again.";
}

/**
 * This row's own body, read fresh -- `null` on a failed lookup OR a response with no `body` key at all.
 * The same CANNOT-ASK shape every other lookup in this rule set uses (`lookupMyRegionFiles`,
 * `lookupOwnPrHealth`), and the `"body" in parsed` check matters for a reason specific to this lookup: a
 * genuinely EMPTY body (`body: ""`) is a real, checkable fact -- every field is missing -- while a
 * response that never carried a `body` key at all (a shape `gh` did not return, or a caller's `run`
 * answering a DIFFERENT `--json` request the same way) is "asked the wrong question", not "asked and the
 * row has nothing". Collapsing the two via `parsed.body ?? ""` would read the second as the first and
 * refuse every claim.
 * @param {number} issueNumber
 * @param {{ run?: (args: string[]) => string }} [deps]
 * @returns {string | null}
 */
export function lookupIssueBody(issueNumber, { run = gh } = {}) {
  return lookup(() => {
    const raw = run(["issue", "view", String(issueNumber), "--repo", REPO, "--json", "body"]);
    /** @type {{ body?: string }} */
    const parsed = JSON.parse(raw);
    if (!("body" in parsed)) throw new Error("response carried no body field");
    return parsed.body ?? "";
  });
}
