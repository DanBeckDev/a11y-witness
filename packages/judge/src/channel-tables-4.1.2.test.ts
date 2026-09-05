import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { oracleCounts } from "@a11y-witness/evidence/verify";

import { hasEvidenceFor, EVIDENCE_CHANNEL_CRITERIA } from "./local-judge.js";
import { CRITERION_COVERAGE, criteriaAssessableFrom } from "./criterion-coverage.js";
import { ruleFindings, type RuleInput } from "./rules.js";

/**
 * Five tables decide which evidence channel feeds which WCAG criterion — `EVIDENCE_CHANNEL`
 * (local-judge.ts), `SWEEPS_FEEDING` (outcomes.ts), `CRITERION_COVERAGE[c].channels`
 * (criterion-coverage.ts), `applicability.py`'s `SUBTYPE_REQUIRES` (Python, per-subtype), and this
 * package's own `outcomes.test.ts` pinning of `assessedCriteria()`. For 4.1.2 the first three used to
 * say three different things: `formFields || controls`, `["formField"]`, and an ALL-of-four AND over
 * `["controls", "formFields", "stateChanges", "structureCensus"]`.
 *
 * Measured against every real capture on disk (`packages/judge` audit §4.4, 2026-09-06): the third
 * table's ALL-of semantic reported 4.1.2 BLOCKED on 146 of 218 captures where the deterministic rule
 * had just ASSERTED a conformance failure for that exact criterion. This file pins the fix so it
 * cannot silently drift back — see `CRITERION_COVERAGE["4.1.2"]`'s note and `EVIDENCE_CHANNEL["4.1.2"]`
 * in local-judge.ts for the measurement in full.
 *
 * `SWEEPS_FEEDING["4.1.2"] = ["formField"]` is deliberately EXCLUDED from the parity this file checks:
 * it answers a narrower, different question (which SWEEP-typed channel can TRUNCATE, for the
 * cantTell-on-truncation guard in outcomes.ts) and `stateChanges`/`controls`/`frames` have no
 * comparable step-cap truncation concept for it to guard — see that table's own comment. A test
 * forcing it to match `CRITERION_COVERAGE`'s full channel set would be enforcing a false equivalence.
 */

test("EVIDENCE_CHANNEL and CRITERION_COVERAGE agree about every criterion with channelMode 'any'", () => {
  // DISCOVERS the tables rather than naming 4.1.2 by hand, so a future 'any'-mode criterion is pulled
  // into this check automatically instead of needing someone to remember to extend a hand-written list.
  const anyModeCriteria = Object.entries(CRITERION_COVERAGE)
    .filter(([, entry]) => entry.channelMode === "any")
    .map(([criterion]) => criterion);
  assert.ok(anyModeCriteria.length > 0, "expected at least one 'any'-mode criterion (4.1.2) to check");

  for (const criterion of anyModeCriteria) {
    assert.ok(EVIDENCE_CHANNEL_CRITERIA.includes(criterion),
      `${criterion} is channelMode 'any' in CRITERION_COVERAGE but EVIDENCE_CHANNEL has no lambda for `
      + "it -- the two tables can no longer be compared, which is a worse disagreement than the one "
      + "this test exists to catch.");

    const channels = CRITERION_COVERAGE[criterion].channels ?? [];
    // An EMPTY capture: neither table may consider the criterion applicable.
    assert.equal(hasEvidenceFor(criterion, {}), false,
      `${criterion}: EVIDENCE_CHANNEL considers an empty capture applicable, which 'any'-of-nothing `
      + "cannot be");

    // Isolating each declared channel ALONE must make EVIDENCE_CHANNEL agree it is now applicable --
    // otherwise CRITERION_COVERAGE claims a channel is sufficient that EVIDENCE_CHANNEL does not
    // recognise as evidence at all, which is exactly the three-tables-three-answers shape this test
    // exists to close.
    for (const channel of channels) {
      // `structure: {}` rides along with a transcript-only capture because `hasEvidenceFor` refuses to
      // score a capture carrying NEITHER `structure` NOR `interaction` at all (the starved-capture
      // guard, local-judge.ts) -- a real capture with a transcript always has at least one of those
      // keys, even when its sub-fields are empty, so this is not weakening what is being checked.
      const capture = channel === "transcript" ? { transcript: ["x"], structure: {} }
        : channel === "structureCensus" ? null // not an EVIDENCE_CHANNEL input; see note below
        : channel === "controls" || channel === "stateChanges"
          ? { interaction: { [channel]: [{ control: "x", after: "x" }] } }
          : { structure: { [channel]: ["x"] } };
      if (capture === null) continue; // structureCensus is asserted never load-bearing, not a channel
      assert.equal(hasEvidenceFor(criterion, capture as never), true,
        `${criterion}: CRITERION_COVERAGE declares '${channel}' sufficient (channelMode 'any') but `
        + "EVIDENCE_CHANNEL's hasEvidenceFor does not agree it is evidence on its own -- re-measure "
        + "before changing either table.");
    }
  }
});

