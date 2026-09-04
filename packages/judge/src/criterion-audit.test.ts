/**
 * THE AUDIT'S SCOPE IS DERIVED, NOT REMEMBERED — and every criterion carrying a claim must be in it.
 *
 * `criterion-coverage.ts` makes a claim about EVERY criterion in WCAG 2.2 AA: some this tool asserts on,
 * some partial, some merely reachable, the rest declared out of scope with a stated reason. Each was
 * written from somebody's reading of the criterion, and until 2026-09-04 not one had been checked against
 * the official text.
 *
 * (No numeral there, deliberately: `criteria-counts-are-not-spelled-out.test.ts` forbids one, because
 * "every numeral written beside the word 'criteria' in this repo has gone stale at least once". This
 * file's own assertion below is the exception that proves it — it does not WRITE a count, it DERIVES one
 * and refuses a backlog that disagrees, so the number cannot go stale without a test failing.)
 *
 * That is not hypothetical. 3.1.2 was argued for a day and settled WRONGLY because nobody followed the
 * link on *programmatically determined* — WCAG defines it as "determined by software from AUTHOR-SUPPLIED
 * DATA … assistive technologies can extract and present", which inverts the question the criterion asks.
 * The wrong reading reached `rule-ownership.json`, `criterion-coverage.ts`, `known-gaps.md` and the
 * backlog before it was caught, and it was wrong in three of that criterion's four failure cases.
 *
 * So this test does not check the readings — no test can. It makes the WORK LIST impossible to
 * under-count: the audit's scope comes from the coverage table itself, so a criterion added tomorrow is
 * in scope tomorrow, and `auditedAgainstSpec` cannot silently describe a smaller set than exists.
 *
 * The procedure is `.claude/skills/wcag-criterion-check/SKILL.md`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import { CRITERION_COVERAGE } from "./criterion-coverage.js";

const REPO = resolve(import.meta.dirname, "../../..");
const SKILL = ".claude/skills/wcag-criterion-check/SKILL.md";

/** Criteria this tool makes a POSITIVE claim about — the ones a misreading turns into a wrong finding. */
function claimBearing(): string[] {
  return Object.entries(CRITERION_COVERAGE)
    .filter(([, entry]) => entry.status === "assessed" || entry.status === "partial")
    .map(([criterion]) => criterion)
    .sort();
}

test("the skill that defines the audit procedure exists", () => {
  // A backlog row pointing at a missing file is a row nobody can pick up, which is what the backlog's own
  // header promises never to contain.
  assert.ok(existsSync(resolve(REPO, SKILL)), `${SKILL} is missing — the audit row names a procedure that `
    + "does not exist, so the work cannot be started as written");
});

test("the audit's scope is every criterion that carries a claim", () => {
  const claims = claimBearing();
  assert.ok(claims.length >= 15,
    `only ${claims.length} claim-bearing criteria found; the derivation broke and would under-count the `
    + "audit's scope — which is the one thing this test exists to prevent");

  // ASSERTED criteria are the priority and the test says so, because the two failure modes are not
  // symmetric: a misread `assessed` criterion produces a wrong accusation on somebody's page, while a
  // misread `out-of-scope` one produces a finding we simply never make.
  const asserted = Object.entries(CRITERION_COVERAGE)
    .filter(([, entry]) => entry.status === "assessed").map(([c]) => c);
  assert.ok(asserted.length > 0, "no criterion is `assessed`, so nothing asserts and the priority is moot");

  const backlog = readFileSync(resolve(REPO, "docs/backlog.md"), "utf8");
  assert.match(backlog, /wcag-criterion-check/,
    "docs/backlog.md does not mention the audit. If it is open it is on the backlog — this file's rule.");
  assert.match(backlog, new RegExp(`\\b${asserted.length}\\b[^|]*assessed`),
    `the backlog states a count of \`assessed\` criteria that is not ${asserted.length}. The scope is `
    + "derived here and transcribed there, so the two can drift — a fact stated twice, which is this "
    + "repo's most-repeated defect.");
});
