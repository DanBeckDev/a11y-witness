// THE CRITERIA LIST IS WRITTEN IN FIVE PLACES, THREE OF THEM READ BY STRANGERS.
//
// `RULE_CRITERIA` is the truth. `README.md`, `RELEASE.md` and `action.yml` each restate it in prose, and on
// 2026-08-22 all three said SIX while the tool assessed ten — the count had moved four times that day and
// nothing compared them. Worse, README told a reader "the local scorer is not integrated yet" and "a
// frontier model calling an API is the current engine", while `judge.ts` reads
// `(process.env.JUDGE_BACKEND || "local")`.
//
// That matters more than an ordinary stale comment. PLAN.md names B1 — someone outside the project running
// this on an app they own — as THE release blocker, and these three files are their entire first contact.
// This project has already shipped a RELEASE.md claiming "0 false positives" and that `eval:gate`
// "reproduces these exact figures", neither of which was true.
//
// So: drift becomes a test failure rather than a thing someone notices later. Today's own lesson, applied
// to documentation — when a fact must live in several places, pin the copies equal.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { RULE_CRITERIA, assessedCriteria, realPageAssessableCriteria, realPageUnfireableCriteria }
  from "./coverage.js";

const SPELLED = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen",
  "nineteen", "twenty"];

/**
 * A repo file with whitespace collapsed.
 *
 * Both documents wrap prose at ~110 columns, so a claim routinely spans a newline and an indent — matching
 * the raw text failed on "Fourteen in total can\n  produce a finding", which is present and correct. A guard
 * that a line break can break is a guard that gets deleted rather than fixed.
 */
