/**
 * A RULE THAT CONCLUDES FROM A SWEEP MUST CONSULT ITS COMPLETENESS — capture-integrity-plan C2.
 *
 * `structure.headings` is what NVDA announced during a quick-nav walk. Rules read it as what the page
 * HAS, and measured across 106 real captures the two differ on most pages in one direction or the other.
 * The sweep's output looks identical either way: a list.
 *
 * This is a DISCOVERY test rather than a list, for the reason the plan gives: absence is the one claim a
 * sweep cannot make alone, this repo already STATES that rule, and then applies it by hand in the two
 * places somebody remembered. `addMissingHeadings` corroborates with the census; `tabOrderCanProveAbsence`
 * checks `disjoint`. Nothing made the NEXT one do either — which is this project's single most expensive
 * recurring shape, a remedy that reaches one call site when the behaviour reaches several.
 *
 * A new rule that reads a sweep fails this test until somebody classifies it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { assertableSweep, unverifiedSweeps, namesExcluded, comparableNamesForTest,
  ruleFindings, type RuleInput } from "./rules.js";

const SOURCE = resolve(import.meta.dirname, "rules.ts");

/**
 * Rules that read a sweep and legitimately need no completeness gate, each with the reason it is safe.
 *
 * A reason, not a name: an exemption list of bare identifiers is a list of things nobody re-examined.
 */
const SAFE_WITHOUT_A_GATE: Record<string, string> = {
  addMissingHeadings: "decides on `census.heading === 0` — the ORACLE. The sweep is corroboration only, "
    + "and a phantom heading makes it return early, which loses a finding rather than inventing one",
  addUnnamedGraphics: "decides on `census.graphicUnnamed`. The sweep count appears in the evidence "
    + "STRING and never in the decision",
  ruleFindings: "the dispatcher. Its two sweep reads are gated at the call site, which this test checks "
    + "separately below",
};