test("CRITERION_COVERAGE['4.1.2'] no longer requires structureCensus", () => {
  // Named explicitly (rather than only covered by the loop above) because this is the specific,
  // measured claim: ablating structureCensus changed 0 of 218 real 4.1.2 outcomes. If a future
  // measurement finds a genuine dependency, this test is the one to update, with a fresh number.
  assert.ok(!(CRITERION_COVERAGE["4.1.2"].channels ?? []).includes("structureCensus"),
    "structureCensus was measured to be never load-bearing for 4.1.2 (packages/judge audit §4.4) -- "
    + "re-add it only alongside a fresh measurement showing it now matters, in the entry's own note");
});

// --- The corpus-backed regression: does the fix hold against real evidence, not just a synthetic one? ---

const ROOT = resolve("runs/screenreader-dataset/captures");

function toRuleInput(cap: Record<string, unknown>): RuleInput {
  const structure = (cap.structure ?? {}) as Record<string, unknown[]>;
  const interaction = (cap.interaction ?? {}) as Record<string, unknown>;
  return {
    transcript: (cap.transcript as string[]) ?? [],
    diagnostics: (cap.diagnostics as unknown[]) ?? [],
    structure: {
      formFields: (structure.formFields as string[]) ?? [],
      headings: (structure.headings as string[]) ?? [],
      links: (structure.links as string[]) ?? [],
      graphics: (structure.graphics as string[]) ?? [],
      frames: (structure.frames as string[]) ?? [],
    },
    interaction: {
      controls: (interaction.controls as string[]) ?? [],
      stateChanges: (interaction.stateChanges as { control: string; after: string }[]) ?? [],
      formChanges: (interaction.formChanges as { control: string; after: string }[]) ?? [],
      postSubmitFields: (interaction.postSubmitFields as string[]) ?? [],
      focusOrder: (interaction.focusOrder as string[]) ?? [],
    },
    ...oracleCounts(cap as never),
  };
}

function readCorpus(): { name: string; cap: Record<string, unknown> }[] {
  if (!existsSync(ROOT)) return [];
  const out: { name: string; cap: Record<string, unknown> }[] = [];
  for (const name of readdirSync(ROOT)) {
    if (!name.endsWith(".json")) continue;
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(readFileSync(resolve(ROOT, name), "utf8")); } catch { continue; }
    out.push({ name, cap: (parsed.capture as Record<string, unknown>) ?? parsed });
  }
  return out;
}

const CORPUS = readCorpus();
const SKIP = CORPUS.length === 0 && "no runs/ here — the 4.1.2 corpus regression was NOT checked";

test("no real capture the rule engine asserts 4.1.2 on is reported BLOCKED for 4.1.2", { skip: SKIP }, () => {
  const violations: string[] = [];
  for (const { name, cap } of CORPUS) {
    const input = toRuleInput(cap);
    let findings;
    try { findings = ruleFindings(input); } catch { continue; }
    const fired412 = findings.some((f) => f.wcag?.startsWith("4.1.2"));
    if (!fired412) continue;
    const { blocked } = criteriaAssessableFrom(cap as never);
    if (blocked.some((b) => b.criterion === "4.1.2")) violations.push(name);
  }
  assert.deepEqual(violations.slice(0, 10), [],
    `${violations.length} capture(s) where the rule asserted 4.1.2 and criteriaAssessableFrom called `
    + `it BLOCKED anyway -- the exact defect this file exists to prevent (showing up to 10 of `
    + `${violations.length}): ${violations.slice(0, 10).join(", ")}`);
});