const repoFile = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../../../${name}`, import.meta.url)), "utf8")
    .replace(/\s+/g, " ");

/**
 * Every WCAG criterion number mentioned in a stretch of prose, deduplicated and sorted.
 *
 * `\d` per segment, not `\d+`, until 2026-09-05 — every RULE_CRITERIA member up to then had one digit in
 * every segment, so "1.4.13" (the first with a two-digit final segment) silently matched nothing at all:
 * `\b` after the middle `\d` requires a word boundary, and "13" has none between its own digits. A prose
 * mention of 1.4.13 in either surface would have been invisible to this check, reporting a mismatch that
 * blamed the DOCS for omitting a number the regex itself could never see.
 */
const criteriaIn = (text: string) =>
  [...new Set(text.match(/\b\d+\.\d+\.\d+\b/g) ?? [])].sort();

test("the stranger-facing docs name exactly the criteria the rules can emit", () => {
  const expected = [...RULE_CRITERIA].sort();

  // Each surface states the rule-assessed list in one sentence; the assertion is on THAT sentence rather
  // than the whole file, because both documents legitimately discuss other criteria elsewhere.
  // Bounded at both ends: each surface follows the rule list with a sentence naming the scorer-only
  // criteria, and a window that runs past the end silently swallows them and reports a mismatch that is
  // really the test's own reach.
  const surfaces: Array<[string, string, string]> = [
    ["action.yml", "the deterministic rules cover", "and always run"],
    ["RELEASE.md", "**In full:", "each covers one failure mode"],  // spans BOTH lines: the rule list is their union
  ];
  for (const [file, from, to] of surfaces) {
    const text = repoFile(file);
    const at = text.indexOf(from);
    assert.ok(at > 0, `${file} no longer contains the marker "${from}" — the claim moved or was reworded`);
    const end = text.indexOf(to, at);
    assert.ok(end > at, `${file} no longer contains "${to}" after the rule list`);
    const claimed = criteriaIn(text.slice(at, end));
    assert.deepEqual(claimed, expected,
      `${file} names ${claimed.join(", ")} but the rules emit ${expected.join(", ")}`);
  }
});

test("the docs do not claim a rented model is the engine", () => {
  // The single most important thing a first-time reader needs, and it was inverted for weeks.
  const readme = repoFile("README.md");
  assert.match(readme, /`JUDGE_BACKEND` defaults to `local`/,
    "README must say the local scorer is the default, because it is");
  for (const wrong of ["local scorer is not integrated", "frontier model calling an API is the current engine"]) {
    assert.ok(!readme.includes(wrong), `README still claims: "${wrong}"`);
  }
});

test("the totals quoted to strangers match what the judge can return", () => {
  // "Fourteen in total can produce a finding" — rules plus the scorer-only heads.
  const total = assessedCriteria().length;
  const spelled = SPELLED[total];
  for (const file of ["RELEASE.md", "action.yml"]) {
    const text = repoFile(file).toLowerCase();
    assert.ok(text.includes(`${spelled} criteria can produce a finding`)
      || text.includes(`${spelled} in total can produce a finding`),
      `${file} does not state the total as "${spelled}" — the judge can return ${total}`);
  }
});

test("action.yml's real-page claim is derived from CRITERION_COVERAGE, not hand-counted", () => {
  // #171: "the rules can emit it" (RULE_CRITERIA) and "it can produce a finding on a page you do not own"
  // are different claims, and action.yml stated the second as a hand-subtraction from the first, naming
  // only SOME of the criteria `criterion-coverage.ts` itself declares
  // `realPageEvidence: { available: false }` for. Pinned here so the two can never drift again: this reads
  // the same field `audit-rule-coverage.ts` already reads for its own (fleet-dependent) purpose, but this
  // test needs no fleet and no corpus — it is pure TS and docs, checked against `action.yml`'s prose.
  const assessable = realPageAssessableCriteria();
  const unfireable = realPageUnfireableCriteria();
  const text = repoFile("action.yml");

  const stillAt = text.indexOf("REAL page is still");
  assert.ok(stillAt > 0, 'action.yml no longer contains "REAL page is still" — the claim moved or was reworded');
  const NUMBER_WORD_WINDOW = 60; // enough room for "REAL page is still <spelled-out number>:" and no more
  const stillMatch = /REAL page is still (\w+):/.exec(text.slice(stillAt, stillAt + NUMBER_WORD_WINDOW));
  assert.ok(stillMatch, 'could not parse the number word after "REAL page is still"');
  assert.equal(stillMatch![1].toLowerCase(), SPELLED[assessable.length],
    `action.yml claims "${stillMatch![1]}" criteria always run on a real page, but CRITERION_COVERAGE `
      + `says ${assessable.length} (${assessable.join(", ")})`);

  const exceptAt = text.indexOf("except", stillAt);
  assert.ok(exceptAt > stillAt, 'action.yml no longer names an "except" clause after the real-page claim');
  // ". " (period-then-space), not a bare ".", because a WCAG number is itself full of periods ("1.4.2")
  // and a bare "." bound truncates the span before the exception list even begins.
  const exceptEnd = text.indexOf(". ", exceptAt);
  assert.ok(exceptEnd > exceptAt, "the except clause never ends in a sentence boundary this test can bound on");
  const claimedExceptions = criteriaIn(text.slice(exceptAt, exceptEnd));
  assert.deepEqual(claimedExceptions, unfireable,
    `action.yml's exception list is ${claimedExceptions.join(", ")}, but CRITERION_COVERAGE declares `
      + `realPageEvidence unavailable for ${unfireable.join(", ")}`);
});

/** Leading spaces: YAML's block structure, which is all the snippet parser below reads. */
const indentOf = (line: string): number => line.search(/\S/);

/** The leading run of `lines` indented deeper than `indent`: a YAML block's body, ended by its first dedent. */
function takeDeeperThan(lines: string[], indent: number): string[] {
  const end = lines.findIndex((line) => indentOf(line) <= indent);
  return end < 0 ? lines : lines.slice(0, end);
}

/**
 * The inputs a workflow snippet passes to THIS action: the direct children of the `with:` that belongs to the
 * step which `uses:` a11y-witness, and nothing past that step.
 *
 * #1353 gave the quickstart a second step, `actions/upload-artifact`, with its own `if:` and `with:`. The
 * reading this replaces took everything from the FIRST `with:` to the end of the fence, so that step's keys
 * arrived as a11y-witness inputs and trunk went red on a README that was right. Blank and comment lines are
 * dropped first: a comment at a step's own indentation neither opens nor closes a YAML block.
 */
