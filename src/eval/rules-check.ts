/**
 * Validate the deterministic absence rules (src/spike/rules.ts) over the eval
 * fixtures. Exits non-zero if the rules produce ANY false positive on a
 * conformant page — precision is the whole point of a rule.
 *
 * Run: npm run rules-check
 */
import { readFileSync } from "node:fs";
import { ruleFindings, type RuleInput } from "../spike/rules.js";
import { EVAL_CASES } from "./cases.js";

const crit = (w: string): string => w.match(/(\d+\.\d+\.\d+)/)?.[1] ?? w;
const ID_WIDTH = 28; // padding for aligned case-id output

let cleanFP = 0;
let caught = 0;
let total = 0;
for (const c of EVAL_CASES) {
  const data = JSON.parse(readFileSync(c.fixture, "utf8")) as RuleInput;
  const crits = [...new Set(ruleFindings(data).map((f) => crit(f.wcag)))];
  const absence = c.expect.filter((x) => x === "1.1.1" || x === "4.1.2");
  if (c.expect.length === 0) cleanFP += crits.length;
  if (absence.length) {
    total++;
    if (absence.every((x) => crits.includes(x))) caught++;
  }
  const fp = c.expect.length === 0 && crits.length ? "  <-- FALSE POSITIVE" : "";
  console.log(`${c.expect.length ? "FAIL " : "CLEAN"} ${c.id.padEnd(ID_WIDTH)} rules=${JSON.stringify(crits)}${fp}`);
}
console.log(`\nAbsence cases fully caught: ${caught}/${total}  |  clean-page false positives: ${cleanFP}`);
if (cleanFP > 0) {
  console.error("FAIL: deterministic rules produced false positives on conformant pages");
  process.exit(1);
}