/** Every top-level function in rules.ts, with its body. Split on the declaration, so a nested arrow stays. */
function functionsInRules(): { name: string; body: string }[] {
  const source = readFileSync(SOURCE, "utf8");
  return source.split(/\n(?=(?:export )?function )/)
    .map((part) => ({ part, match: /^(?:export )?function (\w+)\(/.exec(part) }))
    .filter((f): f is { part: string; match: RegExpExecArray } => f.match !== null)
    .map((f) => ({ name: f.match[1], body: f.part }));
}

test("DISCOVERY: every rule reading a sweep is gated or exempted with a reason", () => {
  // Comments are stripped first. `cli-flags.test.ts` learned this the hard way: a classifier matching raw
  // source flagged a module whose COMMENT said it does not read argv. A test that reads prose as code is
  // the "expectations derived from source TEXT" defect wearing a discovery test's clothes.
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const unclassified = functionsInRules()
    .map((f) => ({ ...f, code: strip(f.body) }))
    .filter((f) => /structure\?\.\w+/.test(f.code))
    .filter((f) => !f.code.includes("assertableSweep"))
    .filter((f) => !(f.name in SAFE_WITHOUT_A_GATE));
  assert.deepEqual(unclassified.map((f) => f.name), [],
    "a rule that concludes from a sweep must call `assertableSweep` or be listed in SAFE_WITHOUT_A_GATE "
    + "with the reason it cannot be fooled by a phantom");
});

test("the exemption list names only functions that EXIST", () => {
  // An exemption for a renamed function silently exempts nothing, and the test keeps passing.
  const names = new Set(functionsInRules().map((f) => f.name));
  for (const exempt of Object.keys(SAFE_WITHOUT_A_GATE)) {
    assert.ok(names.has(exempt), `SAFE_WITHOUT_A_GATE names \`${exempt}\`, which no longer exists`);
  }
});

test("PHANTOM REFUSES EITHER CLAIM; TRUNCATED refuses only ABSENCE", () => {
  // The distinction the first version of this file did not have, and its absence discarded real findings.
  const at = (verdict: string | undefined, claim: "presence" | "absence") =>
    assertableSweep({ completeness: verdict ? { link: verdict } : {} } as unknown as RuleInput,
      "link", claim);
  assert.equal(at("phantom", "presence"), false,
    "a sweep announcing things the page lacks may have announced THIS one");
  assert.equal(at("phantom", "absence"), false);
  assert.equal(at("truncated", "absence"), false,
    "a list we know is short cannot say something was never reached");
  assert.equal(at("truncated", "presence"), true,
    "what a short sweep DID announce was still announced — withholding it discards a true finding");
  assert.equal(at("exact", "absence"), true);
  assert.equal(at("unknown", "absence"), true, "refusing would silence 2.1.1 across the whole corpus");
  assert.equal(at(undefined, "absence"), true, "an older capture behaves as it did before this existed");
});

test("A TRUNCATED SWEEP STILL REPORTS THE UNNAMED CONTROL IT HEARD", () => {
  // Measured on the shipped code before this fix: 1 finding on `exact`, 0 on `truncated`. The button was
  // ANNOUNCED. `completeness.ts` had warned about exactly this on 2026-08-24 — withholding a presence
  // claim "discards a true finding on exactly the pages a publisher already admits are broken" — and that
  // module was never wired to anything, so C2 rebuilt half of it and got this half wrong.
  const base = {
    transcript: ["Shop, document"],
    structure: { formFields: ["button", "Search, edit"] },
    interaction: {},
  };
  const of = (verdict: string) => ruleFindings({ ...base, completeness: { formControl: verdict } } as never)
    .filter((f) => f.wcag.startsWith("4.1.2")).length;
  assert.equal(of("exact"), 1);
  assert.equal(of("truncated"), 1, "a short sweep does not unhear the control it announced");
  assert.equal(of("phantom"), 0, "but a sweep announcing things that are not there might have invented it");
});

test("AN UNKNOWN-BACKED ASSERTION IS COUNTED, because `unknown` must never read as `exact`", () => {
  // The judgement C2 makes explicit: proceeding on "we cannot tell" is allowed and must be VISIBLE. A
  // number, not a word — "some assertions are unverified" cannot say whether it is two or two thousand.
  const input = { completeness: { link: "exact", formControl: "unknown" } } as unknown as RuleInput;
  assert.deepEqual(unverifiedSweeps(input, ["link", "formControl"]), ["formControl"]);
  assert.deepEqual(unverifiedSweeps({} as RuleInput, ["link"]), ["link"],
    "a capture with no completeness at all is entirely unverified, not entirely fine");
});

test("A PHANTOM FORM CONTROL DOES NOT BECOME A 4.1.2 ASSERTION", () => {
  // The failure this is for, end to end. A sweep that announced a control the page does not expose has no
  // name for it BY CONSTRUCTION — so the phantom manufactures the exact finding 4.1.2 asserts.
  const base = {
    transcript: ["Home page, document"],
    structure: { formFields: ["button"] },
    interaction: {},
  } as unknown as RuleInput;
  const asserted = (input: RuleInput) => ruleFindings(input)
    .filter((f) => f.wcag.startsWith("4.1.2") && f.mapping === "conformance");

  const trusted = asserted({ ...base, completeness: { formControl: "exact" } } as RuleInput);
  assert.ok(trusted.length > 0, "the rule must still fire when the sweep is known good, or this "
    + "test would pass by breaking 4.1.2 rather than by guarding it");
  assert.equal(asserted({ ...base, completeness: { formControl: "phantom" } } as RuleInput).length, 0,
    "a phantom sweep must not produce an ASSERTED 4.1.2 failure");
});

test("the FOCUS PROBE survives a bad sweep — only the untrustworthy channel is dropped", () => {
  // Silencing a second, sound channel because the first is unreliable trades a real finding for a caution
  // about a different measurement. The two are separate captures of separate moments.
  const findings = ruleFindings({
    transcript: ["Home page, document"],
    structure: { formFields: ["button"] },
    interaction: { controls: ["button"] },
    completeness: { formControl: "phantom" },
  } as unknown as RuleInput);
  assert.ok(findings.some((f) => f.wcag.startsWith("4.1.2")),
    "the focus probe's unnamed control is still evidence when the SWEEP is the thing in doubt");
});

/**
 * C5 — A TRUNCATED ANNOUNCEMENT MUST NEVER BE COMPARED BY NAME.
 *
 * 40% of real captures carry one. `"o, button"` for a control named "Open account search" is not a
 * shorter string, it is a different one, so every name comparison here drops it silently: the sweep
 * yields "o", the tab order yields "Open account search", and 2.1.1 reads the difference as a control
 * the keyboard never reached. The capture has detected this all along and marked it as a diagnostic,
 * which no rule can reach.
 */
test("DISCOVERY: every comparableNames call reading `input` passes the exclusion set", () => {
  // The one-call-site defect is this repo's most expensive recurring shape — `anchorToTop`,
  // `ensureSpeechChannel`, `waitForAnnouncement`, `refreshBrowseBuffer`. A remedy applied to the call
  // site in front of whoever was looking is how each of those ran for months.
  const source = readFileSync(SOURCE, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const unguarded = [...source.matchAll(/comparableNames\((.*?)\)[;\s[.]/g)]
    .map((m) => m[1])
    .filter((args) => /\binput\b/.test(args) || /sweptControls|stops\b/.test(args))
    .filter((args) => !args.includes("input.truncated"));
  assert.deepEqual(unguarded, [],
    "a name comparison reading the capture must exclude truncated announcements, or it compares a "
    + "string that cannot match itself");
});

test("A TRUNCATED NAME IS EXCLUDED, and the exclusion is COUNTED rather than silent", () => {
  const entries = ["o, button", "Search, button"];
  assert.deepEqual(comparableNamesForTest(entries), ["o", "Search"],
    "with no exclusion set the old behaviour stands, so an older capture is unchanged");
  assert.equal(namesExcluded(entries, ["o, button"]), 1,
    "a comparison that skipped an input without saying so is the vanishing-denominator defect");
});

test("2.1.1 DOES NOT ACCUSE ON A NAME THE CAPTURE ITSELF CALLS TRUNCATED", () => {
  // The end-to-end failure. The sweep heard "o"; the tab order heard the real name. Without the
  // exclusion "o" is a swept control that Tab never reached — a 2.1.1 assertion manufactured entirely
  // by the truncation.
  const base = {
    transcript: ["Home, document", "Open account search, button", "Search, edit", "Go, button"],
    structure: { formFields: ["o, button", "Search, edit", "Go, button"] },
    // THE TAB ORDER MUST WRAP, or `cycleClosed` refuses and the rule cannot fire at all. The first
    // version of this fixture had no wrap, so the "before" case produced nothing and the test would
    // have passed having proved only that 2.1.1 was silent for an unrelated reason.
    interaction: { focusOrder: ["Open account search, button", "Search, edit", "Go, button",
      "Open account search, button"] },
  } as unknown as RuleInput;
  const of = (input: RuleInput) => ruleFindings(input).filter((f) => f.wcag.startsWith("2.1.1"));
  assert.ok(of(base).length > 0, "without the exclusion the truncation reads as an unreachable control, "
    + "which is the defect this test exists to pin");
  assert.equal(of({ ...base, truncated: ["o, button"] }).length, 0,
    "once the capture says the name was truncated, it must leave the comparison entirely");
});

test("2.4.3 CANNOT be fooled by a truncated name, and the reason is structural", () => {
  // C5's exclusion lives in `comparableNames`, so `controlsInReadingOrder` — which parses the transcript
  // itself — never got it. That asymmetry is real: one channel of a two-channel comparison filters
  // truncated names and the other does not.
  //
  // IT CANNOT MATTER, and this pins why rather than adding a guard that does nothing. `shared` is the
  // INTERSECTION of the two channels minus repeated names, and `comparableNames` has already removed the
  // truncated name from the tab-order side — so it can never reach `shared`, and both `readingOrder` and
  // `tabOrder` are filtered by `shared`. Its presence on the reading side is inert by construction.
  //
  // I added the guard anyway, and the mutation check caught it: removing it changed nothing, because
  // there was nothing for it to change. Reverted rather than shipped — an inert remedy with a confident
  // comment is the `refreshBrowseBuffer` shape, and this file has spent the day finding those.
  const capture = {
    transcript: ["Shop, document", "Full name, edit", "Email, edit", "Pho, edit"],
    structure: { formFields: [] },
    interaction: { focusOrder: ["Email, edit", "Full name, edit", "Phone number, edit"] },
  };
  const evidence = (truncated?: string[]) => ruleFindings({ ...capture, truncated } as never)
    .filter((f) => f.wcag.startsWith("2.4.3")).map((f) => f.evidence).join(" ");
  assert.equal(evidence(["Pho, edit"]), evidence(undefined),
    "marking a name truncated must not change 2.4.3's verdict — it was never in the compared set");
});