function inputsGivenToTheAction(snippet: string): Set<string> {
  const lines = snippet.split("\n").filter((line) => line.trim() !== "" && !line.trim().startsWith("#"));
  const stepAt = lines.findIndex((line) => /^\s*- uses:\s*\S+\/a11y-witness@/.test(line));
  if (stepAt < 0) return new Set();
  const step = takeDeeperThan(lines.slice(stepAt + 1), indentOf(lines[stepAt]));
  const withAt = step.findIndex((line) => /^\s*with:\s*$/.test(line));
  if (withAt < 0) return new Set();
  const block = takeDeeperThan(step.slice(withAt + 1), indentOf(step[withAt]));
  const childIndent = block.length > 0 ? indentOf(block[0]) : -1;
  return new Set(block.filter((line) => indentOf(line) === childIndent)
    .flatMap((line) => /^\s*([a-z-]+):/.exec(line)?.slice(1, 2) ?? []));
}

test("#1353: only the a11y-witness step's own `with:` is read as its inputs -- no other step's keys, no sibling block's", () => {
  // The quickstart's real shape since #1353, plus the two neighbours a looser bound would also read. MUTATION
  // TARGETS: reading to the end of the fence brings in `if`, `name` and `path`; dropping the step bound reads
  // the upload step's `with:` in the second snippet; dropping the `with:` bound reads `debug`.
  const steps = (a11yStep: string[]) => [
    "    steps:",
    "      - uses: actions/checkout@v4",
    "      - uses: a11ign/a11ign@main",
    ...a11yStep,
    "      # Keep the evidence -- a comment at the steps' own indentation",
    "      - uses: actions/upload-artifact@v4",
    "        if: always()",
    "        with:",
    "          name: a11ign-result",
    "          path: result.json",
    "",
  ].join("\n");
  const withInputs = steps(["        # Pin it", "        id: a11ign", "        with:",
    "          url: https://example.com/contact", "          task: Send an enquiry", "        env:", "          debug: \"1\""]);
  assert.deepEqual([...inputsGivenToTheAction(withInputs)].sort(), ["task", "url"]);
  assert.deepEqual([...inputsGivenToTheAction(steps(["        id: a11ign"]))], [],
    "an a11y-witness step with no `with:` of its own passes nothing, whatever the next step passes");
});

test("the README's quickstart workflow is one a stranger can actually paste", () => {
  // The single most consequential snippet in the repo: B1 is someone outside the project running this on an
  // app they own, and for most readers this is the ONLY path that needs no hardware — a screen reader is an
  // OS-bound desktop application, but the Windows machine can be GitHub's.
  //
  // Checked against `action.yml` rather than eyeballed, because a snippet that names an input the action
  // does not have, or omits a required one, fails on a stranger's runner with a message about our repo.
  //
  // Parsed by hand rather than with a YAML library: this package has ZERO dependencies and that is worth
  // more than the convenience. `action-smoke.yml` runs the real thing on every push — this guards the COPY,
  // not the mechanism.
  const readme = readFileSync(fileURLToPath(new URL("../../../README.md", import.meta.url)), "utf8");
  const snippet = /```yaml\n([\s\S]*?)```/.exec(readme)?.[1];
  assert.ok(snippet, "the quickstart no longer contains a yaml block");

  assert.match(snippet!, /runs-on:\s*windows-/,
    "NVDA needs Windows; a snippet on ubuntu-latest fails after the reader has committed it");
  // NOT `/a11ign@/` -- #66 (the rename) deliberately keeps every `uses: a11ign/a11ign@main`
  // reference pointing at where the Action ACTUALLY is today; #325 (the transfer rehearsal) owns
  // changing it once the repository really moves.
  assert.match(snippet!, /uses:\s*\S+\/a11y-witness@/, "the snippet must reference this action");

  const given = inputsGivenToTheAction(snippet!);
  assert.ok(given.size > 0, "no inputs parsed out of the snippet — the shape changed and this guard went blind");

  const action = readFileSync(fileURLToPath(new URL("../../../action.yml", import.meta.url)), "utf8");
  const declared = new Set([...action.matchAll(/^ {2}([a-z-]+):\n\s+description:/gm)].map((m) => m[1]));
  const required = [...action.matchAll(/^ {2}([a-z-]+):\n(?:[\s\S]*?)\n {4}required: true/gm)].map((m) => m[1]);
  assert.ok(declared.size > 0 && required.length > 0, "action.yml no longer parses — this guard went blind");

  for (const name of required) {
    assert.ok(given.has(name), `the quickstart omits the required input "${name}"`);
  }
  for (const name of given) {
    assert.ok(declared.has(name), `the quickstart passes "${name}", which action.yml does not accept`);
  }
});
