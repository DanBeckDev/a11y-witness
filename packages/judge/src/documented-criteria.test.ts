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

import { RULE_CRITERIA, assessedCriteria } from "./coverage.js";

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

/** Every WCAG criterion number mentioned in a stretch of prose, deduplicated and sorted. */
const criteriaIn = (text: string) =>
  [...new Set(text.match(/\b\d\.\d\.\d\b/g) ?? [])].sort();

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
  const spelled = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
    "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen"][total];
  for (const file of ["RELEASE.md", "action.yml"]) {
    const text = repoFile(file).toLowerCase();
    assert.ok(text.includes(`${spelled} criteria can produce a finding`)
      || text.includes(`${spelled} in total can produce a finding`),
      `${file} does not state the total as "${spelled}" — the judge can return ${total}`);
  }
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
  // more than the convenience. The snippet is ten lines of fixed shape, and `action-smoke.yml` runs the
  // real thing on every push — this guards the COPY, not the mechanism.
  const readme = readFileSync(fileURLToPath(new URL("../../../README.md", import.meta.url)), "utf8");
  const snippet = /```yaml\n([\s\S]*?)```/.exec(readme)?.[1];
  assert.ok(snippet, "the quickstart no longer contains a yaml block");

  assert.match(snippet!, /runs-on:\s*windows-/,
    "NVDA needs Windows; a snippet on ubuntu-latest fails after the reader has committed it");
  assert.match(snippet!, /uses:\s*\S+\/a11y-witness@/, "the snippet must reference this action");

  const withBlock = /with:\n([\s\S]*)$/.exec(snippet!)?.[1] ?? "";
  const given = new Set([...withBlock.matchAll(/^\s{8,}([a-z-]+):/gm)].map((m) => m[1]));
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
